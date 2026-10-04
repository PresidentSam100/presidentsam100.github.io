// Browser tests for the games. Starts a static server for the repo, runs each
// suite in tests/ against it in headless Chromium, and exits non-zero if any
// check failed.
//
//   npm test                    every suite
//   npm test -- sweep passport  just those suites
//   VERBOSE=1 npm test          print passing checks too
const fs = require("fs");
const path = require("path");
const { chromium } = require("@playwright/test");
const lib = require("./lib");

(async () => {
  const all = fs.readdirSync(path.join(__dirname, "tests")).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3)).sort();
  const want = process.argv.slice(2);
  const unknown = want.filter((w) => !all.includes(w));
  if (unknown.length) { console.error("unknown suite(s): " + unknown.join(", ") + "\navailable: " + all.join(", ")); process.exit(2); }
  const suites = want.length ? want : all;

  const { server, base } = await lib.serve();
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const name of suites) {
      const t0 = Date.now();
      console.log(name);
      const t = lib.tally(name);
      try {
        await require("./tests/" + name)({ browser, base, check: t.check, lib });
      } catch (e) {
        t.check("suite ran to the end", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
      }
      const s = t.summary();
      console.log("  " + s.passed + " passed, " + s.failed + " failed (" + ((Date.now() - t0) / 1000).toFixed(1) + "s)");
      results.push(s);
    }
  } finally {
    await browser.close();
    server.close();
  }
  const failed = results.reduce((n, s) => n + s.failed, 0), passed = results.reduce((n, s) => n + s.passed, 0);
  console.log("\n" + (failed ? "FAILED: " + failed + " check(s)" : "ALL PASS") + " — " + passed + " passed across " + results.length + " suite(s)");
  process.exit(failed ? 1 : 0);
})();
