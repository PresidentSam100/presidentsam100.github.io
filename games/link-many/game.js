const ROWS = 6, COLS = 7;
const HUMAN = 1, AI = 2; // 1=Red, 2=Yellow
const WALL = 3;          // a neutral blocker disc — counts for nobody
// Power Checkers: each side gets each of these once per game.
let mode = 'classic';    // 'classic' | 'power'
let powers, armedPower = null, aiExtra = false;
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const diffEl = document.getElementById('difficulty');
// Tally + UI already existed; it just never survived a reload.
const REC = window.GameShell ? GameShell.record("connectfour_record") : null;
let board, gameOver, busy, animMove, round = 0, score = REC ? REC.get() : { w:0, l:0, d:0 };
let hoverColIdx = -1; // column the cursor is currently over (to re-highlight after the AI moves)
let youMoved = false; // the player has dropped a disc or played a power this game (see the leave guard)
// The last disc dropped (or wall placed) carries a dot until the next move, in
// both FX modes. `scorch`: with Visual FX off, the cells a bomb or anvil just
// hit (see scorchCells). render() draws both, as it rewrites every className.
let lastDisc = null, scorch = null;
// Animations follow the global "✨ Visual FX" toggle (motion-toggle.js): FX off
// (or OS reduced-motion) means no drop animation and a shorter AI delay.
function animOn(){ return !(window.RM_ON && window.RM_ON()); }

// --- sound effects (Web Audio, synthesized — no assets) ---
let _actx;
function actx(){
  if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
  if (_actx.state === 'suspended') _actx.resume();
  return _actx;
}
// A disc dropping down the slot: a falling whistle, then a thud that bounces
// twice and settles. `base` sets the pitch so Red (you) and Yellow (AI) differ.
function dropSound(base){
  const ctx = actx(), now = ctx.currentTime;
  // free-fall whistle
  const o = ctx.createOscillator(); o.type = 'triangle';
  const g = ctx.createGain();
  o.frequency.setValueAtTime(base*1.7, now);
  o.frequency.exponentialRampToValueAtTime(base, now + 0.16);
  g.gain.setValueAtTime(0.18, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  o.connect(g).connect(ctx.destination); o.start(now); o.stop(now + 0.2);
  // landing thud + diminishing bounces
  [[0.16,0.5],[0.30,0.22],[0.40,0.1]].forEach(([dt,vol]) => {
    const t = now + dt;
    const b = ctx.createOscillator(); b.type = 'sine';
    b.frequency.setValueAtTime(base, t);
    b.frequency.exponentialRampToValueAtTime(base*0.55, t + 0.09);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(vol, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    b.connect(bg).connect(ctx.destination); b.start(t); b.stop(t + 0.13);
    // sharp click of plastic hitting the frame
    const len = ctx.sampleRate*0.02|0;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++){ const e = 1 - i/len; d[i] = (Math.random()*2-1)*e; }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const cg = ctx.createGain(); cg.gain.value = vol*0.5;
    src.connect(cg).connect(ctx.destination); src.start(t);
  });
}
function sfxBoom(){
  const ctx = actx(), t = ctx.currentTime, len = ctx.sampleRate * 0.5 | 0;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(120, t + 0.45);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  src.connect(f); f.connect(g); g.connect(ctx.destination); src.start(t);
}
function sfxCrush(){
  const ctx = actx(), t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
  g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
  o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.36);
}
function sfxWall(){ dropSound(120); }
function sfxHuman(){ dropSound(180); } // Red disc — lower, heavier
function sfxAI(){ dropSound(260); }    // Yellow disc — higher, brighter

