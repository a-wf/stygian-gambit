"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const gameSource = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const styleSource = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");
const bootBlock = `  state = freshState();
  buildBoardCache();
  seedAmbientParticles();
  buildLegendIcons();
  refreshLanguage();
  requestAnimationFrame(loop);
  Object.defineProperty(SG, "state", { get: () => state });`;

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.value = "";
    this.disabled = false;
    this.style = {};
    this.listeners = new Map();
    this.children = [];
    this.attributes = {};
    this.context = new Proxy({}, {
      get(object, key) { return key in object ? object[key] : () => {}; },
      set(object, key, value) { object[key] = value; return true; },
    });
    this._textContent = "";
    this._innerHTML = "";
    this.className = "";
    this.classList = {
      add: (...names) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach(name => classes.add(name));
        this.className = [...classes].join(" ");
      },
      remove: (...names) => {
        const removed = new Set(names);
        this.className = this.className.split(/\s+/).filter(name => name && !removed.has(name)).join(" ");
      },
      contains: name => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const shouldAdd = force === undefined ? !this.classList.contains(name) : !!force;
        if (shouldAdd) this.classList.add(name);
        else this.classList.remove(name);
        return shouldAdd;
      },
    };
    if (["startScreen", "hud", "gameOverScreen", "planBar", "boardActions",
      "choiceScreen", "handoffScreen", "trialsScreen", "optionsScreen",
      "boonScreen", "mirrorScreen", "onlineScreen", "auctionScreen",
      "auctionReveal", "btnAuctionContinue", "btnAuctionQuit", "btnAuctionRetry"].includes(id)) {
      this.classList.add("hidden");
    }
    if (id === "board") {
      this.width = 560;
      this.height = 560;
    }
  }

  set textContent(value) { this._textContent = String(value); this.children = []; }
  get textContent() {
    return this.children.length ? this.children.map(child => child.textContent).join("") : this._textContent;
  }
  set innerHTML(value) { this._innerHTML = String(value); this.children = []; }
  get innerHTML() { return this._innerHTML; }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  dispatch(type, event = {}) {
    const handler = this.listeners.get(type);
    assert.ok(handler, `expected a ${type} listener on ${this.id}`);
    handler({ target: this, ...event });
  }
  appendChild(child) { this.children.push(child); return child; }
  getContext() { return this.context; }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.width || 560, height: this.height || 560 }; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  focus() {}
}

