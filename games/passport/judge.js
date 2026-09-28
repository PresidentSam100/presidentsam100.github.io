/* =====================================================================
   The country judge — shared by Passport and Departures.
   Reads window.FlagData (load data.js first) and decides which country
   a typed answer means: exact names and common aliases win outright,
   accents/punctuation/"St."/"the" never matter, and one typo is
   forgiven on names of six-plus letters — but never when it could mean
   a second country (Gambia is not Zambia).

     CountryJudge.resolve(raw)   -> index into FlagData, or -1
     CountryJudge.norm(raw)      -> the normalised form
     CountryJudge.names          -> [{ ci, n }] every name and alias
     CountryJudge.ALIAS          -> { iso2: [aliases] }
   ===================================================================== */
(function () {
  "use strict";
  var C = window.FlagData;

  // Common alternate names the judge accepts.
  var ALIAS = {
    us: ["usa", "united states of america", "america"],
    gb: ["uk", "great britain", "britain"],
    nl: ["holland"], cz: ["czechia"], mm: ["burma"], sz: ["swaziland"],
    mk: ["macedonia"], tl: ["timor leste"], cv: ["cabo verde"],
    va: ["vatican", "holy see"], ae: ["uae", "emirates"],
    ci: ["cote divoire"], ba: ["bosnia"], tt: ["trinidad"],
    cd: ["drc", "democratic republic of the congo", "congo kinshasa"],
    cg: ["congo", "congo brazzaville"],
    kn: ["saint kitts", "st kitts and nevis"], vc: ["saint vincent"], ag: ["antigua"],
    tr: ["turkiye"], fm: ["federated states of micronesia"],
    sb: ["solomons"], ru: ["russian federation"]
  };

  function norm(str) {
    str = str.toLowerCase();
    try { str = str.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return str
      .replace(/&/g, " and ")
      .replace(/\bst\.?(?=\s)/g, "saint")
      .replace(/\bthe\b/g, " ")
      .replace(/[^a-z0-9]/g, "");
  }

  var NAMES = [];
  C.forEach(function (c, i) {
    NAMES.push({ ci: i, n: norm(c[1]) });
    (ALIAS[c[0]] || []).forEach(function (a) { NAMES.push({ ci: i, n: norm(a) }); });
  });

  // edit distance capped at 1 (returns 2 for anything worse)
  function lev1(a, b) {
    if (a === b) return 0;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return 2;
    var i = 0, j = 0, edits = 0;
    while (i < la && j < lb) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return 2;
      if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
    }
    return edits + (la - i) + (lb - j) > 1 ? 2 : edits + (la - i) + (lb - j);
  }

  function resolve(raw) {
    var v = norm(raw);
    if (!v) return -1;
    var k;
    for (k = 0; k < NAMES.length; k++) if (NAMES[k].n === v) return NAMES[k].ci;
    if (v.length < 6) return -1;
    var found = -1;
    for (k = 0; k < NAMES.length; k++) {
      if (NAMES[k].n.length < 6) continue;
      if (lev1(v, NAMES[k].n) <= 1) {
        if (found !== -1 && found !== NAMES[k].ci) return -1;
        found = NAMES[k].ci;
      }
    }
    return found;
  }

  window.CountryJudge = { resolve: resolve, norm: norm, names: NAMES, ALIAS: ALIAS };
})();
