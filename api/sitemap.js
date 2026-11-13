const { loadSitemap } = require("../lib/core");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    return res.status(200).json(await loadSitemap());
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
};
