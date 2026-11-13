// Builds games/chess/openings.js, the named openings the 2-player Chess log
// knows, from the lichess-org/chess-openings list (a.tsv to e.tsv: eco, name,
// pgn; CC0 public domain): https://github.com/lichess-org/chess-openings
//
//   node _dev/tools/chess-openings-build.js              (fetches the pinned commit)
//   node _dev/tools/chess-openings-build.js --from DIR   (a.tsv to e.tsv already in DIR)
//   node _dev/tools/chess-openings-build.js --check      (reports, writes nothing)
//
// Every line's moves are played through with games/chess/engine.js (the same
// move rules as the game) and must each match exactly one legal move, or the
// build stops. The names are written as the list has them, none added.
//
// The file it writes holds the names and, in the same order, the lines as
// moves from square to square, sorted so that each line shares what it can
// with the one before it (the game plays them through once, on a board of
// its own, and keeps each line's end position under its name: game.js,
// buildOpenings()). A line is: one character for how many moves it shares with
// the line before, then two characters a move (the square it leaves and the
// square it reaches, 0 to 63 from a8, as one character each of ALPHA), a
// promotion written after its move as "=" and the piece's letter, lines
// separated by commas.
"use strict";
const fs = require("fs"), path = require("path");

const COMMIT = "3ba6b20d31b2e6125cb0e6a2e792f400717d9d39";
const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, "games", "chess", "openings.js");
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const E = require(path.join(ROOT, "games", "chess", "engine.js")).ChessEngine;
const R = E.RULES;

const args = process.argv.slice(2);
const from = args.includes("--from") ? args[args.indexOf("--from") + 1] : null;
const checkOnly = args.includes("--check");

async function load() {
  const out = [];
  for (const f of ["a", "b", "c", "d", "e"]) {
    const text = from ? fs.readFileSync(path.join(from, f + ".tsv"), "utf8")
      : await (await fetch("https://raw.githubusercontent.com/lichess-org/chess-openings/" + COMMIT + "/" + f + ".tsv")).text();
    const rows = text.split(/\r?\n/).filter((l) => l.trim());
    if (rows[0] !== "eco\tname\tpgn") throw new Error(f + ".tsv: unexpected header " + JSON.stringify(rows[0]));
    for (const row of rows.slice(1)) {
      const [eco, name, pgn] = row.split("\t");
      if (!eco || !name || !pgn) throw new Error(f + ".tsv: bad row " + JSON.stringify(row));
      out.push({ eco, name, pgn });
    }
  }
  return out;
}

