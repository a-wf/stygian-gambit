"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));

function harness(saved = {}) {
  let now = 1000;
  let randomState = 42;
  const math = Object.create(Math);
  math.random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const storage = new Map(Object.entries(saved).map(([key, value]) => [key, JSON.stringify(value)]));
  const elements = new Map();
  class Element {
    constructor(id = "", hidden = false, disabled = false) {
      this.id = id;
      this.value = "";
      this.disabled = disabled;
      this.checked = false;
      this.textContent = "";
      this.innerHTML = "";
      this.children = [];
      this.style = {};
      this.dataset = {};
      this.attributes = {};
      this.listeners = {};
      this.width = this.height = 560;
      const classes = new Set(hidden ? ["hidden"] : []);
      this.classList = {
        add: name => classes.add(name),
        remove: name => classes.delete(name),
        contains: name => classes.has(name),
        toggle(name, force) {
          const enabled = force === undefined ? !classes.has(name) : force;
          if (enabled) classes.add(name); else classes.delete(name);
          return enabled;
        },
      };
    }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    fire(type = "click", event = {}) {
      assert.ok(this.listeners[type], `${this.id} must handle ${type}`);
      this.listeners[type]({ target: this, preventDefault() {}, ...event });
    }
    appendChild(child) { this.children.push(child); return child; }
    querySelectorAll() { return []; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    removeAttribute(name) { delete this.attributes[name]; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 560, height: 560 }; }
    getContext() {
      return new Proxy({ canvas: this }, {
        get(target, key) {
          if (key in target) return target[key];
          if (/^create.*Gradient$/.test(key)) return () => ({ addColorStop() {} });
          return () => {};
        },
      });
    }
  }
  for (const match of read("index.html").matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    elements.set(match[1], new Element(match[1], /\bhidden\b/.test(match[0]), /\bdisabled\b/.test(match[0])));
  }
  elements.get("difficulty").value = "normal";
  elements.get("persona").value = "balanced";
  elements.get("movesPerRound").value = "3";
  const window = { SG: {}, addEventListener() {} };
  const sandbox = {
    window, console, Math: math, location: { search: "" },
    document: {
      getElementById: id => elements.get(id) || null,
      createElement: () => new Element(),
      querySelectorAll: () => [],
      addEventListener() {},
    },
    performance: { now: () => now },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    requestAnimationFrame() {},
    setTimeout() {},
    clearTimeout() {},
  };
  vm.createContext(sandbox);
  for (const lang of ["en", "fr", "zh", "ar"]) vm.runInContext(read(`i18n/${lang}.js`), sandbox);
  window.SG.I18N = {
    lang: "en",
    t(key, params = {}) {
      const text = window.SG.I18N_DICT[this.lang][key] || key;
      return text.replace(/\{(\w+)\}/g, (match, name) => params[name] ?? match);
    },
  };
  vm.runInContext(read("ai.js"), sandbox);
  const anchor = '  Object.defineProperty(SG, "state", { get: () => state });';
  const source = read("game.js");
  assert.equal(source.split(anchor).length, 2);
  vm.runInContext(source.replace(anchor, anchor + "\n  SG.__test = { update, loop, endMatch, startTrial, refreshLanguage };"), sandbox);
  return {
    SG: window.SG, storage,
    el: id => elements.get(id),
    tick(ms = 100) { now += ms; window.SG.__test.update(now); },
    frame(ms = 100) { now += ms; window.SG.__test.loop(now); },
  };
}

function opening(state) {
  return plain({
    pieces: state.pieces.map(({ id, type, side, row, col, lives, warded }) => ({ id, type, side, row, col, lives, warded })),
    aegis: state.aegis, crystals: state.crystals, moves: state.movesPerRound,
    difficulty: state.difficulty, persona: state.botPersona,
    hazards: state.hazardsEnabled, furies: state.furiesEnabled, drag: state.harrowerDragEnabled,
  });
}

function continueAuctionToPlanning(h) {
  for (let i = 0; i < 8 && h.SG.state.scene === "auction"; i++) {
    const phase = h.SG.state.auction.phase;
    if (phase === "bid") h.el("btnAuctionPass").fire();
    else if (phase === "handoff") h.el("btnHandoffReady").fire();
    else if (phase === "reveal") h.el("btnAuctionContinue").fire();
    else assert.fail(`unexpected auction phase while starting Fate: ${phase}`);
  }
  assert.equal(h.SG.state.scene, "planning", "the auction should continue into planning");
}

