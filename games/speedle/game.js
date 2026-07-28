(function () {
  "use strict";

  // ----- config -------------------------------------------------------
  var SPRINT_SECONDS = 30;   // Sprint mode starting time
  var SPRINT_BONUS = 10;     // seconds added to the clock per solved word (Sprint)
  var RACE_TARGET = 10;      // Race mode goal (words)
  var MAX_GUESSES = 6;       // attempts per word
  var BEST_SPRINT = "speedle_best_sprint"; // most words solved in a sprint
  var BEST_RACE = "speedle_best_race";     // fastest ms to RACE_TARGET words

  // 5-letter word pool — used both as answers and as the accepted-guess
  // dictionary (a guess must be in this list to count).
  var WORDS = ("about above abuse actor acute admit adopt adult after again agent agree ahead alarm album " +
    "alert alike alive allow alone along alter among anger angle angry apart apple apply arena argue arise " +
    "armor array arrow aside asset audio audit avoid award aware awful bacon badge badly baker basic basis " +
    "beach beard beast began begin being below bench berry bible bingo birth black blade blame blank blast " +
    "blaze bleak blend bless blind block blood bloom blown blunt blush board boast bonus boost booth bound " +
    "bowel brace brain brand brave bread break breed brick bride brief bring brisk broad broke brook broom " +
    "brown brush buddy build built bunch burnt burst buyer cabin cable camel candy cargo carry carve catch " +
    "cause cease chain chair chalk chant chaos charm chart chase cheap cheat check cheek cheer chess chest " +
    "chief child chill chime china choir chord chose chuck chunk civic civil claim clamp clash clasp class " +
    "clean clear clerk click cliff climb cling clock clone close cloth cloud clout clown clued coach coast " +
    "cobra cocoa color comet comic coral crank couch cough could count court cover crack craft cramp crane " +
    "crash crate crawl crazy cream creek creep crept crest crime crisp crook cross crowd crown crude cruel " +
    "crumb crush crust cubic curry curve cycle daily dairy daisy dance dandy datum dealt death debut decay " +
    "decor delay delta dense depot depth devil diary digit dimly diner dingy dirty disco ditch diver dizzy " +
    "dodge doing donor doubt dough dozen draft drain drama drank drawn dread dream dress dried drift drill " +
    "drink drive drone drove drown druid drums drunk dryer eager eagle early earth easel eaten ebony edict " +
    "eerie eight elbow elder elect elite ember empty enact ended enemy enjoy enter entry equal equip erase " +
    "error erupt essay event every evict evoke exact exalt excel exert exile exist extra fable faint fairy " +
    "faith false fancy fatal fault fauna favor feast fence ferry fetch fever fewer fiber field fiend fiery " +
    "fifth fifty fight final first fixed flair flame flank flare flash flask fleet flesh flick fling flint " +
    "float flock flood floor flora flour flown fluid flung flush flute foamy focal focus foggy force forge " +
    "forms forte forth forty forum found frame frank fraud fresh fried frill frock front frost frown froze " +
    "fruit fudge fully fungi funky funny furry gamer gauge gaunt gavel gecko genie genre ghost giant giddy " +
    "girth given giver glade gland glare glass glaze gleam glide globe gloom glory gloss glove glyph gnome " +
    "going godly goose gorge gourd grace grade grain grand grant grape graph grasp grass grate grave gravy " +
    "graze great greed green greet grief grill grime grind groan groin groom group grout grove growl grown " +
    "gruff grunt guard guess guest guide guild guilt guise gully gumbo gusto gypsy habit hairy halve handy " +
    "happy hardy harsh haste hatch haunt haven havoc hazel heard heart heavy hedge hefty hello hence hoist " +
    "heron hilly hinge hippo hitch hoard hobby holly honey honor horde horse hotel hound house hover human " +
    "humid humor hunch hurry husky hutch hydro hyena ideal idiom igloo image imply inbox incur index inept " +
    "infer inlet inner input intro irate irony issue ivory jaunt jazzy jelly jerky jewel joker jolly joust " +
    "judge juice juicy jumbo jumpy karma kayak kebab khaki kinky kiosk kitty knack knead kneel knelt knife " +
    "knock knoll known koala label labor laden lance lapse large laser later latex laugh layer leach leaky " +
    "learn lease leash least ledge legal lemon level lever light lilac limbo limit linen liner lingo lipid " +
    "liver llama lobby local lodge lofty logic loose lorry loser louse lousy loyal lucky lumen lunar lunch " +
    "lunge lurch lured lusty lying lyric macro madam magic major maker mango manor maple march marsh mason " +
    "match maybe mayor meant medal media melon mercy merge merit merry messy metal meter metro micro might " +
    "minor minus mirth mixed mocha modal model moist molar money month moody moose moral mossy motel motor " +
    "motto mound mount mourn mouse mouth mover movie mower mucky muddy mulch mummy mural murky mushy music " +
    "musky myrrh nadir naive nanny nasal nasty naval needy nerdy nerve never newer newly nicer niche niece " +
    "night ninja ninth noble noose noise noisy nomad north notch noted novel nudge nurse nutty nylon oasis " +
    "occur ocean octet offer often olive onion onset opera optic orbit order organ ought ounce outer ovary " +
    "owing owner oxide ozone paddy paint panel panic paper parka party pasta paste patch patio pause peace " +
    "peach pearl pedal penny perch peril perky pesky petal petty phase phone photo piano picky piece piety " +
    "piggy pilot pinch piney pinky pious pivot pixel pizza place plaid plain plane plank plant plate plaza " +
    "plead pleat plier plies pluck plumb plume plump plush poach point poise poker polar polka porch posse " +
    "pouch pound power prank prawn press price prick pride prime print prior prism prize probe prone prong " +
    "proof prose proud prove prowl proxy prune psalm pulse punch pupil puppy puree purge purse pushy putty " +
    "quack quail quell quake qualm quart quash queen query quest queue quick quiet quill quilt quirk quite " +
    "quota quote rabid radar radio rainy raise rally ranch range rapid raspy ratio raven razor reach react " +
    "ready realm rebel rebus refer regal reign relax relay relic remit renal repay repel reply resin retch " +
    "retro reuse revel rhino rhyme rider ridge rifle right rigid rinse ripen riser risky rival river roast " +
    "robin robot rocky rodeo rogue roman roomy roost rotor rouge rough round route rover royal ruddy ruler " +
    "rumor rural rusty saint salad salon salsa salty salve sandy sappy sassy satin satyr sauce saucy sauna " +
    "saved savor savvy scald scale scalp scaly scamp scant scare scarf scary scene scent scoff scold scone " +
    "scoop scope score scorn scour scout scowl scrap scrub scuba sedan seedy segue seize sense serum serve " +
    "setup seven sever sewer shade shady shaft shake shaky shale shall shame shank shape shard share shark " +
    "sharp shave shawl shear sheen sheep sheer sheet shelf shell shied shift shine shiny shire shirk shirt " +
    "shoal shock shone shook shoot shore short shout shove shown showy shrub shrug shuck shunt shush shyly " +
    "siege sieve sight sigma silky silly since sinew siren sixth sixty skate skier skill skimp skirt skull " +
    "skunk slack slain slang slant slash slate slave sleek sleep sleet slept slice slick slide slime slimy " +
    "sling slope slosh sloth slump slung slurp slush small smart smash smear smell smelt smile smirk smite " +
    "smith smock smoke smoky snack snail snake snaky snare snarl sneak sneer snide sniff snipe snoop snore " +
    "snort snout snowy snuck soapy sober solar solid solve sonar sonic sooth sorry sound south space spade " +
    "spank spare spark spasm spawn speak spear speck speed spell spend spent sperm spice spicy spike spiky " +
    "spill spilt spine spiny spire spite splat split spoil spoke spoof spook spool spoon spore sport spout " +
    "spray spree sprig spurn spurt squad squat squid stack staff stage staid stain stair stake stale stalk " +
    "stall stamp stand stank stare stark start stash state stave stead steak steal steam steed steel steep " +
    "steer stein stern stick stiff still stilt sting stink stint stock stoic stoke stole stomp stone stony " +
    "stood stool stoop store stork storm story stout stove strap straw stray strip strut stuck study stuff " +
    "stump stung stunt style suave sugar suite sulky sunny super surge sushi swamp swarm swash swath sweat " +
    "sweep sweet swell swept swift swill swine swing swirl swish swoon swoop sword swore sworn synod syrup " +
    "table taboo tacit tacky taffy taken tally talon tango tangy taper tardy tarot taste tasty taunt tawny " +
    "teach tease teddy teeth tempo tenor tense tenth tepid terra terse testy thank theft their theme there " +
    "these thick thief thigh thing think third thong thorn those three threw throb throw thrum thumb thump " +
    "thyme tiara tibia tidal tiger tight tilde timer timid tipsy titan title toast today token tonal tonic " +
    "tooth topaz topic torch torso total touch tough towel tower toxic toxin trace track tract trade trail " +
    "train trait tramp trash tread treat trend triad trial tribe trick tried tripe trite troll troop trope " +
    "trout truce truck truly trump trunk trust truth tryst tubby tulip tumor tunic turbo tutor twang tweak " +
    "tweed tweet twice twine twirl twist udder ulcer ultra umbra uncle under undue unfit unify union unite " +
    "unity unlit unmet untie until unzip upper upset urban urine usage usher using usual usurp utter vague " +
    "valet valid value valve vapor vault vegan venom venue verge verse video vigil vigor villa vinyl viola " +
    "viper viral virus visit visor vista vital vivid vixen vocal vodka vogue voice voter vouch vowel wacky " +
    "wafer wager wagon waist waltz warty waste watch water waver weary weave wedge weedy weigh weird whale " +
    "wharf wheat wheel whelp where which whiff while whine whirl whisk white whole whoop whose widen widow " +
    "width wield wight wimpy wince winch windy wiped wired wiser witch witty woken woman women woody wooer " +
    "world worry worse worst worth would wound woven wrack wrath wreak wreck wrest wring wrist write wrong " +
    "wrote wrung yacht yearn yeast yield yodel young yummy zebra zesty").split(/\s+/);

  // de-dupe + keep only true 5-letter entries (the literal above is hand-typed)
  (function () {
    var seen = {}, out = [];
    for (var i = 0; i < WORDS.length; i++) {
      var w = WORDS[i];
      if (w.length === 5 && !seen[w]) { seen[w] = 1; out.push(w); }
    }
    WORDS = out;
  })();
  // Accepted-guess dictionary: EVERY valid 5-letter word (the full Wordle
  // guess list, ~14.8k words, loaded from words.js). Answers are still drawn
  // only from the curated WORDS pool above so targets stay common & fair.
  // If words.js somehow fails to load, fall back to accepting the answer pool.
  //
  // Fun fact: the five words CHUNK FJORD GYMPS VIBEX WALTZ together use 25 of
  // the 26 letters (only Q is missing) — a perfect near-pangram opener set.
  var WORDSET = {};
  (function () {
    var src = (typeof window.SPEEDLE_VALID === "string" && window.SPEEDLE_VALID)
      ? window.SPEEDLE_VALID.split(/\s+/)
      : WORDS;
    for (var i = 0; i < src.length; i++) { if (src[i].length === 5) WORDSET[src[i]] = 1; }
    // make sure every possible answer is always accepted as a guess
    for (var j = 0; j < WORDS.length; j++) WORDSET[WORDS[j]] = 1;
  })();

  var $ = function (id) { return document.getElementById(id); };
  var boardEl = $("board"), kbEl = $("kb"), msgEl = $("msg"), ov = $("overlay"), card = $("card");
  var labelA = $("label-a"), valueA = $("value-a"), statA = $("stat-a"), timeBonus = $("time-bonus");
  var valueSolved = $("value-solved"), labelBest = $("label-best"), valueBest = $("value-best");
  var scoreBonus = $("score-bonus");

  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }

  // ----- sound --------------------------------------------------------
  var AC = window.AudioContext || window.webkitAudioContext;
  var actx = null;
  function ac() { if (!actx && AC) { try { actx = new AC(); } catch (e) { actx = null; } } return actx; }
  function beep(f, dur, vol, type) {
    var c = ac(); if (!c) return;
    var t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.18, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.12));
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + (dur || 0.12) + 0.02);
  }
  var SND = {
    key: function () { beep(420, 0.04, 0.08, "triangle"); },
    bad: function () { beep(170, 0.22, 0.18, "sawtooth"); },
    solve: function () { [523, 659, 880].forEach(function (f, i) { setTimeout(function () { beep(f, 0.12, 0.16, "triangle"); }, i * 70); }); },
    fail: function () { beep(300, 0.18, 0.16, "sine"); setTimeout(function () { beep(220, 0.22, 0.16, "sine"); }, 120); },
    over: function () { [660, 520, 392].forEach(function (f, i) { setTimeout(function () { beep(f, 0.18, 0.18, "triangle"); }, i * 130); }); },
    // one tick per remaining second during the final 5s — pitch rises as it counts down
    count: function (sec) { beep(440 + (5 - sec) * 90, 0.1, 0.2, "square"); }
  };

  // ----- keyboard build ----------------------------------------------
  var KB_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  var keyEls = {};
  function buildKeyboard() {
    kbEl.innerHTML = "";
    KB_ROWS.forEach(function (rowStr, idx) {
      var row = document.createElement("div");
      row.className = "kb-row";
      if (idx === 2) row.appendChild(makeKey("enter", "Enter", true));
      rowStr.split("").forEach(function (ch) { row.appendChild(makeKey(ch, ch, false)); });
      if (idx === 2) row.appendChild(makeKey("back", "⌫", true));
      kbEl.appendChild(row);
    });
  }
  function makeKey(code, label, wide) {
    var b = document.createElement("button");
    b.className = "key" + (wide ? " wide" : "");
    b.textContent = label;
    b.type = "button";
    b.addEventListener("click", function () { handleKey(code); });
    if (code.length === 1) keyEls[code] = b;
    return b;
  }

  // ----- game state ---------------------------------------------------
  var mode = "sprint";       // "sprint" | "race"
  var playing = false;
  var solved = 0;
  var answer = "";
  var rowIdx = 0, colIdx = 0;
  var grid = [];             // grid[r] = array of letters
  var tileEls = [];          // tileEls[r][c]
  var startTime = 0, timerRAF = 0, sprintDeadline = 0;
  var raceFinishMs = null;   // elapsed time captured the instant the Race is won (so the end-screen delay doesn't inflate it)
  var lastCountSec = 0;      // last whole second announced by the countdown beep
  var letterState = {};      // best-known state per letter for keyboard tint
  var locked = false;        // brief lock while a word resolves

  function buildBoard() {
    boardEl.innerHTML = "";
    tileEls = []; grid = [];
    for (var r = 0; r < MAX_GUESSES; r++) {
      var row = document.createElement("div");
      row.className = "row";
      var rowTiles = [];
      for (var c = 0; c < 5; c++) {
        var t = document.createElement("div");
        t.className = "tile";
        row.appendChild(t);
        rowTiles.push(t);
      }
      boardEl.appendChild(row);
      tileEls.push(rowTiles);
      grid.push(["", "", "", "", ""]);
    }
  }

  function resetKeyboardTint() {
    letterState = {};
    for (var k in keyEls) { keyEls[k].className = "key"; }
  }

  function newWord() {
    answer = WORDS[(Math.random() * WORDS.length) | 0];
    rowIdx = 0; colIdx = 0; locked = false;
    buildBoard();
    resetKeyboardTint();
    setMsg(""); // clear the previous ✓/✗ result the moment the next word loads
  }

  function setMsg(text, color) {
    msgEl.textContent = text || "";
    msgEl.style.color = color || "var(--warn)";
  }

  // float a "+10s" up out of the Time stat (restart the animation each call)
  function showTimeBonus() {
    timeBonus.textContent = "+" + SPRINT_BONUS + "s";
    timeBonus.classList.remove("show");
    void timeBonus.offsetWidth; // force reflow so the animation replays
    timeBonus.classList.add("show");
  }

  // float a "+1" up out of the Solved stat on every correct word
  function showScoreBonus() {
    scoreBonus.textContent = "+1";
    scoreBonus.classList.remove("show");
    void scoreBonus.offsetWidth; // force reflow so the animation replays
    scoreBonus.classList.add("show");
  }

  // ----- timer / hud --------------------------------------------------
  function fmt(ms) {
    var s = ms / 1000;
    return s.toFixed(1);
  }
  function renderBest() {
    if (mode === "sprint") {
      var b = parseInt(load(BEST_SPRINT), 10) || 0;
      valueBest.textContent = b ? String(b) : "—";
    } else {
      var r = parseInt(load(BEST_RACE), 10) || 0;
      valueBest.textContent = r ? fmt(r) + "s" : "—";
    }
  }
  function tick() {
    if (!playing) return;
    var now = performance.now();
    if (mode === "sprint") {
      var left = Math.max(0, sprintDeadline - now);
      valueA.textContent = (left / 1000).toFixed(1);
      statA.classList.toggle("warn", left <= 5000);
      // final-5-seconds countdown: one beep as each of 5,4,3,2,1 begins
      var secLeft = Math.ceil(left / 1000);
      if (secLeft > 5) {
        lastCountSec = 0; // armed again once we're back above 5s (e.g. after a +10s solve)
      } else if (secLeft >= 1 && secLeft !== lastCountSec) {
        lastCountSec = secLeft;
        SND.count(secLeft);
      }
      if (left <= 0) { sprintTimeUp(); return; }
    } else {
      valueA.textContent = ((now - startTime) / 1000).toFixed(1);
    }
    timerRAF = requestAnimationFrame(tick);
  }

  // ----- input --------------------------------------------------------
  function handleKey(code) {
    if (!playing || locked) return;
    if (code === "enter") { submit(); return; }
    if (code === "back") {
      if (colIdx > 0) {
        colIdx--;
        grid[rowIdx][colIdx] = "";
        var t = tileEls[rowIdx][colIdx];
        t.textContent = ""; t.classList.remove("filled");
      }
      return;
    }
    if (/^[a-z]$/.test(code) && colIdx < 5) {
      grid[rowIdx][colIdx] = code;
      var tile = tileEls[rowIdx][colIdx];
      tile.textContent = code;
      tile.classList.add("filled", "pop");
      setTimeout((function (el) { return function () { el.classList.remove("pop"); }; })(tile), 100);
      colIdx++;
      SND.key();
    }
  }

  function submit() {
    if (colIdx < 5) { rowShake(); setMsg("not enough letters"); return; }
    var guess = grid[rowIdx].join("");
    if (!WORDSET[guess]) { rowShake(); setMsg("not in word list"); SND.bad(); return; }
    setMsg("");

    // score the guess (handles duplicate letters correctly)
    var result = scoreGuess(guess, answer);
    paintRow(rowIdx, guess, result);

    if (guess === answer) { wordSolved(); return; }

    rowIdx++; colIdx = 0;
    if (rowIdx >= MAX_GUESSES) { wordFailed(); }
  }

  function scoreGuess(guess, ans) {
    var res = ["gray", "gray", "gray", "gray", "gray"];
    var counts = {};
    var i;
    for (i = 0; i < 5; i++) counts[ans[i]] = (counts[ans[i]] || 0) + 1;
    for (i = 0; i < 5; i++) { if (guess[i] === ans[i]) { res[i] = "green"; counts[guess[i]]--; } }
    for (i = 0; i < 5; i++) {
      if (res[i] === "green") continue;
      if (counts[guess[i]] > 0) { res[i] = "yellow"; counts[guess[i]]--; }
    }
    return res;
  }

  function paintRow(r, guess, result) {
    for (var c = 0; c < 5; c++) {
      var t = tileEls[r][c];
      t.classList.add(result[c], "flip");
      (function (el) { setTimeout(function () { el.classList.remove("flip"); }, 300); })(t);
      // keyboard tint: green > yellow > gray, never downgrade
      var ch = guess[c], cur = letterState[ch];
      var rank = { green: 3, yellow: 2, gray: 1 };
      if (!cur || rank[result[c]] > rank[cur]) {
        letterState[ch] = result[c];
        if (keyEls[ch]) keyEls[ch].className = "key " + result[c];
      }
    }
  }

  function rowShake() {
    var row = boardEl.children[rowIdx];
    if (!row) return;
    row.classList.add("shake");
    setTimeout(function () { row.classList.remove("shake"); }, 340);
  }

  // ----- word resolution ---------------------------------------------
  function wordSolved() {
    locked = true;
    // Sprint: bank the +10s the instant the word is correct — before the
    // score/sound/animation work — so a solve landing right as the clock
    // nears 0 always counts and can never trip the time-up (✗ / game-over)
    // path. This runs synchronously inside submit(), so the extended deadline
    // is in place before the next timer tick can check it.
    if (mode === "sprint") {
      sprintDeadline += SPRINT_BONUS * 1000;
      showTimeBonus();
    }
    solved++;
    valueSolved.textContent = String(solved);
    showScoreBonus();
    SND.solve();
    if (mode === "race" && solved >= RACE_TARGET) {
      // freeze the clock at the winning instant, then let the final solve
      // (green tiles + "+1") play before the end screen covers the board
      raceFinishMs = Math.round(performance.now() - startTime);
      playing = false;
      cancelAnimationFrame(timerRAF);
      valueA.textContent = fmt(raceFinishMs);
      setMsg("✓ " + answer.toUpperCase(), "var(--good)");
      setTimeout(endGame, 900);
      return;
    }
    setMsg("✓ " + answer.toUpperCase(), "var(--good)");
    setTimeout(function () { newWord(); }, 450);
  }

  function wordFailed() {
    locked = true;
    SND.fail();
    setMsg("✗ " + answer.toUpperCase(), "var(--bad)");
    // small breather, then a fresh word (no credit). Sprint: clock keeps running.
    setTimeout(function () { newWord(); }, 900);
  }

  // Sprint clock hit zero mid-word: stop the timer and reveal the unsolved
  // answer in red with ✗ (same as a 6-guess miss) before the end screen shows.
  function sprintTimeUp() {
    playing = false;
    cancelAnimationFrame(timerRAF);
    locked = true;
    valueA.textContent = "0.0";
    statA.classList.add("warn");
    SND.fail();
    setMsg("✗ " + answer.toUpperCase(), "var(--bad)");
    setTimeout(endGame, 1100);
  }

  // ----- start / end --------------------------------------------------
  function startGame(m) {
    mode = m;
    playing = true;
    solved = 0;
    raceFinishMs = null;
    valueSolved.textContent = "0";
    labelA.textContent = mode === "sprint" ? "Time left" : "Time";
    labelBest.textContent = mode === "sprint" ? "Best (words)" : "Best (time)";
    statA.classList.remove("warn");
    lastCountSec = 0;
    renderBest();
    ov.classList.remove("show");
    ac(); // unlock audio within the user gesture
    startTime = performance.now();
    sprintDeadline = startTime + SPRINT_SECONDS * 1000;
    valueA.textContent = mode === "sprint" ? SPRINT_SECONDS.toFixed(1) : "0.0";
    newWord();
    setMsg("");
    cancelAnimationFrame(timerRAF);
    timerRAF = requestAnimationFrame(tick);
  }

  function endGame() {
    playing = false;
    cancelAnimationFrame(timerRAF);
    SND.over();
    var record = false, line2 = "";
    if (mode === "sprint") {
      var best = parseInt(load(BEST_SPRINT), 10) || 0;
      if (solved > best) { best = solved; save(BEST_SPRINT, best); record = true; }
      line2 = record ? "🏆 new best!" : "best " + best + " word" + (best === 1 ? "" : "s");
      card.innerHTML =
        '<h2>Time!</h2>' +
        '<div class="big">' + solved + '<small> word' + (solved === 1 ? '' : 's') + '</small></div>' +
        '<p style="font-weight:800;color:' + (record ? 'var(--good)' : 'var(--muted)') + ';margin-top:0;">' + line2 + '</p>' +
        '<p>' + SPRINT_SECONDS + 's start · +' + SPRINT_BONUS + 's per word</p>' +
        '<button class="btn" id="btn-again">Play again</button>' +
        '<br><button class="btn ghost" id="btn-menu">Change mode</button>';
    } else {
      var elapsed = (raceFinishMs != null) ? raceFinishMs : Math.round(performance.now() - startTime);
      var done = solved >= RACE_TARGET;
      var bestR = parseInt(load(BEST_RACE), 10) || 0;
      if (done && (bestR === 0 || elapsed < bestR)) { bestR = elapsed; save(BEST_RACE, bestR); record = true; }
      line2 = record ? "🏆 new best time!" : (bestR ? "best " + fmt(bestR) + "s" : "");
      card.innerHTML =
        '<h2>' + (done ? 'Finished!' : 'Stopped') + '</h2>' +
        '<div class="big">' + fmt(elapsed) + '<small>s</small></div>' +
        '<p style="font-weight:800;color:' + (record ? 'var(--good)' : 'var(--muted)') + ';margin-top:0;">' + line2 + '</p>' +
        '<p>' + solved + ' of ' + RACE_TARGET + ' words</p>' +
        '<button class="btn" id="btn-again">Play again</button>' +
        '<br><button class="btn ghost" id="btn-menu">Change mode</button>';
    }
    ov.classList.add("show");
    $("btn-again").addEventListener("click", function () { startGame(mode); });
    $("btn-menu").addEventListener("click", showMenu);
  }

  // ----- menu ---------------------------------------------------------
  function showMenu() {
    playing = false;
    cancelAnimationFrame(timerRAF);
    var bestS = parseInt(load(BEST_SPRINT), 10) || 0;
    var bestR = parseInt(load(BEST_RACE), 10) || 0;
    card.innerHTML =
      '<h2>🔤 Speedle</h2>' +
      '<p>Wordle, against the clock. Solve 5-letter words back-to-back — each solve loads the next instantly.</p>' +
      '<ul class="rules">' +
        '<li>🟩 right letter, right spot</li>' +
        '<li>🟨 right letter, wrong spot</li>' +
        '<li>⬛ letter not in the word</li>' +
        '<li>' + MAX_GUESSES + ' guesses each — miss all ' + MAX_GUESSES + ' and it skips, no credit.</li>' +
      '</ul>' +
      '<div class="modes">' +
        '<button class="mode-btn" id="m-sprint"><div class="t">⏱️ Sprint</div><div class="d">' + SPRINT_SECONDS + 's start, +' + SPRINT_BONUS + 's per word</div><div class="b">' + (bestS ? 'best ' + bestS : '') + '</div></button>' +
        '<button class="mode-btn" id="m-race"><div class="t">🏁 Race to ' + RACE_TARGET + '</div><div class="d">' + RACE_TARGET + ' words, fastest time</div><div class="b">' + (bestR ? 'best ' + fmt(bestR) + 's' : '') + '</div></button>' +
      '</div>';
    ov.classList.add("show");
    $("m-sprint").addEventListener("click", function () { startGame("sprint"); });
    $("m-race").addEventListener("click", function () { startGame("race"); });
  }

  // ----- physical keyboard -------------------------------------------
  document.addEventListener("keydown", function (e) {
    if (ov.classList.contains("show")) {
      if (e.key === "Enter") { var b = card.querySelector(".btn"); if (b) { e.preventDefault(); b.click(); } }
      return;
    }
    if (e.key === "Enter") { e.preventDefault(); handleKey("enter"); }
    else if (e.key === "Backspace") { e.preventDefault(); handleKey("back"); }
    else if (/^[a-zA-Z]$/.test(e.key)) { handleKey(e.key.toLowerCase()); }
  });

  // ----- boot ---------------------------------------------------------
  buildKeyboard();
  buildBoard();
  showMenu();
})();
