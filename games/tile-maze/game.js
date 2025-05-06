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
  const lvlNumEl = document.getElementById("lvlNum");
  const lvlNameEl = document.getElementById("lvlName");
  const hintEl = document.getElementById("hint");

  // ----- persistence -----
  const SAVE_KEY = "tileMaze.v1";
  // one-time migration from the pre-rename key (folder was "color-tile")
  try { const _o = localStorage.getItem("colorTileMaze.v1"); if (_o != null && localStorage.getItem(SAVE_KEY) == null) { localStorage.setItem(SAVE_KEY, _o); localStorage.removeItem("colorTileMaze.v1"); } } catch (e) {}
  const save = loadSave();
  function loadSave() {
    try {
      return Object.assign(
        { unlocked: 1, completed: [], muted: false },
        JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")
      );
    } catch (e) {
      return { unlocked: 1, completed: [], muted: false };
    }
  }
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
  }

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

  function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

  // ----- rendering -----
  function computeCell() {
    const cols = grid[0].length;
    const rows = grid.length;
    const frameW = Math.min(boardEl.parentElement.clientWidth || 520, 540);
    const maxH = Math.max(260, window.innerHeight - 360);
    const byW = (frameW - GAP * (cols + 1)) / cols;
    const byH = (maxH - GAP * (rows + 1)) / rows;
    cell = Math.max(30, Math.min(64, Math.floor(Math.min(byW, byH))));
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
  function loadLevel(idx) {
    current = Math.max(0, Math.min(LEVELS.length - 1, idx));
    const lvl = LEVELS[current];
    grid = lvl.grid.slice();
    won = false;
    locked = false;
    moves = 0;
    overlayEl.hidden = true;
    moveCountEl.textContent = "0";
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

  function completeLevel() {
    won = true;
    if (!save.completed.includes(current)) save.completed.push(current);
    if (current + 1 < LEVELS.length) save.unlocked = Math.max(save.unlocked, current + 2);
    persist();
    SFX.win();
    const last = current + 1 >= LEVELS.length;
    overlayTitle.textContent = last ? "Resort Cleared! 🎉" : "Level Complete!";
    overlaySub.textContent = last
      ? `You finished all ${LEVELS.length} levels in ${moves} moves on this one.`
      : `Solved in ${moves} moves.`;
    document.getElementById("overlayNext").style.display = last ? "none" : "";
    setTimeout(() => { overlayEl.hidden = false; }, 350);
    renderLevelPicker();
  }

  // ----- movement -----
  // Animation context handed to the shared TileAnim module (also used by the editor).
  function animCtx() {
    return {
      playerEl,
      gap: GAP,
      cell: () => cell,
      grid: () => grid,
      reduced: () => !!(window.RM_ON && window.RM_ON()),
      from: { r: state.r, c: state.c }, // tile the player is leaving (for midpoint speed blend)
      setFlavor,
      sfx: SFX,
      // briefly light up the electric tile that zapped you
      flashTile: (r, c) => {
        const el = boardEl.children[r * grid[0].length + c];
        if (el) { el.classList.add("zapping"); setTimeout(() => el.classList.remove("zapping"), 340); }
      },
    };
  }

  async function doMove(dir) {
    if (locked || won) return;
    const res = E.resolveMove(grid, state, dir);
    const A = window.TileAnim;          // shared animation module (guarded so a load hiccup never freezes play)

    if (res.blocked) {
      // pushed straight into a wall — thud + a little bump back
      locked = true;
      SFX.thud();
      if (A) await A.bump(animCtx(), dir, state);
      locked = false;
      return;
    }

    locked = true;
    moves++;
    moveCountEl.textContent = moves;

    if (A) await A.play(animCtx(), res);
    else placePlayer(res.final.r, res.final.c, false);

    state = res.final;
    setFlavor(state.flavor);
    refreshLive();

    // A slide that traveled and then stopped against a wall (e.g. ice into a red
    // block) should bump into it and settle back. Only with motion enabled —
    // when reduced, skip the nudge (and its brief input lock).
    if (A && res.hitWall && !res.win && !(window.RM_ON && window.RM_ON())) {
      SFX.thud();
      await A.bump(animCtx(), dir, state);
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
      b.title = lvl.name;
      const unlocked = i < save.unlocked;
      if (!unlocked) b.classList.add("locked");
      if (save.completed.includes(i)) b.classList.add("done");
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
    if (e.key === "r" || e.key === "R") { loadLevel(current); return; }
    const dir = KEYMAP[e.key];
    if (dir) { e.preventDefault(); doMove(dir); }
  });

  document.querySelectorAll(".dbtn").forEach((btn) => {
    btn.addEventListener("click", () => doMove(btn.dataset.dir));
  });

  document.getElementById("resetBtn").addEventListener("click", () => loadLevel(current));
  document.getElementById("prevBtn").addEventListener("click", () => {
    if (current > 0) loadLevel(current - 1);
  });
  document.getElementById("nextBtn").addEventListener("click", () => {
    if (current + 1 < save.unlocked) loadLevel(current + 1);
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
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !guideOverlay.hidden) closeGuide(); });


  window.addEventListener("resize", () => {
    computeCell();
    placePlayer(state.r, state.c, false);
  });

  // ----- boot -----
  renderLegend();
  loadLevel(Math.min(save.unlocked - 1, LEVELS.length - 1));
})();
