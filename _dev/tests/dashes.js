// No dashes in the project's text: not the long one, not the short one, as a
// character, an HTML entity or a JavaScript escape. A range reads "1 to 9", a
// score "3 to 2", an aside takes a colon or a comma, and an empty value shows
// a real one or says "none". (A hyphen in a word or a name, and the minus sign
// on a negative number, are not dashes.) This file names them by number only,
// so that it passes its own check.
const fs = require("fs");
const path = require("path");

module.exports = async ({ check, lib }) => {
  const ch = (n) => String.fromCharCode(n);
  const BAD = [
    [ch(0x2014), "em dash"], [ch(0x2013), "en dash"], [ch(0x2012), "figure dash"], [ch(0x2015), "horizontal bar"],
    ["&" + "mdash;", "em dash entity"], ["&" + "ndash;", "en dash entity"], ["\\" + "u2014", "em dash escape"], ["\\" + "u2013", "en dash escape"],
  ];
  const SKIP = new Set(["node_modules", ".git", ".claude", "test-results", "playwright-report"]);   // (.claude: the tools' own copies, not the site)
  const TEXT = /\.(js|html|css|md|json|txt|xml|svg|yml|yaml)$/i;
  // (nor two hyphens standing in for one, "this -- that", outside the dev kit,
  // whose "npm test -- suite" is a command's own way of writing)
  const TWO = /(^|\s)--(\s|['"`]|$)/gm;
  const found = [], two = [];
  let files = 0;
  (function walk(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(f.name)) continue;
      const p = path.join(dir, f.name);
      if (f.isDirectory()) { walk(p); continue; }
      if (!TEXT.test(f.name) || f.name === "package-lock.json") continue;
      files++;
      const text = fs.readFileSync(p, "utf8");
      for (const [s, name] of BAD) {
        let at = text.indexOf(s), n = 0;
        while (at !== -1) { n++; at = text.indexOf(s, at + s.length); }
        if (n) found.push(path.relative(lib.ROOT, p).replace(/\\/g, "/") + ": " + n + " " + name);
      }
      const rel = path.relative(lib.ROOT, p).replace(/\\/g, "/"), m = rel.startsWith("_dev/") ? null : text.match(TWO);
      if (m) two.push(rel + ": " + m.length);
    }
  })(lib.ROOT);
  check("no dashes anywhere in the project's text, comments, tests or docs (" + files + " files read)", files > 200 && found.length === 0, found.slice(0, 20));
  check("no two hyphens standing in for a dash in the site's pages, games or docs", two.length === 0, two.slice(0, 20));
};
