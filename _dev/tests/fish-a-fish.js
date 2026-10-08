// Fish-A-Fish: with Visual FX off the bobbers, the fish shadows and the boot
// are drawn still (with FX on they bob, wag and rock); Enter on a focused menu
// button only presses that button, and a pick clicked with the mouse doesn't
// take over the round Enter then starts; the menu buttons' shortcut keycaps
// hide on a touch-only phone.
module.exports = async ({ browser, base, check, lib }) => {
  const open = (ctx) => lib.open(ctx, base, "games/fish-a-fish/");
  const done = async (p, what) => { check("fish-a-fish " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  let ctx = await lib.newContext(browser);

  // ---- the clock the bob / wag / rock run on, frame to frame
  const motion = async (off) => {
    const p = await open(ctx);
    await p.evaluate((off) => localStorage.setItem("reduceMotion:fish-a-fish", off ? "1" : "0"), off);
    await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(200);
    await p.evaluate(() => {
      FishAFish.start("daybreak"); FishAFish.hold();
      FishAFish.force(0, "perch", "bite", 9); FishAFish.force(1, "junk", "bite", 9);
      window.__clock = {};
      ["bobber", "shadowFish", "junk"].forEach((fn) => {
        const real = FishArt[fn];
        FishArt[fn] = function () { (window.__clock[fn] = window.__clock[fn] || []).push(arguments[arguments.length - 1]); return real.apply(this, arguments); };
      });
    });
    await p.waitForTimeout(250);
    const c = await p.evaluate(() => window.__clock);
    await done(p, "motion FX " + (off ? "off" : "on"));
    const still = (a) => !!a && a.length > 2 && a.every((t) => t === a[0]);
    return { bobber: still(c.bobber), shadowFish: still(c.shadowFish), junk: still(c.junk), drawn: !!(c.bobber && c.shadowFish && c.junk) };
  };
  const off = await motion(true), on = await motion(false);
  check("fish-a-fish: with Visual FX off the bobbers, fish shadows and the boot are drawn still; with FX on they move",
    off.drawn && off.bobber && off.shadowFish && off.junk && on.drawn && !on.bobber && !on.shadowFish && !on.junk, { off, on });

  // ---- Enter on a focused menu button presses that button and starts nothing
  let p = await open(ctx);
  await p.keyboard.press("c");
  await p.evaluate(() => document.querySelector('#pick-kb button[data-v="letters"]').focus());
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const menu = await p.evaluate(() => ({ state: FishAFish.state().state, kb: localStorage.getItem("fishafish_kb") }));
  check("fish-a-fish: Enter on the focused All letters button picks it, without casting off", menu.state === "menu" && menu.kb === "letters", menu);
  await done(p, "menu Enter");

  // ---- All letters clicked, then Condensed picked by key: Enter casts off on
  // the Condensed pond, and the menu still says Condensed
  p = await open(ctx);
  await p.click('#pick-kb button[data-v="letters"]');
  await p.keyboard.press("c");
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const run = await p.evaluate(() => ({ state: FishAFish.state().state, kb: FishAFish.state().kb, saved: localStorage.getItem("fishafish_kb") }));
  check("fish-a-fish: after clicking All letters then pressing C, Enter casts off on the Condensed pond and the pick stays Condensed",
    run.state === "play" && run.kb === "nine" && run.saved === "nine", run);
  await done(p, "mouse then Enter");
  await ctx.close();

  // ---- touch-only phone: the shortcut keycaps on the menu buttons are hidden
  // (the Condensed pond's QWE / ASD / ZXC and Shift describe the pond, and stay)
  ctx = await lib.newContext(browser, { hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  p = await open(ctx);
  const caps = await p.evaluate(() => [...document.querySelectorAll("button kbd")].map((k) => { const s = k.closest(".gs-keys"); return { k: k.textContent, wrap: s ? getComputedStyle(s).display : "unwrapped" }; }));
  const keys = caps.filter((c) => c.wrap !== "unwrapped"), plain = caps.filter((c) => c.wrap === "unwrapped").map((c) => c.k).join("");
  check("fish-a-fish: on a touch-only phone the menu buttons' shortcut keycaps are hidden",
    keys.length >= 6 && keys.every((c) => c.wrap === "none") && plain === "QWEASDZXCShift", { keys, plain });
  await done(p, "touch keycaps");
  await ctx.close();
};
