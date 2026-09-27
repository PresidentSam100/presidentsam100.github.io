/* =====================================================================
   Slither — level editor.

   Paint a level with any tile the engine supports (the palette comes from
   the engine's glyph table, so new mechanics show up here on their own),
   check it can be finished (solver.js in a Web Worker), play it, save it
   to "my levels" (localStorage slither_custom), and share it as a link:
   the game page plays any "#play=<code>" link (levelcode.js).
   ===================================================================== */
(function () {
  "use strict";
  var E = window.SlitherEngine, T = E.T, Art = window.SlitherArt, Code = window.SlitherLevelCode;
  var LEVELS = window.SLITHER_LEVELS || [];
  var CELL = 24, DRAFT_KEY = "slither_editor_draft", MINE_KEY = "slither_custom";
  var UNIQUE = { S: true, s: true, "@": true };
  var GROUPS = [["terrain", "Terrain"], ["doors", "Doors & switches"], ["hazard", "Hazards"], ["machine", "Machines"], ["items", "Items"], ["enemies", "Enemies"]];
  var ZONES = Object.keys(Art.THEMES).filter(function (z) { return z !== "classic"; });

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $("ed-board"), ctx = canvas.getContext("2d");
  var level, glyph = "#", tool = "paint", undoStack = [], redoStack = [];
  var hover = null, drag = null;

  // ---- storage -------------------------------------------------------------------
  function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  function load(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } }

  function blank(cols, rows) {
    var g = [];
    for (var y = 0; y < rows; y++) {
      var r = "";
      for (var x = 0; x < cols; x++) r += x === 0 || y === 0 || x === cols - 1 || y === rows - 1 ? "#" : ".";
      g.push(r);
    }
    var mid = Math.floor(rows / 2);
    g[mid] = g[mid].slice(0, 2) + "S" + g[mid].slice(3, cols - 3) + "E" + g[mid].slice(cols - 2);
    g[mid - 2] = g[mid - 2].slice(0, Math.floor(cols / 2)) + "a" + g[mid - 2].slice(Math.floor(cols / 2) + 1);
    return { name: "My level", zone: "Garden", time: 45, hint: "", warps: [], enemySwitches: false, grid: g };
  }
  function cols() { return level.grid[0].length; }
  function rows() { return level.grid.length; }
  function at(x, y) { return level.grid[y].charAt(x); }
  function put(x, y, ch) { var r = level.grid[y]; level.grid[y] = r.slice(0, x) + ch + r.slice(x + 1); }

  var saveTimer = 0;
  function changed() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { store(DRAFT_KEY, level); }, 250);
    $("ed-result").textContent = "";
    $("ed-result").className = "ed-result";
    render();
    validate();
    syncWarps();
  }
  function pushUndo() {
    undoStack.push(JSON.stringify(level));
    if (undoStack.length > 120) undoStack.shift();
    redoStack = [];
  }
  function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify(level)); level = JSON.parse(undoStack.pop()); fillForm(); changed(); }
  function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify(level)); level = JSON.parse(redoStack.pop()); fillForm(); changed(); }

  // ---- drawing -------------------------------------------------------------------
  function isWallAt(x, y) { return x < 0 || y < 0 || x >= cols() || y >= rows() || at(x, y) === "#"; }
  function darkAround(x, y) {
    var n = 0;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
      var xx = x + d[0], yy = y + d[1];
      if (xx >= 0 && yy >= 0 && xx < cols() && yy < rows() && at(xx, yy) === ":") n++;
    });
    return n >= 2;
  }
  function label(g, px, py, c, text, color) {
    g.font = "700 " + Math.round(c * 0.42) + "px Alegreya Sans, system-ui, sans-serif";
    g.textAlign = "left"; g.textBaseline = "top";
    g.fillStyle = "rgba(0,0,0,0.65)";
    g.fillRect(px + 1, py + 1, c * 0.42, c * 0.46);
    g.fillStyle = color || "#fff";
    g.fillText(text, px + 2.5, py + 1.5);
  }
  // Draw one glyph into a cell. `where` gives neighbours for walls (board) or none (palette).
  function drawGlyph(g, ch, px, py, c, th, ctxInfo) {
    var L = E.LEGEND[ch] || {}, seed = ctxInfo ? ctxInfo.seed : 7, cx = px + c / 2, cy = py + c / 2;
    if (L.tile === T.WALL) {
      Art.wall(g, px, py, c, th, seed, ctxInfo ? ctxInfo.open : { n: true, s: true, w: true, e: true });
      return;
    }
    if (L.tile === T.ICE) Art.ice(g, px, py, c, seed);
    else if (L.tile === T.DREAM) Art.dream(g, px, py, c, seed, null);
    else if (L.tile === T.STORM) Art.storm(g, px, py, c, seed);
    else if (L.tile === T.DARK || (L.item && ctxInfo && ctxInfo.dark)) Art.darkFloor(g, px, py, c);
    else Art.floor(g, px, py, c, th, seed);
    if (L.tile === T.CUTTER) Art.cutter(g, px, py, c);
    else if (L.tile === T.INFINITY) Art.infinity(g, px, py, c);
    else if (L.tile === T.CLONER) Art.cloner(g, px, py, c);
    else if (L.tile === T.OUTLET) Art.outlet(g, px, py, c);
    else if (L.tile === T.DOOR_SHUT || L.tile === T.DOOR_OPEN) Art.door(g, px, py, c, L.tile === T.DOOR_SHUT, L.color);
    else if (L.tile === T.SWITCH) Art.plate(g, px, py, c, false, L.color);
    else if (L.tile === T.CLICK) Art.clickSwitch(g, px, py, c, false, L.color);
    else if (L.tile === T.SPIKE_A || L.tile === T.SPIKE_B) Art.spikes(g, px, py, c, L.tile === T.SPIKE_A, false);
    else if (L.tile === T.EXIT) Art.doorway(g, px, py, c, false, 0, false);
    else if (L.tile === T.WARP) Art.warpway(g, px, py, c, false, 0, false);
    else if (L.portal) {
      Art.portalFrame(g, cx, cy, c / 2 - 1);
      Art.portalGlow(g, cx, cy, c / 2 - 1, Art.PORTAL_COLORS[(L.portal - 1) % 4], 0, false);
      label(g, px, py, c, String(L.portal));
    } else if (L.tele) {
      Art.telePad(g, px, py, c, true, L.tele - 5, 0, false);
      label(g, px, py, c, String(L.tele), "#ffb4a8");
    } else if (L.tile != null && Art.tileArt) Art.tileArt(g, L.tile, px, py, c, 0, false, ctxInfo);
    if (L.item === "apple") Art.fruit(g, cx, cy, c - 6, "🍎");
    else if (L.item === "fast") Art.fruit(g, cx, cy, c - 6, "🍏");
    else if (L.item === "blink") Art.gem(g, cx, cy, c * 0.3);
    else if (L.item === "ghost") Art.wisp(g, cx, cy, c * 0.3, 0, false);
    else if (L.item && Art.itemArt) Art.itemArt(g, L.item, cx, cy, c, 0, false);
    if (L.start || L.enemy) {
      var pt = { x: cx, y: cy };
      var pal = L.start === "p2" ? Art.SERPENTS.lapis : L.start ? Art.SERPENTS.jade : Art.serpentFor(L.enemy);
      Art.serpent(g, [pt, pt, pt, pt], { cell: c, pal: pal, dir: null, t: 0, fx: false, seed: 1, kind: L.enemy || "player" });
      if (L.start === "p2") label(g, px, py, c, "2");
    }
  }

  function render() {
    var dpr = window.devicePixelRatio || 1, W = cols() * CELL, H = rows() * CELL;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var th = Art.THEMES[level.zone] || Art.THEMES.Garden;
    for (var y = 0; y < rows(); y++) {
      for (var x = 0; x < cols(); x++) {
        var ch = at(x, y);
        drawGlyph(ctx, ch, x * CELL, y * CELL, CELL, th, {
          seed: y * cols() + x,
          open: { n: !isWallAt(x, y - 1), s: !isWallAt(x, y + 1), w: !isWallAt(x - 1, y), e: !isWallAt(x + 1, y) },
          dark: darkAround(x, y),
        });
      }
    }
    // Box tool preview.
    if (drag && drag.tool === "rect" && drag.to) {
      var r = rectOf(drag.from, drag.to);
      ctx.strokeStyle = "#ffd36a"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.strokeRect(r.x0 * CELL + 1, r.y0 * CELL + 1, (r.x1 - r.x0 + 1) * CELL - 2, (r.y1 - r.y0 + 1) * CELL - 2);
      ctx.setLineDash([]);
    }
    if (hover) {
      ctx.strokeStyle = "rgba(255,240,200,0.85)"; ctx.lineWidth = 1.5;
      ctx.strokeRect(hover.x * CELL + 0.75, hover.y * CELL + 0.75, CELL - 1.5, CELL - 1.5);
    }
  }

  // ---- palette -------------------------------------------------------------------
  function buildPalette() {
    var host = $("ed-palette");
    host.innerHTML = "";
    GROUPS.forEach(function (gr) {
      var glyphs = Object.keys(E.LEGEND).filter(function (ch) { var L = E.LEGEND[ch]; return L.ready && !L.hidden && L.group === gr[0]; });
      if (!glyphs.length) return;
      var h = document.createElement("div");
      h.className = "ed-group"; h.textContent = gr[1];
      host.appendChild(h);
      var box = document.createElement("div");
      box.className = "ed-tiles";
      glyphs.forEach(function (ch) {
        var L = E.LEGEND[ch], b = document.createElement("button");
        b.type = "button"; b.className = "ed-tile" + (ch === glyph ? " sel" : "");
        b.title = L.name + " — " + L.desc;
        b.setAttribute("aria-label", L.name);
        b.dataset.glyph = ch;
        var cv = document.createElement("canvas"), dpr = window.devicePixelRatio || 1;
        cv.width = 40 * dpr; cv.height = 40 * dpr;
        var g = cv.getContext("2d");
        g.setTransform(dpr * 40 / CELL, 0, 0, dpr * 40 / CELL, 0, 0);
        drawGlyph(g, ch, 0, 0, CELL, Art.THEMES[level.zone] || Art.THEMES.Garden, null);
        b.appendChild(cv);
        b.addEventListener("click", function () { pick(ch); });
        box.appendChild(b);
      });
      host.appendChild(box);
    });
  }
  function pick(ch) {
    glyph = ch;
    Array.prototype.forEach.call(document.querySelectorAll(".ed-tile"), function (b) { b.classList.toggle("sel", b.dataset.glyph === ch); });
    var L = E.LEGEND[ch];
    $("ed-tip").innerHTML = "<b>" + escapeHtml(L.name) + "</b> — " + escapeHtml(L.desc);
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---- painting ------------------------------------------------------------------
  function cellAt(e) {
    var r = canvas.getBoundingClientRect();
    var x = Math.floor((e.clientX - r.left) / r.width * cols()), y = Math.floor((e.clientY - r.top) / r.height * rows());
    return x >= 0 && y >= 0 && x < cols() && y < rows() ? { x: x, y: y } : null;
  }
  function paint(x, y, ch) {
    if (at(x, y) === ch) return;
    if (UNIQUE[ch]) {
      for (var yy = 0; yy < rows(); yy++) for (var xx = 0; xx < cols(); xx++) if (at(xx, yy) === ch) put(xx, yy, ".");
    }
    put(x, y, ch);
  }
  function rectOf(a, b) { return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }; }
  function fill(x, y, ch) {
    var from = at(x, y);
    if (from === ch) return;
    var q = [[x, y]], seen = {};
    while (q.length) {
      var p = q.pop(), k = p[0] + "," + p[1];
      if (seen[k] || p[0] < 0 || p[1] < 0 || p[0] >= cols() || p[1] >= rows() || at(p[0], p[1]) !== from) continue;
      seen[k] = true;
      put(p[0], p[1], ch);
      q.push([p[0] + 1, p[1]], [p[0] - 1, p[1]], [p[0], p[1] + 1], [p[0], p[1] - 1]);
    }
  }
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  canvas.addEventListener("pointerdown", function (e) {
    var c = cellAt(e);
    if (!c) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    var ch = e.button === 2 ? "." : glyph;
    pushUndo();
    drag = { tool: tool, from: c, to: c, ch: ch };
    if (tool === "paint") { paint(c.x, c.y, ch); changed(); }
    else if (tool === "fill") { fill(c.x, c.y, ch); drag = null; changed(); }
    else render();
  });
  canvas.addEventListener("pointermove", function (e) {
    var c = cellAt(e);
    hover = c;
    if (c) {
      var L = E.LEGEND[at(c.x, c.y)] || {};
      $("ed-status").textContent = c.x + "," + c.y + " · " + (L.name || "?");
      $("ed-status").className = "ed-status";
    }
    if (drag && c) {
      if (drag.tool === "paint") { paint(c.x, c.y, drag.ch); changed(); return; }
      drag.to = c;
    }
    render();
  });
  canvas.addEventListener("pointerleave", function () { hover = null; render(); validate(); });
  window.addEventListener("pointerup", function () {
    if (!drag) return;
    if (drag.tool === "rect") {
      var r = rectOf(drag.from, drag.to);
      for (var y = r.y0; y <= r.y1; y++) for (var x = r.x0; x <= r.x1; x++) paint(x, y, drag.ch);
      drag = null;
      changed();
      return;
    }
    drag = null;
  });

  // ---- toolbar ---------------------------------------------------------------------
  function setTool(t) {
    tool = t;
    Array.prototype.forEach.call(document.querySelectorAll("#ed-tools .btn"), function (b) { b.classList.toggle("sel", b.dataset.tool === t); });
  }
  Array.prototype.forEach.call(document.querySelectorAll("#ed-tools .btn"), function (b) {
    b.addEventListener("click", function () { setTool(b.dataset.tool); });
  });
  $("ed-undo").addEventListener("click", undo);
  $("ed-redo").addEventListener("click", redo);
  $("ed-border").addEventListener("click", function () {
    pushUndo();
    for (var x = 0; x < cols(); x++) { put(x, 0, "#"); put(x, rows() - 1, "#"); }
    for (var y = 0; y < rows(); y++) { put(0, y, "#"); put(cols() - 1, y, "#"); }
    changed();
  });
  $("ed-clear").addEventListener("click", function () {
    if (!confirm("Start a new blank level? (Your current one is kept in undo.)")) return;
    pushUndo();
    level = blank(24, 15);
    fillForm();
    changed();
  });
  document.addEventListener("keydown", function (e) {
    if (/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || "")) return;
    var k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); redo(); }
    else if (!e.ctrlKey && !e.metaKey && k === "p") setTool("paint");
    else if (!e.ctrlKey && !e.metaKey && k === "r") setTool("rect");
    else if (!e.ctrlKey && !e.metaKey && k === "f") setTool("fill");
  });

  // ---- settings form ---------------------------------------------------------------
  function fillForm() {
    $("ed-name").value = level.name || "";
    $("ed-zone").value = level.zone || "Garden";
    $("ed-cols").value = cols();
    $("ed-rows").value = rows();
    $("ed-time").value = level.time || 0;
    $("ed-hint").value = level.hint || "";
    $("ed-warps").value = (level.warps || []).join(", ");
    $("ed-enemyswitch").checked = !!level.enemySwitches;
    $("ed-tele").value = level.teleReverse || "";
    $("ed-bosshp").value = level.bossHp || 3;
    $("ed-mode").value = level.mode === "stage" || level.mode === "arena" ? level.mode : "";
  }
  ZONES.forEach(function (z) { var o = document.createElement("option"); o.value = o.textContent = z; $("ed-zone").appendChild(o); });
  $("ed-name").addEventListener("input", function () { level.name = this.value; changed(); });
  $("ed-zone").addEventListener("change", function () { level.zone = this.value; buildPalette(); changed(); });
  $("ed-time").addEventListener("change", function () { level.time = Math.max(0, Math.min(999, Math.round(Number(this.value) || 0))); this.value = level.time; changed(); });
  $("ed-hint").addEventListener("input", function () { level.hint = this.value; changed(); });
  $("ed-warps").addEventListener("change", function () { level.warps = this.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean); changed(); });
  $("ed-enemyswitch").addEventListener("change", function () { level.enemySwitches = this.checked; changed(); });
  $("ed-mode").addEventListener("change", function () { if (this.value) level.mode = this.value; else delete level.mode; changed(); });
  $("ed-tele").addEventListener("change", function () { level.teleReverse = this.value.replace(/[^5-9]/g, ""); this.value = level.teleReverse; changed(); });
  $("ed-bosshp").addEventListener("change", function () { level.bossHp = Math.max(1, Math.min(9, Math.round(Number(this.value) || 3))); this.value = level.bossHp; changed(); });
  function resize() {
    var c = Math.max(6, Math.min(Code.MAX_SIDE, Math.round(Number($("ed-cols").value) || cols())));
    var r = Math.max(6, Math.min(Code.MAX_SIDE, Math.round(Number($("ed-rows").value) || rows())));
    if (c === cols() && r === rows()) return;
    pushUndo();
    var g = [];
    for (var y = 0; y < r; y++) {
      var row = "";
      for (var x = 0; x < c; x++) row += y < rows() && x < cols() ? at(x, y) : ".";
      g.push(row);
    }
    level.grid = g;
    fillForm();
    changed();
  }
  $("ed-cols").addEventListener("change", resize);
  $("ed-rows").addEventListener("change", resize);
  function syncWarps() {
    var all = level.grid.join("");
    $("ed-warps-row").hidden = all.indexOf("Q") === -1;
    $("ed-tele-row").hidden = !/[5-9]/.test(all);
    $("ed-boss-row").hidden = all.indexOf("@") === -1;
  }

  // ---- checks ------------------------------------------------------------------------
  function current() {
    var lv = Code.clean(level);
    if (!lv.warps || !lv.warps.length) delete lv.warps;
    if (!lv.enemySwitches) delete lv.enemySwitches;
    if (!lv.hint) delete lv.hint;
    if (!lv.teleReverse) delete lv.teleReverse;
    if (level.grid.join("").indexOf("@") === -1) ["bossHp", "bossLen", "bossAttackMs", "flowers"].forEach(function (k) { delete lv[k]; });
    lv.id = lv.id || "custom";
    return lv;
  }
  function validate() {
    var errs;
    try { errs = E.parse(current()).errors; } catch (e) { errs = [String(e.message || e)]; }
    var s = $("ed-status");
    if (hover) return errs;
    s.textContent = errs.length ? "⚠ " + errs[0] + (errs.length > 1 ? " (+" + (errs.length - 1) + " more)" : "") : "Looks valid. “Check” proves it can be finished.";
    s.className = "ed-status" + (errs.length ? " bad" : "");
    return errs;
  }
  var worker = null, workerTimer = 0;
  $("ed-check").addEventListener("click", function () {
    var out = $("ed-result");
    if (validate().length) { out.textContent = "Fix the problem shown under the board first."; out.className = "ed-result bad"; return; }
    if (worker) worker.terminate();
    out.textContent = "Checking…"; out.className = "ed-result";
    try { worker = new Worker("solver-worker.js"); } catch (e) { out.textContent = "The checker needs the page served over http(s)."; out.className = "ed-result bad"; return; }
    clearTimeout(workerTimer);
    workerTimer = setTimeout(function () { if (worker) { worker.terminate(); worker = null; out.textContent = "Gave up after 30 s — the level may be too open to search. Try playing it."; out.className = "ed-result bad"; } }, 30000);
    worker.onmessage = function (e) {
      clearTimeout(workerTimer);
      worker.terminate(); worker = null;
      var r = e.data;
      if (r.status === "ok") {
        out.textContent = "✓ Finishable: a " + r.steps + "-step route takes " + r.secs.toFixed(1) + " s" +
          (level.time ? " (limit " + level.time + " s)" : "") + (r.warp ? ", leaving by the warp" : "") + "." + (r.notes.length ? " " + r.notes.join("; ") + "." : "") +
          (level.grid.join("").indexOf("@") !== -1 ? " That's with the boss removed: play it to test the fight." : "");
        out.className = "ed-result ok";
      } else if (r.status === "unproven") {
        out.textContent = "Can't be proven automatically: " + r.reason + ".";
        out.className = "ed-result";
      } else {
        out.textContent = "✗ " + r.reason + ". (The checker ignores enemies, so a level that needs them to help can't pass.)";
        out.className = "ed-result bad";
      }
    };
    worker.postMessage(current());
  });

  // ---- play / save / share -------------------------------------------------------------
  function playUrl(lv) { return location.href.replace(/editor\.html.*$/, "").replace(/#.*$/, "") + "#play=" + Code.encode(lv); }
  $("ed-play").addEventListener("click", function () {
    if (validate().length) { $("ed-result").textContent = "Fix the problem shown under the board first."; $("ed-result").className = "ed-result bad"; return; }
    window.open(playUrl(current()), "slither-play");
  });
  function mine() { var m = load(MINE_KEY); return Array.isArray(m) ? m : []; }
  $("ed-save").addEventListener("click", function () {
    var list = mine(), lv = current();
    lv.id = level.id && /^my-/.test(level.id) ? level.id : "my-" + Date.now().toString(36);
    level.id = lv.id;
    var i = list.findIndex(function (m) { return m.id === lv.id; });
    if (i >= 0) list[i] = lv; else list.push(lv);
    store(MINE_KEY, list);
    showMine();
    $("ed-result").textContent = "Saved to My levels — it also appears in the game's level select."; $("ed-result").className = "ed-result ok";
  });
  $("ed-share").addEventListener("click", function () {
    var url = playUrl(current());
    var done = function () { $("ed-result").textContent = "Link copied. Anyone who opens it plays this level."; $("ed-result").className = "ed-result ok"; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { dialog("Share link", "Copy this link:", url, null); });
    else dialog("Share link", "Copy this link:", url, null);
  });
  function showMine() {
    var host = $("ed-mine"), list = mine();
    host.innerHTML = list.length ? "" : "<p class=\"ed-tip\">Nothing saved yet.</p>";
    list.forEach(function (lv) {
      var row = document.createElement("div");
      row.className = "ed-mine-row";
      var name = document.createElement("span"); name.textContent = lv.name || lv.id;
      var open = document.createElement("button"); open.className = "btn"; open.textContent = "Edit";
      open.addEventListener("click", function () { pushUndo(); level = JSON.parse(JSON.stringify(lv)); fillForm(); buildPalette(); changed(); });
      var play = document.createElement("button"); play.className = "btn"; play.textContent = "▶";
      play.addEventListener("click", function () { window.open(playUrl(lv), "slither-play"); });
      var del = document.createElement("button"); del.className = "btn"; del.textContent = "✕";
      del.addEventListener("click", function () {
        if (!confirm("Delete “" + (lv.name || lv.id) + "” from My levels?")) return;
        store(MINE_KEY, mine().filter(function (m) { return m.id !== lv.id; }));
        showMine();
      });
      row.appendChild(name); row.appendChild(open); row.appendChild(play); row.appendChild(del);
      host.appendChild(row);
    });
  }

  // ---- export / import --------------------------------------------------------------------
  var dlgOk = null;
  function dialog(title, help, text, onOk) {
    $("ed-io-title").textContent = title;
    $("ed-io-help").textContent = help;
    $("ed-io-text").value = text;
    $("ed-io-cancel").hidden = !onOk;
    dlgOk = onOk;
    $("ed-io").showModal();
    $("ed-io-text").select();
  }
  $("ed-io-ok").addEventListener("click", function () { var f = dlgOk; $("ed-io").close(); if (f) f($("ed-io-text").value); });
  $("ed-io-cancel").addEventListener("click", function () { $("ed-io").close(); });
  function exportText(lv) {
    var head = [];
    ["id", "zone", "name", "time", "speed", "spikeMs", "enemySwitches", "teleReverse", "bossHp"].forEach(function (k) { if (lv[k] != null) head.push(k + ": " + JSON.stringify(lv[k])); });
    var out = "{\n  " + head.join(", ") + ",\n";
    if (lv.warps) out += "  warps: " + JSON.stringify(lv.warps) + ",\n";
    if (lv.hint) out += "  hint: " + JSON.stringify(lv.hint) + ",\n";
    out += "  grid: [\n" + lv.grid.map(function (r) { return "    " + JSON.stringify(r) + ","; }).join("\n") + "\n  ],\n},";
    return out;
  }
  $("ed-export").addEventListener("click", function () {
    var lv = current();
    lv.id = (lv.name || "my-level").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-level";
    dialog("Export", "Paste this into levels.js (or keep it — Import reads it back).", exportText(lv), null);
  });
  // Reads a share code or link, JSON, or a levels.js-style object literal.
  function parseAny(text) {
    text = String(text || "").trim();
    if (/v1\.[A-Za-z0-9_-]+/.test(text)) return Code.decode(text);
    var t = text.replace(/,\s*$/, "").replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":').replace(/,\s*([}\]])/g, "$1");
    return Code.clean(JSON.parse(t));
  }
  $("ed-import").addEventListener("click", function () {
    dialog("Import", "Paste a share link, a level code, or a level exported from here or levels.js.", "", function (text) {
      try {
        var lv = parseAny(text);
        pushUndo();
        level = Object.assign(blank(lv.grid[0].length, lv.grid.length), lv);
        fillForm(); buildPalette(); changed();
      } catch (e) {
        $("ed-result").textContent = "Couldn't read that: " + (e.message || e); $("ed-result").className = "ed-result bad";
      }
    });
  });
  LEVELS.forEach(function (lv, i) {
    var o = document.createElement("option");
    o.value = String(i); o.textContent = (i + 1) + " · " + lv.name + " (" + lv.zone + ")";
    $("ed-open").appendChild(o);
  });
  $("ed-open").addEventListener("change", function () {
    if (this.value === "") return;
    var src = LEVELS[Number(this.value)];
    pushUndo();
    level = JSON.parse(JSON.stringify(src));
    level.id = undefined;
    level.name = src.name + " (remix)";
    this.value = "";
    fillForm(); buildPalette(); changed();
  });

  // ---- start ----------------------------------------------------------------------------------
  level = load(DRAFT_KEY);
  if (!level || !Array.isArray(level.grid) || !level.grid.length) level = blank(24, 15);
  // A "#edit=<code>" link opens that level for editing.
  var m = /#edit=(v1\.[A-Za-z0-9_-]+)/.exec(location.hash);
  if (m) { try { level = Object.assign(blank(10, 10), Code.decode(m[1])); } catch (e) {} }
  fillForm();
  buildPalette();
  pick(glyph);
  showMine();
  changed();
})();
