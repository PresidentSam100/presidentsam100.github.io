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
  // with Visual FX on (the default here) the verdict waits for the signal's run
  const settled = () => p.waitForFunction(() => !/Sending/.test(document.getElementById("status").textContent), null, { timeout: 5000 });

  // Level 1: click Reset, place the AND, press Enter
  await p.click("#resetBtn");
  await drag("AND");
  await p.keyboard.press("Enter"); await p.waitForTimeout(50); await settled();
  const a = await look();
  check("logicgate: after clicking Reset and placing a gate, Enter checks the circuit (doesn't reset it)", a.win && /lit/.test(a.status), a);

  // level 1 solved with the Check button, the banner's "Next level" by mouse,
  // then a wrong gate on level 2 and Enter
  await p.close();
  p = await lib.open(ctx, base, "games/logicgate/");
  await drag("AND"); await p.click("#checkBtn"); await settled(); await p.waitForTimeout(100);
  await p.click("#winNext"); await p.waitForTimeout(450);
  await drag("OR");
  await p.keyboard.press("Enter"); await p.waitForTimeout(50); await settled();
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

  // "press ⚡ Check (or Enter)": the Enter goes on a touch-only phone, the button stays
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const c2 = await lib.newContext(browser, opts);
    const q = await lib.open(c2, base, "games/logicgate/");
    await q.click('.mode-btn[data-mode="inputs"]'); await q.waitForTimeout(100);
    for (const id of await q.evaluate(() => [...document.querySelectorAll(".input.toggle")].map((n) => n.dataset.id)))
      await q.click('.input.toggle[data-id="' + id + '"]');
    await q.click("#helpBtn");
    const r = await q.evaluate((phone) => {
      const ks = [...document.querySelectorAll("#status kbd, #helpPanel kbd")];
      return { keys: ks.length, odd: ks.filter((k) => { const w = k.closest(".gs-keys"); return !w || (getComputedStyle(w).display === "none") !== phone; }).map((k) => k.parentElement.id || k.textContent),
        status: document.getElementById("status").innerText, help: document.querySelector("#helpPanel .leg-foot").innerText };
    }, label === "phone");
    const phone = label === "phone";
    check("logicgate, " + label + ": 'press ⚡ Check' " + (phone ? "drops its Enter" : "names Enter too") + ", in the status line and the gates panel",
      r.keys === 2 && r.odd.length === 0 && /press ⚡ Check/.test(r.status) && /Check/.test(r.help) && /Enter/.test(r.status + r.help) === !phone, r);
    await q.close();
    await c2.close();
  }

  // Esc with the "? Gates" panel open closes it (and stays); with nothing open it leaves
  {
    const c4 = await lib.newContext(browser);
    const q = await lib.open(c4, base, "games/logicgate/");
    await q.click("#helpBtn");
    const open = await q.evaluate(() => document.getElementById("helpPanel").classList.contains("show"));
    await q.keyboard.press("Escape"); await q.waitForTimeout(300);
    const after = { open: await q.evaluate(() => document.getElementById("helpPanel").classList.contains("show")), leaves: q.leaves };
    await q.keyboard.press("Escape"); await q.waitForTimeout(300);
    await lib.leftBy(q, 1);   // (counted when its request arrives: later on a busy machine)
    check("logicgate: Esc closes the '? Gates' panel without leaving; Esc again leaves", open && !after.open && after.leaves === 0 && q.leaves === 1, { open, after, leaves: q.leaves });
    check("logicgate (gates panel): no page errors", q.errs.length === 0, q.errs);
    await q.close(); await c4.close();
  }

  await splitLevels({ browser, base, check, lib });
};

// ---- the split levels (levels-split.js): one signal feeding several gates ----
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const NUM = {};
["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
  "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"].forEach((w, i) => { NUM[w] = i; });
