
const HUMAN = 'X', AI = 'O';
const boardEl = document.getElementById('board');
const uboardEl = document.getElementById('uboard');
const statusEl = document.getElementById('status');
const diffEl = document.getElementById('difficulty');
const boardModeSelEl = document.getElementById('boardModeSel');
// The W/L/D counters and their UI already existed — they just never survived a
// reload. Seed from the persisted record and write back on every update.
const REC = window.GameShell ? GameShell.record("tictactoe_record") : null;
let board, gameOver, lastMove, turn, round = 0, score = REC ? REC.get() : { w:0, l:0, d:0 };
let boardMode = 'classic'; // classic | ultimate | wild | misere | chaos | gomoku
let placeSym = 'X';   // the symbol the human will place next (wild / order & chaos)
let lastMover = null; // 'human' | 'ai' — who made the latest mark (wild: the finisher wins)
const symPickEl = document.getElementById('symPick');
// Animations follow the global "✨ Visual FX" toggle (motion-toggle.js): FX off
// (or OS reduced-motion) means no mark-draw animation and a shorter AI delay.
function animOn(){ return !(window.RM_ON && window.RM_ON()); }

const LINES = [
  [0,1,2],[3,4,5],[6,7,8], // rows
  [0,3,6],[1,4,7],[2,5,8], // cols
  [0,4,8],[2,4,6]          // diagonals
];

// --- sound effects (Web Audio, synthesized — no assets) ---
let _actx;
function actx(){
  if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
  if (_actx.state === 'suspended') _actx.resume();
  return _actx;
}
// Human draws an X: two quick graphite pencil strokes.
function sfxHuman(){
  const ctx = actx(), now = ctx.currentTime;
  for (let k = 0; k < 2; k++){
    const t = now + k*0.1, dur = 0.09, len = ctx.sampleRate*dur|0;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++){ const e = 1 - i/len; d[i] = (Math.random()*2-1)*e*e; }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200 + k*700; bp.Q.value = 0.9;
    const g = ctx.createGain(); g.gain.value = 0.4;
    src.connect(bp).connect(g).connect(ctx.destination); src.start(t);
  }
}
// AI draws an O: one smooth ink stroke whose pitch glides around the circle and back.
function sfxAI(){
  const ctx = actx(), now = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sine';
  const g = ctx.createGain();
  o.frequency.setValueAtTime(330, now);
  o.frequency.exponentialRampToValueAtTime(560, now + 0.15);
  o.frequency.exponentialRampToValueAtTime(310, now + 0.34);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.3, now + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
  o.connect(g).connect(ctx.destination); o.start(now); o.stop(now + 0.38);
}
// Play a short melody: each note is [frequency, duration, gap-to-next].
function melody(seq, type){
  const ctx = actx(); let t = ctx.currentTime;
  for (const [f, dur, gap] of seq){
    const o = ctx.createOscillator(); o.type = type;
    const g = ctx.createGain();
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
    t += gap;
  }
}
// You win: a bright ascending ink flourish.
function sfxWin(){ melody([[523,0.18,0.1],[659,0.18,0.1],[784,0.18,0.1],[1047,0.36,0.36]], 'triangle'); }
// AI wins: a flat, mechanical descent.
function sfxLose(){ melody([[392,0.16,0.12],[311,0.16,0.12],[262,0.16,0.12],[196,0.42,0.42]], 'square'); }
// Draw: two even, unresolved notes.
function sfxDraw(){ melody([[440,0.2,0.18],[440,0.3,0.3]], 'sine'); }

function init() {
  // Bump the round so any still-pending async work (a coin-flip callback or a
  // queued AI move) from the previous game is recognized as stale and ignored.
  round++;
  board = Array(9).fill('');
  gameOver = false;
  lastMove = -1;
  lastMover = null;
  placeSym = 'X';
  renderSymPick();
  turn = null; // nobody can move until the coin flip resolves
  boardEl.innerHTML = '';
  delete boardEl.dataset.win;
  for (let i = 0; i < 9; i++) {
    const btn = document.createElement('button');
    btn.className = 'cell';
    btn.dataset.i = i;
    btn.addEventListener('click', () => humanMove(i));
    boardEl.appendChild(btn);
  }
  render();
  if (window.coinFlip) {
    const myRound = round;
    setStatus('Flipping for first move…');
    const youLbl = boardMode === 'wild' ? 'You' : 'You (X)';
    const cpuLbl = boardMode === 'wild' ? 'CPU' : 'CPU (O)';
    coinFlip({ you: youLbl, cpu: cpuLbl, accent: '#f3dd7a', youColor: '#f7a6b8', cpuColor: '#9fd4f7' }, function (who) {
      if (myRound !== round) return; // a new game was started before this flip resolved
      if (who === 'cpu') { turn = AI; setStatus('AI thinking…'); scheduleAI(450); }
      else { turn = HUMAN; render(); setStatus(humanPrompt()); }
    });
  } else { turn = HUMAN; render(); setStatus(humanPrompt()); }
}

function render() {
  [...boardEl.children].forEach((c, i) => {
    const p = board[i];
    c.className = 'cell' + (p === 'X' ? ' x' : p === 'O' ? ' o' : '');
    c.disabled = p !== '' || gameOver || turn !== HUMAN;
    setMark(c, p, animOn() && i === lastMove);
  });
}