// Play a short melody: each note is [frequency, duration, gap-to-next].
function melody(seq, type){
  const ctx = actx(); let t = ctx.currentTime;
  for (const [f, dur, gap] of seq){
    const o = ctx.createOscillator(); o.type = type;
    const g = ctx.createGain();
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
    t += gap;
  }
}
// You win: a rising arcade chiptune fanfare.
function sfxWin(){ melody([[330,0.1,0.1],[440,0.1,0.1],[554,0.1,0.1],[660,0.14,0.14],[880,0.34,0.34]], 'square'); }
// AI wins: a low, descending buzz.
function sfxLose(){ melody([[294,0.14,0.12],[247,0.14,0.12],[196,0.14,0.12],[147,0.44,0.44]], 'square'); }
// Draw: two even, unresolved notes.
function sfxDraw(){ melody([[330,0.2,0.18],[330,0.3,0.3]], 'sine'); }

function init() {
  // Bump the round so any still-pending async work (a coin-flip callback or a
  // queued AI move) from the previous game is recognized as stale and ignored.
  round++;
  const modeSel = document.getElementById('gameModeSel');
  mode = modeSel ? modeSel.value : 'classic';
  document.body.dataset.mode = mode;
  powers = { [HUMAN]: { anvil: 1, bomb: 1, wall: 1 }, [AI]: { anvil: 1, bomb: 1, wall: 1 } };
  armedPower = null; aiExtra = false;
  board = Array.from({length:ROWS}, () => Array(COLS).fill(0));
  gameOver = false; busy = false; animMove = null; hoverColIdx = -1; lastDisc = null; scorch = null;
  youMoved = false;
  buildDOM();
  renderPowers();
  render();
  if (window.coinFlip) {
    const myRound = round;
    setStatus('Flipping for first move…');
    coinFlip({ you: 'You (Red)', cpu: 'CPU (Yellow)', accent: '#2161d6', youColor: '#e4463d', cpuColor: '#f7c62f' }, function (who) {
      if (myRound !== round) return; // a new game was started before this flip resolved
      if (who === 'cpu') { busy = true; setStatus('AI thinking…'); scheduleAI(600); }
      else setStatus('Your turn (Red)');
    });
  } else setStatus('Your turn (Red)');
}

// Queue the AI's move but only let it run if we're still in the same game —
// pressing "New Game" while the AI is "thinking" bumps the round and cancels it.
function scheduleAI(delay) {
  const myRound = round;
  setTimeout(() => {
    if (myRound !== round) return;
    if (mode === 'power') {
      const pp = aiPowerPlay();
      if (pp) {
        if (pp.kind === 'wall') aiExtra = true;
        setStatus('CPU plays the ' + POWER_INFO[pp.kind].name + ' ' + POWER_INFO[pp.kind].icon);
        usePower(AI, pp.kind, pp.c);
        return; // usePower manages busy and the turn hand-off
      }
    }
    aiMove();
    // Keep input locked until the AI's disc finishes dropping, THEN release and
    // re-highlight whatever column the cursor is over (CSS :hover won't re-fire
    // on its own without mouse movement).
    const settle = animOn() ? 760 : 60;
    setTimeout(() => {
      if (myRound !== round) return;
      busy = false;
      if (hoverColIdx >= 0) hoverCol(hoverColIdx, true);
    }, settle);
  }, delay);
}

function buildDOM() {
  boardEl.innerHTML = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r; cell.dataset.c = c;
      cell.addEventListener('click', () => humanMove(c));
      cell.addEventListener('mouseenter', () => { hoverColIdx = c; hoverCol(c, true); });
      cell.addEventListener('mouseleave', () => { if (hoverColIdx === c) hoverColIdx = -1; hoverCol(c, false); });
      boardEl.appendChild(cell);
    }
  }
  buildFrame();
}

