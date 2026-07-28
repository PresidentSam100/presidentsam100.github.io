const SVGNS = 'http://www.w3.org/2000/svg';
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const HUMAN = 'human', AI = 'ai';

let N;               // boxes per side
let hLines, vLines;  // horizontal[N+1][N], vertical[N][N+1] -> owner '' | 'human' | 'ai'
let boxes;           // [N][N] -> '' | 'human' | 'ai'
let scores, turn, gameOver, busy, lastLine, round = 0;
// Tally + UI already existed; it just never survived a reload. Seeded from the
// stored record and written back in updateRecord().
const REC = window.GameShell ? GameShell.record("dotsandboxes_record") : null;
const record = REC ? REC.get() : { w:0, l:0, d:0 };
// Animations follow the global "✨ Visual FX" toggle (motion-toggle.js): FX off
// (or OS reduced-motion) means no line-draw animation and a shorter AI delay.
function animOn(){ return !(window.RM_ON && window.RM_ON()); }

// --- sound effects (Web Audio, synthesized — no assets) ---
let _actx;
function actx(){
  if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
  if (_actx.state === 'suspended') _actx.resume();
  return _actx;
}
// A felt-tip marker zipping along the line. Human strokes rise in pitch,
// the AI's fall, so the two players sound distinct.
function zip(rising){
  const ctx = actx(), now = ctx.currentTime, dur = 0.16, len = ctx.sampleRate*dur|0;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++){ const e = 1 - i/len; d[i] = (Math.random()*2-1)*e; }
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(rising ? 800 : 1900, now);
  bp.frequency.linearRampToValueAtTime(rising ? 2400 : 650, now + dur);
  const g = ctx.createGain(); g.gain.value = 0.4;
  src.connect(bp).connect(g).connect(ctx.destination); src.start(now);
}
// A short chime when a box is claimed (you: bright rising; AI: warmer).
function sfxClaim(owner){
  const ctx = actx(), now = ctx.currentTime;
  const notes = owner === HUMAN ? [523, 784] : [349, 523];
  notes.forEach((f, i) => {
    const t = now + i*0.08;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.2);
  });
}
function sfxHuman(){ zip(true); }
function sfxAI(){ zip(false); }

// Play a short melody: each note is [frequency, duration, gap-to-next].
function melody(seq, type){
  const ctx = actx(); let t = ctx.currentTime;
  for (const [f, dur, gap] of seq){
    const o = ctx.createOscillator(); o.type = type;
    const g = ctx.createGain();
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.24, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
    t += gap;
  }
}
// You win: bright rising bells (an extended claim chime).
function sfxWin(){ melody([[659,0.18,0.12],[880,0.18,0.12],[1047,0.18,0.12],[1319,0.36,0.36]], 'sine'); }
// AI wins: a warm, descending motif.
function sfxLose(){ melody([[523,0.18,0.13],[440,0.18,0.13],[349,0.18,0.13],[294,0.42,0.42]], 'triangle'); }
// Draw: two even, unresolved notes.
function sfxDraw(){ melody([[523,0.2,0.18],[523,0.3,0.3]], 'sine'); }

function newGame() {
  // Bump the round so any still-pending async work (a coin-flip callback or a
  // queued AI turn) from the previous game is recognized as stale and ignored.
  round++;
  N = +document.getElementById('size').value;
  hLines = Array.from({length:N+1}, () => Array(N).fill(''));
  vLines = Array.from({length:N}, () => Array(N+1).fill(''));
  boxes  = Array.from({length:N}, () => Array(N).fill(''));
  scores = { human:0, ai:0 };
  turn = HUMAN; gameOver = false; busy = false; lastLine = null;
  draw();
  updateScores();
  if (window.coinFlip) {
    const myRound = round;
    setStatus('Flipping for first move…');
    coinFlip({ you: 'You (Y)', cpu: 'CPU (A)', accent: '#2f6fb0', youColor: '#d2362f', cpuColor: '#2f6fb0' }, function (who) {
      if (myRound !== round) return; // a new game was started before this flip resolved
      if (who === 'cpu') { turn = AI; busy = true; setStatus('AI thinking…'); scheduleAI(400); }
      else setStatus('Your turn');
      syncPlayable();
    });
  } else { setStatus('Your turn'); syncPlayable(); }
}

// --- geometry ---
const PAD = 36, GAP = 84;
function px(i){ return PAD + i*GAP; }

