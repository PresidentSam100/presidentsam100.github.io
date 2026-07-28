
(() => {
  "use strict";
  const N = 10, LETTERS = "ABCDEFGHIJ";
  const SHIPS = [
    { name: "Carrier", size: 5 }, { name: "Battleship", size: 4 }, { name: "Destroyer", size: 3 },
    { name: "Submarine", size: 3 }, { name: "Patrol Boat", size: 2 },
  ];
  const $ = (id) => document.getElementById(id);
  const coordLabel = (r, c) => LETTERS[r] + c;

  // ---- audio ----
  let actx = null, muted = false; // muting is handled globally by the shared toggle (mute-toggle.js)
  function snd(f, dur, type, vol, slideTo) {
    if (muted) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = type || "sine"; o.frequency.setValueAtTime(f, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  function noise(dur, vol) {
    if (muted) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime, len = (actx.sampleRate * dur) | 0, buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = actx.createBufferSource(); s.buffer = buf; const g = actx.createGain(); g.gain.value = vol;
      s.connect(g); g.connect(actx.destination); s.start(t);
    } catch (e) {}
  }
  const SFX = {
    fire: () => snd(420, 0.12, "triangle", 0.12, 180),
    hit: () => { snd(150, 0.3, "sawtooth", 0.25, 60); noise(0.2, 0.18); },
    miss: () => { snd(700, 0.12, "sine", 0.12, 400); noise(0.12, 0.06); },
    sunk: () => [330, 247, 165].forEach((f, i) => setTimeout(() => snd(f, 0.22, "square", 0.22), i * 110)),
    place: () => snd(520, 0.05, "square", 0.1),
    rotate: () => snd(360, 0.07, "square", 0.1, 560),
    random: () => [560, 680, 500, 640, 600].forEach((f, i) => setTimeout(() => snd(f, 0.04, "square", 0.08), i * 45)),
    reset: () => { snd(500, 0.18, "sine", 0.12, 150); noise(0.1, 0.05); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => snd(f, 0.2, "triangle", 0.24), i * 120)),
    lose: () => [392, 311, 233, 175].forEach((f, i) => setTimeout(() => snd(f, 0.25, "sawtooth", 0.2), i * 130)),
  };

  // ---- state ----
  let playerBoard, enemyBoard, playerShips, enemyShips, phase, turn, placeIdx, orient, cpuTargets, round = 0;
  let hoverR = -1, hoverC = -1;   // last hovered cell on the placement grid
  let difficulty = localStorage.getItem("battleship_diff") || "medium";
  let rec = JSON.parse(localStorage.getItem("battleship_record") || '{"w":0,"l":0}');

  const emptyBoard = () => Array.from({ length: N }, () => Array.from({ length: N }, () => ({ ship: null, hit: false, attacked: false })));
  const makeShips = () => SHIPS.map((s, i) => ({ name: s.name, size: s.size, idx: i, cells: [], hits: 0, sunk: false }));
  const allSunk = (ships) => ships.every((s) => s.sunk);

  function canPlace(board, r, c, size, o) {
    for (let i = 0; i < size; i++) {
      const rr = o === "v" ? r + i : r, cc = o === "h" ? c + i : c;
      if (rr < 0 || rr >= N || cc < 0 || cc >= N || board[rr][cc].ship) return false;
    }
    return true;
  }
  function placeShip(board, ship, r, c, o) {
    ship.cells = [];
    for (let i = 0; i < ship.size; i++) {
      const rr = o === "v" ? r + i : r, cc = o === "h" ? c + i : c;
      board[rr][cc].ship = ship; ship.cells.push([rr, cc]);
    }
  }
  function placeRandom(board, ships) {
    ships.forEach((ship) => {
      let ok = false, guard = 0;
      while (!ok && guard++ < 999) {
        const o = Math.random() < 0.5 ? "h" : "v", r = (Math.random() * N) | 0, c = (Math.random() * N) | 0;
        if (canPlace(board, r, c, ship.size, o)) { placeShip(board, ship, r, c, o); ok = true; }
      }
    });
  }

  // ---- grid building ----
  function buildGrid(el) {
    el.innerHTML = "";
    el.appendChild(div("corner"));
    for (let c = 0; c < N; c++) el.appendChild(div("chead", String(c)));
    for (let r = 0; r < N; r++) {
      el.appendChild(div("rhead", LETTERS[r]));
      for (let c = 0; c < N; c++) {
        const cell = div("cell"); cell.dataset.r = r; cell.dataset.c = c; el.appendChild(cell);
      }
    }
  }
  function div(cls, txt) { const d = document.createElement("div"); d.className = cls; if (txt != null) d.textContent = txt; return d; }
  const cellEl = (grid, r, c) => grid.querySelector('.cell[data-r="' + r + '"][data-c="' + c + '"]');

  // visual feedback after a shot: a burst on a hit, a sinking wobble when a ship goes down
  function flashHit(grid, res, r, c) {
    if (!res.hit) return;
    if (res.sunk) res.ship.cells.forEach((p) => { const e = cellEl(grid, p[0], p[1]); if (e) e.classList.add("sinking"); });
    else { const e = cellEl(grid, r, c); if (e) e.classList.add("hitflash"); }
  }

  // ---- render ----
  function renderBoard(grid, board, showShips) {
    grid.querySelectorAll(".cell").forEach((cell) => {
      const r = +cell.dataset.r, c = +cell.dataset.c, b = board[r][c];
      cell.className = "cell"; cell.textContent = "";
      if (b.attacked) {
        if (b.ship) { cell.classList.add(b.ship.sunk ? "sunk" : "hit"); cell.textContent = b.ship.sunk ? "" : "✕"; }
        else { cell.classList.add("miss"); cell.textContent = "•"; }
      } else if (showShips && b.ship) {
        const sh = b.ship, cs = sh.cells;
        const horiz = cs.length > 1 && cs[0][0] === cs[cs.length - 1][0];
        cell.classList.add("ship", "ship" + (sh.idx % 5), horiz ? "sh" : "sv");
        if (cs[0][0] === r && cs[0][1] === c) cell.classList.add("scap-a");
        if (cs[cs.length - 1][0] === r && cs[cs.length - 1][1] === c) cell.classList.add("scap-b");
      }
      else { cell.classList.add("water"); }
    });
  }
  function fleetHTML(ships, placedCount) {
    return ships.map((s, i) => {
      const placed = placedCount != null && i < placedCount;
      return '<span class="ftag ' + (s.sunk ? "sunk" : placed ? "placed" : "") + '">' + s.name + " " + s.size + "</span>";
    }).join("");
  }
  function render() {
    renderBoard(playerGrid, playerBoard, true);
    renderBoard(enemyGrid, enemyBoard, phase === "over");
    enemyGrid.classList.toggle("active", phase === "battle" && turn === "player");
    $("enemyFleet").innerHTML = fleetHTML(enemyShips);
    $("playerFleet").innerHTML = fleetHTML(playerShips, phase === "place" ? placeIdx : null);
    if (phase === "place") {
      $("placing").innerHTML = placeIdx < SHIPS.length
        ? "Place your <b>" + SHIPS[placeIdx].name + "</b> (" + SHIPS[placeIdx].size + ") · " + (orient === "h" ? "horizontal ▸" : "vertical ▾")
        : "All ships placed — ready!";
      $("startBtn").disabled = placeIdx < SHIPS.length;
    }
  }
  function status(html) { $("status").innerHTML = html; }

  // ---- placement ----
  const playerGrid = $("playerGrid"), enemyGrid = $("enemyGrid");
  buildGrid(playerGrid); buildGrid(enemyGrid);

  function previewAt(r, c) {
    clearPreview();
    const ship = playerShips[placeIdx]; if (!ship) return;
    const ok = canPlace(playerBoard, r, c, ship.size, orient);
    for (let i = 0; i < ship.size; i++) {
      const rr = orient === "v" ? r + i : r, cc = orient === "h" ? c + i : c;
      if (rr < N && cc < N) { const el = cellEl(playerGrid, rr, cc); if (el) el.classList.add(ok ? "preview" : "previewbad"); }
    }
  }
  const clearPreview = () => playerGrid.querySelectorAll(".preview,.previewbad").forEach((el) => el.classList.remove("preview", "previewbad"));

  playerGrid.addEventListener("mouseover", (e) => {
    const cell = e.target.closest(".cell"); if (!cell) return;
    hoverR = +cell.dataset.r; hoverC = +cell.dataset.c;
    if (phase === "place" && placeIdx < SHIPS.length) previewAt(hoverR, hoverC);
  });
  playerGrid.addEventListener("mouseleave", () => { hoverR = hoverC = -1; if (phase === "place") clearPreview(); });
  playerGrid.addEventListener("click", (e) => {
    const cell = e.target.closest(".cell"); if (!cell || phase !== "place" || placeIdx >= SHIPS.length) return;
    const r = +cell.dataset.r, c = +cell.dataset.c, ship = playerShips[placeIdx];
    if (!canPlace(playerBoard, r, c, ship.size, orient)) return;
    placeShip(playerBoard, ship, r, c, orient); placeIdx++; SFX.place(); clearPreview(); render();
    if (placeIdx < SHIPS.length) previewAt(r, c);
  });

  $("rotateBtn").addEventListener("click", () => {
    orient = orient === "h" ? "v" : "h"; render(); SFX.rotate();
    if (phase === "place" && placeIdx < SHIPS.length && hoverR >= 0) previewAt(hoverR, hoverC);
  });
  $("randomBtn").addEventListener("click", () => { resetPlacement(); placeRandom(playerBoard, playerShips); placeIdx = SHIPS.length; render(); SFX.random(); });
  $("resetBtn").addEventListener("click", () => { resetPlacement(); render(); SFX.reset(); });
  $("startBtn").addEventListener("click", startBattle);

  function renderDiff() { document.querySelectorAll(".dbtn").forEach((b) => b.classList.toggle("sel", b.dataset.diff === difficulty)); }
  document.querySelectorAll(".dbtn").forEach((b) => b.addEventListener("click", () => { difficulty = b.dataset.diff; localStorage.setItem("battleship_diff", difficulty); renderDiff(); }));
  renderDiff();

  function resetPlacement() { playerBoard = emptyBoard(); playerShips = makeShips(); placeIdx = 0; }

  // ---- battle ----
  function startBattle() {
    if (placeIdx < SHIPS.length) return;
    // Bump the round so any still-pending async work (a coin-flip callback or a
    // queued CPU turn) from the previous game is recognized as stale and ignored.
    round++;
    try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    enemyBoard = emptyBoard(); enemyShips = makeShips(); placeRandom(enemyBoard, enemyShips);
    phase = "battle"; turn = "player"; cpuTargets = [];
    $("enemyCol").hidden = false; $("placeControls").style.display = "none";
    $("playerTitle").textContent = "Your Fleet (under fire)";
    render();
    if (window.coinFlip) {
      const myRound = round;
      coinFlip({ you: "You", cpu: "CPU", accent: "#36cfff" }, function (who) {
        if (myRound !== round) return; // a new game was started before this flip resolved
        turn = who === "cpu" ? "cpu" : "player"; render();
        if (turn === "cpu") { status('<span class="warn">CPU fires first…</span>'); scheduleCpu(750); }
        else status('<span class="ok">Battle!</span> Fire at enemy waters.');
      });
    } else status('<span class="ok">Battle!</span> Fire at enemy waters.');
  }

  // Queue the CPU's turn but only let it run if we're still in the same game —
  // starting a new game bumps the round and cancels any pending CPU turn.
  function scheduleCpu(delay) {
    const myRound = round;
    setTimeout(() => { if (myRound === round) cpuTurn(); }, delay);
  }

  function attack(board, r, c) {
    const cell = board[r][c]; cell.attacked = true;
    if (cell.ship) {
      cell.hit = true; cell.ship.hits++;
      const sunk = cell.ship.hits === cell.ship.size; if (sunk) cell.ship.sunk = true;
      return { hit: true, ship: cell.ship, sunk };
    }
    return { hit: false };
  }

  enemyGrid.addEventListener("click", (e) => {
    const cell = e.target.closest(".cell"); if (!cell || phase !== "battle" || turn !== "player") return;
    const r = +cell.dataset.r, c = +cell.dataset.c; if (enemyBoard[r][c].attacked) return;
    const res = attack(enemyBoard, r, c);
    if (res.hit) { res.sunk ? SFX.sunk() : SFX.hit(); } else SFX.miss();
    render(); flashHit(enemyGrid, res, r, c);
    if (allSunk(enemyShips)) { setTimeout(() => gameOver("player"), res.sunk ? 650 : 150); return; }
    if (res.hit) status('<span class="hit">HIT at ' + coordLabel(r, c) + "!</span>" + (res.sunk ? " Sank their " + res.ship.name + "." : " Fire again."));
    else { status("Miss at " + coordLabel(r, c) + " — <span class=\"warn\">CPU's turn…</span>"); turn = "cpu"; render(); scheduleCpu(800); }
  });
  enemyGrid.addEventListener("mouseover", (e) => { const cell = e.target.closest(".cell"); if (cell && phase === "battle" && turn === "player") $("coord").textContent = "🎯 " + coordLabel(+cell.dataset.r, +cell.dataset.c); });
  enemyGrid.addEventListener("mouseleave", () => { $("coord").textContent = ""; });

  // ---- CPU ----
  function cpuPick() {
    if (difficulty === "easy") return cpuPickEasy();
    if (difficulty === "hard") return cpuPickHard();
    return cpuPickMedium();
  }
  // Easy: fire at any random untouched cell (no hunting, no follow-up).
  function cpuPickEasy() {
    const cand = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!playerBoard[r][c].attacked) cand.push([r, c]);
    return cand[(Math.random() * cand.length) | 0];
  }
  // Medium: checkerboard hunting, then chase adjacent cells after a hit (cpuTargets queue).
  function cpuPickMedium() {
    while (cpuTargets.length) { const t = cpuTargets.shift(); if (!playerBoard[t[0]][t[1]].attacked) return t; }
    const cand = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!playerBoard[r][c].attacked && (r + c) % 2 === 0) cand.push([r, c]);
    if (!cand.length) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!playerBoard[r][c].attacked) cand.push([r, c]);
    return cand[(Math.random() * cand.length) | 0];
  }
  // Hard: probability density — score every cell by how many ways the remaining
  // ships could still sit there; in target mode, weight placements that cover known hits.
  function cpuPickHard() {
    const remaining = playerShips.filter((s) => !s.sunk).map((s) => s.size);
    let anyHit = false;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const b = playerBoard[r][c]; if (b.attacked && b.ship && !b.ship.sunk) anyHit = true; }
    const heat = Array.from({ length: N }, () => Array(N).fill(0));
    const blocked = (r, c) => { const b = playerBoard[r][c]; return (b.attacked && !b.ship) || (b.ship && b.ship.sunk); };
    const isHit = (r, c) => { const b = playerBoard[r][c]; return b.attacked && b.ship && !b.ship.sunk; };
    for (const size of remaining) for (let o = 0; o < 2; o++) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const cells = []; let ok = true, hc = 0;
      for (let i = 0; i < size; i++) {
        const rr = o ? r + i : r, cc = o ? c : c + i;
        if (rr >= N || cc >= N || blocked(rr, cc)) { ok = false; break; }
        if (isHit(rr, cc)) hc++;
        cells.push([rr, cc]);
      }
      if (!ok) continue;
      const weight = anyHit ? (hc > 0 ? hc * hc * 20 : 0) : 1;
      if (weight === 0) continue;
      for (const p of cells) if (!playerBoard[p[0]][p[1]].attacked) heat[p[0]][p[1]] += weight;
    }
    let best = 0, pick = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (playerBoard[r][c].attacked) continue;
      if (heat[r][c] > best) { best = heat[r][c]; pick = [[r, c]]; }
      else if (heat[r][c] === best && best > 0) pick.push([r, c]);
    }
    return pick.length ? pick[(Math.random() * pick.length) | 0] : cpuPickEasy();
  }
  function cpuOnHit(r, c, ship, sunk) {
    if (sunk) { cpuTargets = []; return; }   // start a fresh hunt
    [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([nr, nc]) => {
      if (nr >= 0 && nr < N && nc >= 0 && nc < N && !playerBoard[nr][nc].attacked) cpuTargets.push([nr, nc]);
    });
  }
  function cpuTurn() {
    if (phase !== "battle") return;
    const [r, c] = cpuPick(); const res = attack(playerBoard, r, c);
    if (res.hit) { cpuOnHit(r, c, res.ship, res.sunk); res.sunk ? SFX.sunk() : SFX.hit(); } else SFX.miss();
    render(); flashHit(playerGrid, res, r, c);
    if (allSunk(playerShips)) { setTimeout(() => gameOver("cpu"), res.sunk ? 650 : 150); return; }
    if (res.hit) { status('CPU <span class="hit">HIT</span> at ' + coordLabel(r, c) + (res.sunk ? " — sank your " + res.ship.name + "!" : "…")); scheduleCpu(800); }
    else { status("CPU missed at " + coordLabel(r, c) + ' — <span class="ok">your turn.</span>'); turn = "player"; render(); }
  }

  // ---- end ----
  function gameOver(winner) {
    phase = "over"; render();
    if (winner === "player") { rec.w++; SFX.win(); $("overTitle").textContent = "🏆 Victory!"; $("overMsg").textContent = "You sank the entire enemy fleet."; }
    else { rec.l++; SFX.lose(); $("overTitle").textContent = "💥 Defeated"; $("overMsg").textContent = "The CPU sank your fleet."; }
    localStorage.setItem("battleship_record", JSON.stringify(rec));
    $("record").innerHTML = "Record &nbsp; <b>" + rec.w + "</b> W &nbsp;·&nbsp; <b>" + rec.l + "</b> L";
    $("over").classList.remove("hidden");
  }

  function newGame() {
    // Bump the round so a pending CPU turn or coin-flip callback from the
    // finished game can't fire on top of the fresh placement screen.
    round++;
    $("over").classList.add("hidden");
    playerBoard = emptyBoard(); enemyBoard = emptyBoard(); playerShips = makeShips(); enemyShips = makeShips();
    placeIdx = 0; orient = "h"; phase = "place"; turn = "player"; cpuTargets = [];
    $("enemyCol").hidden = true; $("placeControls").style.display = "flex";
    $("playerTitle").textContent = "Your Fleet";
    $("coord").textContent = "";
    status("Place your fleet — click to drop ships, <b>Rotate</b> to turn, or go <b>Random</b>.");
    render();
  }
  // keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (phase === "over") { if (e.key === "Enter") { e.preventDefault(); newGame(); } return; }
    if (phase !== "place") return;
    const onBtn = document.activeElement && document.activeElement.tagName === "BUTTON";
    const k = e.key.toLowerCase();
    if (k === "r" || k === " ") { if (k === " " && onBtn) return; e.preventDefault(); $("rotateBtn").click(); }
    else if (k === "a") { e.preventDefault(); $("randomBtn").click(); }
    else if (k === "backspace" || k === "delete") { e.preventDefault(); $("resetBtn").click(); }
    else if (k === "enter") { if (onBtn) return; e.preventDefault(); if (!$("startBtn").disabled) $("startBtn").click(); }
  });

  $("againBtn").addEventListener("click", newGame);

  newGame();
})();