// Builds the SVG frame that overlays the discs: a sheet of glossy blue plastic
// with a circular hole cut out over each cell, so discs are only seen through
// the holes. Each hole gets a moulded rim, and each column a slot on top.
function buildFrame() {
  const old = boardEl.querySelector('.frame-layer');
  if (old) old.remove();
  const W = boardEl.clientWidth, H = boardEl.clientHeight;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'frame-layer');
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  // layout offsets, not bounding boxes, so a disc mid-drop can't shift its hole
  const spots = cells().map(cell => ({
    cx: cell.offsetLeft + cell.offsetWidth / 2,
    cy: cell.offsetTop + cell.offsetHeight / 2,
    r: cell.offsetWidth / 2,
  }));
  const holes = spots.map(s => `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="black"/>`).join('');
  // the rim: shadowed at the top of the hole, lit at the bottom
  const rims = spots.map(s => `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r + 1.2}" fill="none" stroke="url(#c4rim)" stroke-width="2.5"/>`).join('');
  const slots = spots.slice(0, COLS).map(s =>
    `<rect x="${s.cx - s.r * 0.62}" y="3" width="${s.r * 1.24}" height="5" rx="2.5" fill="#0f2e70"/>`).join('');
  svg.innerHTML =
    `<defs><mask id="holes"><rect width="${W}" height="${H}" fill="white"/>${holes}</mask>` +
    `<linearGradient id="c4body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f7ff0"/>` +
    `<stop offset=".55" stop-color="#2161d6"/><stop offset="1" stop-color="#1a4fb8"/></linearGradient>` +
    `<linearGradient id="c4gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/>` +
    `<stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="c4rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b2566" stop-opacity=".7"/>` +
    `<stop offset=".55" stop-color="#0b2566" stop-opacity=".15"/><stop offset="1" stop-color="#fff" stop-opacity=".55"/></linearGradient></defs>` +
    `<g mask="url(#holes)"><rect width="${W}" height="${H}" rx="18" fill="url(#c4body)"/>` +
    `<rect width="${W}" height="${H * 0.42}" rx="18" fill="url(#c4gloss)"/></g>` +
    rims + slots +
    `<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="17" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>`;
  boardEl.appendChild(svg);
}

function cells() { return [...boardEl.querySelectorAll('.cell')]; }

function hoverCol(c, on) {
  if (gameOver || busy) return;
  cells().forEach(cell => {
    if (+cell.dataset.c === c) cell.classList.toggle('col-hover', on && board[+cell.dataset.r][c] === 0);
  });
}

function render(winCells) {
  cells().forEach(cell => {
    const r = +cell.dataset.r, c = +cell.dataset.c, v = board[r][c];
    let cls = 'cell' + (v === HUMAN ? ' red' : v === AI ? ' yellow' : v === WALL ? ' wall' : v === 4 ? ' bombdisc' : '');
    if (winCells && winCells.some(([wr,wc]) => wr===r && wc===c)) cls += ' win';
    if (v && lastDisc && lastDisc.r === r && lastDisc.c === c) cls += ' last';
    if (scorch && scorch.some(([sr,sc]) => sr===r && sc===c)) cls += ' blasted';
    if (animOn() && animMove && animMove.r === r && animMove.c === c) {
      cls += ' drop';
      const h = cell.getBoundingClientRect().height || 62;
      cell.style.setProperty('--dy', `-${(r+1)*(h+8)+14}px`);
    } else {
      cell.style.removeProperty('--dy');
    }
    cell.className = cls;
  });
}

function setStatus(t){ statusEl.textContent = t; }

function dropRow(b, c) {
  for (let r = ROWS - 1; r >= 0; r--) if (b[r][c] === 0) return r;
  return -1;
}

function humanMove(c) {
  if (gameOver || busy || aiExtra) return;
  if (armedPower) return usePower(HUMAN, armedPower, c);
  const r = dropRow(board, c);
  if (r < 0) return;
  board[r][c] = HUMAN;
  youMoved = true;
  animMove = lastDisc = { r, c };
  sfxHuman();
  if (checkEnd()) return;
  render();
  busy = true;
  setStatus('AI thinking…');
  scheduleAI(animOn() ? 820 : 200);
}

function aiMove() {
  const c = chooseAIMove();
  const r = dropRow(board, c);
  board[r][c] = AI;
  animMove = lastDisc = { r, c };
  sfxAI();
  if (checkEnd()) return;
  render();
  setStatus('Your turn (Red)');
}

