// Text sits the same on every device. The marks and emoji a game's face
// doesn't have come from whatever face the device lends (Segoe UI Symbol,
// Cambria Math, Segoe UI Emoji here; others on a phone), each with its own
// heights, so (motion-toggle.js, "marks drawn the same on every device"):
// - the "← Games" arrow is a shape, its middle on the capitals' middle;
// - a button whose label is just ◀ ▶ ▲ ▼ ● ⟳ ⌫ and the like has the shape
//   laid over its middle;
// - a line of normal height holding a lent character keeps the height its
//   own face gives it. Checked by lending taller faces: a test face over the
//   lent ones with far more ascent and descent, first in every stack but
//   covering only the marks and emoji. No label's letters may move in their
//   box, and no box may change height (a control line outside the fix grows,
//   to show the taller face really arrived);
// - a phone keeps the page's type sizes on its side (text-size-adjust);
// - the pawn, the suits, the hearts that count lives and the homepage's ↗
//   ask to be drawn as text (U+FE0E), where a phone may draw an emoji;
// - the same emoji on every device: a picture a computer draws flat but a
//   phone in colour (⚙ 🖐 🏷 👁 ❤ ...) says which it is, colour (U+FE0F)
//   among other emoji, flat (U+FE0E) where it is a mark in a set colour;
// - every game's page and its "← Games" button start with a web font the
//   page loads, not the device's own face (Segoe UI here, San Francisco on
//   an iPhone, Roboto on Android: a different look on each).
module.exports = async ({ browser, base, check, lib }) => {
  const fs = require("fs"), path = require("path");
  const PICTURES = "⚙🖐🖼⛓⛏✖✈🏷⌨❤✂🏟👁🖱🛠⚠🕳☀↔↕↩❄";
  const bare = [];
  (function walk(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) { walk(p); continue; }
      if (!/\.(html|js|css)$/.test(f.name) || f.name === "motion-toggle.js") continue;
      fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
        if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;   // (comments name them freely)
        for (const m of line.matchAll(new RegExp("[" + PICTURES + "]", "gu"))) {
          const after = line.slice(m.index + m[0].length, m.index + m[0].length + 8);
          if (!/^(︎|️|\\uFE0[EF]|&#xFE0[EF];|\\FE0[EF])/i.test(after)) bare.push(path.relative(lib.ROOT, p).replace(/\\/g, "/") + ":" + (i + 1) + " " + m[0]);
        }
      });
    }
  })(path.join(lib.ROOT, "games"));
  check("every picture a computer draws flat but a phone in colour says which it is (U+FE0F or U+FE0E)", bare.length === 0, bare.slice(0, 20));

  const { devices } = require("@playwright/test");
  const ctx = await lib.newContext(browser, Object.assign({}, devices["iPhone 13"], { viewport: { width: 390, height: 664 } }));
  const MARKS = "◀▶▲▼▽●⊞⟳↻↺↶↷⌫";
  const RANGES = "U+2190-21FF, U+2200-22FF, U+2300-23FF, U+25A0-25FF, U+2600-27BF, U+27F0-27FF, U+2900-297F, U+2B00-2BFF, U+1F000-1FAFF, U+FE0F";
  const STRESS = ["Segoe UI Symbol", "Cambria Math", "Segoe UI Emoji"].map((f) =>
    `@font-face{font-family:"GS Stress";src:local("${f}");ascent-override:160%;descent-override:90%;line-gap-override:0%;unicode-range:${RANGES}}`).join("");

  // the page as it stands: its text size setting, the back arrow, the marked buttons
  const look = (p) => p.evaluate((MARKS) => {
    const tsa = getComputedStyle(document.documentElement).webkitTextSizeAdjust || getComputedStyle(document.documentElement).textSizeAdjust;
    const inner = (el) => { const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return { l: b.left + parseFloat(cs.borderLeftWidth), t: b.top + parseFloat(cs.borderTopWidth), r: b.right - parseFloat(cs.borderRightWidth), b: b.bottom - parseFloat(cs.borderBottomWidth) }; };
    let arrow = null;
    const back = document.querySelector(".nav-back-games");
    if (back) {
      const a = back.querySelector(".gs-back-arrow"), lab = back.querySelector(".gs-back-text");
      arrow = { text: back.textContent.trim(), shape: !!a };
      if (a && lab) {
        const mk = document.createElement("span");
        mk.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
        lab.appendChild(mk); const base = mk.getBoundingClientRect().bottom; lab.removeChild(mk);
        const c = document.createElement("canvas").getContext("2d"), cs = getComputedStyle(lab);
        c.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
        const r = a.getBoundingClientRect();
        arrow.off = +((r.top + r.bottom) / 2 - (base - c.measureText("H").actualBoundingBoxAscent / 2)).toFixed(2);
      }
    }
    const marks = [];
    for (const b of document.querySelectorAll("button")) {
      const t = b.textContent.trim();
      if (t.length !== 1 || !MARKS.includes(t) || !b.getBoundingClientRect().width || b.hasAttribute("data-gs-key")) continue;
      const m = b.querySelector(".gs-mark");
      if (!m) { marks.push({ t, shape: false }); continue; }
      const cs = getComputedStyle(m, "::before"), box = inner(b);
      const x = box.l + parseFloat(cs.left) + parseFloat(cs.marginLeft) + parseFloat(cs.width) / 2;
      const y = box.t + parseFloat(cs.top) + parseFloat(cs.marginTop) + parseFloat(cs.height) / 2;
      marks.push({ t, shape: cs.content !== "none" && parseFloat(cs.width) > 0, off: +Math.max(Math.abs(x - (box.l + box.r) / 2), Math.abs(y - (box.t + box.b) / 2)).toFixed(2) });
    }
    // the web fonts the page asks for, and the first face of its text and its back link
    const urls = Array.from(document.querySelectorAll('link[href*="fonts.googleapis"]')).map((l) => l.href);
    for (const sh of Array.from(document.styleSheets)) { try { for (const r of Array.from(sh.cssRules)) if (r.href && /fonts\.googleapis/.test(r.href)) urls.push(r.href); } catch (e) {} }
    const fams = new Set();
    urls.forEach((u) => { for (const m of decodeURIComponent(u).matchAll(/family=([^:&]+)/g)) fams.add(m[1].replace(/\+/g, " ")); });
    const first = (el) => getComputedStyle(el).fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
    const web = { body: first(document.body), back: back ? first(back) : null, loads: [...fams] };
    web.ok = fams.has(web.body) && (!back || fams.has(web.back));
    return { tsa, arrow, marks, web };
  }, MARKS);

  // lend taller faces: whose letters move in their box, or whose box grows?
  const lent = (p) => p.evaluate(async (STRESS) => {
    const SYM = /[←-⏿■-➿⟰-⟿⤀-⥿⬀-⯿️]|[\u{1F000}-\u{1FAFF}]/u;
    const items = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode());) {
      const i = n.data.search(/[A-Za-z0-9]/), el = n.parentElement;
      if (i < 0 || !el || el.closest("script,style")) continue;
      const box = el.closest("button,a,summary,label,li,p,h1,h2,h3,span,div,b") || el;
      if (SYM.test(box.textContent)) items.push({ n, i, box });
    }
    // (the control: a line of normal height out of the fix's reach, in a shadow root)
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:-9999px;top:0";
    document.body.appendChild(host);
    const ctl = document.createElement("div");
    ctl.style.cssText = "font:16px Arial;line-height:normal";
    ctl.textContent = "💡 Hint";
    host.attachShadow({ mode: "open" }).appendChild(ctl);
    const at = () => items.map(({ n, i, box }) => {
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
      const a = r.getBoundingClientRect(), b = box.getBoundingClientRect();
      return a.width ? [a.top - b.top, b.height] : null;
    });
    const before = at(), ctl0 = ctl.getBoundingClientRect().height;
    const st = document.createElement("style"); st.textContent = STRESS; document.head.appendChild(st);
    const all = Array.from(document.querySelectorAll("body, body *")).concat([ctl]);
    const fam = all.map((e) => getComputedStyle(e).fontFamily);
    all.forEach((e, k) => e.style.setProperty("font-family", '"GS Stress", ' + fam[k], "important"));
    await document.fonts.ready; await new Promise((r) => setTimeout(r, 150));
    const after = at(), grew = ctl.getBoundingClientRect().height - ctl0, moved = [];
    items.forEach((it, k) => {
      if (!before[k] || !after[k]) return;
      const d = after[k][0] - before[k][0], dh = after[k][1] - before[k][1];
      if (Math.abs(d) > 0.5 || Math.abs(dh) > 0.5)
        moved.push(it.box.tagName.toLowerCase() + (it.box.id ? "#" + it.box.id : "") + ' "' + it.box.textContent.trim().replace(/\s+/g, " ").slice(0, 24) + '" ' + d.toFixed(1) + " / " + dh.toFixed(1));
    });
    // (put back: the same page goes on to be played)
    st.remove(); host.remove();
    all.forEach((e) => e.style.removeProperty("font-family"));
    return { grew: +grew.toFixed(1), moved: [...new Set(moved)] };
  }, STRESS);

  const SHAPED = (l) => l.marks.every((m) => m.shape && m.off <= 0.5);
  const pages = lib.gamePages();
  const bad = { tsa: [], arrow: [], marks: [], lent: [], control: [], web: [] };
  for (const g of pages) {
    const p = await lib.open(ctx, base, "games/" + g);
    const l = await look(p);
    if (l.tsa !== "100%") bad.tsa.push(g + " " + l.tsa);
    if (!l.arrow || !l.arrow.shape || /←/.test(l.arrow.text) || !(Math.abs(l.arrow.off) <= 1)) bad.arrow.push(g + " " + JSON.stringify(l.arrow));
    if (!SHAPED(l)) bad.marks.push(g + " " + JSON.stringify(l.marks));
    if (!l.web.ok) bad.web.push(g + " " + JSON.stringify(l.web));
    const s = await lent(p);
    if (s.moved.length) bad.lent.push(g + ": " + s.moved.slice(0, 4).join(", "));
    if (!(s.grew >= 3)) bad.control.push(g + " " + s.grew);
    check(g + ": no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }
  for (const [name, url] of [["the games page", "games/"], ["the homepage", ""]]) {
    const p = await lib.open(ctx, base, url, { waitCorner: false });
    const l = await look(p), s = await lent(p);
    if (l.tsa !== "100%") bad.tsa.push(name + " " + l.tsa);
    if (s.moved.length) bad.lent.push(name + ": " + s.moved.join(", "));
    if (!(s.grew >= 3)) bad.control.push(name + " " + s.grew);
    await p.close();
  }
  const n = pages.length + 2;
  check("every page (" + n + ") keeps its type sizes when a phone turns on its side (text-size-adjust 100%)", bad.tsa.length === 0, bad.tsa);
  check("every game's \"← Games\" arrow is a shape, not a lent character, its middle within 1px of the capitals' middle (" + pages.length + " pages)", bad.arrow.length === 0, bad.arrow);
  check("every game's page and its \"← Games\" button start with a web font the page loads, not the device's own (" + pages.length + " pages)", bad.web.length === 0, bad.web);
  check("every button that is just ◀ ▶ ▲ ▼ ● ⌫ or the like on a first screen has its shape laid over the button's middle (within 0.5px)", bad.marks.length === 0, bad.marks);
  check("with taller faces lent for the marks and emoji, no label's letters move in their box and no box changes height (" + n + " pages)", bad.lent.length === 0, bad.lent);
  check("(the taller lent faces arrive: a control line outside the fix grows by 3px or more on every page)", bad.control.length === 0, bad.control);

  // ---- the touch pads that show only in play
  const PADS = [
    ["abyss", "abyss/", (p) => p.evaluate(() => Abyss.start("descent"))],
    ["demolition-row", "demolition-row/", (p) => p.evaluate(() => { sel.mode = "endless"; startGame(); })],
    ["slither", "slither/", (p) => p.click("#play-btn")],
    ["ping", "ping/", (p) => p.click('#menu .btn[data-mode="1"]')],
  ];
  for (const [g, path, play] of PADS) {
    const p = await lib.open(ctx, base, "games/" + path);
    await play(p);
    await p.waitForTimeout(500);
    const l = await look(p), s = await lent(p);
    check(g + ", in play: the pad's " + l.marks.length + " buttons each have their shape over their middle, and lent faces move no label",
      l.marks.length >= 2 && SHAPED(l) && s.moved.length === 0 && s.grew >= 3, { marks: l.marks, moved: s.moved, grew: s.grew });
    await p.close();
  }

  // ---- drawn as text, where a phone may draw an emoji
  const VS = "︎";
  let p = await lib.open(ctx, base, "games/chess/");
  const pawns = await p.evaluate(() => Array.from(document.querySelectorAll(".sq .pc, .sq span")).map((e) => e.textContent).filter((t) => t.startsWith("♟")));
  const chessTitle = await p.evaluate(() => document.querySelector("h1").textContent);
  check("chess: every pawn on the board, and the ♟ in the title, ask to be drawn as text", pawns.length === 16 && pawns.every((t) => t === "♟" + VS) && chessTitle.startsWith("♟" + VS), { pawns: pawns.length, sample: pawns[0] && [...pawns[0]].map((c) => c.codePointAt(0).toString(16)), chessTitle });
  await p.close();
  p = await lib.open(ctx, base, "games/klondike/");
  await p.waitForTimeout(1500);
  const suits = await p.evaluate(() => Array.from(document.querySelectorAll("#field .card:not(.down) .pip, #field .card:not(.down) .idx small")).map((e) => e.textContent));
  check("klondike: the suits on the cards face up ask to be drawn as text", suits.length >= 14 && suits.every((t) => /^[♠♥♦♣]︎$/.test(t)), suits.slice(0, 6));
  await p.close();
  for (const [g, sel] of [["metazac", "#lives-val"], ["typetwo", "#lives"]]) {
    p = await lib.open(ctx, base, "games/" + g + "/");
    const t = await p.evaluate((sel) => document.querySelector(sel).textContent, sel);
    check(g + ": the hearts that count lives ask to be drawn as text", t === ("♥" + VS).repeat(3), [...t].map((c) => c.codePointAt(0).toString(16)));
    await p.close();
  }
  p = await lib.open(ctx, base, "", { waitCorner: false });
  const arrows = await p.evaluate(() => Array.from(document.querySelectorAll("a")).map((a) => a.textContent).filter((t) => t.includes("↗")));
  check("the homepage: each link's ↗ asks to be drawn as text", arrows.length >= 7 && arrows.every((t) => t.includes("↗" + VS)), arrows);
  await p.close();
  await ctx.close();
};