// A cell keeps the mark it already shows (so its chalk dust can finish
// falling while the next move is made); only a new mark is drawn, animated
// when it's the latest move. `old` is the cell's mark before a rebuild.
function setMark(cell, p, animate, old) {
  const cur = old || cell.querySelector('.mark');
  if (p && cur && cur.dataset.p === p) { if (cur.parentNode !== cell) cell.appendChild(cur); return; }
  cell.innerHTML = p ? markSVG(p, animate) : '';
}

function markSVG(p, animate) {
  const cls = 'mark' + (animate ? ' animate' : '');
  if (p === 'X')
    return `<svg class="${cls}" data-p="X" viewBox="0 0 100 100">
      <line class="stroke" x1="24" y1="24" x2="76" y2="76" pathLength="1"/>
      <line class="stroke s2" x1="76" y1="24" x2="24" y2="76" pathLength="1"/>${animate ? strokeDust(p) : ''}</svg>`;
  return `<svg class="${cls}" data-p="O" viewBox="0 0 100 100">
      <circle class="stroke" cx="50" cy="50" r="29" pathLength="1"/>${animate ? strokeDust(p) : ''}</svg>`;
}

// Visual FX on: chalk dust puffs off a mark where each stroke passes and
// drifts down, and off the strike through a winning line (styles.css .dust).
// With FX off the mark simply appears.
function dustSVG(pts, cls) {
  return pts.map(([x, y, w]) => {
    const r = (2 + Math.random() * 2).toFixed(1), dx = ((Math.random() - 0.5) * 26).toFixed(1), dy = (14 + Math.random() * 22).toFixed(1);
    return `<circle class="dust ${Math.random() < 0.35 ? 'dw' : cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"
      style="--dx:${dx}px;--dy:${dy}px;--w:${w.toFixed(2)}s;--t:${(0.7 + Math.random() * 0.5).toFixed(2)}s"/>`;
  }).join('');
}
// specks along the strokes, each timed to when the (eased-out) stroke reaches it
function strokeDust(p) {
  const pts = [], at = (u) => 0.32 * (1 - Math.sqrt(1 - u));
  for (let k = 0; k < 6; k++) {
    const u = (k + Math.random()) / 6;
    if (p === 'X') { pts.push([24 + 52 * u, 24 + 52 * u, at(u)], [76 - 52 * u, 24 + 52 * u, 0.16 + at(u)]); continue; }
    for (const v of [u / 2, 0.5 + u / 2]) { const a = v * Math.PI * 2; pts.push([50 + 29 * Math.cos(a), 50 + 29 * Math.sin(a), at(v)]); }
  }
  return dustSVG(pts, p === 'X' ? 'dx' : 'do');
}
// specks along the strike as it sweeps over the line's k-th cell (in sweep order)
function strikeDust(li, k) {
  const d = li < 3 ? [1, 0] : li < 6 ? [0, 1] : li === 6 ? [0.71, 0.71] : [0.71, -0.71], pts = [];
  for (const t of [-0.3, 0, 0.3]) {
    const o = t + (Math.random() - 0.5) * 0.15;
    pts.push([50 + d[0] * o * 100, 50 + d[1] * o * 100 + (Math.random() - 0.5) * 6, 0.35 * (k + o + 0.5) / 3]);
  }
  return dustSVG(pts, 'da');
}

function setStatus(t) { statusEl.textContent = t; }

// The X/O picker for modes where both players may place either symbol.
function pickerModes() { return boardMode === 'wild' || boardMode === 'chaos'; }
function renderSymPick() {
  if (!symPickEl) return;
  symPickEl.style.display = pickerModes() ? 'flex' : 'none';
  symPickEl.querySelectorAll('button').forEach(b =>
    b.classList.toggle('sel', b.dataset.sym === placeSym));
}
if (symPickEl) symPickEl.querySelectorAll('button').forEach(b => {
  b.addEventListener('click', () => { placeSym = b.dataset.sym; renderSymPick(); });
});

// The human's-turn prompt, per mode.
function humanPrompt() {
  if (boardMode === 'wild') return 'Your turn — place an X or an O';
  if (boardMode === 'misere') return 'Your turn (X) — do NOT make three in a row';
  return 'Your turn (X)';
}

function winner(b) {
  for (const line of LINES) {
    const [a,bb,c] = line;
    if (b[a] && b[a] === b[bb] && b[a] === b[c]) return { player: b[a], line };
  }
  if (b.every(x => x)) return { player: 'draw', line: null };
  return null;
}

function humanMove(i) {
  // Only accept a click when it's actually the human's turn and the cell is free —
  // this blocks rapid clicks from sneaking in extra moves during the AI's think delay.
  if (gameOver || board[i] || turn !== HUMAN) return;
  turn = AI;
  board[i] = boardMode === 'wild' ? placeSym : HUMAN;
  lastMove = i;
  lastMover = 'human';
  sfxHuman();
  if (checkEnd()) return;
  render();
  setStatus('AI thinking…');
  scheduleAI(animOn() ? 450 : 250);
}

// Queue the AI's move but only let it run if we're still in the same game —
// pressing "New Game" while the AI is "thinking" bumps the round and cancels it.
function scheduleAI(delay) {
  const myRound = round;
  setTimeout(() => { if (myRound === round) aiMove(); }, delay);
}

function aiMove() {
  const myRound = round;
  if (boardMode === 'wild') {
    const mv = wildChooseAIMove();
    board[mv.i] = mv.sym;
    lastMove = mv.i;
  } else {
    const i = chooseAIMove();
    board[i] = AI;
    lastMove = i;
  }
  lastMover = 'ai';
  sfxAI();
  if (checkEnd()) return;        // game over → checkEnd renders mark + highlight; cells stay disabled
  render();                      // draw the AI mark; turn is still AI, so cells stay disabled WHILE it animates
  const wait = animOn() ? 360 : 0;
  setTimeout(() => {
    if (myRound !== round) return;
    lastMove = -1;               // don't replay the draw animation on the enabling render
    turn = HUMAN;
    render();                    // only NOW hand control back — cells become hoverable/clickable
    setStatus(humanPrompt());
  }, wait);
}