test("Fate codes normalize ASCII only and reject malformed or unsupported codes", () => {
  const { SG } = harness();
  assert.equal(SG.FateSeeds.canonicalizeCode("  sg1-fate42  "), "SG1-FATE42");
  for (const code of [null, 23, "", " ", "SG1-", "SG2-ABC", "SG1-ABCDEFGHIJKLM", "SG1-A B", "SG1-<script>", "SG1-ß", "SG1-ſ"]) {
    assert.equal(SG.FateSeeds.buildFateScenario(code), null, String(code));
  }
  assert.match(SG.FateSeeds.generateCode(), /^SG1-[A-Z0-9]{1,12}$/);
});

test("Fate generation is repeatable, varied, valid and does not mutate source Trials", () => {
  const { SG } = harness();
  const before = plain(SG.SCENARIOS);
  const variants = new Set();
  for (let i = 0; i < 500; i++) {
    const code = "SG1-" + i.toString(36);
    const sc = SG.FateSeeds.buildFateScenario(code);
    assert.deepEqual(plain(sc), plain(SG.FateSeeds.buildFateScenario(code)));
    assert.equal(new Set(sc.pieces.map(p => `${p.row},${p.col}`)).size, sc.pieces.length);
    for (const p of sc.pieces) {
      assert.ok(p.row >= 0 && p.row < 8 && p.col >= 0 && p.col < 8);
      assert.ok(SG.PIECE_DEFS[p.type]);
    }
    for (const side of ["light", "dark"]) assert.equal(sc.pieces.filter(p => p.type === "sovereign" && p.side === side).length, 1);
    assert.equal(sc.furies, false);
    assert.equal(sc.hazards, false);
    variants.add(JSON.stringify([sc.pieces, sc.aegis, sc.crystals]));
  }
  assert.ok(variants.size > 100);
  assert.deepEqual(plain(SG.SCENARIOS), before);
});

test("Fate openings ignore local upgrades/settings; retry and results keep the code without progression", () => {
  const saved = {
    "sg.mirror": { aegisLv: 5, crystalLv: 5, obols: 99 },
    "sg.trials": { "first-blood": true }, "sg.daily": { streak: 7 }, "sg.records": { bot: { plays: 4 } },
  };
  const a = harness(), b = harness(saved);
  b.el("movesPerRound").value = "8";
  b.el("difficulty").value = "unfair";
  b.el("persona").value = "swarm";
  b.el("hazardToggle").checked = b.el("furyToggle").checked = true;
  for (const h of [a, b]) {
    h.el("fateCode").value = "sg1-underworld";
    h.el("fateCode").fire("keydown", { key: "Enter" });
    assert.equal(h.SG.state.scenario.fateCode, "SG1-UNDERWORLD");
    continueAuctionToPlanning(h);
  }
  const start = opening(a.SG.state);
  assert.deepEqual(start, opening(b.SG.state));
  const before = [...b.storage];
  b.SG.__test.endMatch("dark", 1000);
  assert.deepEqual([...b.storage], before);
  assert.match(b.el("winnerHeadline").textContent, /SG1-UNDERWORLD/);
  assert.match(b.el("ledger").innerHTML, /SG1-UNDERWORLD/);
  assert.ok(!b.el("ledger").innerHTML.includes(b.SG.I18N.t("scenario." + b.SG.state.scenario.id + ".blurb")));
  b.el("btnPlayAgain").fire();
  continueAuctionToPlanning(b);
  assert.deepEqual(opening(b.SG.state), start);
});

test("Fate input errors are visible, localized and cleared by new or valid codes", () => {
  const h = harness();
  const input = read("index.html").match(/<input\b[^>]*\bid="fateCode"[^>]*>/)[0];
  assert.doesNotMatch(input, /\bmaxlength=/);
  h.el("fateCode").value = "SG1-ABCDEFGHIJKLM";
  h.el("btnFatePlay").fire();
  assert.equal(h.SG.state.scene, "start");
  assert.equal(h.el("fateCode").getAttribute("aria-invalid"), "true");
  h.el("fateCode").value = "   ";
  h.el("btnFatePlay").fire();
  assert.equal(h.SG.state.scene, "start");
  assert.equal(h.el("fateCode").getAttribute("aria-invalid"), "true");
  assert.match(h.el("fateStatus").textContent, /SG1-/);
  h.SG.I18N.lang = "zh";
  h.SG.__test.refreshLanguage();
  assert.match(h.el("fateStatus").textContent, /请输入/);
  h.el("btnFateNew").fire();
  assert.equal(h.el("fateStatus").textContent, "");
  assert.equal(h.el("fateCode").getAttribute("aria-invalid"), null);
  h.el("fateCode").value = " SG1-ABCDEFGHIJKL ";
  h.el("btnFatePlay").fire();
  continueAuctionToPlanning(h);
  assert.equal(h.SG.state.scenario.fateCode, "SG1-ABCDEFGHIJKL");
});

