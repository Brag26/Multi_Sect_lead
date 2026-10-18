const core = require('../lib/core');

module.exports = async (req, res) => {
  if (!core.authorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const q = req.query || {};
    const out = await core.search({
      sector: core.clean(q.sector),
      country: core.clean(q.country),
      city: core.clean(q.city),
      limit: Math.min(Number(q.limit) || 50, 200),
    });
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