function createHarness({ storedPlanSeconds, omitTimerElements = false, net = null } = {}) {
  const elements = new Map();
  const omittedIds = omitTimerElements ? new Set(["turnTimer", "turnTimerLive"]) : new Set();
  const document = {
    getElementById(id) {
      if (omittedIds.has(id)) return null;
      if (!elements.has(id)) elements.set(id, new FakeElement(id));
      return elements.get(id);
    },
    createElement(tag) { return new FakeElement(tag); },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  const storage = new Map();
  if (storedPlanSeconds !== undefined) {
    storage.set("sg.planSeconds", JSON.stringify(storedPlanSeconds));
  }
  let now = 0;
  let promptImpl = () => null;
  const translations = {
    "timer.label": "timer.label {time}",
    "timer.start": "timer.start {side} {n}",
    "timer.warn": "timer.warn {n}",
    "timer.expired": "timer.expired {side}",
    "log.timeUp": "log.timeUp {side}",
  };
  const sg = {
    THEMES: { classic: { painters: {} } },
    I18N: {
      lang: "en",
      t(key, params) {
        const template = translations[key] || key;
        return params ? template.replace(/\{(\w+)\}/g, (match, name) =>
          params[name] == null ? match : String(params[name])) : key;
      },
    },
  };
  if (net) sg.Net = net;
  const sandbox = {
    window: {
      SG: sg,
      addEventListener() {},
      prompt(...args) { return promptImpl(...args); },
    },
    document,
    location: { search: "" },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    performance: { now() { return now; } },
    requestAnimationFrame() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    console,
  };
  const instrumentation = `  state = freshState();
  let validateCalls = 0;
  const validateNormally = onValidate;
  onValidate = function () { validateCalls++; return validateNormally(); };
  Object.defineProperty(SG, "state", { get: () => state });
  SG.__planTimerTest = {
    startMatch, startPlanClock, tickPlanClock, expirePlanClock, onValidate,
    onHandoffReady, replayLastRound, finishBattle, revertRound, snapshotState,
    openChoice, startOnlineMatch, planningLocked, beginPlanningPhase, beginAuction,
    lockAuctionBid, onAuctionHandoffReady, onAuctionContinue, tickAuctionClock,
    expireAuctionClock, applyOnlineBids, buildMyPacket, resolveOnlineRound,
    applyOnlinePacket, beginBattle, payRoundEconomy, resolveInitiative,
    normalizeBid, auctionQuickAmounts, isAllInQuickAmount, releaseRoomTheme,
    get validateCalls() { return validateCalls; },
    getElement: id => document.getElementById(id),
  };`;
  assert.equal(gameSource.split(bootBlock).length, 2, "expected the game boot block to remain recognizable");
  vm.runInNewContext(gameSource.replace(bootBlock, instrumentation), sandbox, { filename: "game.js" });
  return {
    SG: sandbox.window.SG,
    storage,
    get now() { return now; },
    setNow(value) { now = value; },
    setPrompt(fn) { promptImpl = fn; },
    sandbox,
    timer: sandbox.window.SG.__planTimerTest,
  };
}

function startLocal(h, seconds) {
  h.timer.startMatch("hotseat", "light", false, seconds === undefined ? {} : { planSeconds: seconds });
}

function startAuctionMatch(h, {
  mode = "hotseat", humanSide = "light", planSeconds = 20,
  lightCrystals = 29, darkCrystals = 29, difficulty = "normal",
} = {}) {
  h.timer.startMatch(mode, humanSide, false, {
    planSeconds,
    difficulty,
    scenario: {
      id: "auction-test",
      pieces: [],
      crystals: { light: lightCrystals, dark: darkCrystals },
    },
  });
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }

test("timer setting defaults to 60 seconds, offers 20/60/90, and persists validated choices", () => {
  const h = createHarness();
  const picker = h.timer.getElement("planSeconds");
  assert.equal(picker.value, "60");

  const selectMarkup = indexSource.match(/<select id="planSeconds">([\s\S]*?)<\/select>/);
  assert.ok(selectMarkup, "start screen exposes the planning timer selector");
  assert.deepEqual([...selectMarkup[1].matchAll(/<option value="(\d+)"/g)].map(match => match[1]), ["20", "60", "90"]);

  picker.value = "20";
  picker.dispatch("change");
  assert.equal(h.storage.get("sg.planSeconds"), "20");
  startLocal(h);
  assert.equal(h.SG.state.planSeconds, 20);
  assert.equal(h.SG.state.planClock.seconds, 20);

  picker.value = "90";
  picker.dispatch("change");
  assert.equal(h.storage.get("sg.planSeconds"), "90");
  startLocal(h);
  assert.equal(h.SG.state.planSeconds, 90);

  picker.value = "33";
  picker.dispatch("change");
  assert.equal(picker.value, "60", "unsupported selections normalize to the default");
  assert.equal(h.storage.get("sg.planSeconds"), "60");
  assert.equal(createHarness({ storedPlanSeconds: 45 }).timer.getElement("planSeconds").value, "60");
});

test("active planning clock shows a countdown and expires on the exact monotonic deadline", () => {
  const h = createHarness();
  startLocal(h, 20);
  const clock = h.SG.state.planClock;
  const hud = h.timer.getElement("turnTimer");
  const live = h.timer.getElement("turnTimerLive");
  assert.equal(clock.deadline, 20_000);
  assert.match(hud.textContent, /0:20/);
  assert.equal(hud.classList.contains("hidden"), false);

  h.timer.tickPlanClock(clock.deadline - 10_000);
  assert.equal(clock.warned, true);
  assert.match(live.textContent, /10/);
  h.timer.tickPlanClock(clock.deadline - 1);
  assert.equal(h.SG.state.planClock, clock, "the last second remains active until the deadline");

  h.timer.tickPlanClock(clock.deadline);
  assert.equal(h.timer.validateCalls, 1, "expiry must submit through the normal validation path once");
  assert.equal(h.SG.state.scene, "handoff");
  assert.equal(h.SG.state.planLocked.light, true);
  assert.equal(h.SG.state.eventLog.filter(line => line.includes("log.timeUp")).length, 1);
  assert.equal(h.SG.state.planClock, null);
  assert.equal(h.timer.expirePlanClock(clock.gen), false, "the same generation cannot submit twice");
  assert.equal(h.timer.validateCalls, 1);
});

test("expiry preserves partial orders; an empty plan and an unanswered choice end safely", () => {
  const h = createHarness();
  startLocal(h, 20);
  const order = { pieceId: 1, kind: "move", row: 1, col: 0 };
  h.SG.state.plan.light.push(order);
  h.SG.state.summonArmed = "juggernaut";
  h.SG.state.wardMode = true;
  h.timer.tickPlanClock(h.SG.state.planClock.deadline);
  assert.equal(JSON.stringify(h.SG.state.plan.light), JSON.stringify([order]));
  assert.equal(h.SG.state.summonArmed, null);
  assert.equal(h.SG.state.wardMode, false);
  assert.equal(h.SG.state.planLocked.light, true);
  assert.equal(h.SG.state.scene, "handoff");

  const empty = createHarness();
  startLocal(empty, 20);
  let choiceCancelled = 0;
  empty.timer.openChoice({ title: "pick", options: [], onCancel() { choiceCancelled++; } });
  empty.timer.tickPlanClock(empty.SG.state.planClock.deadline);
  assert.equal(choiceCancelled, 1, "an unanswered choice is cancelled on expiry");
  assert.equal(empty.timer.getElement("choiceScreen").classList.contains("hidden"), true);
  assert.equal(empty.SG.state.plan.light.length, 0);
  assert.equal(empty.SG.state.scene, "handoff", "no orders simply pass the side's planning turn");
  assert.equal(empty.timer.validateCalls, 1);
});

test("manual validation at the deadline wins the race with the next timer frame", () => {
  const h = createHarness();
  startLocal(h, 20);
  const due = h.SG.state.planClock.deadline;
  h.setNow(due);
  h.timer.onValidate();
  h.timer.tickPlanClock(due);
  assert.equal(h.timer.validateCalls, 1);
  assert.equal(h.SG.state.scene, "handoff");
  assert.equal(h.SG.state.eventLog.some(line => line.includes("log.timeUp")), false,
    "a deliberate validation just before the expiry frame is not also a timeout");
});

test("local auction clock passes at ten seconds, then each planner receives the full plan clock", () => {
  const h = createHarness();
  startAuctionMatch(h);
  assert.equal(h.SG.state.scene, "auction");
  assert.equal(h.SG.state.planClock, null, "the plan timer does not run during the auction");
  const lightClock = h.SG.state.auctionClock;
  assert.equal(lightClock.deadline, 10_000);

  h.timer.tickAuctionClock(lightClock.deadline - 1);
  assert.equal(h.SG.state.auction.bids.light, null, "the bid remains unsealed before the deadline");
  h.setNow(lightClock.deadline);
  h.timer.tickAuctionClock(lightClock.deadline);
  assert.equal(h.SG.state.auction.bids.light, 0, "timeout is a sealed pass");
  assert.equal(h.SG.state.auction.timedOut.light, true);
  assert.equal(h.SG.state.auction.phase, "handoff");
  assert.equal(h.SG.state.planClock, null);
  assert.equal(h.SG.state.eventLog.some(line => line.includes("log.auctionTimeout")), false,
    "the timeout reason is not revealed before both sides have bid");

  h.timer.onAuctionHandoffReady();
  const darkClock = h.SG.state.auctionClock;
  assert.equal(darkClock.deadline, lightClock.deadline + 10_000,
    "the next local bidder receives an independent ten-second clock");
  h.setNow(darkClock.deadline);
  h.timer.tickAuctionClock(darkClock.deadline);
  assert.equal(h.SG.state.auction.phase, "reveal");
  assert.equal(h.SG.state.auction.timedOut.dark, true);
  assert.equal(h.SG.state.eventLog.filter(line => line.includes("log.auctionTimeout")).length, 2,
    "both timeouts are reported only after the reveal");
  assert.equal(h.SG.state.planClock, null, "the planning clock still has not started");

  h.timer.onAuctionContinue();
  assert.equal(h.SG.state.scene, "planning");
  assert.equal(h.SG.state.planClock.deadline, darkClock.deadline + 20_000,
    "the first planner gets the entire configured planning clock after the auction");
  assert.equal(h.SG.state.planClock.seconds, 20);

  h.timer.onValidate();
  h.timer.onHandoffReady();
  assert.equal(h.SG.state.planClock.side, "dark");
  assert.equal(h.SG.state.planClock.deadline, darkClock.deadline + 20_000,
    "the second planner also starts with a fresh full clock after the device handoff");
});

test("hotseat bids stay sealed through device handoff and winner/loser charges happen at battle", () => {
  const h = createHarness();
  startAuctionMatch(h);
  const state = h.SG.state;
  assert.deepEqual({ ...state.crystals }, { light: 40, dark: 40 });
  assert.equal(state.auction.phase, "bid");

  const amount = h.timer.getElement("auctionAmount");
  amount.value = "40";
  h.timer.getElement("btnAuctionLock").dispatch("click");

  assert.equal(state.auction.bids.light, 40);
  assert.equal(state.auction.phase, "handoff");
  assert.equal(h.timer.getElement("auctionScreen").classList.contains("hidden"), true);
  assert.equal(h.timer.getElement("handoffScreen").classList.contains("hidden"), false);
  assert.equal(h.timer.getElement("auctionReveal").classList.contains("hidden"), true);
  assert.equal(h.timer.getElement("auctionReveal").textContent, "");
  assert.equal(h.timer.getElement("auctionAmount").value, "", "the first bid is cleared before handing over");
  assert.equal(h.timer.getElement("handoffText").textContent.includes("40"), false);
  assert.equal(state.eventLog.some(line => line.includes("log.auctionReveal")), false,
    "the first bidder's amount and result are not announced to the next bidder");
  assert.deepEqual({ ...state.crystalBid }, { light: 0, dark: 0 }, "sealed bids are not public state before reveal");
  assert.deepEqual({ ...state.crystals }, { light: 40, dark: 40 }, "locking does not spend crystals");

  h.timer.onAuctionHandoffReady();
  assert.equal(state.auction.phase, "bid");
  assert.equal(state.auction.cur, "dark");
  assert.equal(h.timer.getElement("auctionAmount").value, "0", "the second bidder gets a clean bid form");
  h.timer.getElement("auctionAmount").value = "20";
  h.timer.getElement("btnAuctionLock").dispatch("click");

  assert.equal(state.auction.phase, "reveal");
  assert.deepEqual({ ...state.crystalBid }, { light: 40, dark: 20 });
  assert.deepEqual(plain(state.auction.result), {
    first: "light",
    outcome: "light",
    bids: { light: 40, dark: 20 },
    pay: { light: 40, dark: 14 },
  });
  assert.ok(state.eventLog.some(line => line.includes("log.auctionReveal")));
  assert.deepEqual({ ...state.crystals }, { light: 40, dark: 40 }, "reveal itself does not charge either bidder");

  h.timer.onAuctionContinue();
  assert.equal(state.planClock.deadline, h.now + 20_000, "planning begins with a fresh full clock");
  h.timer.onValidate();
  h.timer.onHandoffReady();
  assert.equal(state.planClock.deadline, h.now + 20_000, "the other hotseat planner gets a full clock too");
  h.timer.onValidate();
  assert.equal(state.scene, "battle");
  assert.deepEqual({ ...state.crystals }, { light: 0, dark: 26 },
    "the winner pays 100% and the losing bidder pays 70% when battle begins");
});

test("equal bids retain alternating initiative and both pay 70 percent", () => {
  const h = createHarness();
  startAuctionMatch(h);
  h.timer.lockAuctionBid("light", "40", "manual");
  h.timer.onAuctionHandoffReady();
  h.timer.lockAuctionBid("dark", "40", "manual");

  assert.equal(h.SG.state.auction.phase, "reveal");
  assert.deepEqual(plain(h.SG.state.auction.result), {
    first: "light",
    outcome: "tie",
    bids: { light: 40, dark: 40 },
    pay: { light: 28, dark: 28 },
  });
  h.timer.onAuctionContinue();
  h.timer.beginBattle(h.now);
  assert.deepEqual({ ...h.SG.state.crystals }, { light: 12, dark: 12 });
});

test("revealed bids are reused by replay and Undo Round instead of starting another auction", () => {
  const h = createHarness();
  startAuctionMatch(h);
  h.timer.lockAuctionBid("light", "20", "manual");
  h.timer.onAuctionHandoffReady();
  h.timer.lockAuctionBid("dark", "40", "manual");
  h.timer.onAuctionContinue();

  const state = h.SG.state;
  const lockedBids = { ...state.crystalBid };
  assert.equal(state.auctionDone, true);
  assert.deepEqual({ ...state.history.at(-1).crystalBid }, lockedBids,
    "the round-start snapshot records the revealed bids");
  state.lastBattle = {
    fromSnapshot: h.timer.snapshotState(),
    plans: { light: [], dark: [] },
    firstSide: state.firstSide,
  };
  const crystalsBeforeReplay = { ...state.crystals };
  h.timer.replayLastRound();
  assert.equal(state.scene, "battle");
  assert.equal(state.isReplay, true);
  h.timer.finishBattle(h.now);
  assert.equal(state.scene, "planning");
  assert.equal(state.auctionDone, true);
  assert.deepEqual({ ...state.crystalBid }, lockedBids);
  assert.deepEqual({ ...state.crystals }, crystalsBeforeReplay, "replay does not charge the auction twice");
  assert.equal(state.auctionClock, null);

  state.history.push(h.timer.snapshotState());
  h.timer.revertRound();
  assert.equal(state.scene, "planning");
  assert.equal(state.auctionDone, true);
  assert.deepEqual({ ...state.crystalBid }, lockedBids);
  assert.equal(state.auction, null);
  assert.equal(state.auctionClock, null);
  assert.equal(state.planClock.deadline, h.now + 20_000, "undo starts replanning without an auction");
});

test("bot seals its AI initiative bid before the human bid and planBid cannot replace it later", () => {
  const h = createHarness();
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "ai.js"), "utf8"), h.sandbox, {
    filename: "ai.js",
  });
  h.SG.AI.planTurn = () => ({ commands: [], wards: [], bid: 80 });
  startAuctionMatch(h, { mode: "bot", humanSide: "light", difficulty: "hard" });

  assert.equal(h.SG.state.auction.bids.dark, 25,
    "the hard Warden bids 25 when it can afford that legal arbitrary amount");
  assert.deepEqual(Array.from(h.SG.state.auction.asked), ["light"], "the human bids only after the bot has sealed");
  assert.equal(h.SG.state.auction.phase, "bid");
  assert.equal(h.timer.getElement("auctionReveal").classList.contains("hidden"), true);
  h.timer.lockAuctionBid("light", "40", "manual");
  assert.equal(h.SG.state.auction.phase, "reveal");
  assert.deepEqual({ ...h.SG.state.crystalBid }, { light: 40, dark: 25 });

  h.timer.onAuctionContinue();
  h.timer.onValidate();
  assert.equal(h.SG.state.scene, "battle");
  assert.equal(h.SG.state.crystalBid.dark, 25, "legacy planTurn bid data cannot overwrite the auction result");
});

