const { createSign } = require("crypto");

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const SITES = [...new Set([
  process.env.GSC_SITE || "sc-domain:gift-ora.online",
  "https://gift-ora.online/",
  "sc-domain:gift-ora.online",
])];

function credentials() {
  const raw = process.env.GSC_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    return parsed.client_email && parsed.private_key ? parsed : null;
  } catch {
    return null;
  }
}

function base64url(value) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken(creds) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: creds.client_email,
      scope: SCOPE,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(header + "." + claims);
  const assertion = header + "." + claims + "." + base64url(signer.sign(creds.private_key));

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "Google token request failed");
  return data.access_token;
}

async function inspect(url) {
  const creds = credentials();
  if (!creds) return { configured: false };

  try {
    const token = await accessToken(creds);
    let lastError = null;
    for (const site of SITES) {
      const res = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionUrl: url, siteUrl: site, languageCode: "en" }),
      });
      const data = await res.json();
      if (!res.ok) {
        lastError = (data.error && data.error.message) || "HTTP " + res.status;
        continue;
      }
      const result = (data.inspectionResult && data.inspectionResult.indexStatusResult) || {};
      return {
        configured: true,
        site,
        verdict: result.verdict || "NEUTRAL",
        coverageState: result.coverageState || null,
        lastCrawlTime: result.lastCrawlTime || null,
        pageFetchState: result.pageFetchState || null,
        indexingState: result.indexingState || null,
        robotsTxtState: result.robotsTxtState || null,
        googleCanonical: result.googleCanonical || null,
        userCanonical: result.userCanonical || null,
      };
    }
    return { configured: true, error: lastError };
  } catch (err) {
    return { configured: true, error: err.message };
  }
}

module.exports = { inspect, configured: () => !!credentials() };