const sq = (s) => (8 - +s[1]) * 8 + (s.charCodeAt(0) - 97);
function start() {
  const b = new Array(64).fill(null), back = ["r", "n", "b", "q", "k", "b", "n", "r"];
  for (let c = 0; c < 8; c++) {
    b[c] = { o: "b", t: back[c], dead: false }; b[8 + c] = { o: "b", t: "p", dead: false };
    b[48 + c] = { o: "w", t: "p", dead: false }; b[56 + c] = { o: "w", t: back[c], dead: false };
  }
  return { board: b, turn: "w", ep: null, castle: { wk: true, wq: true, bk: true, bq: true } };
}
// a position as game.js's posKey() writes it: the pieces, the side to move,
// the castling rights left, and an en-passant square only when a pawn can
// really take there (used here only to find two names for one position)
function key(s) {
  const ep = s.ep && E.allLegalMoves(R, s.board, s.ep, s.castle, s.turn).some((m) => m.ep);
  return s.board.map((p) => (p ? p.o + p.t : ".")).join("") + " " + s.turn + " " +
    ["wk", "wq", "bk", "bq"].filter((k) => s.castle[k]).join("") + " " + (ep ? s.ep.sq : "-");
}
// the one legal move a SAN token names
function resolve(s, tok) {
  const san = tok.replace(/[+#!?]+$/, "");
  const legal = E.allLegalMoves(R, s.board, s.ep, s.castle, s.turn);
  let hits;
  if (san === "O-O" || san === "O-O-O") hits = legal.filter((m) => m.castle === (san === "O-O" ? "k" : "q"));
  else {
    const g = /^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([QRBN]))?$/.exec(san);
    if (!g) throw new Error("unreadable move " + tok);
    const t = g[1] ? g[1].toLowerCase() : "p", to = sq(g[5]);
    hits = legal.filter((m) => {
      const p = s.board[m.from];
      return p.t === t && m.to === to && !m.castle && (!g[2] || m.from % 8 === g[2].charCodeAt(0) - 97) &&
        (!g[3] || 8 - ((m.from / 8) | 0) === +g[3]) && !!m.promo === !!g[6];
    });
    hits.forEach((m) => { m.promoTo = g[6] ? g[6].toLowerCase() : null; });
  }
  if (hits.length !== 1) throw new Error((hits.length ? "ambiguous move " : "no legal move ") + tok);
  return hits[0];
}
function play(s, m) {
  const n = E.makeMove(R, s.board, s.ep, s.castle, m);
  if (m.promoTo && m.promoTo !== "q") n.board[m.to] = { o: s.turn, t: m.promoTo, dead: false };
  return { board: n.board, ep: n.ep, castle: n.castle, turn: s.turn === "w" ? "b" : "w" };
}

(async () => {
  const rows = await load();
  const seen = new Map(), lines = [];
  for (const r of rows) {
    let s = start();
    const moves = [];
    for (const tok of r.pgn.split(/\s+/)) {
      if (/^\d+\.+$/.test(tok) || !tok) continue;
      let m;
      try { m = resolve(s, tok); } catch (e) { throw new Error(r.eco + " " + r.name + " (" + r.pgn + "): " + e.message); }
      moves.push(ALPHA[m.from] + ALPHA[m.to] + (m.promoTo ? "=" + m.promoTo : ""));
      s = play(s, m);
    }
    const k = key(s);
    if (seen.has(k)) console.log("two names for one position: " + seen.get(k) + " | " + r.name + " (the later one is kept)");
    seen.set(k, r.name);
    lines.push({ name: r.name, moves });
  }
  // sorted move by move, so a line follows the ones it shares the most with
  lines.sort((a, b) => {
    for (let i = 0; i < Math.min(a.moves.length, b.moves.length); i++) if (a.moves[i] !== b.moves[i]) return a.moves[i] < b.moves[i] ? -1 : 1;
    return a.moves.length - b.moves.length;
  });
  let prev = [], longest = 0;
  const enc = lines.map((l) => {
    let k = 0;
    while (k < prev.length && k < l.moves.length && prev[k] === l.moves[k]) k++;
    if (k >= ALPHA.length) throw new Error("a line shares more moves than one character can say");
    longest = Math.max(longest, l.moves.length);
    prev = l.moves;
    return ALPHA[k] + l.moves.slice(k).join("");
  }).join(",");
  const names = lines.map((l) => l.name);
  const src = "// The named openings the 2-player Chess log knows (game.js, buildOpenings()).\n" +
    "// Made by _dev/tools/chess-openings-build.js from the lichess-org/chess-openings\n" +
    "// list (https://github.com/lichess-org/chess-openings, commit " + COMMIT.slice(0, 7) + "),\n" +
    "// which is in the public domain (CC0 1.0). Don't edit by hand: run the tool.\n" +
    "// " + names.length + " lines. names[i] is the name of lines' i-th line; the lines are\n" +
    "// written as the tool's comment describes.\n" +
    "window.CHESS_OPENINGS = {\n  names: " + JSON.stringify(names) + ",\n  lines: " + JSON.stringify(enc) + "\n};\n";
  console.log(names.length + " lines, " + new Set(names).size + " names, " + seen.size + " positions, longest " + longest + " moves; " + src.length + " bytes, " +
    require("zlib").gzipSync(src, { level: 9 }).length + " gzipped");
  if (!checkOnly) { fs.writeFileSync(OUT, src); console.log("wrote " + path.relative(ROOT, OUT)); }
})().catch((e) => { console.error(e.message); process.exit(1); });