function checkEnd() {
  const win = findWin(board);
  if (win) {
    gameOver = true;
    render(win.cells);
    if (win.player === HUMAN) { score.w++; setStatus('You win! 🎉'); sfxWin(); }
    else { score.l++; setStatus('AI wins!'); sfxLose(); }
    updateScore();
    return true;
  }
  if (board[0].every(v => v !== 0)) {
    gameOver = true; render();
    score.d++; setStatus("It's a draw!"); sfxDraw(); updateScore();
    return true;
  }
  return false;
}

function updateScore() {
  if (REC) REC.set(score);
  document.getElementById('w').textContent = score.w;
  document.getElementById('l').textContent = score.l;
  document.getElementById('d').textContent = score.d;
}

const DIRS = [[0,1],[1,0],[1,1],[1,-1]];
function findWin(b) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = b[r][c]; if (!p) continue;
    for (const [dr,dc] of DIRS) {
      const cells = [[r,c]];
      for (let k = 1; k < 4; k++) {
        const nr = r+dr*k, nc = c+dc*k;
        if (nr<0||nr>=ROWS||nc<0||nc>=COLS||b[nr][nc]!==p) break;
        cells.push([nr,nc]);
      }
      if (cells.length === 4) return { player:p, cells };
    }
  }
  return null;
}

// --- AI: minimax with alpha-beta + heuristic ---
function chooseAIMove() {
  const depth = +diffEl.value;
  const valid = validCols(board);
  // immediate win / block shortcuts always honored
  let bestScore = -Infinity, bestCol = valid[0];
  // order center-first for better pruning
  const ordered = [...valid].sort((a,b)=>Math.abs(3-a)-Math.abs(3-b));
  for (const c of ordered) {
    const r = dropRow(board, c);
    board[r][c] = AI;
    const s = minimax(board, depth-1, false, -Infinity, Infinity);
    board[r][c] = 0;
    if (s > bestScore) { bestScore = s; bestCol = c; }
  }
  return bestCol;
}

function validCols(b){ const v=[]; for(let c=0;c<COLS;c++) if(b[0][c]===0) v.push(c); return v; }

function minimax(b, depth, isMax, alpha, beta) {
  const win = findWin(b);
  if (win) return win.player === AI ? 1000000 + depth : -1000000 - depth;
  const valid = validCols(b);
  if (depth === 0 || valid.length === 0) return evaluate(b);
  const ordered = valid.sort((a,b2)=>Math.abs(3-a)-Math.abs(3-b2));
  if (isMax) {
    let best = -Infinity;
    for (const c of ordered) {
      const r = dropRow(b, c); b[r][c] = AI;
      best = Math.max(best, minimax(b, depth-1, false, alpha, beta));
      b[r][c] = 0; alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const c of ordered) {
      const r = dropRow(b, c); b[r][c] = HUMAN;
      best = Math.min(best, minimax(b, depth-1, true, alpha, beta));
      b[r][c] = 0; beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function evaluate(b) {
  let score = 0;
  // center column preference
  for (let r = 0; r < ROWS; r++) if (b[r][3] === AI) score += 3; else if (b[r][3] === HUMAN) score -= 3;
  // all windows of 4
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    for (const [dr,dc] of DIRS) {
      const er = r+dr*3, ec = c+dc*3;
      if (er<0||er>=ROWS||ec<0||ec>=COLS) continue;
      let ai=0, hu=0, empty=0, walled=false;
      for (let k=0;k<4;k++){ const v=b[r+dr*k][c+dc*k]; if(v===AI)ai++; else if(v===HUMAN)hu++; else if(v===WALL)walled=true; else empty++; }
      if (walled) continue; // a wall kills the window for both sides
      score += windowScore(ai, hu, empty);
    }
  }
  return score;
}

function windowScore(ai, hu, empty) {
  if (ai > 0 && hu > 0) return 0;
  if (ai === 3 && empty === 1) return 50;
  if (ai === 2 && empty === 2) return 10;
  if (ai === 1 && empty === 3) return 1;
  if (hu === 3 && empty === 1) return -80; // prioritize blocking
  if (hu === 2 && empty === 2) return -10;
  if (hu === 1 && empty === 3) return -1;
  return 0;
}

// ============================================================
//  POWER CHECKERS — one Anvil, Bomb and Wall per side per game.
//  Anvil: crushes every disc in a column. Bomb: lands, then blasts the
//  OPPONENT's discs around it and gravity resettles. Wall: a neutral
//  blocker disc that counts for nobody — and grants an extra turn.
// ============================================================
const POWER_INFO = {
  anvil: { icon: '🔨', name: 'Anvil', tip: 'Crushes every disc in a column' },
  bomb:  { icon: '💣', name: 'Bomb',  tip: "Blasts the opponent's discs around where it lands" },
  wall:  { icon: '🧱', name: 'Wall',  tip: 'A neutral blocker — and you move again' },
};

function renderPowers() {
  const tray = document.getElementById('powerTray');
  const cpu = document.getElementById('cpuPowers');
  if (!tray) return;
  if (mode !== 'power') { tray.style.display = 'none'; if (cpu) cpu.style.display = 'none'; return; }
  tray.style.display = 'flex';
  tray.querySelectorAll('.pbtn').forEach(btn => {
    const kind = btn.dataset.power;
    btn.classList.toggle('used', !powers[HUMAN][kind]);
    btn.classList.toggle('armed', armedPower === kind);
  });
  if (cpu) {
    cpu.style.display = '';
    cpu.innerHTML = 'CPU: ' + ['anvil', 'bomb', 'wall']
      .map(k => `<span class="${powers[AI][k] ? '' : 'used'}">${POWER_INFO[k].icon}</span>`).join(' ');
  }
}

document.querySelectorAll('#powerTray .pbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (gameOver || busy || aiExtra || mode !== 'power') return;
    const kind = btn.dataset.power;
    if (!powers[HUMAN][kind]) return;
    armedPower = armedPower === kind ? null : kind;
    setStatus(armedPower ? POWER_INFO[kind].icon + ' ' + POWER_INFO[kind].name + ' armed — click a column' : 'Your turn (Red)');
    renderPowers();
  });
});

