/* =====================================================================
   Toy Tanks: mission share codes (after Dead End's levelcode.js). A
   mission travels as "t1." followed by its JSON in URL-safe base64
   (UTF-8), e.g. in a link ending "#play=t1.eyJ...". The prefix lets the
   format change without breaking old links. Only the name and the map
   survive, the map held to the arena's 17 rows of 22 and the squares the
   game knows, so a pasted code can't smuggle anything else in.
   ===================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.ToyTanksCode = mod;
})(this, function () {
  "use strict";

  var COLS = 22, ROWS = 17;

  function clean(mission) {
    if (!mission || typeof mission !== "object" || !Array.isArray(mission.map)) throw new Error("not a mission (no map)");
    if (mission.map.length !== ROWS) throw new Error("a mission's map has " + ROWS + " rows");
    var map = mission.map.map(function (r) {
      r = String(r);
      if (r.length !== COLS) throw new Error("each row of a mission's map has " + COLS + " squares");
      return r.replace(/[^.#coPbamypgvwk]/g, ".");
    });
    var name = typeof mission.name === "string" ? mission.name.trim().slice(0, 40) : "";
    return { name: name || "A shared mission", map: map };
  }

  function toB64(str) {
    if (typeof Buffer !== "undefined") return Buffer.from(str, "utf8").toString("base64");
    return btoa(unescape(encodeURIComponent(str)));
  }
  function fromB64(b64) {
    if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf8");
    return decodeURIComponent(escape(atob(b64)));
  }

  function encode(mission) {
    var b64 = toB64(JSON.stringify(clean(mission)));
    return "t1." + b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // Accepts a bare code, or any text (a whole link) containing "play=<code>".
  function decode(text) {
    var m = /(?:play=)?(t1\.[A-Za-z0-9_-]+)/.exec(String(text || "").trim());
    if (!m) throw new Error("not a Toy Tanks mission code");
    var b64 = m[1].slice(3).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var json;
    try { json = JSON.parse(fromB64(b64)); } catch (e) { throw new Error("that mission code is damaged"); }
    return clean(json);
  }

  return { encode: encode, decode: decode, clean: clean, COLS: COLS, ROWS: ROWS };
});
