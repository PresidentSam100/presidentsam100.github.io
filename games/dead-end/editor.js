/* =====================================================================
   Dead End: the maze editor.

   Draw a maze with the tiles the engine knows, see at once whether it can
   be played (engine.js checks: a start, tins that can all be reached, the
   dead able to get to you), play it, save it to "my mazes" (localStorage
   deadend_mine), and share it as a link: the game page plays any
   "#play=<code>" link (levelcode.js). The draft is kept as you go.
   ===================================================================== */
(function () {
  "use strict";
  var E = window.DeadEndEngine, A = window.DeadEndArt, Code = window.DeadEndCode;
  var DRAFT_KEY = "deadend_editor_draft", MINE_KEY = "deadend_mine";
  var TILES = [["#", "Fence"], [" ", "Ground"], [".", "Tin"], ["o", "Torch"], ["+", "Plank"], ["P", "Start"], ["Z", "The dead"], ["=", "Pit gate"]];
  function $(id) { return document.getElementById(id); }

  var canvas = $("ed-board"), g = canvas.getContext("2d");
  var level, glyph = "#", cell = 28, dirty = false, drawing = false;

  function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  function load(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; } }

  // a fenced block with the pit in the middle, to start from
  function blank(cols, rows) {
    var grid = [], y, x, r, cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
    for (y = 0; y < rows; y++) {
      r = "";
      for (x = 0; x < cols; x++) r += x === 0 || y === 0 || x === cols - 1 || y === rows - 1 ? "#" : ".";
      grid.push(r);
    }
    function put(px, py, ch) { if (py > 0 && py < rows - 1 && px > 0 && px < cols - 1) grid[py] = grid[py].slice(0, px) + ch + grid[py].slice(px + 1); }
    for (x = -2; x <= 2; x++) { put(cx + x, cy - 1, x === 0 ? "=" : "#"); put(cx + x, cy + 1, "#"); put(cx + x, cy, Math.abs(x) === 2 ? "#" : "Z"); }
    put(cx, cy - 2, " "); put(cx, rows - 2, "P"); put(1, 1, "o"); put(cols - 2, 1, "o");
    return { name: "My maze", grid: grid };
  }
  function cols() { return level.grid[0].length; }
  function rows() { return level.grid.length; }
  function at(x, y) { return level.grid[y].charAt(x); }
  function put(x, y, ch) { var r = level.grid[y]; level.grid[y] = r.slice(0, x) + ch + r.slice(x + 1); }

  // ---- drawing the block ------------------------------------------------------------
  function fit() {
    var room = Math.min(640, document.documentElement.clientWidth - 30);
    cell = Math.max(12, Math.min(30, Math.floor(room / cols())));
    var dpr = Math.min(2, window.devicePixelRatio || 1), W = cols() * cell, H = rows() * cell;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function render() {
    var kind = 0;
    for (var y = 0; y < rows(); y++) for (var x = 0; x < cols(); x++) {
      var ch = at(x, y), open = null;
      if (ch === "#") open = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(function (d) {
        var nx = x + d[0], ny = y + d[1];
        return nx < 0 || ny < 0 || nx >= cols() || ny >= rows() ? 0 : at(nx, ny) === "#" ? 0 : 1;
      });
      else if (ch === "Z") open = { kind: kind++ % 4 };
      A.tile(g, ch, x * cell, y * cell, cell, 0, false, open);
    }
    g.strokeStyle = "rgba(255, 255, 255, 0.05)"; g.lineWidth = 1; g.beginPath();
    for (x = 1; x < cols(); x++) { g.moveTo(x * cell + 0.5, 0); g.lineTo(x * cell + 0.5, rows() * cell); }
    for (y = 1; y < rows(); y++) { g.moveTo(0, y * cell + 0.5); g.lineTo(cols() * cell, y * cell + 0.5); }
    g.stroke();
  }
  function validate() {
    var errs = E.parse(level).errors, r = $("ed-result");
    r.textContent = errs.length ? errs[0].charAt(0).toUpperCase() + errs[0].slice(1) + "." : "This maze can be played.";
    r.className = "ed-result" + (errs.length ? "" : " ok");
    $("ed-play").disabled = $("ed-share").disabled = $("ed-save").disabled = errs.length > 0;
    return !errs.length;
  }
  var saveTimer = 0;
  function changed() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { store(DRAFT_KEY, level); }, 250);
    render(); validate();
  }

  // ---- the palette --------------------------------------------------------------------
  function buildPalette() {
    var bar = $("ed-palette");
    bar.innerHTML = "";
    TILES.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button"; b.dataset.g = t[0]; b.title = t[1];
      b.setAttribute("aria-pressed", t[0] === glyph ? "true" : "false");
      var c = document.createElement("canvas"); c.width = c.height = 56; c.style.width = c.style.height = "28px";
      var cg = c.getContext("2d"); cg.scale(2, 2);
      A.tile(cg, t[0], 0, 0, 28, 0, false, null);
      b.appendChild(c); b.appendChild(document.createTextNode(t[1]));
      b.addEventListener("click", function () { glyph = t[0]; buildPalette(); });
      bar.appendChild(b);
    });
  }

  // ---- painting -------------------------------------------------------------------------
  function paint(x, y, ch) {
    if (x < 0 || y < 0 || x >= cols() || y >= rows() || at(x, y) === ch) return false;
    if (ch === "P") for (var yy = 0; yy < rows(); yy++) level.grid[yy] = level.grid[yy].replace(/P/g, " ");     // one start
    if (ch === "Z" && level.grid.join("").split("Z").length - 1 >= E.MAX_DEAD) return false;                    // four at most
    put(x, y, ch);
    return true;
  }
  function cellAt(e) {
    var r = canvas.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left) / r.width * cols()), y: Math.floor((e.clientY - r.top) / r.height * rows()) };
  }
  function stroke(e) { var c = cellAt(e); if (paint(c.x, c.y, e.buttons === 2 ? " " : glyph)) changed(); }
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  canvas.addEventListener("pointerdown", function (e) { drawing = true; try { canvas.setPointerCapture(e.pointerId); } catch (err) {} stroke(e); });
  canvas.addEventListener("pointermove", function (e) { if (drawing) stroke(e); });
  window.addEventListener("pointerup", function () { drawing = false; });

  // ---- the form ----------------------------------------------------------------------------
  function fillForm() { $("ed-name").value = level.name || ""; $("ed-cols").value = cols(); $("ed-rows").value = rows(); }
  $("ed-name").addEventListener("input", function () { level.name = this.value.slice(0, 40); dirty = true; store(DRAFT_KEY, level); });
  function resize() {
    var c = Math.max(7, Math.min(E.MAX_SIDE, Math.round(+$("ed-cols").value) || 19)), r = Math.max(7, Math.min(E.MAX_SIDE, Math.round(+$("ed-rows").value) || 21));
    var old = level.grid, grid = [];
    for (var y = 0; y < r; y++) {
      var row = "";
      for (var x = 0; x < c; x++) row += y < old.length && x < old[0].length && !(x === c - 1 || y === r - 1) ? old[y].charAt(x) : (x === 0 || y === 0 || x === c - 1 || y === r - 1 ? "#" : ".");
      grid.push(row);
    }
    level.grid = grid; fillForm(); fit(); changed();
  }
  $("ed-cols").addEventListener("change", resize);
  $("ed-rows").addEventListener("change", resize);

  function open(lv, keepClean) { level = { name: lv.name || "My maze", grid: lv.grid.slice() }; fillForm(); fit(); render(); validate(); dirty = !keepClean; store(DRAFT_KEY, level); }
  function playUrl() { return location.href.replace(/editor\.html.*$/, "").replace(/#.*$/, "") + "#play=" + Code.encode(level); }
  $("ed-play").addEventListener("click", function () { if (validate()) { store(DRAFT_KEY, level); dirty = false; location.href = playUrl(); } });
  $("ed-share").addEventListener("click", function () {
    if (!validate()) return;
    var url = playUrl(), b = this;
    function copied() { dirty = false; b.textContent = "Link copied"; setTimeout(function () { b.textContent = "Copy share link"; }, 1500); }
    function fallback() { if (window.GameShell) GameShell.copyBox({ title: "Copy the link to your maze", text: url }); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(copied, fallback); else fallback();
  });
  function mine() { var m = load(MINE_KEY); return Array.isArray(m) ? m : []; }
  $("ed-save").addEventListener("click", function () {
    if (!validate()) return;
    var list = mine().filter(function (m) { return m.name !== level.name; });
    list.unshift({ name: level.name || "My maze", grid: level.grid.slice() });
    store(MINE_KEY, list.slice(0, 30));
    dirty = false;
    showMine();
  });
  $("ed-new").addEventListener("click", function () {
    function go() { open(blank(19, 21), true); }
    if (dirty && window.GameShell) GameShell.confirm({ title: "Start a new maze?", text: "The one on the block isn't saved.", ok: "New maze" }, function (yes) { if (yes) go(); }); else go();
  });
  $("ed-import").addEventListener("click", function () {
    var text = $("ed-code").value;
    if (!text) return;
    try { open(Code.decode(text)); $("ed-code").value = ""; } catch (err) { $("ed-result").textContent = String(err && err.message || err); $("ed-result").className = "ed-result"; }
  });
  function showMine() {
    var box = $("ed-mine"), list = mine();
    box.innerHTML = list.length ? "<span>My mazes</span>" : "";
    list.forEach(function (m, i) {
      var row = document.createElement("div"); row.className = "mine-row";
      var name = document.createElement("span"); name.textContent = m.name;
      var op = document.createElement("button"); op.type = "button"; op.textContent = "open";
      op.addEventListener("click", function () { open(m, true); });
      var del = document.createElement("button"); del.type = "button"; del.textContent = "delete";
      del.addEventListener("click", function () { var l = mine(); l.splice(i, 1); store(MINE_KEY, l); showMine(); });
      row.appendChild(name); row.appendChild(op); row.appendChild(del); box.appendChild(row);
    });
  }

  // Leaving asks first while the maze on the block has changes that aren't saved or shared
  if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave({ active: function () { return dirty; }, text: "The maze you're drawing isn't saved." });
  window.addEventListener("resize", function () { fit(); render(); });

  var draft = load(DRAFT_KEY);
  open(draft && Array.isArray(draft.grid) && draft.grid.length ? draft : blank(19, 21), true);
  buildPalette();
  showMine();

  // test hooks
  window.DeadEndEditor = {
    level: function () { return level; },
    paint: function (x, y, ch) { var ok = paint(x, y, ch); if (ok) changed(); return ok; },
    pick: function (ch) { glyph = ch; buildPalette(); },
    open: open, dirty: function () { return dirty; }, playUrl: playUrl
  };
})();
