// Ping: the ball covers the same ground per second on a 144 Hz screen as on a
// 60 Hz one; a key held when the window loses focus isn't stuck down after.
// Frames are driven by the test (a stand-in requestAnimationFrame), so any
// refresh rate can be played back exactly.
const FRAMES = (pg) => pg.addInitScript(() => {
  let queue = [], t = 0;
  window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  window.cancelAnimationFrame = () => {};
  window.__frames = (n, ms) => { for (let i = 0; i < n; i++) { t += ms; const run = queue; queue = []; run.forEach((cb) => cb(t)); } };
});

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/ping/", { before: FRAMES });
  await p.click('#menu .btn[data-mode="1"]');
  // skip the 3-second countdown straight to a rally
  await p.evaluate(() => { clearInterval(countdownTimer); countdownEl.classList.add("hidden"); state = "playing"; __frames(2, 1000 / 60); });

  // a quarter of a second, the ball flying flat at 6 px a 60 Hz step: 90 px
  const run = (hz) => p.evaluate((hz) => {
    ball.x = 394; ball.y = 244; ball.vx = 6; ball.vy = 0;
    __frames(1, 1000 / hz);
    const x0 = ball.x;
    __frames(Math.round(hz / 4), 1000 / hz);
    return Math.round(ball.x - x0);
  }, hz);
  const d60 = await run(60), d144 = await run(144);
  check("ping: the ball moves as far per second at 144 Hz as at 60 Hz", Math.abs(d60 - 90) <= 8 && Math.abs(d144 - 90) <= 8, { d60, d144 });

  // hold S, lose focus (the game pauses itself), come back and resume
  const held = await p.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true }));
    window.dispatchEvent(new Event("blur"));
    const paused = PAUSE.isPaused();
    PAUSE.resume();
    const y0 = left.y;
    __frames(20, 1000 / 60);
    return { paused, moved: left.y - y0 };
  });
  check("ping: a key held as the window lost focus doesn't keep the paddle moving after resuming", held.paused && held.moved === 0, held);
  check("ping: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // a 2× screen: the tube has twice the pixels, drawn to its far edge; a click on the menu still starts a game
  const retina = await lib.newContext(browser, { deviceScaleFactor: 2 });
  const r = await lib.open(retina, base, "games/ping/");
  const size = await r.evaluate(() => ({ w: canvas.width, h: canvas.height }));
  await r.click('#menu .btn[data-mode="1"]'); await r.waitForTimeout(500);
  const shown = await r.evaluate(() => {
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data, wd = canvas.width;
    let lit = 0;   // the right paddle, 768-780 px across in the tube's own 800 × 500
    for (let y = Math.round(canvas.height * 0.4); y < canvas.height * 0.6; y++) for (let x = Math.round(wd * 0.962); x < wd * 0.972; x++) if (d[(y * wd + x) * 4] > 150) lit++;
    return { state: state, lit: lit };
  });
  check("ping, 2× screen: the tube has twice the pixels and is drawn to its far edge; the menu click starts a game",
    size.w === 1600 && size.h === 1000 && shown.state !== "menu" && shown.lit > 0, { size, shown });
  check("ping, 2× screen: frames draw with no page errors", r.errs.length === 0, r.errs);
  await r.close();
  await retina.close();

  await ctx.close();
};
