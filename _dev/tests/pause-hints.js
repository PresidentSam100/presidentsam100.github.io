// No game tells its players how to pause: not in the controls line, How to
// play or the start panel. The corner ⏸ button wears its own key, so a line
// saying "P pauses" or "⏸ to pause" only repeats it. Read from the source,
// comments left out: the words players see live in strings and page text.
const fs = require("fs");
const path = require("path");

module.exports = async ({ check, lib }) => {
  // (lanterns' word list glosses a word as "to pause": a dictionary entry, not a hint)
  const SKIP = new Set(["games/lanterns/data.js"]);
  // ("pauses", "to pause", or a string that goes on from a keycap: " pause";
  // the ⏸ button's own "⏸ Pause" is the button, not a hint)
  const HINT = /\bpauses\b|\bto pause\b/i, AFTER_KEY = /^\s+pauses?\b/;
  // comments out, strings and page text kept (a "//" right after a ":" is a URL)
  function strip(src) {
    src = src.replace(/<!--[\s\S]*?-->/g, "");
    let out = "", q = null;
    for (let i = 0; i < src.length; i++) {
      const c = src[i], n = src[i + 1];
      if (q) { out += c; if (c === "\\") out += src[++i] || ""; else if (c === q || (c === "\n" && q !== "`")) q = null; continue; }
      if (c === "/" && n === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 1; continue; }
      if (c === "/" && n === "/" && src[i - 1] !== ":") { const e = src.indexOf("\n", i); i = e < 0 ? src.length : e - 1; continue; }
      if (c === '"' || c === "'" || c === "`") q = c;
      out += c;
    }
    return out;
  }
  const found = [];
  let files = 0;
  (function walk(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) { walk(p); continue; }
      if (!/\.(js|html)$/.test(f.name)) continue;
      const rel = path.relative(lib.ROOT, p).replace(/\\/g, "/");
      if (SKIP.has(rel)) continue;
      files++;
      const text = strip(fs.readFileSync(p, "utf8"));
      // what a player could read: the inside of each string, and the text between tags
      const bits = [];
      for (const m of text.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) bits.push(m[2]);
      if (f.name.endsWith(".html")) for (const m of text.matchAll(/>([^<>]+)</g)) bits.push(m[1]);
      for (const b of bits) {
        const words = b.replace(/<[^>]*>/g, " ");
        if ((HINT.test(words) && /\s/.test(words)) || AFTER_KEY.test(words)) found.push(rel + ": " + JSON.stringify(words.trim().slice(0, 80)));
      }
    }
  })(path.join(lib.ROOT, "games"));
  check("no game's legend, How to play or start panel says how to pause (the corner ⏸ wears its key; " + files + " files read)",
    files > 100 && found.length === 0, found.slice(0, 20));
};
