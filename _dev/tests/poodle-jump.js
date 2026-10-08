// Poodle Jump: the start card carries the game's own name; with Visual FX off
// a black hole is drawn still (FX on, its spiral and ring turn).
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const done = async (p, what) => { check("poodle-jump " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  // ---- the start card's title, as drawn
  let p = await lib.open(ctx, base, "games/poodle-jump/");
  const drawn = await p.evaluate(() => new Promise((res) => {
    const c = __game.ctx, orig = c.fillText, seen = [];
    c.fillText = function (t) { seen.push(String(t)); return orig.apply(this, arguments); };
    requestAnimationFrame(() => requestAnimationFrame(() => { c.fillText = orig; res({ state: __game.state, seen }); }));
  }));
  check("poodle-jump: the start card is titled Poodle Jump", drawn.state === "start" && drawn.seen.includes("Poodle Jump") && !drawn.seen.some((t) => /Doodle/.test(t)), drawn);
  await done(p, "title");

  // ---- a black hole drawn at two moments: the same picture with FX off
  const still = {};
  for (const off of [true, false]) {
    p = await lib.open(ctx, base, "games/poodle-jump/", { before: (pg) => pg.addInitScript((off) => localStorage.setItem("reduceMotion:poodle-jump", off ? "1" : "0"), off) });
    still[off ? "off" : "on"] = await p.evaluate(() => {
      const cv = document.createElement("canvas"); cv.width = 120; cv.height = 120; const c = cv.getContext("2d");
      const e = new Enemy(30, 30, "blackhole");
      return [0.5, 1.3].map((t) => { c.clearRect(0, 0, 120, 120); e.t = t; e.render(c, 0); return cv.toDataURL(); }).reduce((a, b) => a === b);
    });
    await done(p, "fx " + (off ? "off" : "on"));
  }
  check("poodle-jump: with Visual FX off a black hole is drawn still; with it on its spiral and ring turn", still.off === true && still.on === false, still);

  // ---- the start, pause and game-over notes: keys on a desktop, touch wording on a phone
  const { devices } = require("@playwright/test");
  const phone = await lib.newContext(browser, devices["Pixel 7"]);
  const KEYS = ["←", "→", "A", "D", "Space", "↑", "P", "Esc"], TOUCH = ["Tap to start", "Tap ▶ to resume", "Tap to play again"];
  const notes = {};
  for (const [label, c] of [["desktop", ctx], ["phone", phone]]) {
    p = await lib.open(c, base, "games/poodle-jump/");
    const drawn = (set) => p.evaluate((set) => new Promise((res) => {
      eval(set);
      const g = __game.ctx, o = g.fillText, seen = [];
      g.fillText = function (t) { seen.push(String(t)); return o.apply(this, arguments); };
      requestAnimationFrame(() => requestAnimationFrame(() => { g.fillText = o; res(seen); }));
    }), set);
    const all = [].concat(await drawn(""), await drawn("__game.start(); __game.paused = true"), await drawn("__game.paused = false; __game.state = 'over'"));
    notes[label] = { keys: KEYS.filter((k) => all.includes(k)), touch: TOUCH.filter((t) => all.includes(t)) };
    await done(p, label + " notes");
  }
  check("poodle-jump: the start, pause and game-over notes show keys on a desktop and touch wording on a phone",
    notes.desktop.keys.length === KEYS.length && notes.desktop.touch.length === 0 && notes.phone.keys.length === 0 && notes.phone.touch.length === TOUCH.length, notes);
  await phone.close();

  await ctx.close();
};
