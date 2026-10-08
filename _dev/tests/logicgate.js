// LogicGate: Enter checks the circuit even after a mouse click left a button
// focused (Reset, or the win banner's "Next level"), and a hint that names
// the root gate names the right one.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  let p = await lib.open(ctx, base, "games/logicgate/");
  // drag a gate from the tray into the first empty slot, with the mouse
  const drag = async (type) => {
    const c = await (await p.$('.chip[data-type="' + type + '"]')).boundingBox();
    const s = await (await p.$(".gate.slot")).boundingBox();
    await p.mouse.move(c.x + c.width / 2, c.y + c.height / 2); await p.mouse.down();
    await p.mouse.move(s.x + s.width / 2, s.y + s.height / 2, { steps: 5 }); await p.mouse.up();
    await p.waitForTimeout(80);
  };
  const look = () => p.evaluate(() => ({ level: document.getElementById("levelName").textContent, status: document.getElementById("status").textContent,
    win: document.getElementById("winBanner").classList.contains("show") }));

  // Level 1: click Reset, place the AND, press Enter
  await p.click("#resetBtn");
  await drag("AND");
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const a = await look();
  check("logicgate: after clicking Reset and placing a gate, Enter checks the circuit (doesn't reset it)", a.win && /lit/.test(a.status), a);

  // level 1 solved with the Check button, the banner's "Next level" by mouse,
  // then a wrong gate on level 2 and Enter
  await p.close();
  p = await lib.open(ctx, base, "games/logicgate/");
  await drag("AND"); await p.click("#checkBtn"); await p.waitForTimeout(450);
  await p.click("#winNext"); await p.waitForTimeout(450);
  await drag("OR");
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const b = await look();
  check("logicgate: after the banner's Next level, Enter checks this level (doesn't skip to the next)",
    /^Level 2/.test(b.level) && /stayed dark/.test(b.status), b);

  const bad = await p.evaluate(() => {
    const T = __LOGICGATE_TEST__, out = [];
    T.LEVELS_GATES.concat(T.LEVELS_INPUTS).forEach((lv) => {
      const m = /\broot (AND|OR|XOR|NAND|NOR|XNOR)\b/.exec(lv.hint);
      if (m && lv.tree.type !== m[1]) out.push(lv.name + ": says " + m[1] + ", is " + lv.tree.type);
    });
    return out;
  });
  check("logicgate: a hint that names the root gate names the right one", bad.length === 0, bad);
  check("logicgate: no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await ctx.close();
};
