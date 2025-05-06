/* Tile Maze — level editor.
   Reuses the shared rules engine (engine.js) for test-play + solvability,
   so a level that passes here behaves identically in the real game. */
(function () {
  "use strict";

  const E = window.TileEngine;
  const $ = (id) => document.getElementById(id);

  // [char, label, swatch-class, icon, description]
  const PAL = [
    ["p", "Pink", "sw-pink", "", "Pink — harmless floor. Walk freely."],
    ["g", "Green", "sw-green", "♪", "Green — harmless, plays a tone when stepped on."],
    ["r", "Red", "sw-red", "", "Red — solid wall. Cannot be entered."],
    ["y", "Yellow", "sw-yellow", "↩", "Yellow — throws you back to your previous tile."],
    ["o", "Orange", "sw-orange", "🍊", "Orange — flavors you 'Orange' (makes blue live)."],
    ["u", "Purple", "sw-purple", "❄", "Purple ice — slides you forward; flavors you 'Lemon'."],
    ["b", "Blue", "sw-blue", "", "Blue water — live (bounces) if you're Orange or it touches yellow."],
    ["S", "Start", "sw-start", "▶", "Start — where the player spawns. Exactly one per level."],
    ["X", "Goal", "sw-goal", "🏁", "Goal — reach it to win. Exactly one per level."],
    [".", "Empty", "sw-void", "·", "Empty / void — treated as a wall."],
  ];
  const CLS = { p: "t-pink", g: "t-green", r: "t-red", y: "t-yellow", o: "t-orange", u: "t-purple", b: "t-blue", S: "t-start", X: "t-goal", ".": "t-void", " ": "t-void" };
  const VALID = /^[rpgyoubSX. ]+$/;

  // ---- DOM ----
  const status = $("status"), frame = $("frame"), edBoard = $("edBoard");
  const testPad = $("testPad"), palette = $("palette"), palDesc = $("palDesc");
  const wIn = $("wIn"), hIn = $("hIn"), nameIn = $("nameIn"), hintIn = $("hintIn");
  const saved = $("saved");
  const ioPanel = $("ioPanel"), ioTitle = $("ioTitle"), ioText = $("ioText"), ioNote = $("ioNote");
  const copyBtn = $("copyBtn"), loadBtn = $("loadBtn");
  const testOverlay = $("testOverlay"), testTitle = $("testTitle"), testSub = $("testSub");

  // ---- state ----
  let cols = 8, rows = 6, sel = "r";
  let grid = [];              // array of arrays of chars
  let mode = "edit";         // edit | test
  let painting = false;
  const GAP = 4;
  let cell = 48;
  let playerEl = null, tstate = null, tmoves = 0, tlocked = false, twon = false;

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n | 0));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const makeGrid = (nc, nr, fill) => { const g = []; for (let r = 0; r < nr; r++) g.push(new Array(nc).fill(fill)); return g; };
  const STORE = "tileMaze.customLevels";
  // one-time migration from the pre-rename key (folder was "color-tile")
  try { const _o = localStorage.getItem("colorTileMaze.customLevels"); if (_o != null && localStorage.getItem(STORE) == null) { localStorage.setItem(STORE, _o); localStorage.removeItem("colorTileMaze.customLevels"); } } catch (e) {}

  // ---- audio (shared cues from audio.js) ----
  const SFX = window.TileSFX;

  // ---- rendering ----
  function computeCell() {
    const maxW = Math.min((frame.parentElement.clientWidth || 520), 560);
    const maxH = Math.max(220, window.innerHeight - 300);
    const byW = (maxW - GAP * (cols + 1)) / cols;
    const byH = (maxH - GAP * (rows + 1)) / rows;
    cell = Math.max(20, Math.min(56, Math.floor(Math.min(byW, byH))));
    document.documentElement.style.setProperty("--cell", cell + "px");
  }
  function renderBoard() {
    edBoard.style.gridTemplateColumns = `repeat(${cols}, var(--cell))`;
    edBoard.innerHTML = "";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = grid[r][c];
        const d = document.createElement("div");
        d.className = "tile " + (CLS[ch] || "t-void");
        if (ch === "b" && E.blueIsBounce(grid, tstate ? tstate.flavor : "Plain", r, c)) d.classList.add("live");
        d.dataset.r = r; d.dataset.c = c;
        edBoard.appendChild(d);
      }
    }
  }
  function refreshLive() {
    const tiles = edBoard.children; let i = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++, i++) {
      if (grid[r][c] === "b") tiles[i].classList.toggle("live", E.blueIsBounce(grid, tstate ? tstate.flavor : "Plain", r, c));
    }
  }

  // ---- editing ----
  function removeChar(ch) { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (grid[r][c] === ch) grid[r][c] = "p"; }
  function setCell(r, c, ch) {
    if (mode !== "edit" || r < 0 || r >= rows || c < 0 || c >= cols) return;
    if (grid[r][c] === ch && ch !== "S" && ch !== "X") return;
    if (ch === "S" || ch === "X") { if (grid[r][c] === ch) return; removeChar(ch); grid[r][c] = ch; renderBoard(); }
    else { grid[r][c] = ch; const el = edBoard.children[r * cols + c]; if (el) el.className = "tile " + (CLS[ch] || "t-void"); }
    updateStatus();
  }
  function paintAt(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || !el.classList.contains("tile")) return;
    setCell(+el.dataset.r, +el.dataset.c, sel);
  }

  function resize(nc, nr) {
    nc = clamp(nc, 3, 20); nr = clamp(nr, 3, 20);
    const ng = [];
    for (let r = 0; r < nr; r++) { const row = []; for (let c = 0; c < nc; c++) row.push(r < rows && c < cols ? grid[r][c] : "."); ng.push(row); }
    grid = ng; cols = nc; rows = nr; wIn.value = cols; hIn.value = rows;
    computeCell(); renderBoard(); updateStatus();
  }
  function frameWalls() {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) grid[r][c] = "r";
    renderBoard(); updateStatus();
  }
  function fillAll() { const ch = sel === "S" || sel === "X" ? "p" : sel; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) grid[r][c] = ch; renderBoard(); updateStatus(); }
  function newRoom() {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) grid[r][c] = (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) ? "r" : "p";
    if (rows >= 3 && cols >= 3) { grid[1][1] = "S"; grid[rows - 2][cols - 2] = "X"; }
    renderBoard(); updateStatus();
  }

  // ---- validation / solving ----
  function counts() { let s = 0, x = 0; for (const row of grid) for (const ch of row) { if (ch === "S") s++; if (ch === "X") x++; } return { s, x }; }
  function validate() { const { s, x } = counts(); const m = []; if (s !== 1) m.push(s + " start (need 1)"); if (x !== 1) m.push(x + " goal (need 1)"); return { ok: !m.length, msgs: m }; }
  function updateStatus(msg, kind) {
    if (msg) { status.textContent = msg; status.className = "ed-status" + (kind ? " " + kind : ""); return; }
    const v = validate();
    if (v.ok) { status.textContent = "Ready — " + cols + "×" + rows + ". Test or Check when you like."; status.className = "ed-status"; }
    else { status.textContent = "⚠ " + v.msgs.join(" · "); status.className = "ed-status bad"; }
  }
  function solve(g) {
    const start = E.findStart(g);
    const key = (s) => s.r + "," + s.c + "," + s.flavor;
    const seen = new Set([key(start)]);
    const q = [{ state: start, path: [] }];
    while (q.length) {
      const { state, path } = q.shift();
      if (E.tileAt(g, state.r, state.c) === "X") return path;
      for (const dir of ["up", "down", "left", "right"]) {
        const res = E.resolveMove(g, state, dir);
        const k = key(res.final);
        if (seen.has(k)) continue;
        seen.add(k);
        const np = path.concat(dir[0].toUpperCase());
        if (res.win) return np;
        q.push({ state: res.final, path: np });
      }
    }
    return null;
  }
  function checkSolvable() {
    const v = validate(); if (!v.ok) { updateStatus("⚠ Fix first: " + v.msgs.join(" · "), "bad"); return; }
    const sol = solve(grid);
    if (sol) updateStatus("✓ Solvable in " + sol.length + " moves:  " + sol.join(" "), "good");
    else updateStatus("✗ Unsolvable — no path from Start to Goal.", "bad");
  }

  // ---- test play (reuses the engine) ----
  function placePlayer(r, c, animate) {
    if (!playerEl) return;
    if (!animate) playerEl.style.transition = "none";
    playerEl.style.transform = `translate(${c * (cell + GAP)}px, ${r * (cell + GAP)}px)`;
    if (!animate) { void playerEl.offsetWidth; playerEl.style.transition = ""; }
  }
  function setFlavor(f) { if (playerEl) playerEl.dataset.flavor = f; }
  function startTest() {
    tstate = E.findStart(grid); tmoves = 0; twon = false; tlocked = false;
    testOverlay.hidden = true;
    renderBoard(); setFlavor("Plain"); placePlayer(tstate.r, tstate.c, false); refreshLive();
    updateStatus("Test — arrows / WASD / pad to move, R to restart. Reach the 🏁.");
  }
  function enterTest() {
    const v = validate(); if (!v.ok) { updateStatus("⚠ Fix first: " + v.msgs.join(" · "), "bad"); return; }
    mode = "test"; edBoard.classList.add("testing"); testPad.hidden = false; $("testBtn").textContent = "■ Stop test";
    if (!playerEl) { playerEl = document.createElement("div"); playerEl.className = "player"; playerEl.innerHTML = '<span class="soul"></span>'; frame.appendChild(playerEl); }
    playerEl.hidden = false;
    startTest();
  }
  function exitTest() {
    mode = "edit"; edBoard.classList.remove("testing"); testPad.hidden = true; $("testBtn").textContent = "▶ Test";
    if (playerEl) playerEl.hidden = true;
    testOverlay.hidden = true; tstate = null;
    renderBoard(); updateStatus();
  }
  // Shared animation context — same shape the real game passes to TileAnim
  // (continuous slides, electric zap, slower water, wall bump), but silent.
  function tCtx() {
    return {
      playerEl,
      gap: GAP,
      cell: () => cell,
      grid: () => grid,
      reduced: () => !!(window.RM_ON && window.RM_ON()),
      from: tstate ? { r: tstate.r, c: tstate.c } : null, // tile the player is leaving (midpoint speed blend)
      setFlavor,
      sfx: SFX,
      flashTile: (r, c) => {
        const el = edBoard.children[r * cols + c];
        if (el) { el.classList.add("zapping"); setTimeout(() => el.classList.remove("zapping"), 340); }
      },
    };
  }
  async function testMove(dir) {
    if (mode !== "test" || tlocked || twon) return;
    const res = E.resolveMove(grid, tstate, dir);
    const A = window.TileAnim;          // shared animation module (guarded so a load hiccup never freezes test-play)
    if (res.blocked) { tlocked = true; SFX.thud(); if (A) await A.bump(tCtx(), dir, tstate); tlocked = false; return; }
    tlocked = true; tmoves++;
    if (A) await A.play(tCtx(), res);
    else placePlayer(res.final.r, res.final.c, false);
    tstate = res.final; setFlavor(tstate.flavor); refreshLive();
    if (A && res.hitWall && !res.win && !(window.RM_ON && window.RM_ON())) { SFX.thud(); await A.bump(tCtx(), dir, tstate); }
    tlocked = false;
    if (res.win) { twon = true; SFX.win(); testTitle.textContent = "Solved! 🎉"; testSub.textContent = "Reached the goal in " + tmoves + " moves."; setTimeout(() => { testOverlay.hidden = false; }, 250); }
  }

  // ---- import / export ----
  function exportText() {
    const name = (nameIn.value || "Untitled").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const hint = (hintIn.value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const lines = ["{", '  name: "' + name + '",', '  hint: "' + hint + '",', "  grid: ["];
    grid.forEach((r) => lines.push('    "' + r.join("") + '",'));
    lines.push("  ],", "},");
    return lines.join("\n");
  }
  function openIO(title, text, showLoad, note) {
    ioTitle.textContent = title; ioText.value = text; ioPanel.hidden = false;
    loadBtn.hidden = !showLoad; ioNote.textContent = note || "";
    ioText.scrollTop = 0; if (showLoad) ioText.focus();
  }
  function parseImport(text) {
    const nameM = text.match(/name\s*:\s*["']([^"']*)["']/);
    const hintM = text.match(/hint\s*:\s*["']([^"']*)["']/);
    let rowsArr = [...text.matchAll(/["']([rpgyoubSX. ]+)["']/g)].map((m) => m[1]).filter((s) => VALID.test(s));
    if (rowsArr.length < 2) rowsArr = text.split(/\r?\n/).map((s) => s.trim().replace(/[",]/g, "")).filter((s) => s.length && VALID.test(s));
    if (rowsArr.length < 2) return { error: "Couldn't find at least 2 grid rows." };
    const w = Math.max(...rowsArr.map((s) => s.length));
    const g = rowsArr.map((s) => { const row = s.split(""); while (row.length < w) row.push("."); return row; });
    return { name: nameM ? nameM[1] : "", hint: hintM ? hintM[1] : "", grid: g };
  }
  function loadImport() {
    const res = parseImport(ioText.value);
    if (res.error) { ioNote.textContent = "⚠ " + res.error; return; }
    if (mode === "test") exitTest();
    grid = res.grid; rows = grid.length; cols = grid[0].length;
    if (res.name) nameIn.value = res.name;
    if (res.hint) hintIn.value = res.hint;
    wIn.value = cols; hIn.value = rows;
    ioPanel.hidden = true;
    computeCell(); renderBoard(); updateStatus();
  }

  // ---- saved levels (localStorage) ----
  const loadSaved = () => { try { return JSON.parse(localStorage.getItem(STORE) || "[]"); } catch (e) { return []; } };
  const persistSaved = (a) => { try { localStorage.setItem(STORE, JSON.stringify(a)); } catch (e) {} };
  function saveCurrent() {
    const v = validate(); if (!v.ok) { updateStatus("⚠ Fix before saving: " + v.msgs.join(" · "), "bad"); return; }
    const a = loadSaved();
    a.push({ name: nameIn.value || "Untitled", hint: hintIn.value || "", grid: grid.map((r) => r.join("")) });
    persistSaved(a); renderSaved();
    updateStatus('💾 Saved "' + (nameIn.value || "Untitled") + '" (' + a.length + " total).", "good");
  }
  function loadSavedLevel(lvl) {
    if (mode === "test") exitTest();
    grid = lvl.grid.map((s) => s.split("")); rows = grid.length; cols = grid[0].length;
    nameIn.value = lvl.name || ""; hintIn.value = lvl.hint || "";
    wIn.value = cols; hIn.value = rows;
    computeCell(); renderBoard(); updateStatus();
  }
  function renderSaved() {
    const a = loadSaved(); saved.innerHTML = "";
    if (!a.length) { saved.innerHTML = '<div class="empty">No saved levels yet.</div>'; return; }
    a.forEach((lvl, i) => {
      const row = document.createElement("div"); row.className = "saved-item";
      const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = i + 1 + ". " + lvl.name;
      const ed = document.createElement("button"); ed.className = "btn mini"; ed.textContent = "Edit"; ed.addEventListener("click", () => loadSavedLevel(lvl));
      const del = document.createElement("button"); del.className = "btn mini"; del.textContent = "✕"; del.title = "Delete";
      del.addEventListener("click", () => { const arr = loadSaved(); arr.splice(i, 1); persistSaved(arr); renderSaved(); });
      row.appendChild(nm); row.appendChild(ed); row.appendChild(del); saved.appendChild(row);
    });
  }

  // ---- palette ----
  function renderPalette() {
    palette.innerHTML = "";
    PAL.forEach(([ch, name, cls, ico, desc]) => {
      const b = document.createElement("button"); b.className = "swatch-btn " + cls; b.dataset.ch = ch; b.title = name;
      if (ico) b.innerHTML = '<span class="ico">' + ico + "</span>";
      const lab = document.createElement("span"); lab.textContent = name; b.appendChild(lab);
      if (ch === sel) b.classList.add("sel");
      b.addEventListener("click", () => {
        sel = ch; palDesc.textContent = desc;
        [...palette.children].forEach((x) => x.classList.toggle("sel", x.dataset.ch === ch));
      });
      palette.appendChild(b);
    });
    const cur = PAL.find((p) => p[0] === sel); palDesc.textContent = cur ? cur[4] : "";
  }

  // ---- wiring ----
  edBoard.addEventListener("pointerdown", (e) => { if (mode !== "edit") return; e.preventDefault(); painting = true; paintAt(e); });
  edBoard.addEventListener("pointermove", (e) => { if (painting && mode === "edit") paintAt(e); });
  window.addEventListener("pointerup", () => { painting = false; });
  window.addEventListener("pointercancel", () => { painting = false; });

  testPad.querySelectorAll(".dbtn").forEach((b) => b.addEventListener("click", () => testMove(b.dataset.dir)));
  window.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (mode !== "test") return;
    if (e.key === "r" || e.key === "R") { startTest(); return; }
    const dir = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right" }[e.key];
    if (dir) { e.preventDefault(); testMove(dir); }
  });

  wIn.addEventListener("change", () => resize(+wIn.value, rows));
  hIn.addEventListener("change", () => resize(cols, +hIn.value));
  $("frameBtn").addEventListener("click", frameWalls);
  $("fillBtn").addEventListener("click", fillAll);
  $("newBtn").addEventListener("click", newRoom);
  $("testBtn").addEventListener("click", () => (mode === "test" ? exitTest() : enterTest()));
  $("checkBtn").addEventListener("click", checkSolvable);
  $("saveBtn").addEventListener("click", saveCurrent);
  $("exportBtn").addEventListener("click", () => openIO("Export", exportText(), false, "Paste this into the array in levels.js to add it to the game permanently."));
  $("importBtn").addEventListener("click", () => openIO("Import", "", true, "Paste a grid (one row per line) or a full level object, then Load into editor."));
  $("ioClose").addEventListener("click", () => { ioPanel.hidden = true; });
  loadBtn.addEventListener("click", loadImport);
  copyBtn.addEventListener("click", () => {
    ioText.select();
    try { document.execCommand("copy"); } catch (e) {}
    if (navigator.clipboard) { try { navigator.clipboard.writeText(ioText.value); } catch (e) {} }
    copyBtn.textContent = "Copied!"; setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
  });
  $("testReplay").addEventListener("click", startTest);
  $("testDone").addEventListener("click", exitTest);
  window.addEventListener("resize", () => { computeCell(); if (mode === "test" && tstate) placePlayer(tstate.r, tstate.c, false); });

  // ---- boot ----
  renderPalette();
  grid = makeGrid(cols, rows, "r");
  computeCell();
  newRoom();
  renderSaved();
})();