function checkEnd() {
  const res = winner(board);
  if (!res) return false;
  gameOver = true;
  render();
  let outcome;
  if (res.player === 'draw') outcome = 'd';
  else if (boardMode === 'wild') outcome = lastMover === 'human' ? 'w' : 'l';    // finishing any line wins
  else if (boardMode === 'misere') outcome = res.player === HUMAN ? 'l' : 'w';   // making a line LOSES
  else outcome = res.player === HUMAN ? 'w' : 'l';
  if (outcome === 'd') {
    score.d++; setStatus("It's a draw!"); sfxDraw();
  } else if (outcome === 'w') {
    score.w++;
    setStatus(boardMode === 'misere' ? 'The AI made three in a row — you win! 🎉' : 'You win! 🎉');
    highlight(res.line); sfxWin();
  } else {
    score.l++;
    setStatus(boardMode === 'misere' ? 'Three in a row — you lose!' : 'AI wins!');
    highlight(res.line); sfxLose();
  }
  updateScore();
  return true;
}

function highlight(line) {
  if (!line) return;
  // Wait for the final mark's draw animation (two strokes, ~0.5s) before
  // striking through — the chalk line lands after the mark, not on top of it.
  const myRound = round;
  const wait = animOn() ? 520 : 0;
  setTimeout(() => {
    if (myRound !== round) return; // a new game replaced this one mid-wait
    line.forEach(i => boardEl.children[i].classList.add('win'));
    boardEl.dataset.win = LINES.indexOf(line); // styles.css strikes through that line
    const li = LINES.indexOf(line);
    if (animOn()) line.forEach((i, k) => {   // (the / diagonal is struck from its bottom end)
      const m = boardEl.children[i].querySelector('.mark');
      if (m) m.insertAdjacentHTML('beforeend', strikeDust(li, li === 7 ? 2 - k : k));
    });
  }, wait);
}

function updateScore() {
  if (REC) REC.set(score);
  document.getElementById('w').textContent = score.w;
  document.getElementById('l').textContent = score.l;
  document.getElementById('d').textContent = score.d;
}

// --- AI ---
function emptyCells(b) { return b.map((v,i)=>v?null:i).filter(i=>i!==null); }

function chooseAIMove() {
  const diff = diffEl.value;
  const empties = emptyCells(board);
  if (diff === 'easy') return empties[Math.random()*empties.length|0];
  if (diff === 'medium' && Math.random() < 0.4) return empties[Math.random()*empties.length|0];
  // hard / medium: minimax (misère flips who a finished line is GOOD for)
  let bestScore = -Infinity, bestMove = empties[0];
  for (const i of empties) {
    board[i] = AI;
    const s = minimax(board, 0, false, -Infinity, Infinity);
    board[i] = '';
    if (s > bestScore) { bestScore = s; bestMove = i; }
  }
  return bestMove;
}

// Wild mode: either player may place either symbol; completing any line of
// three wins. The 3^9 state space is tiny, so a memoized negamax plays it
// perfectly ("value for the player about to move").
const wildMemo = new Map();
function wildLine(b) {
  for (const [a, bb, c] of LINES) if (b[a] && b[a] === b[bb] && b[a] === b[c]) return true;
  return false;
}
function wildValue(b) {
  const key = b.join('.');
  if (wildMemo.has(key)) return wildMemo.get(key);
  let best = -2;
  outer:
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    for (const sym of ['X', 'O']) {
      b[i] = sym;
      let v;
      if (wildLine(b)) v = 1;               // completing a line wins on the spot
      else if (b.every(x => x)) v = 0;      // full board, no line: draw
      else v = -wildValue(b);
      b[i] = '';
      if (v > best) best = v;
      if (best === 1) break outer;
    }
  }
  wildMemo.set(key, best);
  return best;
}
function wildChooseAIMove() {
  const diff = diffEl.value;
  const empties = emptyCells(board);
  const rnd = () => ({ i: empties[Math.random() * empties.length | 0], sym: Math.random() < 0.5 ? 'X' : 'O' });
  if (diff === 'easy') return rnd();
  if (diff === 'medium' && Math.random() < 0.4) return rnd();
  let best = -2, moves = [];
  for (const i of empties) {
    for (const sym of ['X', 'O']) {
      board[i] = sym;
      let v;
      if (wildLine(board)) v = 1;
      else if (board.every(x => x)) v = 0;
      else v = -wildValue(board);
      board[i] = '';
      if (v > best) { best = v; moves = [{ i, sym }]; }
      else if (v === best) moves.push({ i, sym });
    }
  }
  return moves[Math.random() * moves.length | 0];
}

