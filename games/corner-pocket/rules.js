/* Corner Pocket — 8-ball rules. Pure: given the table before a shot and what
   happened during it, work out fouls, groups, whose turn it is and whether
   the game is over. The shape is the one mobile 8-ball players know:

   - break from behind the head string; the table stays open after the break
   - the first ball legally potted after the break sets your group
   - fouls (scratch, no ball hit, wrong ball first, no rail after contact)
     give the other player ball in hand anywhere; until your group is gone
     the 8 is a wrong ball to hit first
   - once your group is gone, call a pocket (the game won't shoot without
     one) and sink the 8 in it to win
   - the 8 early, the 8 with a foul (a scratch included), or the 8 in the
     wrong pocket loses; the 8 on the break just comes back to the foot spot */
(function (root) {
  "use strict";

  function groupOf(id) { return id === 0 ? "cue" : id === 8 ? "eight" : id < 8 ? "solid" : "stripe"; }
  function other(g) { return g === "solid" ? "stripe" : "solid"; }

  function newGame(breaker) {
    return { turn: breaker, groups: [null, null], open: true, isBreak: true, inHand: "kitchen", winner: -1, reason: "" };
  }
  function copy(st) {
    return { turn: st.turn, groups: [st.groups[0], st.groups[1]], open: st.open, isBreak: st.isBreak,
             inHand: st.inHand, winner: st.winner, reason: st.reason };
  }

  function countOn(balls, group) {
    var n = 0;
    for (var i = 0; i < balls.length; i++) if (balls[i].on && groupOf(balls[i].id) === group) n++;
    return n;
  }
  // is player p down to the 8?
  function onEight(st, balls, p) {
    var g = st.groups[p];
    return !!g && countOn(balls, g) === 0;
  }
  function needsCall(st, balls) { return !st.isBreak && onEight(st, balls, st.turn); }

  // the balls the shooter may hit first
  function targets(st, balls) {
    var out = [], me = st.turn, eight = onEight(st, balls, me);
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (!b.on || b.id === 0) continue;
      var g = groupOf(b.id);
      if (st.isBreak) out.push(b.id);
      else if (st.open) { if (b.id !== 8) out.push(b.id); }
      else if (eight) { if (b.id === 8) out.push(b.id); }
      else if (g === st.groups[me]) out.push(b.id);
    }
    return out;
  }

  // balls0: the table as it stood before the shot. ev: the shot's events from
  // physics (firstHit, railAfter, pocketed[{id, pocket}]). called: the pocket
  // named for the 8 (or -1).
  function resolve(st, balls0, ev, called) {
    var s = copy(st), me = s.turn, opp = 1 - me;
    var out = { shooter: me, foul: null, winner: -1, reason: "", cont: false, assigned: null,
                respot8: false, potted: [], cueIn: false, wasOnEight: false };
    var eight = null, obj = [];
    for (var i = 0; i < ev.pocketed.length; i++) {
      var p = ev.pocketed[i];
      if (p.id === 0) out.cueIn = true;
      else if (p.id === 8) eight = p;
      else obj.push(p.id);
    }
    out.potted = obj;
    var mine = s.groups[me];
    var wasOnEight = !s.isBreak && !!mine && countOn(balls0, mine) === 0;
    out.wasOnEight = wasOnEight;

    // fouls, the one worth naming first
    if (out.cueIn) out.foul = "scratch";
    else if (ev.firstHit < 0) out.foul = "nohit";
    else if (!s.isBreak) {
      if (s.open) { if (ev.firstHit === 8) out.foul = "eightfirst"; }
      else if (wasOnEight) { if (ev.firstHit !== 8) out.foul = "wrongball"; }
      else if (groupOf(ev.firstHit) !== mine) out.foul = ev.firstHit === 8 ? "eightfirst" : "wrongball";   // (named: the 8 isn't yours yet)
      if (!out.foul && !obj.length && !eight && !ev.railAfter) out.foul = "norail";
    }

    if (eight) {
      if (s.isBreak) out.respot8 = true;
      else {
        var won = wasOnEight && !out.foul && eight.pocket === called;
        out.winner = won ? me : opp;
        out.reason = won ? "eight" : !wasOnEight ? "early8" : out.foul ? "foul8" : "wrongpocket";
        s.winner = out.winner; s.reason = out.reason;
        s.isBreak = false; s.inHand = null;
        return { st: s, out: out };
      }
    }

    // the first ball to drop after the break decides the groups
    if (!out.foul && s.open && !s.isBreak && obj.length) {
      var g = groupOf(obj[0]);
      s.groups[me] = g; s.groups[opp] = other(g); s.open = false;
      out.assigned = g;
    }

    if (!out.foul) {
      if (s.isBreak) out.cont = obj.length > 0 || !!eight;
      else if (out.assigned) out.cont = true;
      else if (!s.open) {
        for (var k = 0; k < obj.length; k++) if (groupOf(obj[k]) === s.groups[me]) { out.cont = true; break; }
      }
    }

    s.isBreak = false;
    if (out.foul) { s.turn = opp; s.inHand = "any"; }
    else { if (!out.cont) s.turn = opp; s.inHand = null; }
    return { st: s, out: out };
  }

  var api = { groupOf: groupOf, other: other, newGame: newGame, copy: copy, countOn: countOn,
              onEight: onEight, needsCall: needsCall, targets: targets, resolve: resolve };
  root.PoolRules = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
