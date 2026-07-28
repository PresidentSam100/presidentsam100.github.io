const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const PADDLE_W = 12;
const PADDLE_H = 90;
const PADDLE_SPEED = 7;
const BALL_SIZE = 12;
const WIN_SCORE = 7;

const menu = document.getElementById("menu");
const gameover = document.getElementById("gameover");
const winnerEl = document.getElementById("winner");
const recordEl = document.getElementById("record");
const REC = window.GameShell ? GameShell.record("pong_record") : null;
const controlsEl = document.getElementById("controls");
const countdownEl = document.getElementById("countdown");
const countNumEl = document.getElementById("count-num");
const countLeftEl = document.getElementById("count-left");
const countRightLabelEl = document.getElementById("count-right-label");
const countRightEl = document.getElementById("count-right");

let state = "menu";     // "menu" | "countdown" | "playing" | "gameover"
let players = 1;        // 1 = vs AI, 2 = vs human
let pendingDir = 1;     // direction the ball will launch once the countdown ends
let countdownTimer = null;

// --- Sound (Web Audio API, no files needed) ---
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}

// Play a single tone. type/freq/duration shape the sound.
function tone(freq, duration, type = "square", volume = 0.2, startAt = 0) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime + startAt;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + duration);
}

function fanfare(notes) {
  notes.forEach((f, i) => tone(f, 0.18, "triangle", 0.22, i * 0.13));
}

const sounds = {
  paddleLeft: () => tone(440, 0.08, "square"),
  paddleRight: () => tone(330, 0.08, "square"),
  wall: () => tone(220, 0.06, "sine", 0.12),
  // Player 1 (left) point: brighter ascending blip
  scoreLeft: () => { tone(294, 0.16, "sawtooth", 0.18); tone(392, 0.2, "sawtooth", 0.16, 0.05); },
  // Player 2 (right) point: lower descending blip
  scoreRight: () => { tone(196, 0.18, "sawtooth", 0.18); tone(147, 0.22, "sawtooth", 0.16, 0.05); },
  // Player 1 (left) win: C major  C-E-G-C
  winLeft: () => fanfare([523, 659, 784, 1047]),
  // Player 2 (right, CPU or human) win: D major  D-F#-A-D
  winRight: () => fanfare([587, 740, 880, 1175]),
};

const left = { x: 20, y: H / 2 - PADDLE_H / 2, score: 0 };
const right = { x: W - 20 - PADDLE_W, y: H / 2 - PADDLE_H / 2, score: 0 };
const ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };

const keys = {};
document.addEventListener("keydown", e => {
  keys[e.key.toLowerCase()] = true;
  // stop page scrolling on arrows
  if (["arrowup", "arrowdown"].includes(e.key.toLowerCase())) e.preventDefault();
});
document.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });

// --- On-screen arrow buttons (mobile): up/down per player ---
let leftUp = false, leftDown = false, rightUp = false, rightDown = false;
function bindPongBtn(el) {
  const side = el.dataset.side, dir = el.dataset.dir;
  const set = (v) => {
    if (side === "left") { if (dir === "up") leftUp = v; else leftDown = v; }
    else { if (dir === "up") rightUp = v; else rightDown = v; }
  };
  const press = (e) => { e.preventDefault(); initAudio(); set(true); };
  const release = (e) => { e.preventDefault(); set(false); };
  el.addEventListener("touchstart", press, { passive: false });
  el.addEventListener("touchend", release, { passive: false });
  el.addEventListener("touchcancel", release, { passive: false });
  el.addEventListener("mousedown", press);
  el.addEventListener("mouseup", release);
  el.addEventListener("mouseleave", release);
}
document.querySelectorAll(".pbtn").forEach(bindPongBtn);

function resetBall(dir) {
  // center the SQUARE (top-left origin) so it sits dead-center, not offset by its size
  ball.x = (W - BALL_SIZE) / 2;
  ball.y = (H - BALL_SIZE) / 2;
  const angle = (Math.random() * 0.5 - 0.25) * Math.PI; // -45deg..45deg
  const speed = 6;
  ball.vx = dir * speed * Math.cos(angle);
  ball.vy = speed * Math.sin(angle);
}

