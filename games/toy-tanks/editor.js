/* =====================================================================
   Toy Tanks: the mission editor.

   Paint the 22 by 17 arena with the squares the game knows (floor, wooden
   blocks, cork, holes), your tank and any of the nine kinds of enemy, and
   see at once whether it can be played: engine.js's own checks (your
   tank, at least one enemy) and that no tank is walled in where nothing
   can get to it. Test plays it here on the real engine, one life; Save
   keeps it in "my missions" (localStorage toytanks_missions); Export and
   Import pass it on as text; a share link plays it in the game itself
   ("#play=<code>", levelcode.js), where it sets no records. The draft is
   kept as you go (toytanks_editor_draft).

   Keys in a test: WASD or the arrows drive, the mouse aims, a click or
   Space fires, a right-click or E lays a mine, Esc or Backspace stops.
   On the card after it Enter goes back to editing and R tests again.
   ===================================================================== */
(function () {
  "use strict";
  var E = window.ToyTanksEngine, A = window.ToyTanksArt, Code = window.ToyTanksCode;
  var COLS = E.COLS, ROWS = E.ROWS;
  var DRAFT_KEY = "toytanks_editor_draft", SAVED_KEY = "toytanks_missions", MAX_ENEMIES = 12, MAX_SAVED = 40;
  function $(id) { return document.getElementById(id); }

  // ---- the palette: [square, name, what it is] --------------------------------------
  var MOVES = { none: "stands still", slow: "slow", normal: "drives at your speed", fast: "fast", vfast: "very fast" };
  function about(kind) {
    var s = E.KINDS[kind], out = [MOVES[s.move] || s.move];
    out.push(s.shells + (s.shells === 1 ? " shell" : " shells") + " at a time" + (s.shell === "fast" ? ", fast ones" : ""));
    out.push(!s.bounces ? "they don't bounce" : s.bounces === 1 ? "bouncing once" : "bouncing twice");
    if (s.mines) out.push("lays mines");
    if (s.invisible) out.push("hides once the mission starts");
    return s.name + " tank: " + out.join(", ") + ".";
  }
  var TOOLS = [
    [".", "Floor", "Floor: open ground. A right-click paints it too."],
    ["#", "Block", "Wooden block: stops tanks, and shells bounce off it."],
    ["c", "Cork", "Cork block: like wood, but a mine's blast breaks it."],
    ["o", "Hole", "Hole: tanks can't cross it, shells fly over it."],
    ["P", "You", "Your tank: one only, so painting it again moves it."]
  ].concat(Object.keys(E.LETTER).map(function (ch) { return [ch, E.KINDS[E.LETTER[ch]].name, about(E.LETTER[ch])]; }));

  // ---- the mission being built -----------------------------------------------------------
  var map, name = "", tool = "#", editing = null, kept = "";
  function at(x, y) { return map[y].charAt(x); }
  function put(x, y, ch) { var r = map[y]; map[y] = r.slice(0, x) + ch + r.slice(x + 1); }
  function count(test) { var n = 0; map.join("").split("").forEach(function (ch) { if (test(ch)) n++; }); return n; }
  function enemies() { return count(function (ch) { return !!E.LETTER[ch]; }); }
  function snapshot() { return JSON.stringify({ name: name, map: map }); }
  function dirty() { return snapshot() !== kept; }
  // an open arena: you on the left, a brown tank on the right
  function blank() {
    var m = [];
    for (var y = 0; y < ROWS; y++) m.push(".".repeat(COLS));
    m[8] = "..P" + ".".repeat(COLS - 6) + "b..";
    return m;
  }
  function mission() { return { name: name.trim() || "My mission", map: map.slice() }; }

  // What stops it being played: engine.js's own checks, one tank of yours,
  // no more than MAX_ENEMIES, and no tank walled in. Only wooden blocks wall
  // a tank in: a mine's blast breaks cork, and shells fly over holes, so a
  // tank behind either can still be reached.
  function problems() {
    var errs = [], shut = [], x, y;
    E.parse({ map: map }).errors.forEach(function (e) {
      errs.push(/no P/.test(e) ? "put your tank in the arena (You, in the palette)" : /no enemy/.test(e) ? "put at least one enemy tank in the arena" : e);
    });
    var you = count(function (ch) { return ch === "P"; });
    if (you > 1) errs.push("there are " + you + " of your tanks: paint over all but one");
    if (enemies() > MAX_ENEMIES) errs.push("there are " + enemies() + " enemy tanks: " + MAX_ENEMIES + " at most");
    if (!errs.length) {
      var seen = {}, stack = [];
      for (y = 0; y < ROWS; y++) { x = map[y].indexOf("P"); if (x >= 0) stack.push([x, y]); }
      while (stack.length) {
        var p = stack.pop(), k = p[1] * COLS + p[0];
        if (p[0] < 0 || p[1] < 0 || p[0] >= COLS || p[1] >= ROWS || seen[k] || at(p[0], p[1]) === "#") continue;
        seen[k] = 1;
        stack.push([p[0] + 1, p[1]], [p[0] - 1, p[1]], [p[0], p[1] + 1], [p[0], p[1] - 1]);
      }
      for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) {
        var ch = at(x, y);
        if (E.LETTER[ch] && !seen[y * COLS + x]) {
          shut.push({ x: x, y: y });
          errs.push("the " + E.KINDS[E.LETTER[ch]].name.toLowerCase() + " tank in row " + (y + 1) + ", column " + (x + 1) + " is walled in by blocks: nothing can get to it");
        }
      }
    }
    return { errs: errs, shut: shut };
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function say(text, bad) { var el = $("ed-status"); el.textContent = text; el.className = "ed-status" + (bad ? " bad" : ""); }
  function validate() {
    var p = problems(), ok = !p.errs.length, n = enemies();
    say(ok ? "Ready to test: you against " + n + (n === 1 ? " enemy tank." : " enemy tanks.") : cap(p.errs[0]) + ".", !ok);
    ["ed-test", "ed-save", "ed-savenew", "ed-play", "ed-share"].forEach(function (id) { $(id).disabled = !ok; });
    return ok;
  }

  // ---- the arena on the canvas ----------------------------------------------------------------
  var canvas = $("ed-board"), g = canvas.getContext("2d"), back = document.createElement("canvas");
  var s = 28, fr = 14, sprites = null, hover = null, flagged = [], flagT = 0;
  function size() { return { W: COLS * s + fr * 2, H: ROWS * s + fr * 2 }; }
  // As big as the window leaves room for: beside the tools on a wide
  // screen (to the window's height), above them on a narrow one.
  function fit() {
    var w = document.documentElement.clientWidth, narrow = w < 760;
    var roomW = narrow ? w - 20 : Math.min(1000, w - 24 - document.querySelector(".ed-side").offsetWidth - 24);
    var top = canvas.getBoundingClientRect().top + (window.scrollY || 0);
    var roomH = narrow ? 1e9 : Math.max(240, window.innerHeight - top - 64);
    s = Math.max(10, Math.floor(Math.min(roomW / (COLS + 1), roomH / (ROWS + 1))));
    fr = Math.round(s / 2);
    var dpr = Math.min(2, window.devicePixelRatio || 1), z = size();
    canvas.style.width = z.W + "px"; canvas.style.height = z.H + "px";
    canvas.width = Math.round(z.W * dpr); canvas.height = Math.round(z.H * dpr);
    back.width = canvas.width; back.height = canvas.height;
    var b = back.getContext("2d");
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    b.save(); b.translate(fr, fr); A.mat(b, COLS * s, ROWS * s, s); b.restore();
    A.rim(b, COLS * s, ROWS * s, fr, s);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    sprites = { wood: A.blockSprite(s, false), cork: A.blockSprite(s, true) };
  }
  // the blocks and tanks standing up, nearest the bottom drawn last
  function standing(list) {
    list.sort(function (a, b) { return a.y - b.y || a.k - b.k; });
    list.forEach(function (o) {
      if (o.k === 0) A.block(g, o.cork ? sprites.cork : sprites.wood, o.x, o.ty, s);
      else if (o.k === 1) A.tank(g, o.t, s, o.o || {});
      else A.shell(g, o.sh, s, T ? T.clock : 0, false);
    });
  }
  function render() {
    if (T) { renderTest(); return; }
    var z = size(), list = [], x, y;
    g.clearRect(0, 0, z.W, z.H);
    g.drawImage(back, 0, 0, z.W, z.H);
    g.save(); g.translate(fr, fr);
    for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) {
      var ch = at(x, y);
      if (ch === "o") A.hole(g, x, y, s);
      else if (ch === "#" || ch === "c") { g.fillStyle = "rgba(110, 72, 30, 0.2)"; g.fillRect(x * s + s * 0.14, y * s + s * 0.1, s, s); list.push({ y: y + 1, k: 0, x: x, ty: y, cork: ch === "c" }); }
      else if (ch === "P" || E.LETTER[ch]) {
        var face = ch === "P" ? 0 : Math.PI;
        list.push({ y: y + 0.5 + E.TANK_R, k: 1, t: { kind: ch === "P" ? "player" : E.LETTER[ch], x: x + 0.5, y: y + 0.5, body: face, turret: face } });
      }
    }
    standing(list);
    // the square under the mouse, and the tanks a check found walled in
    if (hover) { g.strokeStyle = "rgba(20, 56, 119, 0.75)"; g.lineWidth = 2; g.strokeRect(hover.x * s + 1, hover.y * s + 1, s - 2, s - 2); }
    g.strokeStyle = "#d63a2b"; g.lineWidth = Math.max(2, s * 0.1);
    flagged.forEach(function (f) { g.beginPath(); g.arc((f.x + 0.5) * s, (f.y + 0.5) * s, s * 0.62, 0, Math.PI * 2); g.stroke(); });
    g.restore();
  }

  // ---- painting ----------------------------------------------------------------------------------
  function paint(x, y, ch) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS || at(x, y) === ch) return false;
    if (E.LETTER[ch] && !E.LETTER[at(x, y)] && enemies() >= MAX_ENEMIES) { say(MAX_ENEMIES + " enemy tanks at most.", true); return false; }
    if (ch === "P") for (var yy = 0; yy < ROWS; yy++) map[yy] = map[yy].replace(/P/g, ".");     // (one of you)
    put(x, y, ch);
    return true;
  }
  var draftT = 0;
  function changed() {
    flagged = [];
    clearTimeout(draftT);
    draftT = setTimeout(keepDraft, 250);
    render(); validate();
  }
  function keepDraft() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ name: name, map: map })); } catch (e) {} }
  function squareAt(e) {
    var r = canvas.getBoundingClientRect(), k = r.width / size().W;
    return { x: Math.floor((e.clientX - r.left - fr * k) / (s * k)), y: Math.floor((e.clientY - r.top - fr * k) / (s * k)) };
  }
  var painting = false;
  function stroke(e) { var c = squareAt(e); if (paint(c.x, c.y, e.button === 2 || e.buttons === 2 ? "." : tool)) changed(); }

  function buildPalette() {
    var bar = $("ed-palette");
    bar.innerHTML = "";
    TOOLS.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button"; b.dataset.ch = t[0]; b.title = t[2];
      b.setAttribute("aria-pressed", t[0] === tool ? "true" : "false");
      var c = document.createElement("canvas"), dpr = 2, q = 26;
      c.width = c.height = q * dpr;
      var cg = c.getContext("2d"); cg.scale(dpr, dpr);
      icon(cg, t[0], q);
      b.appendChild(c); b.appendChild(document.createTextNode(t[1]));
      b.addEventListener("click", function () { tool = t[0]; buildPalette(); });
      bar.appendChild(b);
    });
    var cur = TOOLS.filter(function (t) { return t[0] === tool; })[0];
    $("ed-what").textContent = cur ? cur[2] : "";
  }
  // a square of the arena in a palette button
  function icon(cg, ch, q) {
    var k = q * 0.8, o = (q - k) / 2;
    cg.save(); cg.translate(o, o);
    A.mat(cg, k, k, k);
    if (ch === "#" || ch === "c") { var sp = A.blockSprite(k, ch === "c"); cg.drawImage(sp.canvas, 0, -sp.lift / 2, k, k + sp.lift); }
    else if (ch === "o") A.hole(cg, 0, 0, k);
    else if (ch === "P" || E.LETTER[ch]) A.tank(cg, { kind: ch === "P" ? "player" : E.LETTER[ch], x: 0.5, y: 0.5, body: 0, turret: 0 }, k, {});
    cg.restore();
  }

  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  canvas.addEventListener("pointerdown", function (e) {
    if (T) { testPointer(e); return; }
    e.preventDefault();
    painting = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    stroke(e);
  });
  canvas.addEventListener("pointermove", function (e) {
    if (T) { if (e.pointerType === "mouse") { aimPt = toTiles(e); touchAim = false; } return; }
    if (painting) { stroke(e); return; }
    if (e.pointerType !== "mouse") return;
    var c = squareAt(e), h = c.x >= 0 && c.y >= 0 && c.x < COLS && c.y < ROWS ? c : null;
    if (!h !== !hover || (h && (h.x !== hover.x || h.y !== hover.y))) { hover = h; render(); }
  });
  canvas.addEventListener("pointerleave", function () { if (hover && !T) { hover = null; render(); } });
  window.addEventListener("pointerup", function () { painting = false; });
  window.addEventListener("pointercancel", function () { painting = false; });

  // ---- the form, saving, the list ------------------------------------------------------------------
  $("ed-name").addEventListener("input", function () { name = this.value.slice(0, 40); keepDraft(); });
  function open(m, i) {
    map = m.map.slice(); name = m.name || "";
    $("ed-name").value = name;
    editing = i == null ? null : i;
    $("ed-savenew").hidden = editing === null;
    flagged = [];
    render(); validate(); keepDraft(); showSaved();
  }
  function savedList() {
    try { var a = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function keepSaved(a) { try { localStorage.setItem(SAVED_KEY, JSON.stringify(a)); return true; } catch (e) { return false; } }
  function save(asNew) {
    if (!validate()) return;
    var a = savedList(), m = mission(), over = !asNew && editing !== null && editing < a.length;
    if (!over && a.length >= MAX_SAVED) { say(MAX_SAVED + " missions are saved already: delete one first.", true); return; }
    if (over) a[editing] = m; else a.push(m);
    if (!keepSaved(a)) { say("This browser wouldn't save it.", true); return; }
    editing = over ? editing : a.length - 1;
    $("ed-savenew").hidden = false;
    kept = snapshot();
    showSaved();
    say('Saved "' + m.name + '"' + (over ? "." : ", mission " + a.length + " of your own."));
  }
  // (unsaved work in the arena: ask before it's put aside)
  function unsavedAsk(title, ok, go) {
    if (dirty() && window.GameShell && GameShell.confirm) GameShell.confirm({ title: title, text: "The mission in the arena isn't saved.", ok: ok }, function (yes) { if (yes) go(); });
    else go();
  }
  function showSaved() {
    var box = $("ed-saved"), a = savedList();
    box.innerHTML = "";
    if (!a.length) { box.innerHTML = '<p class="empty">None yet: Save keeps the one in the arena here.</p>'; return; }
    a.forEach(function (raw, i) {
      var m;
      try { m = Code.clean(raw); } catch (e) { return; }
      var row = document.createElement("div"); row.className = "saved-item" + (i === editing ? " editing" : "");
      var nm = document.createElement("span"); nm.className = "nm"; nm.textContent = m.name;
      function btn(label, title, fn) { var b = document.createElement("button"); b.type = "button"; b.textContent = label; b.title = title; b.addEventListener("click", fn); row.appendChild(b); }
      row.appendChild(nm);
      btn("Edit", "Open it in the arena", function () { unsavedAsk("Open this mission?", "Open it", function () { open(m, i); kept = snapshot(); }); });
      btn("Play", "Play it in the game", function () { keepDraft(); go(playUrl(m)); });
      btn("Delete", "Delete it", function () {
        var go2 = function () {
          var l = savedList(); l.splice(i, 1); keepSaved(l);
          // (the list closes up: follow the mission in the arena, or let it go if it was this one)
          if (editing === i) { editing = null; $("ed-savenew").hidden = true; } else if (editing !== null && editing > i) editing--;
          showSaved();
        };
        if (window.GameShell && GameShell.confirm) GameShell.confirm({ title: "Delete this mission?", text: '"' + m.name + '" goes from your missions.', ok: "Delete", cancel: "Keep it", safe: true }, function (yes) { if (yes) go2(); });
        else go2();
      });
      box.appendChild(row);
    });
  }
  function playUrl(m) { return location.href.replace(/editor\.html.*$/, "").replace(/#.*$/, "") + "#play=" + Code.encode(m); }
  function go(url) { location.href = url; }
  $("ed-save").addEventListener("click", function () { save(false); });
  $("ed-savenew").addEventListener("click", function () { save(true); });
  $("ed-new").addEventListener("click", function () { unsavedAsk("Start a new mission?", "New mission", function () { open({ name: "", map: blank() }, null); kept = snapshot(); say("A new arena: you against one brown tank."); }); });
  $("ed-check").addEventListener("click", function () {
    var p = problems(), n = enemies();
    flagged = p.shut; render();
    clearTimeout(flagT); flagT = setTimeout(function () { flagged = []; render(); }, 2600);
    if (p.errs.length) say(p.errs.map(cap).join(". ") + ".", true);
    else say("Checked: it can be played. Every one of the " + n + (n === 1 ? " enemy tank" : " enemy tanks") + " can be reached.");
  });
  $("ed-play").addEventListener("click", function () { if (!validate()) return; keepDraft(); kept = snapshot(); go(playUrl(mission())); });
  $("ed-share").addEventListener("click", function () {
    if (!validate()) return;
    var url = playUrl(mission()), b = this;
    function copied() { kept = snapshot(); b.textContent = "Link copied"; setTimeout(function () { b.textContent = "Copy share link"; }, 1500); }
    function fallback() { kept = snapshot(); if (window.GameShell && GameShell.copyBox) GameShell.copyBox({ title: "Copy the link to your mission", text: url }); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(copied, fallback); else fallback();
  });

  // ---- export and import --------------------------------------------------------------------------
  function exportText() { return JSON.stringify(mission(), null, 2); }
  function openIO(importing) {
    $("ed-io-title").textContent = importing ? "Import" : "Export";
    $("ed-io-text").value = importing ? "" : exportText();
    $("ed-io-text").readOnly = !importing;
    $("ed-io-load").hidden = !importing;
    var note = $("ed-io-note");
    note.className = "ed-io-note";
    note.textContent = importing ? "Paste a mission: its text from Export, a share link or code, or just its map, 17 lines of 22 squares." :
      "Import takes this back. Its map can also go into levels.js as one of the hand-made missions.";
    $("ed-io").hidden = false;
    var t = $("ed-io-text"); t.focus(); if (!importing) t.select();
  }
  // a mission from pasted text: a share link or code, Export's text (or a
  // map array), or the map's rows alone (quotes and commas allowed)
  function fromText(text) {
    text = String(text || "").trim();
    if (!text) throw new Error("Paste a mission first.");
    if (/t1\.[A-Za-z0-9_-]+/.test(text)) return Code.decode(text);
    var json = null;
    try { json = JSON.parse(text); } catch (e) {}
    if (json) return Code.clean(Array.isArray(json) ? { name: "", map: json } : json);
    var rows = text.split(/\r?\n/).map(function (l) { return l.trim().replace(/,$/, "").replace(/^["']|["']$/g, ""); })
      .filter(function (l) { return /^[.#coPbamypgvwk]{22}$/.test(l); });
    if (rows.length !== ROWS) throw new Error("That isn't a mission: a map is " + ROWS + " lines of " + COLS + " squares (found " + rows.length + ").");
    return Code.clean({ name: "", map: rows });
  }
  function loadImport() {
    var m;
    try { m = fromText($("ed-io-text").value); } catch (err) { $("ed-io-note").textContent = String(err && err.message || err); $("ed-io-note").className = "ed-io-note bad"; return; }
    if (m.name === "A shared mission") m.name = "";
    unsavedAsk("Open the pasted mission?", "Open it", function () { open(m, null); $("ed-io").hidden = true; say("Imported." + (problems().errs.length ? " " + $("ed-status").textContent : "")); validate(); });
  }
  $("ed-export").addEventListener("click", function () { openIO(false); });
  $("ed-import").addEventListener("click", function () { openIO(true); });
  $("ed-io-load").addEventListener("click", loadImport);
  $("ed-io-close").addEventListener("click", function () { $("ed-io").hidden = true; });
  $("ed-io-copy").addEventListener("click", function () {
    var t = $("ed-io-text"), b = this;
    t.focus(); t.select();
    try { document.execCommand("copy"); } catch (e) {}
    if (navigator.clipboard) { try { navigator.clipboard.writeText(t.value).catch(function () {}); } catch (e) {} }
    b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1200);
  });

  // ---- a test: the mission played here on the real engine, one life -------------------------------
  var T = null;           // { st, clock, wrecks, ended }
  var keys = {}, firePress = false, minePress = false, aimPt = null, touchAim = false, aimAngle = null, stickMove = null, stickAim = null;
  var tback = document.createElement("canvas");
  function startTest() {
    if (!validate()) return;
    keepDraft();
    var st = E.create([{ map: map.slice() }], { seed: (Math.random() * 4294967296) >>> 0 });
    st.lives = 1;
    T = { st: st, clock: 0, wrecks: [], ended: false };
    keys = {}; firePress = minePress = false; aimPt = null; touchAim = false; aimAngle = null; stickMove = stickAim = null;
    hover = null; flagged = [];
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    document.body.classList.add("testing");
    $("ed-status").hidden = true; $("ed-testbar").hidden = false; $("ed-over").hidden = true;
    testBack();
    testLine();
    last = 0; acc = 0;
    if (!looping) { looping = true; requestAnimationFrame(frame); }
  }
  // the mat, the rim and the holes (they don't change in a mission)
  function testBack() {
    tback.width = back.width; tback.height = back.height;
    var b = tback.getContext("2d"), dpr = back.width / size().W;
    b.drawImage(back, 0, 0);
    b.setTransform(dpr, 0, 0, dpr, 0, 0); b.translate(fr, fr);
    for (var i = 0; i < T.st.grid.length; i++) if (T.st.grid[i] === 3) A.hole(b, i % COLS, Math.floor(i / COLS), s);
  }
  function stopTest() {
    if (!T) return;
    T = null; keys = {};
    document.body.classList.remove("testing");
    $("ed-status").hidden = false; $("ed-testbar").hidden = true; $("ed-over").hidden = true;
    render(); validate();
  }
  function endTest(won) {
    T.ended = true;
    var st = T.st, left = E.enemiesLeft(st), all = E.enemyCount(st);
    $("ed-over-title").textContent = won ? "Mission cleared!" : "Tank destroyed";
    $("ed-over-msg").textContent = (won ? "Every enemy tank destroyed" : "Destroyed " + (all - left) + " of " + all + " enemy tanks") +
      ", in " + (Math.round(st.clock / 100) / 10).toFixed(1) + " s.";
    $("ed-over").hidden = false;
  }
  function testLine() {
    if (!T) return;
    var st = T.st;
    $("ed-test-line").textContent = st.status === "start" ? "Testing: get ready" : "Testing: " + E.enemiesLeft(st) + " of " + E.enemyCount(st) + " enemy tanks left";
  }
  function handle(events) {
    events.forEach(function (e) {
      if (e.t === "dead") T.wrecks.push({ x: e.x, y: e.y, kind: e.kind });
      else if (e.t === "over" || e.t === "done") endTest(e.t === "done");
    });
  }
  function input() {
    var mx = 0, my = 0;
    if (keys.left) mx -= 1; if (keys.right) mx += 1; if (keys.up) my -= 1; if (keys.down) my += 1;
    if (stickMove) { mx = stickMove.x; my = stickMove.y; }
    var p = T.st.player, aim = null;
    if (stickAim && stickAim.len > 0.2) { aim = Math.atan2(stickAim.y, stickAim.x); aimAngle = aim; }
    else if (aimPt && !touchAim) aim = Math.atan2(aimPt.y - p.y, aimPt.x - p.x);
    else if (aimAngle != null) aim = aimAngle;
    var o = { mx: mx, my: my, aim: aim, fire: firePress, mine: minePress };
    firePress = minePress = false;
    return o;
  }
  var looping = false, last = 0, acc = 0;
  function frame(now) {
    if (!T) { looping = false; return; }
    requestAnimationFrame(frame);
    var dt = last ? Math.min(100, now - last) : 16;
    last = now;
    if (!T.ended) {
      acc += dt;
      while (acc >= 16 && T && !T.ended) { acc -= 16; T.clock += 16; handle(E.step(T.st, 16, input())); }
      testLine();
    }
    if (T) renderTest();
  }
  function renderTest() {
    var st = T.st, z = size(), list = [], i;
    g.clearRect(0, 0, z.W, z.H);
    g.drawImage(tback, 0, 0, z.W, z.H);
    g.save(); g.translate(fr, fr);
    g.fillStyle = "rgba(110, 72, 30, 0.2)";
    for (i = 0; i < st.grid.length; i++) if (st.grid[i] === 1 || st.grid[i] === 2) g.fillRect((i % COLS) * s + s * 0.14, Math.floor(i / COLS) * s + s * 0.1, s, s);
    st.tracks.forEach(function (k) { A.track(g, k.x, k.y, k.a, s, k.age); });
    T.wrecks.forEach(function (w) { A.wreck(g, w.x, w.y, s, w.kind); });
    st.mines.forEach(function (m) { A.mine(g, m, s, E.TUNE.fuseMs - m.age, E.TUNE.mineWarnMs, T.clock); });
    for (i = 0; i < st.grid.length; i++) if (st.grid[i] === 1 || st.grid[i] === 2) list.push({ y: Math.floor(i / COLS) + 1, k: 0, x: i % COLS, ty: Math.floor(i / COLS), cork: st.grid[i] === 2 });
    // (a white tank shows on the mission card, then fades from sight)
    [st.player].concat(st.enemies).forEach(function (t) { if (t.alive && !(t.hidden && st.status !== "start")) list.push({ y: t.y + E.TANK_R, k: 1, t: t }); });
    st.shells.forEach(function (sh) { list.push({ y: sh.y + 0.1, k: 2, sh: sh }); });
    standing(list);
    st.blasts.forEach(function (b) { A.blast(g, b, s, E.TUNE.blast, false); });
    var p = st.player;
    if (p.alive && st.status === "play") {
      if (aimPt && !touchAim) A.aim(g, p, aimPt.x, aimPt.y, s, true);
      else if (stickAim) A.aim(g, p, p.x + Math.cos(p.turret) * 4.5, p.y + Math.sin(p.turret) * 4.5, s, false);
    }
    g.restore();
  }
  function toTiles(e) { var r = canvas.getBoundingClientRect(), k = r.width / size().W; return { x: (e.clientX - r.left - fr * k) / (s * k), y: (e.clientY - r.top - fr * k) / (s * k) }; }
  function testPointer(e) {
    if (T.ended) return;
    e.preventDefault();
    var pt = toTiles(e);
    if (e.pointerType === "mouse") { aimPt = pt; touchAim = false; if (e.button === 0) firePress = true; else if (e.button === 2) minePress = true; }
    else {
      // a tap on the arena: the turret turns to it and fires
      touchAim = true; aimAngle = Math.atan2(pt.y - T.st.player.y, pt.x - T.st.player.x);
      T.st.player.turret = aimAngle; firePress = true;
    }
  }
  // the touch sticks and the Mine button (as in the game)
  function stick(el, onMove, onEnd) {
    var id = null, knob = el.querySelector("i");
    function at(e) {
      var r = el.getBoundingClientRect(), R = r.width / 2, dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R), d = Math.hypot(dx, dy), k = Math.min(1, d / (R * 0.62));
      var v = d ? { x: dx / d * k, y: dy / d * k, len: k } : { x: 0, y: 0, len: 0 };
      knob.style.transform = "translate(" + (v.x * R * 0.5).toFixed(1) + "px," + (v.y * R * 0.5).toFixed(1) + "px)";
      return v;
    }
    el.addEventListener("pointerdown", function (e) { e.preventDefault(); id = e.pointerId; try { el.setPointerCapture(id); } catch (x) {} el.classList.add("held"); onMove(at(e)); });
    el.addEventListener("pointermove", function (e) { if (e.pointerId === id) onMove(at(e)); });
    function end(e) { if (e.pointerId !== id) return; id = null; el.classList.remove("held"); knob.style.transform = ""; onEnd(e.type === "pointerup"); }
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  }
  stick($("move-stick"), function (v) { stickMove = v.len > 0.15 ? v : { x: 0, y: 0, len: 0 }; }, function () { stickMove = null; });
  stick($("aim-stick"), function (v) { stickAim = v; touchAim = true; }, function (up) { if (up && T && !T.ended) firePress = true; stickAim = null; });
  $("mine-btn").addEventListener("click", function () { if (T && !T.ended) minePress = true; });
  $("mine-btn").addEventListener("mousedown", function (e) { e.preventDefault(); });

  $("ed-test").addEventListener("click", startTest);
  $("ed-stop").addEventListener("click", stopTest);
  $("ed-done").addEventListener("click", stopTest);
  $("ed-again").addEventListener("click", startTest);

  // ---- keys ---------------------------------------------------------------------------------------------
  var DIRS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right" };
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".gs-dialog")) return;
    // Esc closes the export / import box (it never leaves the editor: data-esc-leaves="off")
    if (e.key === "Escape" && !$("ed-io").hidden) { e.preventDefault(); $("ed-io").hidden = true; return; }
    if (!T) return;
    if (T.ended) { if (e.key === "Escape") { e.preventDefault(); stopTest(); } return; }
    if (e.key === "Escape" || e.key === "Backspace") { e.preventDefault(); stopTest(); return; }
    if (DIRS[e.key]) { e.preventDefault(); keys[DIRS[e.key]] = true; return; }
    if (e.key === " " || e.code === "Space") { e.preventDefault(); if (!e.repeat) firePress = true; return; }
    if (e.key === "e" || e.key === "E") { e.preventDefault(); if (!e.repeat) minePress = true; }
  });
  document.addEventListener("keyup", function (e) { if (DIRS[e.key]) keys[DIRS[e.key]] = false; });
  window.addEventListener("blur", function () { keys = {}; stickMove = null; stickAim = null; });
  // (the card after a test: Enter goes back to editing, R tests again)
  if (window.GameShell && GameShell.menuKeys) GameShell.menuKeys({ active: function () { return !!T && T.ended; }, groups: [{ sel: "#ed-again", keys: ["r"] }], start: "#ed-done" });

  // Leaving asks first while the mission in the arena has changes that
  // aren't saved, shared or played (a test leaves it as it was)
  if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave({ active: dirty, text: "The mission you're building isn't saved." });
  function refit() { fit(); if (T) testBack(); render(); }
  window.addEventListener("resize", refit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);

  // ---- start: the draft, else a new arena ----------------------------------------------------------------
  var draft = null;
  try { draft = Code.clean(JSON.parse(localStorage.getItem(DRAFT_KEY) || "null")); } catch (e) {}
  if (draft && !(JSON.parse(localStorage.getItem(DRAFT_KEY)).name || "").trim()) draft.name = "";
  buildPalette();
  fit();
  open(draft || { name: "", map: blank() }, null);
  kept = snapshot();

  // test hooks: the Playwright harness drives the editor through these
  window.ToyTanksEditor = {
    map: function () { return map.slice(); },
    name: function () { return name; },
    paint: function (x, y, ch) { var ok = paint(x, y, ch); if (ok) changed(); return ok; },
    pick: function (ch) { tool = ch; buildPalette(); },
    tool: function () { return tool; },
    open: function (m) { open(Code.clean(m), null); },
    problems: problems,
    dirty: dirty,
    playUrl: function () { return playUrl(mission()); },
    cell: function () { return { s: s, fr: fr }; },
    test: function () { return T; }
  };
})();
