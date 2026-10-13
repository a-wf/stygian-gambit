"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const gameSource = read("game.js");
const indexSource = read("index.html");
const anchor = '  Object.defineProperty(SG, "state", { get: () => state });';
const themeRegistry = {
  classic: { name: { en: "Classic" }, painters: {} },
  ash: { name: { en: "Ash" }, painters: {} },
  ember: { name: { en: "Ember" }, painters: {} },
};
const netSandbox = { window: { SG: { THEMES: themeRegistry } } };
vm.runInNewContext(read("net.js"), netSandbox, { filename: "net.js" });
const normalizeConfig = netSandbox.window.SG.Net.normalizeConfig;

class FakeElement {
  constructor(id = "", hidden = false) {
    this.id = id;
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.title = "";
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.children = [];
    this._textContent = "";
    this._innerHTML = "";
    this.width = this.height = 560;
    const classes = new Set(hidden ? ["hidden"] : []);
    this.classList = {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      contains: name => classes.has(name),
      toggle(name, force) {
        const enabled = force === undefined ? !classes.has(name) : !!force;
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      },
    };
    this.context = new Proxy({ canvas: this }, {
      get(target, key) {
        if (key in target) return target[key];
        if (/^create.*Gradient$/.test(key)) return () => ({ addColorStop() {} });
        return () => {};
      },
      set(target, key, value) { target[key] = value; return true; },
    });
  }

  set textContent(value) { this._textContent = String(value); this.children = []; }
  get textContent() {
    return this.children.length ? this.children.map(child => child.textContent).join("") : this._textContent;
  }
  set innerHTML(value) { this._innerHTML = String(value); this.children = []; }
  get innerHTML() { return this._innerHTML; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  fire(type = "click", event = {}) {
    assert.ok(this.listeners[type], `expected ${type} listener on ${this.id}`);
    this.listeners[type]({ target: this, preventDefault() {}, ...event });
  }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  getContext() { return this.context; }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; }
  querySelectorAll() { return []; }
  focus() {}
}

function mockNet(roomConfig = normalizeConfig({
  v: 2,
  movesPerRound: 5, planSeconds: 90, difficulty: "unfair", persona: "swarm",
  theme: "ash", furies: true, hazards: true, harrowerDrag: true,
  seed: 0x12345678, firstSide: "dark",
})) {
  return {
    CONFIG_VERSION: 2,
    roomConfig,
    createCalls: [],
    peekCalls: [],
    joinCalls: [],
    leaveCalls: 0,
    peekError: null,
    joinError: null,
    holdPeek: false,
    pendingPeek: null,
    holdJoin: false,
    pendingJoin: null,
    normalizeConfig,
    getCode() { return "ROOM"; },
    getSide() { return null; },
    createRoom(options, done) {
      this.createCalls.push(options);
      const config = normalizeConfig(Object.assign({}, options, { seed: roomConfig.seed, theme: roomConfig.theme }));
      this.roomConfig = Object.assign({}, config, roomConfig);
      done(null, { code: "ROOM", config: this.roomConfig });
    },
    peekRoom(code, done) {
      this.peekCalls.push(code);
      if (this.holdPeek) { this.pendingPeek = { code, done }; return; }
      if (this.peekError) done(this.peekError);
      else done(null, { code: String(code).trim().toUpperCase(), config: this.roomConfig });
    },
    finishPeek() {
      const pending = this.pendingPeek;
      this.pendingPeek = null;
      if (pending) pending.done(null, { code: String(pending.code).trim().toUpperCase(), config: this.roomConfig });
    },
    joinRoom(code, done) {
      this.joinCalls.push(code);
      if (this.holdJoin) { this.pendingJoin = { code, done }; return; }
      if (this.joinError) { done(this.joinError); return; }
      if (this.onStart) this.onStart(Object.assign({}, this.roomConfig, { mySide: "dark" }));
      done(null, { code, mySide: "dark" });
    },
    leave() { this.leaveCalls++; },
  };
}

