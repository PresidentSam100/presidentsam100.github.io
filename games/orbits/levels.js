/* =====================================================================
   Orbits: the charts. Thirty, on six plates of five, each plate bringing
   in one new thing (its hint is the first line a chart shows).

   A chart: its start mark, the opening push ([bearing, strength] in
   tenths), suns [x, y, size] (1 small, 2, 3 large: physics.js's SUNS),
   gates [x, y] or [x, y, 2] for a ring that lights on its second pass,
   ordered: true where the gates are numbered and light only in turn, dust
   clouds [x, y, radius], and moons going round a sun ({ sun, r, period in
   seconds, phase in degrees from north, dir 1 clockwise, -1 not }).

   Every chart can be charted: _dev/tools/orbits-check.js finds, for each,
   a push that charts it with every push within three tenths of it (a
   patch the keys' half steps can't jump), and _dev/tests/orbits.js flies
   those pushes through the page.
   ===================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.OrbitsLevels = mod;
})(this, function () {
  "use strict";
  var plates = [
    { numeral: "I", name: "One sun", hint: "Drag from the comet to aim, then launch it through the gold ring." },
    { numeral: "II", name: "Two suns", hint: "Two suns now, each pulling the comet its own way." },
    { numeral: "III", name: "In order", hint: "Numbered gates light only in turn: 1, then 2, then 3." },
    { numeral: "IV", name: "Dust", hint: "Dust stops the comet dead: steer clear of the clouds." },
    { numeral: "V", name: "Twice round", hint: "A ring marked II lights on the second pass through it." },
    { numeral: "VI", name: "Moons", hint: "The moon sets off round its sun as the comet does; it pulls, and it is solid." }
  ];
  var charts = [
    // plate I: one sun
    { name: "First Light", plate: 0, start: [150, 800], push: [750, 200],
      suns: [[520, 470, 2]], gates: [[490, 391]] },
    { name: "Hairpin", plate: 0, start: [150, 520], push: [1100, 200],
      suns: [[520, 470, 2]], gates: [[576, 406]] },
    { name: "Boomerang", plate: 0, start: [180, 300], push: [1450, 200],
      suns: [[520, 470, 2]], gates: [[380, 115]] },
    { name: "Both Sides", plate: 0, start: [150, 150], push: [1600, 200],
      suns: [[520, 520, 2]], gates: [[565, 221], [281, 553]] },
    { name: "Full Circle", plate: 0, start: [120, 880], push: [700, 200],
      suns: [[520, 470, 2]], gates: [[135, 459], [657, 541], [534, 798]] },

    // plate II: two suns
    { name: "Long Fall", plate: 1, start: [120, 140], push: [1600, 200],
      suns: [[360, 400, 1], [640, 640, 3]], gates: [[734, 627]] },
    { name: "The Gap", plate: 1, start: [260, 900], push: [550, 200],
      suns: [[330, 470, 2], [670, 470, 2]], gates: [[654, 294]] },
    { name: "S-Bend", plate: 1, start: [500, 880], push: [250, 200],
      suns: [[290, 480, 2], [710, 480, 2]], gates: [[794, 584], [477, 80]] },
    { name: "Giant and Dwarf", plate: 1, start: [100, 300], push: [1400, 200],
      suns: [[430, 600, 3], [760, 300, 1]], gates: [[468, 197], [830, 334]] },
    { name: "Serpent", plate: 1, start: [120, 500], push: [1150, 200],
      suns: [[310, 480, 2], [690, 520, 2]], gates: [[399, 310], [601, 537], [773, 249]] },

    // plate III: numbered gates, lit in turn
    { name: "In Turn", plate: 2, start: [500, 900], push: [250, 200],
      suns: [[310, 480, 2], [690, 520, 2]], gates: [[181, 646], [622, 456]], ordered: true },
    { name: "The Long Way Back", plate: 2, start: [500, 900], push: [250, 200],
      suns: [[310, 480, 2], [690, 520, 2]], gates: [[880, 250], [500, 650]], ordered: true },
    { name: "Right, Top, Left", plate: 2, start: [500, 900], push: [3350, 200],
      suns: [[300, 500, 2], [700, 500, 2]], gates: [[880, 520], [500, 180], [120, 520]], ordered: true },
    { name: "Over and Under", plate: 2, start: [100, 500], push: [650, 200],
      suns: [[400, 500, 1], [700, 500, 3]], gates: [[700, 180], [400, 820]], ordered: true },
    { name: "Upside Down", plate: 2, start: [500, 100], push: [2050, 200],
      suns: [[300, 520, 2], [700, 520, 2]], gates: [[880, 500], [500, 880], [120, 500]], ordered: true },

    // plate IV: dust clouds
    { name: "Dust Lane", plate: 3, start: [150, 500], push: [1150, 200],
      suns: [[560, 500, 2]], gates: [[650, 505]],
      dust: [[330, 380, 70], [330, 620, 70]] },
    { name: "Smoke Rings", plate: 3, start: [130, 860], push: [700, 200],
      suns: [[520, 480, 2]], gates: [[476, 781], [361, 448]],
      dust: [[300, 560, 80], [720, 760, 70]] },
    { name: "Over the Cloud", plate: 3, start: [500, 900], push: [250, 200],
      suns: [[310, 480, 2], [690, 520, 2]], gates: [[194, 708], [851, 214]],
      dust: [[500, 300, 75]] },
    { name: "Three Clouds", plate: 3, start: [120, 500], push: [1150, 200],
      suns: [[310, 480, 2], [690, 520, 2]], gates: [[220, 315], [500, 266], [748, 452]],
      dust: [[500, 500, 60], [500, 140, 60], [500, 860, 60]] },
    { name: "No Way Through", plate: 3, start: [100, 500], push: [1150, 200],
      suns: [[340, 500, 2], [700, 500, 2]], gates: [[520, 170], [880, 760]],
      dust: [[520, 500, 60]] },

    // plate V: rings marked II, lit on the second pass
    { name: "Second Pass", plate: 4, start: [150, 500], push: [1150, 200],
      suns: [[550, 500, 2]], gates: [[550, 250, 2]] },
    { name: "Figure of Eight", plate: 4, start: [500, 900], push: [450, 200],
      suns: [[300, 480, 2], [700, 480, 2]], gates: [[500, 480, 2]] },
    { name: "Crossing Point", plate: 4, start: [880, 500], push: [2950, 200],
      suns: [[300, 500, 3], [700, 250, 1]], gates: [[626, 470, 2], [545, 60]] },
    { name: "Round Both", plate: 4, start: [500, 900], push: [3350, 200],
      suns: [[310, 480, 2], [690, 520, 2]], gates: [[913, 681, 2]] },
    { name: "Lap of Honour", plate: 4, start: [880, 880], push: [3400, 200],
      suns: [[480, 480, 2]], gates: [[738, 479, 2], [468, 778]] },

    // plate VI: moons going round their suns
    { name: "The Moon", plate: 5, start: [130, 500], push: [1150, 200],
      suns: [[560, 500, 2]], gates: [[880, 500]],
      moons: [{ sun: 0, r: 190, period: 6, phase: 270, dir: 1 }] },
    { name: "Rosette", plate: 5, start: [500, 900], push: [250, 200],
      suns: [[500, 460, 3]], gates: [[399, 452], [356, 800]],
      moons: [{ sun: 0, r: 210, period: 7, phase: 90, dir: -1 }] },
    { name: "Head Start", plate: 5, start: [500, 920], push: [250, 200],
      suns: [[500, 480, 2]], gates: [[500, 140]],
      moons: [{ sun: 0, r: 200, period: 5, phase: 180, dir: -1 }] },
    { name: "Close Shave", plate: 5, start: [120, 880], push: [700, 200],
      suns: [[330, 380, 2], [700, 620, 2]], gates: [[574, 792], [713, 487]],
      moons: [{ sun: 1, r: 170, period: 5, phase: 0, dir: 1 }] },
    { name: "Grand Tour", plate: 5, start: [500, 900], push: [250, 200],
      suns: [[300, 480, 2], [700, 480, 2]], gates: [[500, 480, 2]],
      moons: [{ sun: 1, r: 140, period: 5, phase: 90, dir: 1 }] }
  ];
  return { plates: plates, charts: charts };
});