function draw() {
  const dim = PAD*2 + N*GAP;
  boardEl.setAttribute('width', dim);
  boardEl.setAttribute('height', dim);
  boardEl.innerHTML = '';

  // box fills + labels
  for (let r=0;r<N;r++) for (let c=0;c<N;c++) {
    const rect = document.createElementNS(SVGNS,'rect');
    rect.setAttribute('x', px(c)); rect.setAttribute('y', px(r));
    rect.setAttribute('width', GAP); rect.setAttribute('height', GAP);
    rect.setAttribute('class','box-fill');
    rect.setAttribute('fill', boxes[r][c]==='human' ? 'var(--human-box)' : boxes[r][c]==='ai' ? 'var(--ai-box)' : 'transparent');
    boardEl.appendChild(rect);
    if (boxes[r][c]) {
      const t = document.createElementNS(SVGNS,'text');
      t.setAttribute('x', px(c)+GAP/2); t.setAttribute('y', px(r)+GAP/2);
      t.setAttribute('class','box-label');
      t.setAttribute('fill', boxes[r][c]==='human' ? 'var(--human)' : 'var(--ai)');
      t.textContent = boxes[r][c]==='human' ? 'Y' : 'A';
      boardEl.appendChild(t);
    }
  }

  // horizontal lines
  for (let r=0;r<=N;r++) for (let c=0;c<N;c++)
    addLine(px(c), px(r), px(c+1), px(r), hLines[r][c], () => play('h', r, c), isLast('h',r,c));
  // vertical lines
  for (let r=0;r<N;r++) for (let c=0;c<=N;c++)
    addLine(px(c), px(r), px(c), px(r+1), vLines[r][c], () => play('v', r, c), isLast('v',r,c));

  // dots on top
  for (let r=0;r<=N;r++) for (let c=0;c<=N;c++) {
    const dot = document.createElementNS(SVGNS,'circle');
    dot.setAttribute('cx', px(c)); dot.setAttribute('cy', px(r));
    dot.setAttribute('r', 6); dot.setAttribute('class','dot');
    boardEl.appendChild(dot);
  }
  syncPlayable();
}

// Board accepts hover/clicks only on the human's turn — not during AI
// processing (incl. the line-draw animation) or after the game ends.
function syncPlayable(){ boardEl.classList.toggle('playable', !gameOver && !busy && turn === HUMAN); }

function isLast(type,r,c){
  return animOn() && lastLine && lastLine.type===type && lastLine.r===r && lastLine.c===c;
}

function addLine(x1,y1,x2,y2,owner,onClick,animate) {
  const ln = document.createElementNS(SVGNS,'line');
  ln.setAttribute('x1',x1); ln.setAttribute('y1',y1);
  ln.setAttribute('x2',x2); ln.setAttribute('y2',y2);
  ln.setAttribute('class','line' + (owner ? ' taken '+owner : '') + (animate ? ' draw-anim' : ''));
  if (animate) ln.setAttribute('pathLength','1');
  if (!owner) ln.addEventListener('click', onClick);
  boardEl.appendChild(ln);
}

function setStatus(t){ statusEl.textContent = t; }
function updateScores() {
  document.getElementById('hscore').textContent = scores.human;
  document.getElementById('ascore').textContent = scores.ai;
}

// place a line for current `turn`; returns number of boxes completed
function placeLine(type, r, c, owner) {
  if (type === 'h') hLines[r][c] = owner; else vLines[r][c] = owner;
  let completed = 0;
  for (const [br,bc] of boxesTouching(type, r, c)) {
    if (boxComplete(br,bc) && !boxes[br][bc]) { boxes[br][bc] = owner; completed++; }
  }
  return completed;
}

function boxesTouching(type, r, c) {
  const res = [];
  if (type === 'h') { if (r>0) res.push([r-1,c]); if (r<N) res.push([r,c]); }
  else { if (c>0) res.push([r,c-1]); if (c<N) res.push([r,c]); }
  return res;
}

function boxComplete(r,c) {
  return hLines[r][c] && hLines[r+1][c] && vLines[r][c] && vLines[r][c+1];
}

function play(type, r, c) {
  if (gameOver || busy || turn !== HUMAN) return;
  if (type==='h' ? hLines[r][c] : vLines[r][c]) return;
  const made = placeLine(type, r, c, HUMAN);
  scores.human += made;
  sfxHuman();
  if (made > 0) sfxClaim(HUMAN);
  lastLine = { type, r, c };
  draw(); updateScores();
  if (checkOver()) return;
  if (made === 0) { turn = AI; setStatus('AI thinking…'); busy = true; scheduleAI(350); }
  else setStatus('You completed a box — go again!');
  syncPlayable();
}

// Queue the AI's turn but only let it run if we're still in the same game —
// pressing "New Game" while the AI is "thinking" bumps the round and cancels it.
function scheduleAI(delay) {
  const myRound = round;
  setTimeout(() => { if (myRound === round) aiTurn(); }, delay);
}

