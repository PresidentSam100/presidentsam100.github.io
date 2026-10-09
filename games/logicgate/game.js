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

  // A circuit where one signal feeds several gates (a split) isn't a nested
  // tree, so those levels list their nodes instead: an input ("0" / "1"), an
  // empty slot ("? a b") or a fixed gate ("AND a b"), where a and b are the
  // indexes of earlier entries, and the last entry is the root. An entry used
  // twice is one shared object, which loadLevel builds as one node.
  function fromNet(list) {
    var made = [];
    list.forEach(function (s) {
      var p = s.split(" ");
      if (p.length === 1) made.push(I(+p[0]));
      else if (p[0] === "?") made.push(S(made[+p[1]], made[+p[2]]));
      else made.push(G(p[0], made[+p[1]], made[+p[2]]));
    });
    return made[made.length - 1];
  }

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
    { name: "Loose End",
      hint: "Eight inputs, seven slots — but the tray holds eight gates. Solve the circuit, then see which one you didn't need.",
      palette: { OR: 4, AND: 1, NAND: 1, XNOR: 1, XOR: 1 },
      tree: S(S(S(I(0), I(1)), S(I(1), I(1))), S(S(I(0), I(1)), S(I(1), I(1)))) },
    { name: "Nine Lives",
      hint: "Nine inputs on a lopsided tree — the left branch is short, the right one runs deep. Solve each side, then combine.",
      palette: { OR: 2, NAND: 1, XOR: 2, XNOR: 1, AND: 2 },
      tree: S(S(S(I(0), I(1)), I(0)), S(S(S(I(0), I(0)), I(0)), S(S(I(0), I(0)), I(0)))) },
    { name: "Tight Fit",
      hint: "Nine inputs, eight slots, one spare gate. Four levels deep — work from the leaves inward.",
      palette: { OR: 1, XOR: 2, XNOR: 2, NAND: 2, NOR: 1, AND: 1 },
      tree: S(S(S(S(I(1), I(1)), I(0)), S(I(1), I(0))), S(S(I(1), I(0)), S(I(0), I(0)))) },
    { name: "Ten Strong",
      hint: "Ten inputs, no spares. Solve every leaf pair first, then the level above, then the root.",
      palette: { NAND: 2, OR: 3, AND: 1, XOR: 1, XNOR: 2 },
      tree: S(S(S(S(I(0), I(1)), I(0)), S(I(0), I(0))), S(S(S(I(1), I(1)), I(0)), S(I(0), I(0)))) },
    { name: "Padded Out",
      hint: "Ten inputs on an uneven tree, plus one decoy gate. Trace each branch to the root before you commit a gate.",
      palette: { OR: 2, XOR: 2, XNOR: 2, NAND: 1, AND: 2, NOR: 1 },
      tree: S(S(S(I(0), I(1)), S(I(1), I(0))), S(S(S(I(1), I(0)), I(1)), S(S(I(0), I(0)), I(1)))) },
    { name: "Eleven Up",
      hint: "Eleven inputs, no spares, lopsided again. The short branch settles fast — spend your effort on the long one.",
      palette: { XNOR: 2, OR: 3, NOR: 1, NAND: 1, AND: 2, XOR: 1 },
      tree: S(S(S(I(1), I(1)), S(I(1), I(0))), S(S(S(I(0), I(0)), S(I(0), I(1))), S(S(I(0), I(1)), I(0)))) },
    { name: "Crowded Tray",
      hint: "Eleven inputs, ten slots, and two decoys crowding the tray. Don't let the extras throw off your plan.",
      palette: { OR: 3, XNOR: 2, NAND: 3, AND: 2, XOR: 1, NOR: 1 },
      tree: S(S(S(S(I(0), I(1)), I(1)), S(S(I(0), I(0)), I(0))), S(S(S(I(1), I(0)), I(1)), S(I(0), I(1)))) },
    { name: "Twelve Points",
      hint: "Twelve inputs, no spares — the biggest balanced tree yet. Bottom-up, one pair at a time.",
      palette: { XNOR: 3, OR: 2, XOR: 3, NAND: 1, AND: 2 },
      tree: S(S(S(S(I(1), I(1)), I(1)), S(S(I(0), I(0)), I(0))), S(S(S(I(0), I(0)), I(0)), S(S(I(1), I(0)), I(1)))) },
    { name: "Dozen Plus One",
      hint: "Twelve inputs on an uneven tree, plus a spare gate. Solve it fully, then spot the leftover.",
      palette: { AND: 4, XOR: 1, OR: 3, NAND: 2, NOR: 1, XNOR: 1 },
      tree: S(S(S(I(1), I(1)), S(I(0), I(1))), S(S(S(I(1), I(1)), S(I(0), I(1))), S(S(I(1), I(0)), S(I(0), I(0))))) },
    { name: "Master Circuit",
      hint: "Fourteen inputs, thirteen slots, no spares — the biggest circuit yet. Every gate type is in play; work in from the leaves.",
      palette: { XOR: 2, NAND: 1, AND: 3, NOR: 2, OR: 3, XNOR: 2 },
      tree: S(S(S(S(I(0), I(1)), S(I(1), I(0))), S(S(I(0), I(0)), I(0))), S(S(S(I(1), I(1)), S(I(1), I(0))), S(S(I(0), I(0)), I(1)))) },
    { name: "NAND Land",
      hint: "Three NANDs do all the work — the AND is bait. NAND is 0 only when both inputs are 1.",
      palette: { NAND: 3, AND: 1 }, tree: S(S(I(1), I(1)), S(I(0), I(1))) },
    { name: "Parity Check",
      hint: "Only XOR and XNOR — pure parity, with one spare. Track whether each branch keeps or flips the signal.",
      palette: { XOR: 3, XNOR: 2 }, tree: S(S(I(1), I(0)), S(S(I(0), I(0)), I(1))) },
    { name: "Decoy Parade",
      hint: "Three slots, seven gates — most of the tray is bait. Solve the circuit on paper first.",
      palette: { AND: 2, NOR: 2, XOR: 1, OR: 1, XNOR: 1 }, tree: S(S(I(0), I(1)), S(I(1), I(1))) },
    { name: "Long Ladder",
      hint: "One skinny chain, four rungs deep. Each gate feeds the next — start at the bottom.",
      palette: { OR: 1, NOR: 1, AND: 1, XNOR: 1 }, tree: S(S(S(S(I(1), I(0)), I(0)), I(1)), I(1)) },
    { name: "Twin Ladders",
      hint: "Two chains meet at the root, with two spare gates in the tray. Climb each chain from its deepest gate.",
      palette: { NOR: 2, OR: 2, AND: 2, XOR: 1 }, tree: S(S(S(I(0), I(0)), I(1)), S(S(I(1), I(1)), I(0))) },
    { name: "Mirror Trap",
      hint: "The two halves look identical — but their inputs differ. Don't mirror your gates blindly.",
      palette: { AND: 2, NOR: 2, XOR: 2, OR: 1 },
      tree: S(S(S(I(1), I(1)), S(I(0), I(0))), S(S(I(1), I(0)), S(I(0), I(0)))) },
    { name: "All Sixes",
      hint: "Every gate type appears exactly once — six slots, six gates, no repeats and no spares.",
      palette: { AND: 1, OR: 1, XOR: 1, NAND: 1, NOR: 1, XNOR: 1 },
      tree: S(S(S(I(1), I(0)), I(1)), S(S(I(0), I(0)), S(I(1), I(1)))) },
    { name: "Heavy Right",
      hint: "The right branch runs four levels deep. Settle the little left side, then dig.",
      palette: { OR: 2, NAND: 2, XNOR: 1, AND: 1, NOR: 1 },
      tree: S(S(I(1), I(0)), S(S(S(S(I(0), I(1)), I(0)), I(1)), S(I(0), I(0)))) },
    { name: "NOR More",
      hint: "Five NORs and one impostor. Two zeros make a one; any one makes a zero.",
      palette: { NOR: 5, OR: 1 }, tree: S(S(S(I(0), I(0)), S(I(1), I(0))), S(I(1), I(0))) },
    { name: "Zeros to Hero",
      hint: "Every single input is 0. Manufacture ones out of nothing and combine them.",
      palette: { NOR: 3, AND: 1, XNOR: 2, OR: 1 },
      tree: S(S(S(I(0), I(0)), I(0)), S(S(I(0), I(0)), S(I(0), I(0)))) },
    { name: "Ones Upon a Time",
      hint: "All eight inputs are 1. NAND is your friend for making zeros on demand.",
      palette: { NAND: 3, AND: 2, NOR: 1, OR: 1 },
      tree: S(S(S(I(1), I(1)), S(I(1), I(1))), S(S(I(1), I(1)), S(I(1), I(1)))) },
    { name: "Checkerboard",
      hint: "Inputs alternate 1,0,1,0… — a parade of differing pairs. This is XOR country.",
      palette: { XOR: 4, AND: 2, OR: 1 },
      tree: S(S(S(I(1), I(0)), S(I(1), I(0))), S(S(I(1), I(0)), S(I(1), I(0)))) },
    { name: "Crowd Control",
      hint: "Eleven slots and three decoys in a packed tray. Plan every branch before placing a thing.",
      palette: { OR: 3, AND: 3, NOR: 2, XOR: 3, NAND: 2, XNOR: 1 },
      tree: S(S(S(S(I(0), I(1)), I(1)), S(I(0), I(0))), S(S(S(I(1), I(1)), I(0)), S(S(I(0), I(1)), S(I(1), I(0))))) },
    { name: "Threadbare",
      hint: "Thirteen inputs, twelve slots, not one spare. Misplace a gate and you'll unpick the lot.",
      palette: { OR: 3, XOR: 2, XNOR: 2, AND: 2, NAND: 2, NOR: 1 },
      tree: S(S(S(S(I(1), I(0)), S(I(0), I(0))), S(S(I(1), I(1)), I(0))), S(S(S(I(0), I(1)), I(1)), S(S(I(0), I(0)), I(1)))) },
    { name: "Spare Pair",
      hint: "Thirteen inputs and two spare gates. The decoys are convincing — trust your trace, not the tray.",
      palette: { AND: 3, OR: 3, NAND: 2, XNOR: 2, XOR: 3, NOR: 1 },
      tree: S(S(S(I(1), I(1)), S(I(0), I(1))), S(S(S(I(0), I(0)), S(I(1), I(0))), S(S(I(1), I(0)), S(S(I(0), I(1)), I(0))))) },
    { name: "Pyramid Scheme",
      hint: "A perfect three-level pyramid — eight inputs, seven slots. Symmetric shape, asymmetric answer.",
      palette: { NOR: 2, XOR: 2, AND: 1, OR: 1, NAND: 1 },
      tree: S(S(S(I(0), I(0)), S(I(1), I(1))), S(S(I(0), I(1)), S(I(0), I(0)))) },
    { name: "The Long Way",
      hint: "A deep spine with twigs, and one spare. Follow the spine from the deepest pair upward.",
      palette: { OR: 2, NAND: 2, AND: 2, NOR: 1, XNOR: 1 },
      tree: S(S(S(S(S(I(0), I(1)), I(0)), I(1)), S(I(0), I(0))), S(I(1), I(1))) },
    { name: "Fourteen Forks",
      hint: "Fourteen inputs across every kind of junction. No spares — inventory is destiny.",
      palette: { OR: 4, AND: 3, XOR: 2, NAND: 2, XNOR: 1, NOR: 1 },
      tree: S(S(S(S(I(0), I(1)), S(I(1), I(1))), S(S(I(0), I(0)), I(1))), S(S(S(I(1), I(0)), I(0)), S(S(I(0), I(1)), S(I(1), I(0))))) },
    { name: "Almost There",
      hint: "Fifteen inputs on a crooked tree, one decoy. The biggest tree is next door — earn it.",
      palette: { OR: 3, AND: 3, NAND: 3, XOR: 2, XNOR: 2, NOR: 2 },
      tree: S(S(S(S(I(1), I(0)), I(1)), S(S(I(0), I(0)), S(I(1), I(1)))), S(S(S(I(0), I(1)), S(I(0), I(0))), S(S(S(I(1), I(0)), I(0)), I(1)))) },
    { name: "The Gauntlet",
      hint: "Sixteen inputs, fifteen slots, two decoys — the last and biggest tree before the splits. Take your time; the bulb can wait.",
      palette: { OR: 4, AND: 3, NAND: 3, XOR: 3, XNOR: 2, NOR: 2 },
      tree: S(S(S(S(I(1), I(0)), S(I(0), I(0))), S(S(I(1), I(1)), S(I(0), I(1)))), S(S(S(I(0), I(0)), S(I(1), I(0))), S(S(I(0), I(1)), S(I(1), I(1))))) },
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
    { name: "Eight Again",
      hint: "Eight switches again, fresh gates this time. Work out each small gate, then the level above, then the root.",
      tree: G("OR",
        G("AND", G("XNOR", I(0), I(0)), G("XNOR", I(0), I(0))),
        G("NOR", G("XOR", I(0), I(0)), G("OR", I(0), I(0)))) },
    { name: "Off Balance",
      hint: "Nine switches on a lopsided tree — one branch is short, the other runs deep. Solve the short one first.",
      tree: G("XNOR",
        G("NAND", G("XOR", I(0), I(0)), I(0)),
        G("NOR",
          G("OR", G("XNOR", I(0), I(0)), I(0)),
          G("OR", G("AND", I(0), I(0)), I(0)))) },
    { name: "Wide Load",
      hint: "Ten switches across a wide, four-level tree. Solve every deep pair before you touch a switch.",
      tree: G("NOR",
        G("NOR", G("AND", G("NAND", I(0), I(0)), I(0)), G("NOR", I(0), I(0))),
        G("XOR", G("XNOR", G("OR", I(0), I(0)), I(0)), G("XOR", I(0), I(0)))) },
    { name: "One More Layer",
      hint: "Ten switches, uneven branches. Trace the long branch all the way down before deciding anything.",
      tree: G("NOR",
        G("NAND", G("OR", I(0), I(0)), G("XNOR", I(0), I(0))),
        G("NOR",
          G("NOR", G("OR", I(0), I(0)), I(0)),
          G("XNOR", G("OR", I(0), I(0)), I(0)))) },
    { name: "Eleven Deep",
      hint: "Eleven switches, four levels deep on both sides. Patience — work from the deepest gates outward.",
      tree: G("AND",
        G("XNOR", G("XNOR", G("XOR", I(0), I(0)), I(0)), G("NOR", G("XOR", I(0), I(0)), I(0))),
        G("AND", G("XNOR", G("XOR", I(0), I(0)), I(0)), G("OR", I(0), I(0)))) },
    { name: "Twelve Corners",
      hint: "Twelve switches, one heavy branch and one light one. Settle the light branch, then focus on the rest.",
      tree: G("OR",
        G("NOR", G("XOR", I(0), I(0)), G("OR", I(0), I(0))),
        G("AND",
          G("NOR", G("XNOR", I(0), I(0)), G("NOR", I(0), I(0))),
          G("AND", G("XNOR", I(0), I(0)), G("NOR", I(0), I(0))))) },
    { name: "Signal Storm",
      hint: "Twelve switches, every gate type in play. Track each branch back from the bulb before flipping a switch.",
      tree: G("NOR",
        G("AND", G("OR", G("XNOR", I(0), I(0)), I(0)), G("OR", G("XOR", I(0), I(0)), I(0))),
        G("NAND", G("NAND", G("OR", I(0), I(0)), I(0)), G("XNOR", G("AND", I(0), I(0)), I(0)))) },
    { name: "Thirteen Notes",
      hint: "Thirteen switches on an uneven tree. Follow the long branch to its very end before you commit.",
      tree: G("AND",
        G("NOR", G("NOR", G("OR", I(0), I(0)), I(0)), G("OR", I(0), I(0))),
        G("AND",
          G("XOR", G("XOR", I(0), I(0)), G("AND", I(0), I(0))),
          G("NAND", G("XNOR", I(0), I(0)), G("NOR", I(0), I(0))))) },
    { name: "Fourteen Threads",
      hint: "Fourteen switches, deep on both sides. Take it one small gate at a time — there's no shortcut.",
      tree: G("NOR",
        G("XOR",
          G("XNOR", G("NAND", I(0), I(0)), G("NOR", I(0), I(0))),
          G("NAND", G("OR", I(0), I(0)), I(0))),
        G("NAND",
          G("NAND", G("XOR", I(0), I(0)), G("NAND", I(0), I(0))),
          G("AND", G("XNOR", I(0), I(0)), I(0)))) },
    { name: "Grand Grid",
      hint: "Fourteen switches, five levels deep — the toughest board yet. Work outward from the deepest gate.",
      tree: G("NOR",
        G("OR", G("NAND", G("OR", I(0), I(0)), I(0)), G("NAND", I(0), I(0))),
        G("XOR",
          G("NAND", G("NOR", G("NOR", I(0), I(0)), I(0)), G("AND", I(0), I(0))),
          G("XNOR", G("XOR", I(0), I(0)), G("NAND", I(0), I(0))))) },
    { name: "Fresh Start",
      hint: "Five switches, three gates — a breather after that grid. Work back from the bulb.",
      tree: G("AND", G("XOR", I(0), I(0)), G("NOR", I(0), G("OR", I(0), I(0)))) },
    { name: "Down the Well",
      hint: "A single chain, five gates deep. Decide the bottom pair, then ride the signal up.",
      tree: G("NOR", G("NAND", G("OR", G("AND", G("XOR", I(0), I(0)), I(0)), I(0)), I(0)), I(0)) },
    { name: "Odd Ones In",
      hint: "All XORs — pure parity. The bulb lights only if an ODD number of switches are 1.",
      tree: G("XOR", G("XOR", G("XOR", I(0), I(0)), G("XOR", I(0), I(0))), G("XOR", I(0), I(0))) },
    { name: "NAND Cascade",
      hint: "All NANDs. Remember: a NAND is 0 only when both of its feeders are 1.",
      tree: G("NAND", G("NAND", G("NAND", I(0), I(0)), I(0)), G("NAND", I(0), G("NAND", I(0), I(0)))) },
    { name: "Silent Circuit",
      hint: "All NORs. Zeros are loud here — a single 1 silences any gate it touches.",
      tree: G("NOR", G("NOR", G("NOR", I(0), I(0)), G("NOR", I(0), I(0))), G("NOR", G("NOR", I(0), I(0)), I(0))) },
    { name: "Split Decision",
      hint: "Nine switches. The root XOR wants exactly one live branch — pick which, and commit.",
      tree: G("XOR",
        G("AND", G("OR", I(0), I(0)), G("NAND", I(0), I(0))),
        G("NOR", G("XNOR", I(0), I(0)), G("OR", I(0), G("AND", I(0), I(0))))) },
    { name: "Matched Set",
      hint: "The root XNOR needs its two big branches to AGREE. Both dark counts as agreeing.",
      tree: G("XNOR",
        G("NAND", G("XOR", I(0), I(0)), G("OR", I(0), I(0))),
        G("AND", G("NOR", I(0), I(0)), G("XNOR", I(0), I(0)))) },
    { name: "Ten Gates Ten",
      hint: "Ten switches, ten gates, four levels. Write down what each deep gate must output.",
      tree: G("AND",
        G("OR", G("NAND", G("AND", I(0), I(0)), I(0)), G("NOR", I(0), I(0))),
        G("NAND", G("XNOR", I(0), G("XOR", I(0), I(0))), G("OR", I(0), I(0)))) },
    { name: "Duelling Chains",
      hint: "Two deep chains under one root NOR — both chains must end dark.",
      tree: G("NOR",
        G("NAND", G("OR", G("XOR", I(0), I(0)), I(0)), I(0)),
        G("AND", G("NOR", G("XNOR", I(0), I(0)), I(0)), I(0))) },
    { name: "Eleven's Edge",
      hint: "Eleven switches on a crooked frame. Check what the root NOR actually needs first.",
      tree: G("NOR",
        G("AND", G("XOR", I(0), I(0)), G("OR", I(0), G("NOR", I(0), I(0)))),
        G("XNOR", G("NOR", I(0), G("AND", I(0), I(0))), G("OR", I(0), G("NAND", I(0), I(0))))) },
    { name: "Even Steven",
      hint: "An XNOR tower — parity again, but this time it must come out EVEN all the way up.",
      tree: G("XNOR",
        G("XNOR", G("XNOR", I(0), I(0)), I(0)),
        G("XNOR", G("XNOR", I(0), I(0)), G("XNOR", I(0), I(0)))) },
    { name: "Gatekeeper's Dozen",
      hint: "Twelve switches. Both halves of the root AND must light — no shortcuts here.",
      tree: G("AND",
        G("NOR", G("OR", G("XOR", I(0), I(0)), I(0)), G("AND", I(0), G("XNOR", I(0), I(0)))),
        G("NAND", G("NAND", I(0), G("OR", I(0), I(0))), G("NOR", I(0), G("AND", I(0), I(0))))) },
    { name: "Flip Factory",
      hint: "NANDs and NORs everywhere — every level inverts. Count your flips carefully.",
      tree: G("NOR",
        G("NAND", G("NOR", I(0), G("NAND", I(0), I(0))), G("NAND", I(0), I(0))),
        G("NOR", G("NAND", I(0), I(0)), G("NOR", I(0), I(0)))) },
    { name: "Thirteen Steps",
      hint: "Thirteen switches, five levels. Anchor the deepest gate first and never revisit it.",
      tree: G("AND",
        G("AND", G("OR", G("NAND", G("AND", I(0), I(0)), I(0)), I(0)), G("NOR", I(0), G("OR", I(0), I(0)))),
        G("OR", G("XNOR", G("XOR", I(0), I(0)), I(0)), G("AND", I(0), G("OR", I(0), I(0))))) },
    { name: "Corner Cases",
      hint: "Fourteen switches. Some gates are already forced by the root — find them first.",
      tree: G("NOR",
        G("XOR", G("XNOR", G("NAND", I(0), I(0)), G("NOR", I(0), I(0))), G("NAND", G("OR", I(0), I(0)), I(0))),
        G("NAND", G("NAND", G("XOR", I(0), I(0)), G("NAND", I(0), I(0))), G("AND", G("XNOR", I(0), I(0)), I(0)))) },
    { name: "Power Grid",
      hint: "Fourteen switches on a wide frame. Break it into four sub-circuits and conquer each.",
      tree: G("OR",
        G("AND", G("NOR", G("OR", I(0), I(0)), I(0)), G("XNOR", G("AND", I(0), I(0)), I(0))),
        G("NOR", G("NAND", G("XOR", I(0), I(0)), G("OR", I(0), I(0))), G("XOR", G("NOR", I(0), I(0)), G("AND", I(0), I(0))))) },
    { name: "Fifteen Below",
      hint: "Fifteen switches, five deep at the darkest corner. Map the whole board before touching it.",
      tree: G("AND",
        G("NOR", G("OR", G("AND", G("XOR", I(0), I(0)), I(0)), G("NOR", I(0), I(0))), G("NAND", I(0), G("OR", I(0), I(0)))),
        G("XNOR", G("OR", G("XNOR", I(0), I(0)), G("AND", I(0), I(0))), G("NAND", G("OR", I(0), I(0)), I(0)))) },
    { name: "The Switchyard",
      hint: "Fifteen switches and every gate type on duty. Slow is smooth, smooth is fast.",
      tree: G("AND",
        G("NAND", G("XOR", G("OR", I(0), I(0)), G("AND", I(0), I(0))), G("NOR", I(0), G("XNOR", I(0), I(0)))),
        G("OR", G("AND", G("NOR", I(0), I(0)), G("OR", I(0), I(0))), G("XOR", G("NAND", I(0), I(0)), G("OR", I(0), I(0))))) },
    { name: "Night Shift",
      hint: "Sixteen switches. Half this board can stay dark — figure out which half, then finish it.",
      tree: G("OR",
        G("AND", G("NOR", G("XOR", I(0), I(0)), G("AND", I(0), I(0))), G("XNOR", G("OR", I(0), I(0)), G("NAND", I(0), I(0)))),
        G("NOR", G("OR", G("AND", I(0), I(0)), G("NOR", I(0), I(0))), G("NAND", G("XNOR", I(0), I(0)), G("XOR", I(0), I(0))))) },
    { name: "Circuit Overlord",
      hint: "Sixteen switches, five levels deep — the last and biggest tree before the splits. The bulb believes in you.",
      tree: G("AND",
        G("AND", G("OR", G("NAND", G("XOR", I(0), I(0)), I(0)), G("NOR", I(0), I(0))), G("XNOR", G("AND", I(0), I(0)), I(0))),
        G("NOR", G("XOR", G("OR", I(0), I(0)), G("NAND", I(0), G("AND", I(0), I(0)))), G("NOR", G("XNOR", I(0), I(0)), I(0)))) },
  ];

  // ---- splits: one signal feeding several gates (levels-split.js, written
  // by _dev/tools/logicgate-split-levels.js). They come after the tree levels
  // in each mode, so saved progress keeps its place.
  var SPLITS = window.LOGICGATE_SPLITS || { gates: [], inputs: [] };
  SPLITS.gates.forEach(function (lv) {
    LEVELS_GATES.push({ name: lv.name, hint: lv.hint, palette: lv.palette, tree: fromNet(lv.net) });
  });
  SPLITS.inputs.forEach(function (lv) {
    LEVELS_INPUTS.push({ name: lv.name, hint: lv.hint, tree: fromNet(lv.net) });
  });

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
  var checked = false; // signals stay hidden until the player presses Check
  var freshSig = ""; // boardSig() as the level was dealt (see the leave guard)
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
    stopFlow();

    var built = new Map();   // a node shared by several gates (a split) is built once
    function rec(t) {
      if (built.has(t)) return built.get(t);
      var id = nodes.length;
      built.set(t, id);
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
    // how many gates each output feeds (more than one = a split)
    nodes.forEach(function (n) { n.fan = 0; });
    nodes.forEach(function (n) { n.inputs.forEach(function (c) { nodes[c].fan++; }); });

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
    checked = false;

    computeLayout();
    relayout();
    renderPalette();
    renderDots();
    document.getElementById("levelName").textContent =
      "Level " + (levelIndex + 1) + " — " + lv.name;
    hideWin();
    freshSig = boardSig();
  }

  // ---- layout --------------------------------------------------------
  function computeLayout() {
    leafOrder.forEach(function (id, i) { nodes[id].row = i; });
    // columns: inputs at 0, a gate one past its furthest input, the bulb one
    // past the root (each node once: with splits it's reached by more than
    // one path)
    var placed = {};
    function cc(id) {
      var n = nodes[id];
      if (!placed[id]) {
        n.col = n.kind === "input" ? 0 : Math.max.apply(null, n.inputs.map(cc)) + 1;
        placed[id] = true;
      }
      return n.col;
    }
    maxCol = cc(bulbId);
    // rows, column by column: a gate sits level with the middle of its inputs
    // and the bulb level with the root. In a tree that never brings two gates
    // in a column within a row of each other, but a split can, so a gate that
    // would overlap the one above it moves down.
    for (var c = 1; c <= maxCol; c++) {
      var col = nodes.filter(function (n) { return n.col === c; });
      col.forEach(function (n) {
        var a = nodes[n.inputs[0]];
        n.row = n.kind === "bulb" ? a.row : (a.row + nodes[n.inputs[1]].row) / 2;
      });
      col.sort(function (a, b) { return a.row - b.row; });
      for (var i = 1; i < col.length; i++)
        if (col[i].row < col[i - 1].row + 1) col[i].row = col[i - 1].row + 1;
    }
    maxRow = 0; leaves = leafOrder.length;
    nodes.forEach(function (n) { if (n.row > maxRow) maxRow = n.row; });
    chains = null;
    if (nodes.some(function (n) { return n.fan > 1; })) splitLayout();
  }

  // the node boxes' sizes, as styles.css draws them (a gate is smaller on a
  // narrow screen): [half width, half height]
  function box(n) {
    if (n.kind === "gate") return window.innerWidth <= 560 ? [35, 21] : [41, 23];
    return n.kind === "input" ? [23, 20] : [28, 28];
  }

  // ---- a circuit with splits --------------------------------------------
  // The tree layout above never runs a wire under a box or across another,
  // but a split brings wires that skip columns and cross. So a circuit with
  // splits is laid out in layers instead. Every wire that spans several
  // columns passes through a placeholder in each column it crosses, which
  // gets a row of its own: there the wire runs level, clear of the boxes.
  // The columns are ordered by the mean place of their neighbours, a few
  // sweeps each way, keeping the order with the fewest crossings (the
  // switches stay A, B, C… down the left, as the hints name them). Then each
  // column gets its rows, as near its neighbours as clear gaps allow. Rows
  // here are px from the top of the board; x still comes from its width.
  var chains = null, splitH = 0;   // a split circuit's wire routes: { from, to, via: [placeholders], top }
  function splitLayout() {
    var cols = [], c, round;
    for (c = 0; c <= maxCol; c++) cols.push([]);
    var item = nodes.map(function (n) { var it = { node: n, col: n.col, up: [], down: [] }; cols[n.col].push(it); return it; });
    chains = [];
    nodes.forEach(function (n) {
      n.inputs.forEach(function (u) {
        var prev = item[u], via = [];
        for (var k = nodes[u].col + 1; k < n.col; k++) {
          var d = { node: null, col: k, up: [prev], down: [] };
          prev.down.push(d); cols[k].push(d); via.push(d); prev = d;
        }
        prev.down.push(item[n.id]); item[n.id].up.push(prev);
        chains.push({ from: u, to: n.id, via: via, last: prev });
      });
    });
    // the order in each column
    cols[0].sort(function (a, b) { return leafOrder.indexOf(a.node.id) - leafOrder.indexOf(b.node.id); });
    function number() { cols.forEach(function (col) { col.forEach(function (it, i) { it.p = i; }); }); }
    function sweep(col, by) {
      col.forEach(function (it) { it.key = it[by].length ? it[by].reduce(function (s, o) { return s + o.p; }, 0) / it[by].length : it.p; });
      col.sort(function (a, b) { return a.key - b.key || a.p - b.p; });
      col.forEach(function (it, i) { it.p = i; });
    }
    function crossings() {
      var x = 0;
      for (var c = 0; c < maxCol; c++) {
        var e = [];
        cols[c].forEach(function (it) { it.down.forEach(function (o) { e.push([it.p, o.p]); }); });
        for (var i = 0; i < e.length; i++) for (var j = i + 1; j < e.length; j++)
          if ((e[i][0] - e[j][0]) * (e[i][1] - e[j][1]) < 0) x++;
      }
      return x;
    }
    number();
    var best = crossings(), keep = cols.map(function (col) { return col.slice(); });
    for (round = 0; round < 4; round++) {
      for (c = 1; c <= maxCol; c++) sweep(cols[c], "up");
      for (c = maxCol - 1; c >= 1; c--) sweep(cols[c], "down");
      var now = crossings();
      if (now < best) { best = now; keep = cols.map(function (col) { return col.slice(); }); }
    }
    cols = keep;
    number();
    // then neighbours in a column trade places wherever that uncrosses wires
    for (var better = true, guard = 0; better && guard < 8; guard++) {
      better = false;
      for (c = 1; c <= maxCol; c++) for (var i = 0; i + 1 < cols[c].length; i++) {
        var col = cols[c], t = col[i];
        col[i] = col[i + 1]; col[i + 1] = t; number();
        var tried = crossings();
        if (tried < best) { best = tried; better = true; }
        else { col[i + 1] = col[i]; col[i] = t; number(); }
      }
    }
    // the rows: a box clears a box by 14 px, and a wire's placeholder clears
    // a box by 16 px (and another wire by 14)
    function half(it) { return it.node ? Math.max(box(it.node)[1], it.node.kind === "gate" ? 23 : 0) : 0; }
    function sep(a, b) { return half(a) + half(b) + (a.node && b.node ? 14 : a.node || b.node ? 16 : 14); }
    function mean(xs) { return xs.reduce(function (s, o) { return s + o.y; }, 0) / xs.length; }
    function place(col, by) {   // each as near its neighbours' middle as the gaps allow, in order
      var y = [], shift = 0;
      col.forEach(function (it, i) {
        var want = it[by].length ? mean(it[by]) : it.y;
        y[i] = i ? Math.max(want, y[i - 1] + sep(col[i - 1], it)) : want;
        shift += y[i] - want;
      });
      shift /= col.length;
      col.forEach(function (it, i) { it.y = y[i] - shift; });
    }
    var y0 = 0;
    cols[0].forEach(function (it, i) { if (i) y0 += sep(cols[0][i - 1], it); it.y = y0; });
    for (c = 1; c <= maxCol; c++) place(cols[c], "up");
    for (round = 0; round < 3; round++) {
      for (c = maxCol - 1; c >= 0; c--) place(cols[c], "down");
      for (c = 1; c <= maxCol; c++) place(cols[c], "up");
    }
    // top of the board at 18 px
    var top = Infinity, bottom = -Infinity;
    cols.forEach(function (col) { col.forEach(function (it) { top = Math.min(top, it.y - half(it)); bottom = Math.max(bottom, it.y + half(it)); }); });
    cols.forEach(function (col) { col.forEach(function (it) { it.y += 18 - top; if (it.node) it.node.y0 = it.y; }); });
    splitH = Math.ceil(bottom - top + 36);
    // a gate's upper input comes from whichever wire arrives higher
    nodes.forEach(function (n) {
      var into = chains.filter(function (ch) { return ch.to === n.id; });
      if (into.length === 2) {
        var up = into[0].last.y <= into[1].last.y ? 0 : 1;
        into[up].top = true; into[1 - up].top = false;
      }
    });
  }

  var colX = [];        // each column's x on the board
  var SCALE_MIN = 0.5;  // the smallest a crowded board shrinks: a gate is still ~35 px to tap
  var GAP = 6;          // the least room between two boxes
  function computePixels() {
    var board = document.getElementById("board"), frame = board.parentNode;
    var rows = Math.max(leaves, maxRow + 1);   // (a split can push a gate below the last input)
    var rowH = Math.max(50, Math.min(86, Math.round(440 / Math.max(1, rows))));
    var topPad = 18, W, H, padX, g = box({ kind: "gate" })[0];
    function place(width, pad) {
      W = width; padX = pad;
      for (var c = 0; c <= maxCol; c++) colX[c] = padX + (maxCol === 0 ? 0 : (c / maxCol) * (W - 2 * padX));
      nodes.forEach(function (n) {
        n.x = colX[n.col];
        n.y = chains ? n.y0 : topPad + (n.row + 0.5) * rowH;
      });
      H = chains ? splitH : rows * rowH + topPad * 2;
    }
    board.style.width = board.style.transform = board.style.marginRight = board.style.marginBottom = "";
    frame.classList.remove("scrolls");
    var F = board.clientWidth || 320;
    place(F, Math.min(46, F * 0.08));
    // Too narrow for its circuit (a big one on a phone), boxes would crowd
    // (or a split's wires would have no room between columns). Then the
    // circuit is laid out at a width where nothing crowds, and the board
    // shrinks to fit its frame; below SCALE_MIN it stops shrinking and the
    // frame scrolls sideways instead, with a fade at its edge.
    var crowded = (chains && maxCol && colX[1] - colX[0] < 2 * g + 22) || nodes.some(function (a, i) {
      return nodes.some(function (b, j) {
        return j > i && Math.abs(a.x - b.x) < box(a)[0] + box(b)[0] + GAP && Math.abs(a.y - b.y) < box(a)[1] + box(b)[1] + GAP;
      });
    });
    if (crowded && maxCol) {
      var wide = Math.max(F, Math.ceil(2 * 30 + maxCol * (2 * g + 22)));
      var s = Math.max(SCALE_MIN, Math.min(1, F / wide));
      // (shrunk, the gaps between a tree's rows shrink too: its rows open up
      // so they still clear GAP; a split circuit's gaps already do)
      rowH = Math.max(rowH, Math.ceil(2 * box({ kind: "gate" })[1] + GAP / s + 1));
      place(wide, 30);
      board.style.width = W + "px";
      board.style.transform = "scale(" + s + ")";
      // (so the frame lays the board out at its shrunk size)
      board.style.marginRight = -Math.floor(W * (1 - s)) + "px";
      board.style.marginBottom = -Math.floor(H * (1 - s)) + "px";
      if (W * s > F + 1) frame.classList.add("scrolls");
    }
    board.style.height = H + "px";
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

  function relayout(flow) {
    var dim = computePixels();
    render(dim, flow);
  }

  // ---- Visual FX on: the signal's run after ⚡ Check --------------------
  // The board shows the signal travelling column by column: each gate's
  // output appears as the signal reaches it and its wires draw on toward the
  // next gate, and the verdict (status, banner, sounds) waits until it reaches
  // the bulb, about a second at most. With FX off it all shows at once.
  // Anything that changes the board mid-run (a gate moved, a switch flipped,
  // Reset, another level or mode) cancels it.
  var flowing = false, flowToken = 0, flowStep = 0;
  function fxOn() { return !(window.RM_ON && window.RM_ON()); }
  function stopFlow() { flowing = false; flowToken++; }
  // when the signal leaves a node in column col (inputs are live already)
  function flowAt(col) { return Math.max(0, col - 1) * flowStep; }
  function runFlow(memo) {
    var token = ++flowToken;
    flowing = true;
    flowStep = Math.min(240, 900 / Math.max(1, maxCol - 2));
    relayout(true);
    setTimeout(function () {
      if (token !== flowToken) return;
      flowing = false;
      if (memo[bulbId] !== 1) sfxFail();
      relayout();
    }, flowAt(maxCol - 1) + flowStep * 0.85);
  }

  function render(dim, flow) {
    var memo = evaluate();
    var board = document.getElementById("board");
    var W = dim ? dim.W : board.clientWidth;
    var H = dim ? dim.H : board.clientHeight;
    var lead = 14;   // a split's wires leave from a junction dot this far out
    var flowCss = function (c) {
      return flow && c.kind !== "input"
        ? ' style="animation-delay:' + flowAt(c.col) + "ms;animation-duration:" + Math.round(flowStep * 0.85) + 'ms"' : "";
    };
    var wireCls = function (c) {
      var v = memo[c.id];
      var show = checked || solved || c.kind === "input";
      return !show ? "none" : v === 1 ? "on" : v === 0 ? "off" : "none";
    };

    // wires
    var paths = "", dots = "";
    var wire = function (c, d) {
      var flows = flow && c.kind !== "input";
      paths += '<path class="wire w-' + wireCls(c) + (flows ? " flow" : "") + '"' +
        (flows ? ' pathLength="1"' : "") + flowCss(c) + ' d="' + d + '"/>';
    };
    if (chains) {
      // a split circuit's wires follow their routes (splitLayout): from box
      // edge to box edge, level through each column they cross, curving only
      // in the gaps between columns
      var band = box({ kind: "gate" })[0];
      chains.forEach(function (ch) {
        var c = nodes[ch.from], n = nodes[ch.to];
        var x0 = c.x + box(c)[0], x = c.fan > 1 ? x0 + lead : x0, y = c.y;
        var d = "M" + x0 + " " + y + (x !== x0 ? " L" + x + " " + y : "");
        var curve = function (x2, y2) {
          var dx = Math.min(Math.max(24, (x2 - x) * 0.5), x2 - x);
          d += " C" + (x + dx) + " " + y + " " + (x2 - dx) + " " + y2 + " " + x2 + " " + y2;
          x = x2; y = y2;
        };
        ch.via.forEach(function (v) {
          curve(colX[v.col] - band, v.y);
          x = colX[v.col] + band;
          d += " L" + x + " " + y;
        });
        curve(n.x - box(n)[0], n.y + (n.kind === "bulb" ? 0 : ch.top ? -11 : 11));
        wire(c, d);
      });
    } else nodes.forEach(function (n) {
      if (n.kind === "input") return;
      n.inputs.forEach(function (cid, i) {
        var c = nodes[cid];
        var x0 = c.x + halfW(c), y1 = c.y, x1 = c.fan > 1 ? x0 + lead : x0, x2, y2;
        if (n.kind === "bulb") { x2 = n.x - halfW(n); y2 = n.y; }
        else { x2 = n.x - halfW(n); y2 = n.y + (i === 0 ? -11 : 11); }
        var dx = Math.max(24, (x2 - x1) * 0.5);
        wire(c, "M" + x0 + " " + y1 + (x1 !== x0 ? " L" + x1 + " " + y1 : "") +
          " C" + (x1 + dx) + " " + y1 + " " + (x2 - dx) + " " + y2 + " " + x2 + " " + y2);
      });
    });
    // a dot where a wire splits, so one signal feeding several gates reads as one
    nodes.forEach(function (c) {
      if (c.fan < 2) return;
      dots += '<circle class="junc j-' + wireCls(c) + (flow && c.kind !== "input" ? " flow" : "") + '"' + flowCss(c) +
        ' cx="' + (c.x + (chains ? box(c)[0] : halfW(c)) + lead) + '" cy="' + c.y + '" r="5"/>';
    });
    paths += dots;
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
        // (mid-run it stays dark: it lights as the signal arrives, in the final render)
        html += '<div class="node bulb ' + ((checked || solved) && v === 1 && !flowing ? "lit" : "") +
          '" style="' + style + '">' +
          '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M9 21h6v-1H9v1zm3-19a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>' +
          "</div>";
      } else if (n.type) {
        html += '<div class="node gate filled g-' + n.type +
          (mode === "inputs" ? " fixed" : "") + '" data-id="' + n.id +
          '" data-type="' + n.type + '" style="' + style + '"><span class="gname">' +
          n.type + '</span><span class="gout' + (flow ? " flow" : "") + '"' +
          (flow ? ' style="animation-delay:' + flowAt(n.col) + 'ms"' : "") + ">" +
          (!(checked || solved) || v === undefined ? "?" : v) +
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

  function unsetSwitches() {
    var c = 0;
    nodes.forEach(function (n) { if (n.kind === "input" && n.value === undefined) c++; });
    return c;
  }
  function boardComplete() {
    return mode === "gates" ? gatesLeftToPlace() === 0 : unsetSwitches() === 0;
  }
  // every gate and switch on the board, to tell a worked-on level from a fresh one
  function boardSig() {
    return nodes.map(function (n) {
      return n.kind === "gate" ? n.type || "" : n.kind === "input" && n.value !== undefined ? n.value : "";
    }).join(",");
  }
  function updateStatus(memo) {
    var out = memo[bulbId];
    var status = document.getElementById("status");
    var complete = boardComplete();
    if (flowing) {   // the verdict waits for the signal to reach the bulb (runFlow)
      status.textContent = "⚡ Sending the signal…";
      status.className = "ready";
      document.getElementById("checkBtn").disabled = true;
      document.getElementById("nextBtn").disabled = !prog().solved[levelIndex] || levelIndex >= curLevels().length - 1;
      return;
    }
    if ((checked || solved) && out === 1) {
      status.textContent = "✓ Circuit complete — the bulb is lit!";
      status.className = "win";
      if (!solved) onSolved();
    } else if (checked && complete) {
      status.textContent = "✗ The bulb stayed dark — change something and check again";
      status.className = "fail";
    } else if (complete) {
      // (no keyboard on a touch-only device: there it's just the button)
      status.innerHTML = 'Ready — press ⚡ Check<span class="gs-keys"> (or <kbd class="gs-kbd">Enter</kbd>)</span> to test it';
      status.className = "ready";
    } else {
      if (mode === "gates") {
        var left = gatesLeftToPlace();
        status.textContent = left + " gate" + (left === 1 ? "" : "s") + " left to place";
      } else {
        var unset = unsetSwitches();
        status.textContent = unset + " switch" + (unset === 1 ? "" : "es") + " still unset — click to set 0/1";
      }
      status.className = "";
    }
    document.getElementById("checkBtn").disabled = !complete || solved || (checked && out !== 1);
    document.getElementById("nextBtn").disabled =
      !(prog().solved[levelIndex] || (solved && out === 1)) || levelIndex >= curLevels().length - 1;
  }

  // the player commits an answer; only now does the signal run through the board
  function doCheck() {
    if (solved || checked) return;
    if (!boardComplete()) {
      sfxNudge();
      var status = document.getElementById("status");
      status.textContent = mode === "gates"
        ? "Fill every slot before checking"
        : "Set every switch before checking";
      status.className = "fail";
      return;
    }
    checked = true;
    var memo = evaluate();
    if (fxOn()) { runFlow(memo); return; }
    if (memo[bulbId] !== 1) sfxFail();
    relayout();
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
    checked = false;
    stopFlow();
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
    checked = false;
    stopFlow();
    var el = e.currentTarget;
    var id = parseInt(el.dataset.id, 10);
    var type = el.dataset.type;
    nodes[id].type = null;
    beginDrag(type, { kind: "slot", nodeId: id, origType: type }, e);
    relayout();
  }
  function beginDrag(type, source, e) {
    e.preventDefault();
    // preventDefault keeps focus where it was, so a button clicked earlier
    // (Reset, Next level) would take the Enter meant for Check
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
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
    checked = false;
    stopFlow();
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
  function sfxFail() { tone(220, 0.16, "sawtooth", 0.1); tone(150, 0.26, "sawtooth", 0.1, 0.12); }
  function sfxNudge() { tone(300, 0.08, "square", 0.09); }
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
      '<p class="leg-foot">Build your answer — place every gate, or set every switch ' +
      '(each click cycles blank → 0 → 1 → 0…). Then press <b>⚡ Check</b><span class="gs-keys"> (or <kbd class="gs-kbd">Enter</kbd>)</span> ' +
      "to send the signal through the wires and see if the bulb lights.</p>" +
      '<p class="leg-foot">Where a wire splits at a dot, one signal feeds every gate it reaches: ' +
      "a switch or a gate there has to suit all of them at once.</p>";

    document.getElementById("checkBtn").addEventListener("click", doCheck);
    document.addEventListener("keydown", function (e) {
      // the open "? Gates" panel claims Esc: it closes, and doesn't also leave the game
      if (e.key === "Escape" && helpOpen && !e.repeat && !(e.ctrlKey || e.metaKey || e.altKey)) { e.preventDefault(); toggleHelp(); return; }
      if (e.key !== "Enter") return;
      if (e.target && e.target.tagName === "BUTTON") return; // let focused buttons act
      if (document.getElementById("winBanner").classList.contains("show")) nextLevel();
      else doCheck();
    });
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

    // Leaving asks first while the level on the board has been worked on (a
    // gate placed or a switch set) and isn't solved. Solves are saved
    // (logicgate_progress), so a fresh or solved board leaves at once. No
    // clock, so nothing to pause.
    if (window.GameShell && GameShell.guardLeave)
      GameShell.guardLeave(function () { return !solved && boardSig() !== freshSig; });

    loadLevel(Math.min(prog().unlocked, curLevels().length - 1));
  }

  window.__LOGICGATE_TEST__ = {
    LEVELS_GATES: LEVELS_GATES, LEVELS_INPUTS: LEVELS_INPUTS, applyGate: applyGate,
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
