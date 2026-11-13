const { inspect } = require("../lib/gsc");
const { normalizeUrl } = require("../lib/core");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const url = normalizeUrl(req.body && req.body.url);
  if (!url) return res.status(400).json({ error: "Only gift-ora.online URLs can be checked." });
  return res.status(200).json(await inspect(url));
};