function minimax(b, depth, isMax, alpha, beta) {
  const res = winner(b);
  if (res) {
    // Misère: whoever MADE the line loses, so a finished line is bad news for
    // its own symbol — the classic scores flip.
    const mis = boardMode === 'misere';
    if (res.player === AI) return mis ? depth - 10 : 10 - depth;
    if (res.player === HUMAN) return mis ? 10 - depth : depth - 10;
    return 0;
  }
  if (isMax) {
    let best = -Infinity;
    for (const i of emptyCells(b)) {
      b[i] = AI;
      best = Math.max(best, minimax(b, depth+1, false, alpha, beta));
      b[i] = '';
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const i of emptyCells(b)) {
      b[i] = HUMAN;
      best = Math.min(best, minimax(b, depth+1, true, alpha, beta));
      b[i] = '';
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

// ============================================================
//  ULTIMATE MODE — 9 nested 3x3 boards. Winning a sub-board claims it for
//  that player on the macro board; a full sub-board with no 3-in-a-row is
//  voided — blocked for both players, not won by either.
// ============================================================
let uBoards, uMacro, activeSub, uGameOver, uLastMove, uTurn;

function macroResult(macro) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (macro[a] && macro[a] !== 'draw' && macro[a] === macro[b] && macro[a] === macro[c]) return { player: macro[a], line };
  }
  if (macro.every(x => x)) return { player: 'draw', line: null }; // every sub-board decided, no 3-in-a-row
  return null;
}

// The sub-board(s) currently legal to play in: just the forced target
// (whatever board matches the cell your opponent last played), unless that
// board is already decided — then it's any open board, a free choice.
function uLegalSubs() {
  if (activeSub !== -1 && !uMacro[activeSub]) return [activeSub];
  return [...Array(9).keys()].filter(i => !uMacro[i]);
}

function uInit() {
  round++;
  uBoards = Array.from({ length: 9 }, () => Array(9).fill(''));
  uMacro = Array(9).fill('');
  activeSub = -1;
  uGameOver = false;
  uLastMove = null;
  uTurn = null;
  uRender();
  if (window.coinFlip) {
    const myRound = round;
    setStatus('Flipping for first move…');
    coinFlip({ you: 'You (X)', cpu: 'CPU (O)', accent: '#f3dd7a', youColor: '#f7a6b8', cpuColor: '#9fd4f7' }, function (who) {
      if (myRound !== round) return;
      if (who === 'cpu') { uTurn = AI; setStatus('AI thinking…'); uScheduleAI(450); }
      else { uTurn = HUMAN; uRender(); setStatus('Your turn (X) — play in the highlighted board'); }
    });
  } else { uTurn = HUMAN; uRender(); setStatus('Your turn (X) — play in the highlighted board'); }
}

function uScheduleAI(delay) {
  const myRound = round;
  setTimeout(() => { if (myRound === round) uAiMove(); }, delay);
}

function uRender() {
  const kept = [...uboardEl.querySelectorAll('.ucell')].map(b => b.querySelector('.mark'));
  uboardEl.innerHTML = '';
  const legal = (!uGameOver && uTurn === HUMAN) ? new Set(uLegalSubs()) : new Set();
  for (let s = 0; s < 9; s++) {
    const sub = document.createElement('div');
    sub.className = 'subboard';
    const done = uMacro[s];
    if (done) sub.classList.add('done', 'done-' + (done === 'draw' ? 'draw' : done.toLowerCase()));
    else if (legal.has(s)) sub.classList.add('active');
    else if (!uGameOver) sub.classList.add('locked');
    for (let c = 0; c < 9; c++) {
      const p = uBoards[s][c];
      const btn = document.createElement('button');
      btn.className = 'ucell' + (p === 'X' ? ' x' : p === 'O' ? ' o' : '');
      const isLast = !!(uLastMove && uLastMove.sub === s && uLastMove.cell === c);
      setMark(btn, p, animOn() && isLast, kept[s * 9 + c]);
      btn.disabled = !!p || !!done || !legal.has(s) || uGameOver;
      btn.addEventListener('click', () => uHumanMove(s, c));
      sub.appendChild(btn);
    }
    const markWrap = document.createElement('div');
    markWrap.className = 'subboard-mark';
    if (done === 'draw') markWrap.textContent = '—';
    else if (done) markWrap.innerHTML = markSVG(done, false);
    sub.appendChild(markWrap);
    uboardEl.appendChild(sub);
  }
}

function uHumanMove(sub, cell) {
  if (uGameOver || uTurn !== HUMAN || uMacro[sub] || uBoards[sub][cell]) return;
  if (!uLegalSubs().includes(sub)) return;
  uTurn = AI;
  uApplyMoveReal(sub, cell, HUMAN);
  sfxHuman();
  if (uCheckEnd()) return;
  uRender();
  setStatus('AI thinking…');
  uScheduleAI(animOn() ? 450 : 250);
}

function uAiMove() {
  const myRound = round;
  const { sub, cell } = uChooseAIMove();
  uApplyMoveReal(sub, cell, AI);
  sfxAI();
  if (uCheckEnd()) return;
  uRender();
  const wait = animOn() ? 360 : 0;
  setTimeout(() => {
    if (myRound !== round) return;
    uLastMove = null;
    uTurn = HUMAN;
    uRender();
    setStatus('Your turn (X) — play in the highlighted board');
  }, wait);
}

// Applies a real move to the live game state (uApplyMove/uUndoMove below do
// the same job on these same arrays but for the AI's search, which reverts
// every move it tries).
function uApplyMoveReal(sub, cell, mark) {
  uBoards[sub][cell] = mark;
  uLastMove = { sub, cell };
  if (!uMacro[sub]) {
    const r = winner(uBoards[sub]);
    if (r) uMacro[sub] = r.player === 'draw' ? 'draw' : r.player;
  }
  activeSub = uMacro[cell] ? -1 : cell;
}

function uCheckEnd() {
  const res = macroResult(uMacro);
  if (!res) return false;
  uGameOver = true;
  uRender();
  if (res.player === 'draw') {
    score.d++; setStatus("It's a draw!"); sfxDraw();
  } else if (res.player === HUMAN) {
    score.w++; setStatus('You win! 🎉'); uHighlight(res.line); sfxWin();
  } else {
    score.l++; setStatus('AI wins!'); uHighlight(res.line); sfxLose();
  }
  updateScore();
  return true;
}

function uHighlight(line) {
  if (!line) return;
  const subs = uboardEl.children;
  line.forEach(i => { const mark = subs[i].querySelector('.subboard-mark'); if (mark) mark.style.boxShadow = '0 0 0 3px var(--accent) inset'; });
}

// --- Ultimate AI ---
// The full game tree is far too large to search exhaustively (branching up
// to 81), so this is a depth-limited minimax over a heuristic evaluation
// rather than the classic mode's exhaustive terminal-only search.
function uEmptyLegalCells() {
  const moves = [];
  for (const s of uLegalSubs()) for (let c = 0; c < 9; c++) if (uBoards[s][c] === '') moves.push({ sub: s, cell: c });
  return moves;
}
function uApplyMove(move, mark) {
  const { sub, cell } = move;
  const prevActive = activeSub, prevMacroSub = uMacro[sub];
  uBoards[sub][cell] = mark;
  if (!prevMacroSub) {
    const r = winner(uBoards[sub]);
    if (r) uMacro[sub] = r.player === 'draw' ? 'draw' : r.player;
  }
  activeSub = uMacro[cell] ? -1 : cell;
  return { sub, cell, prevActive, prevMacroSub };
}
function uUndoMove(undo) {
  uBoards[undo.sub][undo.cell] = '';
  uMacro[undo.sub] = undo.prevMacroSub;
  activeSub = undo.prevActive;
}
// How much in-a-row potential a mark has across a 9-cell board (either a
// sub-board's own cells, or the macro board of sub-board outcomes) — a line
// only counts if the opponent (or a voided/drawn board) hasn't blocked it.
function uLineScore(cells, mark, opp) {
  let score = 0;
  for (const [a, b, c] of LINES) {
    const vals = [cells[a], cells[b], cells[c]];
    const mine = vals.filter(v => v === mark).length;
    const blocked = vals.some(v => v === opp || v === 'draw');
    if (mine === 0 || blocked) continue;
    score += mine === 3 ? 1000 : mine === 2 ? 40 : 4;
  }
  return score;
}
const SUB_WEIGHT = [3, 2, 3, 2, 4, 2, 3, 2, 3]; // center sub-board matters most, like classic TTT cells
function uStaticEval(mark) {
  const opp = mark === 'X' ? 'O' : 'X';
  let score = uLineScore(uMacro, mark, opp) * 15 - uLineScore(uMacro, opp, mark) * 15;
  for (let i = 0; i < 9; i++) {
    if (uMacro[i]) continue;
    score += (uLineScore(uBoards[i], mark, opp) - uLineScore(uBoards[i], opp, mark)) * SUB_WEIGHT[i];
  }
  return score;
}
function uMinimax(depth, isMax, alpha, beta, aiMark, humanMark) {
  const res = macroResult(uMacro);
  if (res) {
    if (res.player === aiMark) return 100000 - depth;
    if (res.player === humanMark) return depth - 100000;
    return 0;
  }
  if (depth === 0) return uStaticEval(aiMark);
  const moves = uEmptyLegalCells();
  if (isMax) {
    let best = -Infinity;
    for (const m of moves) {
      const undo = uApplyMove(m, aiMark);
      best = Math.max(best, uMinimax(depth - 1, false, alpha, beta, aiMark, humanMark));
      uUndoMove(undo);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      const undo = uApplyMove(m, humanMark);
      best = Math.min(best, uMinimax(depth - 1, true, alpha, beta, aiMark, humanMark));
      uUndoMove(undo);
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}
function uChooseAIMove() {
  const diff = diffEl.value;
  const moves = uEmptyLegalCells();
  if (diff === 'easy') return moves[Math.random() * moves.length | 0];
  if (diff === 'medium' && Math.random() < 0.35) return moves[Math.random() * moves.length | 0];
  // A free-choice turn (activeSub === -1) can open up dozens of legal moves,
  // so search shallower there to stay fast; a turn constrained to one
  // sub-board (<=9 options) can afford to look deeper.
  const constrained = activeSub !== -1 && !uMacro[activeSub];
  const depth = diff === 'hard' ? (constrained ? 2 : 1) : (constrained ? 1 : 0);
  let bestScore = -Infinity, bestMoves = [];
  for (const m of moves) {
    const undo = uApplyMove(m, AI);
    const s = uMinimax(depth, false, -Infinity, Infinity, AI, HUMAN);
    uUndoMove(undo);
    if (s > bestScore) { bestScore = s; bestMoves = [m]; }
    else if (s === bestScore) bestMoves.push(m);
  }
  return bestMoves[Math.random() * bestMoves.length | 0];
}

// ============================================================
//  GRID MODES — Order & Chaos (6×6: both sides place X or O; Order wants
//  five-in-a-row of EITHER symbol, Chaos wants the board full without one)
//  and Gomoku (15×15: X vs O, EXACTLY five in a row wins — six is no win).
// ============================================================
const gboardEl = document.getElementById('gboard');
let gN = 6, gBoard = [], gTurn = null, gGameOver = false, gLastMove = -1;
let gWindows = [], gWinByCell = [];
let chaosHumanRole = 'order';

function buildWindows(n, k) {
  const wins = [], dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
    for (const [dr, dc] of dirs) {
      const er = r + dr * (k - 1), ec = c + dc * (k - 1);
      if (er < 0 || er >= n || ec < 0 || ec >= n) continue;
      const cells = [];
      for (let j = 0; j < k; j++) cells.push((r + dr * j) * n + (c + dc * j));
      wins.push(cells);
    }
  return wins;
}

// The winning run, if any. Gomoku demands EXACTLY five (an overline of six or
// more keeps the game going); Order & Chaos takes five or more.
function gWinRun(b) {
  const n = gN, dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const v = b[r * n + c];
    if (!v) continue;
    for (const [dr, dc] of dirs) {
      const pr = r - dr, pc = c - dc;
      if (pr >= 0 && pr < n && pc >= 0 && pc < n && b[pr * n + pc] === v) continue; // not the run's start
      let rr = r, cc = c;
      const cells = [];
      while (rr >= 0 && rr < n && cc >= 0 && cc < n && b[rr * n + cc] === v) {
        cells.push(rr * n + cc); rr += dr; cc += dc;
      }
      if (boardMode === 'gomoku' ? cells.length === 5 : cells.length >= 5)
        return { sym: v, cells: cells.slice(0, 5) };
    }
  }
  return null;
}

function gPrompt() {
  if (boardMode === 'gomoku') return 'Your turn (X) — make exactly five in a row';
  return chaosHumanRole === 'order'
    ? 'Your turn (Order) — build five in a row of one symbol, all X or all O'
    : 'Your turn (Chaos) — break up every five-in-a-row threat';
}

function gInit() {
  round++;
  gN = boardMode === 'gomoku' ? 15 : 6;
  gBoard = Array(gN * gN).fill('');
  gGameOver = false; gLastMove = -1; gTurn = null;
  lastMover = null; placeSym = 'X';
  const sideSel = document.getElementById('chaosSide');
  chaosHumanRole = sideSel ? sideSel.value : 'order';
  gWindows = buildWindows(gN, 5);
  gWinByCell = Array.from({ length: gN * gN }, () => []);
  gWindows.forEach((wcells, wi) => wcells.forEach(i => gWinByCell[i].push(wi)));
  renderSymPick();
  gboardEl.dataset.size = gN;
  gboardEl.style.gridTemplateColumns = 'repeat(' + gN + ', 1fr)';
  gboardEl.style.gridTemplateRows = 'repeat(' + gN + ', 1fr)'; // rows pinned too, or cells resize as marks land
  gboardEl.innerHTML = '';
  for (let i = 0; i < gN * gN; i++) {
    const btn = document.createElement('button');
    btn.className = 'gcell';
    btn.addEventListener('click', () => gHumanMove(i));
    gboardEl.appendChild(btn);
  }
  gRender();
  const you = boardMode === 'gomoku' ? 'You (X)' : (chaosHumanRole === 'order' ? 'You (Order)' : 'You (Chaos)');
  const cpu = boardMode === 'gomoku' ? 'CPU (O)' : (chaosHumanRole === 'order' ? 'CPU (Chaos)' : 'CPU (Order)');
  if (window.coinFlip) {
    const myRound = round;
    setStatus('Flipping for first move…');
    coinFlip({ you, cpu, accent: '#f3dd7a', youColor: '#f7a6b8', cpuColor: '#9fd4f7' }, function (who) {
      if (myRound !== round) return;
      if (who === 'cpu') { gTurn = AI; setStatus('AI thinking…'); gScheduleAI(500); }
      else { gTurn = HUMAN; gRender(); setStatus(gPrompt()); }
    });
  } else { gTurn = HUMAN; gRender(); setStatus(gPrompt()); }
}

function gRender() {
  for (let i = 0; i < gBoard.length; i++) {
    const c = gboardEl.children[i], pm = gBoard[i];
    const win = c.classList.contains('win');
    c.className = 'gcell' + (pm === 'X' ? ' x' : pm === 'O' ? ' o' : '') + (win ? ' win' : '');
    c.disabled = !!pm || gGameOver || gTurn !== HUMAN;
    setMark(c, pm, animOn() && i === gLastMove);
  }
}

function gHumanMove(i) {
  if (gGameOver || gBoard[i] || gTurn !== HUMAN) return;
  gTurn = AI;
  gBoard[i] = boardMode === 'chaos' ? placeSym : HUMAN;
  gLastMove = i; lastMover = 'human';
  sfxHuman();
  if (gCheckEnd()) return;
  gRender();
  setStatus('AI thinking…');
  gScheduleAI(animOn() ? 450 : 250);
}

function gScheduleAI(delay) {
  const myRound = round;
  setTimeout(() => { if (myRound === round) gAiMove(); }, delay);
}

function gAiMove() {
  const myRound = round;
  const mv = boardMode === 'gomoku' ? gomokuChooseAI() : chaosChooseAI();
  gBoard[mv.i] = mv.sym;
  gLastMove = mv.i; lastMover = 'ai';
  sfxAI();
  if (gCheckEnd()) return;
  gRender();
  const wait = animOn() ? 360 : 0;
  setTimeout(() => {
    if (myRound !== round) return;
    gLastMove = -1; gTurn = HUMAN; gRender(); setStatus(gPrompt());
  }, wait);
}

function gCheckEnd() {
  const run = gWinRun(gBoard);
  let outcome = null;
  if (run) outcome = boardMode === 'gomoku'
    ? (run.sym === HUMAN ? 'w' : 'l')
    : (chaosHumanRole === 'order' ? 'w' : 'l');      // any five: Order's point
  else if (gBoard.every(x => x))
    outcome = boardMode === 'gomoku' ? 'd' : (chaosHumanRole === 'chaos' ? 'w' : 'l');
  if (!outcome) return false;
  gGameOver = true;
  gRender();
  if (run) run.cells.forEach(i => gboardEl.children[i].classList.add('win'));
  if (outcome === 'd') { score.d++; setStatus("It's a draw!"); sfxDraw(); }
  else if (outcome === 'w') {
    score.w++;
    setStatus(boardMode === 'chaos' && chaosHumanRole === 'chaos'
      ? 'The board filled with no five — Chaos wins! 🎉' : 'You win! 🎉');
    sfxWin();
  } else {
    score.l++;
    setStatus(boardMode === 'chaos' && chaosHumanRole === 'order'
      ? 'The board filled with no five — Chaos wins.' : 'AI wins!');
    sfxLose();
  }
  updateScore();
  return true;
}

// --- Order & Chaos AI ---
// Order's fuel: windows of five whose non-empty cells are all ONE symbol.
// 10^count per window, so a single four outweighs any pile of pairs.
function orderPotential(b) {
  let total = 0;
  for (const wcells of gWindows) {
    let x = 0, o = 0;
    for (const i of wcells) { if (b[i] === 'X') x++; else if (b[i] === 'O') o++; }
    if (x && o) continue;
    const cnt = x + o;
    if (cnt) total += Math.pow(10, cnt);
  }
  return total;
}
// windows one move from a five: pure with exactly four filled
function openFours(b) {
  let n4 = 0;
  for (const wcells of gWindows) {
    let x = 0, o = 0, empty = 0;
    for (const i of wcells) { if (b[i] === 'X') x++; else if (b[i] === 'O') o++; else empty++; }
    if (x && o) continue;
    if (empty === 1 && x + o === 4) n4++;
  }
  return n4;
}
function gEmpty(b) { const out = []; for (let i = 0; i < b.length; i++) if (!b[i]) out.push(i); return out; }

function chaosChooseAI() {
  const aiRole = chaosHumanRole === 'order' ? 'chaos' : 'order';
  const empties = gEmpty(gBoard);
  const diff = diffEl.value;
  const safeRandom = () => { // random, but Chaos never gift-wraps a five
    for (let t = 0; t < 24; t++) {
      const m = { i: empties[Math.random() * empties.length | 0], sym: Math.random() < 0.5 ? 'X' : 'O' };
      gBoard[m.i] = m.sym;
      const run = gWinRun(gBoard);
      gBoard[m.i] = '';
      if (aiRole === 'order' || !run) return m;
    }
    return { i: empties[Math.random() * empties.length | 0], sym: 'X' };
  };
  if (diff === 'easy') return safeRandom();
  if (diff === 'medium' && Math.random() < 0.35) return safeRandom();
  let best = null, bestScore = -Infinity;
  for (const i of empties) {
    for (const sym of ['X', 'O']) {
      gBoard[i] = sym;
      let sc;
      const run = gWinRun(gBoard);
      if (run) sc = aiRole === 'order' ? 1e12 : -1e12; // finishing five: jackpot or suicide
      else {
        const pot = orderPotential(gBoard);
        const fours = openFours(gBoard);
        sc = aiRole === 'order'
          ? pot + fours * 1e8                     // an open four means five next turn
          : -pot - fours * 1e9;                   // Chaos must never leave one standing
      }
      gBoard[i] = '';
      sc += Math.random(); // shuffle ties
      if (sc > bestScore) { bestScore = sc; best = { i, sym }; }
    }
  }
  return best;
}

// --- Gomoku AI ---
// Heuristic over the windows through each candidate cell (cells near stones):
// build my lines, break theirs; immediate fives and forced blocks first.
const GK_ME = [0, 4, 46, 420, 5200, 120000];
const GK_FOE = [0, 3, 40, 390, 4900, 100000];
function gomokuCandidates() {
  const n = gN, set = new Set();
  let any = false;
  for (let i = 0; i < gBoard.length; i++) {
    if (!gBoard[i]) continue;
    any = true;
    const r = i / n | 0, c = i % n;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
      const j = rr * n + cc;
      if (!gBoard[j]) set.add(j);
    }
  }
  if (!any) return [(n * n) / 2 | 0];
  return [...set];
}
function gomokuChooseAI() {
  const diff = diffEl.value;
  const cands = gomokuCandidates();
  const rnd = () => ({ i: cands[Math.random() * cands.length | 0], sym: AI });
  if (diff === 'easy') return rnd();
  for (const i of cands) { // win on the spot
    gBoard[i] = AI;
    const run = gWinRun(gBoard);
    gBoard[i] = '';
    if (run && run.sym === AI) return { i, sym: AI };
  }
  for (const i of cands) { // deny the human's five
    gBoard[i] = HUMAN;
    const run = gWinRun(gBoard);
    gBoard[i] = '';
    if (run && run.sym === HUMAN) return { i, sym: AI };
  }
  if (diff === 'medium' && Math.random() < 0.3) return rnd();
  let best = cands[0], bestScore = -Infinity;
  for (const i of cands) {
    let sc = Math.random();
    for (const wi of gWinByCell[i]) {
      let x = 0, o = 0;
      for (const j of gWindows[wi]) { if (gBoard[j] === AI) x++; else if (gBoard[j] === HUMAN) o++; }
      if (x && o) continue;
      if (!o) sc += GK_ME[x + 1];
      else sc += GK_FOE[o];
    }
    if (sc > bestScore) { bestScore = sc; best = i; }
  }
  return { i: best, sym: AI };
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
        const sideGroup = document.getElementById('chaosSideGroup');
        if (sideGroup && group.dataset.target === 'boardModeSel')
          sideGroup.style.display = opt.dataset.value === 'chaos' ? '' : 'none';
      });
    });
  });
  document.getElementById('startGame').addEventListener('click', () => {
    modeModal.classList.remove('open');
    onStart();
  });
}

