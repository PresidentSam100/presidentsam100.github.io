/* =====================================================================
   JackBlack: the rules of the table, with no page in them.

   Blackjack as most casinos deal it:
     six decks in the shoe, shuffled again once three quarters are gone
     the dealer stands on every 17 and peeks under an ace or a ten
     a natural (an ace and a ten-card, first two cards) pays 3 to 2
     double on any first two cards, after a split too
     split a pair (any two ten-cards count) up to four hands; split aces
       take one card each and can't be split again, and a 21 on them is
       21, not a natural
     insurance, half the bet, when the dealer shows an ace: it pays 2 to 1

   A Table holds the stake, the shoe and the hand in play. Every action
   returns the list of things that happened, in order (a card dealt, the
   hole card turned, a hand settled...), so the page can play them out one
   at a time without knowing a rule. Bets come out of the stake as they're
   made; a settled hand pays its bet back with the winnings. An event that
   moves chips carries the stake as it stood just after.

   Chips are 10s, so a 3 to 2 payout and half a bet are always whole.
   ===================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.JackBlackRules = mod;
})(this, function () {
  "use strict";

  var DECKS = 6, MIN_BET = 10, MAX_BET = 1000, MAX_HANDS = 4, STAKE = 1000;
  var CUT = Math.floor(DECKS * 52 * 0.25);      // shuffle when this few cards are left

  // a seeded generator (mulberry32), so a daily shoe is the same for everyone
  function seeded(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // a card is { r: 1..13 (ace..king), s: 0..3 }; the shoe deals from its end
  function makeShoe(rng, decks) {
    var shoe = [], d, s, r, i, j, t;
    for (d = 0; d < (decks || DECKS); d++) for (s = 0; s < 4; s++) for (r = 1; r <= 13; r++) shoe.push({ r: r, s: s });
    for (i = shoe.length - 1; i > 0; i--) {
      j = Math.floor((rng || Math.random)() * (i + 1));
      t = shoe[i]; shoe[i] = shoe[j]; shoe[j] = t;
    }
    return shoe;
  }
  function pip(card) { return card.r === 1 ? 11 : card.r >= 10 ? 10 : card.r; }

  // a hand's best total: aces count 11 until that would bust it
  function value(cards) {
    var total = 0, aces = 0, i;
    for (i = 0; i < cards.length; i++) { total += pip(cards[i]); if (cards[i].r === 1) aces++; }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return { total: total, soft: aces > 0, bust: total > 21 };
  }
  function isNatural(cards) { return cards.length === 2 && value(cards).total === 21; }

  function Table(opts) {
    opts = opts || {};
    this.rng = opts.rng || Math.random;
    this.reshuffle = opts.reshuffle !== false;    // a daily shoe is dealt straight through
    this.stake = opts.stake != null ? opts.stake : STAKE;
    this.shoe = opts.shoe ? opts.shoe.slice() : makeShoe(this.rng);
    this.phase = "bet";          // bet -> (insure) -> play -> done
    this.dealer = [];
    this.holeUp = false;
    this.hands = [];
    this.active = -1;
    this.insurance = 0;
    this.round = 0;
  }
  var P = Table.prototype;

  P.draw = function () {
    if (!this.shoe.length) this.shoe = makeShoe(this.rng);     // (never in practice: the cut card comes first)
    return this.shoe.pop();
  };
  // the most that can be bet now
  P.limit = function () { return Math.min(MAX_BET, Math.floor(this.stake / MIN_BET) * MIN_BET); };
  P.broke = function () { return this.phase !== "play" && this.phase !== "insure" && this.stake < MIN_BET; };

  // ---- a new round --------------------------------------------------------
  P.deal = function (bet) {
    var ev = [];
    if (this.phase === "play" || this.phase === "insure") return ev;
    bet = Math.floor(bet / MIN_BET) * MIN_BET;
    if (bet < MIN_BET || bet > this.limit()) return ev;
    if (this.reshuffle && this.shoe.length < CUT) { this.shoe = makeShoe(this.rng); ev.push({ t: "shuffle" }); }
    this.round++;
    this.stake -= bet;
    this.dealer = []; this.holeUp = false; this.insurance = 0;
    this.hands = [{ cards: [], bet: bet, doubled: false, split: false, aces: false, done: false, result: null, paid: 0 }];
    this.active = 0;
    ev.push({ t: "bet", hand: 0, bet: bet, stake: this.stake });
    var h = this.hands[0], c;
    c = this.draw(); h.cards.push(c); ev.push({ t: "card", to: 0, card: c });
    c = this.draw(); this.dealer.push(c); ev.push({ t: "card", to: "dealer", card: c });
    c = this.draw(); h.cards.push(c); ev.push({ t: "card", to: 0, card: c });
    c = this.draw(); this.dealer.push(c); ev.push({ t: "card", to: "dealer", card: c, hidden: true });
    this.phase = "play";
    if (this.dealer[0].r === 1 && this.stake >= bet / 2) { this.phase = "insure"; ev.push({ t: "insure?" }); return ev; }
    return ev.concat(this.peek());
  };

  // the dealer looks under an ace or a ten; a natural on either side ends the round here
  P.peek = function () {
    var ev = [], h = this.hands[0];
    var up = pip(this.dealer[0]);
    if ((up === 11 || up === 10) && isNatural(this.dealer)) {
      this.reveal(ev);
      if (this.insurance) { this.stake += this.insurance * 3; ev.push({ t: "insured", won: true, delta: this.insurance * 2, stake: this.stake }); }
      this.settleHand(0, isNatural(h.cards) ? "push" : "lose", ev);
      return this.finish(ev);
    }
    if (this.insurance) ev.push({ t: "insured", won: false, delta: -this.insurance, stake: this.stake });
    if (isNatural(h.cards)) {
      this.reveal(ev);
      this.settleHand(0, "natural", ev);
      return this.finish(ev);
    }
    return ev;
  };

  P.insure = function (take) {
    if (this.phase !== "insure") return [];
    if (take) { this.insurance = this.hands[0].bet / 2; this.stake -= this.insurance; }
    this.phase = "play";
    return [{ t: "insure", take: !!take, cost: this.insurance, stake: this.stake }].concat(this.peek());
  };

  // ---- the player's turn --------------------------------------------------
  P.hand = function () { return this.phase === "play" ? this.hands[this.active] : null; };
  P.can = function (what) {
    var h = this.hand();
    if (!h || h.done) return false;
    if (what === "hit" || what === "stand") return true;
    if (what === "double") return h.cards.length === 2 && !h.aces && this.stake >= h.bet;
    if (what === "split") return h.cards.length === 2 && !h.aces && pip(h.cards[0]) === pip(h.cards[1]) && this.hands.length < MAX_HANDS && this.stake >= h.bet;
    return false;
  };

  P.hit = function () {
    if (!this.can("hit")) return [];
    var ev = [], h = this.hand(), c = this.draw();
    h.cards.push(c); ev.push({ t: "card", to: this.active, card: c });
    var v = value(h.cards);
    if (v.bust) { ev.push({ t: "bust", hand: this.active }); h.done = true; return ev.concat(this.next()); }
    if (v.total === 21) { h.done = true; return ev.concat(this.next()); }      // nothing left to ask
    return ev;
  };
  P.stand = function () {
    if (!this.can("stand")) return [];
    this.hand().done = true;
    return [{ t: "stand", hand: this.active }].concat(this.next());
  };
  P.double = function () {
    if (!this.can("double")) return [];
    var ev = [], h = this.hand(), c;
    this.stake -= h.bet; h.bet *= 2; h.doubled = true;
    ev.push({ t: "double", hand: this.active, bet: h.bet, stake: this.stake });
    c = this.draw(); h.cards.push(c); ev.push({ t: "card", to: this.active, card: c, sideways: true });
    if (value(h.cards).bust) ev.push({ t: "bust", hand: this.active });
    h.done = true;
    return ev.concat(this.next());
  };
  P.split = function () {
    if (!this.can("split")) return [];
    var ev = [], i = this.active, h = this.hand(), c;
    var aces = h.cards[0].r === 1;
    var other = { cards: [h.cards.pop()], bet: h.bet, doubled: false, split: true, aces: aces, done: false, result: null, paid: 0 };
    this.stake -= h.bet;
    h.split = true; h.aces = aces;
    this.hands.splice(i + 1, 0, other);
    ev.push({ t: "split", hand: i, bet: h.bet, stake: this.stake });
    c = this.draw(); h.cards.push(c); ev.push({ t: "card", to: i, card: c });
    c = this.draw(); other.cards.push(c); ev.push({ t: "card", to: i + 1, card: c });
    if (aces) { h.done = other.done = true; return ev.concat(this.next()); }
    if (value(h.cards).total === 21) { h.done = true; return ev.concat(this.next()); }
    return ev;
  };

  // on to the next hand still to play (a split hand dealt 21 plays itself), or the dealer
  P.next = function () {
    var ev = [];
    for (var i = 0; i < this.hands.length; i++) {
      var h = this.hands[i];
      if (h.done) continue;
      if (value(h.cards).total === 21) { h.done = true; continue; }
      this.active = i;
      ev.push({ t: "turn", hand: i });
      return ev;
    }
    return this.dealerPlays();
  };

  // ---- the dealer, and the reckoning ---------------------------------------
  P.reveal = function (ev) {
    if (this.holeUp) return;
    this.holeUp = true;
    ev.push({ t: "reveal", card: this.dealer[1] });
  };
  P.dealerPlays = function () {
    var ev = [], i, c, self = this;
    this.reveal(ev);
    var live = this.hands.some(function (h) { return !value(h.cards).bust; });
    if (live) {
      while (value(this.dealer).total < 17) { c = this.draw(); this.dealer.push(c); ev.push({ t: "card", to: "dealer", card: c }); }
    }
    var d = value(this.dealer);
    if (d.bust) ev.push({ t: "bust", hand: "dealer" });
    for (i = 0; i < this.hands.length; i++) {
      var v = value(self.hands[i].cards);
      this.settleHand(i, v.bust ? "bust" : d.bust || v.total > d.total ? "win" : v.total === d.total ? "push" : "lose", ev);
    }
    return this.finish(ev);
  };
  // what a result pays back, bet included: a natural 3 to 2, a win even money
  P.settleHand = function (i, result, ev) {
    var h = this.hands[i];
    var back = result === "natural" ? h.bet * 2.5 : result === "win" ? h.bet * 2 : result === "push" ? h.bet : 0;
    h.result = result; h.paid = back; h.done = true;
    this.stake += back;
    ev.push({ t: "settle", hand: i, result: result, delta: back - h.bet, stake: this.stake });
  };
  P.finish = function (ev) {
    this.phase = "done"; this.active = -1;
    ev.push({ t: "done", net: this.net(), stake: this.stake });
    return ev;
  };
  P.insuranceWon = function () { return this.insurance > 0 && isNatural(this.dealer); };
  // the round's net, once it's done (what the stake moved by)
  P.net = function () {
    var net = this.insurance ? (this.insuranceWon() ? this.insurance * 2 : -this.insurance) : 0;
    this.hands.forEach(function (h) { net += h.paid - h.bet; });
    return net;
  };

  return {
    Table: Table, makeShoe: makeShoe, seeded: seeded, value: value, pip: pip, isNatural: isNatural,
    DECKS: DECKS, MIN_BET: MIN_BET, MAX_BET: MAX_BET, MAX_HANDS: MAX_HANDS, STAKE: STAKE, CUT: CUT
  };
});
