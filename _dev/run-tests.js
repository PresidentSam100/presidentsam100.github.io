// Browser tests for the games. Starts a static server for the repo, runs each
// suite in tests/ against it in headless Chromium, and exits non-zero if any
// check failed.
//
//   npm test                    every suite
//   npm test -- sweep passport  just those suites
//   VERBOSE=1 npm test          print passing checks too
//   JOBS=1 npm test             one suite at a time (default: 3 at once)
//   RETRY=0 npm test            don't re-run a failed suite on its own
//
// Suites run side by side (JOBS of them, sharing one browser and server),
// longest first, with at most half of them the long page-sweeping ones, so a
// full run takes a fraction of the time. Each suite's lines print together
// when it finishes. A suite that fails is run again on its own at the end:
// a check that only fails beside others is load, not a bug, and the summary
// names it so it can be made sturdier.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("@playwright/test");
const lib = require("./lib");

// The long ones: they open every game page, or most of them. They start
// first, and no more than half the jobs run them at once.
const HEAVY = ["shortcuts", "leave", "guard", "fx", "theme", "cues", "fx-more", "logicgate", "pause"];

// A full run outlasts a short sleep timer, and a PC that sleeps partway kills
// the run (pages time out, then ERR_NETWORK_IO_SUSPENDED). On Windows a hidden
// PowerShell asks for "system required" (the screen may still turn off) and
// holds it until its stdin closes, which happens when this process exits,
// however it exits. Elsewhere, nothing.
function stayAwake() {
  if (process.platform !== "win32") return;
  const ps =
    "Add-Type -Namespace RunTests -Name Power -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);'\n" +
    "[void][RunTests.Power]::SetThreadExecutionState([uint32]2147483649)\n" +   // ES_CONTINUOUS | ES_SYSTEM_REQUIRED
    "[void][Console]::In.ReadToEnd()";
  try {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(ps, "utf16le").toString("base64")],
      { stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
    child.on("error", () => {});   // no PowerShell: run anyway
    child.unref();
    child.stdin.on("error", () => {});
    child.stdin.unref();
  } catch (e) {}
}

// Run one suite; its lines are collected and printed together when it ends.
async function runSuite(name, ctx, label) {
  const t0 = Date.now();
  const lines = [];
  const t = lib.tally(name, (s) => lines.push(s));
  try {
    await require("./tests/" + name)({ browser: ctx.browser, base: ctx.base, check: t.check, lib });
  } catch (e) {
    t.check("suite ran to the end", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
  }
  const s = t.summary();
  console.log(name + (label ? " " + label : "") + (lines.length ? "\n" + lines.join("\n") : "") +
    "\n  " + s.passed + " passed, " + s.failed + " failed (" + ((Date.now() - t0) / 1000).toFixed(1) + "s)");
  return s;
}

(async () => {
  stayAwake();
  const all = fs.readdirSync(path.join(__dirname, "tests")).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3)).sort();
  const want = process.argv.slice(2);
  const unknown = want.filter((w) => !all.includes(w));
  if (unknown.length) { console.error("unknown suite(s): " + unknown.join(", ") + "\navailable: " + all.join(", ")); process.exit(2); }
  const suites = want.length ? want : all;
  const jobs = Math.max(1, Math.min(suites.length, parseInt(process.env.JOBS, 10) || Math.min(3, os.cpus().length)));
  const heavyCap = Math.max(1, Math.floor(jobs / 2));
  const retry = process.env.RETRY !== "0";
  // longest first: the heavy ones in the order listed, then the rest
  const queue = suites.slice().sort((a, b) => {
    const ha = HEAVY.indexOf(a), hb = HEAVY.indexOf(b);
    return (ha < 0 ? 99 : ha) - (hb < 0 ? 99 : hb) || a.localeCompare(b);
  });

  const { server, base } = await lib.serve();
  const browser = await chromium.launch();
  const ctx = { browser, base };
  const results = {};
  const flaky = [];
  const t0 = Date.now();
  try {
    let heavyRunning = 0;
    // each worker takes the next suite it may run (a heavy one only while
    // fewer than heavyCap are running), until the queue is empty
    const worker = async () => {
      for (;;) {
        const i = queue.findIndex((n) => !HEAVY.includes(n) || heavyRunning < heavyCap);
        if (i < 0) {
          if (!queue.length) return;
          await new Promise((r) => setTimeout(r, 200));   // only heavy ones left, all slots for them busy
          continue;
        }
        const name = queue.splice(i, 1)[0];
        const heavy = HEAVY.includes(name);
        if (heavy) heavyRunning++;
        try { results[name] = await runSuite(name, ctx); }
        finally { if (heavy) heavyRunning--; }
      }
    };
    await Promise.all(Array.from({ length: jobs }, worker));
    // a suite that failed beside others gets one more run, on its own
    if (retry && jobs > 1) {
      const failedNames = Object.keys(results).filter((n) => results[n].failed);
      if (failedNames.length) console.log("\nrunning again on their own: " + failedNames.join(", "));
      for (const name of failedNames) {
        const again = await runSuite(name, ctx, "(on its own)");
        if (!again.failed) flaky.push(name);
        results[name] = again;
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  const list = Object.values(results);
  const failed = list.reduce((n, s) => n + s.failed, 0), passed = list.reduce((n, s) => n + s.passed, 0);
  if (flaky.length) console.log("\npassed only when run on their own (load-sensitive, worth making sturdier): " + flaky.join(", "));
  console.log("\n" + (failed ? "FAILED: " + failed + " check(s)" : "ALL PASS") + " — " + passed + " passed across " + list.length +
    " suite(s), " + jobs + " at a time, in " + Math.round((Date.now() - t0) / 1000) + "s");
  process.exit(failed ? 1 : 0);
})();