// Switches the visible board and kicks off the right game for whichever
// board type is currently selected.
function isGridMode() { return boardMode === 'chaos' || boardMode === 'gomoku'; }
function startSelectedMode() {
  boardMode = boardModeSelEl.value;
  const classicFamily = boardMode === 'classic' || boardMode === 'wild' || boardMode === 'misere';
  boardEl.style.display = classicFamily ? 'grid' : 'none';
  uboardEl.style.display = boardMode === 'ultimate' ? 'grid' : 'none';
  gboardEl.style.display = isGridMode() ? 'grid' : 'none';
  if (boardMode === 'ultimate') uInit();
  else if (isGridMode()) gInit();
  else init();
}
function restartCurrent() {
  if (boardMode === 'ultimate') uInit();
  else if (isGridMode()) gInit();
  else init();
}

// "New Game" returns to mode selection; "Restart" replays the current mode.
document.getElementById('reset').addEventListener('click', showModeModal);
document.getElementById('restart').addEventListener('click', restartCurrent);

const CLASSIC_RULES = `Take turns marking squares on the 3×3 grid. You are <b>X</b>, the computer is <b>O</b>.
  Get three of your marks in a row — horizontally, vertically, or diagonally — to win.
  If the board fills up with no three-in-a-row, it's a draw.`;
