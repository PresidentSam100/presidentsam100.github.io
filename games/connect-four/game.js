const ROWS = 6, COLS = 7;
const HUMAN = 1, AI = 2; // 1=Red, 2=Yellow
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const diffEl = document.getElementById('difficulty');
// Tally + UI already existed; it just never survived a reload.
const REC = window.GameShell ? GameShell.record("connectfour_record") : null;
let board, gameOver, busy, animMove, round = 0, score = REC ? REC.get() : { w:0, l:0, d:0 };
let hoverColIdx = -1; // column the cursor is currently over (to re-highlight after the AI moves)
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
  board = Array.from({length:ROWS}, () => Array(COLS).fill(0));
  gameOver = false; busy = false; animMove = null; hoverColIdx = -1;
  buildDOM();
  render();
  if (window.coinFlip) {
    const myRound = round;
    setStatus('Flipping for first move…');
    coinFlip({ you: 'You (Red)', cpu: 'CPU (Yellow)', accent: '#d9a441', youColor: '#e4564d', cpuColor: '#f4d35e' }, function (who) {
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

// Builds the SVG frame that overlays the discs: a solid colored sheet with a
// circular hole cut out over each cell, so discs are only seen through the holes.
function buildFrame() {
  const old = boardEl.querySelector('.frame-layer');
  if (old) old.remove();
  const W = boardEl.clientWidth, H = boardEl.clientHeight;
  const br = boardEl.getBoundingClientRect();
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'frame-layer');
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const holes = cells().map(cell => {
    const r = cell.getBoundingClientRect();
    const cx = r.left - br.left + r.width / 2;
    const cy = r.top - br.top + r.height / 2;
    return `<circle cx="${cx}" cy="${cy}" r="${r.width / 2}" fill="black"/>`;
  }).join('');
  svg.innerHTML =
    `<defs><mask id="holes"><rect width="${W}" height="${H}" fill="white"/>${holes}</mask></defs>` +
    `<rect width="${W}" height="${H}" rx="14" style="fill:var(--frame)" mask="url(#holes)"/>`;
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
    let cls = 'cell' + (v === HUMAN ? ' red' : v === AI ? ' yellow' : '');
    if (winCells && winCells.some(([wr,wc]) => wr===r && wc===c)) cls += ' win';
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
  if (gameOver || busy) return;
  const r = dropRow(board, c);
  if (r < 0) return;
  board[r][c] = HUMAN;
  animMove = { r, c };
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
  animMove = { r, c };
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
      let ai=0, hu=0, empty=0;
      for (let k=0;k<4;k++){ const v=b[r+dr*k][c+dc*k]; if(v===AI)ai++; else if(v===HUMAN)hu++; else empty++; }
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