function startGame(mode) {
  initAudio(); // unlock/resume audio on user gesture
  players = mode;
  left.score = 0;
  right.score = 0;
  left.y = right.y = H / 2 - PADDLE_H / 2;
  // park the ball at center, frozen — it launches when the countdown ends
  ball.x = (W - BALL_SIZE) / 2; ball.y = (H - BALL_SIZE) / 2; ball.vx = 0; ball.vy = 0;
  pendingDir = Math.random() < 0.5 ? -1 : 1; // random first serve: left or right player

  menu.classList.add("hidden");
  gameover.classList.add("hidden");
  document.body.classList.add("playing");
  document.body.classList.toggle("p2", players === 2); // show right arrows in 2P
  startCountdown();
}

// 3-second countdown before play: shows both players' controls, then launches.
function startCountdown() {
  state = "countdown";
  // On touch devices the on-screen ▲▼ buttons are the controls, so don't show the
  // keyboard hints (W/S, ↑/↓) or "Auto" — those only apply on desktop.
  const touch = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  const setCtl = (el, t) => { el.textContent = t; el.style.display = t ? "" : "none"; };
  countRightLabelEl.textContent = players === 2 ? "Player 2" : "CPU";
  setCtl(countLeftEl, touch ? "▲ ▼" : "W / S");
  setCtl(countRightEl, players === 2 ? (touch ? "▲ ▼" : "↑ / ↓") : "Auto");
  countdownEl.classList.remove("hidden");

  let n = 3;
  showCount(n);
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    n--;
    if (n > 0) {
      showCount(n);
    } else {
      clearInterval(countdownTimer);
      countdownTimer = null;
      countdownEl.classList.add("hidden"); // controls vanish as play begins
      tone(660, 0.18, "square", 0.2);      // "go!"
      state = "playing";
      resetBall(pendingDir);
    }
  }, 1000);
}

// Update the big number and restart its pop animation, with a tick beep.
function showCount(n) {
  countNumEl.textContent = n;
  countNumEl.style.animation = "none";
  void countNumEl.offsetWidth; // reflow so the animation replays each tick
  countNumEl.style.animation = "";
  tone(440, 0.1, "square", 0.16);
}

function clampPaddle(p) {
  if (p.y < 0) p.y = 0;
  if (p.y + PADDLE_H > H) p.y = H - PADDLE_H;
}

function update() {
  if (state !== "playing" && state !== "countdown") return;
  const ly0 = left.y, ry0 = right.y; // remember pre-move y for motion-blur velocity

  // Left paddle: W/S or on-screen arrows
  if (keys["w"] || leftUp) left.y -= PADDLE_SPEED;
  if (keys["s"] || leftDown) left.y += PADDLE_SPEED;
  clampPaddle(left);

  // Right paddle: human (arrows / on-screen) or AI
  if (players === 2) {
    if (keys["arrowup"] || rightUp) right.y -= PADDLE_SPEED;
    if (keys["arrowdown"] || rightDown) right.y += PADDLE_SPEED;
  } else {
    const target = ball.y - PADDLE_H / 2;
    const diff = target - right.y;
    const aiSpeed = PADDLE_SPEED * 0.82; // slightly beatable
    if (Math.abs(diff) > aiSpeed) right.y += Math.sign(diff) * aiSpeed;
    else right.y = target;
  }
  clampPaddle(right);
  left.dy = left.y - ly0; right.dy = right.y - ry0; // per-frame paddle movement

  if (state !== "playing") return; // ball stays frozen during the countdown

  // Ball movement
  ball.x += ball.vx;
  ball.y += ball.vy;

  // Top / bottom walls
  if (ball.y < 0) { ball.y = 0; ball.vy *= -1; sounds.wall(); }
  if (ball.y + BALL_SIZE > H) { ball.y = H - BALL_SIZE; ball.vy *= -1; sounds.wall(); }

  // Paddle collisions
  collide(left, 1);
  collide(right, -1);

  // Scoring
  if (ball.x + BALL_SIZE < 0) { right.score++; afterPoint(1); }
  else if (ball.x > W) { left.score++; afterPoint(-1); }
}

