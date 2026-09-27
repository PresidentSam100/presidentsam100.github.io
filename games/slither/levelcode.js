/* =====================================================================
   Slither — level share codes. A level travels as "v1." followed by its
   JSON in URL-safe base64 (UTF-8), e.g. in a link ending "#play=v1.eyJ...".
   The version prefix lets the format change without breaking old links.
   Only known fields survive, and sizes are capped, so a pasted code can't
   smuggle anything else into the page.
   ===================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.SlitherLevelCode = mod;
})(this, function () {
  "use strict";

  var MAX_SIDE = 60;
  var FIELDS = {
    id: "string", zone: "string", name: "string", hint: "string", time: "number", speed: "number",
    spikeMs: "number", enemyMs: "object", warps: "object", enemySwitches: "boolean", mode: "string", unproven: "string", teleReverse: "string", proof: "string",
    bossHp: "number", bossLen: "number", bossAttackMs: "number", flowers: "number",
  };

  function clean(level) {
    if (!level || typeof level !== "object" || !Array.isArray(level.grid)) throw new Error("not a level (no grid)");
    var out = {};
    Object.keys(FIELDS).forEach(function (k) {
      if (level[k] != null && typeof level[k] === FIELDS[k]) out[k] = level[k];
    });
    if (typeof out.name === "string") out.name = out.name.slice(0, 40);
    if (typeof out.hint === "string") out.hint = out.hint.slice(0, 240);
    if (out.warps && !Array.isArray(out.warps)) delete out.warps;
    if (out.warps) out.warps = out.warps.filter(function (w) { return typeof w === "string"; }).slice(0, 8);
    if (out.enemyMs) {
      var em = {};
      Object.keys(out.enemyMs).forEach(function (k) { if (typeof out.enemyMs[k] === "number") em[k] = out.enemyMs[k]; });
      out.enemyMs = em;
    }
    if (out.mode !== "stage" && out.mode !== "arena") delete out.mode;
    // Boss tuning from a shared link stays within sane bounds.
    [["bossHp", 1, 9], ["bossLen", 3, 30], ["bossAttackMs", 1500, 30000], ["flowers", 0, 8]].forEach(function (b) {
      if (out[b[0]] != null) out[b[0]] = Math.max(b[1], Math.min(b[2], Math.round(out[b[0]]) || b[1]));
    });
    var grid = level.grid.map(function (r) { return String(r); });
    if (!grid.length || grid.length > MAX_SIDE || grid.some(function (r) { return r.length > MAX_SIDE; })) throw new Error("level is larger than " + MAX_SIDE + "x" + MAX_SIDE);
    out.grid = grid;
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
    return "v1." + b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // Accepts a bare code, or any text (a whole link) containing "play=<code>".
  function decode(text) {
    var m = /(?:play=)?(v1\.[A-Za-z0-9_-]+)/.exec(String(text || "").trim());
    if (!m) throw new Error("not a Slither level code");
    var b64 = m[1].slice(3).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var json;
    try { json = JSON.parse(fromB64(b64)); } catch (e) { throw new Error("that level code is damaged"); }
    return clean(json);
  }

  return { encode: encode, decode: decode, clean: clean, MAX_SIDE: MAX_SIDE };
});