test("initiative accepts any whole bid from 20 through the purse and rejects invalid custom values", () => {
  const h = createHarness();
  startAuctionMatch(h, { lightCrystals: 29, darkCrystals: 29 });
  const state = h.SG.state;
  assert.equal(state.crystals.light, 40, "the round's +10 grant is available before the auction");
  assert.equal(h.timer.normalizeBid("25", 40), 25);
  assert.equal(h.timer.normalizeBid("37", 40), 37);
  for (const invalid of ["19", "37.5", "41"]) {
    assert.equal(h.timer.normalizeBid(invalid, 40), null, `${invalid} is not a legal bid`);
  }

  for (const invalid of ["19", "37.5", "41"]) {
    assert.equal(h.timer.lockAuctionBid("light", invalid, "manual"), false);
    assert.equal(state.auction.phase, "bid", `${invalid} leaves the bid open for correction`);
  }
  assert.equal(h.timer.lockAuctionBid("light", "25", "manual"), true);
  h.timer.onAuctionHandoffReady();
  assert.equal(h.timer.lockAuctionBid("dark", "37", "manual"), true);
  assert.deepEqual({ ...state.auction.bids }, { light: 25, dark: 37 });
  assert.deepEqual({ ...state.auction.result.pay }, { light: 18, dark: 37 },
    "the losing 25 bid pays exact rounded 70% while the 37 winner pays in full");
});

