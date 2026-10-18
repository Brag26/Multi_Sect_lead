# LeadFinder

Search businesses in any sector and country, merge results from several sources, export to CSV. Includes a consent-based consumer lead form.

## Deploy on Vercel
1. Put this folder in a GitHub repo (or run `npx vercel` inside it).
2. In Vercel, choose Add New > Project, import the repo, and deploy. No build settings are needed.
3. Open the project > Storage > add **Upstash Redis** (free tier). This stores consumer leads. Vercel adds its keys for you.
4. Open Settings > Environment Variables and add:
   - `APP_PASSWORD`: a password for the whole app (do this, or anyone with the link can use it)
   - `CONTACT_EMAIL`: your email, sent to OpenStreetMap as their policy requires
   - Optional: `GOOGLE_PLACES_KEY`, `APOLLO_API_KEY`, `HUNTER_API_KEY`, `OPENCORPORATES_TOKEN`
5. Redeploy once so the variables take effect.

Searches can take up to 30 seconds. `vercel.json` allows the search function 60 seconds.

## Run locally
`node server.js`, then open http://localhost:3000. Copy `.env.example` to `.env` for keys. Leads save to `consumer-leads.json` locally.

## Sources
- OpenStreetMap: free, global, no key. Phone and email coverage is patchy.
- Google Places: best phone, website and rating coverage.
- Apollo: company search (paid plan).
- Hunter: finds business emails from each website.
- OpenCorporates: official company registry records.

## Consumer leads
Saved only when the consent box is ticked, with the consent wording and time. Each record can be deleted. Check local rules before contacting anyone (DPDP in India, GDPR in the EU, CAN-SPAM and TCPA in the US).
