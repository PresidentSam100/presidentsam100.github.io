/* Dev tool: reorder levels by DIFFICULTY (analyze.js score) and rewrite
 * levels.js. The first 8 (tutorial) keep their fixed teaching order; the
 * rest are sorted by ascending difficulty score.
 */
const fs = require("fs");
const LEVELS = require("./levels.js");
const { analyze } = require("./analyze.js");

const TUT = 8;
const tut = LEVELS.slice(0, TUT);
const rest = LEVELS.slice(TUT)
  .map((l) => ({ l, a: analyze(l.grid) }))
  .sort((x, y) => x.a.score - y.a.score);

const ordered = [...tut, ...rest.map((r) => r.l)];

function renderLevel(l) {
  const grid = l.grid.map((row) => `        "${row}",`).join("\n");
  return (
    `    {\n` +
    `      name: ${JSON.stringify(l.name)},\n` +
    `      hint: ${JSON.stringify(l.hint)},\n` +
    `      grid: [\n${grid}\n      ],\n` +
    `    },`
  );
}

const header = `/*
 * Tile Maze - level definitions.
 * Each grid row must be the same length. See engine.js for the tile legend.
 * Levels 1-8 are a deliberate tutorial onramp (one mechanic at a time);
 * levels 9+ are ordered by DIFFICULTY (see analyze.js, not just move count).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.LEVELS = mod;
})(this, function () {
  "use strict";

  return [
    // ---------------- Tutorial (1-8) ----------------
`;

const body =
  tut.map(renderLevel).join("\n") +
  "\n\n    // ---------------- Main game (9+), by difficulty ----------------\n" +
  rest.map((r) => renderLevel(r.l)).join("\n");

const footer = `
  ];
});
`;

fs.writeFileSync("levels.js", header + body + footer);

console.log("Reordered " + ordered.length + " levels by difficulty:\n");
ordered.forEach((l, i) => {
  const a = analyze(l.grid);
  const tag = i < TUT ? "tut" : "   ";
  console.log(
    `${tag} ${String(i + 1).padStart(2)}  ${l.name.padEnd(18)} difficulty ${a.score.toFixed(1).padStart(6)}  (len ${a.len})`
  );
});
