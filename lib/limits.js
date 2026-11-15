const WINDOW_MS = 60 * 1000;
const buckets = new Map();

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || (req.socket && req.socket.remoteAddress) || "unknown";
}

function allow(req, scope, max) {
  const key = scope + "|" + clientIp(req);
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset <= now) {
    buckets.set(key, { count: 1, reset: now + WINDOW_MS });
    return { ok: true };
  }
  if (bucket.count >= max) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.reset - now) / 1000)) };
  }
  bucket.count += 1;
  return { ok: true };
}

const LIMITS = {
  "/api/submit": 20,
  "/api/check": 600,
  "/api/google": 600,
  "/api/google-sitemaps": 30,
  "/api/settings": 10,
  "/api/sitemap": 30,
};

function rateLimit(req, path) {
  const max = LIMITS[path];
  if (!max) return { ok: true };
  return allow(req, path, max);
}

// Search Console URL Inspection allows 2,000 calls/day; leave headroom.
const GSC_DAILY = 1500;
let gscDay = "";
let gscUsed = 0;

function useGscQuota() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== gscDay) {
    gscDay = today;
    gscUsed = 0;
  }
  if (gscUsed >= GSC_DAILY) return false;
  gscUsed += 1;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.reset <= now) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

module.exports = { rateLimit, useGscQuota, clientIp };
