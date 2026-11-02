/* =====================================================================
   Patchword: a word hunt on a quilt block. Sixteen patches, a letter
   sewn on each; drag from patch to patch (across, down or corner to
   corner, each patch once) to spell words of three letters or more
   before the tape measure runs out. Or type a word: the stitching finds
   its way across the block, if there is one. Quick stitch and Long seam
   deal a new block each time; the Daily block is the same for everyone
   that day, and only the first go at it counts.
   The rules (words, dealing, paths, points) are in rules.js.
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var R = window.PatchwordRules;
  function fx() { return !(window.RM_ON && window.RM_ON()); }
  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };

  var MODES = {
    quick: { name: "Quick stitch", time: 90 },
    long: { name: "Long seam", time: 180 },
    daily: { name: "Daily block", time: 90 }
  };
  var mode = store.get("patchword_mode", "quick"); if (!MODES[mode]) mode = "quick";
  var bests = {};
  Object.keys(MODES).forEach(function (m) { bests[m] = window.GameShell ? GameShell.best("patchword_best_" + m, { higher: true }) : null; });

  // ---- the daily block ------------------------------------------------------
  // The same block for everyone on the same day (No. 1 was 31 October 2026).
  // The first go is the one that counts: it's written down the moment it
  // starts and as each word is stitched, so leaving part way or starting
  // over keeps what it had, and later goes are just for fun.
  var DAY0 = Date.UTC(2026, 9, 31);
  function today() {
    var d = new Date();
    var n = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - DAY0) / 86400000) + 1;
    var mm = ("0" + (d.getMonth() + 1)).slice(-2), dd = ("0" + d.getDate()).slice(-2);
    return { n: n, ymd: d.getFullYear() + "-" + mm + "-" + dd };
  }
  function readDaily() {
    var t = today();
    try {
      var d = JSON.parse(store.get("patchword_daily", "null"));
      if (d && d.ymd === t.ymd) return d;
    } catch (e) {}
    return { ymd: t.ymd, n: t.n, score: 0, words: 0, longest: "", played: false, done: false };
  }
  function writeDaily(d) { store.set("patchword_daily", JSON.stringify(d)); }

  // ---- the state of play ---------------------------------------------------------
  var state = "menu", tiles = [], prints = [], words = {}, found = [], foundSet = {}, score = 0, timeLeft = 0;
  var dailyCounts = false, dailyDay = "", overAt = 0, OVER_WAIT = 900, held = false, lastTick = -1, runBest = 0;
  // the word being spelled: its patches (null: typed letters with no path),
  // how it came (by "tap" / drag, or "type"), and the letters typed
  var path = [], source = null, typed = "", paths = [];   // (paths: every place the letters typed are found)
  // a moment's word on what just happened to a word: { cls, letters, note, pts, until }
  var cue = null;

  function deal(rnd) {
    var b = R.deal(rnd);
    tiles = b.tiles; words = b.words;
    // a print for each patch, all sixteen different
    prints = [];
    for (var i = 0; i < 16; i++) prints.push(i);
    for (var j = 15; j > 0; j--) { var k = Math.floor(rnd() * (j + 1)), t = prints[j]; prints[j] = prints[k]; prints[k] = t; }
    buildPatches();
  }

  function startRound(m) {
    if (m && MODES[m]) mode = m;
    store.set("patchword_mode", mode);
    audio();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    dailyCounts = false;
    if (mode === "daily") {
      var t = today(), d = readDaily();
      if (!d.played) { d.played = true; writeDaily(d); dailyCounts = true; dailyDay = d.ymd; }
      deal(R.mulberry(((t.n * 2654435761) >>> 0) ^ 0x51D7));
    } else deal(Math.random);
    found = []; foundSet = {}; score = 0; cue = null; lastTick = -1;
    runBest = bests[mode] ? bests[mode].get() : 0;
    clearWord();
    timeLeft = MODES[mode].time;
    state = "play";
    $("menu").hidden = true; $("over").hidden = true; $("hud").hidden = false; $("tissue").hidden = false; $("keys").hidden = false;
    paintFound();
    layout(); hud(); render();
  }
  function toMenu() {
    state = "menu"; clearWord(); cue = null;
    $("over").hidden = true; $("hud").hidden = true; $("tissue").hidden = true; $("keys").hidden = true; $("menu").hidden = false;
    paintMenu(); layout(); render();
  }

  function hud() {
    var s = Math.max(0, Math.ceil(timeLeft));
    $("clock").textContent = Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
    // the tape reels in as the time goes
    $("blade").style.transform = "scaleX(" + Math.max(0, Math.min(1, timeLeft / MODES[mode].time)).toFixed(4) + ")";
    $("tape").classList.toggle("low", state === "play" && timeLeft <= 10);
    $("score").textContent = score;
    $("count").textContent = found.length;
  }

  // ---- the word being spelled ------------------------------------------------------
  function clearWord() { path = []; paths = []; source = null; typed = ""; dragging = false; tapSubmit = false; }
  function letters() {
    if (source === "type") return typed;
    return path && path.length ? R.spell(tiles, path) : "";
  }
  function typeLetter(ch) {
    if (source !== "type") { path = []; typed = ""; source = "type"; }
    if (typed.length >= 20) return;
    cue = null;
    typed += ch;
    retrace();
    if (path) pluck(path.length); else sfxSoft();
    render();
  }
  function unpick() {
    cue = null;
    if (source === "type") {
      typed = typed.slice(0, -1);
      retrace();
      if (!typed) { source = null; path = []; }
    } else if (path.length) {
      path.pop();
      if (!path.length) source = null;
    }
    render();
  }

  // the letters typed, found on the block: every place they are (each lit,
  // each with its thread), not one picked of several; the word is the same
  // whichever is meant, so any of them stitches it
  function retrace() {
    paths = R.pathsFor(tiles, typed);
    path = paths.length ? paths[0] : null;
  }
  // (the patches of every path spelling the word, each at its earliest place in one: the order they puff in)
  function cellsOf(list) {
    var at = {};
    list.forEach(function (p) { p.forEach(function (i, k) { if (at[i] == null || k < at[i]) at[i] = k; }); });
    return Object.keys(at).map(Number).sort(function (a, b) { return at[a] - at[b]; }).map(function (i) { return [i, at[i]]; });
  }

  // Stitch the word spelled, if it is one: its points, its place on the
  // tissue. Says what happened ("ok", "dup", "no", "short", "nopath"), or
  // null when there was nothing to stitch.
  function submit() {
    if (state !== "play" || (P && P.isPaused())) return null;
    var w = letters(), p = path, out;
    if (!w) { clearWord(); render(); return null; }
    if (!p || (source === "type" && R.spell(tiles, p) !== w) || !R.fair(p)) out = refuse(w, "nopath", "no path for that");
    else if (p.length < 2 && w.length < 3) out = null;                       // a patch tapped twice: nothing
    else if (w.length < 3) out = refuse(w, "short", "three letters at least");
    else if (foundSet[w]) { out = refuse(w, "dup", "stitched already"); flashFound(w); }
    else if (!R.isWord(w)) out = refuse(w, "no", "not a word");
    else out = accept(w, p, source === "type" && paths.length > 1 ? paths : null);
    clearWord();
    render();
    return out;
  }
  function refuse(w, kind, note) {
    cue = { cls: kind === "dup" ? "dup" : kind === "nopath" ? "no nopath" : "no", letters: w, note: note, until: performance.now() + 1100 };
    if (kind === "dup") sfxDup(); else sfxNo();
    if (fx() && kind !== "dup") { var b = $("block"); b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); }
    return kind;
  }
  function accept(w, p, all) {
    var pts = R.points(w);
    found.push(w); foundSet[w] = true; score += pts;
    // (a first go still on the clock at midnight stops counting: the new
    // day's block is another one, its first go still to come)
    var d = mode === "daily" && dailyCounts ? readDaily() : null;
    if (d && d.ymd !== dailyDay) { dailyCounts = false; d = null; }
    // a best is kept the moment it's passed (the Daily's only on its first go)
    var b = bests[mode];
    if (b && (mode !== "daily" || dailyCounts)) b.submit(score);
    if (d) {
      d.score = score; d.words = found.length; d.longest = longestWord();
      writeDaily(d);
    }
    cue = { cls: "ok", letters: w, pts: "+" + pts, until: performance.now() + 1100 };
    sfxOk(pts);
    // the patches in it puff up one after another (Visual FX on)
    var els = document.querySelectorAll(".patch");
    Array.prototype.forEach.call(els, function (el) { el.classList.remove("got"); });
    if (fx()) {
      void $("patches").offsetWidth;
      cellsOf(all || [p]).forEach(function (c) { els[c[0]].style.setProperty("--k", c[1]); els[c[0]].classList.add("got"); });
    }
    paintFound(w);
    hud();
    return "ok";
  }
  function longestWord() {
    var best = "";
    found.forEach(function (w) { if (w.length > best.length || (w.length === best.length && w < best)) best = w; });
    return best;
  }

  // ---- drawing ---------------------------------------------------------------------
  function buildPatches() {
    var box = $("patches");
    box.innerHTML = "";
    tiles.forEach(function (t, i) {
      var el = document.createElement("div");
      el.className = "patch print-" + prints[i];
      var felt = document.createElement("span");
      felt.className = "felt";
      if (t === "qu") felt.innerHTML = "Q<small>u</small>"; else felt.textContent = t;
      el.appendChild(felt);
      box.appendChild(el);
    });
  }
  // what the word spelled so far is: "ok" a word not yet stitched, "dup"
  // one stitched already, "" anything else
  function verdict(w) {
    if (!w || w.length < 3 || !path) return "";
    return foundSet[w] ? "dup" : R.isWord(w) ? "ok" : "";
  }
  function render() {
    var on = {}, p = path || [], all = source === "type" && paths.length > 1 ? paths : p.length ? [p] : [];
    all.forEach(function (q) { q.forEach(function (i) { on[i] = true; }); });
    var els = document.querySelectorAll(".patch");
    for (var i = 0; i < els.length; i++) els[i].classList.toggle("on", !!on[i]);
    var w = letters(), v = cue ? "" : verdict(w), block = $("block");
    block.classList.toggle("ok", v === "ok");
    block.classList.toggle("dup", v === "dup");
    drawThread(all);
    // the line under the block: the word being spelled, or what just
    // happened to the last one
    var line = $("word"), html = "", cls = "word";
    if (cue && performance.now() < cue.until) {
      cls += " " + cue.cls;
      html = '<span class="letters">' + esc(cue.letters) + "</span>" + (cue.pts ? '<span class="pts">' + cue.pts + "</span>" : "") + (cue.note ? '<span class="note">' + cue.note + "</span>" : "");
    } else if (w) {
      cue = null;
      if (!path) { cls += " no nopath"; html = '<span class="letters">' + esc(w) + '</span><span class="note">no path</span>'; }
      else {
        if (v) cls += " " + v;
        html = '<span class="letters">' + esc(w) + "</span>" + (v === "ok" ? '<span class="pts">+' + R.points(w) + "</span>" : v === "dup" ? '<span class="note">stitched already</span>' : "");
      }
    } else cue = null;
    if (line.className !== cls) line.className = cls;
    if (line.innerHTML !== html) line.innerHTML = html;
  }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  // the red thread from felt to felt, a running stitch with its shadow;
  // a knot where it starts (one for each path the letters typed are found along)
  function drawThread(list) {
    var svg = $("thread"), Pz = patchSize(), unders = "", overs = "", knots = "";
    var wd = Math.max(3, Pz * 0.07), dash = (Pz * 0.16).toFixed(1) + " " + (Pz * 0.1).toFixed(1);
    // (every shadow, then every thread, then every knot: no path's shadow over another's thread)
    list.forEach(function (p) {
      if (!p.length) return;
      var pts = p.map(function (i) { return ((i % 4 + 0.5) * Pz).toFixed(1) + "," + ((Math.floor(i / 4) + 0.5) * Pz).toFixed(1); }).join(" ");
      var x0 = (p[0] % 4 + 0.5) * Pz, y0 = (Math.floor(p[0] / 4) + 0.5) * Pz;
      unders += '<polyline class="under" points="' + pts + '" stroke-width="' + (wd * 1.3).toFixed(1) + '" stroke-dasharray="' + dash + '" transform="translate(1 2)"/>';
      overs += '<polyline class="over" points="' + pts + '" stroke-width="' + wd.toFixed(1) + '" stroke-dasharray="' + dash + '"/>';
      knots += '<circle class="knot" cx="' + x0.toFixed(1) + '" cy="' + y0.toFixed(1) + '" r="' + (wd * 0.9).toFixed(1) + '"/>';
    });
    var out = unders + overs + knots;
    if (svg.innerHTML !== out) svg.innerHTML = out;
  }
  function patchSize() { return $("patches").clientWidth / 4 || 1; }

  // the words stitched, newest first, on the tissue
  function paintFound(added) {
    var ol = $("found");
    if (!found.length) { ol.innerHTML = '<li class="none">nothing stitched yet</li>'; return; }
    var html = "";
    for (var i = found.length - 1; i >= 0; i--) {
      var w = found[i];
      html += '<li data-w="' + w + '"' + (w === added ? ' class="new"' : "") + "><span>" + w + "</span><b>" + R.points(w) + "</b></li>";
    }
    ol.innerHTML = html;
    $("tissue").scrollTop = 0;
  }
  function flashFound(w) {
    var li = $("found").querySelector('li[data-w="' + w + '"]');
    if (!li) return;
    li.classList.add("flash");
    setTimeout(function () { li.classList.remove("flash"); }, 900);
  }

  // ---- fitting it all on the screen --------------------------------------------------
  // The block as big as the screen allows, the tissue beside it where
  // there's room (a laptop) and under it where there isn't (a phone).
  function layout() {
    var de = document.documentElement, vw = de.clientWidth, vh = window.innerHeight;
    var small = vw <= 520, top = small ? 54 : 58, gap = small ? 6 : 8, bottom = 8;
    var keys = $("keys"), table = $("table");
    var hudH = 40, wordH = $("word").offsetHeight || 40;
    var listW = Math.round(Math.max(190, Math.min(260, vw * 0.22)));
    // the hint under it all, as tall as it wraps to at the width it gets
    function keysH(w) { if (keys.hidden) return 0; keys.style.maxWidth = w + "px"; return gap + keys.offsetHeight; }
    // the block's size with the tissue beside it (wide) or under it, and
    // the height left over for the tissue
    function fit(wide) {
      var cols = wide ? listW + 16 : 0, B = 560;
      for (var pass = 0; pass < 2; pass++) {
        var w = wide ? B + cols : Math.max(B, Math.min(vw - 24, 420));
        var rows = vh - top - bottom - hudH - gap - wordH - gap - keysH(w);
        B = Math.floor(Math.min(560, vw - 24 - cols, wide ? rows : rows - gap - 72));
      }
      return B;
    }
    var bn = fit(false), bw = vw >= 600 ? fit(true) : 0, wide = bw >= bn, B = Math.max(150, wide ? bw : bn);
    var W = wide ? B + 16 + listW : B;
    var kh = keysH(wide ? W : Math.max(B, Math.min(vw - 24, 420)));
    var bind = B >= 300 ? 10 : 7;
    var L = wide ? B + gap + wordH : Math.max(72, vh - top - bottom - hudH - gap - B - gap - wordH - gap - kh);
    table.style.setProperty("--W", W + "px");
    table.style.setProperty("--B", B + "px");
    table.style.setProperty("--bind", bind + "px");
    table.style.setProperty("--P", ((B - 2 * bind) / 4) + "px");
    table.style.setProperty("--T", (wide ? listW : B) + "px");
    table.style.setProperty("--L", L + "px");
    $("work").classList.toggle("wide", wide);
    rulers();
    render();
  }
  // the mat's ruler numbers along its top and left edges, one an inch
  function rulers() {
    var box = $("rulers"), w = window.innerWidth, h = window.innerHeight, html = "";
    for (var x = 64, n = 1; x < w; x += 64, n++) html += '<span style="left:' + (x + 3) + 'px;top:3px">' + n + "</span>";
    for (var y = 64, m = 1; y < h; y += 64, m++) html += '<span style="left:3px;top:' + (y + 3) + 'px">' + m + "</span>";
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  // ---- sound ------------------------------------------------------------------------------
  var actx = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) try { actx = new AC(); } catch (e) {} }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(f, dur, type, vol, delay) {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime + (delay || 0), o = ac.createOscillator(), gn = ac.createGain();
    o.type = type || "sine"; o.frequency.value = f;
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.006); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  // a needle through cotton: a soft pluck, a step higher for each patch
  function pluck(n) { tone(330 * Math.pow(2, Math.min(n, 14) / 12), 0.08, "triangle", 0.045); }
  function sfxSoft() { tone(196, 0.06, "triangle", 0.03); }
  function sfxOk(pts) {
    var notes = [659, 784, 988, 1175, 1319], k = pts >= 11 ? 5 : pts >= 5 ? 4 : pts >= 2 ? 3 : 2;
    for (var i = 0; i < k; i++) tone(notes[i], 0.16, "sine", 0.05, i * 0.06);
  }
  function sfxDup() { tone(392, 0.07, "sine", 0.045); tone(392, 0.07, "sine", 0.045, 0.1); }
  function sfxNo() { tone(147, 0.16, "triangle", 0.07); }
  function sfxTick() { tone(1250, 0.03, "square", 0.018); }
  // the scissors at the end: two snips, then a little run down
  function sfxEnd() {
    var ac = audio(); if (!ac) return;
    for (var s = 0; s < 2; s++) {
      var len = Math.floor(ac.sampleRate * 0.05), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      var src = ac.createBufferSource(), hp = ac.createBiquadFilter(), gn = ac.createGain();
      src.buffer = buf; hp.type = "highpass"; hp.frequency.value = 2500; gn.gain.value = 0.25;
      src.connect(hp); hp.connect(gn); gn.connect(ac.destination); src.start(ac.currentTime + s * 0.13);
    }
    [784, 659, 523].forEach(function (f, i) { tone(f, 0.35, "sine", 0.05, 0.3 + i * 0.12); });
  }

  // ---- the round's end ---------------------------------------------------------------------
  function finish() {
    if (state !== "play") return;
    state = "over"; timeLeft = 0; clearWord(); cue = null;
    if (mode === "daily" && dailyCounts) { var d = readDaily(); if (d.ymd === dailyDay) { d.done = true; writeDaily(d); } }
    hud(); render();
    sfxEnd();
    var b = bests[mode], counts = mode !== "daily" || dailyCounts, rec = readDaily();
    $("over-title").textContent = mode === "daily" ? "Daily block No. " + rec.n : MODES[mode].name + ": done";
    $("over-score").textContent = score + (score === 1 ? " point" : " points");
    var long = longestWord();
    $("over-stats").textContent = found.length + (found.length === 1 ? " word" : " words") + (long ? " · longest " + long.toUpperCase() : "");
    var bestEl = $("over-best"), best = b ? b.get() : 0;
    if (!counts) {
      bestEl.className = "best";
      bestEl.textContent = "today's block counted your first go: " + rec.score + (rec.score === 1 ? " point" : " points");
    } else if (score > 0 && score >= best && score > runBest) {
      bestEl.className = "best record";
      bestEl.textContent = "a new best for " + MODES[mode].name.toLowerCase();
    } else {
      bestEl.className = "best";
      bestEl.textContent = best ? "best " + best : "no best yet";
    }
    $("again").textContent = mode === "daily" ? "Once more, for fun" : "Sew again";
    $("share").hidden = mode !== "daily";
    // the words stitched, the best first, and the everyday ones missed, longest first
    var got = found.slice().sort(function (a, c) { return R.points(c) - R.points(a) || (a < c ? -1 : 1); });
    $("got-head").textContent = "stitched · " + found.length;
    $("got").innerHTML = got.length ? got.map(function (w) { return "<li>" + w + "<b>" + R.points(w) + "</b></li>"; }).join("") : "<li>nothing this time</li>";
    var missed = Object.keys(words).filter(function (w) { return !foundSet[w] && R.isEveryday(w); })
      .sort(function (a, c) { return c.length - a.length || (a < c ? -1 : 1); });
    // (all of them: the card scrolls, its buttons above the lists)
    $("missed-head").textContent = missed.length ? "everyday words missed · " + missed.length : "every everyday word found!";
    $("missed").innerHTML = missed.map(function (w) { return "<li>" + w + "<b>" + R.points(w) + "</b></li>"; }).join("");
    $("missed").hidden = !missed.length;
    setTimeout(function () {
      if (state !== "over") return;
      $("hud").hidden = true; $("tissue").hidden = true; $("keys").hidden = true;
      $("over").hidden = false;
      $("over").scrollTop = 0;
      overAt = performance.now();
    }, 500);
  }
  function shareDaily() {
    var d = readDaily();
    var text = "Patchword · Daily block No. " + d.n + " (" + d.ymd + ")\n" +
      d.score + (d.score === 1 ? " point" : " points") + " · " + d.words + (d.words === 1 ? " word" : " words") + (d.longest ? " · longest " + d.longest.toUpperCase() : "") + " 🧵\n" +
      location.origin + location.pathname;
    function copied() { $("share").textContent = "Copied!"; setTimeout(function () { $("share").textContent = "Share"; }, 1400); }
    function fallback() { if (window.GameShell) GameShell.copyBox({ title: "Copy your result", text: text }); else try { window.prompt("Copy your result:", text); } catch (e) {} }
    if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
      navigator.share({ text: text }).catch(function (e2) { if (!e2 || e2.name !== "AbortError") fallback(); });
      return text;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(copied, fallback);
    else fallback();
    return text;
  }

  // ---- the loop ---------------------------------------------------------------------------
  function update(dt) {
    if (state !== "play") return;
    timeLeft -= dt;
    var s = Math.ceil(timeLeft);
    if (s <= 10 && s > 0 && s !== lastTick) { lastTick = s; sfxTick(); }
    if (timeLeft <= 0) { timeLeft = 0; hud(); finish(); return; }
    hud();
  }
  var P = window.GameShell ? GameShell.pausable({
    // \ pauses (beside the [ and ] of sound and Visual FX): every letter is
    // the word's, and Esc is the way out
    keys: ["\\"],
    canPause: function () { return state === "play"; },
    hold: true,
    // paused, the block turns over: no looking for words with the clock stopped
    onChange: function (on) { document.body.classList.toggle("paused", on); if (on) { clearWord(); render(); } },
    restart: function () { startRound(mode); },
    menu: toMenu
  }) : { isPaused: function () { return false; } };
  if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave({
    active: function () { return state === "play" && (found.length > 0 || dailyCounts); },
    text: function () { return dailyCounts ? "Only the first go at today's block counts, and this is it: it keeps what it has so far." : "The block in progress will be lost."; },
    pausable: P
  });
  var last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
    if (!P.isPaused() && !held) update(dt);
    if (cue && now >= cue.until) { cue = null; render(); }
  }

  // ---- input: dragging or tapping across the patches ----------------------------------------------
  // Past the first patch, the pointer has to come within HIT of a patch's
  // middle (a share of its width) to take it, so a drag corner to corner
  // doesn't catch the patches either side.
  var HIT = 0.4;
  var dragging = false, moved = false, tapSubmit = false, pointerId = null, lastPt = null;
  function hit(x, y, first) {
    var r = $("patches").getBoundingClientRect(), Pz = r.width / 4;
    var px = x - r.left, py = y - r.top, c = Math.floor(px / Pz), rr = Math.floor(py / Pz);
    if (c < 0 || c > 3 || rr < 0 || rr > 3) return -1;
    if (!first && Math.hypot(px - (c + 0.5) * Pz, py - (rr + 0.5) * Pz) > HIT * Pz) return -1;
    return rr * 4 + c;
  }
  function over(i) {
    var n = path.length, lastI = path[n - 1];
    if (i === lastI) return;
    // back onto the patch before: unpicked
    if (n >= 2 && i === path[n - 2]) { path.pop(); moved = true; tapSubmit = false; render(); return; }
    if (path.indexOf(i) >= 0 || !R.adjacent(lastI, i)) return;
    path.push(i); moved = true; tapSubmit = false;
    pluck(path.length);
    render();
  }
  var block = $("block");
  block.addEventListener("pointerdown", function (e) {
    if (state !== "play" || P.isPaused() || (e.button != null && e.button > 0)) return;
    e.preventDefault();
    var i = hit(e.clientX, e.clientY, true); if (i < 0) return;
    audio();
    if (source === "type" || !path) { path = []; typed = ""; source = null; }
    cue = null; moved = false; tapSubmit = false;
    var n = path.length;
    // tapped one by one: the last patch again stitches the word, one beside it carries on
    if (source === "tap" && n && i === path[n - 1]) tapSubmit = true;
    else if (source === "tap" && n && R.adjacent(path[n - 1], i) && path.indexOf(i) < 0) { path.push(i); pluck(path.length); }
    else { path = [i]; pluck(1); }
    source = "tap";
    dragging = true; pointerId = e.pointerId; lastPt = { x: e.clientX, y: e.clientY };
    try { block.setPointerCapture(e.pointerId); } catch (err) {}
    render();
  });
  block.addEventListener("pointermove", function (e) {
    if (!dragging || e.pointerId !== pointerId || state !== "play" || P.isPaused()) return;
    e.preventDefault();
    // every step of the way since the last move, so a quick flick can't skip a patch
    var x0 = lastPt.x, y0 = lastPt.y, x1 = e.clientX, y1 = e.clientY;
    var steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (patchSize() / 6)));
    for (var s = 1; s <= steps; s++) {
      var i = hit(x0 + (x1 - x0) * s / steps, y0 + (y1 - y0) * s / steps, false);
      if (i >= 0) over(i);
    }
    lastPt = { x: x1, y: y1 };
  });
  function release(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    if (moved || tapSubmit) submit();
  }
  block.addEventListener("pointerup", release);
  block.addEventListener("pointercancel", function (e) {
    if (!dragging || e.pointerId !== pointerId) return;
    clearWord(); render();
  });
  block.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  // a tap anywhere off the block lets go of a word being tapped out
  document.addEventListener("pointerdown", function (e) {
    if (state === "play" && source === "tap" && !dragging && !block.contains(e.target)) { clearWord(); render(); }
  });

  // ---- input: typing ------------------------------------------------------------------------------
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !e.key) return;
    if (state !== "play" || P.isPaused()) return;
    if (/^[a-zA-Z]$/.test(e.key)) { e.preventDefault(); if (!e.repeat && !dragging) typeLetter(e.key.toLowerCase()); }
    else if (e.key === "Backspace") { e.preventDefault(); if (!dragging) unpick(); }   // (held, it unpicks letter after letter)
    else if (e.key === "Enter") { e.preventDefault(); if (!e.repeat && !dragging) submit(); }
  });

  // ---- the menu ------------------------------------------------------------------------------------
  function paintMenu() {
    document.querySelectorAll("#pick-mode button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === mode); });
    var d = readDaily();
    $("daily-small").textContent = d.played ? "today's counted: " + d.score + (d.score === 1 ? " point" : " points") + "; again for fun" : "today's block, the same for everyone";
    var parts = [];
    Object.keys(MODES).forEach(function (m) { if (bests[m] && bests[m].get()) parts.push(MODES[m].name.toLowerCase() + " " + bests[m].get()); });
    $("bests").textContent = parts.length ? "best: " + parts.join(" · ") : "no blocks sewn yet";
  }
  document.querySelectorAll("#pick-mode button").forEach(function (b) {
    b.addEventListener("click", function () { mode = b.dataset.v; store.set("patchword_mode", mode); paintMenu(); });
    b.addEventListener("mousedown", function (e) { e.preventDefault(); });
  });
  $("play").addEventListener("click", function () { startRound(mode); });
  $("again").addEventListener("click", function () { startRound(mode); });
  $("to-menu").addEventListener("click", toMenu);
  $("share").addEventListener("click", shareDaily);
  if (window.GameShell && GameShell.menuKeys) {
    GameShell.menuKeys({ active: function () { return state === "menu"; }, groups: ["#pick-mode button"], start: "#play", space: true });
    GameShell.menuKeys({ active: function () { return state === "over" && !$("over").hidden && performance.now() - overAt > OVER_WAIT; },
      groups: [{ sel: "#to-menu", keys: ["backspace"] }, { sel: "#share", keys: ["s"] }], start: "#again", space: true });
  }

  window.addEventListener("resize", layout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  // a block behind the menu, so the table isn't bare
  deal(R.mulberry(1031));
  toMenu();
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });

  // test hooks: the Playwright suite plays through these
  window.Patchword = {
    state: function () { return state; },
    mode: function () { return mode; },
    score: function () { return score; },
    found: function () { return found.slice(); },
    tiles: function () { return tiles.slice(); },
    words: function () { return Object.keys(words); },
    setTiles: function (t) { tiles = t.slice(); words = R.solve(tiles); buildPatches(); clearWord(); render(); },
    start: startRound,
    toMenu: toMenu,
    left: function () { return timeLeft; },
    setTime: function (t) { timeLeft = t; hud(); },
    hold: function (on) { held = !!on; },
    step: function (dt) { update(dt); },
    path: function () { return path ? path.slice() : null; },
    typed: function () { return typed; },
    line: function () { return { cls: $("word").className, text: $("word").textContent }; },
    submitPath: function (p) { if (state !== "play") return null; source = "tap"; typed = ""; path = p.slice(); return submit(); },
    // stitch a word not stitched yet (the block's first, by its own path); the word, or null
    stitchAny: function () {
      var w = Object.keys(words).filter(function (x) { return !foundSet[x]; })[0];
      if (!w || window.Patchword.submitPath(words[w]) !== "ok") return null;
      return w;
    },
    type: function (s) { for (var i = 0; i < s.length; i++) typeLetter(s[i]); },
    enter: function () { return submit(); },
    paused: function () { return P.isPaused(); },
    daily: readDaily,
    today: today,
    counts: function () { return dailyCounts; },
    share: shareDaily,
    hitRadius: HIT,
    rules: R
  };
})();
