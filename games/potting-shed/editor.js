/* =====================================================================
   Potting Shed: the shed editor.

   Paint a shed with what the game knows (benches, brick floor, patches of
   sun, pots, pots in the sun, the gardener), 5 to 16 cells across and 5 to
   12 down, and see at once whether it can be played: engine.js's checks
   (one gardener, as many pots as patches of sun, the room closed, every pot
   and patch within his reach). Check asks engine.js's solver for the fewest
   pushes, a slice at a time so the page never freezes; Test plays it here
   with the game's own rules (engine.js) and art (art.js); Save keeps it in
   "my sheds" (localStorage pottingshed_mine), which the game's menu lists;
   Play in the game and the share link carry it there as a "#play=<code>"
   link, where it keeps no records; Export and Import pass it on as text.
   The draft is kept as you go (pottingshed_editor_draft).

   Keys in a test: the arrows or WASD walk and push (a key held walks one
   step), U takes a step back, R starts over, Esc or Backspace stops. On
   the card after it Enter goes back to editing and R tests again. Esc
   otherwise is the way out, asking first while the shed isn't saved.
   ===================================================================== */
(function () {
  "use strict";
  var E = window.PottingShedEngine, A = window.PottingShedArt;
  var DRAFT_KEY = "pottingshed_editor_draft", SAVED_KEY = "pottingshed_mine", MAX_SAVED = 40;
  function $(id) { return document.getElementById(id); }
  function count(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---- the palette: [character, name, what it is] ------------------------------------
  var TOOLS = [
    ["#", "Bench", "Bench: a wall. The gardener can't get past it, and a pot stops against it. Benches all round close the shed."],
    [" ", "Floor", "Brick floor: open ground, and it clears whatever was there. A right-click paints it too."],
    [".", "Sun", "A patch of sun from the window: every pot has to end up on one, so there are as many patches as pots."],
    ["$", "Pot", "A terracotta pot. Painted on a patch of sun, it's a pot in the sun."],
    ["*", "Pot in sun", "A pot already in the sun, in bloom. It can still be pushed out of it."],
    ["@", "Gardener", "The gardener: one only, so painting him again moves him."]
  ];

  // ---- the shed being built ------------------------------------------------------------
  var map, name = "", tool = "#", editing = null, kept = "";
  function W() { return map[0].length; }
  function H() { return map.length; }
  function at(x, y) { return map[y].charAt(x); }
  function put(x, y, ch) { var r = map[y]; map[y] = r.slice(0, x) + ch + r.slice(x + 1); }
  function snapshot() { return JSON.stringify({ name: name, map: map }); }
  function dirty() { return snapshot() !== kept; }
  function shed() { return { name: name.trim() || "My shed", map: map.slice() }; }
  // a small closed shed: the gardener, a pot and its patch of sun
  function blank() { return ["########", "#      #", "#      #", "# @$ . #", "#      #", "#      #", "########"]; }

  // Paint one cell: benches and floor take the cell over; sun, a pot and the
  // gardener keep a patch of sun that's there (a pot on one is a pot in the
  // sun); there is one gardener, so painting him moves him
  function paint(x, y, t) {
    if (!(x >= 0 && y >= 0 && x < W() && y < H())) return false;
    var cur = at(x, y), sunny = ".*+".indexOf(cur) >= 0, ch;
    if (t === "#" || t === " " || t === "*") ch = t;
    else if (t === ".") ch = cur === "$" || cur === "*" ? "*" : cur === "@" || cur === "+" ? "+" : ".";
    else if (t === "$") ch = sunny ? "*" : "$";
    else if (t === "@") ch = sunny ? "+" : "@";
    else return false;
    if (ch === cur) return false;
    if (t === "@") for (var yy = 0; yy < H(); yy++) map[yy] = map[yy].replace(/@/g, " ").replace(/\+/g, ".");
    put(x, y, ch);
    return true;
  }
  function resize(w, h) {
    w = Math.max(E.MIN_W, Math.min(E.MAX_W, Math.round(w) || W()));
    h = Math.max(E.MIN_H, Math.min(E.MAX_H, Math.round(h) || H()));
    var m = [];
    for (var y = 0; y < h; y++) { var r = y < H() ? map[y].slice(0, w) : ""; while (r.length < w) r += " "; m.push(r); }
    map = m;
    $("ed-w").value = w; $("ed-h").value = h;
    fit(); changed();
  }
  // benches all round the edge (closing the room)
  function frame() {
    for (var y = 0; y < H(); y++) for (var x = 0; x < W(); x++) if (x === 0 || y === 0 || x === W() - 1 || y === H() - 1) put(x, y, "#");
    changed();
  }

  // ---- what stops it, and the status line ---------------------------------------------------
  function say(text, kind, html) {
    var el = $("ed-status");
    if (html) el.innerHTML = text; else el.textContent = text;
    el.className = "ed-status" + (kind ? " " + kind : "");
  }
  function validate() {
    var p = E.problems(map), ok = !p.length;
    if (!T) say(ok ? "Ready: " + count(E.parse(map).pots.length, "pot", "pots") + " to put in the sun. Check finds the fewest pushes; Test plays it." : cap(p[0]) + ".", ok ? "" : "bad");
    ["ed-test", "ed-check", "ed-save", "ed-savenew", "ed-play", "ed-share"].forEach(function (id) { $(id).disabled = !ok; });
    return ok;
  }

  // ---- Check: the fewest pushes, a slice at a time ----------------------------------------
  // (any change to the shed stops a check that's running)
  var checkGen = 0, lastCheck = null, checking = false;
  var MOST = 200000, SECONDS = 30;
  function check() {
    if (!validate()) return;
    var gen = ++checkGen, s = E.solver(E.parse(map), { most: MOST, seconds: SECONDS });
    lastCheck = null; checking = true;
    say("Checking: looking for the fewest pushes…");
    (function slice() {
      if (gen !== checkGen) return;
      var r = s.run(12);
      if (!r.done) { say("Checking: " + r.nodes.toLocaleString("en") + " positions looked at so far…"); setTimeout(slice, 0); return; }
      checking = false; lastCheck = r;
      if (r.found) say("✓ Solvable in " + count(r.pushes, "push", "pushes") + " (" + count(r.moves, "move", "moves") + ").", "good");
      else if (r.given) say("Couldn't tell: the search gave up after " + r.nodes.toLocaleString("en") + " positions. Test it by hand.", "bad");
      else say("✗ No solution: there's no way to get every pot into the sun.", "bad");
    })();
  }
  function stopCheck() { if (checking) { checkGen++; checking = false; } lastCheck = null; }

  var draftT = 0;
  function changed() {
    stopCheck();
    clearTimeout(draftT);
    draftT = setTimeout(keepDraft, 250);
    render(); validate();
  }
  function keepDraft() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ name: name, map: map })); } catch (e) {} }

  // ---- the shed on the canvas ----------------------------------------------------------------
  var canvas = $("ed-board"), g = canvas.getContext("2d"), s = 44, hover = null;
  // As big as the window leaves room for: beside the tools on a wide
  // screen (to the window's height), above them on a narrow one
  function fit() {
    var vw = document.documentElement.clientWidth, narrow = vw < 760;
    var roomW = narrow ? vw - 28 : Math.min(720, vw - document.querySelector(".ed-side").offsetWidth - 76);
    var top = canvas.getBoundingClientRect().top + (window.scrollY || 0);
    var roomH = narrow ? Math.max(220, window.innerHeight * 0.6) : Math.max(220, window.innerHeight - top - 110);
    s = Math.max(14, Math.min(56, Math.floor(Math.min(roomW / W(), roomH / H()))));
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.width = W() * s + "px"; canvas.style.height = H() * s + "px";
    canvas.width = Math.round(W() * s * dpr); canvas.height = Math.round(H() * s * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }
  function render() {
    var w = W(), h = H(), L = T ? T.L : E.parse(map), seen = !!T || /[@+]/.test(map.join("")), k, x, y;
    g.clearRect(0, 0, w * s, h * s);
    for (k = 0; k < w * h; k++) {
      x = (k % w) * s; y = Math.floor(k / w) * s;
      if (L.wall[k]) A.bench(g, x, y, s);
      else if (seen && L.inside[k]) A.brick(g, x, y, s, k, w);
      else if (!T) {
        // outside the room (or no gardener yet): a pale cell to paint on
        g.fillStyle = "rgba(47, 36, 24, 0.07)"; g.fillRect(x, y, s, s);
        g.strokeStyle = "rgba(47, 36, 24, 0.28)"; g.lineWidth = 1; g.setLineDash([3, 3]);
        g.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1); g.setLineDash([]);
      }
      if (L.sun[k] && !L.wall[k] && (!T || L.inside[k])) A.sun(g, x, y, s);
    }
    // the pots and the gardener, back to front (a flower or a hat stands up
    // into the cell above), the gardener over a pot level with him
    var pots = T ? T.pots : L.pots, me = T ? T.me : seen ? L.me : -1, parts = [];
    pots.forEach(function (pk) { parts.push({ k: pk, z: 0 }); });
    if (me >= 0) parts.push({ k: me, z: 1 });
    parts.sort(function (a, b) { return Math.floor(a.k / w) - Math.floor(b.k / w) || a.z - b.z; });
    parts.forEach(function (q) {
      var px = (q.k % w) * s, py = Math.floor(q.k / w) * s;
      if (q.z) A.gardener(g, px, py, s, T ? T.facing : 1); else A.pot(g, px, py, s, L.sun[q.k] ? 1 : 0);
    });
    if (hover && !T) {
      g.strokeStyle = "#c9663d"; g.lineWidth = 3;
      g.strokeRect(hover.x * s + 1.5, hover.y * s + 1.5, s - 3, s - 3);
    }
  }
  function cellAt(e) {
    var r = canvas.getBoundingClientRect(), z = r.width / (W() * s);
    return { x: Math.floor((e.clientX - r.left) / (s * z)), y: Math.floor((e.clientY - r.top) / (s * z)) };
  }
  var painting = false, swipe = null;
  function stroke(e) { var c = cellAt(e); if (paint(c.x, c.y, e.button === 2 || e.buttons === 2 ? " " : tool)) changed(); }
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  canvas.addEventListener("pointerdown", function (e) {
    if (T) { if (e.pointerType !== "mouse") swipe = { x: e.clientX, y: e.clientY }; return; }
    e.preventDefault();
    painting = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    stroke(e);
  });
  canvas.addEventListener("pointermove", function (e) {
    if (T) return;
    if (painting) { stroke(e); return; }
    if (e.pointerType !== "mouse") return;
    var c = cellAt(e), on = c.x >= 0 && c.y >= 0 && c.x < W() && c.y < H() ? c : null;
    if (!on !== !hover || (on && (on.x !== hover.x || on.y !== hover.y))) { hover = on; render(); }
  });
  canvas.addEventListener("pointerleave", function () { if (hover) { hover = null; render(); } });
  canvas.addEventListener("pointerup", function (e) {
    if (!T || !swipe) return;
    var dx = e.clientX - swipe.x, dy = e.clientY - swipe.y; swipe = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) tstep(dx > 0 ? 1 : -1, 0); else tstep(0, dy > 0 ? 1 : -1);
  });
  window.addEventListener("pointerup", function () { painting = false; });
  window.addEventListener("pointercancel", function () { painting = false; });

  // ---- the palette ----------------------------------------------------------------------------
  function buildPalette() {
    var bar = $("ed-palette");
    bar.replaceChildren();
    TOOLS.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button"; b.dataset.ch = t[0]; b.title = t[2];
      b.setAttribute("aria-pressed", t[0] === tool ? "true" : "false");
      var c = document.createElement("canvas"), q = 28;
      c.width = c.height = q * 2;
      var cg = c.getContext("2d"); cg.scale(2, 2);
      icon(cg, t[0], q);
      b.appendChild(c); b.appendChild(document.createTextNode(t[1]));
      b.addEventListener("click", function () { tool = t[0]; buildPalette(); });
      bar.appendChild(b);
    });
    var cur = TOOLS.filter(function (t) { return t[0] === tool; })[0];
    $("ed-what").textContent = cur ? cur[2] : "";
  }
  // a cell of the shed in a palette button, in the game's art
  function icon(cg, ch, q) {
    if (ch === "#") { A.bench(cg, 0, 0, q); return; }
    A.brick(cg, 0, 0, q, 0, 1);
    if (ch === "." || ch === "*") A.sun(cg, 0, 0, q);
    // (a little lower and smaller than in the shed, so its flower stays in the button)
    if (ch === "$" || ch === "*") A.pot(cg, q * 0.07, q * 0.12, q * 0.86, ch === "*" ? 1 : 0);
    if (ch === "@") A.gardener(cg, 0, 0, q, 1);
  }

  // ---- a test: the game's rules on the shed as drawn ------------------------------------------------
  var T = null;
  var kbd = function (k) { return '<kbd class="gs-kbd">' + k + "</kbd>"; };
  function startTest() {
    if (!validate()) return;
    stopCheck();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    var L = E.parse(map);
    T = { L: L, me: L.me, pots: L.pots.slice(), moves: 0, pushes: 0, hist: [], facing: 1, done: false };
    document.body.classList.add("testing");
    $("ed-testbar").hidden = false; $("ed-done").hidden = true;
    say('<span class="gs-keys">' + ["←", "↑", "↓", "→"].map(kbd).join("") + " or " + ["W", "A", "S", "D"].map(kbd).join("") + " walk and push, " + kbd("Esc") + " stops.</span>" +
      '<span class="gs-touch">Swipe or use the pad to walk and push.</span> Every pot into the sun.', "", true);
    showCount(); render();
    // (on a phone Test is below the shed: the shed comes into view, under the corner buttons)
    var top = canvas.getBoundingClientRect().top;
    if (top < 56 || top > window.innerHeight * 0.4) window.scrollTo(0, Math.max(0, top + (window.scrollY || 0) - 64));
  }
  function stopTest() {
    if (!T) return;
    T = null;
    document.body.classList.remove("testing");
    $("ed-testbar").hidden = true; $("ed-done").hidden = true;
    render(); validate();
  }
  function showCount() { $("ed-count").textContent = count(T.moves, "move", "moves") + " · " + count(T.pushes, "push", "pushes"); }
  // one step (one a press): the game's rule, engine.js's move()
  function tstep(dx, dy) {
    if (!T || T.done) return;
    if (dx) T.facing = dx;
    var r = E.move(T.L, T.me, T.pots, dx, dy);
    if (!r) return;
    T.hist.push({ me: T.me, pots: T.pots.slice(), moves: T.moves, pushes: T.pushes });
    T.me = r.me; T.pots = r.pots; T.moves++;
    if (r.pushed >= 0) T.pushes++;
    showCount(); render();
    if (T.pots.every(function (k) { return T.L.sun[k]; })) {
      var tt = T;
      tt.done = true;
      setTimeout(function () { if (T === tt) showDone(); }, 350);
    }
  }
  function tundo() {
    if (!T || T.done || !T.hist.length) return;
    var h = T.hist.pop();
    T.me = h.me; T.pots = h.pots; T.moves = h.moves; T.pushes = h.pushes;
    showCount(); render();
  }
  function showDone() {
    $("ed-done-msg").textContent = count(T.moves, "move", "moves");
    $("ed-done-stats").textContent = count(T.pushes, "push", "pushes") + " · every pot in the sun";
    $("ed-done").hidden = false;
  }
  [["t-up", 0, -1], ["t-left", -1, 0], ["t-right", 1, 0], ["t-down", 0, 1]].forEach(function (b) {
    $(b[0]).addEventListener("click", function () { tstep(b[1], b[2]); });
  });
  $("t-undo").addEventListener("click", tundo);
  $("ed-undo").addEventListener("click", tundo);
  $("ed-over").addEventListener("click", function () { if (T) startTest(); });
  $("ed-stop").addEventListener("click", stopTest);
  $("ed-back-edit").addEventListener("click", stopTest);
  $("ed-again").addEventListener("click", startTest);
  ["ed-undo", "ed-over", "ed-stop", "t-up", "t-left", "t-right", "t-down", "t-undo"].forEach(function (id) { $(id).addEventListener("mousedown", function (e) { e.preventDefault(); }); });

  // ---- the form, saving, the list ----------------------------------------------------------------
  $("ed-name").addEventListener("input", function () { name = this.value.slice(0, 40); clearTimeout(draftT); draftT = setTimeout(keepDraft, 250); });
  $("ed-w").addEventListener("change", function () { resize(+this.value, H()); });
  $("ed-h").addEventListener("change", function () { resize(W(), +this.value); });
  $("ed-frame").addEventListener("click", frame);
  function open(m, i) {
    stopTest(); stopCheck();
    map = m.map.slice(); name = m.name || "";
    $("ed-name").value = name;
    $("ed-w").value = W(); $("ed-h").value = H();
    editing = i == null ? null : i;
    $("ed-savenew").hidden = editing === null;
    fit(); validate(); keepDraft(); showSaved();
  }
  function savedList() {
    try { var a = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function keepSaved(a) { try { localStorage.setItem(SAVED_KEY, JSON.stringify(a)); return true; } catch (e) { return false; } }
  function save(asNew) {
    if (!validate()) return;
    var a = savedList(), m = shed(), over = !asNew && editing !== null && editing < a.length;
    if (!over && a.length >= MAX_SAVED) { say(MAX_SAVED + " sheds are saved already: delete one first.", "bad"); return; }
    if (over) a[editing] = m; else a.push(m);
    if (!keepSaved(a)) { say("This browser wouldn't save it.", "bad"); return; }
    editing = over ? editing : a.length - 1;
    $("ed-savenew").hidden = false;
    kept = snapshot(); keepDraft();
    showSaved();
    say('Saved "' + m.name + '"' + (over ? "." : ", shed " + a.length + " of your own: it's under My sheds in the game."), "good");
  }
  // (unsaved work in the shed: ask before it's put aside)
  function unsavedAsk(title, ok, go) {
    if (dirty() && window.GameShell && GameShell.confirm) GameShell.confirm({ title: title, text: "The shed you're building isn't saved.", ok: ok }, function (yes) { if (yes) go(); });
    else go();
  }
  function showSaved() {
    var box = $("ed-saved"), a = savedList();
    box.replaceChildren();
    if (!a.length) { var p = document.createElement("p"); p.className = "empty"; p.textContent = "None yet: Save keeps the one you're building here, and in the game's My sheds."; box.appendChild(p); return; }
    a.forEach(function (raw, i) {
      var m;
      try { m = E.clean(raw); } catch (e) { return; }
      var row = document.createElement("div"); row.className = "saved-item" + (i === editing ? " editing" : "");
      var nm = document.createElement("span"); nm.className = "nm"; nm.textContent = m.name;
      function btn(label, title, fn) { var b = document.createElement("button"); b.type = "button"; b.textContent = label; b.title = title; b.addEventListener("click", fn); row.appendChild(b); }
      row.appendChild(nm);
      btn("Edit", "Open it here", function () { unsavedAsk("Open this shed?", "Open it", function () { open(m, i); kept = snapshot(); }); });
      btn("Play", "Play it in the game", function () { keepDraft(); go(playUrl(m)); });
      btn("Delete", "Delete it", function () {
        var gone = function () {
          var l = savedList(); l.splice(i, 1); keepSaved(l);
          // (the list closes up: follow the shed being built, or let it go if it was this one)
          if (editing === i) { editing = null; $("ed-savenew").hidden = true; } else if (editing !== null && editing > i) editing--;
          showSaved();
        };
        if (window.GameShell && GameShell.confirm) GameShell.confirm({ title: "Delete this shed?", text: '"' + m.name + '" goes from your sheds.', ok: "Delete", cancel: "Keep it", safe: true }, function (yes) { if (yes) gone(); });
        else gone();
      });
      box.appendChild(row);
    });
  }
  function playUrl(m) { return location.href.replace(/editor\.html.*$/, "").replace(/#.*$/, "") + "#play=" + E.encode(m); }
  function go(url) { location.href = url; }
  $("ed-test").addEventListener("click", startTest);
  $("ed-check").addEventListener("click", check);
  $("ed-save").addEventListener("click", function () { save(false); });
  $("ed-savenew").addEventListener("click", function () { save(true); });
  $("ed-new").addEventListener("click", function () { unsavedAsk("Start a new shed?", "New shed", function () { open({ name: "", map: blank() }, null); kept = snapshot(); say("A new shed: the gardener, one pot and its patch of sun."); }); });
  $("ed-play").addEventListener("click", function () { if (!validate()) return; keepDraft(); kept = snapshot(); go(playUrl(shed())); });
  $("ed-share").addEventListener("click", function () {
    if (!validate()) return;
    var url = playUrl(shed()), b = this;
    function copied() { kept = snapshot(); b.textContent = "Link copied"; setTimeout(function () { b.textContent = "Copy share link"; }, 1500); }
    function fallback() { kept = snapshot(); if (window.GameShell && GameShell.copyBox) GameShell.copyBox({ title: "Copy the link to your shed", text: url }); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(copied, fallback); else fallback();
  });

  // ---- export and import ---------------------------------------------------------------------------
  function exportText() { return JSON.stringify(shed(), null, 2); }
  function openIO(importing) {
    $("ed-io-title").textContent = importing ? "Import" : "Export";
    $("ed-io-text").value = importing ? "" : exportText();
    $("ed-io-text").readOnly = !importing;
    $("ed-io-load").hidden = !importing;
    var note = $("ed-io-note");
    note.className = "ed-io-note";
    note.textContent = importing ? "Paste a shed: its text from Export, a share link or code, or just its map, one row of the shed a line (# bench, space floor, . sun, $ pot, * pot in the sun, @ the gardener)." :
      "Import takes this back. Its map can also go into game.js as one of the sheds.";
    $("ed-io").hidden = false;
    var t = $("ed-io-text"); t.focus(); if (!importing) t.select();
  }
  // a shed from pasted text: a share link or code, Export's text, or a bare map
  function fromText(text) {
    text = String(text || "");
    if (!text.trim()) throw new Error("Paste a shed first.");
    if (/s1\.[A-Za-z0-9_-]+/.test(text)) return E.decode(text);
    if (/^\s*[{[]/.test(text)) {
      var j;
      try { j = JSON.parse(text); } catch (e) { throw new Error("That text isn't a shed: it doesn't read as Export's text."); }
      return E.clean(Array.isArray(j) ? { map: j } : j);
    }
    var rows = text.split(/\r?\n/).filter(function (r) { return /^[# .$*@+]+$/.test(r) && r.indexOf("#") >= 0; });
    if (!rows.length) throw new Error("No shed found in that text.");
    return E.clean({ map: rows });
  }
  $("ed-export").addEventListener("click", function () { openIO(false); });
  $("ed-import").addEventListener("click", function () { openIO(true); });
  $("ed-io-close").addEventListener("click", function () { $("ed-io").hidden = true; });
  $("ed-io-copy").addEventListener("click", function () {
    var t = $("ed-io-text"), b = this;
    t.select();
    try { document.execCommand("copy"); } catch (e) {}
    if (navigator.clipboard) { try { navigator.clipboard.writeText(t.value).catch(function () {}); } catch (e) {} }
    b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1200);
  });
  $("ed-io-load").addEventListener("click", function () {
    var m;
    try { m = fromText($("ed-io-text").value); } catch (err) { var note = $("ed-io-note"); note.className = "ed-io-note bad"; note.textContent = String(err && err.message || err); return; }
    unsavedAsk("Load this shed?", "Load it", function () { $("ed-io").hidden = true; open(m, null); kept = snapshot(); say('Loaded "' + m.name + '".'); });
  });

  // ---- keys -----------------------------------------------------------------------------------------
  var DIRK = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1], A: [-1, 0], D: [1, 0], W: [0, -1], S: [0, 1] };
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".gs-dialog")) return;
    // Esc closes the export / import box, from its text too
    if (e.key === "Escape" && !$("ed-io").hidden) { e.preventDefault(); $("ed-io").hidden = true; return; }
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (!T) return;
    // (a test claims Esc: it stops the test rather than leaving)
    if (e.key === "Escape") { e.preventDefault(); stopTest(); return; }
    if (!$("ed-done").hidden) return;
    var d = DIRK[e.key];
    if (d) { e.preventDefault(); if (!e.repeat) tstep(d[0], d[1]); }
  });
  if (window.GameShell && GameShell.menuKeys) {
    // in a test: U a step back, R start over, Backspace stop
    GameShell.menuKeys({ active: function () { return !!T && $("ed-done").hidden; }, groups: [{ sel: "#ed-testbar button", keys: ["u", "r", "backspace"] }] });
    // the card after it: Enter back to editing, R test again
    GameShell.menuKeys({ active: function () { return !!T && !$("ed-done").hidden; }, groups: [{ sel: "#ed-again", keys: ["r"] }], start: "#ed-back-edit" });
  }

  // Leaving asks first while the shed has changes that aren't saved, shared
  // or played (a test leaves it as it was; the draft is kept anyway)
  if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave({ active: dirty, text: "The shed you're building isn't saved." });
  window.addEventListener("resize", fit);
  window.addEventListener("pagehide", keepDraft);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);

  // ---- start: the draft, else a new shed ----------------------------------------------------------------
  var draft = null, rawName = "";
  try { var raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); draft = E.clean(raw); rawName = (raw.name || "").trim(); } catch (e) { draft = null; }
  if (draft) draft.name = rawName;
  buildPalette();
  map = (draft || { map: blank() }).map;
  open(draft || { name: "", map: blank() }, null);
  kept = snapshot();

  // test hooks: the Playwright harness drives the editor through these
  window.PottingShedEditor = {
    map: function () { return map.slice(); },
    name: function () { return name; },
    paint: function (x, y, ch) { var ok = paint(x, y, ch); if (ok) changed(); return ok; },
    pick: function (ch) { tool = ch; buildPalette(); },
    tool: function () { return tool; },
    open: function (m) { open(E.clean(m), null); kept = snapshot(); },
    resize: resize,
    problems: function () { return E.problems(map); },
    check: check,
    checked: function () { return checking ? "checking" : lastCheck; },
    dirty: dirty,
    playUrl: function () { return playUrl(shed()); },
    cell: function () { return s; },
    test: function () { return T ? { me: T.me, pots: T.pots.slice(), moves: T.moves, pushes: T.pushes, done: T.done } : null; },
    step: tstep,
    saved: savedList
  };
})();
