/* =====================================================================
   Slither — Maze Chase: the guardians' mazes.

   Eat every bead while the temple guardians hunt you. `mode: "chase"` is
   what makes these rules (labyrinth-engine.js, "maze chase"); the mazes are
   played in this order and then loop, a little faster each time round.
   Glyphs, on top of the usual ones:
     .  a corridor with a bead in it        (space: a bare corridor)
     0  a sunstone: the guardians take fright and can be bitten
     u  a guardian; the first (reading order) starts outside the shrine
     =  the shrine gate: guardians only
     S  your start (the golden apple bonus appears here too)
   Portals (1-4) make the side tunnels.
   ===================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.SLITHER_CHASES = mod;
})(this, function () {
  var HINT = "Eat every bead. A sunstone turns the guardians: bite them while they flee. Press backwards to flip end for end.";
  return [
    {
      id: "sunken-nave", zone: "Garden", name: "Sunken Nave", mode: "chase", hint: HINT,
      grid: [
        "##########################",
        "#0.....#..........#.....0#",
        "#.####.#.########.#.####.#",
        "#........................#",
        "#.#.###.#.######.#.###.#.#",
        "#...##..#...u....#..##...#",
        "#.####.#####==#####.####.#",
        "#.####.###u u  u###.####.#",
        "#.####.############.####.#",
        "#...##..#...S....#..##...#",
        "#.#.###.#.######.#.###.#.#",
        "#........................#",
        "#.####.#.########.#.####.#",
        "#0.....#..........#.....0#",
        "##########################",
      ],
    },
    {
      id: "catacombs", zone: "Ruins", name: "Catacombs", mode: "chase", hint: HINT,
      grid: [
        "##########################",
        "#0..........##..........0#",
        "#.###.#####.##.#####.###.#",
        "#........................#",
        "#.###.#.##########.#.###.#",
        "#.....#.....u......#.....#",
        "#####.#.####==####.#.#####",
        "1    . .# u u  u #. .    1",
        "#####.#.##########.#.#####",
        "#.....#.....S......#.....#",
        "#.###.#.##########.#.###.#",
        "#........................#",
        "#.###.#####.##.#####.###.#",
        "#0..........##..........0#",
        "##########################",
      ],
    },
    {
      id: "reliquary", zone: "Citadel", name: "Reliquary", mode: "chase", hint: HINT,
      grid: [
        "##########################",
        "#0....#............#....0#",
        "#.###.#.##########.#.###.#",
        "#........................#",
        "#.##.##.##########.##.##.#",
        "#....#......u.......#....#",
        "####.#.#####==#####.#.####",
        "1   . .#  u u  u  #. .   1",
        "####.#.############.#.####",
        "#....#......S.......#....#",
        "#.##.##.##########.##.##.#",
        "#........................#",
        "#.###.#.##########.#.###.#",
        "#0....#............#....0#",
        "##########################",
      ],
    },
    {
      id: "star-vault", zone: "Astral", name: "Star Vault", mode: "chase", hint: HINT,
      grid: [
        "##########################",
        "#0.......#......#.......0#",
        "#.##.###.#.####.#.###.##.#",
        "1........................1",
        "#.#.####.#.####.#.####.#.#",
        "#...##......u.......##...#",
        "#.####.#####==#####.####.#",
        "#.####.## u u  u ##.####.#",
        "#.####.############.####.#",
        "#...##......S.......##...#",
        "#.#.####.#.####.#.####.#.#",
        "2........................2",
        "#.##.###.#.####.#.###.##.#",
        "#0.......#......#.......0#",
        "##########################",
      ],
    },
  ];
});
