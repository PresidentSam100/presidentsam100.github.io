/* =====================================================================
   Klondike — the rules, with no DOM. game.js renders and animates this;
   tests drive it in Node.

   A card is { s: 0..3 (♠ ♥ ♦ ♣), r: 1..13, up: bool }; red is s 1 or 2.
   Piles: stock, waste, found[4] (by play order, any suit per slot as
   long as it stays one suit), tab[7]. Every change goes through move
   objects so undo can reverse anything:
     { kind:"draw", n }                    stock -> waste (n cards)
     { kind:"redeal", n }                  waste -> stock (all, face down)
     { kind:"move", from, to, count, flip } between piles; flip says the
       source's new top card was turned up (undo turns it back down)
   Pile names: "stock", "waste", "f0".."f3", "t0".."t6".

   K.deal(seed, draw3) -> game        the same seed always deals the same
   K.legal(g, from, to, count)        may that run go there?
   K.doMove / K.draw / K.undo / K.won / K.autoMove / K.hint / K.canAutoFinish
   ===================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.KlondikeRules = mod;
})(this, function () {
  "use strict";

  var isRed = function (c) { return c.s === 1 || c.s === 2; };

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function deal(seed, draw3) {
    var rng = mulberry(seed);
    var deck = [];
    for (var s = 0; s < 4; s++) for (var r = 1; r <= 13; r++) deck.push({ s: s, r: r, up: false });
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1)), t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    var g = { seed: seed, draw3: !!draw3, stock: [], waste: [], found: [[], [], [], []], tab: [[], [], [], [], [], [], []], undo: [], moves: 0, redeals: 0 };
    for (var col = 0; col < 7; col++) {
      for (var k = 0; k <= col; k++) {
        var c = deck.pop();
        c.up = k === col;
        g.tab[col].push(c);
      }
    }
    g.stock = deck;
    return g;
  }

  function pile(g, name) {
    if (name === "stock") return g.stock;
    if (name === "waste") return g.waste;
    if (name[0] === "f") return g.found[+name[1]];
    return g.tab[+name[1]];
  }

  function legal(g, from, to, count) {
    if (from === to) return false;
    var src = pile(g, from), dst = pile(g, to);
    if (!src || !dst || from === "stock" || to === "stock" || to === "waste") return false;
    count = count || 1;
    if (src.length < count) return false;
    var run = src.slice(src.length - count);
    if (run.some(function (c) { return !c.up; })) return false;
    if (from === "waste" || from[0] === "f") { if (count !== 1) return false; }
    var lead = run[0];
    if (to[0] === "f") {
      if (count !== 1) return false;
      if (!dst.length) return lead.r === 1;
      var top = dst[dst.length - 1];
      return lead.s === top.s && lead.r === top.r + 1;
    }
    // tableau: descending, alternating colours; a King on an empty column
    if (!dst.length) return lead.r === 13;
    var t = dst[dst.length - 1];
    if (!t.up) return false;
    return t.r === lead.r + 1 && isRed(t) !== isRed(lead);
  }

  function doMove(g, from, to, count) {
    count = count || 1;
    if (!legal(g, from, to, count)) return false;
    var src = pile(g, from), dst = pile(g, to);
    var run = src.splice(src.length - count, count);
    dst.push.apply(dst, run);
    var flip = false;
    if (from[0] === "t" && src.length && !src[src.length - 1].up) { src[src.length - 1].up = true; flip = true; }
    g.undo.push({ kind: "move", from: from, to: to, count: count, flip: flip });
    g.moves++;
    return true;
  }

  function draw(g) {
    if (g.stock.length) {
      var n = Math.min(g.draw3 ? 3 : 1, g.stock.length);
      for (var i = 0; i < n; i++) { var c = g.stock.pop(); c.up = true; g.waste.push(c); }
      g.undo.push({ kind: "draw", n: n });
      g.moves++;
      return n;
    }
    if (!g.waste.length) return 0;
    var n2 = g.waste.length;
    while (g.waste.length) { var w = g.waste.pop(); w.up = false; g.stock.push(w); }
    g.undo.push({ kind: "redeal", n: n2 });
    g.redeals++;
    g.moves++;
    return -n2;   // negative: it was a redeal
  }

  function undo(g) {
    var u = g.undo.pop();
    if (!u) return null;
    g.moves++;
    if (u.kind === "draw") {
      for (var i = 0; i < u.n; i++) { var c = g.waste.pop(); c.up = false; g.stock.push(c); }
    } else if (u.kind === "redeal") {
      while (g.stock.length) { var s = g.stock.pop(); s.up = true; g.waste.push(s); }
      g.redeals--;
    } else {
      var src = pile(g, u.from), dst = pile(g, u.to);
      if (u.flip) src[src.length - 1].up = false;
      var run = dst.splice(dst.length - u.count, u.count);
      src.push.apply(src, run);
    }
    return u;
  }

  function won(g) { return g.found.every(function (f) { return f.length === 13; }); }

  // Where a single card would auto-go on a double-click: its foundation.
  function autoMove(g, from) {
    var src = pile(g, from);
    if (!src.length || !src[src.length - 1].up) return null;
    for (var f = 0; f < 4; f++) if (legal(g, from, "f" + f, 1)) return "f" + f;
    return null;
  }

  // Every hidden card found and the stock exhausted: the rest plays itself.
  function canAutoFinish(g) {
    if (g.stock.length || g.waste.length > 1) return false;
    return g.tab.every(function (t) { return t.every(function (c) { return c.up; }); });
  }

  // One helpful legal move, in the order a player would look for it:
  // uncover something, free a column for a king, build a foundation, dig
  // with the waste, and only then draw.
  function hint(g) {
    var names = ["t0", "t1", "t2", "t3", "t4", "t5", "t6"];
    var i, j, t, c;
    // a tableau run onto another pile, when it exposes a face-down card
    for (i = 0; i < 7; i++) {
      t = g.tab[i];
      var first = 0;
      while (first < t.length && !t[first].up) first++;
      if (first >= t.length) continue;
      var count = t.length - first;
      for (j = 0; j < 7; j++) {
        if (i === j) continue;
        if (first > 0 && legal(g, names[i], names[j], count)) return { from: names[i], to: names[j], count: count };
      }
      // a lone king run on an empty spot only helps if it uncovers something
    }
    // top of a tableau or the waste onto a foundation
    for (i = 0; i < 7; i++) { var to = autoMove(g, names[i]); if (to) return { from: names[i], to: to, count: 1 }; }
    if (g.waste.length) { var wf = autoMove(g, "waste"); if (wf) return { from: "waste", to: wf, count: 1 }; }
    // the waste onto the tableau
    if (g.waste.length) {
      for (j = 0; j < 7; j++) if (legal(g, "waste", names[j], 1)) return { from: "waste", to: names[j], count: 1 };
    }
    // any full up-run move that frees a column for a waiting king
    for (i = 0; i < 7; i++) {
      t = g.tab[i];
      if (!t.length || !t[0].up) continue;   // whole pile is face-up
      for (j = 0; j < 7; j++) {
        if (i !== j && legal(g, names[i], names[j], t.length)) {
          var kingWaits = g.waste.some(function (w) { return w.r === 13; }) ||
            g.tab.some(function (o, oi) { return oi !== i && o.some(function (x) { return x.up && x.r === 13 && o[0] !== x; }); });
          if (kingWaits) return { from: names[i], to: names[j], count: t.length };
        }
      }
    }
    if (g.stock.length || g.waste.length) return { from: "stock", to: "waste", count: 0 };
    return null;
  }

  return { deal: deal, pile: pile, legal: legal, doMove: doMove, draw: draw, undo: undo, won: won, autoMove: autoMove, canAutoFinish: canAutoFinish, hint: hint, isRed: isRed, mulberry: mulberry };
});
