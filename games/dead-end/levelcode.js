/* =====================================================================
   Dead End: maze share codes (after Slither's levelcode.js). A maze
   travels as "d1." followed by its JSON in URL-safe base64 (UTF-8), e.g.
   in a link ending "#play=d1.eyJ...". The prefix lets the format change
   without breaking old links. Only the name and the grid survive, and
   sizes are capped, so a pasted code can't smuggle anything else in.
   ===================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.DeadEndCode = mod;
})(this, function () {
  "use strict";

  var MAX_SIDE = 40;

  function clean(level) {
    if (!level || typeof level !== "object" || !Array.isArray(level.grid)) throw new Error("not a maze (no grid)");
    var grid = level.grid.map(function (r) { return String(r).replace(/[^#.o+PZ= ]/g, " "); });
    if (!grid.length || grid.length > MAX_SIDE || grid.some(function (r) { return r.length > MAX_SIDE; })) throw new Error("the maze is larger than " + MAX_SIDE + " by " + MAX_SIDE);
    var out = { name: typeof level.name === "string" ? level.name.slice(0, 40) : "A shared maze", grid: grid };
    return out;
  }

  function toB64(str) {
    if (typeof Buffer !== "undefined") return Buffer.from(str, "utf8").toString("base64");
    return btoa(unescape(encodeURIComponent(str)));
  }
  function fromB64(b64) {
    if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf8");
    return decodeURIComponent(escape(atob(b64)));
  }

  function encode(level) {
    var b64 = toB64(JSON.stringify(clean(level)));
    return "d1." + b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // Accepts a bare code, or any text (a whole link) containing "play=<code>".
  function decode(text) {
    var m = /(?:play=)?(d1\.[A-Za-z0-9_-]+)/.exec(String(text || "").trim());
    if (!m) throw new Error("not a Dead End maze code");
    var b64 = m[1].slice(3).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var json;
    try { json = JSON.parse(fromB64(b64)); } catch (e) { throw new Error("that maze code is damaged"); }
    return clean(json);
  }

  return { encode: encode, decode: decode, clean: clean, MAX_SIDE: MAX_SIDE };
});
