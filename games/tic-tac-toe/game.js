
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
let boardMode = 'classic'; // 'classic' (3x3) | 'ultimate' (9 nested 3x3 boards)
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
  turn = null; // nobody can move until the coin flip resolves
  boardEl.innerHTML = '';
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
    coinFlip({ you: 'You (X)', cpu: 'CPU (O)', accent: '#89b4fa', youColor: '#f38ba8', cpuColor: '#a6e3a1' }, function (who) {
      if (myRound !== round) return; // a new game was started before this flip resolved
      if (who === 'cpu') { turn = AI; setStatus('AI thinking…'); scheduleAI(450); }
      else { turn = HUMAN; render(); setStatus('Your turn (X)'); }
    });
  } else { turn = HUMAN; render(); setStatus('Your turn (X)'); }
}

function render() {
  [...boardEl.children].forEach((c, i) => {
    const p = board[i];
    c.className = 'cell' + (p === 'X' ? ' x' : p === 'O' ? ' o' : '');
    c.disabled = p !== '' || gameOver || turn !== HUMAN;
    c.innerHTML = p ? markSVG(p, animOn() && i === lastMove) : '';
  });
}

function markSVG(p, animate) {
  const cls = 'mark' + (animate ? ' animate' : '');
  if (p === 'X')
    return `<svg class="${cls}" viewBox="0 0 100 100">
      <line class="stroke" x1="24" y1="24" x2="76" y2="76" pathLength="1"/>
      <line class="stroke s2" x1="76" y1="24" x2="24" y2="76" pathLength="1"/></svg>`;
  return `<svg class="${cls}" viewBox="0 0 100 100">
      <circle class="stroke" cx="50" cy="50" r="29" pathLength="1"/></svg>`;
}

function setStatus(t) { statusEl.textContent = t; }

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
  board[i] = HUMAN;
  lastMove = i;
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
  const i = chooseAIMove();
  board[i] = AI;
  lastMove = i;
  sfxAI();
  if (checkEnd()) return;        // game over → checkEnd renders mark + highlight; cells stay disabled
  render();                      // draw the AI mark; turn is still AI, so cells stay disabled WHILE it animates
  const wait = animOn() ? 360 : 0;
  setTimeout(() => {
    if (myRound !== round) return;
    lastMove = -1;               // don't replay the draw animation on the enabling render
    turn = HUMAN;
    render();                    // only NOW hand control back — cells become hoverable/clickable
    setStatus('Your turn (X)');
  }, wait);
}

function checkEnd() {
  const res = winner(board);
  if (!res) return false;
  gameOver = true;
  render();
  if (res.player === 'draw') {
    score.d++; setStatus("It's a draw!"); sfxDraw();
  } else if (res.player === HUMAN) {
    score.w++; setStatus('You win! 🎉'); highlight(res.line); sfxWin();
  } else {
    score.l++; setStatus('AI wins!'); highlight(res.line); sfxLose();
  }
  updateScore();
  return true;
}

function highlight(line) {
  if (!line) return;
  line.forEach(i => boardEl.children[i].classList.add('win'));
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
  // hard / medium: minimax
  let bestScore = -Infinity, bestMove = empties[0];
  for (const i of empties) {
    board[i] = AI;
    const s = minimax(board, 0, false, -Infinity, Infinity);
    board[i] = '';
    if (s > bestScore) { bestScore = s; bestMove = i; }
  }
  return bestMove;
}

function minimax(b, depth, isMax, alpha, beta) {
  const res = winner(b);
  if (res) {
    if (res.player === AI) return 10 - depth;
    if (res.player === HUMAN) return depth - 10;
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
    coinFlip({ you: 'You (X)', cpu: 'CPU (O)', accent: '#89b4fa', youColor: '#f38ba8', cpuColor: '#a6e3a1' }, function (who) {
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
      btn.innerHTML = p ? markSVG(p, animOn() && isLast) : '';
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

// Switches the visible board and kicks off the right game for whichever
// board type is currently selected.
function startSelectedMode() {
  boardMode = boardModeSelEl.value;
  boardEl.style.display = boardMode === 'classic' ? 'grid' : 'none';
  uboardEl.style.display = boardMode === 'ultimate' ? 'grid' : 'none';
  if (boardMode === 'ultimate') uInit(); else init();
}
function restartCurrent() { if (boardMode === 'ultimate') uInit(); else init(); }

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
const rulesModal = document.getElementById('rulesModal');
const rulesTextEl = document.getElementById('rulesText');
document.getElementById('rules').addEventListener('click', () => {
  rulesTextEl.innerHTML = boardMode === 'ultimate' ? ULTIMATE_RULES : CLASSIC_RULES;
  rulesModal.classList.add('open');
});
document.getElementById('closeRules').addEventListener('click', () => rulesModal.classList.remove('open'));
rulesModal.addEventListener('click', e => { if (e.target === rulesModal) rulesModal.classList.remove('open'); });

setupModeModal(startSelectedMode);
showModeModal();   // pick a mode first, then the coin flip decides who goes first
updateScore();

window.__TTT_TEST__ = {
  uReset: () => { uBoards = Array.from({ length: 9 }, () => Array(9).fill('')); uMacro = Array(9).fill(''); activeSub = -1; },
  uApplyMoveReal, uChooseAIMove, uEmptyLegalCells, macroResult, uRender,
  getState: () => ({ uBoards: uBoards.map(b => b.slice()), uMacro: uMacro.slice(), activeSub }),
};