test("Bot vs Bot plans both sides, advances unattended and blocks manual commands", () => {
  const h = harness({ "sg.mirror": { aegisLv: 5, crystalLv: 5 } });
  h.el("difficulty").value = "hard";
  h.el("btnSpectator").fire();
  assert.equal(h.SG.state.mode, "spectator");
  assert.equal(h.SG.state.scene, "battle");
  assert.equal(h.SG.state.humanSide, null);
  assert.deepEqual(plain(h.SG.state.aegis), { light: 3, dark: 3 });
  for (const side of ["light", "dark"]) {
    assert.equal(h.SG.state.planLocked[side], true);
    assert.ok(h.SG.state.plan[side].length > 0);
  }
  assert.ok(h.el("planBar").classList.contains("hidden"));
  assert.ok(h.el("boardActions").classList.contains("hidden"));
  assert.equal(h.el("btnBid").disabled, true, "the auction bid display is disabled during spectator play");
  assert.equal(h.el("btnBid").listeners.click, undefined, "the read-only bid display has no click handler");
  assert.match(h.el("turnBanner").textContent, /Spectating/);
  assert.doesNotMatch(h.el("titleSideLight").textContent + h.el("titleSideDark").textContent, /\(you\)/);
  const before = plain(h.SG.state);
  for (const id of ["btnValidate", "btnWard", "btnSummon", "btnUndo", "btnClear", "btnRevert", "btnReplay", "btnHandoffReady"]) h.el(id).fire();
  h.el("board").fire("click", { clientX: 35, clientY: 35 });
  assert.deepEqual(plain(h.SG.state), before);
  for (let i = 0; i < 300 && h.SG.state.roundNumber < 3 && h.SG.state.scene !== "gameover"; i++) h.tick();
  assert.ok(h.SG.state.roundNumber >= 3 || h.SG.state.scene === "gameover");
  h.el("btnOptionsGame").fire();
  assert.equal(h.el("optionsScreen").classList.contains("hidden"), false);
  h.el("optSpeed").value = "2";
  h.el("optSpeed").fire("input");
  assert.equal(h.SG.state.battleSpeed, 2);
  h.el("btnOptionsClose").fire();
  h.el("btnQuit").fire();
  const stopped = opening(h.SG.state);
  h.frame(10000);
  assert.equal(h.SG.state.scene, "start");
  assert.deepEqual(opening(h.SG.state), stopped);
  h.el("btnVsBot").fire();
  assert.equal(h.SG.state.mode, "bot");
  continueAuctionToPlanning(h);
});

test("Spectator results do not change progression and Play Again preserves selected rules", () => {
  const h = harness({ "sg.records": { bot: { wins: 2 } }, "sg.mirror": { obols: 10 } });
  h.el("difficulty").value = "unfair";
  h.el("persona").value = "butcher";
  h.el("movesPerRound").value = "5";
  h.el("harrowerToggle").checked = true;
  h.el("btnSpectator").fire();
  const before = [...h.storage];
  h.SG.__test.endMatch("light", 1000);
  assert.deepEqual([...h.storage], before);
  assert.equal(h.SG.state.lastRecord, null);
  h.el("btnPlayAgain").fire();
  assert.equal(h.SG.state.mode, "spectator");
  assert.equal(h.SG.state.scene, "battle");
  assert.equal(h.SG.state.difficulty, "unfair");
  assert.equal(h.SG.state.botPersona, "butcher");
  assert.equal(h.SG.state.movesPerRound, 5);
  assert.equal(h.SG.state.harrowerDragEnabled, true);
});

test("A complete Bot vs Bot match reaches its result without human intervention", () => {
  const h = harness();
  h.el("difficulty").value = "hard";
  h.el("persona").value = "butcher";
  h.el("btnSpectator").fire();
  for (let i = 0; i < 1800 && h.SG.state.scene === "battle"; i++) h.tick(1000);
  assert.equal(h.SG.state.scene, "gameover");
  assert.equal(h.el("gameOverScreen").classList.contains("hidden"), false);
  assert.ok(h.el("winnerHeadline").textContent);
  assert.equal(h.storage.has("sg.records"), false);
});

test("All feature strings exist with matching placeholders in every supported language", () => {
  const { SG } = harness();
  const keys = Object.keys(SG.I18N_DICT.en).filter(key => /^(fate\.|.*spectator$|over\.fate)/.test(key));
  assert.ok(keys.length >= 13);
  for (const lang of ["fr", "zh", "ar"]) for (const key of keys) {
    assert.ok(SG.I18N_DICT[lang][key]?.trim(), `${lang}: ${key}`);
    const tokens = value => (value.match(/\{\w+\}/g) || []).sort();
    assert.deepEqual(tokens(SG.I18N_DICT[lang][key]), tokens(SG.I18N_DICT.en[key]));
  }
});
