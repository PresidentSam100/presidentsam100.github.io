/* =====================================================================
   Capitals — shared by Passport and Departures (load after data.js and
   judge.js). Each country's capital first (the name shown), then other
   names a player may fairly type: older or local spellings, and a second
   seat where a country has two (Bolivia, South Africa, Côte d'Ivoire…).

     CapitalJudge.of(ci)            -> the capital's name, for FlagData[ci]
     CapitalJudge.resolve(raw)      -> index into FlagData, or -1
     CapitalJudge.matches(raw, ci)  -> true if raw names ci's capital

   Matching follows the country judge: accents, punctuation, "St." and
   "the" never matter, and one typo is forgiven on names of six-plus
   letters, but never when it could mean a second capital (Kingston is
   not Kingstown).
   ===================================================================== */
(function () {
  "use strict";
  var C = window.FlagData, norm = window.CountryJudge.norm;

  var CAP = {
    // -------- Europe
    al: ["Tirana"], ad: ["Andorra la Vella"], at: ["Vienna", "Wien"], by: ["Minsk"],
    be: ["Brussels", "Bruxelles", "Brussel"], ba: ["Sarajevo"], bg: ["Sofia"], hr: ["Zagreb"],
    cy: ["Nicosia"], cz: ["Prague", "Praha"], dk: ["Copenhagen", "København"], ee: ["Tallinn"],
    fi: ["Helsinki"], fr: ["Paris"], de: ["Berlin"], gr: ["Athens"], hu: ["Budapest"],
    is: ["Reykjavík"], ie: ["Dublin"], it: ["Rome", "Roma"], lv: ["Riga"], li: ["Vaduz"],
    lt: ["Vilnius"], lu: ["Luxembourg", "Luxembourg City"], mt: ["Valletta"],
    md: ["Chișinău", "Chisinau", "Kishinev"], mc: ["Monaco"], me: ["Podgorica"],
    nl: ["Amsterdam", "The Hague", "Den Haag"], mk: ["Skopje"], no: ["Oslo"], pl: ["Warsaw", "Warszawa"],
    pt: ["Lisbon", "Lisboa"], ro: ["Bucharest"], ru: ["Moscow"], sm: ["San Marino", "City of San Marino"],
    rs: ["Belgrade"], sk: ["Bratislava"], si: ["Ljubljana"], es: ["Madrid"], se: ["Stockholm"],
    ch: ["Bern", "Berne"], ua: ["Kyiv", "Kiev"], gb: ["London"], va: ["Vatican City"],
    xk: ["Pristina", "Prishtina"],
    // -------- Asia
    af: ["Kabul"], am: ["Yerevan"], az: ["Baku"], bh: ["Manama"], bd: ["Dhaka"], bt: ["Thimphu"],
    bn: ["Bandar Seri Begawan"], kh: ["Phnom Penh"], cn: ["Beijing", "Peking"], ge: ["Tbilisi"],
    in: ["New Delhi", "Delhi"], id: ["Jakarta", "Nusantara"], ir: ["Tehran"], iq: ["Baghdad"],
    il: ["Jerusalem"], jp: ["Tokyo"], jo: ["Amman"], kz: ["Astana", "Nur-Sultan"],
    kw: ["Kuwait City", "Kuwait"], kg: ["Bishkek"], la: ["Vientiane"], lb: ["Beirut"],
    my: ["Kuala Lumpur", "Putrajaya"], mv: ["Malé"], mn: ["Ulaanbaatar", "Ulan Bator"],
    mm: ["Naypyidaw", "Nay Pyi Taw", "Naypyitaw"], np: ["Kathmandu"], kp: ["Pyongyang"],
    om: ["Muscat"], pk: ["Islamabad"], ps: ["Ramallah", "East Jerusalem"], ph: ["Manila"],
    qa: ["Doha"], sa: ["Riyadh"], sg: ["Singapore"], kr: ["Seoul"],
    lk: ["Sri Jayawardenepura Kotte", "Kotte", "Colombo"], sy: ["Damascus"], tw: ["Taipei"],
    tj: ["Dushanbe"], th: ["Bangkok"], tl: ["Dili"], tm: ["Ashgabat", "Ashkhabad"], tr: ["Ankara"],
    ae: ["Abu Dhabi"], uz: ["Tashkent"], vn: ["Hanoi"], ye: ["Sanaa", "Sana'a"],
    // -------- Africa
    dz: ["Algiers"], ao: ["Luanda"], bj: ["Porto-Novo", "Cotonou"], bw: ["Gaborone"],
    bf: ["Ouagadougou"], bi: ["Gitega", "Bujumbura"], cv: ["Praia"], cm: ["Yaoundé"], cf: ["Bangui"],
    td: ["N'Djamena"], km: ["Moroni"], cg: ["Brazzaville"], cd: ["Kinshasa"],
    ci: ["Yamoussoukro", "Abidjan"], dj: ["Djibouti", "Djibouti City"], eg: ["Cairo"],
    gq: ["Malabo", "Ciudad de la Paz"], er: ["Asmara"], sz: ["Mbabane", "Lobamba"],
    et: ["Addis Ababa"], ga: ["Libreville"], gm: ["Banjul"], gh: ["Accra"], gn: ["Conakry"],
    gw: ["Bissau"], ke: ["Nairobi"], ls: ["Maseru"], lr: ["Monrovia"], ly: ["Tripoli"],
    mg: ["Antananarivo"], mw: ["Lilongwe"], ml: ["Bamako"], mr: ["Nouakchott"], mu: ["Port Louis"],
    ma: ["Rabat"], mz: ["Maputo"], na: ["Windhoek"], ne: ["Niamey"], ng: ["Abuja"], rw: ["Kigali"],
    st: ["São Tomé"], sn: ["Dakar"], sc: ["Victoria"], sl: ["Freetown"], so: ["Mogadishu"],
    za: ["Pretoria", "Cape Town", "Bloemfontein"], ss: ["Juba"], sd: ["Khartoum"],
    tz: ["Dodoma", "Dar es Salaam"], tg: ["Lomé"], tn: ["Tunis"], ug: ["Kampala"], zm: ["Lusaka"],
    zw: ["Harare"],
    // -------- Americas
    ag: ["Saint John's"], ar: ["Buenos Aires"], bs: ["Nassau"], bb: ["Bridgetown"], bz: ["Belmopan"],
    bo: ["Sucre", "La Paz"], br: ["Brasília"], ca: ["Ottawa"], cl: ["Santiago"], co: ["Bogotá"],
    cr: ["San José"], cu: ["Havana", "La Habana"], dm: ["Roseau"], do: ["Santo Domingo"], ec: ["Quito"],
    sv: ["San Salvador"], gd: ["Saint George's"], gt: ["Guatemala City", "Guatemala"], gy: ["Georgetown"],
    ht: ["Port-au-Prince"], hn: ["Tegucigalpa"], jm: ["Kingston"], mx: ["Mexico City", "Mexico"], ni: ["Managua"],
    pa: ["Panama City", "Panama"], py: ["Asunción"], pe: ["Lima"], kn: ["Basseterre"], lc: ["Castries"],
    vc: ["Kingstown"], sr: ["Paramaribo"], tt: ["Port of Spain"],
    us: ["Washington, D.C.", "Washington", "Washington DC"], uy: ["Montevideo"], ve: ["Caracas"],
    // -------- Oceania
    au: ["Canberra"], fj: ["Suva"], ki: ["Tarawa", "South Tarawa"], mh: ["Majuro"], fm: ["Palikir"],
    nr: ["Yaren"], nz: ["Wellington"], pw: ["Ngerulmud"], pg: ["Port Moresby"], ws: ["Apia"],
    sb: ["Honiara"], to: ["Nuku'alofa"], tv: ["Funafuti"], vu: ["Port Vila"]
  };

  var NAMES = [];
  C.forEach(function (c, i) {
    (CAP[c[0]] || []).forEach(function (n) { NAMES.push({ ci: i, n: norm(n) }); });
  });

  // edit distance capped at 1 (returns 2 for anything worse), as in judge.js
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

  function of(ci) { var c = C[ci], list = c && CAP[c[0]]; return list ? list[0] : ""; }

  window.CapitalJudge = {
    of: of,
    resolve: resolve,
    matches: function (raw, ci) { return ci >= 0 && resolve(raw) === ci; },
    names: NAMES,
    CAP: CAP
  };
})();
