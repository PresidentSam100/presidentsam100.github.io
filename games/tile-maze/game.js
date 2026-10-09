/* Tile Maze - browser UI controller. */
(function () {
  "use strict";

  const E = window.TileEngine;
  const LEVELS = window.LEVELS;

  // ----- tile metadata for rendering / legend -----
  const TILE = {
    p: { cls: "t-pink" },
    g: { cls: "t-green" },
    r: { cls: "t-red" },
    y: { cls: "t-yellow" },
    o: { cls: "t-orange" },
    u: { cls: "t-purple" },
    b: { cls: "t-blue" },
    S: { cls: "t-start" },
    X: { cls: "t-goal" },
    " ": { cls: "t-void" },
    ".": { cls: "t-void" },
  };

  const LEGEND = [
    ["--pink", "Pink", "Harmless. Walk freely."],
    ["--green", "Green", "Makes a sound. Otherwise harmless."],
    ["--red", "Red", "Solid wall. Cannot enter."],
    ["--yellow", "Yellow", "Throws you back to your last tile."],
    ["--orange", "Orange", "Flavors you 'Orange'."],
    ["--purple", "Purple", "Ice: slides you forward. Flavors you 'Lemon'."],
    ["--blue", "Blue", "Harmless water — UNLESS you are 'Orange', or it touches yellow (then it's live and bounces you)."],
  ];

  // ----- DOM -----
  const boardEl = document.getElementById("board");
  const playerEl = document.getElementById("player");
  const overlayEl = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlaySub = document.getElementById("overlaySub");
  const flavorEl = document.getElementById("flavor");
  const flavorValue = document.getElementById("flavorValue");
  const moveCountEl = document.getElementById("moveCount");
  const timeEl = document.getElementById("timeVal");
  const lvlNumEl = document.getElementById("lvlNum");
  const lvlNameEl = document.getElementById("lvlName");
  const hintEl = document.getElementById("hint");

  // ----- persistence -----
  const SAVE_KEY = "tileMaze.v1";
  // one-time migration from the pre-rename key (folder was "color-tile")
  try { const _o = localStorage.getItem("colorTileMaze.v1"); if (_o != null && localStorage.getItem(SAVE_KEY) == null) { localStorage.setItem(SAVE_KEY, _o); localStorage.removeItem("colorTileMaze.v1"); } } catch (e) {}
  // Progress is kept by level NAME, as the best times always were, so
  // re-sorting levels.js can't move it onto other levels:
  //   done:      the levels solved
  //   open:      levels a save from before had opened (see migrate)
  //   bestTimes: name -> ms
  const save = loadSave();
  function loadSave() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}"); } catch (e) {}
    s = Object.assign({ done: [], open: [], muted: false, bestTimes: {} }, s && typeof s === "object" ? s : {});
    if (!Array.isArray(s.done)) s.done = [];
    if (!Array.isArray(s.open)) s.open = [];
    if (!s.bestTimes || typeof s.bestTimes !== "object") s.bestTimes = {};
    if (migrate(s)) persist(s);
    return s;
  }
  // A save from before kept progress by index (completed: [0, 1…], unlocked:
  // n). Once, on load, it's mapped onto the levels' names in today's order (the
  // order it was written in) and written back in place, under the same key.
  function migrate(s) {
    if (!("completed" in s) && !("unlocked" in s)) return false;
    const nameAt = (i) => (LEVELS[i] ? LEVELS[i].name : null);
    (Array.isArray(s.completed) ? s.completed : []).forEach((i) => {
      const n = nameAt(i);
      if (n && !s.done.includes(n)) s.done.push(n);
    });
    const upTo = Math.min(LEVELS.length, Math.max(1, parseInt(s.unlocked, 10) || 1));
    for (let i = 0; i < upTo; i++) if (!s.open.includes(nameAt(i))) s.open.push(nameAt(i));
    delete s.completed;
    delete s.unlocked;
    return true;
  }
  function persist(s) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s || save)); } catch (e) {}
  }
  // Levels open in order, as they always have: solving a level opens the one
  // after it. Worked out from names each time, a re-sort opens a level by
  // what now comes before it, and one already solved (or opened by an old
  // save) stays open wherever it lands.
  const isDone = (i) => save.done.includes(LEVELS[i].name);
  const isOpen = (i) => i === 0 || isDone(i) || isDone(i - 1) || save.open.includes(LEVELS[i].name);

  // ----- audio (shared cues from audio.js) -----
  const SFX = window.TileSFX;

  // ----- game state -----
  let current = 0; // level index
  let grid = [];
  let state = { r: 0, c: 0, flavor: "Plain" };
  let moves = 0;
  let locked = false;
  let won = false;
  let cell = 64;
  const GAP = 4;

  // ----- level timer -----
  // Starts on the first real move (reading the board is free), stops on the
  // win; the per-level best is stored by level NAME, so re-sorting the level
  // order never mixes up records.
  let runStartTs = null;
  // While "Leave this game?" is up, or the tab or window is away, the clock
  // holds (from heldAt); each reason lets go on its own, and the last one
  // out moves the start on by the time held, so a best never counts it.
  let heldAt = 0;
  const holds = new Set();
  function holdClock(why) {
    if (!holds.size) heldAt = Date.now();
    holds.add(why);
  }
  function releaseClock(why) {
    if (!holds.delete(why) || holds.size) return;
    // (a run begun during the hold counts from now)
    if (heldAt && runStartTs !== null) runStartTs += Date.now() - Math.max(heldAt, runStartTs);
    heldAt = 0;
  }
  function fmtTime(ms) {
    const t = Math.max(0, ms) / 1000;
    if (t < 60) return t.toFixed(1) + "s";
    const m = Math.floor(t / 60);
    const rest = t - m * 60;
    return m + ":" + (rest < 10 ? "0" : "") + rest.toFixed(1);
  }
  setInterval(() => {
    if (runStartTs !== null && !won && !heldAt) timeEl.textContent = fmtTime(Date.now() - runStartTs);
  }, 100);

  function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

  // ----- rendering -----
  // The room comes from the board's panel (.boardwrap), not the board frame:
  // that one is only as wide as the board already drawn, so each level was
  // sized from the last one (and the first from an empty board). The floor
  // is low enough for a 15-wide level to fit a phone.
  const wrapEl = boardEl.closest(".boardwrap");
  function computeCell() {
    const cols = grid[0].length;
    const rows = grid.length;
    const cs = getComputedStyle(wrapEl);
    const roomW = wrapEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const frameW = Math.min(roomW || 520, 540);
    const maxH = Math.max(260, window.innerHeight - 360);
    const byW = (frameW - GAP * (cols + 1)) / cols;
    const byH = (maxH - GAP * (rows + 1)) / rows;
    cell = Math.max(16, Math.min(64, Math.floor(Math.min(byW, byH))));
    document.documentElement.style.setProperty("--cell", cell + "px");
  }

  function renderBoard() {
    const cols = grid[0].length;
    boardEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell))`;
    boardEl.innerHTML = "";
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const ch = grid[r][c];
        const d = document.createElement("div");
        d.className = "tile " + (TILE[ch] ? TILE[ch].cls : "t-void");
        d.dataset.r = r;
        d.dataset.c = c;
        boardEl.appendChild(d);
      }
    }
  }

  // Highlight which blue tiles are currently "live" (act like yellow).
  function refreshLive() {
    const tiles = boardEl.children;
    let i = 0;
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++, i++) {
        if (grid[r][c] === "b") {
          const live = E.blueIsBounce(grid, state.flavor, r, c);
          tiles[i].classList.toggle("live", live);
        }
      }
    }
  }

  function placePlayer(r, c, animate) {
    if (!animate) playerEl.style.transition = "none";
    playerEl.style.transform = `translate(${c * (cell + GAP)}px, ${r * (cell + GAP)}px)`;
    if (!animate) {
      // force reflow then restore transition
      void playerEl.offsetWidth;
      playerEl.style.transition = "";
    }
  }

  function setFlavor(f) {
    state.flavor = f;
    playerEl.dataset.flavor = f;
    flavorEl.dataset.flavor = f;
    flavorValue.textContent = f;
  }

  // ----- level lifecycle -----
  // A reset or a new level can land while a move is still animating: bumping
  // moveGen drops that move (its slide, bump and win card), so it can't put
  // the ball back where it was going or pop "Level Complete!" over this board.
  let moveGen = 0;
  let overlayT = 0;
  function loadLevel(idx) {
    current = Math.max(0, Math.min(LEVELS.length - 1, idx));
    const lvl = LEVELS[current];
    grid = lvl.grid.slice();
    moveGen++;
    clearTimeout(overlayT);
    won = false;
    locked = false;
    moves = 0;
    runStartTs = null;
    overlayEl.hidden = true;
    moveCountEl.textContent = "0";
    timeEl.textContent = "0.0s";
    lvlNumEl.textContent = current + 1;
    lvlNameEl.textContent = lvl.name;
    hintEl.textContent = lvl.hint;

    state = E.findStart(grid);
    computeCell();
    renderBoard();
    setFlavor("Plain");
    placePlayer(state.r, state.c, false);
    refreshLive();
    renderLevelPicker();
  }

  // The win is recorded the moment the winning move is made, before its slide
  // plays out: the clock stops there, and the best time and progress are saved
  let winInfo = null;
  function recordWin() {
    won = true;
    const ms = runStartTs === null ? 0 : Date.now() - runStartTs;
    timeEl.textContent = fmtTime(ms);
    if (!save.bestTimes) save.bestTimes = {};
    const prevBest = save.bestTimes[LEVELS[current].name];
    const record = prevBest === undefined || ms < prevBest;
    if (record) save.bestTimes[LEVELS[current].name] = ms;
    if (!isDone(current)) save.done.push(LEVELS[current].name);   // (which opens the next)
    persist();
    winInfo = { ms, prevBest, record };
  }

  function completeLevel() {
    const { ms, prevBest, record } = winInfo;
    SFX.win();
    const last = current + 1 >= LEVELS.length;
    const timeBit = record && prevBest !== undefined
      ? `${fmtTime(ms)} — new best!`
      : prevBest !== undefined
        ? `${fmtTime(ms)} (best ${fmtTime(Math.min(prevBest, ms))})`
        : fmtTime(ms);
    overlayTitle.textContent = last ? "Resort Cleared! 🎉" : "Level Complete!";
    overlaySub.textContent = last
      ? `You finished all ${LEVELS.length} levels — this one in ${moves} moves and ${timeBit}.`
      : `Solved in ${moves} moves · ${timeBit}.`;
    document.getElementById("overlayNext").style.display = last ? "none" : "";
    overlayT = setTimeout(() => { overlayEl.hidden = false; }, 350);
    renderLevelPicker();
  }

  // ----- movement -----
  // Animation context handed to the shared TileAnim module (also used by the editor).
  function animCtx(gen) {
    return {
      playerEl,
      gap: GAP,
      cell: () => cell,
      grid: () => grid,
      reduced: () => !!(window.RM_ON && window.RM_ON()),
      stale: () => gen !== moveGen,     // a reset or new level replaced this move
      from: { r: state.r, c: state.c }, // tile the player is leaving (for midpoint speed blend)
      setFlavor,
      sfx: SFX,
      tileEl: (r, c) => boardEl.children[r * grid[0].length + c],
      // briefly light up the electric tile that zapped you (with Visual FX
      // off it holds still and lit, a little longer: 500 ms)
      flashTile: (r, c) => {
        const el = boardEl.children[r * grid[0].length + c];
        const ms = window.RM_ON && window.RM_ON() ? 500 : 340;
        if (el) { el.classList.add("zapping"); clearTimeout(el._zapT); el._zapT = setTimeout(() => el.classList.remove("zapping"), ms); }
      },
    };
  }

  async function doMove(dir) {
    if (locked || won) return;
    const res = E.resolveMove(grid, state, dir);
    const A = window.TileAnim;          // shared animation module (guarded so a load hiccup never freezes play)
    const gen = moveGen;                // after each wait: if the board was reset meanwhile, this move is over

    if (res.blocked) {
      // pushed straight into a wall — thud + a little bump back
      locked = true;
      SFX.thud();
      if (A) await A.bump(animCtx(gen), dir, state);
      if (gen === moveGen) locked = false;
      return;
    }

    locked = true;
    if (runStartTs === null) runStartTs = Date.now();  // the clock starts on your first move
    moves++;
    moveCountEl.textContent = moves;
    if (res.win) recordWin();

    if (A) await A.play(animCtx(gen), res);
    else placePlayer(res.final.r, res.final.c, false);
    if (gen !== moveGen) return;

    state = res.final;
    setFlavor(state.flavor);
    refreshLive();

    // A slide that traveled and then stopped against a wall (e.g. ice into a red
    // block) should bump into it and settle back. Only with motion enabled —
    // when reduced, skip the nudge (and its brief input lock), but still mark
    // the wall side of the ball, as a blocked move does.
    if (A && res.hitWall && !res.win) {
      if (!(window.RM_ON && window.RM_ON())) {
        SFX.thud();
        await A.bump(animCtx(gen), dir, state);
        if (gen !== moveGen) return;
      } else if (A.markBump) A.markBump(playerEl, dir);
    }

    locked = false;
    if (res.win) completeLevel();
  }

  // ----- side panel -----
  function renderLegend() {
    const ul = document.getElementById("legend");
    ul.innerHTML = "";
    LEGEND.forEach(([varName, name, desc]) => {
      const li = document.createElement("li");
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = `var(${varName})`;
      const txt = document.createElement("span");
      txt.innerHTML = `<b>${name}.</b> ${desc}`;
      li.appendChild(sw);
      li.appendChild(txt);
      ul.appendChild(li);
    });
  }

  function renderLevelPicker() {
    const wrap = document.getElementById("levelPick");
    wrap.innerHTML = "";
    LEVELS.forEach((lvl, i) => {
      const b = document.createElement("button");
      b.className = "lvlbtn";
      b.textContent = i + 1;
      const bt = save.bestTimes && save.bestTimes[lvl.name];
      b.title = lvl.name + (bt !== undefined ? " — best " + fmtTime(bt) : "");
      const unlocked = isOpen(i);
      if (!unlocked) b.classList.add("locked");
      if (isDone(i)) b.classList.add("done");
      if (i === current) b.classList.add("current");
      if (unlocked) b.addEventListener("click", () => loadLevel(i));
      wrap.appendChild(b);
    });
  }

  // ----- input -----
  const KEYMAP = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right",
    W: "up", S: "down", A: "left", D: "right",
  };
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // browser shortcuts (Ctrl+P, Ctrl+S, Alt+←…) aren't game keys
    if (!guideOverlay.hidden) return;   // the Tile Guide holds the board (and its arrows scroll the guide)
    if (e.repeat) { if (KEYMAP[e.key]) e.preventDefault(); return; } // one move per press — holding does nothing
    if (e.key === "r" || e.key === "R") { loadLevel(current); return; }
    const dir = KEYMAP[e.key];
    if (dir) { e.preventDefault(); doMove(dir); }
  });

  document.querySelectorAll(".dbtn").forEach((btn) => {
    btn.addEventListener("click", () => doMove(btn.dataset.dir));
  });

  document.getElementById("resetBtn").addEventListener("click", () => loadLevel(current));
  document.getElementById("prevBtn").addEventListener("click", () => {
    if (current > 0 && isOpen(current - 1)) loadLevel(current - 1);
  });
  document.getElementById("nextBtn").addEventListener("click", () => {
    if (current + 1 < LEVELS.length && isOpen(current + 1)) loadLevel(current + 1);
  });
  document.getElementById("overlayReplay").addEventListener("click", () => loadLevel(current));
  document.getElementById("overlayNext").addEventListener("click", () => loadLevel(current + 1));

  // ----- Tile Guide modal -----
  const guideOverlay = document.getElementById("guideOverlay");
  const openGuide = () => { guideOverlay.hidden = false; };
  const closeGuide = () => { guideOverlay.hidden = true; };
  document.getElementById("guideBtn").addEventListener("click", openGuide);
  document.getElementById("guideClose").addEventListener("click", closeGuide);
  guideOverlay.addEventListener("click", (e) => { if (e.target === guideOverlay) closeGuide(); });
  // Esc closes the guide, and claims the key so it doesn't also leave for the games page
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !guideOverlay.hidden) { e.preventDefault(); closeGuide(); } });

  // Leaving asks first once a level has moves on it and isn't won yet (a
  // fresh board has nothing to lose). There's no pause, so while it asks the
  // level clock just holds.
  if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave({
    active: () => moves > 0 && !won,
    pause: () => holdClock("leave"),
    resume: () => releaseClock("leave"),
  });

  // ...and so it does while the tab is hidden or the window is away
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) holdClock("away"); else if (document.hasFocus()) releaseClock("away");
  });
  window.addEventListener("blur", () => holdClock("away"));
  window.addEventListener("focus", () => releaseClock("away"));

  window.addEventListener("resize", () => {
    computeCell();
    placePlayer(state.r, state.c, false);
  });

  // ----- boot -----
  renderLegend();
  // start on the furthest level open: the next to play, as levels open in order
  let first = 0;
  for (let i = 0; i < LEVELS.length; i++) if (isOpen(i)) first = i;
  loadLevel(first);
})();
