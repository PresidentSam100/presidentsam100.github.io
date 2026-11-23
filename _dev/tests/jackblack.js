// JackBlack (blackjack in a sunken liner's card room): the rules as casinos
// deal them, the bets and the keys, what's saved, and what leaving costs.
// Cards are stacked on the shoe through the game's test hook, so every hand
// here is a known one.
module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  const ctx = await lib.newContext(browser);
  const idle = (p) => p.waitForFunction(() => !JackBlack.busy(), null, { timeout: 10000 });
  const box = (p) => p.evaluate(() => (document.querySelector(".gs-dialog h2") || {}).textContent || null);
  const now = (p) => p.evaluate(() => {
    const t = JackBlack.table();
    return { state: JackBlack.state(), phase: t && t.phase, stake: t && t.stake, bet: JackBlack.bet(), hands: t ? t.hands.map((h) => h.result || h.cards.length) : [],
      banner: document.getElementById("banner").textContent, shown: document.getElementById("hud-stake").textContent };
  });
  // sit down at the open table, with these cards next off the shoe, and deal
  const dealt = async (p, cards) => {
    await p.keyboard.press("Enter"); await p.waitForTimeout(150);
    await p.evaluate((c) => JackBlack.stack(c), cards);
    await p.keyboard.press("Enter"); await idle(p);
  };

  // ---- the rules, straight from the table (no page in them)
  let p = await lib.open(ctx, base, "games/jackblack/");
  const rules = await p.evaluate(() => {
    const R = JackBlackRules, bad = [];
    const C = (s) => s.split(" ").map((x) => ({ r: { A: 1, T: 10, J: 11, Q: 12, K: 13 }[x] || +x, s: 0 }));
    const T = (cards, opts) => new R.Table(Object.assign({ shoe: C(cards).reverse(), reshuffle: false }, opts));
    const ok = (name, cond, got) => { if (!cond) bad.push(name + " -> " + JSON.stringify(got)); };
    let t = T("A 9 K 7"); t.deal(100); ok("a natural pays 3 to 2", t.phase === "done" && t.stake === 1150, t.stake);
    t = T("A K K A"); t.deal(100); ok("natural against natural pushes", t.stake === 1000 && t.hands[0].result === "push", t.stake);
    t = T("T K 9 A"); t.deal(100); ok("the dealer's natural under a ten wins at once", t.phase === "done" && t.stake === 900, t.stake);
    t = T("T A 9 K"); t.deal(100); ok("an ace up offers insurance", t.phase === "insure", t.phase);
    t.insure(true); ok("insurance pays 2 to 1 against a natural", t.stake === 1000, t.stake);
    t = T("T A 9 6 5"); t.deal(100); t.insure(false); t.stand();
    ok("the dealer stands on a soft 17", t.dealer.length === 2 && t.hands[0].result === "win", t.dealer.length);
    t = T("T 6 7 T 5"); t.deal(100); t.stand(); ok("the dealer draws to 17", t.dealer.length === 3 && t.stake === 900, t.dealer.length);
    t = T("T 9 6 7 K"); t.deal(100); t.hit(); ok("a bust loses without the dealer drawing", t.hands[0].result === "bust" && t.dealer.length === 2, t.hands[0].result);
    t = T("5 T 6 7 T"); t.deal(100); t.double(); ok("a double takes one card on twice the bet", t.hands[0].cards.length === 3 && t.stake === 1200, t.stake);
    t = T("A 6 A T K 9 4"); t.deal(100); t.split();
    ok("split aces take one card each, and 21 on one pays even money", t.phase === "done" && t.hands[0].paid === 200 && t.hands[1].result === "push" && t.stake === 1100, t.stake);
    t = T("8 6 8 T 8 8 8 8 2 3 4 5"); t.deal(10); t.split(); t.split(); t.split(); ok("four hands at most", t.hands.length === 4 && !t.can("split"), t.hands.length);
    t = T("K 6 Q T 5"); t.deal(100); ok("any two ten-cards are a pair", t.can("split"), false);
    const a = R.makeShoe(R.seeded(42)), b = R.makeShoe(R.seeded(42));
    ok("a seeded shoe is the same every time", JSON.stringify(a) === JSON.stringify(b) && a.length === 312, a.length);
    // random legal play: every round ends and the stake moves by exactly the net
    const rng = R.seeded(2026), tb = new R.Table({ rng: rng, stake: 1e9 });
    for (let i = 0; i < 3000; i++) {
      const before = tb.stake; tb.deal(10 * (1 + Math.floor(rng() * 20)));
      if (tb.phase === "insure") tb.insure(rng() < 0.5);
      for (let g = 0; tb.phase === "play" && g < 60; g++) { const acts = ["hit", "stand", "double", "split"].filter((x) => tb.can(x)); tb[acts[Math.floor(rng() * acts.length)]](); }
      if (tb.phase !== "done" || tb.stake - before !== tb.net() || tb.stake % 5) { bad.push("random round " + i + " -> " + JSON.stringify([tb.phase, tb.stake - before, tb.net()])); break; }
    }
    return bad;
  });
  check("jackblack rules: naturals, insurance, the dealer's 17, doubles, splits and split aces pay as a casino pays; 3,000 random rounds each balance to the chip", rules.length === 0, rules);

  // ---- betting: the chips' keys add to the bet, C clears it, and only Enter deals
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const b0 = await now(p);
  await p.keyboard.press("1"); await p.keyboard.press("3"); const b1 = await now(p);
  await p.keyboard.press("c"); const b2 = await now(p);
  await p.keyboard.press("Enter"); await p.waitForTimeout(200); const b3 = await now(p);     // no bet: no deal
  await p.keyboard.press("2"); await p.keyboard.press("2"); const b4 = await now(p);
  const caps = await p.evaluate(() => [...document.querySelectorAll("#chips .cap")].map((e) => e.getAttribute("data-gs-key")).concat(["clear", "deal", "leave"].map((id) => document.getElementById(id).getAttribute("data-gs-key"))).join(" "));
  check("jackblack: at the table 1 2 3 4 add a chip and C clears; a number never deals, and Enter won't with no bet down; each button shows its key",
    b0.state === "table" && b0.bet === 50 && b1.bet === 160 && b1.phase === "bet" && b2.bet === 0 && b3.phase === "bet" && b4.bet === 100 && caps === "1 2 3 4 C Space or Enter ⌫", { b0, b1, b2, b3, b4, caps });

  // ---- a hand: H hits, S stands; the win is paid and the stake saved
  await p.evaluate(() => JackBlack.stack("T 6 5 T 4 9"));        // you 15, dealer 16; hit a 4 = 19; dealer draws a 9 and busts
  await p.keyboard.press("Enter"); await idle(p);
  const h0 = await now(p);
  const acts = await p.evaluate(() => ["hit", "stand", "double", "split"].map((a) => { const e = document.getElementById("act-" + a); return e.getAttribute("data-gs-key") + (e.disabled ? "-" : ""); }).join(" "));
  await p.keyboard.press("h"); await idle(p); const h1 = await now(p);
  await p.keyboard.press("s"); await idle(p); const h2 = await now(p);
  const saved = await p.evaluate(() => localStorage.getItem("jackblack_stake"));
  check("jackblack: H hits and S stands (Split is off without a pair); a dealer bust pays the bet, and the stake is saved",
    h0.phase === "play" && h0.stake === 900 && acts === "H S D X-" && h1.hands[0] === 3 && h1.phase === "play" && h2.phase === "done" && h2.hands[0] === "win" && h2.stake === 1100 && h2.shown === "1,100" && saved === "1100" && /win/i.test(h2.banner),
    { h0, acts, h1, h2, saved });

  // ---- D doubles; X splits a pair into two hands played in turn
  await p.evaluate(() => JackBlack.stack("5 T 6 7 T"));          // 11 against 17; the double draws a ten
  await p.keyboard.press("Enter"); await idle(p);
  await p.keyboard.press("d"); await idle(p); const d1 = await now(p);
  await p.evaluate(() => JackBlack.stack("8 6 8 T 3 2 T 9 5"));  // a pair of eights
  await p.keyboard.press("Enter"); await idle(p);
  await p.keyboard.press("x"); await idle(p);
  const x1 = await p.evaluate(() => ({ hands: document.querySelectorAll("#hands .hand").length, active: [...document.querySelectorAll("#hands .hand")].findIndex((h) => h.classList.contains("active")) }));
  await p.keyboard.press("h"); await idle(p);                     // 8 3 + ten = 21: on to the second by itself
  const x2 = await p.evaluate(() => [...document.querySelectorAll("#hands .hand")].findIndex((h) => h.classList.contains("active")));
  await p.keyboard.press("s"); await idle(p); const x3 = await now(p);
  check("jackblack: D doubles (one card, twice the bet); X splits a pair, and the hands are played and paid one by one",
    d1.phase === "done" && d1.hands[0] === "win" && d1.stake === 1300 && x1.hands === 2 && x1.active === 0 && x2 === 1 && x3.phase === "done" && x3.hands.join() === "win,win" && x3.stake === 1500, { d1, x1, x2, x3 });

  // ---- insurance: Y takes it, and it pays when the dealer has the natural
  await p.evaluate(() => JackBlack.stack("T A 9 K"));
  await p.keyboard.press("Enter"); await idle(p);
  const i0 = await p.evaluate(() => ({ phase: JackBlack.table().phase, shown: !document.getElementById("insure").hidden, cost: document.getElementById("ins-cost").textContent,
    caps: document.getElementById("ins-yes").getAttribute("data-gs-key") + document.getElementById("ins-no").getAttribute("data-gs-key") }));
  await p.keyboard.press("y"); await idle(p); const i1 = await now(p);
  check("jackblack: an ace up asks about insurance (Y / N, half the bet); taken against a natural, the round nets nothing",
    i0.phase === "insure" && i0.shown && i0.cost === "50" && i0.caps === "YN" && i1.phase === "done" && i1.stake === 1500, { i0, i1 });

  // ---- a natural is a JackBlack and pays 3 to 2
  await p.evaluate(() => JackBlack.stack("A 9 K 7"));
  await p.keyboard.press("Enter"); await idle(p); const n1 = await now(p);
  check("jackblack: an ace and a ten-card on the deal is a JackBlack, paid 3 to 2 on the spot", n1.phase === "done" && n1.hands[0] === "natural" && n1.stake === 1650 && /JackBlack/.test(n1.banner), n1);

  // ---- leaving: mid-hand both ways out ask; between hands Backspace just goes, and the stake is there on the way back
  await p.evaluate(() => JackBlack.stack("T 6 5 T 4 9"));
  await p.keyboard.press("Enter"); await idle(p);
  await p.keyboard.press("Backspace"); await p.waitForTimeout(300); const q1 = await box(p);
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  await p.keyboard.press("Escape"); await p.waitForTimeout(300); const q2 = await box(p);
  await p.keyboard.press("Enter"); await p.waitForTimeout(300); const q3 = { box: await box(p), leaves: p.leaves, phase: (await now(p)).phase };
  await p.keyboard.press("s"); await idle(p);
  await p.keyboard.press("Backspace"); await p.waitForTimeout(300);
  const q4 = await p.evaluate(() => ({ state: JackBlack.state(), small: document.getElementById("table-small").textContent, box: !!document.querySelector(".gs-dialog") }));
  check("jackblack: mid-hand Backspace asks 'Leave the table?' and Esc 'Leave this game?' (Enter plays on); between hands Backspace goes to the modes, which show the stake kept",
    q1 === "Leave the table?" && q2 === "Leave this game?" && !q3.box && q3.leaves === 0 && q3.phase === "play" && q4.state === "menu" && !q4.box && /1,[0-9]{3}/.test(q4.small), { q1, q2, q3, q4 });
  check("jackblack: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- cleaned out: the last chips lost bring the card up; Enter is a fresh 1,000
  p = await lib.open(ctx, base, "games/jackblack/", { before: (pg) => pg.addInitScript(() => { try { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem("jackblack_stake", "50"); } } catch (e) {} }) });
  await p.evaluate(() => { localStorage.setItem("jackblack_stake", "50"); });
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const o0 = await now(p);
  await p.evaluate(() => JackBlack.stack("T 9 6 7 K"));           // 16 against 16; the hit busts
  await p.keyboard.press("Enter"); await idle(p);
  await p.keyboard.press("h"); await idle(p);
  await p.waitForFunction(() => JackBlack.state() === "over", null, { timeout: 5000 }).catch(() => {});
  const o1 = await p.evaluate(() => ({ state: JackBlack.state(), title: document.getElementById("over-title").textContent, again: document.getElementById("again").getAttribute("data-gs-key"),
    menu: document.getElementById("to-menu").getAttribute("data-gs-key"), saved: localStorage.getItem("jackblack_stake") }));
  await p.keyboard.press("Enter"); await p.waitForTimeout(200);
  const o2 = await now(p);
  check("jackblack: a saved stake of 50 is what you sit down with; losing it all brings up 'Cleaned out' (Space or Enter and ⌫ on its buttons), and Enter is a fresh 1,000",
    o0.stake === 50 && o0.bet === 50 && o1.state === "over" && o1.title === "Cleaned out" && o1.again === "Space or Enter" && o1.menu === "⌫" && o1.saved === null && o2.state === "table" && o2.stake === 1000, { o0, o1, o2 });
  await p.close();

  // ---- the Daily shoe: the same cards for everyone, ten hands, one recorded result
  const firstCards = async () => {
    const q = await lib.open(ctx, base, "games/jackblack/");
    await q.keyboard.press("2"); await q.keyboard.press("Enter"); await q.waitForTimeout(150);
    await q.keyboard.press("Enter"); await idle(q);
    const c = await q.evaluate(() => JackBlack.table().hands[0].cards.concat(JackBlack.table().dealer).map((x) => x.r + "." + x.s).join(" "));
    return { q, c };
  };
  const A = await firstCards(), B = await firstCards();
  await B.q.close();
  p = A.q;
  // play the ten hands out: stand on everything, declining insurance
  for (let i = 0; i < 60; i++) {
    const s = await p.evaluate(() => ({ state: JackBlack.state(), phase: JackBlack.table() && JackBlack.table().phase, hands: JackBlack.hands() }));
    if (s.state !== "table" || (s.hands >= 10 && s.phase === "done")) break;       // (the tenth is settled: the card comes up by itself)
    if (s.phase === "insure") await p.keyboard.press("n");
    else if (s.phase === "play") await p.keyboard.press("s");
    else await p.keyboard.press("Enter");
    await idle(p); await p.waitForTimeout(60);
  }
  await p.waitForFunction(() => JackBlack.state() === "over", null, { timeout: 20000 }).catch(() => {});
  const d = await p.evaluate(() => ({ state: JackBlack.state(), hands: JackBlack.hands(), saved: JSON.parse(localStorage.getItem("jackblack_daily") || "null"), share: JackBlack.shareText(),
    shareShown: !document.getElementById("share").hidden, stats: document.getElementById("over-stats").textContent, stake: JackBlack.table().stake }));
  check("jackblack daily: two visits are dealt the same first hand; ten hands end the run, and the result is recorded with a line to share",
    A.c === B.c && d.state === "over" && d.hands === 10 && d.saved && d.saved.done && d.saved.stake === d.stake && d.saved.marks.length === 10 && d.shareShown &&
    /^JackBlack Daily #\d+: [\d,]+ from 1,000\n/.test(d.share) && /^Daily #/.test(d.stats), { same: A.c === B.c, d });
  await p.keyboard.press("Enter"); await p.waitForTimeout(200);
  await p.keyboard.press("Enter"); await idle(p);
  const again = await p.evaluate(() => ({ cards: JackBlack.table().hands[0].cards.concat(JackBlack.table().dealer).map((x) => x.r + "." + x.s).join(" "), guard: GameShell.leaveActive() }));
  check("jackblack daily: playing it again deals the same shoe, and a run under way asks before leaving", again.cards === A.c && again.guard === true, again);
  check("jackblack daily: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- Visual FX: on, a card slides in from the shoe, turning as it comes; off, it
  // still comes from the shoe (where it goes is play), straight
  {
    const q = await lib.open(ctx, base, "games/jackblack/");
    const anim = async () => {
      await q.evaluate(() => JackBlack.stack("T 6 5 T 4 9"));
      await q.keyboard.press("Enter");
      // (read as the card comes in, in one look: on a busy machine its .in can
      // be gone again by the time a second look is taken)
      const a = await q.waitForFunction(() => {
        const c = document.querySelector("#hands .pc.in");
        if (!c) return false;
        const s = c.getAnimations().find((x) => !x.animationName);
        return { css: getComputedStyle(c).animationName, script: s ? s.effect.getKeyframes()[0].transform : null, ms: s ? s.effect.getComputedTiming().endTime : 0 };
      }, null, { timeout: 5000, polling: "raf" }).then((h) => h.jsonValue(), () => null);
      const t0 = Date.now(); await idle(q);
      return { a, ms: Date.now() - t0 };
    };
    await q.keyboard.press("Enter"); await q.waitForTimeout(150);
    const on = await anim();
    await q.keyboard.press("s"); await idle(q);
    await q.click(".rm-toggle"); await q.waitForTimeout(150);
    const off = await anim();
    // (the dealer's bob, switched off on the way: stopped where it had got to, not moving)
    const art = await q.evaluate(() => ({ dealer: !!document.querySelector("#dealer .head"), cards: document.querySelectorAll("#felt .pc").length,
      bob: document.getElementById("dealer").getAnimations().map((a) => a.animationName + ":" + a.playState).join() || "none" }));
    check("jackblack: with Visual FX on a card slides in from the shoe, turning; off, it still comes from the shoe as long, straight, the dealer holds still (switched off on the way, his bob stopped where it was), and the table is all still there",
      !!on.a && on.a.css === "jb-deal" && !!off.a && off.a.script === "translate(130px, -150px)" && off.a.ms === 300 && art.dealer && art.cards === 4 && art.bob === "jb-bob:paused", { on, off, art });
    await q.close();
  }

  // ---- the look: the table is wine-red baize in a green room (it was green, and read too much like Hash's felt)
  {
    const q = await lib.open(ctx, base, "games/jackblack/");
    const look = await q.evaluate(() => {
      const rgb = (s) => { const d = document.createElement("i"); d.style.color = s; document.body.appendChild(d); const m = getComputedStyle(d).color.match(/[\d.]+/g).map(Number); d.remove(); return m; };
      const css = getComputedStyle(document.documentElement);
      return { baize: rgb(css.getPropertyValue("--baize").trim()), wall: rgb(css.getPropertyValue("--hull").trim()), felt: getComputedStyle(document.getElementById("felt")).backgroundImage.length > 20 };
    });
    check("jackblack: the table's baize is wine-red (red well ahead of green and blue), in a room that stays green",
      look.felt && look.baize[0] > look.baize[1] + 60 && look.baize[0] > look.baize[2] + 40 && look.wall[1] > look.wall[0] + 20, look);
    await q.close();
  }

  // ---- a phone: no keycaps, nothing wider than the screen, four split hands still fit
  {
    const phone = await lib.newContext(browser, Object.assign({}, devices["Pixel 7"], { viewport: { width: 320, height: 640 } }));
    const q = await lib.open(phone, base, "games/jackblack/");
    await q.tap("#play"); await q.waitForTimeout(200);
    await q.evaluate(() => JackBlack.stack("8 6 8 T 8 8 8 8 2 3 4 5"));
    await q.tap("#deal"); await idle(q);
    for (let i = 0; i < 3; i++) { await q.tap("#act-split"); await idle(q); }
    const ph = await q.evaluate(() => ({ hands: document.querySelectorAll("#hands .hand").length, wide: document.documentElement.scrollWidth - innerWidth,
      caps: [...document.querySelectorAll("[data-gs-key]")].filter((e) => e.getClientRects().length && getComputedStyle(e, "::after").display !== "none").length,
      inFelt: [...document.querySelectorAll("#hands .pc")].every((c) => { const r = c.getBoundingClientRect(), f = document.getElementById("felt").getBoundingClientRect(); return r.left >= f.left && r.right <= f.right; }) }));
    check("jackblack on a 320px phone: four split hands sit inside the table with nothing wider than the screen, and no keycaps show",
      ph.hands === 4 && ph.wide <= 0 && ph.caps === 0 && ph.inFelt, ph);
    check("jackblack (phone): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await phone.close();
  }

  // ---- the dealer plays its hand out at the same pace with Visual FX off as
  // with it on (FX off used to rush it: a card every eighth of a second).
  // 19 against a dealer's 5, who turns the hole card and draws three: timed
  // in the page, from Stand to the hand being settled.
  {
    const took = {}, errs = [];
    for (const off of [false, true]) {
      const q = await lib.open(ctx, base, "games/jackblack/", { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:jackblack", off ? "1" : "0"); } catch (e) {} }, off) });
      await dealt(q, "T 2 9 3 4 5 6");
      took[off ? "off" : "on"] = await q.evaluate(() => new Promise((res) => {
        const t0 = performance.now();
        document.getElementById("act-stand").click();
        (function poll() {
          if (!JackBlack.busy()) res({ ms: Math.round(performance.now() - t0), dealer: JackBlack.table().dealer.length });
          else if (performance.now() - t0 > 12000) res({ ms: -1 });
          else setTimeout(poll, 5);
        })();
      }));
      errs.push(...q.errs);
      await q.close();
    }
    check("jackblack: the dealer's hand (the turn of the hole card and three draws) takes as long with Visual FX off as with it on (at least 1.4 s)",
      took.on.dealer === 5 && took.off.dealer === 5 && took.on.ms >= 1400 && took.off.ms >= 1400, took);
    check("jackblack (the dealer's pace): no page errors", errs.length === 0, errs);
  }

  await ctx.close();

  // ---- the liner's life ring, S.S. SAM LU, hung on the bare wall: under the
  // left porthole on a wide window, under the buttons on a phone (in the
  // column of buttons on one held on its side). Betting and in play: its name
  // reads S.S. SAM LU, whole on its arc, 8px or more; inside the window; clear
  // of the table, the dealer, the buttons, the order ticket, the name and its
  // tagline, the portholes and the corner buttons; and the page no longer for
  // it. It is only left down where the wall under the buttons is too short
  // for its name to be read (betting, on the shortest phones). On a short
  // phone, two split hands keep their cards' size (46 px and up) and leave
  // nothing to scroll with the ring there: it takes only the wall left over.
  // With Visual FX on it sways on its peg; off, it hangs still. No "made by" line.
  const mob = (w, h) => ({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  // (measured once the table is still and the ring has stayed where it hangs for a few looks)
  const settled = (q) => q.waitForFunction(() => {
    if (JackBlack.busy()) { window.__ringSeen = null; return false; }
    const r = document.getElementById("lifering"), k = !r || r.hasAttribute("hidden") ? "down" : r.style.cssText;
    if (window.__ringSeen === k) window.__ringStill = (window.__ringStill || 0) + 1; else { window.__ringSeen = k; window.__ringStill = 0; }
    return window.__ringStill >= 3;
  }, null, { timeout: 8000, polling: 100 }).catch(() => {});
  const ringAt = async (q) => { await settled(q); return q.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    const ring = document.getElementById("lifering"), ctl = document.getElementById("controls").getBoundingClientRect();
    const wall = innerHeight - ctl.bottom;
    if (!ring || ring.hasAttribute("hidden")) return res({ hidden: true, exists: !!ring, wall: Math.round(wall), phone: innerWidth <= 560 });
    const b = ring.getBoundingClientRect(), t = ring.querySelector("text"), path = ring.querySelector("defs path");
    const hits = [];
    ["#felt", "#dealer", "#controls button", ".hud", "h1", ".porthole", ".nav-back-games", ".gs-corner > button"].forEach((s) => document.querySelectorAll(s).forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width && r.height && getComputedStyle(e).display !== "none" && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) hits.push(s);
    }));
    const rg = document.createRange(); rg.selectNodeContents(document.getElementById("sub")); const sr = rg.getBoundingClientRect();
    if (sr.left < b.right && sr.right > b.left && sr.top < b.bottom && sr.bottom > b.top) hits.push("tagline");
    const sh = document.documentElement.scrollHeight, sw = document.documentElement.scrollWidth;
    ring.style.display = "none";
    const longer = sh - document.documentElement.scrollHeight, wider = sw - document.documentElement.scrollWidth;
    ring.style.display = "";
    res({ text: t && t.textContent, font: +(16.5 * b.width / 120).toFixed(1), whole: !!t && t.getComputedTextLength() <= path.getTotalLength(),
      inside: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, hits, longer, wider, wall: Math.round(wall) });
  })))); };
  for (const [label, opts] of [["1280x900", {}], ["1366x657", { viewport: { width: 1366, height: 657 } }], ["1280x600", { viewport: { width: 1280, height: 600 } }], ["1024x768", { viewport: { width: 1024, height: 768 } }],
    ["Pixel 7", devices["Pixel 7"]], ["390x844", mob(390, 844)], ["360x640", mob(360, 640)], ["320x568", mob(320, 568)], ["375x553", mob(375, 553)], ["360x560", mob(360, 560)], ["Pixel 7 sideways", devices["Pixel 7 landscape"]]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/jackblack/");
    await q.click("#play"); await q.waitForTimeout(200);
    const betting = await ringAt(q);
    await q.evaluate(() => JackBlack.stack("8 6 9 T"));
    await q.click("#deal"); await idle(q);
    const playing = await ringAt(q);
    const madeBy = await q.evaluate(() => /made by/i.test(document.body.innerText));
    const good = (r) => !r.hidden && r.text === "S.S. SAM LU" && r.whole && r.font >= 8 && r.inside && !r.hits.length && r.longer <= 0 && r.wider <= 0;
    // (left down only on a phone, where the wall under the buttons is shorter than the smallest ring that can carry its name)
    const excused = (r) => r.hidden && r.exists && r.phone && r.wall < 60;
    check("jackblack, " + label + ": the life ring S.S. SAM LU hangs on the bare wall, its name whole and readable, clear of the table, the buttons and every word, the page no longer for it",
      good(playing) && (good(betting) || excused(betting)) && !madeBy, { betting, playing, madeBy });
    // a short phone: two split hands, the ring up (or down, no wall left)
    if (/^(320x568|375x553|360x560)$/.test(label)) {
      for (let k = 0; k < 4 && await q.evaluate(() => JackBlack.table().phase === "play"); k++) { await q.evaluate(() => document.getElementById("act-stand").click()); await idle(q); }
      await q.evaluate(() => JackBlack.stack("8 T 8 7 3 4 9"));
      await q.evaluate(() => document.getElementById("deal").click()); await idle(q);
      await q.evaluate(() => document.getElementById("act-split").click()); await idle(q);
      const split = await ringAt(q);
      const table = await q.evaluate(() => ({ hands: document.querySelectorAll("#hands .hand").length, scroll: document.documentElement.scrollHeight - innerHeight,
        least: Math.round(Math.min(...[...document.querySelectorAll("#felt .pc")].map((c) => c.getBoundingClientRect().width))) }));
      check("jackblack, " + label + ": with two split hands the cards keep their size (46 px and up) and nothing scrolls, the ring hung clear of them or taken down",
        table.hands === 2 && table.scroll <= 0 && table.least >= 46 && (good(split) || excused(split)), { table, split });
    }
    check("jackblack (life ring), " + label + ": no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }
  // Visual FX: on, the ring sways on its peg; off, it hangs still
  {
    const sway = {};
    for (const off of [false, true]) {
      const c = await lib.newContext(browser);
      const q = await lib.open(c, base, "games/jackblack/", { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:jackblack", off ? "1" : "0"); } catch (e) {} }, off) });
      sway[off ? "off" : "on"] = await q.evaluate(() => { const s = document.querySelector("#lifering .swing"); return s ? getComputedStyle(s).animationName : null; });
      await c.close();
    }
    check("jackblack: with Visual FX on the life ring sways on its peg; off, it hangs still", sway.on && sway.on !== "none" && sway.off === "none", sway);
  }
};