test("auction quick picks include arbitrary all-in amounts while retaining 20-crystal steps", () => {
  const h = createHarness();
  startAuctionMatch(h, { lightCrystals: 60, darkCrystals: 29 });
  const state = h.SG.state;
  assert.equal(state.crystals.light, 73, "interest is added before the +10 round grant");
  assert.deepEqual(Array.from(h.timer.auctionQuickAmounts(73)), [20, 40, 60, 73]);
  assert.equal(h.timer.isAllInQuickAmount(73, 73), true);
  assert.equal(h.timer.isAllInQuickAmount(60, 73), false);
  assert.deepEqual(Array.from(h.timer.auctionQuickAmounts(40)), [20, 40],
    "an exact-step purse does not get a duplicate all-in option");
  assert.equal(h.timer.isAllInQuickAmount(40, 40), false);
  assert.deepEqual(Array.from(h.timer.auctionQuickAmounts(19)), []);
  assert.equal(h.timer.getElement("auctionAmount").max, "73");
  const options = h.timer.getElement("auctionOptions").children;
  assert.equal(options.length, 4);
  options[3].dispatch("click");
  assert.equal(h.timer.getElement("auctionAmount").value, "73",
    "the UI's final quick-pick is the whole remaining purse when it is off-step");
  assert.equal(h.timer.lockAuctionBid("light", "73", "manual"), true);
});