const num = (s) => { s = String(s).toLowerCase(); return s in NUM ? NUM[s] : /^\d+$/.test(s) ? +s : NaN; };
const NEEDS = { AND: "both its inputs at 1", NAND: "at least one 0", OR: "at least one 1",
  NOR: "both its inputs at 0", XOR: "its two inputs to differ", XNOR: "its two inputs to match" };

// Read a hint back sentence by sentence: every sentence has to be one the
// generator writes, and what it says has to be true of the level. Returns
// the sentences that aren't (empty when the hint holds up).
function hintProblems(T, lv, mode) {
  const nodes = T.parse(lv.net), lab = T.labels(nodes), f = T.fans(nodes);
  const isGate = (j) => nodes[j].kind === "gate", byLab = {};
  Object.keys(lab).forEach((j) => { byLab[lab[j]] = +j; });
  const ins = (j) => [nodes[j].a, nodes[j].b].filter((x) => !isGate(x)).map((x) => lab[x]).sort().join("");
  const word = mode === "gates" ? "slot" : "gate";
  // "the slot fed by A and C" / "… A and another slot" / "… two other slots"
  // (or "The XOR fed by …"): the one node it can mean, or -1
  const find = (type, a, b, one) => {
    const key = a ? [a, b].sort().join("") : one || "";
    const hits = nodes.map((n, j) => j).filter((j) => isGate(j) && (!type || nodes[j].type === type) && ins(j) === key);
    return hits.length === 1 ? hits[0] : -1;
  };
  const REF = "(?:fed by ([A-Z]) and ([A-Z])|fed by ([A-Z]) and another " + word + "|fed by two other " + word + "s)";
  const r = mode === "gates" ? T.solveGates(lv.net, lv.palette) : T.solveInputs(lv.net);
  const kinds = lv.palette ? Object.keys(lv.palette).length : 0;
  const slots = nodes.filter((n) => n.kind === "gate").length, inputs = nodes.length - slots;
  const listed = (s) => s.replace(/ and /, ", ").split(", ");
  const bad = [];
  lv.hint.split(/(?<=\.)\s+/).forEach((s) => {
    let m, ok;
    const slotAt = (mm, k) => find(null, mm[k], mm[k + 1], mm[k + 2]);
    if (mode === "gates") {
      if ((m = /^(\w+) inputs, (\w+) slots, (?:no spares|(\w+) spare gates?)\.$/.exec(s)))
        ok = num(m[1]) === inputs && num(m[2]) === slots &&
          (m[3] ? num(m[3]) : 0) === Object.keys(lv.palette).reduce((a, k) => a + lv.palette[k], 0) - slots;
      else if ((m = new RegExp("^The slot " + REF + " feeds (\\w+) gates: one gate there has to suit them all\\.$").exec(s)) ||
          (m = new RegExp("^The slot " + REF + " splits (\\w+) ways\\.$").exec(s)) ||
          (m = new RegExp("^Whatever goes in the slot " + REF + " reaches (\\w+) gates\\.$").exec(s))) {
        const j = slotAt(m, 1); ok = j >= 0 && f[j] === num(m[4]) && f[j] > 1;
      } else if ((m = new RegExp("^Only one gate type in the tray can work in the slot " + REF + "\\.$").exec(s))) {
        const j = slotAt(m, 1); ok = j >= 0 && r.typesAt[j].length === 1;
      } else if ((m = new RegExp("^(\\w+) of the (\\w+) gate types in the tray can never work in the slot " + REF + "\\.$").exec(s))) {
        const j = slotAt(m, 3); ok = j >= 0 && num(m[2]) === kinds && kinds - r.typesAt[j].length === num(m[1]);
      } else if ((m = new RegExp("^Only (\\w+) of the (\\w+) gate types in the tray can work in the slot " + REF + "\\.$").exec(s))) {
        const j = slotAt(m, 3); ok = j >= 0 && num(m[2]) === kinds && r.typesAt[j].length === num(m[1]);
      } else if (/^Exactly one way of filling the slots lights the bulb\.$/.test(s)) ok = r.sols === 1;
      else if ((m = /^Just (\w+) ways of filling the slots light the bulb\.$/.exec(s))) ok = r.sols === num(m[1]) && r.sols <= 12;
      else if ((m = /^Inputs? ([A-Z](?:(?:, | and )[A-Z])*) splits? too\.$/.exec(s))) ok = listed(m[1]).every((L) => f[byLab[L]] > 1);
      else if ((m = /^(\w+) slots split in all\.$/.exec(s))) ok = nodes.filter((n, j) => isGate(j) && f[j] > 1).length === num(m[1]);
    } else {
      const GREF = "The (AND|OR|XOR|NAND|NOR|XNOR) " + REF;
      if ((m = /^(\w+) switches, (\w+) gates\.$/.exec(s))) ok = num(m[1]) === inputs && num(m[2]) === slots;
      else if ((m = /^Switch ([A-Z]) feeds (\w+) gates: set it once for all of them\.$/.exec(s)) || (m = /^Switch ([A-Z]) splits (\w+) ways\.$/.exec(s)) ||
          (m = /^Whatever you set ([A-Z]) to reaches (\w+) gates\.$/.exec(s))) ok = f[byLab[m[1]]] === num(m[2]) && num(m[2]) > 1;
      else if ((m = /^Switches ([A-Z](?:(?:, | and )[A-Z])*) each feed more than one gate\.$/.exec(s))) ok = listed(m[1]).every((L) => f[byLab[L]] > 1);
      else if ((m = /^Only one setting of ([A-Z]) can work\.$/.exec(s)) || (m = /^([A-Z]) has only one setting that can work\.$/.exec(s))) ok = r.pinned[byLab[m[1]]] === true;
      else if ((m = new RegExp("^" + GREF + " passes its answer to (\\w+) gates\\.$").exec(s)) || (m = new RegExp("^" + GREF + " splits (\\w+) ways\\.$").exec(s))) {
        const j = find(m[1], m[2], m[3], m[4]); ok = j >= 0 && f[j] === num(m[5]) && f[j] > 1;
      } else if ((m = /^The root (\w+) needs (.+)\.$/.exec(s))) ok = nodes[nodes.length - 1].type === m[1] && NEEDS[m[1]] === m[2];
      else if (/^Exactly one setting of the switches lights the bulb\.$/.test(s)) ok = r.sols === 1;
      else if ((m = /^Just (\w+) of the (\w+) settings light the bulb\.$/.exec(s))) ok = r.sols === num(m[1]) && r.total === num(m[2]) && r.sols <= 12;
    }
    if (!ok) bad.push(s);
  });
  return bad;
}