function harness({ net = null, storedTheme = "ember" } = {}) {
  const elements = new Map();
  for (const match of indexSource.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    elements.set(match[1], new FakeElement(match[1], /\bhidden\b/.test(match[0])));
  }
  const storage = new Map();
  if (storedTheme) storage.set("stygian_theme", storedTheme);
  const window = { SG: { THEMES: themeRegistry }, addEventListener() {} };
  if (net) window.SG.Net = net;
  const sandbox = {
    window,
    console,
    Math,
    location: { search: "" },
    document: {
      getElementById(id) { return elements.get(id) || null; },
      createElement(tag) { return new FakeElement(tag); },
      createTextNode(text) { const node = new FakeElement("#text"); node.textContent = text; return node; },
      querySelectorAll() { return []; },
      addEventListener() {},
    },
    performance: { now: () => 1000 },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    requestAnimationFrame() {},
    setTimeout() { return 1; },
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
  assert.equal(gameSource.split(anchor).length, 2, "expected the game's state test seam");
  const testApi = `  SG.__onlineTest = {
    startOnlineMatch, startMatch, releaseRoomTheme, onlineOpponentLeft,
    readMenuRoomSettings, genTerrain,
  };
  Object.defineProperty(SG, "state", { get: () => state });`;
  vm.runInContext(gameSource.replace(anchor, testApi), sandbox, { filename: "game.js" });
  return {
    SG: window.SG,
    net,
    storage,
    el: id => elements.get(id),
  };
}

const canonicalConfig = normalizeConfig({
  v: 2,
  movesPerRound: 5,
  planSeconds: 90,
  difficulty: "unfair",
  persona: "swarm",
  theme: "ash",
  furies: true,
  hazards: true,
  harrowerDrag: true,
  seed: 0x12345678,
  firstSide: "dark",
});

function setMenu(h, {
  moves = "4", timer = "20", difficulty = "easy", persona = "butcher",
  theme = "classic", furies = false, hazards = false, drag = false,
} = {}) {
  h.el("movesPerRound").value = moves;
  h.el("planSeconds").value = timer;
  h.el("difficulty").value = difficulty;
  h.el("persona").value = persona;
  h.el("themeSelect").value = theme;
  h.el("themeSelect").fire("change");
  h.el("furyToggle").checked = furies;
  h.el("hazardToggle").checked = hazards;
  h.el("harrowerToggle").checked = drag;
}

function appliedRoomSettings(state) {
  return {
    movesPerRound: state.movesPerRound,
    planSeconds: state.planSeconds,
    difficulty: state.difficulty,
    persona: state.botPersona,
    furies: state.furiesEnabled,
    hazards: state.hazardsEnabled,
    harrowerDrag: state.harrowerDragEnabled,
    seed: state.terrainSeed,
    firstSide: state.firstSide,
  };
}

test("creator captures menu choices once and both host and guest apply the room's canonical settings", () => {
  const net = mockNet();
  const h = harness({ net });
  setMenu(h, {
    moves: "2", timer: "90", difficulty: "hard", persona: "warden",
    theme: "ash", furies: false, hazards: true, drag: false,
  });
  h.el("btnOnline").fire();
  h.el("btnCreateRoom").fire();

  assert.equal(net.createCalls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(net.createCalls[0])), {
    movesPerRound: 2,
    planSeconds: 90,
    difficulty: "hard",
    persona: "warden",
    theme: "ash",
    furies: false,
    hazards: true,
    harrowerDrag: false,
  });
  assert.equal(h.el("onlineRoomInfo").classList.contains("hidden"), false);
  assert.ok(h.el("onlineRoomSummary").textContent.length > 0, "the host sees the saved room settings");

  // The host changes their local menu after creating the room; the start event's read-back config wins.
  setMenu(h, {
    moves: "1", timer: "20", difficulty: "easy", persona: "butcher",
    theme: "classic", furies: false, hazards: false, drag: false,
  });
  net.onStart(Object.assign({}, canonicalConfig, { mySide: "light" }));
  assert.deepEqual(appliedRoomSettings(h.SG.state), {
    movesPerRound: 5,
    planSeconds: 0,
    difficulty: "unfair",
    persona: "swarm",
    furies: true,
    hazards: true,
    harrowerDrag: true,
    seed: 0x12345678,
    firstSide: "dark",
  });
  assert.equal(h.SG.state.humanSide, "light");
  assert.equal(h.SG.state.onlineConfig.planSeconds, 90, "the host timer selection is recorded but not run online");
});