test("AI initiative bids use 25 and 45 when affordable and otherwise respect purse/order", () => {
  const h = createHarness();
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "ai.js"), "utf8"), h.sandbox, {
    filename: "ai.js",
  });
  const state = h.SG.state;
  state.firstSide = "light";
  state.crystals.dark = 100;
  assert.equal(h.SG.AI.planBid("dark", "hard"), 25);
  assert.equal(h.SG.AI.planBid("dark", "unfair"), 45);
  state.crystals.dark = 32;
  assert.equal(h.SG.AI.planBid("dark", "unfair"), 25, "the unfair bid stays within a smaller legal purse");
  state.crystals.dark = 19;
  assert.equal(h.SG.AI.planBid("dark", "hard"), 0, "the AI passes below the minimum");
  state.crystals.dark = 100;
  state.firstSide = "dark";
  assert.equal(h.SG.AI.planBid("dark", "unfair"), 0, "the AI does not bid when it already has initiative");
});

test("online room move cap and untimed setting apply despite a longer recorded timer choice", () => {
  const net = {
    normalizeConfig(config) {
      return Object.assign({
        v: 2, furies: false, harrowerDrag: false, hazards: false,
        movesPerRound: 3, planSeconds: 60, difficulty: "normal", persona: "balanced",
        theme: null, seed: 17, firstSide: "light",
      }, config);
    },
    submitBid() {},
    submitPlan() {},
  };
  const h = createHarness({ net });
  h.timer.startOnlineMatch({
    movesPerRound: 2, planSeconds: 90, difficulty: "hard", persona: "warden",
    furies: true, hazards: true, harrowerDrag: true, seed: 17,
  }, "light");
  const state = h.SG.state;
  assert.equal(state.movesPerRound, 2);
  assert.equal(state.planSeconds, 0, "the recorded host timer does not start a local online clock");
  assert.equal(state.planClock, null);
  assert.equal(state.auctionClock, null);

  const commands = n => Array.from({ length: n }, (_, i) => ({
    pieceId: i + 1, kind: "move", row: 2, col: i,
  }));
  h.timer.resolveOnlineRound({
    light: { commands: commands(5), wards: [], summons: [], aegis: 2 },
    dark: { commands: commands(5), wards: [], summons: [], aegis: 2 },
  });
  assert.equal(state.plan.light.length, 2, "the room's move cap clips received light orders");
  assert.equal(state.plan.dark.length, 2, "the room's move cap clips received dark orders");
  assert.equal(state.planClock, null, "the remote plans do not start a local timer");
});

test("online auction accepts custom integer bids and rejects malformed or over-purse peer bids", () => {
  const net = { submitBid() {}, submitPlan() {} };
  const h = createHarness({ net });
  h.timer.startOnlineMatch({ planSeconds: 90 }, "light");
  const state = h.SG.state;
  state.crystals = { light: 40, dark: 50 };
  h.timer.beginPlanningPhase();
  const round = state.roundNumber;

  assert.equal(h.timer.lockAuctionBid("light", "25", "manual"), true);
  h.SG.Net.onBothBids(round, { light: 25, dark: 37 });
  assert.deepEqual({ ...state.crystalBid }, { light: 25, dark: 37 },
    "both arbitrary legal integers survive the online reveal");

  state.crystals = { light: 40, dark: 40 };
  h.timer.beginPlanningPhase();
  assert.equal(h.timer.lockAuctionBid("light", "20", "manual"), true);
  h.SG.Net.onBothBids(round, { light: 19, dark: 41 });
  assert.deepEqual({ ...state.crystalBid }, { light: 0, dark: 0 },
    "below-minimum and over-purse room packets are treated as passes on both clients");

  state.crystals = { light: 40, dark: 40 };
  h.timer.beginPlanningPhase();
  assert.equal(h.timer.lockAuctionBid("light", "20", "manual"), true);
  h.SG.Net.onBothBids(round, { light: 37.5, dark: 25 });
  assert.deepEqual({ ...state.crystalBid }, { light: 0, dark: 25 },
    "the game-side online validator rejects a fractional bid even if a malformed packet bypasses the input");
});