const ULTIMATE_RULES = `Nine small 3×3 boards make one big 3×3 board. Win a small board with three in a row
  to claim it (<b>X</b> or <b>O</b>) on the big board — three claimed boards in a row wins the whole game.
  If a small board fills up with no winner, it's <b>voided</b>: blocked for both sides. The twist —
  whichever square you play in a small board sends your opponent to that same-numbered small board next.
  If that board is already decided, they get a free choice of any open board instead.`;
const WILD_RULES = `Both players may place an <b>X or an O</b> on any turn — pick your symbol
  with the toggle above the board. Whoever completes any line of three matching symbols wins,
  no matter whose symbols they are. Watch out: a careless mark can hand the AI the finish.`;
const MISERE_RULES = `Reverse tic-tac-toe: making <b>three in a row loses</b>. You are <b>X</b>,
  the computer is <b>O</b>. Dodge every line and force the AI into completing one.
  A full board with no line is a draw.`;
const CHAOS_RULES = `A 6×6 duel of roles. Both players place <b>X or O</b> (pick with the toggle).
  <b>Order</b> wins by making five in a row of either symbol — <b>Chaos</b> wins if the board
  fills with no five anywhere. Choose your side when starting the game.`;
const GOMOKU_RULES = `A 15×15 board. You are <b>X</b>, the computer is <b>O</b>. Make a row of
  <b>exactly five</b> of your marks — horizontally, vertically, or diagonally. Six or more in
  a row does not count, so mind your overlines.`;
