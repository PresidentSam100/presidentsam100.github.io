// Browser tests for the games. Starts a static server for the repo, runs each
// suite in tests/ against it in headless Chromium, and exits non-zero if any
// check failed.
//
//   npm test                    every suite
//   npm test -- sweep passport  just those suites
//   VERBOSE=1 npm test          print passing checks too
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("@playwright/test");
const lib = require("./lib");

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

(async () => {
  stayAwake();
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
