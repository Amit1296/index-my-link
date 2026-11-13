const { BATCH, MAX_URLS, getKey, normalizeUrl, submitBatch } = require("../lib/core");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = getKey();
  if (!key) return res.status(400).json({ error: "IndexNow key is not configured." });

  const input = Array.isArray(req.body && req.body.urls) ? req.body.urls : [];
  if (input.length > MAX_URLS) {
    return res.status(400).json({ error: "Too many URLs — the limit is " + MAX_URLS + " per request." });
  }
  const valid = [];
  const skipped = [];
  for (const raw of input) {
    const url = normalizeUrl(raw);
    if (!url) skipped.push(String(raw).trim());
    else if (!valid.includes(url)) valid.push(url);
  }
  if (!valid.length) {
    return res.status(400).json({ error: "No usable gift-ora.online URLs in that list.", skipped });
  }

  const batches = [];
  const started = Date.now();
  for (let i = 0; i < valid.length; i += BATCH) {
    const slice = valid.slice(i, i + BATCH);
    if (Date.now() - started > 60000) {
      const remaining = valid.length - i;
      batches.push({
        size: remaining,
        status: 0,
        message: "Not sent — the request time limit was reached. Submit the remaining URLs separately.",
        detail: "",
      });
      break;
    }
    const result = await submitBatch(slice, key);
    batches.push({ size: slice.length, ...result });
  }

  return res.status(200).json({
    id: Date.now().toString(36),
    at: new Date().toISOString(),
    urls: valid,
    skipped,
    batches,
    ok: batches.every((b) => b.status === 200 || b.status === 202),
  });
};
