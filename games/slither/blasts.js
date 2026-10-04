/* =====================================================================
   Slither — Fire Eggs: blast arenas.

   Snakes lay fire eggs; after a moment each bursts into a cross of flame
   that cracks clay urns, sets off other eggs and burns any snake it
   touches. `mode: "blast"` is what makes these rules (labyrinth-engine.js,
   "fire eggs"). You (P1, at S) and, in a two-player game, a friend (P2, at
   s) face rival snakes (r); with one player a rival takes the s spot.
   Every "." is a place a clay urn may stand — they're scattered fresh each
   round (`urns` is the share filled); a space stays bare. The corners
   around each start are always clear.
   ===================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.SLITHER_BLASTS = mod;
})(this, function () {
  var HINT = "[Space] or [E] lays a fire egg (P2: [Enter]). Crack urns for 🔥 longer blasts, 🥚 more eggs and ⚡ speed. Last snake standing wins.";
  return [
    {
      id: "ember-court", zone: "Ruins", name: "Ember Court", mode: "blast", hint: HINT,
      grid: [
        "#####################",
        "#S.................r#",
        "#.#.#.#.#.#.#.#.#.#.#",
        "#...................#",
        "#.#.#.#.#.#.#.#.#.#.#",
        "#...................#",
        "#.#.#.#.#.#.#.#.#.#.#",
        "#...................#",
        "#.#.#.#.#.#.#.#.#.#.#",
        "#...................#",
        "#.#.#.#.#.#.#.#.#.#.#",
        "#r.................s#",
        "#####################",
      ],
    },
    {
      id: "moss-garden", zone: "Garden", name: "Moss Garden", mode: "blast", hint: HINT, urns: 0.56,
      grid: [
        "#####################",
        "#S.................r#",
        "#.##.##.##.##.##.##.#",
        "#...................#",
        "#.##.##.##.##.##.##.#",
        "#...................#",
        "#.#.#.#.#.#.#.#.#.#.#",
        "#...................#",
        "#.##.##.##.##.##.##.#",
        "#...................#",
        "#.##.##.##.##.##.##.#",
        "#r.................s#",
        "#####################",
      ],
    },
    {
      id: "twin-halls", zone: "Citadel", name: "Twin Halls", mode: "blast", hint: HINT,
      grid: [
        "#####################",
        "#S.................r#",
        "#.#.#.#.#.#.#.#.#.#.#",
        "#...................#",
        "#.#.#.#.#.#.#.#.#.#.#",
        "#........   ........#",
        "1.#.#.#.#   #.#.#.#.1",
        "#........   ........#",
        "#.#.#.#.#.#.#.#.#.#.#",
        "#...................#",
        "#.#.#.#.#.#.#.#.#.#.#",
        "#r.................s#",
        "#####################",
      ],
    },
  ];
});
