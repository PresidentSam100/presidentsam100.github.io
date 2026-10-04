// Shared helpers for the browser tests: a static server for the repo, a
// Chromium context with the outside world stubbed out, page helpers, and a
// pass / fail tally.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".wav": "audio/wav",
  ".ogg": "audio/ogg", ".txt": "text/plain; charset=utf-8",
};

// Serve the repo root on a free port; resolves { server, base }.
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      try { if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html"); } catch (e) {}
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end("not found"); return; }
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
        res.end(buf);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, base: "http://127.0.0.1:" + server.address().port + "/" }));
  });
}

// Analytics and web fonts are blocked (they slow the tests and aren't under
// test); Passport's flag images are a stub so it works offline.
const FLAG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2"><rect width="3" height="2" fill="#c00"/></svg>';
async function newContext(browser, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 } }, opts || {}));
  await ctx.route(/googletagmanager|fonts\.googleapis|fonts\.gstatic/, (r) => r.fulfill({ body: "" }));
  await ctx.route(/flagcdn\.com/, (r) => r.fulfill({ contentType: "image/svg+xml", body: FLAG }));
  // Leaving a game for the games page (Home, or an Esc no game code claimed)
  // is counted on the page (page.leaves), not followed: a 204 reply keeps the
  // page where it is, so a test can press keys on a menu and carry on.
  await ctx.route(/\/games\/(index\.html)?$/, (r) => {
    const req = r.request();
    let from = "";
    try { from = req.frame().url(); } catch (e) {}
    if (req.isNavigationRequest() && /\/games\/[^/]+\//.test(from)) {
      const pg = req.frame().page();
      pg.leaves = (pg.leaves || 0) + 1;
      return r.fulfill({ status: 204, body: "" });
    }
    return r.continue();
  });
  return ctx;
}

// Every game page that carries the shared corner buttons, as paths under
// games/ ("passport/", "chess/three.html", ...).
function gamePages() {
  const games = path.join(ROOT, "games"), out = [];
  for (const d of fs.readdirSync(games)) {
    const dir = path.join(games, d);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".html")) continue;
      if (!/mute-toggle\.js/.test(fs.readFileSync(path.join(dir, f), "utf8"))) continue;
      out.push(d + "/" + (f === "index.html" ? "" : f));
    }
  }
  return out.sort();
}

function tally(suite) {
  let passed = 0, failed = 0;
  return {
    check(name, ok, detail) {
      if (ok) { passed++; if (process.env.VERBOSE) console.log("  PASS " + name); }
      else { failed++; console.log("  FAIL " + name + (detail !== undefined ? "  -> " + JSON.stringify(detail) : "")); }
    },
    summary() { return { suite, passed, failed }; },
  };
}

// Open a game page with clean storage. `page.errs` collects uncaught errors.
async function open(ctx, base, url, opts) {
  const p = await ctx.newPage();
  p.errs = [];
  p.leaves = 0;   // trips to the games page (see newContext)
  p.on("pageerror", (e) => p.errs.push(e.message));
  if (opts && opts.before) await opts.before(p);
  await p.goto(base + url, { waitUntil: "domcontentloaded" });
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await p.reload({ waitUntil: "domcontentloaded" });
  if (!opts || opts.waitCorner !== false) await p.waitForSelector(".mute-toggle");
  await p.waitForTimeout((opts && opts.settle) || 400);
  return p;
}

// Serve a game script with text replaced, to expose test hooks the shipped
// file doesn't have. `rel` is the path under the repo root.
async function injectScript(page, rel, replacements) {
  let src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  for (const [from, to] of replacements) {
    if (!src.includes(from)) throw new Error("injectScript: anchor not found in " + rel + ": " + from.slice(0, 60));
    src = src.replace(from, to);
  }
  const re = new RegExp("/" + rel.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + "$");
  await page.route(re, (r) => r.fulfill({ contentType: "text/javascript", body: src }));
}

// Fire a cancelable keydown at the focused element (or body); true if the
// page claimed it (preventDefault).
function fireKey(page, init) {
  return page.evaluate((init) => {
    const e = new KeyboardEvent("keydown", Object.assign({ bubbles: true, cancelable: true }, init));
    const t = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
    t.dispatchEvent(e);
    return e.defaultPrevented;
  }, init);
}

module.exports = { ROOT, serve, newContext, gamePages, tally, open, injectScript, fireKey };
