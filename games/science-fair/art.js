/* =====================================================================
   Science Fair — the diorama. Everything on the corkboard is built here
   as inline SVG: nine construction-paper planets cut out with slightly
   wobbly scissors, a paper rocket, crinkled-foil asteroids, pushpins.
   game.js hangs these on strings and runs the memory game.
   ===================================================================== */
(function () {
  "use strict";

  // A tiny seeded rng so every cutout's wobble is the same on every visit
  // (the same kid cut them out, after all).
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // A circle cut out by hand: n points, radius jittered, smoothed with
  // quadratic curves through the midpoints.
  function blob(cx, cy, r, seed, jag) {
    var rng = mulberry(seed), n = 18, pts = [], i;
    jag = jag == null ? 0.05 : jag;
    for (i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      var rr = r * (1 + (rng() * 2 - 1) * jag);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    var d = "";
    for (i = 0; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n];
      var mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      if (i === 0) d = "M" + mx.toFixed(1) + " " + my.toFixed(1);
      else d += "Q" + p[0].toFixed(1) + " " + p[1].toFixed(1) + " " + mx.toFixed(1) + " " + my.toFixed(1);
    }
    // close through the first point
    d += "Q" + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1) + " ";
    var m0 = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
    d += m0[0].toFixed(1) + " " + m0[1].toFixed(1) + "Z";
    return d;
  }

  // Crayon shading: a few short arc strokes along the lower-left rim.
  function shade(cx, cy, r, tone) {
    var s = "";
    for (var k = 0; k < 3; k++) {
      var rr = r * (0.62 + k * 0.13);
      s += '<path d="M' + (cx - rr * 0.95) + ' ' + (cy + rr * 0.28) +
        ' Q' + (cx - rr * 0.55) + ' ' + (cy + rr * 1.02) + ' ' + (cx + rr * 0.3) + ' ' + (cy + rr * 0.92) +
        '" fill="none" stroke="' + tone + '" stroke-width="' + (r * 0.09) + '" stroke-linecap="round" opacity="0.32"/>';
    }
    return s;
  }

  function dot(cx, cy, r, fill, op) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '" opacity="' + (op || 1) + '"/>';
  }

  // The hand-cut look: a whisper of turbulence displacing every edge.
  function roughFilter(id) {
    return '<filter id="' + id + '" x="-15%" y="-15%" width="130%" height="130%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="1" seed="7" result="n"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="n" scale="2.6"/></filter>';
  }

  /* The nine cutouts, in order from the sun. r is the base radius in
     SVG units; game.js scales the whole cutout to fit the board. */
  var PLANETS = [
    { name: "Mercury", r: 24, paper: "#b9aca0", deep: "#8f8478" },
    { name: "Venus",   r: 33, paper: "#e3bd57", deep: "#b8933a" },
    { name: "Earth",   r: 35, paper: "#4f8fd0", deep: "#33639c" },
    { name: "Mars",    r: 29, paper: "#d96b45", deep: "#a84a2e" },
    { name: "Jupiter", r: 56, paper: "#ddb187", deep: "#b08055" },
    { name: "Saturn",  r: 44, paper: "#e8d094", deep: "#bfa25e" },
    { name: "Uranus",  r: 39, paper: "#9fd8d4", deep: "#6fa8a4" },
    { name: "Neptune", r: 38, paper: "#5a6fd0", deep: "#3d4d9e" },
    { name: "Pluto",   r: 17, paper: "#c9b8a8", deep: "#9c8b7b" }
  ];

  // Per-planet decoration, drawn inside the cutout.
  function decor(i, c, r) {
    var s = "";
    switch (i) {
      case 0: // Mercury: crayon craters
        s += dot(c - r * 0.3, c - r * 0.25, r * 0.18, "#8f8478", 0.55) +
             dot(c + r * 0.35, c + r * 0.1, r * 0.13, "#8f8478", 0.45) +
             dot(c - r * 0.05, c + r * 0.42, r * 0.1, "#8f8478", 0.5);
        break;
      case 1: // Venus: thick swirl
        s += '<path d="M' + (c - r * 0.7) + ' ' + c + ' Q' + c + ' ' + (c - r * 0.9) + ' ' + (c + r * 0.72) + ' ' + (c - r * 0.15) +
          '" fill="none" stroke="#f2dfa0" stroke-width="' + r * 0.22 + '" stroke-linecap="round" opacity="0.85"/>' +
          '<path d="M' + (c - r * 0.6) + ' ' + (c + r * 0.45) + ' Q' + c + ' ' + (c + r * 0.15) + ' ' + (c + r * 0.62) + ' ' + (c + r * 0.5) +
          '" fill="none" stroke="#c9a244" stroke-width="' + r * 0.16 + '" stroke-linecap="round" opacity="0.7"/>';
        break;
      case 2: // Earth: green paper continents + cotton clouds
        s += '<path d="' + blob(c - r * 0.28, c - r * 0.2, r * 0.34, 21, 0.22) + '" fill="#5da24f"/>' +
             '<path d="' + blob(c + r * 0.38, c + r * 0.3, r * 0.24, 22, 0.25) + '" fill="#5da24f"/>' +
             dot(c + r * 0.2, c - r * 0.45, r * 0.12, "#fff", 0.85) +
             dot(c - r * 0.45, c + r * 0.35, r * 0.1, "#fff", 0.8);
        break;
      case 3: // Mars: white polar cap + a dark scribble
        s += '<path d="' + blob(c, c - r * 0.78, r * 0.26, 31, 0.3) + '" fill="#f4ece2" opacity="0.9"/>' +
             '<path d="' + blob(c + r * 0.22, c + r * 0.18, r * 0.3, 32, 0.3) + '" fill="#a84a2e" opacity="0.6"/>';
        break;
      case 4: // Jupiter: bands + the red spot
        s += '<path d="M' + (c - r * 0.92) + ' ' + (c - r * 0.35) + ' Q' + c + ' ' + (c - r * 0.5) + ' ' + (c + r * 0.92) + ' ' + (c - r * 0.3) +
          '" fill="none" stroke="#c98f5f" stroke-width="' + r * 0.17 + '" stroke-linecap="round"/>' +
          '<path d="M' + (c - r * 0.98) + ' ' + (c + r * 0.08) + ' Q' + c + ' ' + (c - r * 0.06) + ' ' + (c + r * 0.98) + ' ' + (c + r * 0.12) +
          '" fill="none" stroke="#b8764a" stroke-width="' + r * 0.14 + '" stroke-linecap="round"/>' +
          '<path d="M' + (c - r * 0.85) + ' ' + (c + r * 0.48) + ' Q' + c + ' ' + (c + r * 0.36) + ' ' + (c + r * 0.85) + ' ' + (c + r * 0.52) +
          '" fill="none" stroke="#c98f5f" stroke-width="' + r * 0.12 + '" stroke-linecap="round" opacity="0.8"/>' +
          '<ellipse cx="' + (c + r * 0.38) + '" cy="' + (c + r * 0.3) + '" rx="' + r * 0.2 + '" ry="' + r * 0.13 + '" fill="#d95555"/>';
        break;
      case 5: // Saturn's stripes (the ring is hung separately, see svg())
        s += '<path d="M' + (c - r * 0.9) + ' ' + (c - r * 0.25) + ' Q' + c + ' ' + (c - r * 0.38) + ' ' + (c + r * 0.9) + ' ' + (c - r * 0.2) +
          '" fill="none" stroke="#d4b874" stroke-width="' + r * 0.15 + '" stroke-linecap="round"/>' +
          '<path d="M' + (c - r * 0.85) + ' ' + (c + r * 0.3) + ' Q' + c + ' ' + (c + r * 0.18) + ' ' + (c + r * 0.85) + ' ' + (c + r * 0.34) +
          '" fill="none" stroke="#d4b874" stroke-width="' + r * 0.12 + '" stroke-linecap="round" opacity="0.85"/>';
        break;
      case 6: // Uranus: faint vertical ring, 'cause it rolls
        s += '<ellipse cx="' + c + '" cy="' + c + '" rx="' + r * 0.28 + '" ry="' + r * 0.95 + '" fill="none" stroke="#e6f4f3" stroke-width="' + r * 0.09 + '" opacity="0.7"/>';
        break;
      case 7: // Neptune: windy streaks
        s += '<path d="M' + (c - r * 0.7) + ' ' + (c - r * 0.2) + ' q' + r * 0.5 + ' -' + r * 0.25 + ' ' + r * 1.3 + ' 0"' +
          ' fill="none" stroke="#8fa2ec" stroke-width="' + r * 0.13 + '" stroke-linecap="round" opacity="0.85"/>' +
          dot(c - r * 0.25, c + r * 0.3, r * 0.16, "#3d4d9e", 0.7);
        break;
      case 8: // Pluto: its little heart, in crayon
        s += '<path d="M' + c + ' ' + (c + r * 0.42) +
          ' C' + (c - r * 0.75) + ' ' + (c - r * 0.25) + ' ' + (c - r * 0.2) + ' ' + (c - r * 0.75) + ' ' + c + ' ' + (c - r * 0.22) +
          ' C' + (c + r * 0.2) + ' ' + (c - r * 0.75) + ' ' + (c + r * 0.75) + ' ' + (c - r * 0.25) + ' ' + c + ' ' + (c + r * 0.42) +
          'Z" fill="#e8b3a5" opacity="0.9"/>';
        break;
    }
    return s;
  }

  /* One hanging cutout as a complete <svg>. Box is (2r+pad)^2; Saturn's
     box is wider so the paper ring fits. Returns { html, w, h, cx, cy }
     in unscaled units — game.js sets the final on-screen width. */
  function planetSVG(i) {
    var p = PLANETS[i], r = p.r, pad = 8;
    var w = 2 * r + pad * 2, h = w, cx = w / 2, cy = h / 2;
    if (i === 5) { w = r * 4.2; cx = w / 2; }               // room for the ring
    var fid = "rough-p" + i;
    var s = '<svg viewBox="0 0 ' + w + " " + h + '" aria-hidden="true"><defs>' + roughFilter(fid) + "</defs>";
    s += '<g filter="url(#' + fid + ')">';
    if (i === 5) {
      // back half of the paper ring
      s += '<g transform="rotate(-16 ' + cx + " " + cy + ')">' +
        '<path d="M' + (cx - r * 1.9) + " " + cy + " A" + r * 1.9 + " " + r * 0.55 + " 0 0 1 " + (cx + r * 1.9) + " " + cy + '"' +
        ' fill="none" stroke="#d9b46a" stroke-width="' + r * 0.34 + '"/></g>';
    }
    s += '<path d="' + blob(cx, cy, r, 100 + i, 0.05) + '" fill="' + p.paper + '"/>';
    s += decor2(i, cx, cy, r);
    s += shade(cx, cy, r, p.deep);
    if (i === 5) {
      // front half of the ring passes over the disc
      s += '<g transform="rotate(-16 ' + cx + " " + cy + ')">' +
        '<path d="M' + (cx - r * 1.9) + " " + cy + " A" + r * 1.9 + " " + r * 0.55 + " 0 0 0 " + (cx + r * 1.9) + " " + cy + '"' +
        ' fill="none" stroke="#e6c485" stroke-width="' + r * 0.34 + '"/></g>';
    }
    // a glue-stick highlight
    s += dot(cx - r * 0.38, cy - r * 0.42, r * 0.13, "#ffffff", 0.35);
    s += "</g></svg>";
    return { html: s, w: w, h: h, cx: cx, cy: cy, r: r };
  }
  // decor is centered on (c, c) for square boxes; Saturn's box is wide,
  // so route through a translated wrapper instead.
  function decor2(i, cx, cy, r) {
    var raw = decor(i, cy, r);                 // built against the square box
    if (cx === cy) return raw;
    return '<g transform="translate(' + (cx - cy) + ' 0)">' + raw + "</g>";
  }

  /* The class rocket: red construction paper, foil window, flame. */
  function rocketSVG() {
    return '<svg viewBox="0 0 60 96" aria-hidden="true"><defs>' + roughFilter("rough-shp") + "</defs>" +
      '<g filter="url(#rough-shp)">' +
      '<g class="flame"><path d="M22 78 Q30 96 38 78 Q34 84 30 82 Q26 84 22 78Z" fill="#f2a33c"/>' +
      '<path d="M26 78 Q30 89 34 78Z" fill="#ffe08a"/></g>' +
      '<path d="M14 62 L6 78 L20 72Z" fill="#a84a2e"/>' +
      '<path d="M46 62 L54 78 L40 72Z" fill="#a84a2e"/>' +
      '<path d="M20 30 Q20 12 30 4 Q40 12 40 30 L40 72 Q30 78 20 72Z" fill="#d95555"/>' +
      '<path d="M20 30 Q30 24 40 30 L40 40 Q30 34 20 40Z" fill="#f4ece2"/>' +
      '<circle cx="30" cy="52" r="8" fill="#bcd6ee" stroke="#f4ece2" stroke-width="3"/>' +
      '<circle cx="27" cy="49" r="2.4" fill="#ffffff" opacity="0.9"/>' +
      "</g></svg>";
  }

  /* A crinkled-foil asteroid: gray facets and specular glints. */
  function asteroidSVG(seed) {
    var rng = mulberry(seed), n = 9, pts = [], i;
    for (i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2, rr = 20 * (0.72 + rng() * 0.5);
      pts.push([32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr]);
    }
    var d = "M" + pts.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("L") + "Z";
    var s = '<svg viewBox="0 0 64 64" aria-hidden="true">' +
      '<path d="' + d + '" fill="#aab0b8" stroke="#8a9099" stroke-width="1.5"/>';
    for (i = 0; i < 4; i++) {
      var j = Math.floor(rng() * n), k = (j + 2 + Math.floor(rng() * 3)) % n;
      s += '<path d="M' + pts[j][0] + " " + pts[j][1] + " L32 32 L" + pts[k][0] + " " + pts[k][1] + 'Z" fill="' +
        (rng() < 0.5 ? "#c8ccd2" : "#969ca6") + '" opacity="0.85"/>';
    }
    s += dot(26 + rng() * 8, 24 + rng() * 8, 2.4, "#f2f5f8", 0.95) +
         dot(20 + rng() * 20, 30 + rng() * 10, 1.6, "#ffffff", 0.9) +
      "</svg>";
    return s;
  }

  /* A pushpin for the corkboard, in a classroom color. */
  function pinHTML(color) {
    return '<span class="pin" style="--pin:' + color + '"></span>';
  }

  /* A five-point construction-paper star with glitter-glue dots. */
  function starSVG(seed) {
    var rng = mulberry(seed), pts = [], i;
    for (i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + (i * Math.PI) / 5;
      var rr = (i % 2 === 0 ? 22 : 9.5) * (0.94 + rng() * 0.12);
      pts.push((26 + Math.cos(a) * rr).toFixed(1) + " " + (26 + Math.sin(a) * rr).toFixed(1));
    }
    var s = '<svg viewBox="0 0 52 52" aria-hidden="true">' +
      '<path d="M' + pts.join("L") + 'Z" fill="' + (rng() < 0.3 ? "#f2de7a" : "#f2c245") + '" stroke="#d9a52e" stroke-width="1"/>';
    for (i = 0; i < 3; i++) s += dot(16 + rng() * 20, 16 + rng() * 20, 1.6, "#fffbe8", 0.95);
    return s + "</svg>";
  }

  /* The smiling paper sun that peeks in from the corner. */
  function sunSVG() {
    var s = '<svg viewBox="0 0 200 200" aria-hidden="true"><defs>' + roughFilter("rough-sun") + "</defs>" +
      '<g filter="url(#rough-sun)">';
    for (var i = 0; i < 12; i++) {
      var a = (i / 12) * Math.PI * 2;
      var x1 = 100 + Math.cos(a - 0.13) * 62, y1 = 100 + Math.sin(a - 0.13) * 62;
      var x2 = 100 + Math.cos(a + 0.13) * 62, y2 = 100 + Math.sin(a + 0.13) * 62;
      var xt = 100 + Math.cos(a) * 96, yt = 100 + Math.sin(a) * 96;
      s += '<path d="M' + x1.toFixed(1) + " " + y1.toFixed(1) + " L" + xt.toFixed(1) + " " + yt.toFixed(1) +
        " L" + x2.toFixed(1) + " " + y2.toFixed(1) + 'Z" fill="#e9a23b"/>';
    }
    s += '<path d="' + blob(100, 100, 64, 55, 0.04) + '" fill="#f2c245"/>';
    // crayon face
    s += '<circle cx="80" cy="90" r="5" fill="#a8741f"/><circle cx="120" cy="90" r="5" fill="#a8741f"/>' +
      '<path d="M76 112 Q100 130 124 112" fill="none" stroke="#a8741f" stroke-width="5" stroke-linecap="round"/>' +
      dot(74, 74, 8, "#ffffff", 0.35);
    return s + "</g></svg>";
  }

  window.SciArt = {
    PLANETS: PLANETS,
    planetSVG: planetSVG,
    rocketSVG: rocketSVG,
    asteroidSVG: asteroidSVG,
    pinHTML: pinHTML,
    starSVG: starSVG,
    sunSVG: sunSVG,
    mulberry: mulberry
  };
})();