function colCells(c) { return cells().filter(cell => +cell.dataset.c === c); }

// settle floating discs after a blast — each column compacts downward
function applyGravity(b) {
  for (let c = 0; c < COLS; c++) {
    const stack = [];
    for (let r = ROWS - 1; r >= 0; r--) if (b[r][c] !== 0) stack.push(b[r][c]);
    for (let r = ROWS - 1; r >= 0; r--) b[r][c] = stack[ROWS - 1 - r] !== undefined ? stack[ROWS - 1 - r] : 0;
  }
}

// After discs are removed, either side might suddenly have four — the player
// who acted gets the point if both line up at once.
function checkEndAfter(mover) {
  const win = findWin(board);
  if (win) {
    let w = win;
    if (win.player !== mover) { // prefer the mover's own line if one exists too
      const all = [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const p2 = board[r][c]; if (p2 !== HUMAN && p2 !== AI) continue;
        for (const [dr, dc] of DIRS) {
          const run = [[r, c]];
          for (let k = 1; k < 4; k++) {
            const nr = r + dr * k, nc = c + dc * k;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== p2) break;
            run.push([nr, nc]);
          }
          if (run.length === 4) all.push({ player: p2, cells: run });
        }
      }
      w = all.find(x => x.player === mover) || win;
    }
    gameOver = true;
    render(w.cells);
    if (w.player === HUMAN) { score.w++; setStatus('You win! 🎉'); sfxWin(); }
    else { score.l++; setStatus('AI wins!'); sfxLose(); }
    updateScore();
    renderPowers();
    return true;
  }
  if (board[0].every(v => v !== 0)) {
    gameOver = true; render();
    score.d++; setStatus("It's a draw!"); sfxDraw(); updateScore();
    return true;
  }
  return false;
}