test("guest preview is read-only until confirmation and Back/errors return to room setup", () => {
  const net = mockNet(canonicalConfig);
  const h = harness({ net });
  setMenu(h, { moves: "1", timer: "20", difficulty: "easy", persona: "balanced", theme: "classic" });
  h.el("btnOnline").fire();
  h.el("joinCode").value = " room ";
  h.el("btnJoinRoom").fire();

  assert.deepEqual(net.peekCalls, [" room "]);
  assert.deepEqual(net.joinCalls, [], "preview does not claim a seat before confirmation");
  assert.equal(h.SG.state.mode, "hotseat", "preview does not start or mutate the match");
  assert.equal(h.el("onlineJoinConfirm").classList.contains("hidden"), false);
  assert.equal(h.el("onlineRoomSummary").children.length, 16, "the preview lists all eight host settings as read-only rows");
  assert.deepEqual(h.el("onlineRoomSummary").children.map(node => node.id),
    Array.from({ length: 8 }, () => ["dt", "dd"]).flat(),
    "the preview renders text rows only, without editable form controls");
  assert.equal(h.el("onlineRoomSummary").children[1].textContent, "5", "the first read-only value is host's move cap");

  h.el("btnCancelJoin").fire();
  assert.equal(h.el("onlineSetup").classList.contains("hidden"), false, "Choose another room returns to setup");
  assert.equal(h.el("onlineJoinConfirm").classList.contains("hidden"), true);
  assert.deepEqual(net.joinCalls, []);

  net.peekError = "net.notFound";
  h.el("btnJoinRoom").fire();
  assert.equal(h.el("onlineRoomInfo").classList.contains("hidden"), true);
  assert.ok(h.el("onlineStatus").textContent.length > 0, "room lookup errors are surfaced in the status area");
  net.peekError = null;

  h.el("btnJoinRoom").fire();
  setMenu(h, { moves: "3", timer: "20", difficulty: "easy", persona: "balanced", theme: "classic" });
  net.joinError = "net.full";
  h.el("btnConfirmJoin").fire();
  assert.deepEqual(net.joinCalls, ["ROOM"]);
  assert.equal(h.SG.state.mode, "hotseat", "a failed seat claim must not start a match");
  assert.equal(h.el("onlineSetup").classList.contains("hidden"), false);
  assert.ok(h.el("onlineStatus").textContent.length > 0, "join errors return to setup and remain visible");

  h.el("btnOnlineClose").fire();
  assert.equal(net.leaveCalls, 1);
  assert.equal(h.el("onlineScreen").classList.contains("hidden"), true, "Back closes the online lobby");
});

test("a late room preview response cannot reopen the lobby after Back", () => {
  const net = mockNet();
  net.holdPeek = true;
  const h = harness({ net });
  h.el("btnOnline").fire();
  h.el("joinCode").value = "ROOM";
  h.el("btnJoinRoom").fire();
  assert.equal(net.pendingPeek !== null, true, "the room lookup remains unresolved");

  h.el("btnOnlineClose").fire();
  net.finishPeek();
  assert.equal(h.el("onlineScreen").classList.contains("hidden"), true);
  assert.equal(h.el("startScreen").classList.contains("hidden"), false);
  assert.equal(h.el("onlineRoomInfo").classList.contains("hidden"), true,
    "the abandoned callback cannot replace the start screen with stale preview data");
  assert.deepEqual(net.joinCalls, []);
});

