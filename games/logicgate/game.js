"use strict";
(function () {
  // =================================================================
  //  LogicGate — two modes:
  //   • "gates"  : drag logic gates into empty slots to light the bulb.
  //   • "inputs" : the gates are fixed; toggle the 0/1 input switches.
  // =================================================================

  // ---- gate logic ----------------------------------------------------
  var GATES = ["AND", "OR", "XOR", "NAND", "NOR", "XNOR"];
  var GATE_DESC = {
    AND: "1 only if BOTH inputs are 1",
    OR: "1 if EITHER input is 1",
    XOR: "1 if inputs DIFFER",
    NAND: "NOT AND — 0 only if both are 1",
    NOR: "NOT OR — 1 only if both are 0",
    XNOR: "1 if inputs are the SAME",
  };
  function applyGate(t, a, b) {
    switch (t) {
      case "AND": return a & b;
      case "OR": return a | b;
      case "XOR": return a ^ b;
      case "NAND": return a & b ? 0 : 1;
      case "NOR": return a | b ? 0 : 1;
      case "XNOR": return a === b ? 1 : 0;
    }
    return undefined;
  }

  // ---- tree builders -------------------------------------------------
  function I(v) { return { kind: "input", value: v }; }       // input (start value)
  function S(l, r) { return { kind: "gate", type: null, left: l, right: r }; } // empty slot
  function G(t, l, r) { return { kind: "gate", type: t, left: l, right: r }; } // fixed gate

  // ---- MODE: place gates (inputs fixed, drag gates) ------------------
  var LEVELS_GATES = [
    { name: "Warm Up",
      hint: "Drag the AND gate into the empty slot. AND of 1 and 1 is 1.",
      palette: { AND: 1 }, tree: S(I(1), I(1)) },
    { name: "Both Off",
      hint: "Both inputs are 0. Which gate outputs 1 when both inputs are 0?",
      palette: { NOR: 1, OR: 1 }, tree: S(I(0), I(0)) },
    { name: "Odd One Out",
      hint: "Inputs differ (1 and 0). XOR outputs 1 when its inputs differ.",
      palette: { XOR: 1, AND: 1 }, tree: S(I(1), I(0)) },
    { name: "Two in a Row",
      hint: "Make the lower gate output 1 from two 0s, then AND it with the 1.",
      palette: { NOR: 1, AND: 1 }, tree: S(S(I(0), I(0)), I(1)) },
    { name: "Balancing Act",
      hint: "Make both lower gates output 1, then AND them at the top.",
      palette: { XOR: 2, AND: 1 }, tree: S(S(I(1), I(0)), S(I(1), I(0))) },
    { name: "Flip & Combine",
      hint: "NAND(1,1)=0, NOR(0,0)=1 — then XOR those two.",
      palette: { NAND: 1, NOR: 1, XOR: 1 }, tree: S(S(I(1), I(1)), S(I(0), I(0))) },
    { name: "Spare Part",
      hint: "You have one gate too many — leave the decoy out. OR, NOR, then AND.",
      palette: { OR: 1, NOR: 1, AND: 1, XNOR: 1 }, tree: S(S(I(1), I(0)), S(I(0), I(0))) },
    { name: "Branching Out",
      hint: "Six inputs, five gates. Solve each pair first, then work toward the root.",
      palette: { XOR: 1, NAND: 2, XNOR: 1, AND: 1 },
      tree: S(S(S(I(1), I(0)), S(I(1), I(1))), S(I(0), I(0))) },
    { name: "Full House",
      hint: "Eight inputs, every gate type used once across the seven slots.",
      palette: { XOR: 1, AND: 2, NOR: 1, NAND: 1, XNOR: 1, OR: 1 },
      tree: S(S(S(I(1), I(0)), S(I(1), I(1))), S(S(I(0), I(0)), S(I(1), I(0)))) },
    { name: "Grand Circuit",
      hint: "Work left to right: solve each pair, then each junction, then the root.",
      palette: { XNOR: 1, XOR: 2, NAND: 1, OR: 1, AND: 2 },
      tree: S(S(S(I(0), I(1)), S(I(1), I(0))), S(S(I(1), I(0)), S(I(0), I(1)))) },
  ];

  // ---- MODE: set inputs (gates fixed, toggle the switches) -----------
  var LEVELS_INPUTS = [
    { name: "Switch On",
      hint: "Each switch cycles blank → 0 → 1 → 0… AND needs BOTH inputs at 1.",
      tree: G("AND", I(0), I(0)) },
    { name: "Make Them Differ",
      hint: "XOR lights only when the two inputs are DIFFERENT.",
      tree: G("XOR", I(0), I(0)) },
    { name: "Go Quiet",
      hint: "NOR lights only when BOTH inputs are 0.",
      tree: G("NOR", I(0), I(0)) },
    { name: "Two of Three",
      hint: "The AND needs the OR true AND the third switch at 1.",
      tree: G("AND", G("OR", I(0), I(0)), I(0)) },
    { name: "Two Conditions",
      hint: "The top AND needs both sides at 1: make the OR true AND the NAND true.",
      tree: G("AND", G("OR", I(0), I(0)), G("NAND", I(0), I(0))) },
    { name: "Match & Mix",
      hint: "XNOR wants equal inputs; the top XOR wants its two halves to differ.",
      tree: G("XOR", G("XNOR", I(0), I(0)), G("AND", I(0), I(0))) },
    { name: "Signal Chain",
      hint: "Trace backwards from the bulb: what does each gate need from its pair?",
      tree: G("AND", G("NAND", I(0), I(0)), G("XOR", I(0), I(0))) },
    { name: "Balance Test",
      hint: "XNOR lights when its two inputs match — make the NAND and the OR agree.",
      tree: G("XNOR", G("NAND", I(0), I(0)), G("OR", I(0), I(0))) },
    { name: "Crossroads",
      hint: "Root AND needs both halves: light the OR branch and match the XNOR pair.",
      tree: G("AND",
        G("OR", G("XOR", I(0), I(0)), G("AND", I(0), I(0))),
        G("XNOR", I(0), I(0))) },
    { name: "Full Board",
      hint: "Eight switches, fixed gates. Both halves must turn on to light the bulb.",
      tree: G("AND",
        G("AND", G("XOR", I(0), I(0)), G("NAND", I(0), I(0))),
        G("AND", G("NOR", I(0), I(0)), G("XNOR", I(0), I(0)))) },
  ];

  var LEVELS = { gates: LEVELS_GATES, inputs: LEVELS_INPUTS };

  // ---- state ---------------------------------------------------------
  var STORE_KEY = "logicgate_progress";
  var MODE_KEY = "logicgate_mode";
  var nodes = [];
  var rootId = 0, bulbId = 0, leafOrder = [];
  var maxCol = 0, maxRow = 0, leaves = 0;
  var palette = {};
  var levelIndex = 0;
  var solved = false;
  var mode = loadMode();
  var progress = loadProgress();

  function curLevels() { return LEVELS[mode]; }
  function prog() { return progress[mode]; }

  function loadMode() {
    try { var m = localStorage.getItem(MODE_KEY); if (m === "inputs" || m === "gates") return m; }
    catch (e) {}
    return "gates";
  }
  function loadProgress() {
    try {
      var p = JSON.parse(localStorage.getItem(STORE_KEY));
      if (p && p.gates && p.inputs) return p;
      if (p && typeof p.unlocked === "number") // migrate old single-mode format
        return { gates: { unlocked: p.unlocked, solved: p.solved || [] }, inputs: { unlocked: 0, solved: [] } };
    } catch (e) {}
    return { gates: { unlocked: 0, solved: [] }, inputs: { unlocked: 0, solved: [] } };
  }
  function saveProgress() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) {}
  }

  // ---- build working circuit from a level tree -----------------------
  function loadLevel(idx) {
    var lvls = curLevels();
    levelIndex = Math.max(0, Math.min(lvls.length - 1, idx));
    var lv = lvls[levelIndex];
    nodes = [];
    leafOrder = [];

    function rec(t) {
      var id = nodes.length;
      if (t.kind === "input") {
        nodes.push({ id: id, kind: "input", value: t.value, inputs: [] });
        leafOrder.push(id);
      } else {
        var node = { id: id, kind: "gate", type: t.type || null, inputs: [] };
        nodes.push(node);
        var l = rec(t.left), r = rec(t.right);
        node.inputs = [l, r];
      }
      return id;
    }
    rootId = rec(lv.tree);
    bulbId = nodes.length;
    nodes.push({ id: bulbId, kind: "bulb", inputs: [rootId] });

    leafOrder.forEach(function (id, i) {
      nodes[id].label = String.fromCharCode(65 + i);
    });

    // Set Inputs mode: every switch starts INACTIVE (blank). Clicking cycles it
    // blank → 0 → 1 → 0 → 1 …, so the player sets each one explicitly.
    if (mode === "inputs") {
      nodes.forEach(function (n) { if (n.kind === "input") n.value = undefined; });
    }

    palette = {};
    if (lv.palette) Object.keys(lv.palette).forEach(function (k) { palette[k] = lv.palette[k]; });
    solved = false;

    computeLayout();
    relayout();
    renderPalette();
    renderDots();
    document.getElementById("levelName").textContent =
      "Level " + (levelIndex + 1) + " — " + lv.name;
    hideWin();
  }

  // ---- layout --------------------------------------------------------
  function computeLayout() {
    leafOrder.forEach(function (id, i) { nodes[id].row = i; });
    function cr(id) {
      var n = nodes[id];
      if (n.kind === "input") { n.col = 0; return; }
      if (n.kind === "bulb") {
        cr(n.inputs[0]);
        var c = nodes[n.inputs[0]];
        n.col = c.col + 1; n.row = c.row; return;
      }
      n.inputs.forEach(cr);
      var a = nodes[n.inputs[0]], b = nodes[n.inputs[1]];
      n.col = Math.max(a.col, b.col) + 1;
      n.row = (a.row + b.row) / 2;
    }
    cr(bulbId);
    maxCol = 0; maxRow = 0; leaves = leafOrder.length;
    nodes.forEach(function (n) {
      if (n.col > maxCol) maxCol = n.col;
      if (n.row > maxRow) maxRow = n.row;
    });
  }

  function computePixels() {
    var board = document.getElementById("board");
    var W = board.clientWidth || 320;
    var rowH = Math.max(50, Math.min(86, Math.round(440 / Math.max(1, leaves))));
    var padX = Math.min(46, W * 0.08);
    var topPad = 18;
    var H = leaves * rowH + topPad * 2;
    board.style.height = H + "px";
    nodes.forEach(function (n) {
      n.x = padX + (maxCol === 0 ? 0 : (n.col / maxCol) * (W - 2 * padX));
      n.y = topPad + (n.row + 0.5) * rowH;
    });
    return { W: W, H: H };
  }

  // ---- evaluation ----------------------------------------------------
  function evaluate() {
    var memo = {};
    function ev(id) {
      if (id in memo) return memo[id];
      var n = nodes[id], v;
      if (n.kind === "input") v = n.value;
      else if (n.kind === "bulb") v = ev(n.inputs[0]);
      else if (!n.type) v = undefined;
      else {
        var a = ev(n.inputs[0]), b = ev(n.inputs[1]);
        v = a === undefined || b === undefined ? undefined : applyGate(n.type, a, b);
      }
      memo[id] = v;
      return v;
    }
    nodes.forEach(function (n) { ev(n.id); });
    return memo;
  }

  // ---- rendering -----------------------------------------------------
  var HALF = { input: 24, gate: 41, bulb: 30 };
  function halfW(n) { return HALF[n.kind]; }

  function relayout() {
    var dim = computePixels();
    render(dim);
  }

  function render(dim) {
    var memo = evaluate();
    var board = document.getElementById("board");
    var W = dim ? dim.W : board.clientWidth;
    var H = dim ? dim.H : board.clientHeight;

    // wires
    var paths = "";
    nodes.forEach(function (n) {
      if (n.kind === "input") return;
      n.inputs.forEach(function (cid, i) {
        var c = nodes[cid];
        var x1 = c.x + halfW(c), y1 = c.y, x2, y2;
        if (n.kind === "bulb") { x2 = n.x - halfW(n); y2 = n.y; }
        else { x2 = n.x - halfW(n); y2 = n.y + (i === 0 ? -11 : 11); }
        var dx = Math.max(24, (x2 - x1) * 0.5);
        var d = "M" + x1 + " " + y1 + " C" + (x1 + dx) + " " + y1 + " " +
          (x2 - dx) + " " + y2 + " " + x2 + " " + y2;
        var v = memo[cid];
        var cls = v === 1 ? "w-on" : v === 0 ? "w-off" : "w-none";
        paths += '<path class="wire ' + cls + '" d="' + d + '"/>';
      });
    });
    var svg = document.getElementById("wires");
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.innerHTML = paths;

    // nodes
    var html = "";
    nodes.forEach(function (n) {
      var v = memo[n.id];
      var style = "left:" + n.x + "px;top:" + n.y + "px";
      if (n.kind === "input") {
        var st = v === 1 ? "on" : v === 0 ? "off" : "inactive";
        var bit = v === undefined ? "–" : v;
        html += '<div class="node input ' + st +
          (mode === "inputs" ? " toggle" : "") + '" data-id="' + n.id +
          '" style="' + style + '"><span class="lbl">' + n.label +
          '</span><span class="bit">' + bit + "</span></div>";
      } else if (n.kind === "bulb") {
        html += '<div class="node bulb ' + (v === 1 ? "lit" : "") +
          '" style="' + style + '">' +
          '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M9 21h6v-1H9v1zm3-19a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>' +
          "</div>";
      } else if (n.type) {
        html += '<div class="node gate filled g-' + n.type +
          (mode === "inputs" ? " fixed" : "") + '" data-id="' + n.id +
          '" data-type="' + n.type + '" style="' + style + '"><span class="gname">' +
          n.type + '</span><span class="gout">' + (v === undefined ? "?" : v) +
          "</span></div>";
      } else {
        html += '<div class="node gate slot" data-id="' + n.id +
          '" style="' + style + '"><span class="qmark">?</span></div>';
      }
    });
    var overlay = document.getElementById("nodes");
    overlay.innerHTML = html;
    if (mode === "gates") {
      overlay.querySelectorAll(".gate.filled").forEach(function (el) {
        el.addEventListener("pointerdown", onGatePointerDown);
      });
    } else {
      overlay.querySelectorAll(".input.toggle").forEach(function (el) {
        el.addEventListener("click", onInputToggle);
      });
    }

    updateStatus(memo);
  }

  function renderPalette() {
    var pal = document.getElementById("palette");
    if (mode === "inputs") { pal.style.display = "none"; pal.innerHTML = ""; return; }
    pal.style.display = "";
    var html = "";
    GATES.forEach(function (t) {
      if (!(t in palette)) return;
      var n = palette[t] || 0;
      html += '<div class="chip g-' + t + (n === 0 ? " empty" : "") +
        '" data-type="' + t + '" title="' + GATE_DESC[t] + '">' +
        '<span class="cname">' + t + "</span>" +
        '<span class="ccount">×' + n + "</span></div>";
    });
    if (!html) html = '<span class="pal-empty">all gates placed</span>';
    pal.innerHTML = html;
    pal.querySelectorAll(".chip").forEach(function (el) {
      el.addEventListener("pointerdown", onChipPointerDown);
    });
  }

  function renderDots() {
    var dots = document.getElementById("levelDots");
    var lvls = curLevels(), p = prog();
    var html = "";
    for (var i = 0; i < lvls.length; i++) {
      var st = i === levelIndex ? "cur" :
        p.solved[i] ? "done" :
        i <= p.unlocked ? "open" : "locked";
      html += '<button class="dot ' + st + '" data-idx="' + i + '" ' +
        (st === "locked" ? "disabled" : "") + ' aria-label="Level ' + (i + 1) +
        '">' + (p.solved[i] ? "✓" : i + 1) + "</button>";
    }
    dots.innerHTML = html;
    dots.querySelectorAll(".dot:not(.locked)").forEach(function (el) {
      el.addEventListener("click", function () {
        loadLevel(parseInt(el.dataset.idx, 10));
      });
    });
  }

  function gatesLeftToPlace() {
    var c = 0;
    nodes.forEach(function (n) { if (n.kind === "gate" && !n.type) c++; });
    return c;
  }

  function updateStatus(memo) {
    var out = memo[bulbId];
    var status = document.getElementById("status");
    if (out === 1) {
      status.textContent = "✓ Circuit complete — the bulb is lit!";
      status.className = "win";
      if (!solved) onSolved();
    } else {
      if (mode === "gates") {
        var left = gatesLeftToPlace();
        status.textContent = left > 0
          ? left + " gate" + (left === 1 ? "" : "s") + " left to place"
          : "Bulb is OFF — rearrange the gates";
      } else {
        var unset = 0;
        nodes.forEach(function (n) { if (n.kind === "input" && n.value === undefined) unset++; });
        status.textContent = unset > 0
          ? unset + " switch" + (unset === 1 ? "" : "es") + " still unset — click to set 0/1"
          : "Bulb is OFF — flip the values to light it";
      }
      status.className = "";
    }
    document.getElementById("nextBtn").disabled =
      !(prog().solved[levelIndex] || out === 1) || levelIndex >= curLevels().length - 1;
  }

  function onSolved() {
    solved = true;
    var p = prog();
    p.solved[levelIndex] = true;
    if (levelIndex + 1 > p.unlocked) p.unlocked = levelIndex + 1;
    saveProgress();
    renderDots();
    sfxWin();
    showWin();
  }

  // ---- win banner ----------------------------------------------------
  function showWin() {
    document.getElementById("winBanner").classList.add("show");
    var last = levelIndex >= curLevels().length - 1;
    document.getElementById("winNext").textContent = last ? "Replay" : "Next level →";
    document.getElementById("winMsg").textContent = last
      ? "You finished every circuit! 🏆" : "Nice solve!";
  }
  function hideWin() { document.getElementById("winBanner").classList.remove("show"); }

  // ---- input toggle (Set-Inputs mode) --------------------------------
  function onInputToggle(e) {
    var id = parseInt(e.currentTarget.dataset.id, 10);
    var v = nodes[id].value;
    nodes[id].value = v === undefined ? 0 : v === 0 ? 1 : 0; // blank→0→1→0…
    tone(nodes[id].value ? 540 : 340, 0.06, "square", 0.11);
    relayout();
  }

  // ---- drag & drop (Place-Gates mode) --------------------------------
  var drag = null;
  function onChipPointerDown(e) {
    var type = e.currentTarget.dataset.type;
    if (!palette[type]) return;
    beginDrag(type, { kind: "palette" }, e);
  }
  function onGatePointerDown(e) {
    var el = e.currentTarget;
    var id = parseInt(el.dataset.id, 10);
    var type = el.dataset.type;
    nodes[id].type = null;
    beginDrag(type, { kind: "slot", nodeId: id, origType: type }, e);
    relayout();
  }
  function beginDrag(type, source, e) {
    e.preventDefault();
    var ghost = document.createElement("div");
    ghost.className = "drag-ghost node gate filled g-" + type;
    ghost.innerHTML = '<span class="gname">' + type + "</span>";
    document.body.appendChild(ghost);
    drag = { type: type, source: source, ghost: ghost };
    moveGhost(e.clientX, e.clientY);
    document.addEventListener("pointermove", onDragMove);
    document.addEventListener("pointerup", onDragEnd);
    document.addEventListener("pointercancel", onDragEnd);
  }
  function moveGhost(x, y) { drag.ghost.style.left = x + "px"; drag.ghost.style.top = y + "px"; }
  function onDragMove(e) {
    if (!drag) return;
    e.preventDefault();
    moveGhost(e.clientX, e.clientY);
    drag.ghost.style.display = "none";
    var under = document.elementFromPoint(e.clientX, e.clientY);
    drag.ghost.style.display = "";
    document.querySelectorAll(".gate.hot").forEach(function (el) { el.classList.remove("hot"); });
    // any gate (empty slot OR placed gate) is a valid drop target
    var g = under && under.closest ? under.closest(".gate") : null;
    if (g) g.classList.add("hot");
  }
  function onDragEnd(e) {
    if (!drag) return;
    document.removeEventListener("pointermove", onDragMove);
    document.removeEventListener("pointerup", onDragEnd);
    document.removeEventListener("pointercancel", onDragEnd);
    drag.ghost.style.display = "none";
    var under = document.elementFromPoint(e.clientX, e.clientY);
    drag.ghost.style.display = "";

    var gateEl = under && under.closest ? under.closest(".gate") : null;
    var ontoPalette = under && under.closest ? under.closest("#palette") : null;
    var type = drag.type, source = drag.source;
    var target = gateEl ? nodes[parseInt(gateEl.dataset.id, 10)] : null;

    if (target && target.type == null) {
      // drop into an empty slot
      target.type = type;
      if (source.kind === "palette") palette[type]--;
      sfxPlace();
    } else if (target) {
      // drop onto a FILLED gate → swap (placed source) or replace (palette source)
      var displaced = target.type;
      target.type = type;
      if (source.kind === "palette") {
        palette[type]--;                                    // dragged gate consumed
        palette[displaced] = (palette[displaced] || 0) + 1; // bumped gate returns to tray
      } else {
        nodes[source.nodeId].type = displaced;              // the two placed gates swap
      }
      sfxPlace();
    } else if (ontoPalette) {
      // dropped on the tray → remove (only meaningful for a placed-gate source)
      if (source.kind === "slot") palette[type] = (palette[type] || 0) + 1;
      sfxLift();
    } else if (source.kind === "slot") {
      // dropped in the void → snap the placed gate back where it was
      nodes[source.nodeId].type = source.origType;
    }

    if (drag.ghost.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);
    drag = null;
    document.querySelectorAll(".gate.hot").forEach(function (el) { el.classList.remove("hot"); });
    renderPalette();
    relayout();
  }

  // ---- sound ---------------------------------------------------------
  var _ac = null;
  function ac() {
    try {
      if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
      if (_ac.state === "suspended") _ac.resume();
      return _ac;
    } catch (e) { return null; }
  }
  function tone(f, dur, type, vol, when) {
    var c = ac(); if (!c) return;
    var t = c.currentTime + (when || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t);
    o.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.16, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function sfxPlace() { tone(440, 0.07, "square", 0.12); }
  function sfxLift() { tone(240, 0.07, "sine", 0.1); }
  function sfxWin() { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.22, "triangle", 0.18, i * 0.1); }); }

  // ---- controls ------------------------------------------------------
  function resetLevel() { loadLevel(levelIndex); }
  function nextLevel() {
    if (levelIndex < curLevels().length - 1) loadLevel(levelIndex + 1);
    else loadLevel(levelIndex);
  }
  function prevLevel() { if (levelIndex > 0) loadLevel(levelIndex - 1); }

  var hintOpen = false;
  function toggleHint() {
    hintOpen = !hintOpen;
    var h = document.getElementById("hint");
    h.textContent = hintOpen ? "💡 " + curLevels()[levelIndex].hint : "";
    h.classList.toggle("show", hintOpen);
    document.getElementById("hintBtn").classList.toggle("active", hintOpen);
  }

  var helpOpen = false;
  function toggleHelp() {
    helpOpen = !helpOpen;
    document.getElementById("helpPanel").classList.toggle("show", helpOpen);
  }

  // ---- mode picker ---------------------------------------------------
  var MODES = [
    { id: "gates", label: "🧩 Place Gates" },
    { id: "inputs", label: "🎚️ Set Inputs" },
  ];
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    try { localStorage.setItem(MODE_KEY, m); } catch (e) {}
    document.body.dataset.lgMode = m;
    hintOpen = false;
    document.getElementById("hint").classList.remove("show");
    document.getElementById("hintBtn").classList.remove("active");
    renderModeBar();
    loadLevel(Math.min(prog().unlocked, curLevels().length - 1));
  }
  function renderModeBar() {
    var bar = document.getElementById("modeBar");
    var html = "";
    MODES.forEach(function (m) {
      html += '<button class="mode-btn' + (m.id === mode ? " active" : "") +
        '" data-mode="' + m.id + '" type="button">' + m.label + "</button>";
    });
    bar.innerHTML = html;
    bar.querySelectorAll(".mode-btn").forEach(function (el) {
      el.addEventListener("click", function () { setMode(el.dataset.mode); });
    });
  }

  // ---- theme picker --------------------------------------------------
  var THEMES = [
    { id: "circuit", label: "Circuit", sw: "#2bffb0" },
    { id: "blueprint", label: "Blueprint", sw: "#5cd6ff" },
    { id: "terminal", label: "Terminal", sw: "#ffb347" },
    { id: "breadboard", label: "Breadboard", sw: "#1f9d57" },
  ];
  var THEME_KEY = "logicgate_theme";
  function currentTheme() { return document.documentElement.getAttribute("data-theme") || "circuit"; }
  function applyTheme(id) {
    document.documentElement.setAttribute("data-theme", id);
    try { localStorage.setItem(THEME_KEY, id); } catch (e) {}
    renderThemeBar();
  }
  function renderThemeBar() {
    var bar = document.getElementById("themeBar");
    var cur = currentTheme();
    var html = '<span class="tlabel">THEME</span>';
    THEMES.forEach(function (t) {
      html += '<button class="theme-btn' + (t.id === cur ? " active" : "") +
        '" data-theme-id="' + t.id + '" type="button">' +
        '<span class="sw" style="background:' + t.sw + '"></span>' + t.label + "</button>";
    });
    bar.innerHTML = html;
    bar.querySelectorAll(".theme-btn").forEach(function (el) {
      el.addEventListener("click", function () { applyTheme(el.dataset.themeId); });
    });
  }

  // ---- init ----------------------------------------------------------
  function init() {
    var legend = GATES.map(function (t) {
      return '<div class="leg g-' + t + '"><b>' + t + "</b><span>" + GATE_DESC[t] + "</span></div>";
    }).join("");
    document.getElementById("helpPanel").innerHTML =
      "<h3>How logic gates work</h3>" + legend +
      '<p class="leg-foot">A 1 (lit) or 0 (dark) flows down each wire. ' +
      "Light the bulb by placing gates — or, in Set Inputs mode, by clicking each " +
      "switch to cycle it blank → 0 → 1 → 0…</p>";

    document.getElementById("resetBtn").addEventListener("click", resetLevel);
    document.getElementById("hintBtn").addEventListener("click", toggleHint);
    document.getElementById("helpBtn").addEventListener("click", toggleHelp);
    document.getElementById("prevBtn").addEventListener("click", prevLevel);
    document.getElementById("nextBtn").addEventListener("click", nextLevel);
    document.getElementById("winNext").addEventListener("click", nextLevel);

    document.body.dataset.lgMode = mode;
    renderModeBar();
    renderThemeBar();

    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(relayout, 120);
    });

    loadLevel(Math.min(prog().unlocked, curLevels().length - 1));
  }

  window.__LOGICGATE_TEST__ = {
    LEVELS_GATES: LEVELS_GATES, LEVELS_INPUTS: LEVELS_INPUTS, applyGate: applyGate,
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
