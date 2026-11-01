// Builds Patchword's word list (games/patchword/words.js) from two public
// domain lists, downloaded first into a folder of their own:
//
//   ENABLE:  https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt
//   12dicts: http://downloads.sourceforge.net/wordlist/12dicts-6.0.2.zip
//            (its International/3of6game.txt, the list made for word games)
//
//   node _dev/tools/patchword-build-words.js <enable1.txt> <3of6game.txt>
//   node _dev/tools/patchword-build-words.js <enable1.txt> <3of6game.txt> --check
//
// Run from the repo's root. --check compares with the file there instead of
// writing it.
//
// Two lists come out of it, in one string:
//   - the words the game takes: every word of either list, 3 to 16 letters,
//     with no q that isn't followed by a u (a Qu patch is the only q there is);
//   - the everyday ones among them: 3of6game's unmarked words (in at least
//     three of its six learner's dictionaries; its marks flag variant
//     spellings, newer words and the less common). Only these are ever shown
//     as words a player missed, and a block is dealt again until it hides
//     enough of them.
// Slurs and obscenities come out of both lists. Crude and bodily words stay
// in the first (they still count when played) but never in the second, so
// the game never suggests them. Both lists are kept here in ROT13, so this
// file doesn't spell them out.
//
// The string is the sorted list front coded: each word is a capital, A for
// none to P for fifteen, giving how many letters it shares with the word
// before, then the rest of its letters; a * in front marks an everyday word.
// Gzipped it is about two fifths the size of the words written out.
const fs = require("fs");
const path = require("path");

const [enablePath, gamePath, flag] = process.argv.slice(2);
if (!enablePath || !gamePath) {
  console.error("usage: node _dev/tools/patchword-build-words.js <enable1.txt> <3of6game.txt> [--check]");
  process.exit(1);
}

const rot13 = (s) => s.replace(/[a-z]/g, (c) => String.fromCharCode((c.charCodeAt(0) - 97 + 13) % 26 + 97));
const list = (s) => rot13(s).split(" ");
// out of both lists: any word starting with one of these, and these words
const BLOCK_PREFIX = list("shpx zbgureshpx fuvg phag avttre avttn snttbg sntbg xvxr jrgonpx enturnq gbjryurnq wvtnobb cvpxnavaa gjng jnax juber fyhg wvmm nffubyr nefrubyr yrfob cbbsgre tbyyvjbt zbatbybvq fxnax erqfxva genaal genaavr pbpxfhpx oybjwbo unaqwbo ohyyfuvg ubefrfuvg qvcfuvg");
const BLOCK_EXACT = new Set(list("fcvp fcvpf fcvpx fcvpxf tbbx tbbxf qnexvr qnexvrf qnexl ornare ornaref ubaxl ubaxvrf ubaxrl ubaxrlf tlc tlcf tlccrq tlccvat qlxr qlxrf qlxrl fdhnj fdhnjf cnxv cnxvf cbynpx cbynpxf qntb qntbf qntbrf jbc jbcf wnc wncf ulzvr ulzvrf urro urrof jbt jbtf yrmmvr yrmmvrf yrmml arterff arterffrf fcnm fcnmm fcnmmrf"));
// out of the everyday list only
const QUIET_PREFIX = list("znfgheong rwnphyng fbqbz betnfz cbea cvff obbo grfgvp intva cravf crarf pyvgbe fpebg qvyqb encvfg rebgvp alzcub sryyng phaavy frzra fcrez travgny chovp chorf avccyr ubeal ubeav");
const QUIET_EXACT = new Set(list("puvax puvaxf pbba pbbaf fcnfgvpf nany nanyyl nahf nahfrf phzf ergneq ergneqf ergneqrq chffl chffvrf pbpx pbpxf qvpx qvpxf qvpxurnq ovgpu ovgpurf ovgpul ovgpuvre ovgpuvrfg onfgneq onfgneqf phz qvyqbf encr encrf encrq encvat gvg gvgf gvggl gvggvrf rerpgvba rerpgvbaf ohttre ohttref ohttrerq ohttrel nefr nefrf nff nffrf gheq gheqf anmv anmvf arteb artebrf xenhg xenhgf fuvxfn tbl tblvz tblf ubzb ubzbf dhrre dhrref dhrrere dhrrerfg cbbs cbbsf tvzc tvzcf pevccyr pevccyrf pevccyrq zvqtrg zvqtrgf fcnfgvp ubbxre ubbxref cvzc cvzcf cvzcrq cvzcvat uhffl uhffvrf pebgpu pebgpurf frkl frkvre frkvrfg frk frkrf frkrq frkvat ohgg ohggf penc pencf penccrq penccl penccre qnza qnzarq qnzaf uryy uryyf urebva pbpnvar obbmr qehax qehaxf"));

const blocked = (w) => BLOCK_EXACT.has(w) || BLOCK_PREFIX.some((p) => w.startsWith(p));
const quiet = (w) => QUIET_EXACT.has(w) || QUIET_PREFIX.some((p) => w.startsWith(p));
const fits = (w) => /^[a-z]{3,16}$/.test(w) && !/q(?!u)/.test(w) && !blocked(w);

const words = new Set(), everyday = new Set();
for (const line of fs.readFileSync(enablePath, "utf8").split(/\r?\n/)) {
  const w = line.trim();
  if (fits(w)) words.add(w);
}
const enableCount = words.size;
for (const line of fs.readFileSync(gamePath, "utf8").split(/\r?\n/)) {
  const m = /^([a-z]+)([!$&+^]?)$/.exec(line.trim());
  if (!m || !fits(m[1])) continue;
  words.add(m[1]);
  if (!m[2] && !quiet(m[1])) everyday.add(m[1]);
}

const sorted = [...words].sort();
let out = "", prev = "";
for (const w of sorted) {
  let p = 0;
  while (p < prev.length && p < w.length && prev[p] === w[p]) p++;
  out += (everyday.has(w) ? "*" : "") + String.fromCharCode(65 + p) + w.slice(p);
  prev = w;
}

const text =
  "/* Patchword's words, built by _dev/tools/patchword-build-words.js from ENABLE\n" +
  "   (public domain) and 12dicts' 3of6game (Alan Beale, public domain): " + sorted.length + " words\n" +
  "   (" + enableCount + " from ENABLE, " + (sorted.length - enableCount) + " more from 3of6game), " + everyday.size + " of them everyday ones (marked *).\n" +
  "   Front coded, sorted: a capital A to P says how many letters a word shares\n" +
  "   with the one before, then come the rest of its letters. */\n" +
  "window.PATCHWORD_WORDS = \"" + out + "\";\n";

const target = path.join("games", "patchword", "words.js");
if (flag === "--check") {
  const same = fs.existsSync(target) && fs.readFileSync(target, "utf8") === text;
  console.log(same ? "words.js is up to date" : "words.js differs from what these lists build");
  process.exit(same ? 0 : 1);
}
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, text);
console.log("wrote " + target + ": " + sorted.length + " words, " + everyday.size + " everyday, " + text.length + " bytes");