test("round tribute is credited to both sides before auction and is idempotent across online replays", () => {
  const net = {
    bids: [],
    normalizeConfig(config) {
      return Object.assign({
        v: 2, furies: false, harrowerDrag: false, hazards: false,
        movesPerRound: 3, planSeconds: 90, difficulty: "normal", persona: "balanced",
        theme: null, seed: 23, firstSide: "light",
      }, config);
    },
    submitBid(round, bid) { this.bids.push({ round, bid }); },
    submitPlan() {},
  };
  const h = createHarness({ net });
  h.timer.startOnlineMatch({ planSeconds: 90, seed: 23 }, "light");
  const state = h.SG.state;
  assert.deepEqual({ ...state.crystals }, { light: 10, dark: 10 });
  assert.equal(state.auctionDone, true, "the no-bid round is settled after the tribute");

  state.roundNumber = 1;
  state.crystals = { light: 9, dark: 19 };
  h.timer.beginPlanningPhase();
  assert.deepEqual({ ...state.crystals }, { light: 19, dark: 29 },
    "the next round adds exactly 10 to each side before the bid exchange (no interest at these purses)");
  assert.deepEqual(net.bids.at(-1), { round: 1, bid: 0 },
    "the online bid submission happens after that round's grant");
  h.timer.applyOnlineBids(1, { light: 0, dark: 20 });
  h.timer.onAuctionContinue();
  const bothPassPlans = {
    light: { commands: [], wards: [], summons: [], aegis: 2 },
    dark: { commands: [], wards: [], summons: [], aegis: 2 },
  };
  h.timer.resolveOnlineRound(bothPassPlans);
  const resolvedCrystals = { ...state.crystals };
  assert.deepEqual(resolvedCrystals, { light: 19, dark: 9 },
    "the dark side pays its 20-crystal winning bid after receiving the round grant");
  h.timer.resolveOnlineRound(bothPassPlans);
  assert.deepEqual({ ...state.crystals }, resolvedCrystals,
    "a repeated online plan packet rewinds to the paid round snapshot instead of granting or charging twice");
  h.SG.Net.onBothPlans(1, bothPassPlans);
  assert.equal(state.scene, "battle", "a duplicate callback during battle is queued rather than started again");
  assert.deepEqual({ ...state.crystals }, resolvedCrystals,
    "the network callback path does not charge the same sealed bid a second time");
  h.timer.finishBattle(state.lastTs + 500);
  assert.equal(state.roundNumber, 2);
  assert.deepEqual({ ...state.crystals }, { light: 29, dark: 19 },
    "the next round receives one fresh +10 grant after the prior packet was repeated");

  // Replay restores the post-grant round snapshot, and completing it must not call the economy again.
  h.timer.startOnlineMatch({ seed: 23 }, "light");
  const replayState = h.SG.state;
  replayState.lastBattle = {
    fromSnapshot: h.timer.snapshotState(),
    plans: { light: [], dark: [] },
    firstSide: replayState.firstSide,
  };
  h.timer.replayLastRound();
  assert.deepEqual({ ...replayState.crystals }, { light: 10, dark: 10 },
    "replaying the already-paid round does not credit another tribute");
  h.timer.finishBattle(replayState.lastTs);
  assert.deepEqual({ ...replayState.crystals }, { light: 10, dark: 10 },
    "visual Replay keeps the round's +10 grant exactly once");
});

test("Undo Round restores the earlier economy snapshot without regranting crystals", () => {
  const h = createHarness();
  startLocal(h);
  const state = h.SG.state;
  assert.deepEqual({ ...state.crystals }, { light: 10, dark: 10 });

  state.roundNumber = 1;
  h.timer.beginPlanningPhase();
  assert.deepEqual({ ...state.crystals }, { light: 20, dark: 20 });
  h.timer.lockAuctionBid("light", "0", "manual");
  h.timer.onAuctionHandoffReady();
  h.timer.lockAuctionBid("dark", "0", "manual");
  h.timer.onAuctionContinue();
  h.timer.revertRound();
  assert.equal(state.roundNumber, 0);
  assert.deepEqual({ ...state.crystals }, { light: 10, dark: 10 });
  h.timer.beginPlanningPhase();
  assert.deepEqual({ ...state.crystals }, { light: 10, dark: 10 },
    "re-entering the restored round does not grant its tribute again");
  state.roundNumber = 1;
  h.timer.beginPlanningPhase();
  assert.deepEqual({ ...state.crystals }, { light: 20, dark: 20 },
    "the restored economyRound allows the next real round to receive its one +10 grant");
});

test("online auction waits for both sealed bids, then reveals without starting a local clock", () => {
  const net = { calls: [], submitBid(round, bid) { this.calls.push({ round, bid }); } };
  const h = createHarness({ net });
  h.timer.startOnlineMatch({ furies: false }, "light");
  h.SG.state.crystals = { light: 40, dark: 40 };
  h.timer.beginPlanningPhase();
  const state = h.SG.state;

  assert.equal(state.mode, "online");
  assert.equal(state.auctionClock, null, "online auctions are untimed");
  h.timer.lockAuctionBid("light", "20", "manual");
  assert.equal(state.auction.phase, "waiting");
  assert.deepEqual(net.calls, [{ round: state.roundNumber, bid: 20 }]);
  assert.deepEqual({ ...state.crystalBid }, { light: 0, dark: 0 }, "one online bid is not yet revealed");
  assert.equal(state.planClock, null);

  h.SG.Net.onBothBids(state.roundNumber, { light: 20, dark: 40 });
  assert.equal(state.auction.phase, "reveal");
  assert.deepEqual({ ...state.crystalBid }, { light: 20, dark: 40 });
  assert.equal(state.auction.result.outcome, "dark");
  h.timer.onAuctionContinue();
  assert.equal(state.scene, "planning");
  assert.equal(state.planClock, null, "online plans remain untimed after the auction");
  assert.equal(state.auctionClock, null);
  assert.equal(h.timer.buildMyPacket().bid, 20, "the online plan packet carries the sealed bid");
});