// Visual FX off: the bomb's flash and the anvil's shockwave are cut to nothing
// and the discs resettle at once, so the cells they hit keep a scorch mark for
// SCORCH_MS after (render() draws it; the timer only strips the class, since a
// plain re-render would also drop a winning line's highlight). FX on shows the
// blast itself.
const SCORCH_MS = 900;
function scorchCells(list) {
  if (animOn()) return;
  const myRound = round;
  scorch = list;
  setTimeout(() => {
    if (myRound !== round || scorch !== list) return;
    scorch = null;
    boardEl.querySelectorAll('.cell.blasted').forEach(cell => cell.classList.remove('blasted'));
  }, SCORCH_MS);
}

function usePower(player, kind, c) {
  const myRound = round;
  const isHuman = player === HUMAN;
  if (isHuman) { armedPower = null; youMoved = true; }
  powers[player][kind]--;
  renderPowers();
  busy = true;

  const finish = (mover, extraTurn) => {
    applyGravity(board);
    render();
    if (checkEndAfter(mover)) { busy = false; return; }
    if (extraTurn) {
      if (isHuman) {
        busy = false;
        setStatus('🧱 Wall placed — take another turn!');
      } else {
        setStatus('CPU walls up and moves again…');
        setTimeout(() => { if (myRound === round) { aiExtra = false; aiMoveWrapped(); } }, animOn() ? 900 : 200);
      }
      return;
    }
    if (isHuman) { setStatus('AI thinking…'); scheduleAI(animOn() ? 820 : 200); }
    else { setStatus('Your turn (Red)'); busy = false; }
  };

  if (kind === 'anvil') {
    (isHuman ? sfxCrush : sfxCrush)();
    lastDisc = null; // the anvil is this move, and may crush the old last disc
    colCells(c).forEach(cell => cell.classList.add('crush'));
    setTimeout(() => {
      if (myRound !== round) return;
      for (let r = 0; r < ROWS; r++) board[r][c] = 0;
      colCells(c).forEach(cell => cell.classList.remove('crush'));
      scorchCells(Array.from({ length: ROWS }, (_, r) => [r, c]));
      finish(player, false);
    }, animOn() ? 480 : 60);
    return;
  }

  if (kind === 'bomb') {
    const r = dropRow(board, c);
    if (r < 0) { powers[player][kind]++; busy = false; renderPowers(); return; } // full column — refund
    board[r][c] = 4; // the lit bomb, shown for a beat
    lastDisc = null; // the bomb is this move, and its blast may move the old last disc
    render();
    dropSound(90);
    setTimeout(() => {
      if (myRound !== round) return;
      const foe = player === HUMAN ? AI : HUMAN;
      const zone = []; // the 3×3 the blast covers, for the FX-off scorch
      board[r][c] = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
        zone.push([nr, nc]);
        if (board[nr][nc] === foe) {
          board[nr][nc] = 0;
          const el = cells().find(x => +x.dataset.r === nr && +x.dataset.c === nc);
          if (el) { el.classList.add('boom'); setTimeout(() => el.classList.remove('boom'), 500); }
        }
      }
      sfxBoom();
      setTimeout(() => { if (myRound === round) { scorchCells(zone); finish(player, false); } }, animOn() ? 420 : 60);
    }, animOn() ? 520 : 80);
    return;
  }

  // wall
  const r = dropRow(board, c);
  if (r < 0) { powers[player][kind]++; busy = false; renderPowers(); return; }
  board[r][c] = WALL;
  animMove = lastDisc = { r, c };
  sfxWall();
  render();
  setTimeout(() => { if (myRound === round) finish(player, true); }, animOn() ? 520 : 60);
}