async function splitLevels({ browser, base, check, lib }) {
  const T = require(path.join(lib.ROOT, "_dev/tools/logicgate-split-levels.js"));
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(lib.ROOT, "games/logicgate/levels-split.js"), "utf8"), box);
  const S = box.window.LOGICGATE_SPLITS;
  // the hand-made openers teach the dot in their own words: their facts, checked one by one
  const A = (lab) => +Object.keys(lab).find((j) => lab[j] === "A");
  const feeds = (n, j) => n.filter((x) => x.kind === "gate" && (x.a === j || x.b === j)).map((x) => x.type).sort().join();
  const INTRO = {
    // "A's wire splits there: the same 1 goes into both gates. Fill all three slots"
    "Fork in the Road": (n, f, lab) => f[A(lab)] === 2 && n[A(lab)].value === 1 && n.filter((x) => x.kind === "gate").length === 3,
    // "The first slot's output splits two ways"
    "Echo": (n, f) => n[4].kind === "gate" && f[4] === 2 && n.slice(0, 4).every((x) => x.kind === "input"),
    // "switch A goes into both the AND and the XOR"
    "One Switch, Two Gates": (n, f, lab) => f[A(lab)] === 2 && feeds(n, A(lab)) === "AND,XOR",
    // "The OR's answer splits two ways, to the AND and to the XOR above. The AND needs it at 1"
    "Shared Answer": (n, f, lab, r, T) => {
      if (!(n[4].type === "OR" && f[4] === 2 && feeds(n, 4) === "AND,XOR")) return false;
      for (let m = 0; m < 16; m++) {   // every setting that lights the bulb has the OR at 1
        const v = n.map((x, j) => j < 4 ? (m >> j) & 1 : null);
        n.forEach((x, j) => { if (x.kind === "gate") v[j] = T.applyGate(x.type, v[x.a], v[x.b]); });
        if (v[n.length - 1] === 1 && v[4] !== 1) return false;
      }
      return true;
    },
  };
  for (const mode of ["gates", "inputs"]) {
    const bad = [];
    S[mode].forEach((lv, i) => {
      const where = mode + " " + (i + 41) + " " + lv.name + ": ";
      const nodes = T.parse(lv.net), f = T.fans(nodes);
      const okIdx = nodes.every((n, j) => n.kind === "input" || (n.a >= 0 && n.b >= 0 && n.a < j && n.b < j && n.a !== n.b)) &&
        nodes[nodes.length - 1].kind === "gate" && f.every((x, j) => j === nodes.length - 1 || x > 0);
      if (!okIdx) bad.push(where + "bad indexes");
      if (!f.some((x) => x > 1)) bad.push(where + "no split");
      if (T.depth(nodes) > T.MAX_DEPTH) bad.push(where + "deeper than " + T.MAX_DEPTH + " columns");
      const r = mode === "gates" ? T.solveGates(lv.net, lv.palette) : T.solveInputs(lv.net);
      if (!r.sols) bad.push(where + "unsolvable");
      if (INTRO[lv.name]) { if (!INTRO[lv.name](nodes, f, T.labels(nodes), r, T)) bad.push(where + "its hint's facts don't hold"); }
      else hintProblems(T, lv, mode).forEach((s) => bad.push(where + "untrue or unknown: " + s));
    });
    check("logicgate split levels (" + mode + "): valid, each with a split, solvable, and every hint sentence true", S[mode].length === 40 && bad.length === 0, bad.slice(0, 6));
    // the climb: circuits never shrink from one level to the next
    const sizes = S[mode].map((lv) => T.parse(lv.net).filter((n) => n.kind === "gate").length);
    check("logicgate split levels (" + mode + "): the circuits grow (never shrink) through the 40", sizes.every((x, i) => !i || x >= sizes[i - 1]), sizes.join(" "));
  }

  // in the browser: the names across all 80 per mode, the switch labels the
  // game draws (the hints name them), a seeded save opening level 41, and
  // the layout of a split level at desktop and phone widths
  const HOOK = ["LEVELS_GATES: LEVELS_GATES, LEVELS_INPUTS: LEVELS_INPUTS, applyGate: applyGate,",
    "LEVELS_GATES: LEVELS_GATES, LEVELS_INPUTS: LEVELS_INPUTS, applyGate: applyGate, nodes: function () { return nodes; },"];
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/logicgate/", { before: (pg) => lib.injectScript(pg, "games/logicgate/game.js", [HOOK]) });
  const names = await p.evaluate(() => ({ gates: __LOGICGATE_TEST__.LEVELS_GATES.map((l) => l.name), inputs: __LOGICGATE_TEST__.LEVELS_INPUTS.map((l) => l.name) }));
  const dup = (xs) => xs.filter((x, i) => xs.indexOf(x) !== i);
  check("logicgate: 80 levels in each mode, no name used twice", names.gates.length === 80 && names.inputs.length === 80 &&
    !dup(names.gates).length && !dup(names.inputs).length, { gates: dup(names.gates), inputs: dup(names.inputs) });

  // seeded save: 40 tree levels solved, so the game opens on the first split level
  const save = (mode, n) => p.evaluate(([mode, n]) => {
    const prog = { gates: { unlocked: 0, solved: [] }, inputs: { unlocked: 0, solved: [] } };
    prog[mode] = { unlocked: n, solved: Array.from({ length: n }, () => true) };
    localStorage.setItem("logicgate_progress", JSON.stringify(prog)); localStorage.setItem("logicgate_mode", mode);
  }, [mode, n]);
  await save("gates", 40); await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(300);
  const opened = await p.evaluate(() => ({ name: document.getElementById("levelName").textContent, juncs: document.querySelectorAll("#wires .junc").length }));
  check("logicgate: a save with the 40 tree levels solved opens level 41, the first split, with its junction dot",
    opened.name === "Level 41 — " + S.gates[0].name && opened.juncs >= 1, opened);

  // the game's switch labels are the tool's (the hints use the tool's)
  const labelBad = [];
  for (const mode of ["gates", "inputs"]) {
    await save(mode, 79); await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(300);
    for (const i of [40, 47, 55, 63, 71, 79]) {
      await p.evaluate((i) => document.querySelector('#levelDots .dot[data-idx="' + i + '"]').click(), i);
      const game = await p.evaluate(() => __LOGICGATE_TEST__.nodes().filter((n) => n.kind === "gate").map((n) => {
        const ns = __LOGICGATE_TEST__.nodes();
        return (n.type || "?") + ":" + n.inputs.map((c) => ns[c].kind === "input" ? ns[c].label : "g").sort().join("") + ":" + n.fan;
      }).sort());
      const lv = S[mode][i - 40], nodes = T.parse(lv.net), lab = T.labels(nodes), f = T.fans(nodes);
      const tool = nodes.map((n, j) => n.kind !== "gate" ? null : (mode === "gates" ? "?" : n.type) + ":" +
        [n.a, n.b].map((c) => nodes[c].kind === "input" ? lab[c] : "g").sort().join("") + ":" + (j === nodes.length - 1 ? 1 : f[j])).filter(Boolean).sort();
      if (JSON.stringify(game) !== JSON.stringify(tool)) labelBad.push(mode + " " + (i + 1));
    }
  }
  check("logicgate: the switch labels the game draws are the ones the split hints name", labelBad.length === 0, labelBad);
  check("logicgate (split levels): no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await ctx.close();

  // a split level's layout: no node boxes overlapping, a junction dot per split, no page scroll
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", { viewport: { width: 1200, height: 900 } }], ["phone", devices["Pixel 7"]]]) {
    const c2 = await lib.newContext(browser, opts);
    const q = await lib.open(c2, base, "games/logicgate/", { before: (pg) => lib.injectScript(pg, "games/logicgate/game.js", [HOOK]) });
    const res = [];
    for (const mode of ["gates", "inputs"]) {
      await q.evaluate((mode) => { localStorage.setItem("logicgate_progress", JSON.stringify({ gates: { unlocked: 79, solved: [] }, inputs: { unlocked: 79, solved: [] } })); localStorage.setItem("logicgate_mode", mode); }, mode);
      await q.reload({ waitUntil: "domcontentloaded" }); await q.waitForTimeout(300);
      for (let i = 40; i < 80; i++) {
        await q.evaluate((i) => document.querySelector('#levelDots .dot[data-idx="' + i + '"]').click(), i);
        res.push(await q.evaluate(([mode, i]) => {
          const els = [...document.querySelectorAll("#nodes .node")].map((e) => e.getBoundingClientRect());
          let ov = 0;
          for (let a = 0; a < els.length; a++) for (let b = a + 1; b < els.length; b++) {
            const A = els[a], B = els[b];
            if (Math.min(A.right, B.right) - Math.max(A.left, B.left) > 1 && Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top) > 1) ov++;
          }
          const splits = __LOGICGATE_TEST__.nodes().filter((n) => n.fan > 1).length;
          return { at: mode + " " + (i + 1), ov, juncs: document.querySelectorAll("#wires .junc").length, splits, scroll: document.documentElement.scrollWidth > innerWidth };
        }, [mode, i]));
      }
    }
    const bad = res.filter((r) => r.ov || r.juncs !== r.splits || !r.splits || r.scroll);
    check("logicgate, " + label + ": every split level lays out with no node boxes overlapping, a junction dot per split, no sideways scroll", bad.length === 0, bad.slice(0, 4));
    // the 80 level dots wrap inside the page
    const dots = await q.evaluate(() => {
      const ds = [...document.querySelectorAll("#levelDots .dot")].map((d) => d.getBoundingClientRect());
      let ov = 0;
      for (let a = 0; a < ds.length; a++) for (let b = a + 1; b < ds.length; b++)
        if (Math.min(ds[a].right, ds[b].right) - Math.max(ds[a].left, ds[b].left) > 1 && Math.min(ds[a].bottom, ds[b].bottom) - Math.max(ds[a].top, ds[b].top) > 1) ov++;
      return { n: ds.length, ov, out: ds.filter((d) => d.left < 0 || d.right > innerWidth).length, rows: new Set(ds.map((d) => Math.round(d.top))).size };
    });
    check("logicgate, " + label + ": the 80 level dots wrap cleanly (none overlap or run off the page)", dots.n === 80 && !dots.ov && !dots.out, dots);
    check("logicgate, " + label + " (layouts): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await c2.close();
  }

  await layoutStandards({ browser, base, check, lib });

  // the 40 tree levels lay out as they did before the splits came in (the
  // game.js of 360c7f9), wherever that layout met the spacing standard
  const OLD = require("child_process").execSync("git show 360c7f9:games/logicgate/game.js", { cwd: lib.ROOT, encoding: "utf8" });
  const place = async (width, old) => {
    const c3 = await lib.newContext(browser, { viewport: { width, height: 900 } });
    const q = await lib.open(c3, base, "games/logicgate/", { before: (pg) => old
      ? pg.route(/\/games\/logicgate\/game\.js$/, (r) => r.fulfill({ contentType: "text/javascript", body: OLD })) : undefined });
    const out = {};
    for (const mode of ["gates", "inputs"]) {
      await q.evaluate((mode) => { localStorage.setItem("logicgate_progress", JSON.stringify({ gates: { unlocked: 39, solved: [] }, inputs: { unlocked: 39, solved: [] } })); localStorage.setItem("logicgate_mode", mode); }, mode);
      await q.reload({ waitUntil: "domcontentloaded" }); await q.waitForTimeout(300);
      for (const i of [0, 4, 9, 15, 19, 27, 33, 39]) {
        await q.evaluate((i) => document.querySelector('#levelDots .dot[data-idx="' + i + '"]').click(), i);
        out[mode + i] = await q.evaluate(() => {
          const els = [...document.querySelectorAll("#nodes .node")];
          const rs = els.map((e) => e.getBoundingClientRect());
          let ov = 0;   // (boxes overlapping or closer than 6 px: the layout the game now replaces)
          for (let a = 0; a < rs.length; a++) for (let b = a + 1; b < rs.length; b++)
            if (Math.min(rs[a].right, rs[b].right) - Math.max(rs[a].left, rs[b].left) > -6 && Math.min(rs[a].bottom, rs[b].bottom) - Math.max(rs[a].top, rs[b].top) > -6) ov++;
          return { at: els.map((e) => e.getAttribute("style")).join("|"), wires: document.getElementById("wires").innerHTML.replace(/<circle[^>]*>/g, ""), ov };
        });
      }
    }
    await q.close(); await c3.close();
    return out;
  };
  for (const width of [1200, 390]) {
    const now = await place(width, false), then = await place(width, true);
    const changed = Object.keys(then).filter((k) => !then[k].ov && (now[k].at !== then[k].at || now[k].wires !== then[k].wires));
    check("logicgate, " + width + "px: the tree levels lay out as before the splits (where no boxes came within 6 px)", changed.length === 0, changed);
  }
}