test("online bid failures remain recoverable and retry the same sealed amount once", () => {
  const net = {
    calls: [],
    submitBid(round, bid, done) { this.calls.push({ round, bid, done }); },
  };
  const h = createHarness({ net });
  h.timer.startOnlineMatch({ furies: false }, "light");
  h.SG.state.crystals = { light: 40, dark: 40 };
  h.timer.beginPlanningPhase();

  const state = h.SG.state;
  const round = state.roundNumber;
  h.timer.lockAuctionBid("light", "20", "manual");
  assert.equal(net.calls.length, 1);
  assert.equal(state.auction.phase, "waiting");
  assert.equal(h.timer.getElement("auctionReveal").classList.contains("hidden"), true);

  net.calls[0].done("permission denied");
  assert.equal(state.auction.phase, "bidError");
  assert.equal(state.auction.bids.light, 20, "the failed write does not unseal or change the bid");
  assert.match(state.auction.bidError, /permission denied/);
  assert.equal(h.timer.getElement("btnAuctionRetry").classList.contains("hidden"), false,
    "the player can retry the failed write");
  assert.equal(h.timer.getElement("btnAuctionQuit").classList.contains("hidden"), false,
    "the player can also leave for the main menu");
  assert.equal(h.timer.getElement("auctionReveal").classList.contains("hidden"), true,
    "an error state never shows the sealed bid");

  const retry = h.timer.getElement("btnAuctionRetry");
  retry.dispatch("click");
  assert.equal(net.calls.length, 2);
  assert.equal(state.auction.phase, "waiting");
  assert.deepEqual(net.calls.map(call => ({ round: call.round, bid: call.bid })), [
    { round, bid: 20 },
    { round, bid: 20 },
  ], "retry resubmits the original amount instead of creating a second bid");

  retry.dispatch("click");
  assert.equal(net.calls.length, 2, "a second click while the retry is in flight starts no duplicate write");
  net.calls[1].done(null);
  assert.equal(state.auction.phase, "waiting",
    "successful persistence alone waits for the opponent's confirmed bid");
  assert.equal(h.timer.getElement("auctionReveal").classList.contains("hidden"), true);

  h.SG.Net.onBothBids(round, { light: 20, dark: 40 });
  assert.equal(state.auction.phase, "reveal");
  assert.deepEqual({ ...state.auction.bids }, { light: 20, dark: 40 });
  assert.equal(h.timer.getElement("auctionReveal").classList.contains("hidden"), false);
});

test("planning lock blocks board input after expiry and an open option cannot be picked late", () => {
  const boardCase = createHarness();
  startLocal(boardCase, 20);
  const deadline = boardCase.SG.state.planClock.deadline;
  boardCase.setNow(deadline);
  assert.equal(boardCase.timer.planningLocked(), true, "expired planning is locked before the next frame");
  boardCase.timer.getElement("board").dispatch("click", { clientX: 35, clientY: 105 });
  assert.equal(boardCase.SG.state.selection.pieceId, null, "late board clicks cannot select a piece");
  assert.equal(boardCase.SG.state.plan.light.length, 0);

  const optionCase = createHarness();
  startLocal(optionCase, 20);
  let picked = 0;
  let cancelled = 0;
  optionCase.timer.openChoice({
    title: "pick",
    options: [{ label: "option", onPick() { picked++; } }],
    onCancel() { cancelled++; },
  });
  const option = optionCase.timer.getElement("choiceOptions").children[0];
  const optionDeadline = optionCase.SG.state.planClock.deadline;
  optionCase.setNow(optionDeadline);
  option.dispatch("click");
  assert.equal(picked, 0, "an option click at expiry is ignored");
  assert.equal(optionCase.timer.getElement("choiceScreen").classList.contains("hidden"), false,
    "the overdue choice remains for the expiry path to cancel");
  optionCase.timer.tickPlanClock(optionDeadline);
  assert.equal(cancelled, 1, "expiry cancels the unanswered choice");
  assert.equal(optionCase.timer.validateCalls, 1);
  assert.equal(optionCase.SG.state.scene, "handoff");
});

test("handoff and battle do not run clocks, while each local planner gets a fresh turn", () => {
  const h = createHarness();
  startLocal(h, 20);
  const lightClock = h.SG.state.planClock;
  h.timer.onValidate();
  assert.equal(h.SG.state.scene, "handoff");
  assert.equal(h.SG.state.planClock, null);

  h.setNow(lightClock.deadline + 5_000);
  h.timer.tickPlanClock(lightClock.deadline + 5_000);
  h.timer.onHandoffReady();
  const darkClock = h.SG.state.planClock;
  assert.equal(darkClock.side, "dark");
  assert.equal(darkClock.deadline, h.now + 20_000, "the next side gets a full clock after handoff");

  h.timer.onValidate();
  assert.equal(h.SG.state.scene, "battle");
  assert.equal(h.SG.state.planClock, null);
  h.timer.tickPlanClock(darkClock.deadline + 1);
  assert.equal(h.timer.validateCalls, 2);
});

