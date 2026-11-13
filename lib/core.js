const fs = require("fs");
const path = require("path");

const SITE = "https://gift-ora.online";
const HOST = "gift-ora.online";
const BATCH = 100;
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const SETTINGS_FILE = path.join(__dirname, "..", "data", "settings.json");

function getKey() {
  if (process.env.INDEXNOW_KEY) return process.env.INDEXNOW_KEY.trim();
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")).key || "";
  } catch {
    return "";
  }
}

function saveKey(key) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ key }, null, 2) + "\n");
}

function normalizeUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  let parsed;
  try {
    let abs;
    if (/^https?:\/\//i.test(raw)) abs = raw;
    else if (/^www\./i.test(raw)) abs = "https://" + raw;
    else if (raw.startsWith("/") || /\.html?($|[?#])/i.test(raw) || !raw.includes(".")) abs = SITE + "/" + raw.replace(/^\/+/, "");
    else abs = "https://" + raw;
    parsed = new URL(abs);
  } catch {
    return null;
  }
  const hostName = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  if (hostName !== HOST) return null;
  parsed.protocol = "https:";
  parsed.hostname = HOST;
  parsed.hash = "";
  parsed.search = "";
  const href = parsed.href;
  return href.endsWith("/") && parsed.pathname !== "/" ? href.slice(0, -1) : href;
}

function explainIndexNow(status) {
  return (
    {
      200: "Accepted by IndexNow",
      202: "Accepted — key validation still pending",
      400: "Rejected: malformed request",
      403: "Rejected: key does not match this host",
      422: "Rejected: URLs do not belong to this host",
      429: "Rejected: too many requests, try again later",
      500: "IndexNow server error",
      503: "IndexNow temporarily unavailable",
    }[status] || "Unexpected response " + status
  );
}

async function submitBatch(urls, key) {
  const body = JSON.stringify({
    host: HOST,
    key,
    keyLocation: `${SITE}/${key}.txt`,
    urlList: urls,
  });
  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body,
    });
    const text = (await res.text()).trim();
    return { status: res.status, message: explainIndexNow(res.status), detail: text.slice(0, 400) };
  } catch (err) {
    return { status: 0, message: "Network error: " + err.message, detail: "" };
  }
}

async function checkUrl(url) {
  try {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": GOOGLEBOT, Accept: "text/html" },
    });
    const out = {
      url,
      status: res.status,
      location: res.headers.get("location") || null,
      canonical: null,
      canonicalOk: null,
      noindex: null,
      title: null,
      xRobots: res.headers.get("x-robots-tag"),
    };
    if (res.status === 200 && (res.headers.get("content-type") || "").includes("text/html")) {
      const html = await res.text();
      const can =
        html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ||
        html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
      out.canonical = can ? can[1] : null;
      out.canonicalOk = !!can && new URL(can[1], url).href.replace(/\/$/, "") === url.replace(/\/$/, "");
      out.noindex =
        /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html) ||
        /noindex/i.test(out.xRobots || "");
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      out.title = title ? title[1].trim().slice(0, 140) : null;
    }
    return out;
  } catch (err) {
    return { url, status: 0, error: err.message };
  }
}

async function loadSitemap() {
  const res = await fetch(SITE + "/sitemap.xml", { headers: { "User-Agent": GOOGLEBOT } });
  if (!res.ok) throw new Error("sitemap.xml returned HTTP " + res.status);
  const xml = await res.text();
  const urls = [];
  const blocks = /<url>([\s\S]*?)<\/url>/g;
  let block;
  while ((block = blocks.exec(xml))) {
    const loc = (block[1].match(/<loc>([^<]+)<\/loc>/) || [])[1];
    const lastmod = (block[1].match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1] || null;
    if (loc) urls.push({ url: loc, lastmod });
  }
  return { count: urls.length, urls };
}

module.exports = { SITE, HOST, BATCH, GOOGLEBOT, getKey, saveKey, normalizeUrl, submitBatch, checkUrl, loadSitemap, explainIndexNow };