// ---- layout standards, measured on the board as drawn ---------------------
// Every level of both modes at 1200 and 390 px: no wire runs through a box
// that isn't one of its own two ends; no two boxes within 6 px; at 390 the
// bulb is in sight without scrolling; and a split circuit's routed wires
// cross fewer times than the same circuits drawn with the plain tree layout.
// (Runs in the page: samples each wire every 3 px.)
function measure(minGap) {
  const boxes = [...document.querySelectorAll("#nodes .node")].map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
  const svg = document.getElementById("wires"), ctm = svg.getScreenCTM();
  const wires = [...svg.querySelectorAll("path.wire")].map((w) => {
    const len = w.getTotalLength(), pts = [];
    for (let s = 0; s < len; s += 3) pts.push(w.getPointAtLength(s));
    pts.push(w.getPointAtLength(len));
    return pts.map((q) => new DOMPoint(q.x, q.y).matrixTransform(ctm));
  });
  const inside = (p, b, d) => p.x > b.l - d && p.x < b.r + d && p.y > b.t - d && p.y < b.b + d;
  let hits = 0;
  wires.forEach((pts) => {
    const own = (b) => inside(pts[0], b, 4) || inside(pts[pts.length - 1], b, 4);
    if (pts.some((p) => boxes.some((b) => !own(b) && inside(p, b, -2)))) hits++;
  });
  const side = (a, b, c) => (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
  const cross = (p1, p2, p3, p4) => side(p3, p4, p1) * side(p3, p4, p2) < 0 && side(p1, p2, p3) * side(p1, p2, p4) < 0;
  const same = (p, q) => Math.abs(p.x - q.x) < 1 && Math.abs(p.y - q.y) < 1;
  let crossings = 0;
  for (let i = 0; i < wires.length; i++) for (let j = i + 1; j < wires.length; j++) {
    let A = wires[i], B = wires[j];
    if (same(A[0], B[0])) { A = A.slice(7); B = B.slice(7); }   // (a split's wires share their stub to the dot)
    for (let a = 0; a + 1 < A.length; a++) for (let b = 0; b + 1 < B.length; b++)
      if (Math.abs(A[a].x - B[b].x) < 8 && Math.abs(A[a].y - B[b].y) < 8 && cross(A[a], A[a + 1], B[b], B[b + 1])) crossings++;
  }
  let close = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (Math.min(a.r, b.r) - Math.max(a.l, b.l) > -minGap && Math.min(a.b, b.b) - Math.max(a.t, b.t) > -minGap) close++;
  }
  const bulb = document.querySelector("#nodes .node.bulb").getBoundingClientRect(), frame = document.getElementById("boardFrame").getBoundingClientRect();
  return { hits, crossings, close, bulbSeen: bulb.left >= frame.left - 1 && bulb.right <= frame.right + 1 && bulb.right <= innerWidth };
}

