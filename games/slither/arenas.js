/* =====================================================================
   Slither — Arenas: last snake standing, on this device.

   Ziggy's Labyrinth has an online Arena; this one is local: you (P1, at S)
   and, in a two-player game, a friend (P2, at s) against rival snakes (r)
   that hunt apples and try to outlast you. With one player a rival takes
   the s spot. Apples keep growing back. The last snake alive takes the
   round; first to 3 rounds takes the match. `mode: "arena"` is what makes
   these rules; the glyphs are the ones in labyrinth-engine.js.
   ===================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.SLITHER_ARENAS = mod;
})(this, function () {
  return [
    {
      id: "colosseum", zone: "Ruins", name: "Colosseum", mode: "arena",
      hint: "Open ground and four columns. Cut rivals off and make them crash into you.",
      grid: [
        "##########################",
        "#........................#",
        "#.S....................r.#",
        "#........................#",
        "#...........a............#",
        "#......##........##......#",
        "#......##........##......#",
        "#...........a............#",
        "#......##........##......#",
        "#......##........##......#",
        "#............a...........#",
        "#........................#",
        "#.r....................s.#",
        "#........................#",
        "##########################",
      ],
    },
    {
      id: "crossroads", zone: "Citadel", name: "Crossroads", mode: "arena",
      hint: "Walls split the floor into four yards; the spikes at the crossing rise and fall on a beat.",
      grid: [
        "##########################",
        "#........................#",
        "#.S.........#..........r.#",
        "#...........#............#",
        "#.....a.....#......a.....#",
        "#...........#............#",
        "#..........^^^^..........#",
        "#...#######^vv^#######...#",
        "#..........^^^^..........#",
        "#............#...........#",
        "#.....a......#.....a.....#",
        "#............#...........#",
        "#.r..........#.........s.#",
        "#........................#",
        "##########################",
      ],
    },
    {
      id: "frozen-pond", zone: "Astral", name: "Frozen Pond", mode: "arena",
      hint: "Nobody can turn on the ice. Chase a rival onto it and wait at the far bank.",
      grid: [
        "##########################",
        "#........................#",
        "#.S....................r.#",
        "#.........a..............#",
        "#...#..~~~~~~~~~~~~......#",
        "#...#..~~~~~~~~~~~~..a...#",
        "#......~~~~~##~~~~~......#",
        "#......~~~~~##~~~~~......#",
        "#......~~~~~##~~~~~......#",
        "#...a..~~~~~~~~~~~~......#",
        "#......~~~~~~~~~~~~..#...#",
        "#..............a.....#...#",
        "#.r....................s.#",
        "#........................#",
        "##########################",
      ],
    },
  ];
});