test("guest Cancel leaves the room while start confirmation is pending", () => {
  const net = mockNet(canonicalConfig);
  net.holdJoin = true;
  const h = harness({ net });
  h.el("btnOnline").fire();
  h.el("joinCode").value = "ROOM";
  h.el("btnJoinRoom").fire();
  h.el("btnConfirmJoin").fire();

  assert.equal(net.pendingJoin.code, "ROOM");
  assert.equal(h.el("onlineJoinConfirm").classList.contains("hidden"), false,
    "the guest can still cancel during the pending join/start handshake");
  h.el("btnCancelJoin").fire();

  assert.equal(net.leaveCalls, 1, "Cancel releases the claimed room seat");
  assert.equal(h.el("onlineSetup").classList.contains("hidden"), false);
  assert.equal(h.el("onlineJoinConfirm").classList.contains("hidden"), true);
  assert.equal(h.SG.state.mode, "hotseat", "the waiting guest has not started a match");
});

test("guest confirms the previewed config, ignores local menu choices, and restores their saved theme", () => {
  const net = mockNet(canonicalConfig);
  const h = harness({ net, storedTheme: "ember" });
  setMenu(h, { moves: "1", timer: "20", difficulty: "easy", persona: "balanced", theme: "classic" });
  h.el("btnOnline").fire();
  h.el("joinCode").value = "ROOM";
  h.el("btnJoinRoom").fire();
  assert.deepEqual(net.joinCalls, []);

  // Even changing the guest's menu after preview cannot override the room's settings at start.
  setMenu(h, { moves: "3", timer: "20", difficulty: "normal", persona: "balanced", theme: "ember" });
  h.el("btnConfirmJoin").fire();
  assert.deepEqual(appliedRoomSettings(h.SG.state), {
    movesPerRound: 5,
    planSeconds: 0,
    difficulty: "unfair",
    persona: "swarm",
    furies: true,
    hazards: true,
    harrowerDrag: true,
    seed: 0x12345678,
    firstSide: "dark",
  });
  assert.equal(h.SG.state.humanSide, "dark");
  assert.equal(h.SG.state.theme, "ash");
  assert.equal(h.el("themeSelect").disabled, true);
  assert.equal(h.el("optThemeSelect").disabled, true);
  assert.equal(h.storage.get("stygian_theme"), "ember", "the room's skin does not overwrite the saved preference");

  net.onOpponentLeft();
  assert.equal(h.SG.state.theme, "ember", "the saved local theme returns when the room ends");
  assert.equal(h.el("themeSelect").disabled, false);
  assert.equal(h.el("optThemeSelect").disabled, false);
  assert.equal(h.storage.get("stygian_theme"), "ember");
});

test("the same room seed yields identical online hazard layouts for both peers", () => {
  const host = harness({ net: mockNet(canonicalConfig) });
  const guest = harness({ net: mockNet(canonicalConfig) });
  host.SG.__onlineTest.startOnlineMatch(canonicalConfig, "light");
  guest.SG.__onlineTest.startOnlineMatch(canonicalConfig, "dark");
  assert.deepEqual(
    JSON.parse(JSON.stringify(host.SG.state.terrain)),
    JSON.parse(JSON.stringify(guest.SG.state.terrain)),
  );
  const hazardCells = terrain => terrain.flat().filter(Boolean);
  assert.ok(host.SG.state.terrain, "hazards are actually generated");
  assert.deepEqual(
    JSON.parse(JSON.stringify(hazardCells(host.SG.state.terrain).sort())),
    ["chasm", "font", "lava", "lava"],
    "each layout contains the configured deterministic hazard set",
  );
  assert.equal(host.SG.state.terrainSeed, guest.SG.state.terrainSeed);

  host.SG.state.roundNumber = guest.SG.state.roundNumber = 3;
  host.SG.__onlineTest.genTerrain();
  guest.SG.__onlineTest.genTerrain();
  assert.deepEqual(
    JSON.parse(JSON.stringify(host.SG.state.terrain)),
    JSON.parse(JSON.stringify(guest.SG.state.terrain)),
    "the same shared seed also synchronizes the scheduled round-3 terrain refresh",
  );
});
