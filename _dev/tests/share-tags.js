// A shared link to any page of the site shows a preview card with a picture:
// every page (the home page, the games page, each game and editor) names its
// title, its description and the one site-wide picture, for the apps that read
// Open Graph tags and for X's large card. The picture is in the repo and is the
// size the tags say (1200 x 630, read from the PNG's own header).
const fs = require("fs");
const path = require("path");

module.exports = async ({ check, lib }) => {
  const SITE = "https://presidentsam100.github.io/";
  const ONE = ["og:title", "og:description", "og:image", "og:image:width", "og:image:height", "og:image:alt", "twitter:card", "twitter:image"];
  const pages = ["index.html"];
  (function walk(dir) {
    for (const f of fs.readdirSync(path.join(lib.ROOT, dir), { withFileTypes: true })) {
      const rel = dir + "/" + f.name;
      if (f.isDirectory()) walk(rel);
      else if (f.name.endsWith(".html")) pages.push(rel);
    }
  })("games");
  const bad = [], images = new Set();
  for (const rel of pages) {
    const text = fs.readFileSync(path.join(lib.ROOT, rel), "utf8");
    // each <meta> tag (some span lines) as { key: content }
    const tags = [];
    for (const m of text.matchAll(/<meta\b[^>]*>/g)) {
      const attr = (n) => { const a = new RegExp("\\b" + n + "=\"([^\"]*)\"").exec(m[0]); return a ? a[1] : null; };
      const key = attr("property") || attr("name");
      if (key) tags.push({ key, content: attr("content") });
    }
    const of = (k) => tags.filter((t) => t.key === k);
    for (const k of ONE) if (of(k).length !== 1) bad.push(rel + ": " + of(k).length + " " + k);
    const img = of("og:image")[0], tw = of("twitter:image")[0];
    if (img) {
      images.add(img.content);
      if (!img.content.startsWith(SITE)) bad.push(rel + ": og:image not on the site: " + img.content);
      if (!tw || tw.content !== img.content) bad.push(rel + ": twitter:image is not og:image");
    }
    if (of("twitter:card")[0] && of("twitter:card")[0].content !== "summary_large_image") bad.push(rel + ": twitter:card " + of("twitter:card")[0].content);
    if (of("og:image:width")[0] && of("og:image:width")[0].content !== "1200") bad.push(rel + ": og:image:width " + of("og:image:width")[0].content);
    if (of("og:image:height")[0] && of("og:image:height")[0].content !== "630") bad.push(rel + ": og:image:height " + of("og:image:height")[0].content);
  }
  check("every page (" + pages.length + ") names its title, description and the share picture once each, with X's large card",
    pages.length > 60 && bad.length === 0, bad.slice(0, 20));

  // the picture itself: one for the whole site, in the repo, 1200 x 630
  const sizes = [...images].map((url) => {
    const file = path.join(lib.ROOT, url.slice(SITE.length));
    if (!fs.existsSync(file)) return { url, missing: true };
    const b = fs.readFileSync(file);
    const png = b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    return { url, png, w: png ? b.readUInt32BE(16) : 0, h: png ? b.readUInt32BE(20) : 0, kb: Math.round(b.length / 1024) };
  });
  check("the share picture is one PNG in the repo, 1200 x 630, under 300 KB",
    sizes.length === 1 && sizes.every((s) => !s.missing && s.png && s.w === 1200 && s.h === 630 && s.kb < 300), sizes);
};
