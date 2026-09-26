(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const setupEl = $("setup"), playEl = $("play"), resultEl = $("result");
  const RING_C = 2 * Math.PI * 92;
  $("ringFg").style.strokeDasharray = RING_C;

  // ---- the garden: every click plants something in the soil ----
  // What grows depends on your pace over the last second, so a fast run
  // fills the bed with sunflowers and a slow one with sprouts.
  const bedEl = $("bed");
  const FLOWERS = [["🌱", "🌿"], ["🌷", "🌼"], ["🌸", "🌺", "💐"], ["🌻", "🌹"]];
  const MAX_FLOWERS = 240;   // autoclickers exist; keep the newest, drop the oldest
  function plant() {
    const now = clickTimes[clickTimes.length - 1];
    let recent = 0;
    for (let i = clickTimes.length - 1; i >= 0 && now - clickTimes[i] < 1; i--) recent++;
    const kinds = FLOWERS[recent < 4 ? 0 : recent < 7 ? 1 : recent < 10 ? 2 : 3];
    const f = document.createElement("span");
    f.className = "flower";
    f.textContent = kinds[(Math.random() * kinds.length) | 0];
    // uniform over a disc, kept inside the rim
    const a = Math.random() * 2 * Math.PI, r = Math.sqrt(Math.random()) * 0.4;
    f.style.left = (50 + Math.cos(a) * r * 100).toFixed(1) + "%";
    f.style.top = (50 + Math.sin(a) * r * 100).toFixed(1) + "%";
    f.style.setProperty("--s", (0.8 + Math.random() * 0.45).toFixed(2));
    f.style.setProperty("--r", ((Math.random() - 0.5) * 26).toFixed(0) + "deg");
    bedEl.appendChild(f);
    if (bedEl.childElementCount > MAX_FLOWERS) bedEl.firstElementChild.remove();
  }

  let input = "mouse", dur = 5;
  let state = "setup";      // setup | ready | running | done
  let clicks = 0, startT = 0, raf = 0, clickTimes = [];
  let muted = false; // sound is muted globally via the shared top-right toggle (mute-toggle.js)

  // Device-aware wording: desktop = click / CPS, touch = tap / TPS.
  const TOUCH = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  const VERB = TOUCH ? "Tap" : "Click";   // capitalized
  const verb = TOUCH ? "tap" : "click";   // lowercase
  const METRIC = TOUCH ? "TPS" : "CPS";
  $("subtitle").textContent = "how fast can you " + verb + "?";
  $("kClicks").textContent = TOUCH ? "Taps" : "Clicks";
  $("kCps").textContent = METRIC;
  $("finalUnit").textContent = METRIC;

  // ---- audio ----
  let actx = null;
  function tick(freq) {
    if (muted) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = "square"; o.frequency.value = freq || 1100;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.04);
    } catch (e) {}
  }
  function chord(seq) { if (muted) return; seq.forEach((f, i) => setTimeout(() => tick(f), i * 70)); }
  // A short rising blip for picking a setup option (Input / Duration).
  function selectSound() {
    if (muted) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(800, t + 0.07);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.14);
    } catch (e) {}
  }

  const bestKey = () => "clicktap_best_" + input + "_" + dur;
  const getBest = () => parseFloat(localStorage.getItem(bestKey()) || "0") || 0;
  // one-time migration of saved bests from the pre-rename prefix (folder was "click-rush")
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.indexOf("clickrush_best_") === 0) {
        const nk = "clicktap_best_" + k.slice("clickrush_best_".length);
        if (localStorage.getItem(nk) == null) localStorage.setItem(nk, localStorage.getItem(k));
        localStorage.removeItem(k);
      }
    }
  } catch (e) {}
  function showSetupBest() {
    const b = getBest();
    $("setupBest").innerHTML = b > 0 ? "Best for " + dur + "s: <b>" + b.toFixed(3) + " " + METRIC + "</b>" : "No record yet for this duration";
  }

  // ---- selection ----
  $("durChoices").addEventListener("click", (e) => {
    const c = e.target.closest(".choice"); if (!c) return;
    dur = parseInt(c.dataset.dur, 10);
    [...$("durChoices").children].forEach((x) => x.classList.toggle("sel", x === c));
    selectSound();
    showSetupBest();
  });

  // ---- flow ----
  function show(sec) { [setupEl, playEl, resultEl].forEach((s) => (s.hidden = s !== sec)); }

  function beginTest() {
    state = "ready"; clicks = 0; clickTimes = [];
    $("vTime").textContent = dur.toFixed(1); $("vClicks").textContent = "0"; $("vCps").textContent = "0.0";
    $("ringFg").style.strokeDashoffset = "0";
    $("padCount").textContent = VERB.toUpperCase();
    $("padSub").textContent = "to start";
    $("hint").textContent = VERB + " the soil as fast as you can!";
    bedEl.replaceChildren();
    show(playEl);
  }

  function registerInput() {
    if (state === "ready") { state = "running"; startT = performance.now(); $("padSub").textContent = ""; tickFrame(); }
    if (state !== "running") return;
    clicks++;
    clickTimes.push((performance.now() - startT) / 1000);
    $("padCount").textContent = clicks;
    $("vClicks").textContent = clicks;
    plant();
    pop(); tick(900 + Math.random() * 300);
  }
  function pop() {
    const p = $("pad"); p.classList.remove("pop"); void p.offsetWidth; p.classList.add("pop");
  }

  function tickFrame() {
    cancelAnimationFrame(raf);
    const step = () => {
      const elapsed = (performance.now() - startT) / 1000;
      const remain = Math.max(0, dur - elapsed);
      $("vTime").textContent = remain.toFixed(1);
      $("vCps").textContent = (clicks / Math.max(elapsed, 0.001)).toFixed(1);
      $("ringFg").style.strokeDashoffset = RING_C * Math.min(1, elapsed / dur);
      if (remain <= 0) { finish(); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function finish() {
    cancelAnimationFrame(raf);
    state = "done";
    const cps = clicks / dur;
    $("finalCps").textContent = cps.toFixed(3);
    const r = rating(cps); $("rating").textContent = r.t; $("rating").style.color = r.c;
    $("summary").innerHTML =
      '<span class="chip"><b>' + clicks + '</b> ' + verb + 's</span>' +
      '<span class="chip">' + dur + 's</span>';
    renderGraph();
    $("harvest").innerHTML = bedEl.innerHTML;   // the garden you grew, replanted on the results card
    const prev = getBest();
    if (cps > prev) { localStorage.setItem(bestKey(), cps.toFixed(4)); $("newBest").textContent = "★ NEW BEST!"; chord([660, 880, 1175, 1568]); }
    else { $("newBest").textContent = prev > 0 ? "Best: " + prev.toFixed(3) + " " + METRIC : ""; chord([523, 659]); }
    show(resultEl);
  }
  function renderGraph() {
    const N = 100, sigma = 0.5;            // Gaussian kernel — a smooth click-rate curve
    const finalCps = clicks / dur;
    const inv = 1 / (sigma * Math.sqrt(2 * Math.PI)), s2 = 2 * sigma * sigma, cut = sigma * 4;
    // Mirror clicks across both ends so the curve stays level at the edges
    // (a raw kernel under-counts near 0 and dur where part of it spills off-range).
    const cs = [];
    for (const ct of clickTimes) cs.push(ct, -ct, 2 * dur - ct);
    const pts = []; let peak = 0;
    for (let i = 0; i <= N; i++) {
      const t = (dur * i) / N;
      let r = 0;
      for (const c of cs) { const d = t - c; if (d > -cut && d < cut) r += inv * Math.exp(-(d * d) / s2); }
      if (r > peak) peak = r;
      pts.push([t, r]);
    }
    // "nice" round axis scales
    const niceStep = (range) => { const raw = range / 4, mag = Math.pow(10, Math.floor(Math.log10(raw || 1))), n = raw / mag; return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag; };
    const step = niceStep(Math.max(4, peak));
    const niceMax = step * Math.max(1, Math.ceil((peak * 1.05) / step));
    const tStep = dur <= 5 ? 1 : 2;        // x ticks every 1s (3/5s) or 2s (10s)
    const VW = 300, VH = 134, PL = 30, PR = 12, PT = 10, yBase = 98, midY = (PT + yBase) / 2;
    const X = (t) => PL + (t / dur) * (VW - PL - PR);
    const Y = (c) => PT + (1 - c / niceMax) * (yBase - PT);
    const ps = pts.map((p) => X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1));
    const line = "M" + ps.join(" L");
    const area = "M" + X(0).toFixed(1) + "," + yBase + " L" + ps.join(" L") + " L" + X(dur).toFixed(1) + "," + yBase + " Z";
    let grid = "";                          // horizontal gridlines + CPS tick labels
    for (let v = 0; v <= niceMax + 1e-6; v += step) {
      const y = Y(v).toFixed(1);
      grid += '<line x1="' + PL + '" y1="' + y + '" x2="' + (VW - PR) + '" y2="' + y + '" stroke="' + (v === 0 ? "#c9bd9c" : "#e8dfc6") + '"/>' +
              '<text x="' + (PL - 5) + '" y="' + (Y(v) + 2.8).toFixed(1) + '" text-anchor="end" fill="#7c7458" font-size="8">' + v + '</text>';
    }
    let xticks = "";                        // vertical gridlines + second tick labels
    for (let tt = 0; tt <= dur + 1e-6; tt += tStep) {
      const x = X(tt).toFixed(1);
      xticks += '<line x1="' + x + '" y1="' + PT + '" x2="' + x + '" y2="' + yBase + '" stroke="#efe7d2"/>' +
                '<text x="' + x + '" y="' + (yBase + 11) + '" text-anchor="middle" fill="#7c7458" font-size="8">' + tt + '</text>';
    }
    const yAvg = Y(finalCps).toFixed(1);
    $("graph").innerHTML =
      '<div class="gtitle">' + verb + 's per second (' + METRIC + ') over time</div>' +
      '<svg class="lg" viewBox="0 0 ' + VW + ' ' + VH + '">' +
        '<defs><linearGradient id="lgF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(79,154,51,.32)"/><stop offset="1" stop-color="rgba(79,154,51,0)"/></linearGradient></defs>' +
        grid + xticks +
        '<path d="' + area + '" fill="url(#lgF)"/>' +
        '<line x1="' + PL + '" y1="' + yAvg + '" x2="' + (VW - PR) + '" y2="' + yAvg + '" stroke="#2b7fc2" stroke-width="1" stroke-dasharray="4 4" opacity=".75"/>' +
        '<path d="' + line + '" fill="none" stroke="#3f8f2f" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<text transform="rotate(-90 9 ' + midY + ')" x="9" y="' + midY + '" text-anchor="middle" fill="#6f7a5e" font-size="8" font-weight="700">' + METRIC + '</text>' +
        '<text x="' + ((PL + VW - PR) / 2) + '" y="' + (yBase + 23) + '" text-anchor="middle" fill="#6f7a5e" font-size="8" font-weight="700">Time (s)</text>' +
      '</svg>' +
      '<div class="cap">peak <b>' + peak.toFixed(1) + '</b> ' + METRIC + ' &nbsp;·&nbsp; avg <b>' + finalCps.toFixed(1) + '</b> ' + METRIC + '</div>';
  }
  function rating(c) {
    if (c < 3) return { t: "Warming up", c: "var(--muted)" };
    if (c < 5) return { t: "Casual", c: "var(--text)" };
    if (c < 7) return { t: "Quick fingers", c: "var(--cyan)" };
    if (c < 9) return { t: "Fast!", c: "var(--lime)" };
    if (c < 11) return { t: "Lightning ⚡", c: "var(--warn)" };
    if (c < 14) return { t: "Insane 🔥", c: "var(--bad)" };
    return { t: "Autoclicker? 🤖", c: "var(--bad)" };
  }

  function quit() { cancelAnimationFrame(raf); state = "setup"; show(setupEl); showSetupBest(); }

  // ---- input wiring ----
  // Count clicks only within the visible circle pad (not the square corners).
  $("pad").addEventListener("pointerdown", (e) => {
    if (input !== "mouse") return;
    if (state !== "ready" && state !== "running") return;
    const r = $("pad").getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) > r.width / 2) return; // outside the circle → ignore
    e.preventDefault();
    registerInput();
  });
  // Esc still bails out of a run; there's no keyboard play mode anymore.
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state !== "setup") quit();
  });

  $("startBtn").addEventListener("click", () => { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} beginTest(); });
  $("quitBtn").addEventListener("click", quit);
  $("againBtn").addEventListener("click", beginTest);
  $("settingsBtn").addEventListener("click", quit);

  showSetupBest();
})();
