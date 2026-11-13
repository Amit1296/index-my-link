const HOST = "gift-ora.online";
const HISTORY_KEY = "iml.history.v1";
const $ = (id) => document.getElementById(id);

const state = {
  keyReady: false,
  sitemap: [],
  lastSubmitted: {},
  selected: new Set(),
  filter: "",
  onlyUnsubmitted: false,
};

async function api(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const res = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed (HTTP " + res.status + ")");
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("The free server was asleep — it can take up to a minute to wake. Click again.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function normalize(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  let url;
  try {
    let abs;
    if (/^https?:\/\//i.test(text)) abs = text;
    else if (/^www\./i.test(text)) abs = "https://" + text;
    else if (text.startsWith("/") || /\.html?($|[?#])/i.test(text) || !text.includes(".")) abs = "https://" + HOST + "/" + text.replace(/^\/+/, "");
    else abs = "https://" + text;
    url = new URL(abs);
  } catch {
    return null;
  }
  if (url.hostname.replace(/^www\./i, "").toLowerCase() !== HOST) return null;
  url.protocol = "https:";
  url.hostname = HOST;
  url.hash = "";
  url.search = "";
  const href = url.href;
  return href.endsWith("/") && url.pathname !== "/" ? href.slice(0, -1) : href;
}

function parseBox() {
  const lines = $("urlBox").value.split(/[\s,]+/).filter(Boolean);
  const valid = [];
  const skipped = [];
  for (const line of lines) {
    const u = normalize(line);
    if (!u) skipped.push(line);
    else if (!valid.includes(u)) valid.push(u);
  }
  return { valid, skipped };
}

function updateCount() {
  const { valid, skipped } = parseBox();
  $("urlCount").textContent = valid.length + " valid · " + skipped.length + " skipped";
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function statusClass(code) {
  if (code === 200) return "status-ok";
  if (code === 202) return "status-warn";
  return "status-bad";
}

function renderResult(targetId, record) {
  const el = $(targetId);
  const ok = record.batches.every((b) => b.status === 200 || b.status === 202);
  const skipped = record.skipped || [];
  el.className = "result " + (ok ? "good" : "bad");
  el.innerHTML =
    "<h3>" + (ok ? "Submission accepted" : "Submission failed") + "</h3>" +
    record.batches
      .map(
        (b) =>
          '<div class="row"><span>' + b.size + " URL" + (b.size === 1 ? "" : "s") + "</span>" +
          '<span class="' + statusClass(b.status) + '">HTTP ' + b.status + " — " + b.message + "</span></div>"
      )
      .join("") +
    (skipped.length
      ? '<p class="muted" style="margin:10px 0 0">Skipped, not a gift-ora.online link: ' +
        skipped.slice(0, 4).map(escapeHtml).join(", ") + (skipped.length > 4 ? " …" : "") + "</p>"
      : "");
  el.classList.remove("hidden");
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function refreshKey() {
  const s = await api("/api/settings");
  state.keyReady = s.hasKey;
  const pill = $("keyPill");
  pill.textContent = s.hasKey ? "Key " + s.keyPreview : "Key missing — click to add";
  pill.className = "pill " + (s.hasKey ? "good" : "bad");
  return s;
}

function openKeyModal() {
  $("keyModal").classList.remove("hidden");
  $("keyError").classList.add("hidden");
  $("keyInput").value = "";
  $("keyInput").focus();
}

function closeKeyModal() {
  $("keyModal").classList.add("hidden");
}

async function saveKey() {
  const key = $("keyInput").value.trim();
  try {
    await api("/api/settings", { key });
    closeKeyModal();
    await refreshKey();
  } catch (err) {
    $("keyError").textContent = err.message;
    $("keyError").classList.remove("hidden");
  }
}

async function doSubmit(urls, targetId) {
  if (!state.keyReady) return openKeyModal();
  if (!urls.length) return;
  const btn = targetId === "submitResult" ? $("submitBtn") : $("submitSelected");
  btn.disabled = true;
  btn.textContent = "Submitting…";
  try {
    const record = await api("/api/submit", { urls });
    renderResult(targetId, record);
    saveRecord(record);
    loadHistory();
    if (state.sitemap.length) applySitemapFilter();
  } catch (err) {
    const el = $(targetId);
    el.className = "result bad";
    el.innerHTML = "<h3>Could not submit</h3><div class='row'><span>" + err.message + "</span></div>";
    el.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = targetId === "submitResult" ? "Submit for indexing" : "Submit selected";
  }
}

function submitFromBox() {
  const { valid, skipped } = parseBox();
  if (!valid.length) {
    const el = $("submitResult");
    el.className = "result bad";
    el.innerHTML =
      "<h3>Nothing to submit</h3><div class='row'><span>Paste a gift-ora.online link — a full URL, or a path like /cakes.html</span></div>" +
      (skipped.length ? '<p class="muted" style="margin:10px 0 0">Not recognised: ' + skipped.slice(0, 4).map(escapeHtml).join(", ") + "</p>" : "");
    el.classList.remove("hidden");
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  doSubmit(valid, "submitResult");
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRecord(record) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify([record, ...getHistory()].slice(0, 200)));
}

function loadHistory() {
  const records = getHistory();
  const byUrl = {};
  for (const entry of records) {
    if (!entry.ok) continue;
    for (const url of entry.urls) {
      if (!byUrl[url] || byUrl[url].at < entry.at) {
        byUrl[url] = { at: entry.at, status: entry.batches[0] ? entry.batches[0].status : 0 };
      }
    }
  }
  state.lastSubmitted = byUrl;
  const list = $("historyList");
  if (!records.length) {
    list.innerHTML = '<div class="empty">No submissions yet. Send your first batch from the Submit tab.</div>';
    return;
  }
  list.innerHTML = records
    .map((r) => {
      const ok = r.ok;
      return (
        '<div class="entry"><div class="entry-head">' +
        "<div><strong>" + r.urls.length + " URL" + (r.urls.length === 1 ? "" : "s") + "</strong>" +
        ' <span class="tag ' + (ok ? "ok" : "") + '">' + (ok ? "accepted" : "failed") + "</span></div>" +
        '<span class="muted">' + fmtTime(r.at) + "</span></div>" +
        "<ul>" + r.urls.map((u) => "<li>" + escapeHtml(u) + "</li>").join("") + "</ul>" +
        (r.batches.some((b) => b.status !== 200 && b.status !== 202)
          ? "<p class='muted' style='margin:8px 0 0'>" +
            r.batches.map((b) => "HTTP " + b.status + " — " + b.message).join(" · ") + "</p>"
          : "") +
        "</div>"
      );
    })
    .join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const CHECKS_KEY = "iml.checks.v1";

function getChecks() {
  try {
    return JSON.parse(localStorage.getItem(CHECKS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveCheck(url, data) {
  const checks = getChecks();
  checks[url] = {
    at: new Date().toISOString(),
    status: data.status,
    canonicalOk: data.canonicalOk,
    noindex: data.noindex,
    google: data.google || null,
  };
  localStorage.setItem(CHECKS_KEY, JSON.stringify(checks));
}

function buildLinkIndex() {
  const map = {};
  for (const record of getHistory()) {
    for (const url of record.urls || []) {
      if (!map[url]) map[url] = { url, first: record.at, last: record.at, count: 0 };
      map[url].count += 1;
      if (record.at > map[url].last) map[url].last = record.at;
      if (record.at < map[url].first) map[url].first = record.at;
    }
  }
  return Object.values(map).sort((a, b) => b.last.localeCompare(a.last));
}

function checkBadge(check) {
  if (!check) return '<span class="tag">—</span>';
  if (check.status !== 200) return '<span class="tag bad">HTTP ' + escapeHtml(check.status || "?") + "</span>";
  if (check.noindex) return '<span class="tag bad">noindex</span>';
  if (!check.canonicalOk) return '<span class="tag warn">canonical</span>';
  return '<span class="tag ok">Ready</span>';
}

function googleBadge(google) {
  if (!google) return '<span class="tag">—</span>';
  if (google.configured === false) return '<span class="tag">not connected</span>';
  if (google.error) return '<span class="tag bad" title="' + escapeHtml(google.error) + '">error</span>';
  if (google.verdict === "PASS") return '<span class="tag ok">On Google</span>';
  if (google.verdict === "FAIL") return '<span class="tag bad">Not on Google</span>';
  const label = String(google.coverageState || "Unknown").replace(" - ", " · ");
  return '<span class="tag warn">' + escapeHtml(label) + "</span>";
}

function renderLinks() {
  const links = buildLinkIndex();
  const checks = getChecks();
  const wrap = $("linksWrap");
  if (!links.length) {
    wrap.classList.add("hidden");
    $("linksSummary").textContent = "No links submitted yet.";
    return;
  }
  wrap.classList.remove("hidden");
  const checked = links.filter((l) => checks[l.url]);
  const indexable = checked.filter((l) => checks[l.url].status === 200 && checks[l.url].canonicalOk && !checks[l.url].noindex);
  const onGoogle = checked.filter((l) => checks[l.url].google && checks[l.url].google.verdict === "PASS");
  $("linksSummary").textContent =
    links.length + " links · " + indexable.length + " ready · " + onGoogle.length + " on Google · " + checked.length + " checked";
  $("linksBody").innerHTML = links
    .map(
      (l) =>
        "<tr>" +
        '<td class="url">' + escapeHtml(l.url.replace("https://" + HOST, "")) + "</td>" +
        '<td class="muted">' + fmtTime(l.last) + "</td>" +
        "<td>" + googleBadge(checks[l.url] && checks[l.url].google) + "</td>" +
        "<td>" + checkBadge(checks[l.url]) + "</td>" +
        '<td class="row-actions">' +
        '<button class="ghost link-check" data-url="' + escapeHtml(l.url) + '" type="button">Check</button>' +
        '<a class="ghost link-google" title="Opens Google\'s Rich Results Test — needs a signed-in Google account" href="https://search.google.com/test/rich-results?url=' + encodeURIComponent(l.url) + '" target="_blank" rel="noopener">Google fetch</a>' +
        "</td>" +
        "</tr>"
    )
    .join("");
}

async function checkLink(url) {
  const [page, google] = await Promise.all([
    api("/api/check", { url }).catch(() => null),
    api("/api/google", { url }).catch(() => null),
  ]);
  if (page && page.status) saveCheck(url, { ...page, google: google || null });
}

async function doLinkCheck(button) {
  button.disabled = true;
  button.textContent = "…";
  try {
    await checkLink(button.dataset.url);
  } catch (err) {
    button.textContent = "Failed";
  }
  renderLinks();
}

async function checkAllLinks() {
  const links = buildLinkIndex();
  if (!links.length) return;
  const button = $("checkAllBtn");
  button.disabled = true;
  const queue = links.map((l) => l.url);
  let done = 0;
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      button.textContent = "Checking " + ++done + "/" + links.length;
      try {
        await checkLink(url);
      } catch (err) {
        /* keep going */
      }
      renderLinks();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  button.textContent = "Check all";
  button.disabled = false;
}

function exportCsv() {
  const checks = getChecks();
  const rows = [["url", "last_submitted", "submissions", "http_status", "canonical_ok", "noindex", "google_verdict", "google_coverage", "checked_at"]];
  for (const link of buildLinkIndex()) {
    const check = checks[link.url] || {};
    const google = check.google || {};
    rows.push([
      link.url,
      link.last,
      link.count,
      check.status ?? "",
      check.canonicalOk ?? "",
      check.noindex ?? "",
      google.verdict ?? (google.configured === false ? "not_connected" : ""),
      google.coverageState ?? "",
      check.at || "",
    ]);
  }
  const csv = rows.map((row) => row.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "index-my-link.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function loadSitemap() {
  const btn = $("loadSitemap");
  btn.disabled = true;
  btn.textContent = "Loading…";
  try {
    const data = await api("/api/sitemap");
    state.sitemap = data.urls;
    $("sitemapInfo").textContent = data.count + " URLs in sitemap.xml";
    $("sitemapFilters").classList.remove("hidden");
    $("sitemapWrap").classList.remove("hidden");
    $("sitemapActions").classList.remove("hidden");
    renderSitemap();
  } catch (err) {
    $("sitemapInfo").textContent = "Could not load: " + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Reload sitemap.xml";
  }
}

function renderSitemap() {
  const body = $("sitemapBody");
  const rows = state.sitemap.filter((row) => {
    if (state.filter && !row.url.toLowerCase().includes(state.filter)) return false;
    if (state.onlyUnsubmitted && state.lastSubmitted[row.url]) return false;
    return true;
  });
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="5" class="muted">No URLs match this filter.</td></tr>';
    updateSelectedCount();
    return;
  }
  body.innerHTML = rows
    .map((row) => {
      const last = state.lastSubmitted[row.url];
      return (
        "<tr>" +
        '<td class="col-check"><input type="checkbox" data-url="' + escapeHtml(row.url) + '"' +
        (state.selected.has(row.url) ? " checked" : "") + "></td>" +
        '<td class="url">' + escapeHtml(row.url.replace("https://" + HOST, "")) + "</td>" +
        '<td class="muted">' + (row.lastmod || "—") + "</td>" +
        '<td>' + (last ? '<span class="tag ok">' + fmtTime(last.at) + "</span>" : '<span class="tag">never</span>') + "</td>" +
        '<td><button class="ghost inspect" data-url="' + escapeHtml(row.url) + '" type="button">Inspect</button></td>' +
        "</tr>"
      );
    })
    .join("");
  updateSelectedCount();
}

function updateSelectedCount() {
  $("selectedCount").textContent = state.selected.size === 0 ? "Tick a row first" : state.selected.size + " selected";
  $("submitSelected").disabled = state.selected.size === 0;
}

function applySitemapFilter() {
  state.filter = $("sitemapFilter").value.trim().toLowerCase();
  state.onlyUnsubmitted = $("onlyUnsubmitted").checked;
  renderSitemap();
}

async function inspect(url) {
  const el = $("sitemapResult");
  el.className = "result";
  el.innerHTML = "<h3>Inspecting…</h3><div class='row'><span>" + escapeHtml(url) + "</span></div>";
  el.classList.remove("hidden");
  try {
    const r = await api("/api/check", { url });
    if (!r.status) {
      el.className = "result bad";
      el.innerHTML = "<h3>Fetch failed</h3><div class='row'><span>" + escapeHtml(r.error || "unknown error") + "</span></div>";
      return;
    }
    const flags = [];
    flags.push(row("HTTP status", String(r.status), r.status === 200 ? "status-ok" : "status-bad"));
    if (r.location) flags.push(row("Redirects to", r.location, "status-warn"));
    flags.push(row("Googlebot fetched", r.status === 200 ? "page served directly" : "no", r.status === 200 ? "status-ok" : "status-warn"));
    if (r.status === 200) {
      flags.push(row("Self-canonical", r.canonicalOk ? "yes" : "no — " + (r.canonical || "missing"), r.canonicalOk ? "status-ok" : "status-bad"));
      flags.push(row("Noindex", r.noindex ? "present — will not rank" : "none", r.noindex ? "status-bad" : "status-ok"));
      if (r.title) flags.push(row("Title", r.title, ""));
    }
    const good = r.status === 200 && r.canonicalOk && !r.noindex;
    el.className = "result " + (good ? "good" : "bad");
    el.innerHTML =
      "<h3>" + (good ? "Indexable" : "Not indexable") + "</h3>" +
      "<p class='muted' style='margin:0 0 10px'>" + escapeHtml(url) + "</p>" +
      flags.join("");
  } catch (err) {
    el.className = "result bad";
    el.innerHTML = "<h3>Inspect failed</h3><div class='row'><span>" + escapeHtml(err.message) + "</span></div>";
  }
}

function row(label, value, cls) {
  return '<div class="row"><span>' + label + '</span><span class="' + (cls || "") + '">' + escapeHtml(value) + "</span></div>";
}

document.addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (tab) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + tab.dataset.tab));
    if (tab.dataset.tab === "links") renderLinks();
    return;
  }
  const linkCheckBtn = e.target.closest(".link-check");
  if (linkCheckBtn) {
    doLinkCheck(linkCheckBtn);
    return;
  }
  const inspectBtn = e.target.closest(".inspect");
  if (inspectBtn) {
    inspect(inspectBtn.dataset.url);
    return;
  }
});

document.addEventListener("change", (e) => {
  const box = e.target.closest("#sitemapBody input[type=checkbox]");
  if (box) {
    if (box.checked) state.selected.add(box.dataset.url);
    else state.selected.delete(box.dataset.url);
    updateSelectedCount();
  }
});

$("urlBox").addEventListener("input", updateCount);
$("submitBtn").addEventListener("click", submitFromBox);
$("clearBtn").addEventListener("click", () => {
  $("urlBox").value = "";
  updateCount();
  $("submitResult").classList.add("hidden");
});
$("loadSitemap").addEventListener("click", loadSitemap);
$("sitemapFilter").addEventListener("input", applySitemapFilter);
$("onlyUnsubmitted").addEventListener("change", applySitemapFilter);
$("selectAll").addEventListener("click", () => {
  const visible = [...$("sitemapBody").querySelectorAll("input[type=checkbox]")];
  const allOn = visible.every((b) => b.checked);
  visible.forEach((b) => {
    b.checked = !allOn;
    if (b.checked) state.selected.add(b.dataset.url);
    else state.selected.delete(b.dataset.url);
  });
  updateSelectedCount();
});
$("submitSelected").addEventListener("click", () => {
  const urls = [...state.selected];
  if (!urls.length) return;
  doSubmit(urls, "sitemapResult").then(() => {
    state.selected.clear();
    renderSitemap();
  });
});
$("refreshHistory").addEventListener("click", loadHistory);
$("checkAllBtn").addEventListener("click", checkAllLinks);
$("exportBtn").addEventListener("click", exportCsv);
$("keyPill").addEventListener("click", openKeyModal);
$("googleCard").addEventListener("click", () => {
  const collapsed = $("googleHelp").classList.toggle("hidden");
  $("googleCard").setAttribute("aria-expanded", String(!collapsed));
});
$("saveKey").addEventListener("click", saveKey);
$("cancelKey").addEventListener("click", closeKeyModal);
$("keyInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveKey();
});

(async function init() {
  updateCount();
  const s = await refreshKey();
  if (!s.hasKey) openKeyModal();
  loadHistory();
  renderLinks();
})();
