/* =====================================================================
   Lights Out — the picture house's marquee. Each cell of the board is a
   big sign bulb built here as inline SVG: a chromed socket with a
   reflector dish, and its glass globe drawn twice, dark (smoked glass, a
   cold filament) and lit (white-hot centre, amber rim). game.js fades the
   lit one in and out. The chaser, the ring of small bulbs round the sign,
   is drawn here too.
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

  /* Shared <defs>: chrome, the dish, the glass dark and lit. Injected once. */
  function defsSVG() {
    return '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
      '<linearGradient id="lo-chrome" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#f4f8f9"/><stop offset="0.32" stop-color="#93a0a4"/>' +
      '<stop offset="0.5" stop-color="#e2eaec"/><stop offset="0.8" stop-color="#56636a"/>' +
      '<stop offset="1" stop-color="#b4c0c4"/></linearGradient>' +
      '<radialGradient id="lo-shade" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0.78" stop-color="#000" stop-opacity="0.6"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="lo-dish" cx="0.42" cy="0.36" r="0.75">' +
      '<stop offset="0" stop-color="#343d3f"/><stop offset="0.7" stop-color="#1a2022"/>' +
      '<stop offset="1" stop-color="#0c1011"/></radialGradient>' +
      '<radialGradient id="lo-dish-lit" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0.55" stop-color="#ffd58a"/><stop offset="0.82" stop-color="#d98a2c"/>' +
      '<stop offset="1" stop-color="#6b3d12"/></radialGradient>' +
      '<radialGradient id="lo-glass" cx="0.38" cy="0.32" r="0.8">' +
      '<stop offset="0" stop-color="#655c50"/><stop offset="0.5" stop-color="#332d26"/>' +
      '<stop offset="1" stop-color="#16120e"/></radialGradient>' +
      '<radialGradient id="lo-lit" cx="0.5" cy="0.48" r="0.52">' +
      '<stop offset="0" stop-color="#fffef4"/><stop offset="0.3" stop-color="#fff2c0"/>' +
      '<stop offset="0.62" stop-color="#ffcd66"/><stop offset="0.9" stop-color="#f7a128"/>' +
      '<stop offset="1" stop-color="#e58413"/></radialGradient>' +
      '<radialGradient id="lo-pea" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0" stop-color="#fffdf0"/><stop offset="0.55" stop-color="#ffe9ae"/>' +
      '<stop offset="1" stop-color="#ffc260"/></radialGradient>' +
      '<radialGradient id="lo-pea-halo" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0" stop-color="#ffd890" stop-opacity="0.55"/><stop offset="1" stop-color="#ffd890" stop-opacity="0"/></radialGradient>' +
      "</defs></svg>";
  }

  /* Everything is drawn in a 100x100 box round (50, 50): the socket's
     chrome rim out to 46, the dish to 41, the globe to 30. */
  var FILAMENT = "M46.5 66 L43.5 52 q1.6 -4.6 3.25 0 t3.25 0 t3.25 0 t3.25 0 L53.5 66";

  /* The socket and the bulb as it sits dark: a soft shadow on the board,
     the chrome rim, the reflector dish, smoked glass and a cold filament. */
  function socketSVG() {
    return '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<circle cx="51.5" cy="53" r="49" fill="url(#lo-shade)"/>' +
      '<circle cx="50" cy="50" r="46" fill="url(#lo-chrome)"/>' +
      '<circle cx="50" cy="50" r="46" fill="none" stroke="#1c2224" stroke-width="0.8"/>' +
      '<circle cx="50" cy="50" r="41" fill="url(#lo-dish)" stroke="#06090a" stroke-width="1.2"/>' +
      '<circle cx="50" cy="50" r="30" fill="url(#lo-glass)" stroke="#0a0908" stroke-width="0.9"/>' +
      '<path d="' + FILAMENT + '" fill="none" stroke="#9a8a72" stroke-width="1.3" stroke-linejoin="round" opacity="0.75"/>' +
      '<path d="M32 38 A 22 22 0 0 1 51 27.5" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round" opacity="0.2"/>' +
      "</svg>";
  }

  /* The same bulb burning. Same box and radii, so it covers the dark one
     exactly: the dish catches the light, the globe goes white-hot at the
     heart, and the rim picks up a warm edge. */
  function litSVG() {
    return '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<circle cx="50" cy="50" r="46" fill="none" stroke="#ffe4ac" stroke-width="2" opacity="0.55"/>' +
      '<circle cx="50" cy="50" r="41" fill="url(#lo-dish-lit)"/>' +
      '<circle cx="50" cy="50" r="30" fill="url(#lo-lit)"/>' +
      '<path d="' + FILAMENT + '" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" opacity="0.85"/>' +
      '<path d="M32 38 A 22 22 0 0 1 51 27.5" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round" opacity="0.5"/>' +
      "</svg>";
  }

  /* The chaser: small bulbs running round a w x h sign, down the middle
     of a border `band` wide. Every bulb is drawn dark, then lit ones over
     them in three groups (.ph0 .ph1 .ph2, every third bulb each) that
     styles.css dims in turn, so the count is kept a multiple of three. */
  function chaserSVG(w, h, band) {
    var r = band * 0.2, half = band / 2, pitch = band * 1.3, i;
    var kx = Math.max(3, Math.round((w - band) / pitch)), ky = Math.max(3, Math.round((h - band) / pitch));
    while ((2 * (kx + ky)) % 3) kx++;
    var pts = [];
    for (i = 0; i < kx; i++) pts.push([half + (w - band) * i / kx, half]);
    for (i = 0; i < ky; i++) pts.push([w - half, half + (h - band) * i / ky]);
    for (i = 0; i < kx; i++) pts.push([w - half - (w - band) * i / kx, h - half]);
    for (i = 0; i < ky; i++) pts.push([half, h - half - (h - band) * i / ky]);
    var dark = "", ph = ["", "", ""];
    pts.forEach(function (p, k) {
      var at = 'cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '"';
      dark += "<circle " + at + ' r="' + r.toFixed(1) + '"/>';
      ph[k % 3] += "<circle " + at + ' r="' + (r * 2.7).toFixed(1) + '" fill="url(#lo-pea-halo)"/>' +
        "<circle " + at + ' r="' + r.toFixed(1) + '" fill="url(#lo-pea)"/>';
    });
    return '<svg class="chase" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true">' +
      '<g fill="#2b3132" stroke="#5d696c" stroke-width="0.7">' + dark + "</g>" +
      '<g class="lights"><g class="ph ph0">' + ph[0] + '</g><g class="ph ph1">' + ph[1] + '</g><g class="ph ph2">' + ph[2] + "</g></g></svg>";
  }

  window.LoArt = {
    defsSVG: defsSVG,
    socketSVG: socketSVG,
    litSVG: litSVG,
    chaserSVG: chaserSVG,
    mulberry: mulberry
  };
})();
