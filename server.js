const http = require("http");
const fs = require("fs");
const path = require("path");
const { rateLimit } = require("./lib/limits");

const PORT = Number(process.env.PORT || 8123);
const PUBLIC = path.join(__dirname, "public");
const MAX_BODY = 128 * 1024;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};
const handlers = {
  "/api/settings": require("./api/settings"),
  "/api/submit": require("./api/submit"),
  "/api/check": require("./api/check"),
  "/api/google": require("./api/google"),
  "/api/sitemap": require("./api/sitemap"),
};

function readBody(req, res) {
  return new Promise((resolve) => {
    let raw = "";
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        tooLarge = true;
        res.setHeader("Connection", "close");
        res.status(413).json({ error: "Request body too large (limit 128 KB)." });
        req.resume();
        resolve(null);
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      if (tooLarge) return;
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function decorate(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (value) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(value));
    return res;
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  decorate(res);

  const handler = handlers[url.pathname];
  if (handler) {
    res.setHeader("Cache-Control", "no-store");
    const gate = rateLimit(req, url.pathname);
    if (!gate.ok) {
      res.setHeader("Retry-After", String(gate.retryAfter || 60));
      return res.status(429).json({ error: "Too many requests — wait a minute and try again." });
    }
    const body = await readBody(req, res);
    if (body === null) return;
    req.body = body;
    return handler(req, res).catch((err) => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });
  }

  if (req.method === "GET" || req.method === "HEAD") {
    const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const file = path.join(PUBLIC, rel);
    if (file.startsWith(PUBLIC) && TYPES[path.extname(file)] && fs.existsSync(file)) {
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)], "Cache-Control": "no-store" });
      return res.end(req.method === "HEAD" ? undefined : fs.readFileSync(file));
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log("Already running — open http://127.0.0.1:" + PORT);
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, process.env.RENDER ? "0.0.0.0" : "127.0.0.1", () => {
  console.log("Index My Link listening on port " + PORT);
});