function collide(p, dir) {
  if (
    ball.x < p.x + PADDLE_W &&
    ball.x + BALL_SIZE > p.x &&
    ball.y < p.y + PADDLE_H &&
    ball.y + BALL_SIZE > p.y
  ) {
    // reflect and add english based on hit position
    const hit = (ball.y + BALL_SIZE / 2 - (p.y + PADDLE_H / 2)) / (PADDLE_H / 2);
    const speed = Math.min(Math.hypot(ball.vx, ball.vy) * 1.05, 14);
    const angle = hit * (Math.PI / 4); // up to 45deg
    ball.vx = dir * speed * Math.cos(angle);
    ball.vy = speed * Math.sin(angle);
    // nudge out so it doesn't stick
    ball.x = dir === 1 ? p.x + PADDLE_W : p.x - BALL_SIZE;
    if (dir === 1) sounds.paddleLeft(); else sounds.paddleRight();
  }
}

function afterPoint(dir) {
  if (left.score >= WIN_SCORE || right.score >= WIN_SCORE) {
    state = "gameover";
    let who;
    if (players === 1) who = left.score > right.score ? "You Win!" : "CPU Wins!";
    else who = left.score > right.score ? "Left Wins!" : "Right Wins!";
    winnerEl.textContent = who;
    // Only the 1P ladder is a "record" — in 2P both paddles are humans, so
    // there's no consistent "you" to credit a win to.
    if (REC && players === 1) {
      REC.add(left.score > right.score ? "w" : "l");
      recordEl.textContent = "vs CPU · " + REC.text();
    } else if (REC) {
      recordEl.textContent = "vs CPU · " + REC.text();
    }
    gameover.classList.remove("hidden");
    document.body.classList.remove("playing");
    if (left.score > right.score) sounds.winLeft(); else sounds.winRight();
    return;
  }
  if (dir === -1) sounds.scoreLeft(); else sounds.scoreRight();
  resetBall(dir);
}

// Visual FX = inverse of the shared "reduce motion" toggle.
function fxOn() { return !(window.RM_ON && window.RM_ON()); }
// trailing copies opposite the motion direction → motion blur (longer & more
// visible at the head, fading out along the trail)
function motionGhosts(x, y, w, h, dx, dy) {
  if (!dx && !dy) return;
  const STEPS = 5;
  for (let k = 1; k <= STEPS; k++) {
    ctx.globalAlpha = 0.26 * (1 - (k - 1) / STEPS);
    ctx.fillRect(x - dx * k, y - dy * k, w, h);
  }
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  // center dashed line
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 4;
  ctx.setLineDash([12, 16]);
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.setLineDash([]);

  // scores
  ctx.fillStyle = "#fff";
  ctx.font = "48px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(left.score, W / 2 - 60, 60);
  ctx.fillText(right.score, W / 2 + 60, 60);

  // paddles + ball, with a slight motion blur when Visual FX is on
  ctx.fillStyle = "#fff";
  if (fxOn() && (state === "playing" || state === "countdown")) {
    motionGhosts(left.x, left.y, PADDLE_W, PADDLE_H, 0, left.dy || 0);
    motionGhosts(right.x, right.y, PADDLE_W, PADDLE_H, 0, right.dy || 0);
    motionGhosts(ball.x, ball.y, BALL_SIZE, BALL_SIZE, ball.vx, ball.vy);
  }
  ctx.fillRect(left.x, left.y, PADDLE_W, PADDLE_H);
  ctx.fillRect(right.x, right.y, PADDLE_W, PADDLE_H);
  ctx.fillRect(ball.x, ball.y, BALL_SIZE, BALL_SIZE);
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// Menu wiring
document.querySelectorAll("#menu .btn").forEach(b => {
  b.addEventListener("click", () => startGame(Number(b.dataset.mode)));
});
document.getElementById("again").addEventListener("click", () => {
  state = "menu";
  gameover.classList.add("hidden");
  menu.classList.remove("hidden");
  document.body.classList.remove("playing");
});

controlsEl.querySelector(".ctrl-win").textContent = "First to " + WIN_SCORE + " wins.";

loop();
