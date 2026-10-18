const crypto = require('crypto');
const core = require('../lib/core');

// GET list, POST create (consent required), DELETE ?id=
module.exports = async (req, res) => {
  if (!core.authorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    if (req.method === 'GET') return res.status(200).json(await core.leadsStore.list());

    if (req.method === 'POST') {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      if (!b.consent) return res.status(400).json({ error: 'Consent is required.' });
      if (!core.clean(b.name) || (!core.clean(b.email) && !core.clean(b.phone))) {
        return res.status(400).json({ error: 'Name and an email or phone are required.' });
      }
      const lead = {
        id: crypto.randomUUID(),
        name: core.clean(b.name), email: core.clean(b.email), phone: core.clean(b.phone),
        country: core.clean(b.country), interest: core.clean(b.interest),
        consent: true, consentText: core.clean(b.consentText), createdAt: new Date().toISOString(),
      };
      await core.leadsStore.add(lead);
      return res.status(200).json(lead);
    }

    if (req.method === 'DELETE') {
      const id = core.clean((req.query || {}).id);
      if (!id) return res.status(400).json({ error: 'Missing id.' });
      await core.leadsStore.remove(id);
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
