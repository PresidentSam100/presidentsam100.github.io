/* =====================================================================
   Klondike — the table: 52 card divs over the felt, dragged with the
   pointer. cards.js owns the rules; this file owns layout, animation,
   input, the menus, sounds, saved bests and the win cascade — the
   bouncing-card salute the old desktop game was famous for.

   Interactions: drag a face-up run; click the stock to draw (and to turn
   the waste back over); double-click or right-click a card to send it to
   its foundation; U undo, H hint, R restart this deal, F2 or N new deal,
   Enter auto-finishes when nothing is hidden any more.
   ===================================================================== */
(function () {
  "use strict";
  var K = window.KlondikeRules;
  var store = window.GameShell ? GameShell.store : { get: function (k, f) { return f; }, getNum: function (k, f) { return f; }, set: function () {} };
  var $ = function (id) { return document.getElementById(id); };
  var field = $("field"), cascade = $("cascade");

  var SUITS = ["♠", "♥", "♦", "♣"];
  var RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  var DAY0 = Date.UTC(2026, 8, 27);
  function today() {
    var d = new Date();
    var ymd = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    var n = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - DAY0) / 86400000) + 1;
    return { ymd: ymd, n: n };
  }
  function fx() { return !(window.RM_ON && window.RM_ON()); }
  function mmss(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function jget(k) { try { var v = JSON.parse(store.get(k, "null")); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }

  // ---- sound -------------------------------------------------------------------
  var actx = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  ["pointerdown", "pointerup", "keydown", "click"].forEach(function (t) {
    document.addEventListener(t, function () { audio(); }, true);
  });
  function tone(f, dur, vol, type, slide, delay) {
    var a = audio(); if (!a) return;
    var t = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || "triangle"; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.03);
  }
  function snapNoise(vol, delay) {
    var a = audio(); if (!a) return;
    var t = a.currentTime + (delay || 0), len = (a.sampleRate * 0.04) | 0;
    var buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = a.createBufferSource(); src.buffer = buf;
    var f = a.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 2600; f.Q.value = 0.8;
    var g = a.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(a.destination); src.start(t);
  }
  var SFX = {
    snap: function () { snapNoise(0.16); },
    flip: function () { snapNoise(0.1); tone(700, 0.04, 0.03, "sine", 1000); },
    draw: function () { snapNoise(0.12); },
    deal: function () { for (var i = 0; i < 7; i++) snapNoise(0.08, i * 0.045); },
    deny: function () { tone(180, 0.08, 0.05, "square"); },
    undo: function () { tone(500, 0.05, 0.04, "sine", 350); },
    found: function () { tone(880, 0.07, 0.05); tone(1320, 0.08, 0.04, "triangle", null, 0.05); },
    win: function () { [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { tone(f, 0.22, 0.06, "triangle", null, i * 0.09); }); },
  };

  // ---- layout --------------------------------------------------------------------
  var CW = 72, CH = 100, GAP = 10, TOPY = 0, TABY = 0, upStep = 24, downStep = 12;
  function layout() {
    var vw = Math.min(window.innerWidth - 28, 760);
    CW = Math.max(38, Math.min(76, Math.floor((vw - 8 * 10) / 7)));
    CH = Math.round(CW * 1.4);
    GAP = Math.round(CW * 0.14);
    upStep = Math.round(CH * 0.26);
    downStep = Math.max(5, Math.round(CH * 0.11));
    TOPY = GAP;
    TABY = TOPY + CH + GAP;
    document.documentElement.style.setProperty("--cw", CW + "px");
    // tallest possible column: 6 down + 13 up
    var fieldH = TABY + 6 * downStep + 13 * upStep + CH + GAP;
    field.style.width = (7 * CW + 8 * GAP) + "px";
    field.style.height = fieldH + "px";
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cascade.width = Math.round(field.clientWidth * dpr);
    cascade.height = Math.round(field.clientHeight * dpr);
    cascade.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    for (var i = 0; i < 7; i++) {
      var sx = GAP + i * (CW + GAP);
      if (i < 1) place($("slot-stock"), sx, TOPY);
      if (i === 1) place($("slot-waste"), sx, TOPY);
      if (i >= 3) place($("slot-f" + (i - 3)), sx, TOPY);
      place($("slot-t" + i), sx, TABY);
    }
    if (G) position(true);
  }
  function place(el, x, y) { el.style.transform = "translate(" + x + "px," + y + "px)"; }
  function pileX(i) { return GAP + i * (CW + GAP); }
  // how far apart draw-three fans the waste (drawn and hit-tested alike)
  function fanStep() { return Math.round(CW * 0.42); }

  // ---- game + cards -------------------------------------------------------------
  var G = null, els = new Map(), timerMs = 0, running = false, started = false;
  var isDaily = false, dealSeed = 0, draw3 = store.get("klondike_draw3", "0") === "1";
  var finishing = false, cascadeOn = false;
  var finishRun = 0;   // bumped by each auto-finish and each deal, so a stale one stops

  function cardEl(c) { return els.get(c.s + "-" + c.r); }
  function buildCards() {
    els.forEach(function (el) { el.remove(); });
    els.clear();
    var all = [].concat(G.stock, G.waste, G.found.flat(), G.tab.flat());
    all.forEach(function (c) {
      var el = document.createElement("div");
      el.className = "card";
      var red = K.isRed(c);
      if (red) el.classList.add("red");
      el.dataset.key = c.s + "-" + c.r;
      el.innerHTML = '<span class="idx">' + RANKS[c.r] + "<small>" + SUITS[c.s] + "</small></span>" +
        (c.r > 10 ? '<span class="face">' + RANKS[c.r] + "</span>" : "") +
        '<span class="pip">' + SUITS[c.s] + "</span>";
      el.setAttribute("aria-label", RANKS[c.r] + SUITS[c.s]);
      field.appendChild(el);
      els.set(el.dataset.key, el);
    });
  }
  // Visual FX off: cards jump instead of gliding, so a card that comes to rest
  // somewhere new wears a gold rim there for 600 ms (each card on its own timer).
  function landed(el) {
    el.classList.add("landed");
    clearTimeout(el._landT);
    el._landT = setTimeout(function () { el.classList.remove("landed"); }, 600);
  }
  // Where every card belongs right now; z-order follows pile order.
  function position(instant) {
    var z = 1, mark = !instant && !fx();
    function put(c, x, y) {
      var el = cardEl(c), at = x + "," + y;
      if (mark && el._at !== at) landed(el);
      el._at = at;
      el.classList.toggle("down", !c.up);
      if (instant) el.classList.add("noanim");
      el.style.zIndex = z++;
      el.style.transform = "translate(" + x + "px," + y + "px)";
      if (instant) requestAnimationFrame(function () { el.classList.remove("noanim"); });
    }
    G.stock.forEach(function (c) { put(c, pileX(0), TOPY); });
    var w = G.waste.length, fan = G.draw3 ? Math.min(3, w) : 1;
    G.waste.forEach(function (c, i) {
      var k = i - (w - fan);
      put(c, pileX(1) + Math.max(0, k) * fanStep(), TOPY);
    });
    G.found.forEach(function (f, fi) {
      f.forEach(function (c) { put(c, pileX(3 + fi), TOPY); });
      $("slot-f" + fi).classList.toggle("done", f.length === 13);
    });
    G.tab.forEach(function (t, ti) {
      var y = TABY;
      t.forEach(function (c) { put(c, pileX(ti), y); y += c.up ? upStep : downStep; });
    });
    status();
  }
  function status() {
    $("st-moves").textContent = G.moves + (G.moves === 1 ? " move" : " moves");
    $("st-stock").textContent = "stock " + G.stock.length;
    var best = store.getNum(bestKey(), 0);
    $("st-best").textContent = best ? "best " + mmss(best) : "";
    $("m-draw3").setAttribute("aria-checked", draw3 ? "true" : "false");
  }
  function bestKey() { return "klondike_best_" + (draw3 ? "draw3" : "draw1"); }

  function newDeal(seed, daily) {
    isDaily = !!daily;
    dealSeed = seed != null ? seed : ((Math.random() * 0x7fffffff) | 0);
    G = K.deal(dealSeed, draw3);
    timerMs = 0; running = false; started = false; finishing = false;
    finishRun++;   // an auto-finish still flying cards home stops here
    stopCascade();
    $("autofinish").hidden = true;
    $("win-title").textContent = isDaily ? "KLONDIKE · DAILY CLAIM " + today().n : "KLONDIKE";
    buildCards();
    position(true);
    clearHints();
    SFX.deal();
    status(); tickTime();
  }
  function begin() {
    if (started) return;
    started = true; running = true;
    var st = jget("klondike_stats");
    st.p = (st.p || 0) + 1;
    store.set("klondike_stats", JSON.stringify(st));
  }

  // ---- moves through the UI ------------------------------------------------------
  function tryMove(from, to, count) {
    if (!K.legal(G, from, to, count)) return false;
    begin();
    var wasFound = to[0] === "f";
    K.doMove(G, from, to, count);
    (wasFound ? SFX.found : SFX.snap)();
    position();
    afterChange();
    return true;
  }
  function drawClick() {
    if (finishing || cascadeOn) return;
    begin();
    var n = K.draw(G);
    if (n === 0) return;
    SFX.draw();
    position();
    afterChange();
  }
  function doUndo() {
    // a won deal stays won: undoing it would let it be won, and counted, again
    if (finishing || cascadeOn || K.won(G)) return;
    if (K.undo(G)) { SFX.undo(); position(); afterChange(); }
  }
  function afterChange() {
    clearHints();
    $("autofinish").hidden = !(K.canAutoFinish(G) && !K.won(G));
    if (K.won(G)) win();
  }

  // Auto-finish: fly everything home, lowest cards first.
  function autoFinish() {
    if (!K.canAutoFinish(G) || finishing) return;
    finishing = true;
    $("autofinish").hidden = true;
    var run = ++finishRun;
    (function step() {
      if (run !== finishRun) return;   // a new deal came out meanwhile
      var names = ["waste", "t0", "t1", "t2", "t3", "t4", "t5", "t6"];
      var bestFrom = null, bestTo = null, bestRank = 99;
      names.forEach(function (nm) {
        var to = K.autoMove(G, nm);
        if (!to) return;
        var p = K.pile(G, nm), r = p[p.length - 1].r;
        if (r < bestRank) { bestRank = r; bestFrom = nm; bestTo = to; }
      });
      if (!bestFrom) { finishing = false; if (K.won(G)) win(); return; }
      K.doMove(G, bestFrom, bestTo, 1);
      SFX.found();
      position();
      if (K.won(G)) { finishing = false; win(); return; }
      setTimeout(step, fx() ? 90 : 20);
    })();
  }

  // ---- winning ---------------------------------------------------------------------
  function win() {
    running = false;
    skyFlare = 1;
    var best = store.getNum(bestKey(), 0);
    var isBest = timerMs > 0 && (!best || timerMs < best);
    if (isBest) store.set(bestKey(), Math.round(timerMs));
    var st = jget("klondike_stats");
    st.w = (st.w || 0) + 1;
    store.set("klondike_stats", JSON.stringify(st));
    if (isDaily) {
      var log = jget("klondike_daily"), t = today();
      if (!log[t.ymd]) { log[t.ymd] = { t: Math.round(timerMs), m: G.moves, d3: draw3 ? 1 : 0 }; store.set("klondike_daily", JSON.stringify(log)); }
    }
    SFX.win();
    var show = function () { winBox(isBest); };
    if (fx()) startCascade(show); else show();
  }
  function winBox(isBest) {
    var st = jget("klondike_stats");
    msgbox("You struck gold!", "<b>" + mmss(timerMs) + "</b> · " + G.moves + " moves · " + (draw3 ? "draw three" : "draw one") +
      (isBest ? "<br>Your fastest strike yet!" : "") +
      "<br><small>" + (st.w || 0) + " of " + (st.p || 0) + " games won</small>",
      [
        isDaily ? ["Share", shareDaily] : null,
        ["Deal new", function () { closeBox(); newDeal(); }],
        ["Same deal", function () { closeBox(); newDeal(dealSeed, isDaily); }],
      ]);
  }
  function shareDaily(e) {
    var btn = e && e.currentTarget;   // the Share button (read now: it's gone once the click is over)
    var t = today(), log = jget("klondike_daily"), d = log[t.ymd] || { t: timerMs, m: G.moves };
    var text = "Klondike · Daily claim #" + t.n + " (" + t.ymd + ")\nStruck gold in " + mmss(d.t) + " · " + d.m + " moves" + (d.d3 ? " · draw three" : "") + " ⛏️\n" + location.origin + location.pathname;
    function copied() { if (!btn) return; btn.textContent = "copied!"; setTimeout(function () { btn.textContent = "Share"; }, 1400); }
    // (the clipboard wasn't allowed: show the result to copy, in the game's own look)
    function fallback() { if (window.GameShell) GameShell.copyBox({ title: "Copy your result", text: text }); else try { window.prompt("Copy your result:", text); } catch (e3) {} }
    if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) { navigator.share({ text: text }).catch(function (e2) { if (!e2 || e2.name !== "AbortError") fallback(); }); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(copied, fallback);
    else fallback();
  }

  // The cascade: cards launch from the foundations and bounce off the floor,
  // stamping trails — the canvas is never cleared. Click skips it.
  var casRun = 0;
  // A click skips the cascade to the box. Its listener goes with the cascade
  // however that ends, or a click in the next deal would bring this box back.
  var casSkip = null;
  function dropSkip() { if (casSkip) field.removeEventListener("pointerdown", casSkip); casSkip = null; }
  function startCascade(done) {
    cascadeOn = true;
    cascade.classList.add("on");
    var g2 = cascade.getContext("2d");
    g2.clearRect(0, 0, field.clientWidth, field.clientHeight);
    var order = [];
    for (var r = 13; r >= 1; r--) for (var f = 0; f < 4; f++) order.push({ c: G.found[f][r - 1], x: pileX(3 + f), y: TOPY });
    var run = ++casRun, active = [], next = 0, floor = field.clientHeight - 2;
    els.forEach(function (el) { el.style.visibility = "hidden"; });
    // foundations stay visible as stacks under the cascade
    function stamp(c, x, y) {
      var el = cardEl(c.c);
      el.style.visibility = "hidden";
      g2.save();
      g2.translate(x, y);
      drawCardOnCanvas(g2, c.c);
      g2.restore();
    }
    function finish() {
      if (casRun !== run) return;
      dropSkip();
      cascadeOn = false;
      done && done();
    }
    casSkip = function () { casRun++; dropSkip(); cascadeOn = false; done && done(); };
    field.addEventListener("pointerdown", casSkip);
    (function frame() {
      if (casRun !== run) return;
      if (next < order.length && (active.length === 0 || active[active.length - 1].t > 14)) {
        var o = order[next++];
        active.push({ c: o.c, x: o.x, y: o.y, vx: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3.4), vy: -(1 + Math.random() * 2), t: 0 });
      }
      var alive = false;
      active.forEach(function (b) {
        if (b.dead) return;
        alive = true;
        b.t++;
        b.vy += 0.5;
        b.x += b.vx; b.y += b.vy;
        if (b.y + CH > floor) { b.y = floor - CH; b.vy *= -0.72; }
        stamp(b, b.x, b.y);
        if (b.x < -CW - 10 || b.x > field.clientWidth + 10) b.dead = true;
      });
      if (next < order.length || alive) requestAnimationFrame(frame);
      else finish();
    })();
  }
  function drawCardOnCanvas(g2, c) {
    var r = Math.round(CW * 0.09);
    g2.fillStyle = "#f6eed8"; g2.strokeStyle = "#6b5a3a"; g2.lineWidth = 1;
    g2.beginPath();
    g2.roundRect(0, 0, CW, CH, r);
    g2.fill(); g2.stroke();
    g2.fillStyle = K.isRed(c) ? "#b0352a" : "#2b2015";
    g2.font = "700 " + Math.round(CW * 0.24) + "px Bitter, Georgia, serif";
    g2.textAlign = "left"; g2.textBaseline = "top";
    g2.fillText(RANKS[c.r], 4, 3);
    g2.font = Math.round(CW * 0.24) + "px Bitter, Georgia, serif";
    g2.fillText(SUITS[c.s], 4, 5 + CW * 0.24);
    g2.font = Math.round(CW * 0.6) + "px Bitter, Georgia, serif";
    g2.textAlign = "right"; g2.textBaseline = "bottom";
    g2.fillText(SUITS[c.s], CW - 4, CH - 2);
  }
  function stopCascade() {
    casRun++;
    dropSkip();
    cascadeOn = false;
    cascade.classList.remove("on");
    els.forEach(function (el) { el.style.visibility = ""; });
  }

  // ---- hit testing and drag ---------------------------------------------------------
  function fieldPos(e) {
    var r = field.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  // Which pile and index a point touches (topmost card first).
  function pick(p) {
    // waste (top card only)
    if (G.waste.length) {
      var wl = G.waste.length, fan = G.draw3 ? Math.min(3, wl) : 1;
      var wx = pileX(1) + (fan - 1) * fanStep();
      if (p.x >= wx && p.x <= wx + CW && p.y >= TOPY && p.y <= TOPY + CH) return { pile: "waste", index: wl - 1 };
    }
    for (var f = 0; f < 4; f++) {
      if (G.found[f].length && p.x >= pileX(3 + f) && p.x <= pileX(3 + f) + CW && p.y >= TOPY && p.y <= TOPY + CH) return { pile: "f" + f, index: G.found[f].length - 1 };
    }
    for (var t = 0; t < 7; t++) {
      var col = G.tab[t], x = pileX(t);
      if (p.x < x || p.x > x + CW || !col.length) continue;
      var y = TABY;
      for (var i = 0; i < col.length; i++) {
        var h = i === col.length - 1 ? CH : (col[i].up ? upStep : downStep);
        if (p.y >= y && p.y <= y + h && col[i].up) return { pile: "t" + t, index: i };
        y += col[i].up ? upStep : downStep;
      }
    }
    if (p.x >= pileX(0) && p.x <= pileX(0) + CW && p.y >= TOPY && p.y <= TOPY + CH) return { pile: "stock", index: -1 };
    return null;
  }
  // Which pile a dropped card is over: the column under its centre.
  function dropTarget(cx, cy) {
    if (cy < TABY - GAP / 2) {
      for (var f = 0; f < 4; f++) {
        if (cx >= pileX(3 + f) - GAP / 2 && cx <= pileX(3 + f) + CW + GAP / 2) return "f" + f;
      }
      return null;
    }
    var col = Math.round((cx - GAP - CW / 2) / (CW + GAP));
    if (col < 0 || col > 6) return null;
    return "t" + col;
  }

  var drag = null, lastTap = { at: 0, key: "" };
  field.addEventListener("pointerdown", function (e) {
    if (cascadeOn || finishing || PAUSE.isPaused()) return;
    if (e.button === 2) return;
    var p = fieldPos(e), hit = pick(p);
    if (!hit) return;
    e.preventDefault();
    try { field.setPointerCapture(e.pointerId); } catch (err) {}
    if (hit.pile === "stock") { drawClick(); return; }
    var src = K.pile(G, hit.pile), count = src.length - hit.index;
    if (hit.pile === "waste" || hit.pile[0] === "f") count = 1;
    var cards = src.slice(src.length - count);
    // double-click (or double-tap): straight to the foundation
    var key = hit.pile + ":" + hit.index, now = performance.now();
    if (key === lastTap.key && now - lastTap.at < 350 && count === 1) {
      lastTap = { at: 0, key: "" };
      var to = K.autoMove(G, hit.pile);
      if (to) { tryMove(hit.pile, to, 1); return; }
    }
    lastTap = { at: now, key: key };
    drag = {
      id: e.pointerId, from: hit.pile, count: count, cards: cards,
      dx: 0, dy: 0, sx: p.x, sy: p.y, moved: false,
      origins: cards.map(function (c) { var m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(cardEl(c).style.transform); return { x: +m[1], y: +m[2] }; }),
    };
    cards.forEach(function (c) { cardEl(c).classList.add("drag"); });
  });
  field.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var p = fieldPos(e);
    drag.dx = p.x - drag.sx; drag.dy = p.y - drag.sy;
    if (Math.hypot(drag.dx, drag.dy) > 4) drag.moved = true;
    drag.cards.forEach(function (c, i) {
      cardEl(c).style.transform = "translate(" + (drag.origins[i].x + drag.dx) + "px," + (drag.origins[i].y + drag.dy) + "px)";
    });
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    var d = drag; drag = null;
    d.cards.forEach(function (c) { cardEl(c).classList.remove("drag"); });
    if (d.moved) {
      var cx = d.origins[0].x + d.dx + CW / 2, cy = d.origins[0].y + d.dy + CH / 2;
      var to = dropTarget(cx, cy);
      if (to && tryMove(d.from, to, d.count)) return;
      SFX.deny();
    }
    position();   // spring back
  }
  field.addEventListener("pointerup", endDrag);
  field.addEventListener("pointercancel", endDrag);
  field.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    if (cascadeOn || finishing) return;
    var hit = pick(fieldPos(e));
    if (hit && hit.pile !== "stock") {
      var to = K.autoMove(G, hit.pile);
      if (to) tryMove(hit.pile, to, 1);
    }
  });

  // ---- hints ---------------------------------------------------------------------------
  var hintTimer = 0;
  function clearHints() {
    clearTimeout(hintTimer);
    field.querySelectorAll(".hintsrc").forEach(function (el) { el.classList.remove("hintsrc"); });
    field.querySelectorAll(".hintdst").forEach(function (el) { el.classList.remove("hintdst"); });
  }
  function showHint() {
    clearHints();
    var h = K.hint(G);
    if (!h) return;
    if (h.from === "stock") { $("slot-stock").classList.add("hintdst"); }
    else {
      var src = K.pile(G, h.from);
      src.slice(src.length - h.count).forEach(function (c) { cardEl(c).classList.add("hintsrc"); });
      var id = h.to[0] === "f" ? "slot-f" + h.to[1] : "slot-t" + h.to[1];
      var dstPile = K.pile(G, h.to);
      if (dstPile.length) cardEl(dstPile[dstPile.length - 1]).classList.add("hintsrc");
      else $(id).classList.add("hintdst");
    }
    hintTimer = setTimeout(clearHints, 1600);
  }

  // ---- menus, message box, keys ----------------------------------------------------------
  function menuWire(id) {
    var m = $(id), top = m.querySelector(".mtop"), list = m.querySelector(".mlist");
    top.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = !m.classList.contains("open");
      closeMenus();
      if (open) { m.classList.add("open"); list.hidden = false; top.setAttribute("aria-expanded", "true"); }
    });
    list.addEventListener("click", function () { closeMenus(); });
  }
  function closeMenus() {
    document.querySelectorAll(".menu.open").forEach(function (m) {
      m.classList.remove("open");
      m.querySelector(".mlist").hidden = true;
      m.querySelector(".mtop").setAttribute("aria-expanded", "false");
    });
  }
  document.addEventListener("click", closeMenus);
  menuWire("menu-game"); menuWire("menu-help");

  function msgbox(title, html, buttons) {
    $("mb-title").textContent = title;
    $("mb-body").innerHTML = html;
    var row = $("mb-row");
    row.innerHTML = "";
    buttons.filter(Boolean).forEach(function (b, i) {
      var btn = document.createElement("button");
      btn.type = "button"; btn.textContent = b[0];
      btn.addEventListener("click", b[1]);
      row.appendChild(btn);
      if (i === 0) setTimeout(function () { btn.focus({ preventScroll: true }); }, 0);
    });
    $("shade").hidden = false;
  }
  function closeBox() { $("shade").hidden = true; }
  $("shade").addEventListener("click", function (e) { if (e.target === $("shade")) closeBox(); });

  // Restart, a new deal and the draw toggle throw the game in progress away:
  // mid-game they ask first (GameShell.askQuit, by the leave guard), with the
  // game paused underneath; going ahead deals unpaused. A fresh deal or a won
  // one goes at once.
  var START_OVER = { title: "Start over?", ok: "Start over" }, NEW_GAME = { title: "Start a new game?", ok: "New game" };
  function askThen(opts, go) {
    var run = function () { if (PAUSE.resume) PAUSE.resume(); go(); };
    if (window.GameShell && GameShell.askQuit) GameShell.askQuit(opts, run); else run();
  }
  function restartDeal() { askThen(START_OVER, function () { newDeal(dealSeed, isDaily); }); }
  function freshDeal() { askThen(NEW_GAME, function () { newDeal(); }); }

  $("m-new").addEventListener("click", freshDeal);
  $("m-restart").addEventListener("click", restartDeal);
  $("m-undo").addEventListener("click", doUndo);
  $("m-hint").addEventListener("click", showHint);
  $("m-daily").addEventListener("click", function () { askThen(NEW_GAME, function () { newDeal(today().n * 2654435761 % 0x7fffffff, true); }); });
  $("m-draw3").addEventListener("click", function () {
    askThen(NEW_GAME, function () {
      draw3 = !draw3;
      store.set("klondike_draw3", draw3 ? "1" : "0");
      newDeal(null, false);
    });
  });
  $("m-rules").addEventListener("click", function () {
    msgbox("How to play", "Fill the four gold pans from Ace to King, one suit each." +
      "<ul><li>On the table, stack downward in alternating colours; drag any face-up run.</li>" +
      "<li>Only a King may move to an empty column.</li>" +
      "<li>Click the stock to draw; double-click or right-click a card to send it home.</li>" +
      // (the key legend hides on a touch-only device: no keys to press)
      '<li class="gs-keys"><kbd>U</kbd> undo · <kbd>H</kbd> hint · <kbd>R</kbd> restart · <kbd>F2</kbd> new deal.</li></ul>',
      [["OK", closeBox]]);
  });
  $("autofinish").addEventListener("click", autoFinish);

  document.addEventListener("keydown", function (e) {
    if (PAUSE.isPaused()) return;   // the pause card's own keys still resume
    if (e.ctrlKey && (e.key === "z" || e.key === "Z")) { e.preventDefault(); doUndo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Esc closes the box and stops there: the pause listener (added below)
    // would otherwise pause the game on the same press, and preventDefault
    // keeps ../motion-toggle.js from taking it to the games page
    if (!$("shade").hidden) { if (e.key === "Escape") { closeBox(); e.preventDefault(); e.stopImmediatePropagation(); } return; }
    var k = e.key.toLowerCase();
    if (e.key === "F2" || k === "n") { e.preventDefault(); freshDeal(); }
    else if (k === "u") doUndo();
    else if (k === "h") showHint();
    else if (k === "r") restartDeal();
    else if (e.key === "Enter" && !$("autofinish").hidden) autoFinish();
  });

  var PAUSE = window.GameShell ? GameShell.pausable({ canPause: function () { return started && running && !cascadeOn; } })
    : { isPaused: function () { return false; } };

  // ---- clock -------------------------------------------------------------------------------
  var lastT = 0;
  function tickTime() { $("st-time").textContent = mmss(timerMs); }
  (function loop(ts) {
    requestAnimationFrame(loop);
    var dt = lastT ? Math.min(250, ts - lastT) : 0;
    lastT = ts;
    if (running && started && !PAUSE.isPaused() && !document.hidden && !K.won(G)) {
      timerMs += dt;
      tickTime();
    }
  })(0);

  // ---- the Yukon sky: stars, the aurora, pine silhouettes, falling snow ----
  var sky = $("sky"), skyFlare = 0;
  (function skyRun() {
    var g = sky.getContext("2d"), sw = 0, sh = 0, flakes = [], seedStars = [];
    function sizeSky() {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      sw = window.innerWidth; sh = window.innerHeight;
      sky.width = Math.round(sw * dpr); sky.height = Math.round(sh * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      var rng = K.mulberry(77);
      seedStars = [];
      for (var i = 0; i < 90; i++) seedStars.push({ x: rng() * sw, y: rng() * sh * 0.75, r: 0.5 + rng() * 1.1, tw: rng() * 6.28 });
      flakes = [];
      for (var f2 = 0; f2 < 70; f2++) flakes.push({ x: rng() * sw, y: rng() * sh, v: 12 + rng() * 26, drift: rng() * 6.28, r: 0.8 + rng() * 1.6 });
    }
    sizeSky();
    window.addEventListener("resize", sizeSky);
    function paint(t) {
      var bg = g.createLinearGradient(0, 0, 0, sh);
      bg.addColorStop(0, "#05070f"); bg.addColorStop(0.55, "#0a1424"); bg.addColorStop(1, "#101c2c");
      g.fillStyle = bg; g.fillRect(0, 0, sw, sh);
      seedStars.forEach(function (st2) {
        var a = 0.4 + 0.5 * Math.abs(Math.sin(t * 0.0004 + st2.tw));
        g.fillStyle = "rgba(230,240,255," + a.toFixed(2) + ")";
        g.fillRect(st2.x, st2.y, st2.r, st2.r);
      });
      // the aurora: three slow ribbons, brighter for a while after a win
      // (the flare fades, so it's Visual FX only)
      var moving = fx();
      var boost = 1 + (moving ? skyFlare : 0) * 1.6;
      for (var band = 0; band < 3; band++) {
        var baseY = sh * (0.16 + band * 0.09), amp = sh * 0.05, ph = t * 0.00012 * (band + 1);
        g.beginPath();
        for (var x = -20; x <= sw + 20; x += 24) {
          var y = baseY + Math.sin(x * 0.004 + ph * 6) * amp + Math.sin(x * 0.0013 - ph * 4) * amp * 1.6;
          if (x === -20) g.moveTo(x, y); else g.lineTo(x, y);
        }
        var col = band === 1 ? "120,235,170" : band === 2 ? "150,140,255" : "80,220,200";
        var grad = g.createLinearGradient(0, baseY - sh * 0.14, 0, baseY + sh * 0.1);
        grad.addColorStop(0, "rgba(" + col + ",0)");
        grad.addColorStop(0.55, "rgba(" + col + "," + (0.14 * boost).toFixed(3) + ")");
        grad.addColorStop(1, "rgba(" + col + ",0)");
        g.strokeStyle = grad; g.lineWidth = sh * 0.11; g.lineCap = "round";
        g.stroke();
      }
      // pine silhouettes along the bottom
      g.fillStyle = "#04070c";
      g.fillRect(0, sh - sh * 0.055, sw, sh * 0.055);
      var rng2 = K.mulberry(31);
      for (var p2 = 0; p2 < Math.ceil(sw / 60); p2++) {
        var px = p2 * 60 + rng2() * 30, phh = sh * (0.06 + rng2() * 0.07), pw = phh * 0.42, py = sh - sh * 0.05;
        for (var tier = 0; tier < 3; tier++) {
          var ty = py - phh * (tier / 3), twd = pw * (1 - tier * 0.27);
          g.beginPath(); g.moveTo(px - twd, ty); g.lineTo(px, ty - phh * 0.52); g.lineTo(px + twd, ty); g.closePath(); g.fill();
        }
      }
      // falling snow (with Visual FX off it hangs in the air, still)
      g.fillStyle = "rgba(235,242,250,0.8)";
      flakes.forEach(function (fl) {
        if (moving) {
          fl.y += fl.v / 60; fl.x += Math.sin(t * 0.0006 + fl.drift) * 0.3;
          if (fl.y > sh) { fl.y = -4; fl.x = Math.random() * sw; }
        }
        g.beginPath(); g.arc(fl.x, fl.y, fl.r, 0, 7); g.fill();
      });
      skyFlare *= 0.995;
    }
    // The switch is read every frame, so flipping it mid-game takes at once.
    // With Visual FX off the sky is one still picture (its clock held at
    // STILL), painted again only after a resize or a flip of the switch.
    var STILL = 9000, stillDrawn = false;
    window.addEventListener("resize", function () { stillDrawn = false; });
    (function loop2(t) {
      if (fx()) { paint(t || 0); stillDrawn = false; }
      else if (!stillDrawn) { paint(STILL); stillDrawn = true; }
      requestAnimationFrame(loop2);
    })(0);
  })();

  window.addEventListener("resize", layout);
  layout();
  newDeal();

  // ---- test hooks ----------------------------------------------------------------------------
  window.Klondike = {
    state: function () {
      var s = function (p) { return p.map(function (c) { return (c.up ? "" : "*") + RANKS[c.r] + SUITS[c.s]; }).join(" "); };
      return { seed: dealSeed, draw3: draw3, isDaily: isDaily, moves: G.moves, timerMs: Math.round(timerMs), won: K.won(G),
        stock: G.stock.length, waste: s(G.waste), found: G.found.map(s), tab: G.tab.map(s),
        autofinish: !$("autofinish").hidden, cascade: cascadeOn, paused: PAUSE.isPaused() };
    },
    deal: function (seed, daily) { newDeal(seed, daily); },
    move: function (from, to, count) { return tryMove(from, to, count || 1); },
    draw: drawClick, undo: doUndo, hint: showHint, autoFinish: autoFinish,
    cardPos: function (rank, suit) {
      var el = els.get(suit + "-" + rank), r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
    },
    slotPos: function (id) { var r = $("slot-" + id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
    // A nearly-won position for testing auto-finish and the cascade.
    almostWin: function () {
      G = K.deal(dealSeed, draw3);
      G.stock = []; G.waste = [];
      for (var s = 0; s < 4; s++) {
        G.found[s] = [];
        for (var r = 1; r <= 12; r++) G.found[s].push({ s: s, r: r, up: true });
      }
      G.tab = [[{ s: 0, r: 13, up: true }], [{ s: 1, r: 13, up: true }], [{ s: 2, r: 13, up: true }], [{ s: 3, r: 13, up: true }], [], [], []];
      G.undo = []; G.moves = 0;
      started = true; running = true; finishing = false;
      buildCards(); position(true); afterChange();
    },
  };
})();
