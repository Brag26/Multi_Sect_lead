// Shared logic for LeadFinder (used by Vercel functions and the local server).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEYS = {
  google: process.env.GOOGLE_PLACES_KEY,
  apollo: process.env.APOLLO_API_KEY,
  hunter: process.env.HUNTER_API_KEY,
  opencorporates: process.env.OPENCORPORATES_TOKEN,
};
const UA = `LeadFinder/1.0 (${process.env.CONTACT_EMAIL || 'set CONTACT_EMAIL env var'})`;

const SECTORS = {
  'Doctors & clinics': ['amenity=doctors', 'amenity=clinic', 'amenity=hospital'],
  Dentists: ['amenity=dentist'],
  Pharmacies: ['amenity=pharmacy'],
  'Real estate agents': ['office=estate_agent'],
  Lawyers: ['office=lawyer'],
  Accountants: ['office=accountant'],
  'Insurance agents': ['office=insurance'],
  Banks: ['amenity=bank'],
  Restaurants: ['amenity=restaurant'],
  Cafes: ['amenity=cafe'],
  Hotels: ['tourism=hotel'],
  Schools: ['amenity=school'],
  'Gyms & fitness': ['leisure=fitness_centre'],
  'Salons & beauty': ['shop=hairdresser', 'shop=beauty'],
  'Car dealers': ['shop=car'],
  'Auto repair': ['shop=car_repair'],
  'IT & software': ['office=it'],
  'Construction & contractors': ['craft=builder', 'office=construction_company'],
  'Retail shops': ['shop'],
};

// ---- auth -------------------------------------------------------------------
function authRequired() { return !!process.env.APP_PASSWORD; }
function authorized(req) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return true;
  const a = Buffer.from(String(req.headers['x-app-password'] || ''));
  const b = Buffer.from(pw);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- helpers ----------------------------------------------------------------
const clean = (s) => (s == null ? '' : String(s).trim());
async function getJSON(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(opts.timeout || 25000), headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`${new URL(url).hostname} returned ${res.status}`);
  return res.json();
}

async function geocode(place) {
  const r = await getJSON(`https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(place)}`);
  if (!r.length) throw new Error(`Could not find "${place}"`);
  const [s, n, w, e] = r[0].boundingbox.map(Number);
  return { bbox: [s, w, n, e], country: (r[0].address?.country_code || '').toLowerCase(), label: r[0].display_name };
}

// ---- sources ----------------------------------------------------------------
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function overpass(query) {
  let err;
  for (const u of OVERPASS) {
    try {
      return await getJSON(u, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query), timeout: 30000 });
    } catch (e) { err = e; }
  }
  throw err;
}

async function srcOSM({ sector, geo, limit }) {
  const tags = SECTORS[sector];
  const b = geo.bbox.join(',');
  let body;
  if (tags) {
    body = tags.map((t) => { const [k, v] = t.split('='); return `nwr["${k}"${v ? `="${v}"` : ''}]["name"](${b});`; }).join('');
  } else {
    const q = sector.replace(/["\\]/g, '');
    body = `nwr["name"~"${q}",i](${b});nwr["description"~"${q}",i](${b});`;
  }
  const j = await overpass(`[out:json][timeout:25];(${body});out center tags ${limit};`);
  return (j.elements || []).map((el) => {
    const t = el.tags || {};
    return {
      name: clean(t.name),
      address: [t['addr:housenumber'], t['addr:street'], t['addr:suburb'], t['addr:city'], t['addr:postcode']].filter(Boolean).join(', '),
      phone: clean(t.phone || t['contact:phone']),
      email: clean(t.email || t['contact:email']),
      website: clean(t.website || t['contact:website']),
      rating: '',
      mapsUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      source: 'OpenStreetMap',
    };
  });
}

async function srcGoogle({ sector, place, limit }) {
  const j = await getJSON('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEYS.google,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri',
    },
    body: JSON.stringify({ textQuery: `${sector} in ${place}`, pageSize: Math.min(limit, 20) }),
  });
  return (j.places || []).map((p) => ({
    name: clean(p.displayName?.text), address: clean(p.formattedAddress), phone: clean(p.nationalPhoneNumber), email: '',
    website: clean(p.websiteUri), rating: p.rating ? `${p.rating} (${p.userRatingCount || 0})` : '', mapsUrl: clean(p.googleMapsUri), source: 'Google Places',
  }));
}

async function srcApollo({ sector, place, limit }) {
  const j = await getJSON('https://api.apollo.io/api/v1/mixed_companies/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEYS.apollo },
    body: JSON.stringify({ q_organization_keyword_tags: [sector], organization_locations: [place], per_page: Math.min(limit, 25) }),
  });
  return (j.organizations || j.accounts || []).map((o) => ({
    name: clean(o.name), address: [o.city, o.state, o.country].filter(Boolean).join(', '), phone: clean(o.phone || o.primary_phone?.number),
    email: '', website: clean(o.website_url), rating: '', mapsUrl: clean(o.linkedin_url), source: 'Apollo',
  }));
}

