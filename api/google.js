const { inspect } = require("../lib/gsc");
const { normalizeUrl } = require("../lib/core");
const { useGscQuota } = require("../lib/limits");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const url = normalizeUrl(req.body && req.body.url);
  if (!url) return res.status(400).json({ error: "Only gift-ora.online URLs can be checked." });
  if (!useGscQuota()) {
    return res.status(200).json({
      configured: true,
      error: "Daily Search Console limit reached (1,500 inspections) — resets after midnight Pacific.",
    });
  }
  return res.status(200).json(await inspect(url));
};
