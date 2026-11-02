/* =====================================================================
   Patchword's rules, with no page in them: the word list, dealing a
   block, finding every word in it, the path a typed word takes, and the
   points. game.js plays with them; _dev/tests/patchword.js checks them.
   ===================================================================== */
(function (root) {
  "use strict";

  var N = 4, CELLS = N * N;

  // ---- the word list ----------------------------------------------------
  // words.js holds it front coded (see its header): unpacked once, into a
  // sorted array, with a flag for each everyday word
  var WORDS = null, EVERYDAY = null;
  function load() {
    if (WORDS) return;
    var s = root.PATCHWORD_WORDS || "", words = [], everyday = [], next = false, i = 0, L = s.length;
    while (i < L) {
      var ch = s.charCodeAt(i);
      if (ch === 42) { next = true; i++; continue; }          // * an everyday word
      var keep = ch - 65, j = i + 1;                            // A to P: the letters shared
      while (j < L && s.charCodeAt(j) >= 97) j++;
      words.push((keep ? words[words.length - 1].slice(0, keep) : "") + s.slice(i + 1, j));
      everyday.push(next);
      next = false;
      i = j;
    }
    WORDS = words; EVERYDAY = everyday;
  }
  // the place of the first word at or after w
  function at(w) {
    var lo = 0, hi = WORDS.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (WORDS[mid] < w) lo = mid + 1; else hi = mid; }
    return lo;
  }
  function isWord(w) { load(); var k = at(w); return k < WORDS.length && WORDS[k] === w; }
  function isEveryday(w) { load(); var k = at(w); return k < WORDS.length && WORDS[k] === w && EVERYDAY[k]; }

  // ---- the block ----------------------------------------------------------
  // neighbours: across, down and corner to corner
  var NEXT = [];
  for (var c = 0; c < CELLS; c++) {
    var list = [], r0 = Math.floor(c / N), c0 = c % N;
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      var r = r0 + dr, cc = c0 + dc;
      if ((dr || dc) && r >= 0 && r < N && cc >= 0 && cc < N) list.push(r * N + cc);
    }
    NEXT.push(list);
  }
  function adjacent(a, b) { return a !== b && Math.abs(Math.floor(a / N) - Math.floor(b / N)) <= 1 && Math.abs(a % N - b % N) <= 1; }

  // How often each letter turns up on a patch: about English's own mix,
  // vowels a little more often, the awkward letters rarer. "qu" is the one
  // patch with two letters on it.
  var WEIGHTS = {
    e: 11, a: 8.5, i: 7.5, o: 7, u: 3.2,
    t: 7, n: 6.5, s: 6.5, r: 6.5, l: 5, d: 4, h: 3.5, c: 3.5, m: 3, p: 3, g: 2.8,
    b: 2.2, f: 2, y: 2, w: 1.8, k: 1.4, v: 1.2, x: 0.5, j: 0.4, z: 0.4, qu: 0.5
  };
  var RARE = { j: 1, k: 1, qu: 1, v: 1, x: 1, z: 1 }, VOWEL = { a: 1, e: 1, i: 1, o: 1, u: 1 };
  var BAG = [], TOTAL = 0;
  Object.keys(WEIGHTS).forEach(function (k) { TOTAL += WEIGHTS[k]; BAG.push([k, TOTAL]); });
  function draw(rnd) {
    var x = rnd() * TOTAL;
    for (var i = 0; i < BAG.length; i++) if (x < BAG[i][1]) return BAG[i][0];
    return "e";
  }
  // sixteen patches: no letter more than three times, an awkward one at
  // most once, and four to seven vowels
  function patches(rnd) {
    for (;;) {
      var t = [], count = {}, vowels = 0;
      while (t.length < CELLS) {
        var k = draw(rnd), n = count[k] || 0;
        if (n >= 3 || (RARE[k] && n >= 1)) continue;
        count[k] = n + 1; if (VOWEL[k]) vowels++;
        t.push(k);
      }
      if (vowels >= 4 && vowels <= 7) return t;
    }
  }

  // Every word in a block: { word: path } (the first path found), by a
  // walk from every patch that stops as soon as no word starts that way
  function solve(tiles) {
    load();
    var found = {}, used = [], path = [];
    function go(i, so) {
      var w = so + tiles[i], k = at(w);
      if (k >= WORDS.length || WORDS[k].lastIndexOf(w, 0) !== 0) return;
      used[i] = true; path.push(i);
      if (w.length >= 3 && WORDS[k] === w && !found.hasOwnProperty(w)) found[w] = path.slice();
      var nx = NEXT[i];
      for (var j = 0; j < nx.length; j++) if (!used[nx[j]]) go(nx[j], w);
      used[i] = false; path.pop();
    }
    for (var i = 0; i < CELLS; i++) go(i, "");
    return found;
  }

  // the points a word earns, by its letters (a Qu patch is two)
  function points(w) {
    var n = w.length;
    return n < 3 ? 0 : n <= 4 ? 1 : n === 5 ? 2 : n === 6 ? 3 : n === 7 ? 5 : 11;
  }

  // A block worth sewing: enough everyday words in it, a few of them long.
  // Dealt again until it is, keeping the best seen if none is (it never
  // comes to that in practice).
  var MIN_EVERYDAY = 50, MIN_LONG = 8;
  function deal(rnd) {
    var best = null;
    for (var tries = 0; tries < 400; tries++) {
      var tiles = patches(rnd), all = solve(tiles), every = 0, long = 0, max = 0;
      for (var w in all) {
        max += points(w);
        if (isEveryday(w)) { every++; if (w.length >= 5) long++; }
      }
      var b = { tiles: tiles, words: all, everyday: every, long: long, max: max, tries: tries + 1 };
      if (every >= MIN_EVERYDAY && long >= MIN_LONG) return b;
      if (!best || every + long * 4 > best.everyday + best.long * 4) best = b;
    }
    return best;
  }

  // The path a typed word takes, or null where there is none: patch by
  // patch, each beside the one before and none twice, a Qu patch taking
  // "qu" (or the "q" a word ends on while the u is still to come). Where
  // there are several, the one that keeps most of `prefer` (the path shown
  // a letter ago), so the stitching doesn't jump about as a word is typed.
  function pathFor(tiles, typed, prefer) {
    if (!typed) return [];
    prefer = prefer || [];
    var used = [], path = [];
    function order(list, k) {
      var p = prefer[k];
      if (p == null || list.indexOf(p) < 0) return list;
      return [p].concat(list.filter(function (x) { return x !== p; }));
    }
    function go(i, rest) {
      var t = tiles[i], take;
      if (rest.lastIndexOf(t, 0) === 0) take = t.length;
      else if (t === "qu" && rest === "q") take = 1;
      else return false;
      used[i] = true; path.push(i);
      var left = rest.slice(take);
      if (!left) return true;
      var nx = order(NEXT[i], path.length);
      for (var j = 0; j < nx.length; j++) if (!used[nx[j]] && go(nx[j], left)) return true;
      used[i] = false; path.pop();
      return false;
    }
    var starts = order(Array.apply(null, Array(CELLS)).map(function (_, i) { return i; }), 0);
    for (var s = 0; s < starts.length; s++) if (go(starts[s], typed)) return path;
    return null;
  }
  // Every path that spells `typed` (up to `most`, 64 unless given): letters
  // typed may be found in more than one place on the block (four E's, two
  // ST's side by side), and a typed word may be stitched along any of them.
  function pathsFor(tiles, typed, most) {
    var out = [];
    if (!typed) return out;
    most = most || 64;
    var used = [], path = [];
    function go(i, rest) {
      if (out.length >= most) return;
      var t = tiles[i], take;
      if (rest.lastIndexOf(t, 0) === 0) take = t.length;
      else if (t === "qu" && rest === "q") take = 1;
      else return;
      used[i] = true; path.push(i);
      var left = rest.slice(take);
      if (!left) out.push(path.slice());
      else for (var j = 0; j < NEXT[i].length; j++) if (!used[NEXT[i][j]]) go(NEXT[i][j], left);
      used[i] = false; path.pop();
    }
    for (var s = 0; s < CELLS; s++) go(s, typed);
    return out;
  }
  // the word a path spells
  function spell(tiles, path) { return path.map(function (i) { return tiles[i]; }).join(""); }
  // a path that keeps the rules: patches side by side or corner to corner, none twice
  function fair(path) {
    for (var i = 0; i < path.length; i++) {
      if (path[i] < 0 || path[i] >= CELLS || path.indexOf(path[i]) !== i) return false;
      if (i && !adjacent(path[i - 1], path[i])) return false;
    }
    return true;
  }

  // a seeded random: the same numbers from the same seed, for the daily block
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var api = {
    N: N, NEXT: NEXT, WEIGHTS: WEIGHTS,
    load: load, isWord: isWord, isEveryday: isEveryday, size: function () { load(); return WORDS.length; },
    adjacent: adjacent, patches: patches, solve: solve, points: points, deal: deal,
    pathFor: pathFor, pathsFor: pathsFor, spell: spell, fair: fair, mulberry: mulberry
  };
  root.PatchwordRules = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