// --- the AI's power instincts (power mode only) ---
function humanWinningCols() {
  const wins = [];
  for (const c of validCols(board)) {
    const r = dropRow(board, c);
    board[r][c] = HUMAN;
    if (findWin(board)) wins.push({ c, r });
    board[r][c] = 0;
  }
  return wins;
}
function aiPowerPlay() {
  if (mode !== 'power') return null;
  // never spend a power when a normal drop wins outright
  for (const c of validCols(board)) {
    const r = dropRow(board, c);
    board[r][c] = AI;
    const w = findWin(board);
    board[r][c] = 0;
    if (w) return null;
  }
  const threats = humanWinningCols();
  // Wall the human's winning square — the blocker also buys an extra turn.
  if (threats.length && powers[AI].wall) return { kind: 'wall', c: threats[0].c };
  // Bomb a juicy cluster (3+ red discs around a landing spot), or any cluster
  // when the human threatens in two places at once.
  if (powers[AI].bomb) {
    let best = null, bestN = threats.length >= 2 ? 1 : 2;
    for (const c of validCols(board)) {
      const r = dropRow(board, c);
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === HUMAN) n++;
      }
      if (n > bestN) { bestN = n; best = c; }
    }
    if (best !== null) return { kind: 'bomb', c: best };
  }
  // Anvil a column the human owns (3+ red, at most 1 yellow).
  if (powers[AI].anvil) {
    for (let c = 0; c < COLS; c++) {
      let hu = 0, ai = 0;
      for (let r = 0; r < ROWS; r++) { if (board[r][c] === HUMAN) hu++; else if (board[r][c] === AI) ai++; }
      if (hu >= 3 && ai <= 1) return { kind: 'anvil', c };
    }
  }
  return null;
}
function aiMoveWrapped() { // the CPU's bonus move after its wall
  const myRound = round;
  const pp = aiPowerPlay();
  if (pp) {
    if (pp.kind === 'wall') aiExtra = true;
    setStatus('CPU plays the ' + POWER_INFO[pp.kind].name + ' ' + POWER_INFO[pp.kind].icon);
    usePower(AI, pp.kind, pp.c);
    return;
  }
  aiMove();
  setTimeout(() => { if (myRound === round) busy = false; }, animOn() ? 760 : 60);
}

// --- mode selection (shown first; choosing a mode → coin flip → game) ---
const modeModal = document.getElementById('modeModal');
function showModeModal(){ modeModal.classList.add('open'); }
function setupModeModal(onStart){
  modeModal.querySelectorAll('.opts').forEach(group => {
    const sel = document.getElementById(group.dataset.target);
    group.querySelectorAll('.opt').forEach(opt => {
      opt.addEventListener('click', () => {
        group.querySelectorAll('.opt').forEach(o => o.classList.remove('sel'));
        opt.classList.add('sel');
        if (sel) sel.value = opt.dataset.value;
      });
    });
  });
  document.getElementById('startGame').addEventListener('click', () => {
    modeModal.classList.remove('open');
    onStart();
  });
}

// "New Game" returns to mode selection; "Restart" replays the current mode.
document.getElementById('reset').addEventListener('click', showModeModal);
document.getElementById('restart').addEventListener('click', init);

// Leaving asks first from the player's first move until the game ends, the
// CPU's turn included. The coin flip, a board with only the CPU's opening disc,
// a finished game and the mode picker (which can only start a new game) lose
// nothing. Turn-based with no clock, so there's nothing to pause.
if (window.GameShell && GameShell.guardLeave)
  GameShell.guardLeave(() => youMoved && !gameOver && !modeModal.classList.contains('open'));

const rulesModal = document.getElementById('rulesModal');
document.getElementById('rules').addEventListener('click', () => rulesModal.classList.add('open'));
document.getElementById('closeRules').addEventListener('click', () => rulesModal.classList.remove('open'));
rulesModal.addEventListener('click', e => { if (e.target === rulesModal) rulesModal.classList.remove('open'); });

// keep the hole positions aligned if the board resizes (e.g. mobile breakpoint)
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(buildFrame, 100);
});

setupModeModal(init);
showModeModal();   // pick a mode first, then the coin flip decides who goes first
updateScore();

// test hook
window.__game = {
  get board() { return board; },
  get powers() { return powers; },
  get mode() { return mode; },
  get busy() { return busy; },
  get gameOver() { return gameOver; },
  get lastDisc() { return lastDisc; },
  get scorch() { return scorch; },
  usePower, humanMove, applyGravity,
  arm: (k) => { armedPower = k; },
};
