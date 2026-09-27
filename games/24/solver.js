/* =====================================================================
   24 — exact arithmetic and the solver.

   Numbers are fractions { n, d } with d > 0 and gcd(n, d) = 1, so 8/3 is
   8/3 and never 2.6666. The page uses solve() to show the answer after a
   skip and to give hints from wherever the player has got to;
   build-puzzles.js (Node, not loaded by the page) uses it to sort every
   hand into the puzzle pools in puzzles.js.

   A "step" merges two cards: { a, op, b, r } with op one of + - * /.
   ===================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.TwentyFourSolver = mod;
})(this, function () {
  "use strict";

  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a || 1; }
  function frac(n, d) {
    if (d === undefined) d = 1;
    if (d === 0) return null;
    if (d < 0) { n = -n; d = -d; }
    var g = gcd(n, d);
    return { n: n / g, d: d / g };
  }
  function apply(a, op, b) {
    if (op === "+") return frac(a.n * b.d + b.n * a.d, a.d * b.d);
    if (op === "-") return frac(a.n * b.d - b.n * a.d, a.d * b.d);
    if (op === "*") return frac(a.n * b.n, a.d * b.d);
    if (op === "/") return b.n === 0 ? null : frac(a.n * b.d, a.d * b.n);
    return null;
  }
  function eq(a, b) { return a.n === b.n && a.d === b.d; }
  function is24(a) { return a.n === 24 && a.d === 1; }
  function str(a) { return a.d === 1 ? String(a.n) : a.n + "/" + a.d; }
  function key(list) { return list.map(str).sort().join(","); }

  var OPS = ["+", "-", "*", "/"];
  // Every way to merge two of the numbers into one: each unordered pair
  // once (equal values count as the same pair), both orders for - and /.
  function moves(list) {
    var out = [], seenPair = {};
    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length; j++) {
        var pk = [str(list[i]), str(list[j])].sort().join("|");
        if (seenPair[pk]) continue;
        seenPair[pk] = true;
        var rest = list.filter(function (_, k) { return k !== i && k !== j; });
        var a = list[i], b = list[j];
        var tries = [[a, "+", b], [a, "*", b], [a, "-", b], [a, "/", b]];
        if (!eq(a, b)) tries.push([b, "-", a], [b, "/", a]);
        var seenResult = {};
        tries.forEach(function (t) {
          var r = apply(t[0], t[1], t[2]);
          if (!r || seenResult[str(r)]) return;
          seenResult[str(r)] = true;
          out.push({ step: { a: t[0], op: t[1], b: t[2], r: r }, next: rest.concat([r]) });
        });
      }
    }
    return out;
  }

  // One solution as a list of steps, or null. intOnly: every intermediate
  // result must be a whole number. Tries whole-number routes first.
  function solve(list, intOnly) {
    if (!intOnly) { var s = solve(list, true); if (s) return s; }
    var memo = {};
    function go(l) {
      if (l.length === 1) return is24(l[0]) ? [] : null;
      var k = key(l);
      if (k in memo) return memo[k];
      memo[k] = null;
      var ms = moves(l);
      for (var m = 0; m < ms.length; m++) {
        if (intOnly && ms[m].step.r.d !== 1) continue;
        var rest = go(ms[m].next);
        if (rest) { memo[k] = [ms[m].step].concat(rest); return memo[k]; }
      }
      return null;
    }
    return go(list);
  }

  // How many distinct routes reach 24 (equal values and equal results
  // merged, so 6 6 6 6 isn't inflated). More routes = an easier hand.
  function countRoutes(list, intOnly) {
    var memo = {};
    function go(l) {
      if (l.length === 1) return is24(l[0]) ? 1 : 0;
      var k = key(l);
      if (k in memo) return memo[k];
      var total = 0;
      moves(l).forEach(function (m) { if (!intOnly || m.step.r.d === 1) total += go(m.next); });
      memo[k] = total;
      return total;
    }
    return go(list);
  }

  function fromInts(ints) { return ints.map(function (v) { return frac(v, 1); }); }
  // Hands are stored as four characters: 1-9, then A=10, B=11, C=12, D=13.
  var DIGITS = "0123456789ABCD";
  function decode(code) { return code.split("").map(function (c) { return DIGITS.indexOf(c); }); }
  function encode(ints) { return ints.map(function (v) { return DIGITS.charAt(v); }).join(""); }

  return {
    frac: frac, apply: apply, eq: eq, is24: is24, str: str,
    solve: solve, countRoutes: countRoutes, fromInts: fromInts, decode: decode, encode: encode, OPS: OPS,
  };
});
