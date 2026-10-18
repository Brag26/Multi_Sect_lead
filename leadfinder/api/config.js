const core = require('../lib/core');

// Public on purpose: tells the page whether a password is needed.
module.exports = async (req, res) => {
  const authed = core.authorized(req);
  const warning = process.env.VERCEL && !core.authRequired()
    ? 'Anyone with this link can use the app and spend your API credits. Set APP_PASSWORD in Vercel to lock it.'
    : '';
  if (!authed) return res.status(200).json({ authRequired: true, authed: false });
  res.status(200).json({ authRequired: core.authRequired(), authed: true, warning, storage: core.storageReady(), ...core.config() });
};
