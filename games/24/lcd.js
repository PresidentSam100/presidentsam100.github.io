/* =====================================================================
   24 — the 84×48 monochrome LCD.

   A 1-bit framebuffer at the real resolution of a 2000s candybar phone,
   three hand-drawn bitmap fonts, and a renderer that paints each LCD
   pixel as a dark square on the green backlight: a thin gap between
   pixels, a faint shadow on the backlight layer, and a slow fade when a
   pixel turns off (the old LCD "ghosting"; off when Visual FX is off).

   TwentyFourLCD(canvas) -> {
     W, H, clear(), px(x, y, on), fill(x, y, w, h, on), frame(x, y, w, h, on),
     text(str, x, y, font, on) -> width, width(str, font), fonts,
     resize(cssWidth), render(fx), missing
   }
   Glyph rows are strings ('#' lit). Font M has 7 rows above the baseline
   and 2 descender rows; B (card digits) is 9 rows; S is 5 rows.
   ===================================================================== */
window.TwentyFourLCD = function (canvas) {
  "use strict";
  var W = 84, H = 48;
  var fb = new Uint8Array(W * H), glow = new Float32Array(W * H);

  function font(def, height, gap) {
    var f = { height: height, gap: gap, glyphs: {} };
    Object.keys(def).forEach(function (ch) {
      var rows = def[ch].split("|");
      f.glyphs[ch] = { w: rows[0].length, rows: rows };
    });
    return f;
  }
  // 5×7 text (proportional), with descenders for g j p q y and the comma.
  var M = font({
    " ": "...", "A": ".###.|#...#|#...#|#####|#...#|#...#|#...#", "B": "####.|#...#|#...#|####.|#...#|#...#|####.",
    "C": ".###.|#...#|#....|#....|#....|#...#|.###.", "D": "####.|#...#|#...#|#...#|#...#|#...#|####.",
    "E": "#####|#....|#....|####.|#....|#....|#####", "F": "#####|#....|#....|####.|#....|#....|#....",
    "G": ".###.|#...#|#....|#.###|#...#|#...#|.####", "H": "#...#|#...#|#...#|#####|#...#|#...#|#...#",
    "I": "###|.#.|.#.|.#.|.#.|.#.|###", "J": "..###|...#.|...#.|...#.|#..#.|#..#.|.##..",
    "K": "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#", "L": "#....|#....|#....|#....|#....|#....|#####",
    "M": "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#", "N": "#...#|#...#|##..#|#.#.#|#..##|#...#|#...#",
    "O": ".###.|#...#|#...#|#...#|#...#|#...#|.###.", "P": "####.|#...#|#...#|####.|#....|#....|#....",
    "Q": ".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#", "R": "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
    "S": ".####|#....|#....|.###.|....#|....#|####.", "T": "#####|..#..|..#..|..#..|..#..|..#..|..#..",
    "U": "#...#|#...#|#...#|#...#|#...#|#...#|.###.", "V": "#...#|#...#|#...#|#...#|#...#|.#.#.|..#..",
    "W": "#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.", "X": "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
    "Y": "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..", "Z": "#####|....#|...#.|..#..|.#...|#....|#####",
    "a": ".....|.....|.###.|....#|.####|#...#|.####", "b": "#....|#....|####.|#...#|#...#|#...#|####.",
    "c": "....|....|.###|#...|#...|#...|.###", "d": "....#|....#|.####|#...#|#...#|#...#|.####",
    "e": ".....|.....|.###.|#...#|#####|#....|.###.", "f": "..##|.#..|####|.#..|.#..|.#..|.#..",
    "g": ".....|.....|.####|#...#|#...#|#...#|.####|....#|.###.", "h": "#....|#....|####.|#...#|#...#|#...#|#...#",
    "i": "#|.|#|#|#|#|#", "j": "..#|...|..#|..#|..#|..#|..#|#.#|.#.", "k": "#...|#...|#..#|#.#.|##..|#.#.|#..#",
    "l": "#.|#.|#.|#.|#.|#.|.#", "m": ".....|.....|##.#.|#.#.#|#.#.#|#.#.#|#.#.#", "n": ".....|.....|####.|#...#|#...#|#...#|#...#",
    "o": ".....|.....|.###.|#...#|#...#|#...#|.###.", "p": ".....|.....|####.|#...#|#...#|#...#|####.|#....|#....",
    "q": ".....|.....|.####|#...#|#...#|#...#|.####|....#|....#", "r": "....|....|#.##|##..|#...|#...|#...",
    "s": "....|....|.###|#...|.##.|...#|###.", "t": ".#..|.#..|####|.#..|.#..|.#..|..##",
    "u": ".....|.....|#...#|#...#|#...#|#...#|.####", "v": ".....|.....|#...#|#...#|#...#|.#.#.|..#..",
    "w": ".....|.....|#...#|#...#|#.#.#|#.#.#|.#.#.", "x": ".....|.....|#...#|.#.#.|..#..|.#.#.|#...#",
    "y": ".....|.....|#...#|#...#|#...#|#...#|.####|....#|.###.", "z": ".....|.....|#####|...#.|..#..|.#...|#####",
    "0": ".###.|#...#|#..##|#.#.#|##..#|#...#|.###.", "1": "..#..|.##..|..#..|..#..|..#..|..#..|.###.",
    "2": ".###.|#...#|....#|...#.|..#..|.#...|#####", "3": "####.|....#|....#|.###.|....#|....#|####.",
    "4": "...#.|..##.|.#.#.|#..#.|#####|...#.|...#.", "5": "#####|#....|####.|....#|....#|#...#|.###.",
    "6": "..##.|.#...|#....|####.|#...#|#...#|.###.", "7": "#####|....#|...#.|..#..|.#...|.#...|.#...",
    "8": ".###.|#...#|#...#|.###.|#...#|#...#|.###.", "9": ".###.|#...#|#...#|.####|....#|...#.|.##..",
    ".": ".|.|.|.|.|.|#", ",": "..|..|..|..|..|.#|.#|#.", ":": ".|.|#|.|.|#|.", "!": "#|#|#|#|#|.|#",
    "?": ".###.|#...#|....#|...#.|..#..|.....|..#..", "'": "#|#", "-": "....|....|....|####|....|....|....",
    "+": ".....|..#..|..#..|#####|..#..|..#..|.....", "×": ".....|#...#|.#.#.|..#..|.#.#.|#...#|.....",
    "÷": ".....|..#..|.....|#####|.....|..#..|.....", "=": ".....|.....|#####|.....|#####|.....|.....",
    "/": "....#|....#|...#.|..#..|.#...|#....|#....", "(": "..#|.#.|#..|#..|#..|.#.|..#", ")": "#..|.#.|..#|..#|..#|.#.|#..",
    "*": ".....|..#..|#.#.#|.###.|#.#.#|..#..|.....", "#": ".#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.",
    "·": ".|.|.|#|.|.|.", "▲": ".....|.....|..#..|.###.|#####|.....|.....", "▼": ".....|.....|#####|.###.|..#..|.....|.....",
    "✓": ".....|....#|...#.|#.#..|.#...|.....|.....",
    "_": ".....|.....|.....|.....|.....|.....|.....|#####",
  }, 9, 1);
  // Bold card digits, 6×9.
  var B = font({
    "0": ".####.|##..##|##..##|##..##|##..##|##..##|##..##|##..##|.####.",
    "1": "..##..|.###..|..##..|..##..|..##..|..##..|..##..|..##..|.####.",
    "2": ".####.|##..##|....##|...##.|..##..|.##...|##....|##....|######",
    "3": ".####.|##..##|....##|..###.|....##|....##|....##|##..##|.####.",
    "4": "...##.|..###.|.####.|##.##.|##.##.|######|...##.|...##.|...##.",
    "5": "######|##....|##....|#####.|....##|....##|....##|##..##|.####.",
    "6": ".####.|##..##|##....|#####.|##..##|##..##|##..##|##..##|.####.",
    "7": "######|....##|....##|...##.|..##..|..##..|.##...|.##...|.##...",
    "8": ".####.|##..##|##..##|.####.|##..##|##..##|##..##|##..##|.####.",
    "9": ".####.|##..##|##..##|##..##|.#####|....##|....##|##..##|.####.",
    "-": "....|....|....|....|####|....|....|....|....", "!": "##|##|##|##|##|##|..|##|##",
    " ": "...",
  }, 9, 1);
  // Tiny digits for stacked fractions and numbers too long for B.
  var S = font({
    "0": "###|#.#|#.#|#.#|###", "1": ".#.|##.|.#.|.#.|###", "2": "###|..#|###|#..|###", "3": "###|..#|.##|..#|###",
    "4": "#.#|#.#|###|..#|..#", "5": "###|#..|###|..#|###", "6": "###|#..|###|#.#|###", "7": "###|..#|..#|.#.|.#.",
    "8": "###|#.#|###|#.#|###", "9": "###|#.#|###|..#|###", "-": "...|...|###|...|...", "/": "..#|..#|.#.|#..|#..", " ": "..",
  }, 5, 1);
  var fonts = { M: M, B: B, S: S };
  var missing = {};

  function clear() { fb.fill(0); }
  function px(x, y, on) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    fb[y * W + x] = on === false || on === 0 ? 0 : 1;
  }
  function fill(x, y, w, h, on) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) px(x + i, y + j, on); }
  // A 1-px outline with the corner pixels left out (a rounded box).
  function frame(x, y, w, h, on) {
    for (var i = 1; i < w - 1; i++) { px(x + i, y, on); px(x + i, y + h - 1, on); }
    for (var j = 1; j < h - 1; j++) { px(x, y + j, on); px(x + w - 1, y + j, on); }
  }
  function glyphOf(f, ch) {
    var g = f.glyphs[ch];
    if (!g) {
      if (!missing[ch]) { missing[ch] = true; if (window.console) console.warn("24 LCD: no glyph for " + JSON.stringify(ch)); }
      return null;
    }
    return g;
  }
  function width(str, f) {
    f = typeof f === "string" ? fonts[f] : f || M;
    var w = 0;
    for (var k = 0; k < str.length; k++) {
      var g = f.glyphs[str.charAt(k)];
      w += (g ? g.w : 3) + (k < str.length - 1 ? f.gap : 0);
    }
    return w;
  }
  function text(str, x, y, f, on) {
    f = typeof f === "string" ? fonts[f] : f || M;
    var cx = x;
    for (var k = 0; k < str.length; k++) {
      var g = glyphOf(f, str.charAt(k));
      if (!g) { frame(cx, y, 3, 7, on); cx += 3 + f.gap; continue; }   // a box marks a missing glyph
      for (var r = 0; r < g.rows.length; r++) {
        var row = g.rows[r];
        for (var c = 0; c < row.length; c++) if (row.charAt(c) === "#") px(cx + c, y + r, on);
      }
      cx += g.w + f.gap;
    }
    return cx - x - (str.length ? f.gap : 0);
  }

  // ---- painting --------------------------------------------------------------
  var ctx = canvas.getContext("2d"), S2 = 4;
  var LIGHT = "#c7f0d8", DARK = [67, 82, 61];   // backlight and pixel colours
  // Choose a whole number of device pixels per LCD pixel, so the grid never
  // shimmers at 125% / 150% display scaling, then size the canvas from that.
  var bg = document.createElement("canvas");
  function resize(cssWidth) {
    var dpr = window.devicePixelRatio || 1;
    S2 = Math.max(2, Math.floor(cssWidth * dpr / W));
    canvas.width = bg.width = W * S2;
    canvas.height = bg.height = H * S2;
    canvas.style.width = (W * S2 / dpr) + "px";
    canvas.style.height = (H * S2 / dpr) + "px";
    // The backlight and the unlit matrix never change: paint them once.
    var b = bg.getContext("2d"), sz = S2 - Math.max(1, Math.round(S2 * 0.14));
    b.fillStyle = LIGHT;
    b.fillRect(0, 0, bg.width, bg.height);
    b.fillStyle = "rgba(67,82,61,0.05)";   // real LCDs show their grid faintly
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) b.fillRect(x * S2, y * S2, sz, sz);
    return S2;
  }
  // Returns true while pixels are still fading (keep rendering).
  function render(fx) {
    var gap = Math.max(1, Math.round(S2 * 0.14)), sz = S2 - gap, sh = Math.max(1, Math.round(S2 * 0.18)), settling = false;
    for (var i = 0; i < fb.length; i++) {
      var t = fb[i];
      if (!fx) glow[i] = t;
      else glow[i] += (t - glow[i]) * (t > glow[i] ? 0.8 : 0.4);    // on fast, off a little slower
      if (glow[i] < 0.02) glow[i] = 0;
      else if (glow[i] > 0.98) glow[i] = 1;
      if (glow[i] !== t) settling = true;
    }
    ctx.drawImage(bg, 0, 0);
    // Shadows on the backlight layer, then the pixels.
    for (var pass = 0; pass < 2; pass++) {
      for (var j = 0; j < fb.length; j++) {
        var v = glow[j];
        if (!v) continue;
        var px0 = (j % W) * S2, py0 = Math.floor(j / W) * S2;
        if (pass === 0) {
          ctx.fillStyle = "rgba(40,50,35," + (0.16 * v).toFixed(3) + ")";
          ctx.fillRect(px0 + sh, py0 + sh, sz, sz);
        } else {
          ctx.fillStyle = "rgba(" + DARK[0] + "," + DARK[1] + "," + DARK[2] + "," + (0.12 + 0.88 * v).toFixed(3) + ")";
          ctx.fillRect(px0, py0, sz, sz);
        }
      }
    }
    return settling;
  }
  return { W: W, H: H, clear: clear, px: px, fill: fill, frame: frame, text: text, width: width, fonts: fonts, resize: resize, render: render, missing: missing, fb: fb };
};