test("online matches started through the online entry path stay untimed", () => {
  const h = createHarness();
  h.timer.startOnlineMatch({ furies: false }, "light");
  assert.equal(h.SG.state.mode, "online");
  assert.equal(h.SG.state.planSeconds, 0, "online startup overrides the local timer setting");
  assert.equal(h.SG.state.planClock, null, "online plans have no authoritative server clock");
});

test("bot validation stops the human clock before invoking bot planning and battle", () => {
  const h = createHarness();
  let clockWhenBotStarted = "not-called";
  let plannedSide = null;
  h.SG.AI = {
    planTurn(side) {
      plannedSide = side;
      clockWhenBotStarted = h.SG.state.planClock;
      return { commands: [], wards: [], bid: 0 };
    },
  };
  h.timer.startMatch("bot", "light", false, { planSeconds: 20 });
  assert.equal(h.SG.state.planClock.side, "light", "the human starts with a planning clock");

  h.timer.onValidate();

  assert.equal(plannedSide, "dark");
  assert.equal(clockWhenBotStarted, null, "the human clock stops before the bot plans");
  assert.equal(h.SG.state.planClock, null, "no planning clock runs during battle");
  assert.equal(h.SG.state.scene, "battle");
  assert.equal(h.SG.state.planLocked.light, true);
  assert.equal(h.SG.state.planLocked.dark, true);
});

test("the timer live region sits outside the HUD inert subtree", () => {
  const liveIndex = indexSource.indexOf('id="turnTimerLive"');
  const hudIndex = indexSource.indexOf('id="hud"');
  assert.notEqual(liveIndex, -1, "the timer announcement region exists");
  assert.ok(liveIndex < hudIndex, "the live region is placed before and outside #hud");
  assert.match(indexSource.slice(liveIndex, indexSource.indexOf(">", liveIndex)),
    /aria-live="polite".*aria-atomic="true"/);
});

test("the calm timer class tracks the in-game reduced-motion setting", () => {
  const h = createHarness();
  startLocal(h, 20);
  const clock = h.SG.state.planClock;
  const timer = h.timer.getElement("turnTimer");
  h.timer.tickPlanClock(clock.deadline - 10_000);
  assert.equal(timer.classList.contains("warn"), true);
  assert.equal(timer.classList.contains("calm"), false);

  const reduceMotion = h.timer.getElement("optReduceMotion");
  reduceMotion.checked = true;
  reduceMotion.dispatch("change");
  assert.equal(timer.classList.contains("calm"), true);
  assert.match(styleSource, /\.turn-timer\.warn\.calm\s*\{\s*animation:\s*none;/,
    "the calm warning style disables its pulse animation");

  reduceMotion.checked = false;
  reduceMotion.dispatch("change");
  assert.equal(timer.classList.contains("calm"), false);
});

test("new matches and reverted rounds reject stale clock generations", () => {
  const h = createHarness();
  startLocal(h, 20);
  const oldGeneration = h.SG.state.planClock.gen;
  startLocal(h, 90);
  const newMatchClock = h.SG.state.planClock;
  assert.notEqual(newMatchClock.gen, oldGeneration);
  assert.equal(h.timer.expirePlanClock(oldGeneration), false);
  assert.equal(h.SG.state.planClock, newMatchClock);

  h.SG.state.history.push(h.timer.snapshotState());
  h.setNow(5_000);
  h.timer.revertRound();
  const revertedClock = h.SG.state.planClock;
  assert.notEqual(revertedClock.gen, newMatchClock.gen);
  assert.equal(revertedClock.deadline, 95_000, "replanning after revert starts a fresh full turn");
  assert.equal(h.timer.expirePlanClock(newMatchClock.gen), false);
  assert.equal(h.SG.state.planClock, revertedClock);
});

test("a deadline lapsing during Replay waits for Replay to finish, then submits once", () => {
  const h = createHarness();
  startLocal(h, 20);
  const clock = h.SG.state.planClock;
  const snapshot = h.timer.snapshotState();
  h.SG.state.lastBattle = {
    fromSnapshot: snapshot,
    plans: { light: [], dark: [] },
    firstSide: "light",
  };
  h.timer.replayLastRound();
  assert.equal(h.SG.state.scene, "battle");
  assert.equal(h.SG.state.isReplay, true);
  assert.equal(h.SG.state.planClock, clock);

  h.timer.tickPlanClock(clock.deadline);
  assert.equal(h.timer.validateCalls, 0, "the clock cannot interrupt an active visual Replay");
  h.timer.finishBattle(clock.deadline);
  assert.equal(h.SG.state.scene, "planning");
  assert.equal(h.SG.state.isReplay, false);
  h.timer.tickPlanClock(clock.deadline);
  assert.equal(h.timer.validateCalls, 1, "the overdue turn seals on the first planning frame after Replay");
  assert.equal(h.SG.state.scene, "handoff");
});

test("timer rendering and expiry tolerate omitted timer DOM nodes", () => {
  const h = createHarness({ omitTimerElements: true });
  assert.doesNotThrow(() => {
    startLocal(h, 20);
    h.timer.tickPlanClock(h.SG.state.planClock.deadline);
  });
  assert.equal(h.SG.state.scene, "handoff");
  assert.equal(h.timer.validateCalls, 1);
});
