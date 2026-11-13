const { HOST, getKey, saveKey } = require("../lib/core");

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const key = getKey();
    return res.status(200).json({
      host: HOST,
      hasKey: !!key,
      keyPreview: key ? key.slice(0, 4) + "…" + key.slice(-4) : null,
      keyLocked: !!process.env.INDEXNOW_KEY,
      cloud: !!process.env.VERCEL,
    });
  }

  if (req.method === "POST") {
    if (process.env.VERCEL) {
      return res.status(403).json({ error: "The key is set by the INDEXNOW_KEY environment variable in Vercel." });
    }
    const key = String((req.body && req.body.key) || "").trim();
    if (!/^[a-f0-9-]{8,64}$/i.test(key)) {
      return res.status(400).json({ error: "That does not look like an IndexNow key (8–64 hex characters)." });
    }
    saveKey(key);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
