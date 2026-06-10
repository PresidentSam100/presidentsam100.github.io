/* Color Tile Maze - browser UI controller. */
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
  const SAVE_KEY = "colorTileMaze.v1";
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

  // ----- audio -----
  let actx = null;
  function audio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
    return actx;
  }
  function tone(freq, dur, type, gain, slideTo) {
    if (save.muted) return;
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  const SFX = {
    step: () => tone(180, 0.05, "triangle", 0.05),
    green: () => tone(660, 0.18, "sine", 0.14),
    orange: () => tone(330, 0.12, "square", 0.08),
    slide: () => tone(520, 0.14, "sine", 0.08, 240),
    bounce: () => { tone(120, 0.16, "sawtooth", 0.14); },
    thud: () => tone(90, 0.1, "sine", 0.1),
    win: () => {
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => tone(f, 0.22, "triangle", 0.13), i * 110)
      );
    },
  };

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
  async function doMove(dir) {
    if (locked || won || bumping) return;
    const res = E.resolveMove(grid, state, dir);

    if (res.blocked) {
      SFX.thud();
      bump(dir);
      return;
    }

    locked = true;
    moves++;
    moveCountEl.textContent = moves;

    const slideMove = res.steps.some((s) => grid[s.r][s.c] === "u");
    playerEl.classList.toggle("sliding", slideMove);
    const dt = slideMove ? 75 : 115;

    for (let i = 0; i < res.steps.length; i++) {
      const s = res.steps[i];
      placePlayer(s.r, s.c, true);
      if (s.flavor) setFlavor(s.flavor);

      const ch = grid[s.r][s.c];
      const isRebound = res.bounced && i === res.steps.length - 1;
      if (isRebound) SFX.bounce();
      else if (ch === "g") SFX.green();
      else if (ch === "o") SFX.orange();
      else if (ch === "u") SFX.slide();
      else SFX.step();

      await sleep(dt);
    }

    playerEl.classList.remove("sliding");
    state = res.final;
    setFlavor(state.flavor);
    refreshLive();

    locked = false;
    if (res.win) completeLevel();
  }

  // Nudge a short way toward the wall, then settle back — relative to the
  // player's current tile (no full-position keyframe that would snap to 0,0).
  let bumping = false;
  function bump(dir) {
    if (bumping) return;
    bumping = true;
    const d = E.DELTA[dir];
    const baseX = state.c * (cell + GAP);
    const baseY = state.r * (cell + GAP);
    const nudge = Math.min(16, cell * 0.34);
    playerEl.style.transition = "transform 80ms ease-out";
    playerEl.style.transform =
      `translate(${baseX + d.c * nudge}px, ${baseY + d.r * nudge}px)`;
    setTimeout(() => {
      playerEl.style.transition = "transform 130ms ease-in";
      playerEl.style.transform = `translate(${baseX}px, ${baseY}px)`;
      setTimeout(() => {
        playerEl.style.transition = "";
        bumping = false;
      }, 140);
    }, 90);
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

  const muteBtn = document.getElementById("muteBtn");
  function updateMuteBtn() { muteBtn.textContent = save.muted ? "🔇 Muted" : "🔊 Sound"; }
  muteBtn.addEventListener("click", () => {
    save.muted = !save.muted;
    persist();
    updateMuteBtn();
    if (!save.muted) SFX.green();
  });

  window.addEventListener("resize", () => {
    computeCell();
    placePlayer(state.r, state.c, false);
  });

  // ----- boot -----
  renderLegend();
  updateMuteBtn();
  loadLevel(Math.min(save.unlocked - 1, LEVELS.length - 1));
})();