async function layoutStandards({ browser, base, check, lib }) {
  const PLAIN = ["if (nodes.some(function (n) { return n.fan > 1; })) splitLayout();", ""];   // (the tree layout for every circuit)
  const run = async (width, plain) => {
    const ctx = await lib.newContext(browser, { viewport: { width, height: 900 } });
    const p = await lib.open(ctx, base, "games/logicgate/", plain ? { before: (pg) => lib.injectScript(pg, "games/logicgate/game.js", [PLAIN]) } : undefined);
    const out = {};
    for (const mode of ["gates", "inputs"]) {
      await p.evaluate((mode) => { localStorage.setItem("logicgate_progress", JSON.stringify({ gates: { unlocked: 79, solved: [] }, inputs: { unlocked: 79, solved: [] } })); localStorage.setItem("logicgate_mode", mode); }, mode);
      await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(300);
      for (let i = plain ? 40 : 0; i < 80; i++) {
        await p.evaluate((i) => document.querySelector('#levelDots .dot[data-idx="' + i + '"]').click(), i);
        out[mode + " " + (i + 1)] = await p.evaluate(measure, 6);
      }
    }
    const errs = p.errs;
    await p.close(); await ctx.close();
    return { out, errs };
  };
  const split = (o) => Object.keys(o).filter((k) => +k.split(" ")[1] > 40);
  for (const width of [1200, 390]) {
    const { out, errs } = await run(width, false);
    const hits = Object.keys(out).filter((k) => out[k].hits), close = Object.keys(out).filter((k) => out[k].close);
    check("logicgate, " + width + "px: no wire runs through a box, on any of the 160 levels", hits.length === 0, hits.slice(0, 6).map((k) => k + ": " + out[k].hits));
    check("logicgate, " + width + "px: no two boxes within 6 px of each other, on any level", close.length === 0, close.slice(0, 6).map((k) => k + ": " + out[k].close));
    if (width === 390) {
      const hidden = Object.keys(out).filter((k) => !out[k].bulbSeen);
      check("logicgate, 390px: every level's bulb is in sight without scrolling the board", hidden.length === 0, hidden.slice(0, 6));
    } else {
      const plain = (await run(width, true)).out, sum = (o, ks) => ks.reduce((a, k) => a + o[k].crossings, 0);
      for (const mode of ["gates", "inputs"]) {
        const ks = split(out).filter((k) => k.startsWith(mode));
        check("logicgate, " + mode + ": the split levels' routed wires cross fewer times than the plain layout's", sum(out, ks) < sum(plain, ks), { routed: sum(out, ks), plain: sum(plain, ks) });
      }
    }
    check("logicgate, " + width + "px (standards): no page errors", errs.length === 0, errs);
  }

  // a phone board shrunk to fit still plays: a gate dragged onto a slot lands, a switch toggles
  const { devices } = require("@playwright/test");
  const ctx = await lib.newContext(browser, devices["Pixel 7"]);
  const p = await lib.open(ctx, base, "games/logicgate/");
  const big = async (mode) => {
    await p.evaluate((mode) => { localStorage.setItem("logicgate_progress", JSON.stringify({ gates: { unlocked: 79, solved: [] }, inputs: { unlocked: 79, solved: [] } })); localStorage.setItem("logicgate_mode", mode); }, mode);
    await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(300);
    await p.evaluate(() => document.querySelector('#levelDots .dot[data-idx="79"]').click());
    return p.evaluate(() => { const m = /scale\(([\d.]+)\)/.exec(document.getElementById("board").style.transform); return m ? +m[1] : 1; });
  };
  const sg = await big("gates");
  const slot = await (await p.$(".gate.slot")).boundingBox(), chip = await (await p.$(".chip:not(.empty)")).boundingBox();
  await p.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2); await p.mouse.down();
  await p.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(150);
  const landed = await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); const g = e && e.closest(".gate"); return !!g && g.classList.contains("filled"); }, [slot.x + slot.width / 2, slot.y + slot.height / 2]);
  check("logicgate, phone: on a board shrunk to fit, a gate dragged onto a slot lands in it", sg < 1 && landed, { scale: sg, landed });
  const si = await big("inputs");
  const sw = await (await p.$(".input.toggle")).boundingBox();
  await p.mouse.click(sw.x + sw.width / 2, sw.y + sw.height / 2); await p.waitForTimeout(100);
  const bit = await p.evaluate(() => document.querySelector(".input.toggle .bit").textContent);
  check("logicgate, phone: on a board shrunk to fit, tapping a switch sets it", si < 1 && bit === "0", { scale: si, bit });
  check("logicgate, phone (shrunk board): no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await ctx.close();
}
