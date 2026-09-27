/* =====================================================================
   Lights Out — the watchmaker's tray. Each cell of the board is a hunter
   pocket watch built here as inline SVG: an engine-turned brass lid, a
   white enamel dial with blued-steel hands, a hinge on the left and the
   crown-and-bow up top. game.js swings the lids.
   ===================================================================== */
(function () {
  "use strict";

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Shared <defs>: brass gradients, enamel sheen. Injected once. */
  function defsSVG() {
    return '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
      '<radialGradient id="lo-brass" cx="0.35" cy="0.3" r="1">' +
      '<stop offset="0" stop-color="#e8cf96"/><stop offset="0.55" stop-color="#c2a15c"/>' +
      '<stop offset="0.85" stop-color="#8f6f35"/><stop offset="1" stop-color="#6e5426"/></radialGradient>' +
      '<radialGradient id="lo-brass-in" cx="0.6" cy="0.65" r="1">' +
      '<stop offset="0" stop-color="#f4e3b4"/><stop offset="0.6" stop-color="#d9ba79"/>' +
      '<stop offset="1" stop-color="#a5824a"/></radialGradient>' +
      '<radialGradient id="lo-enamel" cx="0.4" cy="0.35" r="0.95">' +
      '<stop offset="0" stop-color="#fffdf6"/><stop offset="0.75" stop-color="#f6f1e2"/>' +
      '<stop offset="1" stop-color="#e3dbc4"/></radialGradient>' +
      '<linearGradient id="lo-steel" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#3d5aa8"/><stop offset="1" stop-color="#1d2c56"/></linearGradient>' +
      "</defs></svg>";
  }

  /* The case: brass ring, hinge knuckle on the left, bow and crown on top.
     Everything is drawn in a 100x116 box; the dial circle is centred at
     (50, 62) with radius 44. */
  var CX = 50, CY = 62, R = 44;

  function caseSVG() {
    var s = '<svg viewBox="0 0 100 116" aria-hidden="true">';
    // bow (the carrying loop) and crown
    s += '<circle cx="50" cy="8" r="7.5" fill="none" stroke="url(#lo-brass)" stroke-width="3.4"/>' +
      '<rect x="44.5" y="12" width="11" height="8" rx="2.4" fill="url(#lo-brass)"/>' +
      '<path d="M45 13.5 h11 M45 15.8 h11 M45 18.1 h11" stroke="#7a5e2c" stroke-width="0.9"/>';
    // case band
    s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + (R + 4) + '" fill="url(#lo-brass)"/>' +
      '<circle cx="' + CX + '" cy="' + CY + '" r="' + (R + 4) + '" fill="none" stroke="#5d4620" stroke-width="1"/>';
    // hinge knuckle, left side
    s += '<rect x="0.5" y="54" width="7" height="16" rx="3.4" fill="url(#lo-brass)" stroke="#5d4620" stroke-width="0.8"/>' +
      '<path d="M4 57 h0.01 M4 62 h0.01 M4 67 h0.01" stroke="#5d4620" stroke-width="1.6" stroke-linecap="round"/>';
    return s + "</svg>";
  }

  /* The enamel dial with a full minute track, numerals at the quarters
     and blued-steel hands. The hand groups carry classes so game.js can
     rotate them to the actual time of day. */
  function dialSVG() {
    var i, a, s = '<svg viewBox="0 0 100 116" aria-hidden="true">';
    s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="url(#lo-enamel)"/>';
    // minute track
    for (i = 0; i < 60; i++) {
      a = (i / 60) * Math.PI * 2;
      var r1 = i % 5 === 0 ? R - 6.5 : R - 4;
      s += '<line x1="' + (CX + Math.sin(a) * r1).toFixed(1) + '" y1="' + (CY - Math.cos(a) * r1).toFixed(1) +
        '" x2="' + (CX + Math.sin(a) * (R - 1.8)).toFixed(1) + '" y2="' + (CY - Math.cos(a) * (R - 1.8)).toFixed(1) +
        '" stroke="#2a2a33" stroke-width="' + (i % 5 === 0 ? 1.5 : 0.7) + '"/>';
    }
    // quarter numerals
    s += '<g fill="#22222b" font-family="Georgia, \'Times New Roman\', serif" text-anchor="middle" font-size="13">' +
      '<text x="' + CX + '" y="' + (CY - R + 20) + '">XII</text>' +
      '<text x="' + (CX + R - 13) + '" y="' + (CY + 4.5) + '">III</text>' +
      '<text x="' + CX + '" y="' + (CY + R - 11) + '">VI</text>' +
      '<text x="' + (CX - R + 13) + '" y="' + (CY + 4.5) + '">IX</text></g>';
    // maker's mark
    s += '<text x="' + CX + '" y="' + (CY - 12) + '" fill="#6b6a5d" font-family="Georgia, serif" font-size="4.6" ' +
      'text-anchor="middle" letter-spacing="0.8">S.&#8202;LU &amp; CO.</text>' +
      '<text x="' + CX + '" y="' + (CY + 18) + '" fill="#8a897b" font-family="Georgia, serif" font-size="3.8" text-anchor="middle">LEVER SET</text>';
    // blued-steel hands: spade hour, whip minute, needle second
    s += '<g class="lo-hh" style="transform-origin:' + CX + "px " + CY + 'px">' +
      '<path d="M50 62 L47.5 52 Q50 42 52.5 52 Z M48.9 47 a3.4 3.4 0 1 0 2.2 0" fill="url(#lo-steel)"/></g>';
    s += '<g class="lo-mm" style="transform-origin:' + CX + "px " + CY + 'px">' +
      '<path d="M48.9 62 L49.5 28 L50.5 28 L51.1 62 Z" fill="url(#lo-steel)"/></g>';
    s += '<g class="lo-sec" style="transform-origin:' + CX + "px " + CY + 'px">' +
      '<line x1="50" y1="66" x2="50" y2="24.5" stroke="#8a2f2a" stroke-width="0.9"/>' +
      '<circle cx="50" cy="66" r="1.6" fill="#8a2f2a"/></g>';
    s += '<circle cx="' + CX + '" cy="' + CY + '" r="2.2" fill="#1d2c56"/>';
    // glass: a soft crescent of glare
    s += '<path d="M' + (CX - 26) + " " + (CY - 24) + " A 34 34 0 0 1 " + (CX + 20) + " " + (CY - 30) +
      '" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity="0.28"/>';
    return s + "</svg>";
  }

  /* The lid, engine-turned. Front face: guilloché rays, a rope-edge rim
     and an empty monogram cartouche. Same box as the dial so it covers
     it exactly; the hinge is on the left. */
  function lidSVG(seed) {
    var rng = mulberry(seed || 7), i, a;
    var s = '<svg viewBox="0 0 100 116" aria-hidden="true">';
    s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + (R + 2.5) + '" fill="url(#lo-brass)"/>';
    // rope edge
    s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + (R - 1.5) + '" fill="none" stroke="#7a5e2c" stroke-width="1"/>' +
      '<circle cx="' + CX + '" cy="' + CY + '" r="' + (R + 1) + '" fill="none" stroke="#f0dfae" stroke-width="0.8" opacity="0.8"/>';
    // guilloché: radial fan
    for (i = 0; i < 36; i++) {
      a = (i / 36) * Math.PI * 2 + rng() * 0.02;
      s += '<line x1="' + (CX + Math.sin(a) * 13).toFixed(1) + '" y1="' + (CY - Math.cos(a) * 13).toFixed(1) +
        '" x2="' + (CX + Math.sin(a) * (R - 3)).toFixed(1) + '" y2="' + (CY - Math.cos(a) * (R - 3)).toFixed(1) +
        '" stroke="#7a5e2c" stroke-width="0.55" opacity="0.55"/>';
    }
    // engine-turned rings
    for (i = 0; i < 4; i++) {
      s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + (16 + i * 7) + '" fill="none" stroke="#8a6a30" stroke-width="0.5" opacity="0.5"/>';
    }
    // cartouche
    s += '<ellipse cx="' + CX + '" cy="' + CY + '" rx="12.5" ry="9.5" fill="url(#lo-brass-in)" stroke="#7a5e2c" stroke-width="0.9"/>' +
      '<ellipse cx="' + CX + '" cy="' + CY + '" rx="10" ry="7.2" fill="none" stroke="#8a6a30" stroke-width="0.5" opacity="0.7"/>';
    // lip to catch a thumbnail, opposite the hinge
    s += '<path d="M' + (CX + R - 1) + " " + (CY - 5) + " q4 5 0 10" + '" fill="none" stroke="#f0dfae" stroke-width="1.6" opacity="0.9"/>';
    return s + "</svg>";
  }

  /* Interior of the lid — mirror-polished, seen while it stands open. */
  function lidBackSVG() {
    return '<svg viewBox="0 0 100 116" aria-hidden="true">' +
      '<circle cx="' + CX + '" cy="' + CY + '" r="' + (R + 2.5) + '" fill="url(#lo-brass-in)"/>' +
      '<circle cx="' + CX + '" cy="' + CY + '" r="' + (R - 4) + '" fill="none" stroke="#b28e4e" stroke-width="0.8" opacity="0.7"/>' +
      '<path d="M' + (CX - 24) + " " + (CY - 20) + " A 30 30 0 0 1 " + (CX + 16) + " " + (CY - 27) +
      '" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.4"/></svg>';
  }

  window.LoArt = {
    defsSVG: defsSVG,
    caseSVG: caseSVG,
    dialSVG: dialSVG,
    lidSVG: lidSVG,
    lidBackSVG: lidBackSVG,
    mulberry: mulberry
  };
})();
