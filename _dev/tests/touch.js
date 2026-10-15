// Keycaps on games' own buttons show on a desktop and hide on touch-only
// devices (no keyboard to press them on); hint text and canvas hints swap
// their keys for touch wording there.
module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const ctx = await lib.newContext(browser, opts);
    const want = label === "desktop";
    const shown = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s + " .gs-keys"); return e ? getComputedStyle(e).display !== "none" : null; }, sel);

    let p = await lib.open(ctx, base, "games/demolition-row/");
    await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /solo|play|start/i.test(x.textContent)); b && b.click(); });
    await p.waitForTimeout(500);
    // (its pause has no key of its own, every letter being someone's: paused, Resume wears Enter)
    await p.click(".gs-pause-btn, #pause-btn"); await p.waitForTimeout(150);
    const cap = await p.evaluate(() => { const e = document.getElementById("pause-resume"), a = getComputedStyle(e, "::after"); return e.getAttribute("data-gs-key") === "Space or Enter" && a.display !== "none" && a.content !== "none"; });
    check(label + ": demolition-row's Resume keycap (Space or Enter) " + (want ? "shows" : "is hidden"), cap === want, cap);
    await p.close();

    // (Slither's pause is the ⏸ corner button: its P shows beside it on a
    // wide desktop window, and a phone, too narrow for it, has the icon alone)
    p = await lib.open(ctx, base, "games/slither/");
    await p.click("#play-btn"); await p.waitForTimeout(400);
    const slCap = () => p.evaluate(() => !!document.querySelector(".gs-pause-btn kbd"));
    const s0 = await slCap();
    await p.click(".gs-pause-btn"); await p.waitForTimeout(150);
    const s1 = await slCap(), up = await p.evaluate(() => !document.getElementById("pause").classList.contains("hidden"));
    check(label + ": slither's ⏸ corner button pauses it" + (want ? ", its P keycap showing" : ", the icon alone"), s0 === want && s1 === want && up, { s0, s1, up });
    await p.close();

    p = await lib.open(ctx, base, "games/crazy-ohio/");
    check(label + ": crazy-ohio's Settings keycap " + (want ? "shows" : "is hidden"), (await shown(p, "#settingsBtn")) === want);

    // the shared pair for hint text, and its canvas twin: keys on a
    // keyboard, the touch wording on a touch-only device
    const pair = await p.evaluate(() => {
      const d = document.body.appendChild(document.createElement("p"));
      d.innerHTML = '<span class="gs-keys">press <kbd class="gs-kbd">Space</kbd></span><span class="gs-touch">tap</span> to start';
      const vis = (s) => getComputedStyle(d.querySelector(s)).display !== "none";
      const drawn = [];
      const ctx2 = document.createElement("canvas").getContext("2d");
      const fill = ctx2.fillText.bind(ctx2);
      ctx2.fillText = (t, x, y) => { drawn.push(t); fill(t, x, y); };
      GameShell.drawKeys(ctx2, "[Space] to start", 10, 10, { touch: "tap to start" });
      const out = { keys: vis(".gs-keys"), touch: vis(".gs-touch"), touchOnly: GameShell.touchOnly(), drawn: drawn.join("|") };
      d.remove();
      return out;
    });
    check(label + ": hint text shows " + (want ? "its keys, not the touch wording" : "the touch wording, not its keys") + ", and so does a canvas hint",
      pair.keys === want && pair.touch === !want && pair.touchOnly === !want && (want ? /Space/.test(pair.drawn) && !/tap/.test(pair.drawn) : pair.drawn === "tap to start"), pair);
    await p.close();
    await ctx.close();
  }
};
