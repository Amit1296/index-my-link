const { sitemaps } = require("../lib/gsc");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return res.status(200).json(await sitemaps());
};