async function srcOpenCorporates({ sector, geo, limit }) {
  const jur = geo.country ? `&jurisdiction_code=${geo.country}` : '';
  const j = await getJSON(`https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(sector)}${jur}&per_page=${Math.min(limit, 30)}&api_token=${KEYS.opencorporates}`);
  return (j.results?.companies || []).map(({ company: c }) => ({
    name: clean(c.name), address: clean(c.registered_address_in_full), phone: '', email: '', website: '', rating: '',
    mapsUrl: clean(c.opencorporates_url), source: 'OpenCorporates (registry)',
  }));
}

async function enrichHunter(leads, cap = 15) {
  const targets = leads.filter((l) => l.website && !l.email).slice(0, cap);
  await Promise.all(targets.map(async (l) => {
    try {
      const domain = new URL(/^https?:/.test(l.website) ? l.website : 'https://' + l.website).hostname.replace(/^www\./, '');
      const j = await getJSON(`https://api.hunter.io/v2/domain-search?domain=${domain}&limit=1&api_key=${KEYS.hunter}`, { timeout: 8000 });
      const e = j.data?.emails?.[0];
      if (e) { l.email = e.value; l.source += ' + Hunter'; }
    } catch (_) {}
  }));
}

function dedupe(leads) {
  const seen = new Map();
  for (const l of leads) {
    if (!l.name) continue;
    const key = l.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '|' + (l.phone || l.address).toLowerCase().replace(/\D/g, '').slice(-7);
    const prev = seen.get(key);
    if (!prev) seen.set(key, l);
    else for (const k of ['phone', 'email', 'website', 'rating', 'address']) if (!prev[k] && l[k]) prev[k] = l[k];
  }
  return [...seen.values()];
}

async function search({ sector, country, city, limit }) {
  const place = [city, country].filter(Boolean).join(', ');
  if (!sector || !place) throw new Error('Choose a sector and enter a country or city.');
  const geo = await geocode(place);
  const ctx = { sector, place, geo, limit };
  const jobs = [['OpenStreetMap', srcOSM]];
  if (KEYS.google) jobs.push(['Google Places', srcGoogle]);
  if (KEYS.apollo) jobs.push(['Apollo', srcApollo]);
  if (KEYS.opencorporates) jobs.push(['OpenCorporates', srcOpenCorporates]);
  const status = {};
  const results = await Promise.all(jobs.map(async ([name, fn]) => {
    try { const r = await fn(ctx); status[name] = { ok: true, count: r.length }; return r; }
    catch (e) { status[name] = { ok: false, error: e.message }; return []; }
  }));
  const leads = dedupe(results.flat()).slice(0, limit * 2);
  if (KEYS.hunter) await enrichHunter(leads);
  for (const l of leads) l.sector = sector;
  return { leads, status, place: geo.label };
}

function config() {
  return {
    sectors: Object.keys(SECTORS),
    sources: { OpenStreetMap: true, 'Google Places': !!KEYS.google, Apollo: !!KEYS.apollo, OpenCorporates: !!KEYS.opencorporates, Hunter: !!KEYS.hunter },
  };
}

// ---- consumer lead storage: Upstash/Vercel KV Redis on Vercel, JSON file locally
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const HASH = 'leadfinder:consumer_leads';
const FILE = path.join(__dirname, '..', 'consumer-leads.json');

async function redis(cmd) {
  const r = await fetch(REDIS_URL, { method: 'POST', headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, body: JSON.stringify(cmd), signal: AbortSignal.timeout(10000) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
function storageReady() { return !!(REDIS_URL && REDIS_TOKEN) || !process.env.VERCEL; }
function needStorage() {
  if (!storageReady()) throw new Error('Storage is not connected. In Vercel, open Storage, add Upstash Redis, then redeploy.');
}
const readFile = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) { return []; } };

const leadsStore = {
  async list() {
    needStorage();
    if (REDIS_URL) return (await redis(['HVALS', HASH])).map((v) => JSON.parse(v)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return readFile().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async add(lead) {
    needStorage();
    if (REDIS_URL) return redis(['HSET', HASH, lead.id, JSON.stringify(lead)]);
    const all = readFile(); all.push(lead); fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
  },
  async remove(id) {
    needStorage();
    if (REDIS_URL) return redis(['HDEL', HASH, id]);
    fs.writeFileSync(FILE, JSON.stringify(readFile().filter((l) => l.id !== id), null, 2));
  },
};

module.exports = { authRequired, authorized, search, config, leadsStore, clean, storageReady, SECTORS };
