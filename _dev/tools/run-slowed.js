// Runs test suites with every page's CPU slowed (Chrome's CPU throttling), to
// find checks that only pass on an idle machine: ones that read a short cue
// after a fixed wait, race the game's own timers, or play on wall time. A check
// that passes with `npm test` but fails here is load-sensitive (see the test
// notes in README.md for how to make one sturdy).
//
//   node tools/run-slowed.js                       every suite, 4x slower
//   node tools/run-slowed.js cues leave            just these suites
//   RATE=6 OUT=slow.json node tools/run-slowed.js  slower; results saved as JSON
//
// One suite at a time, each one's result printed as it finishes; with OUT set,
// { suite: { "check name": true | false, "check name ::info": "..." } } is
// written after each suite. A whole slowed run takes a few times longer than
// `npm test` (about 1-2 h for every suite on a quiet machine).
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const lib = require("../lib.js");

const RATE = Number(process.env.RATE || 4);
const OUT = process.env.OUT || null;
const TESTS = path.join(__dirname, "..", "tests");
const all = fs.readdirSync(TESTS).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3)).sort();
const want = process.argv.slice(2);
const unknown = want.filter((w) => !all.includes(w));
if (unknown.length) { console.error("unknown suite(s): " + unknown.join(", ")); process.exit(2); }

// every page a suite opens through lib.newContext gets the slowdown
const L = Object.assign({}, lib, {
  newContext: async (browser, opts) => {
    const ctx = await lib.newContext(browser, opts);
    const newPage = ctx.newPage.bind(ctx);
    ctx.newPage = async () => {
      const p = await newPage();
      await (await ctx.newCDPSession(p)).send("Emulation.setCPUThrottlingRate", { rate: RATE });
      return p;
    };
    return ctx;
  },
});

(async () => {
  const { server, base } = await lib.serve();
  const browser = await chromium.launch();
  const res = {};
  let failed = 0;
  for (const name of want.length ? want : all) {
    const t0 = Date.now(), r = (res[name] = {}), seen = {};
    const check = (n, ok, info) => {
      const k = seen[n] ? n + " #" + ++seen[n] : ((seen[n] = 1), n);
      r[k] = !!ok;
      if (!ok) r[k + " ::info"] = JSON.stringify(info === undefined ? null : info).slice(0, 1500);
    };
    try { await require(path.join(TESTS, name))({ browser, base, check, lib: L }); }
    catch (e) { r["suite ran to the end"] = false; r["suite ran to the end ::info"] = String((e && e.message) || e).split("\n").slice(0, 14).join(" | ").slice(0, 1500); }
    const fails = Object.keys(r).filter((k) => r[k] === false);
    failed += fails.length;
    console.log(name + ": " + Object.keys(r).filter((k) => r[k] === true).length + " passed, " + fails.length + " failed (" + ((Date.now() - t0) / 1000).toFixed(0) + "s)" +
      fails.map((k) => "\n  FAIL " + k + "  -> " + r[k + " ::info"]).join(""));
    if (OUT) fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  }
  await browser.close(); server.close();
  console.log(failed ? "\n" + failed + " check(s) failed with the CPU slowed " + RATE + "x" : "\nALL PASS with the CPU slowed " + RATE + "x");
  process.exitCode = failed ? 1 : 0;
})();