const rulesModal = document.getElementById('rulesModal');
const rulesTextEl = document.getElementById('rulesText');
document.getElementById('rules').addEventListener('click', () => {
  rulesTextEl.innerHTML =
    boardMode === 'ultimate' ? ULTIMATE_RULES :
    boardMode === 'wild' ? WILD_RULES :
    boardMode === 'misere' ? MISERE_RULES :
    boardMode === 'chaos' ? CHAOS_RULES :
    boardMode === 'gomoku' ? GOMOKU_RULES : CLASSIC_RULES;
  rulesModal.classList.add('open');
});
document.getElementById('closeRules').addEventListener('click', () => rulesModal.classList.remove('open'));
rulesModal.addEventListener('click', e => { if (e.target === rulesModal) rulesModal.classList.remove('open'); });
// The open Rules card claims Esc: it closes the card, and doesn't also leave the game
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !rulesModal.classList.contains('open')) return;
  rulesModal.classList.remove('open');
  e.preventDefault();
});

setupModeModal(startSelectedMode);
showModeModal();   // pick a mode first, then the coin flip decides who goes first
updateScore();

// Leaving asks first while a game is under way: a mark on the board and no
// result yet (the W/L/D record is only written when a game ends)
if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave(function () {
  const marked = (b) => !!b && b.some(Boolean);
  if (boardMode === 'ultimate') return !uGameOver && !!uBoards && uBoards.some(marked);
  if (isGridMode()) return !gGameOver && marked(gBoard);
  return !gameOver && marked(board);
});

window.__TTT_TEST__ = {
  get board() { return board; },
  get gBoard() { return gBoard; },
  get boardMode() { return boardMode; },
  get turn() { return turn; },
  get gTurn() { return gTurn; },
  gWinRun: () => gWinRun(gBoard),
  wildValue, gHumanMove, humanMove,
  setPlaceSym: (v) => { placeSym = v; renderSymPick(); },
  uReset: () => { uBoards = Array.from({ length: 9 }, () => Array(9).fill('')); uMacro = Array(9).fill(''); activeSub = -1; },
  uApplyMoveReal, uChooseAIMove, uEmptyLegalCells, macroResult, uRender,
  getState: () => ({ uBoards: uBoards.map(b => b.slice()), uMacro: uMacro.slice(), activeSub }),
};