function aiTurn() {
  const myRound = round;
  // AI keeps moving while it completes boxes
  const mv = chooseAIMove();
  const made = placeLine(mv.type, mv.r, mv.c, AI);
  scores.ai += made;
  sfxAI();
  if (made > 0) sfxClaim(AI);
  lastLine = { type: mv.type, r: mv.r, c: mv.c };
  draw(); updateScores();
  if (checkOver()) { busy = false; syncPlayable(); return; }
  if (made > 0) { setStatus('AI completed a box — goes again…'); scheduleAI(350); }
  else {
    // Hand the turn back only AFTER the AI's line finishes drawing, so the
    // human can't move (or hover-highlight) while the move is still animating.
    setStatus('Your turn');
    const wait = animOn() ? 300 : 0;
    setTimeout(() => { if (myRound !== round) return; turn = HUMAN; busy = false; syncPlayable(); }, wait);
  }
}

function checkOver() {
  const total = N*N;
  if (scores.human + scores.ai >= total) {
    gameOver = true;
    if (scores.human > scores.ai) { record.w++; setStatus(`You win ${scores.human}–${scores.ai}! 🎉`); sfxWin(); }
    else if (scores.ai > scores.human) { record.l++; setStatus(`AI wins ${scores.ai}–${scores.human}.`); sfxLose(); }
    else { record.d++; setStatus(`Draw ${scores.human}–${scores.ai}.`); sfxDraw(); }
    updateRecord();
    syncPlayable();
    return true;
  }
  return false;
}

function updateRecord() {
  if (REC) REC.set(record);
  document.getElementById('w').textContent = record.w;
  document.getElementById('l').textContent = record.l;
  document.getElementById('d').textContent = record.d;
}

// ---------- AI ----------
function allMoves() {
  const m = [];
  for (let r=0;r<=N;r++) for (let c=0;c<N;c++) if (!hLines[r][c]) m.push({type:'h',r,c});
  for (let r=0;r<N;r++) for (let c=0;c<=N;c++) if (!vLines[r][c]) m.push({type:'v',r,c});
  return m;
}

// how many sides a box currently has
function boxSides(r,c) {
  return (hLines[r][c]?1:0)+(hLines[r+1][c]?1:0)+(vLines[r][c]?1:0)+(vLines[r][c+1]?1:0);
}

// does placing this line complete at least one box?
function moveCompletes(mv) {
  return boxesTouching(mv.type, mv.r, mv.c).some(([br,bc]) => boxSides(br,bc) === 3);
}

// does placing this line create a 3-sided box (a gift to opponent)?
function moveGives(mv) {
  return boxesTouching(mv.type, mv.r, mv.c).some(([br,bc]) => boxSides(br,bc) === 2);
}

function chooseAIMove() {
  const moves = allMoves();
  if (document.getElementById('difficulty').value === 'easy')
    return moves[Math.random()*moves.length|0];

  // 1. Take any box you can complete (chain them — repeated via aiTurn loop).
  const completing = moves.filter(moveCompletes);
  if (completing.length) return completing[Math.random()*completing.length|0];

  // 2. Prefer safe moves that don't hand the opponent a box.
  const safe = moves.filter(mv => !moveGives(mv));
  if (safe.length) return safe[Math.random()*safe.length|0];

  // 3. All moves are sacrifices — give away the smallest chain.
  return smallestSacrifice(moves);
}

// Estimate chain size opened by each sacrificial move; give away the least.
function smallestSacrifice(moves) {
  let best = moves[0], bestSize = Infinity;
  for (const mv of moves) {
    const size = chainSizeAfter(mv);
    if (size < bestSize) { bestSize = size; best = mv; }
  }
  return best;
}

// Simulate the move, then count how many boxes the opponent could grab
// by greedily taking completable boxes (approximates the chain length).
function chainSizeAfter(mv) {
  const snap = snapshot();
  if (mv.type==='h') hLines[mv.r][mv.c]='ai'; else vLines[mv.r][mv.c]='ai';
  let grabbed = 0, guard = 0;
  while (guard++ < N*N) {
    const m = allMoves().find(moveCompletes);
    if (!m) break;
    if (m.type==='h') hLines[m.r][m.c]='x'; else vLines[m.r][m.c]='x';
    // recompute boxes as filled by marking — count newly 4-sided boxes
    let made = 0;
    for (const [br,bc] of boxesTouching(m.type,m.r,m.c)) if (boxSides(br,bc)===4) made++;
    grabbed += made || 1;
  }
  restore(snap);
  return grabbed;
}

function snapshot() {
  return { h: hLines.map(r=>[...r]), v: vLines.map(r=>[...r]) };
}
function restore(s) { hLines = s.h; vLines = s.v; }

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
document.getElementById('restart').addEventListener('click', newGame);

const rulesModal = document.getElementById('rulesModal');
document.getElementById('rules').addEventListener('click', () => rulesModal.classList.add('open'));
document.getElementById('closeRules').addEventListener('click', () => rulesModal.classList.remove('open'));
rulesModal.addEventListener('click', e => { if (e.target === rulesModal) rulesModal.classList.remove('open'); });

updateRecord();    // paint the restored record before the first game starts
setupModeModal(newGame);
showModeModal();   // pick a mode first, then the coin flip decides who goes first
