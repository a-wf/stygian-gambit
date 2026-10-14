"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const gameSource = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const themesSource = fs.readFileSync(path.join(__dirname, "..", "themes.js"), "utf8");
const bootBlock = `  state = freshState();
  buildBoardCache();
  seedAmbientParticles();
  buildLegendIcons();
  refreshLanguage();
  requestAnimationFrame(loop);
  Object.defineProperty(SG, "state", { get: () => state });`;

function createHarness({
  legendCount = 2, helpCount = 0, clockStep = 0, idleSupport = true,
  locationSearch = "", storedPerf = false, hidden = false, observerTypes = null,
  heapUsedJSHeapSize = null, locationHref = "https://game.example.invalid/app/index.html",
  urlConstructor = null, proxyCanvasContext = false,
} = {}) {
  const paintCounts = new Map();
  let now = 0;
  const makeTheme = (id, marker = id) => ({
    painters: Object.fromEntries(
      ["sovereign", "reaper", "juggernaut", "trickster", "wildrider", "skirmisher", "harrower", "fury"]
        .map(type => [type, context => {
          const key = `${marker}:${type}`;
          paintCounts.set(key, (paintCounts.get(key) || 0) + 1);
          context.canvas.paintTheme = marker;
        }])
    ),
  });
  const themes = {
    classic: makeTheme("classic"),
    ash: makeTheme("ash"),
    ember: makeTheme("ember"),
  };

  class FakeContext {
    constructor(canvas) {
      this.canvas = canvas;
      this.saveDepth = 0;
      if (proxyCanvasContext) {
        return new Proxy(this, {
          get(target, key, receiver) {
            return key in target ? Reflect.get(target, key, receiver) : () => {};
          },
        });
      }
    }
    save() { this.saveDepth++; }
    restore() { this.saveDepth--; }
    translate() {}
    rotate() {}
    scale() {}
    setTransform() {}
    clearRect() {}
    beginPath() {}
    closePath() {}
    moveTo() {}
    lineTo() {}
    arc() {}
    ellipse() {}
    fill() {}
    stroke() {}
    strokeRect() {}
    fillRect() {}
    fillText() {}
    setLineDash() {}
    drawImage(image) {
      this.canvas.drawnImages.push(image);
      this.canvas.lastImage = image;
    }
    createRadialGradient() { return { addColorStop() {} }; }
  }

  class FakeElement {
    constructor(id = "") {
      this.id = id;
      this.value = "";
      this.title = "";
      this.dataset = {};
      this.listeners = new Map();
      this.classList = { add() {}, remove() {}, contains() { return false; }, toggle() {} };
      this.isConnected = true;
    }
    addEventListener(type, handler) { this.listeners.set(type, handler); }
    dispatch(type, event = {}) {
      const handler = this.listeners.get(type);
      assert.ok(handler, `expected a ${type} listener on ${this.id}`);
      handler({ target: this, ...event });
    }
    getClientRects() { return this.isConnected ? [{}] : []; }
    getAttribute(name) { return this.attributes && this.attributes[name] || null; }
    querySelectorAll() { return []; }
    querySelector() { return null; }
  }

  class FakeCanvas extends FakeElement {
    constructor(id = "") {
      super(id);
      this.width = 0;
      this.height = 0;
      this.drawnImages = [];
      this.attributes = {};
      this.context = new FakeContext(this);
    }
    getContext() { return this.context; }
  }

  const startPicker = new FakeElement("themeSelect");
  const optionsPicker = new FakeElement("optThemeSelect");
  const legendIcons = Array.from({ length: legendCount }, (_, i) => {
    const icon = new FakeCanvas(`legend-${i}`);
    icon.width = icon.height = 52;
    icon.attributes["data-piece"] = i === 0 ? "sovereign" : "reaper";
    icon.attributes["data-side"] = "light";
    return icon;
  });
  const helpIcons = Array.from({ length: helpCount }, (_, i) => {
    const icon = new FakeCanvas(`help-${i}`);
    icon.width = icon.height = 52;
    icon.dataset.piece = i === 0 ? "juggernaut" : "fury";
    return icon;
  });
  const helpScreen = new FakeElement("helpScreen");
  helpScreen.querySelectorAll = selector => selector === "canvas.role-icon" ? helpIcons : [];
  const board = new FakeCanvas("board");
  const elements = new Map([
    ["board", board],
    ["themeSelect", startPicker],
    ["optThemeSelect", optionsPicker],
    ["helpScreen", helpScreen],
  ]);
  const createdCanvases = [];
  const documentListeners = new Map();
  const windowListeners = new Map();
  const document = {
    hidden,
    visibilityState: hidden ? "hidden" : "visible",
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new FakeElement(id));
      return elements.get(id);
    },
    createElement(tag) {
      const element = tag === "canvas" ? new FakeCanvas() : new FakeElement(tag);
      if (tag === "canvas") createdCanvases.push(element);
      return element;
    },
    querySelectorAll(selector) { return selector === ".legend-icon" ? legendIcons : []; },
    addEventListener(type, handler) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(handler);
    },
    dispatch(type, event = {}) {
      for (const handler of documentListeners.get(type) || []) handler({ type, ...event });
    },
  };
  const animationFrames = [];
  const timers = [];
  const idleCallbacks = [];
  const performanceObservers = [];
  const storage = new Map();
  if (storedPerf) storage.set("sg.perf", "1");
  let performanceCalls = 0;
  const performance = { now() { performanceCalls++; const value = now; now += clockStep; return value; } };
  if (heapUsedJSHeapSize !== null) performance.memory = { usedJSHeapSize: heapUsedJSHeapSize };
  class MockPerformanceObserver {
    static supportedEntryTypes = observerTypes || [];
    constructor(callback) { this.callback = callback; this.disconnected = false; performanceObservers.push(this); }
    observe(options) { this.options = options; }
    disconnect() { this.disconnected = true; }
    emit(entries) { this.callback({ getEntries: () => entries }); }
  }
  const sandboxWindow = {
    SG: { THEMES: themes },
    addEventListener(type, handler) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(handler);
    },
    dispatch(type, event = {}) {
      for (const handler of windowListeners.get(type) || []) handler({ type, ...event });
    },
  };
  const sandbox = {
    window: sandboxWindow,
    document,
    location: { search: locationSearch, href: locationHref },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    performance,
    requestAnimationFrame(callback) { animationFrames.push(callback); },
    setTimeout(callback, delay = 0) { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeout(timer) {
      const index = timers.indexOf(timer);
      if (index >= 0) timers.splice(index, 1);
    },
    console,
  };
  if (urlConstructor) sandbox.URL = urlConstructor;
  if (observerTypes !== null) sandbox.PerformanceObserver = MockPerformanceObserver;
  if (idleSupport) sandbox.requestIdleCallback = (callback, options) => { idleCallbacks.push({ callback, options }); };

  const instrumentation = `  state = freshState();
  Object.defineProperty(SG, "state", { get: () => state });
  SG.__test = {
    setTheme, paintIcon, paintFigure, drawPiece, drawForesight, loop, perfRecordFrame, perfSeg,
    themeWarm, requestThemeWarm, noteWarmFrame, warmSignals, glyphColor, sidePalette,
  };`;
  assert.equal(gameSource.split(bootBlock).length, 2, "expected the game boot block to remain recognizable");
  vm.runInNewContext(gameSource.replace(bootBlock, instrumentation), sandbox, { filename: "game.js" });

  function runTimer(index = 0) {
    const timer = timers.splice(index, 1)[0];
    assert.ok(timer, "expected a queued timer");
    timer.callback();
    return timer;
  }

  function flushOneIconSlice() {
    const frame = animationFrames.shift();
    assert.ok(frame, "expected a queued animation frame");
    frame();
    const timerIndex = timers.findIndex(timer => timer.delay === 0);
    const timer = timerIndex < 0 ? null : timers[timerIndex];
    assert.ok(timer, "expected the repaint task after its animation frame");
    runTimer(timerIndex);
  }

  function flushOneWarmSlice(deadline = { timeRemaining: () => 100 }) {
    if (idleCallbacks.length) {
      const idle = idleCallbacks.shift();
      assert.ok(idle, "expected a queued idle warm-up callback");
      idle.callback(deadline);
      return;
    }
    if (idleSupport) {
      const retryIndex = timers.findIndex(timer => timer.delay > 0);
      assert.ok(retryIndex >= 0, "expected a delayed warm-up retry");
      runTimer(retryIndex);
      const idle = idleCallbacks.shift();
      assert.ok(idle, "the delayed retry should request one idle callback");
      idle.callback(deadline);
      return;
    }
    const scheduleIndex = timers.findIndex(timer => timer.delay > 0);
    assert.ok(scheduleIndex >= 0, "expected a scheduled frame/task warm-up");
    runTimer(scheduleIndex);
    const frame = animationFrames.shift();
    assert.ok(frame, "expected a queued warm-up animation frame");
    frame();
    const timerIndex = timers.findIndex(timer => timer.delay === 0);
    const timer = timerIndex < 0 ? null : timers[timerIndex];
    assert.ok(timer, "expected the warm-up task after its animation frame");
    runTimer(timerIndex);
  }

  function seedHealthyFrames(intervals = Array(8).fill(16)) {
    let ts = now;
    sandbox.window.SG.__test.noteWarmFrame(ts);
    for (const interval of intervals) {
      ts += interval;
      sandbox.window.SG.__test.noteWarmFrame(ts);
    }
    now = ts;
  }

  return {
    board, startPicker, optionsPicker, legendIcons, helpIcons, themes, paintCounts, createdCanvases,
    animationFrames, timers, idleCallbacks, storage, performanceObservers,
    document, window: sandboxWindow, SG: sandbox.window.SG, makeTheme,
    flushOneIconSlice, flushOneWarmSlice, seedHealthyFrames,
    setHidden(value) {
      document.hidden = value;
      document.visibilityState = value ? "hidden" : "visible";
      document.dispatch("visibilitychange");
    },
    setNow(value) { now = value; },
    advanceClock(ms) { now += ms; },
    currentTime: () => now,
    performanceCalls: () => performanceCalls,
  };
}

function loadRegisteredThemes() {
  const sandbox = { window: {} };
  vm.runInNewContext(themesSource, sandbox, { filename: "themes.js" });
  return sandbox.window.SG;
}

function createNoopPainterContext() {
  const saves = [];
  const gradient = { addColorStop() {} };
  const target = {
    canvas: {},
    save() { saves.push(true); },
    restore() { saves.pop(); },
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; },
  };
  const context = new Proxy(target, {
    get(object, key) { return key in object ? object[key] : () => {}; },
    set(object, key, value) { object[key] = value; return true; },
  });
  return { context, saveDepth: () => saves.length };
}

test("both selectors update theme state immediately and coalesce deferred legend drawing", () => {
  const h = createHarness();

  h.startPicker.value = "ash";
  h.startPicker.dispatch("change");

  assert.equal(h.SG.state.theme, "ash");
  assert.equal(h.startPicker.value, "ash");
  assert.equal(h.optionsPicker.value, "ash");
  assert.equal(h.storage.get("stygian_theme"), "ash");
  assert.equal(h.animationFrames.length, 1);
  assert.equal(h.legendIcons.reduce((n, icon) => n + icon.drawnImages.length, 0), 0,
    "legend canvases must not draw synchronously in the change handler");

  h.optionsPicker.value = "ember";
  h.optionsPicker.dispatch("change");

  assert.equal(h.SG.state.theme, "ember");
  assert.equal(h.startPicker.value, "ember");
  assert.equal(h.optionsPicker.value, "ember");
  assert.equal(h.storage.get("stygian_theme"), "ember");
  assert.equal(h.animationFrames.length, 1, "rapid changes should share one pending repaint runner");
  assert.equal(h.legendIcons.reduce((n, icon) => n + icon.drawnImages.length, 0), 0);
});

test("repaint slices yield and discard stale jobs after a newer selection", () => {
  const h = createHarness({ legendCount: 3, helpCount: 1, clockStep: 8 });

  h.startPicker.value = "ash";
  h.startPicker.dispatch("change");
  h.optionsPicker.value = "ember";
  h.optionsPicker.dispatch("change");
  assert.equal(h.animationFrames.length, 1, "the queued repaint should be coalesced");

  h.flushOneIconSlice();
  const paintedAfterFirstSlice = h.legendIcons.concat(h.helpIcons)
    .filter(icon => icon.drawnImages.length > 0);
  assert.equal(paintedAfterFirstSlice.length, 1, "the six-millisecond budget should yield after one slow icon");
  assert.equal(paintedAfterFirstSlice[0].lastImage.paintTheme, "ember",
    "the runner should collect jobs for the latest theme, not the earlier selection");
  assert.equal(h.animationFrames.length, 1, "remaining icons should continue in a later frame");

  h.startPicker.value = "classic";
  h.startPicker.dispatch("change");
  const addedIcon = new (h.legendIcons[0].constructor)("added-while-pending");
  addedIcon.width = addedIcon.height = 52;
  addedIcon.attributes["data-piece"] = "skirmisher";
  addedIcon.attributes["data-side"] = "dark";
  h.legendIcons.push(addedIcon);

  let slices = 0;
  while (h.animationFrames.length && slices < 20) {
    h.flushOneIconSlice();
    slices++;
  }
  assert.ok(slices > 0 && slices < 20, "deferred repaint must complete without getting stuck");
  assert.equal(h.animationFrames.length, 0);
  assert.equal(h.SG.state.theme, "classic");
  for (const icon of h.legendIcons.concat(h.helpIcons)) {
    assert.equal(icon.lastImage && icon.lastImage.paintTheme, "classic",
      `${icon.id} should be repainted with the newest theme after generation changes`);
  }
});

test("icon cache reuses matching entries and separates theme-object and backing-size changes", () => {
  const h = createHarness();
  h.SG.__test.setTheme("ember", false);
  const icon = new h.legendIcons[0].constructor("cache-target");
  icon.width = icon.height = 52;

  h.SG.__test.paintIcon(icon, "sovereign", "light");
  const firstImage = icon.lastImage;
  h.SG.__test.paintIcon(icon, "sovereign", "light");
  assert.equal(h.paintCounts.get("ember:sovereign"), 1, "same key should paint only once");
  assert.equal(icon.lastImage, firstImage, "same key should draw the cached image");

  icon.width = icon.height = 60;
  h.SG.__test.paintIcon(icon, "sovereign", "light");
  assert.equal(h.paintCounts.get("ember:sovereign"), 2, "backing-size changes need distinct cache entries");
  assert.equal(icon.lastImage.width, 60);
  assert.equal(icon.lastImage.height, 60);

  h.SG.__test.setTheme("classic", false);
  h.SG.__test.paintIcon(icon, "sovereign", "light");
  assert.equal(icon.lastImage.paintTheme, "classic", "theme changes must not reuse another theme's art");

  const replacement = h.makeTheme("classic", "classic-replaced");
  h.themes.classic = replacement;
  h.SG.__test.paintIcon(icon, "sovereign", "light");
  assert.equal(icon.lastImage.paintTheme, "classic-replaced",
    "replacing a theme definition under the same id must invalidate the old cache entry");
});

test("production Yokai and Horus painter registrations are present", () => {
  const themes = loadRegisteredThemes().THEMES;
  const yokai = themes.hyakki;

  assert.equal(typeof yokai.painters.sovereign, "function", "light/shared Nurarihyon painter remains available");
  assert.equal(typeof yokai.painters.reaper, "function", "light/shared nine-tailed fox painter remains available");
  assert.equal(typeof yokai.sidePainters.dark.sovereign, "function", "dark Shuten-Doji painter is registered");
  assert.equal(typeof yokai.sidePainters.dark.reaper, "function", "dark Slaughter Oni painter is registered");
  assert.equal(Object.keys(yokai.sidePainters).join(","), "dark",
    "only the dark side should override Yokai sovereign and reaper");

  assert.equal(typeof themes.pharaonic.painters.wildrider, "function",
    "Horus remains the Pharaonic wildrider painter");
  assert.equal(themes.pharaonic.sidePainters, undefined,
    "the side-specific roster change must not add side overrides to Pharaonic art");
});

test("game script cache query is version 30", () => {
  assert.match(indexSource, /<script\b[^>]*src=["']game\.js\?v=30["']/,
    "the game script cache key should be bumped after the implementation change");
});

test("real Yokai side painters and Horus wildrider paint without throwing or leaking saves", () => {
  const sg = loadRegisteredThemes();
  const pal = { deep: "#5a0f1c", mid: "#a52334", bright: "#e8434f", rim: "#ff9a7a", gold: "#e8c657" };
  const painters = [
    ["light/shared sovereign", sg.THEMES.hyakki.painters.sovereign],
    ["light/shared reaper", sg.THEMES.hyakki.painters.reaper],
    ["dark sovereign", sg.THEMES.hyakki.sidePainters.dark.sovereign],
    ["dark reaper", sg.THEMES.hyakki.sidePainters.dark.reaper],
    ["Horus wildrider", sg.THEMES.pharaonic.painters.wildrider],
  ];

  for (const [name, painter] of painters) {
    for (const r of [18, 50, 96]) {
      const { context, saveDepth } = createNoopPainterContext();
      const helpers = sg.createFigureHelpers(context, pal, r, 0);
      assert.doesNotThrow(() => painter(context, pal, r, 0, helpers), `${name} should paint at radius ${r}`);
      assert.equal(saveDepth(), 0, `${name} should balance canvas saves at radius ${r}`);
    }
  }
});

test("side-specific painters take precedence while missing side overrides use shared theme art", () => {
  const h = createHarness();
  const theme = h.themes.ember;
  const darkSovereign = context => {
    h.paintCounts.set("ember-dark:sovereign", (h.paintCounts.get("ember-dark:sovereign") || 0) + 1);
    context.canvas.paintTheme = "ember-dark";
  };
  theme.sidePainters = { dark: { sovereign: darkSovereign } };
  h.SG.__test.setTheme("ember", false);

  const canvas = new h.legendIcons[0].constructor("side-painter-selection");
  h.SG.__test.paintFigure("sovereign", {}, 16, 0, canvas.context, "dark");
  assert.equal(canvas.paintTheme, "ember-dark", "matching side override should win over the shared painter");

  h.SG.__test.paintFigure("sovereign", {}, 16, 0, canvas.context, "light");
  assert.equal(canvas.paintTheme, "ember", "the other side should continue to use the shared theme painter");
  h.SG.__test.paintFigure("juggernaut", {}, 16, 0, canvas.context, "dark");
  assert.equal(canvas.paintTheme, "ember", "a missing override for a role should use shared theme art");

  assert.equal(h.paintCounts.get("ember-dark:sovereign"), 1);
  assert.equal(h.paintCounts.get("ember:sovereign"), 1);
  assert.equal(h.paintCounts.get("ember:juggernaut"), 1);
  assert.equal(canvas.context.saveDepth, 0, "successful painter calls should restore canvas state");
});

test("piece and foresight drawing choose art by owner rather than view direction", () => {
  const h = createHarness();
  h.themes.ember.sidePainters = {
    dark: {
      sovereign(context) { context.canvas.paintTheme = "dark-sovereign"; },
    },
  };
  h.SG.__test.setTheme("ember", false);

  const makePiece = (id, side, row = 0, col = 0) => ({
    id, type: "sovereign", side,
    row, col, x: 24 + col * 70, y: 24 + row * 70, alive: true, animState: "idle",
    bobSeed: 0, hitFlashUntil: 0, lives: 3, maxLives: 3, facing: side === "light" ? 1 : -1,
    warded: false,
  });

  const lightPiece = makePiece("light-king", "light");
  h.SG.state.viewFlip = true;
  h.SG.__test.drawPiece(lightPiece, 0);
  assert.equal(h.board.paintTheme, "ember",
    "a light-owned piece should use the shared painter even when the view is flipped");

  const darkPiece = makePiece("dark-king", "dark");
  h.board.paintTheme = null;
  h.SG.state.viewFlip = false;
  h.SG.__test.drawPiece(darkPiece, 0);
  assert.equal(h.board.paintTheme, "dark-sovereign",
    "a dark-owned piece should use the dark painter even when the view is not flipped");

  h.board.paintTheme = null;
  h.SG.state.viewFlip = true;
  h.SG.state.planningSide = "light";
  h.SG.state.pieces = [lightPiece];
  h.SG.state.plan.light = [{
    pieceId: lightPiece.id, kind: "move", row: lightPiece.row, col: lightPiece.col + 1,
  }];
  h.SG.__test.drawForesight(0);
  assert.equal(h.board.paintTheme, "ember",
    "a light-owned foresight piece in plan.light should use the shared painter in a flipped view");
  assert.equal(h.board.context.saveDepth, 0, "piece and foresight draws should restore canvas state");
});

test("icon cache keeps side in its key and reuses only the same side's painter result", () => {
  const h = createHarness();
  h.themes.ember.sidePainters = {
    dark: {
      sovereign(context) {
        const key = "ember-dark:sovereign";
        h.paintCounts.set(key, (h.paintCounts.get(key) || 0) + 1);
        context.canvas.paintTheme = "ember-dark";
      },
    },
  };
  h.SG.__test.setTheme("ember", false);

  const icon = new h.legendIcons[0].constructor("dark-icon-cache");
  icon.width = icon.height = 52;
  h.SG.__test.paintIcon(icon, "sovereign", "dark");
  const darkImage = icon.lastImage;
  h.SG.__test.paintIcon(icon, "sovereign", "dark");
  assert.equal(icon.lastImage, darkImage, "same-side entries should be cached");
  assert.equal(h.paintCounts.get("ember-dark:sovereign"), 1);

  h.SG.__test.paintIcon(icon, "sovereign", "light");
  const lightImage = icon.lastImage;
  assert.notEqual(lightImage, darkImage, "opposite sides must not share a side-specific icon image");
  assert.equal(lightImage.paintTheme, "ember");
  h.SG.__test.paintIcon(icon, "sovereign", "dark");
  assert.equal(icon.lastImage, darkImage, "returning to dark should recover its cached image");
  assert.equal(h.paintCounts.get("ember:sovereign"), 1);
});

test("a broken side painter falls back to classic without leaking canvas saves", () => {
  const h = createHarness();
  const calls = [];
  h.themes.ember.sidePainters = {
    dark: {
      sovereign(context) {
        calls.push("side");
        context.save();
        throw new Error("deliberate test painter failure");
      },
    },
  };
  h.SG.__test.setTheme("ember", false);

  const canvas = new h.legendIcons[0].constructor("broken-side-painter");
  h.SG.__test.paintFigure("sovereign", {}, 16, 0, canvas.context, "dark");

  assert.deepEqual(calls, ["side"]);
  assert.equal(canvas.paintTheme, "classic",
    "when a side override throws, the classic painter should be the fallback candidate");
  assert.equal(canvas.context.saveDepth, 0, "a throwing painter must not leak nested save state");
});

test("painter save/restore guards persist across calls and protect nested painter baselines", () => {
  const h = createHarness();
  h.SG.__test.setTheme("ember", false);
  h.themes.ember.painters.reaper = context => { context.canvas.nestedPainted = true; };
  h.themes.ember.painters.sovereign = context => {
    context.save();
    h.SG.__test.paintFigure("reaper", {}, 12, 0, context);
    context.restore();
    context.restore(); // An unmatched restore must not pop a caller's saved state.
    context.canvas.outerPainted = true;
  };

  const canvas = new h.legendIcons[0].constructor("guarded-painter");
  const context = canvas.context;
  h.SG.__test.paintFigure("sovereign", {}, 16, 0, context);
  const guardedSave = context.save;
  const guardedRestore = context.restore;

  assert.equal(canvas.nestedPainted, true, "the nested painter should still run");
  assert.equal(canvas.outerPainted, true);
  assert.equal(context.saveDepth, 0, "nested calls and an extra restore must leave the stack balanced");

  h.SG.__test.paintFigure("sovereign", {}, 16, 0, context);
  assert.equal(context.save, guardedSave, "the tracking wrapper should not be replaced for each painter call");
  assert.equal(context.restore, guardedRestore, "the tracking wrapper should remain installed across calls");
  assert.equal(context.saveDepth, 0, "repeated calls should not accumulate canvas state");
});

test("shared body gradient creation is lazy and cached within one helper set", () => {
  const sg = loadRegisteredThemes();
  let linearGradientCount = 0;
  const gradient = { addColorStop() {} };
  const context = new Proxy({
    createLinearGradient() { linearGradientCount++; return gradient; },
  }, {
    get(object, key) {
      if (key in object) return object[key];
      return () => {};
    },
    set(object, key, value) { object[key] = value; return true; },
  });
  const palette = { deep: "#1f5a2c", mid: "#2f9a48", bright: "#5be07a", rim: "#c6ffd4", gold: "#d8f0a0" };
  const helpers = sg.createFigureHelpers(context, palette, 20, 0);

  helpers.eyes(0, 0, 2, 1, "#ffffff");
  assert.equal(linearGradientCount, 0, "constructing helpers and using eyes should not allocate the body gradient");
  helpers.robe(5, 10, -2, 20);
  assert.equal(linearGradientCount, 1, "the first default robe should create the shared body gradient");
  helpers.robe(5, 10, -2, 20);
  assert.equal(linearGradientCount, 1, "later default robes should reuse that gradient");
  helpers.robe(5, 10, -2, 20, "explicit fill");
  assert.equal(linearGradientCount, 1, "an explicit robe fill should not force gradient allocation");
});

test("theme warm-up pauses for selection repaint and refreshes stale theme and size jobs", () => {
  const h = createHarness({ idleSupport: true });
  h.seedHealthyFrames();
  h.startPicker.dispatch("pointerenter");
  h.startPicker.dispatch("focus");
  assert.equal(h.idleCallbacks.length, 1, "repeated intent signals should coalesce into one idle callback");
  assert.equal(h.createdCanvases.length, 0, "warm-up should not render synchronously on picker interaction");
  assert.equal(h.idleCallbacks[0].options.timeout, 1000);

  h.startPicker.value = "ash";
  h.startPicker.dispatch("change");
  assert.equal(h.animationFrames.length, 1, "the actual switch should schedule its own repaint");
  h.flushOneWarmSlice({ timeRemaining: () => 100 });
  assert.equal(h.createdCanvases.length, 0,
    "warm-up must yield without painting while the actual switch repaint is pending");
  assert.equal(h.SG.__test.themeWarm.misses, 0,
    "waiting for a real repaint should not consume the miss budget");
  assert.equal(h.timers.filter(timer => timer.delay === 300).length, 1,
    "the pending repaint should defer warm-up by one bounded retry interval");

  h.legendIcons.forEach(icon => { icon.width = 60; icon.height = 64; });
  h.flushOneIconSlice();
  assert.equal(h.legendIcons[0].lastImage.paintTheme, "ash");
  assert.equal(h.legendIcons[0].lastImage.width, 60);
  assert.equal(h.legendIcons[0].lastImage.height, 64);

  h.seedHealthyFrames();
  let reads = 0;
  const beforeWarm = h.createdCanvases.length;
  h.flushOneWarmSlice({ timeRemaining: () => reads++ === 0 ? 100 : 0 });
  assert.equal(h.createdCanvases.length - beforeWarm, 1, "an idle slice should stop when the next icon has no budget");
  assert.equal(h.SG.__test.themeWarm.queue.length, 3);
  assert.deepEqual([...h.SG.__test.themeWarm.queue.map(job => job.themeId)], ["ember", "classic", "classic"],
    "the refreshed queue should use picker order after the active theme changes");
  assert.ok(h.SG.__test.themeWarm.queue.every(job => job.w === 60 && job.h === 64),
    "the refreshed queue should use current legend backing-store dimensions");
  assert.equal(h.createdCanvases.at(-1).width, 60);
  assert.equal(h.createdCanvases.at(-1).height, 64);
});

test("theme warm-up allows only one pending callback and parks after bounded misses", () => {
  const h = createHarness({ idleSupport: true });
  h.seedHealthyFrames();
  h.startPicker.dispatch("pointerenter");
  h.startPicker.dispatch("focus");
  h.startPicker.dispatch("pointerdown");
  h.SG.__test.requestThemeWarm();
  assert.equal(h.idleCallbacks.length, 1, "picker signals and duplicate requests should share one callback");
  assert.equal(h.SG.__test.themeWarm.queue.length, 4);

  for (let miss = 1; miss <= 8; miss++) {
    if (miss > 1) {
      assert.equal(h.timers.length, 1, "a miss should leave exactly one delayed retry");
      assert.equal(h.timers[0].delay, 300, "miss retries should use the fixed back-off");
    }
    h.flushOneWarmSlice({ timeRemaining: () => 0 });
    assert.equal(h.createdCanvases.length, 0);
    if (miss < 8) {
      assert.equal(h.SG.__test.themeWarm.misses, miss);
      assert.equal(h.SG.__test.themeWarm.scheduled, true);
      assert.equal(h.SG.__test.themeWarm.parked, false);
      assert.equal(h.idleCallbacks.length + h.timers.length + h.animationFrames.length, 1,
        "the chain should retain only one outstanding callback/timer");
    }
  }

  assert.equal(h.SG.__test.themeWarm.scheduled, false);
  assert.equal(h.SG.__test.themeWarm.parked, true, "eight consecutive misses should park speculative work");
  assert.equal(h.SG.__test.themeWarm.misses, 0, "parking should clear the consecutive-miss counter");
  assert.equal(h.SG.__test.themeWarm.queue.length, 4, "parked work should retain its plan for a later intent");
  assert.equal(h.idleCallbacks.length + h.timers.length + h.animationFrames.length, 0,
    "a parked chain must not leave callbacks scheduled");

  h.startPicker.dispatch("focus");
  assert.equal(h.SG.__test.themeWarm.parked, false, "fresh picker intent should resume parked work");
  assert.equal(h.SG.__test.themeWarm.scheduled, true);
  assert.equal(h.idleCallbacks.length, 1, "resuming should create one new callback");
});

test("hidden documents park warm-up and visibility resumes it only once", () => {
  const h = createHarness({ idleSupport: true, hidden: true });
  h.startPicker.dispatch("focus");
  assert.equal(h.idleCallbacks.length, 1);
  h.flushOneWarmSlice();
  assert.equal(h.SG.__test.themeWarm.parked, true);
  assert.equal(h.SG.__test.themeWarm.scheduled, false);
  assert.equal(h.idleCallbacks.length + h.timers.length, 0);
  assert.equal(h.createdCanvases.length, 0);

  h.setHidden(false);
  assert.equal(h.SG.__test.themeWarm.parked, false);
  assert.equal(h.SG.__test.themeWarm.scheduled, true);
  assert.equal(h.idleCallbacks.length, 1, "visibility should resume the retained plan");
  h.setHidden(false);
  assert.equal(h.idleCallbacks.length, 1, "duplicate visibility events must not duplicate callbacks");
  h.seedHealthyFrames();
  h.flushOneWarmSlice({ timeRemaining: () => 100 });
  assert.equal(h.SG.__test.themeWarm.scheduled, false, "healthy idle time should drain the small test plan");
});

test("recent input and overloaded recent frames both defer warm-up", () => {
  const input = createHarness({ idleSupport: true });
  input.seedHealthyFrames();
  input.startPicker.dispatch("focus");
  input.window.dispatch("keydown");
  input.flushOneWarmSlice({ timeRemaining: () => 100 });
  assert.equal(input.createdCanvases.length, 0, "recent keyboard activity should block speculative painting");
  assert.equal(input.SG.__test.themeWarm.misses, 1);

  const overloaded = createHarness({ idleSupport: true });
  overloaded.seedHealthyFrames([16, 16, 16, 16, 16, 16, 16, 30]);
  overloaded.startPicker.dispatch("focus");
  overloaded.flushOneWarmSlice({ timeRemaining: () => 100 });
  assert.equal(overloaded.createdCanvases.length, 0, "one recent over-budget interval should block warm-up");
  assert.equal(overloaded.SG.__test.themeWarm.misses, 1);
});

test("cold idle budget scales to 120Hz and 60Hz frame intervals", () => {
  for (const [label, interval, fraction] of [
    ["120Hz", 1000 / 120, 0.4],
    ["60Hz", 1000 / 60, 0.4],
  ]) {
    const h = createHarness({ idleSupport: true });
    h.seedHealthyFrames(Array(8).fill(interval));
    h.startPicker.dispatch("focus");

    const need = interval * fraction;
    h.flushOneWarmSlice({ timeRemaining: () => need - 0.01 });
    assert.equal(h.createdCanvases.length, 0,
      `${label}: an unmeasured icon should not start just below 40% of the median interval`);
    assert.equal(h.SG.__test.themeWarm.misses, 1);

    let reads = 0;
    h.flushOneWarmSlice({ timeRemaining: () => [need + 0.01, 0][Math.min(reads++, 1)] });
    assert.equal(h.createdCanvases.length, 1,
      `${label}: an unmeasured icon should start just above 40% of the median interval`);
  }
});

test("idle warm-up selects a later theme when the first theme estimate does not fit", () => {
  const h = createHarness({ idleSupport: true });
  h.seedHealthyFrames();
  h.themes.ash.painters.sovereign = context => {
    context.canvas.paintTheme = "ash";
    h.advanceClock(6);
  };
  h.startPicker.dispatch("focus");

  const budgets = [100, 8.9, 0];
  h.flushOneWarmSlice({ timeRemaining: () => budgets.shift() ?? 0 });
  assert.equal(h.SG.__test.themeWarm.costs.get("ash"), 6,
    "the first uncached icon should establish an estimate for its own theme");
  assert.deepEqual(h.createdCanvases.map(canvas => canvas.paintTheme), ["ash", "ember"],
    "when ash needs 9ms of room but ember's cold allowance fits, ember should be selected instead");
  assert.deepEqual([...h.SG.__test.themeWarm.queue.map(job => job.themeId)], ["ash", "ember"],
    "only the unpainted jobs should remain queued");
});

test("a timed-out idle callback does no work even if a mock deadline reports spare time", () => {
  const h = createHarness({ idleSupport: true });
  h.seedHealthyFrames();
  h.startPicker.dispatch("focus");
  h.flushOneWarmSlice({ didTimeout: true, timeRemaining: () => 100 });
  assert.equal(h.createdCanvases.length, 0, "timed-out idle callbacks should only re-check gates, not paint");
  assert.equal(h.SG.__test.themeWarm.misses, 1);
  assert.equal(h.idleCallbacks.length, 0);
  assert.equal(h.timers.length, 1, "a timed-out callback should use the bounded retry delay");

  h.flushOneWarmSlice({ timeRemaining: () => 0 });
  assert.equal(h.createdCanvases.length, 0, "zero-budget callbacks must also leave the queue untouched");
  assert.equal(h.SG.__test.themeWarm.misses, 2);
  assert.equal(h.idleCallbacks.length, 0);
  assert.equal(h.timers.length, 1);
});

test("without requestIdleCallback warm-up yields one icon per frame/task and gates slow icons", () => {
  const h = createHarness({ idleSupport: false });
  h.seedHealthyFrames();
  for (const type of Object.keys(h.themes.ash.painters)) {
    h.themes.ash.painters[type] = context => { context.canvas.paintTheme = "ash"; h.advanceClock(10); };
  }
  h.startPicker.dispatch("focus");
  assert.equal(h.idleCallbacks.length, 0);
  assert.equal(h.animationFrames.length, 0, "the fallback starts after its polling delay");
  h.flushOneWarmSlice();
  assert.equal(h.createdCanvases.length, 1, "the no-idle path should paint at most one icon in a task");
  assert.equal(h.SG.__test.themeWarm.costs.get("ash"), 10);
  assert.equal(h.animationFrames.length, 0);
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].delay, 150);

  h.flushOneWarmSlice();
  assert.equal(h.createdCanvases.length, 2,
    "the no-idle path should skip ash's remaining icon and continue with ember");
  assert.equal(h.createdCanvases[1].paintTheme, "ember");
  assert.equal(h.paintCounts.get("ash:reaper") || 0, 0);
  assert.equal(h.paintCounts.get("ember:sovereign"), 1);
  assert.equal(h.SG.__test.themeWarm.misses, 0);
  assert.equal(h.timers.length, 1);
  assert.equal(h.timers[0].delay, 150);
});

test("an over-eight-millisecond theme is skipped without blocking other themes", () => {
  for (const idleSupport of [true, false]) {
    const h = createHarness({ idleSupport });
    h.seedHealthyFrames();
    h.themes.ash.painters.sovereign = context => {
      context.canvas.paintTheme = "ash";
      h.advanceClock(9);
    };
    h.startPicker.dispatch("focus");

    if (idleSupport) {
      h.flushOneWarmSlice({ timeRemaining: () => 100 });
    } else {
      h.flushOneWarmSlice();
      h.flushOneWarmSlice();
      h.flushOneWarmSlice();
    }

    assert.equal(h.SG.__test.themeWarm.costs.get("ash"), 9,
      `${idleSupport ? "idle" : "no-idle"} path should measure the expensive ash icon`);
    assert.equal(h.paintCounts.get("ash:reaper") || 0, 0,
      `${idleSupport ? "idle" : "no-idle"} path should skip only ash's remaining icon`);
    assert.equal(h.paintCounts.get("ember:sovereign"), 1,
      `${idleSupport ? "idle" : "no-idle"} path should continue with ember`);
    assert.equal(h.paintCounts.get("ember:reaper"), 1,
      `${idleSupport ? "idle" : "no-idle"} path should finish the other theme's jobs`);
  }
});

test("warm costs are measured per theme, ignore cache hits, decay, and learn cheaper samples", () => {
  const h = createHarness({ idleSupport: true });
  h.SG.__test.setTheme("ash", false);
  h.flushOneIconSlice();
  h.SG.__test.setTheme("classic", false);
  h.flushOneIconSlice();
  h.legendIcons[1].width = 53; // Keep the first ash icon cached, but make the second a cold paint.
  h.themes.ash.painters.reaper = context => {
    context.canvas.paintTheme = "ash";
    h.advanceClock(4);
  };
  h.seedHealthyFrames();

  h.startPicker.dispatch("focus");
  h.flushOneWarmSlice({ timeRemaining: () => 100 });
  assert.equal(h.paintCounts.get("ash:sovereign"), 1,
    "the matching pre-existing cache entry should be reused rather than repainted");
  assert.equal(h.SG.__test.themeWarm.costs.get("ash"), 4,
    "the uncached reaper should measure ash's per-theme cost");

  h.startPicker.dispatch("focus");
  h.flushOneWarmSlice({ timeRemaining: () => 100 });
  assert.equal(h.SG.__test.themeWarm.costs.get("ash"), 4,
    "cache hits on a quick new chain should neither change the estimate nor decay it early");

  h.advanceClock(5001);
  h.legendIcons[0].width = 53; // A new key forces an observable, cheaper painter sample.
  h.themes.ash.painters.sovereign = context => {
    context.canvas.paintTheme = "ash";
    h.advanceClock(1);
  };
  h.seedHealthyFrames();
  h.startPicker.dispatch("focus");
  h.flushOneWarmSlice({ timeRemaining: () => 100 });
  assert.equal(h.SG.__test.themeWarm.costs.get("ash"), 1.5,
    "after the five-second decay (4 -> 2), a 1ms sample should halve the estimate toward 1ms");
});

test("idle warm-up observes cache headroom and preserves active-theme icons", () => {
  const h = createHarness({ legendCount: 48, idleSupport: true });
  h.legendIcons.forEach((icon, index) => { icon.width = icon.height = 52 + index; });
  h.legendIcons.forEach(icon => {
    h.SG.__test.paintIcon(icon, icon.getAttribute("data-piece"), "light");
  });
  const activeImages = h.legendIcons.map(icon => icon.lastImage);
  assert.equal(h.createdCanvases.length, 48);

  h.seedHealthyFrames();
  h.startPicker.dispatch("pointerenter");
  h.flushOneWarmSlice({ timeRemaining: () => 100 });
  assert.equal(h.createdCanvases.length, 96,
    "with 48 distinct icons per theme, only one inactive theme should fit within cache headroom");
  assert.equal(h.paintCounts.get("ash:sovereign") + h.paintCounts.get("ash:reaper"), 48,
    "the next theme in picker order should be warmed first");
  assert.equal(h.paintCounts.has("ember:sovereign"), false, "lower-priority themes should stay unwarmed");
  assert.ok(h.createdCanvases.length < 128, "warming must leave cache capacity for active-theme icons");

  const activePaintCounts = ["classic:sovereign", "classic:reaper"].map(key => h.paintCounts.get(key));
  h.legendIcons.forEach(icon => {
    h.SG.__test.paintIcon(icon, icon.getAttribute("data-piece"), "light");
  });
  assert.deepEqual(h.legendIcons.map(icon => icon.lastImage), activeImages);
  assert.deepEqual(["classic:sovereign", "classic:reaper"].map(key => h.paintCounts.get(key)), activePaintCounts);
});

test("shared glyph colors and side palettes are frozen and reused", () => {
  const h = createHarness();
  for (const side of ["light", "dark", "neutral"]) {
    const colors = h.SG.__test.glyphColor(side);
    const palette = h.SG.__test.sidePalette(side);
    assert.strictEqual(h.SG.__test.glyphColor(side), colors);
    assert.strictEqual(h.SG.__test.sidePalette(side), palette);
    assert.equal(Object.isFrozen(colors), true);
    assert.equal(Object.isFrozen(palette), true);
    const fill = colors.fill;
    const deep = palette.deep;
    assert.equal(Reflect.set(colors, "fill", "#000000"), false);
    assert.equal(Reflect.set(palette, "deep", "#000000"), false);
    assert.equal(colors.fill, fill, "attempted mutation must not affect a later glyph lookup");
    assert.equal(palette.deep, deep, "attempted mutation must not affect a later painter lookup");
  }
});

test("performance diagnostics stay untimed by default and report frame percentiles", () => {
  const h = createHarness({ clockStep: 1 });
  const initialCalls = h.performanceCalls();

  h.startPicker.value = "ash";
  h.startPicker.dispatch("change");
  assert.equal(h.performanceCalls(), initialCalls,
    "theme selection should not call the diagnostics timer while diagnostics are off");
  assert.equal(h.SG.perf.report().themes.length, 0);

  h.SG.perf.enable();
  const seg = h.SG.__test.perfSeg;
  Object.assign(seg, { update: 2, render: 10, terrain: 4, pieces: 3, figures: 2, fx: 1, screen: 2 });
  h.SG.__test.perfRecordFrame(100, "classic");
  Object.assign(seg, { update: 4, render: 20, terrain: 8, pieces: 5, figures: 4, fx: 3, screen: 4 });
  h.SG.__test.perfRecordFrame(116, "classic");
  Object.assign(seg, { update: 0, render: 0, terrain: 0, pieces: 0, figures: 0, fx: 0, screen: 0 });
  h.SG.__test.perfRecordFrame(150, "classic");
  h.SG.__test.perfRecordFrame(1200, "classic"); // pauses of a second or more are ignored

  const report = h.SG.perf.report();
  assert.equal(report.themes.length, 1);
  assert.deepEqual({ ...report.themes[0] }, {
    theme: "classic", frames: 4,
    avgIntervalMs: 25, p50IntervalMs: 34, p95IntervalMs: 34, maxIntervalMs: 34, longFrames: 1,
    avgUpdateMs: 1.5, avgRenderMs: 7.5, p50RenderMs: 10, p95RenderMs: 20, maxRenderMs: 20,
    avgTerrainMs: 3, avgPiecesMs: 2, p50PiecesMs: 3, p95PiecesMs: 5, maxPiecesMs: 5,
    avgFiguresPerFrame: 1.5, avgFxMs: 1, avgScreenMs: 1.5,
    longAnimationFrames: null, maxLongAnimationFrameMs: null, totalBlockingMs: null,
  });
  assert.equal(report.iconRepaintMs, 0);
  assert.equal(report.networkRequests, null);
  assert.equal(report.heapUsedMB, null);
  assert.deepEqual({ ...report.supported }, { eventTiming: false, longAnimationFrame: false, resourceTiming: false });
  h.SG.perf.disable();
});

test("performance diagnostics attribute observer entries by time and redact resource URLs", () => {
  const h = createHarness({
    observerTypes: ["event", "long-animation-frame", "resource"],
    heapUsedJSHeapSize: 1048576,
  });
  h.setNow(1000);
  h.SG.perf.enable();
  h.SG.__test.perfRecordFrame(1000, "classic");

  h.setNow(1010);
  h.startPicker.value = "ash";
  h.startPicker.dispatch("change", { timeStamp: 1006 });
  const [eventObserver, loafObserver, resourceObserver] = h.performanceObservers;
  // Entries are delivered after the switch, but their start/render timestamps straddle it.
  eventObserver.emit([
    {
      name: "click", startTime: 1006, processingStart: 1008, processingEnd: 1012, duration: 24,
      target: { id: "themeSelect" },
    },
    {
      name: "keydown", startTime: 1012, processingStart: 1013, processingEnd: 1015, duration: 30,
      target: { tagName: "INPUT" },
    },
  ]);
  loafObserver.emit([
    { startTime: 1000, renderStart: 1008, duration: 42, blockingDuration: 10 },
    { startTime: 1011, renderStart: 1012, duration: 30, blockingDuration: 5 },
  ]);
  // Resource entries arrive on completion. One started before diagnostics, one after diagnostics but
  // before the switch, and three during the switch window.
  resourceObserver.emit([
    { name: "https://example.invalid/ignored.png?token=before#secret", startTime: 999 },
    { name: "https://example.invalid/pre-switch.png?token=old#secret", startTime: 1005 },
    { name: "https://example.invalid/theme.png?token=secret#fragment", startTime: 1012 },
    { name: "data:image/png;base64,private-data", startTime: 1014 },
    { name: "blob:https://example.invalid/private-id", startTime: 1016 },
  ]);

  for (let i = 0; i < 60; i++) {
    const ts = 1026 + i * 16;
    h.setNow(ts);
    if (i === 0) Object.assign(h.SG.__test.perfSeg, { render: 7, pieces: 3 });
    else Object.assign(h.SG.__test.perfSeg, { render: 2, pieces: 1 });
    h.SG.__test.perfRecordFrame(ts, "ash");
  }

  const report = h.SG.perf.report();
  assert.deepEqual({ ...report.supported }, { eventTiming: true, longAnimationFrame: true, resourceTiming: true });
  assert.equal(report.networkRequests, 4,
    "completed entries started after diagnostics were enabled should be counted");
  assert.deepEqual([...report.recentRequests], [
    "https://example.invalid/pre-switch.png",
    "https://example.invalid/theme.png",
    "data:",
    "blob:",
  ], "request labels should retain only HTTP origin/path or the data/blob scheme");
  assert.doesNotMatch(JSON.stringify(report.recentRequests), /token|secret|fragment|private/,
    "query strings, fragments, and opaque data/blob payloads must not enter diagnostics");
  assert.equal(report.heapUsedMB, 1);
  assert.deepEqual({ ...report.slowInputEvents[0] }, {
    name: "click", target: "themeSelect", theme: "classic",
    inputDelayMs: 2, processingMs: 4, durationToNextPaintMs: 24,
  });
  assert.equal(report.slowInputEvents[1].theme, "ash",
    "an input entry delivered after the switch should still use its own start timestamp");
  const ash = report.themes.find(theme => theme.theme === "ash");
  const classic = report.themes.find(theme => theme.theme === "classic");
  assert.equal(classic.longAnimationFrames, 1,
    "a delayed LoAF entry rendered before the switch should be attributed to the old theme");
  assert.equal(classic.maxLongAnimationFrameMs, 42);
  assert.equal(classic.totalBlockingMs, 10);
  assert.equal(ash.longAnimationFrames, 1,
    "a LoAF rendered after the switch should be attributed to the new theme");
  assert.equal(ash.maxLongAnimationFrameMs, 30);
  assert.equal(ash.totalBlockingMs, 5);

  assert.equal(report.switches.length, 1);
  const summary = report.switches[0];
  assert.equal(summary.inputDelayMs, 4);
  assert.equal(summary.switchToFirstFrameMs, 16);
  assert.equal(summary.inputToFirstFrameMs, 20);
  assert.equal(summary.firstRenderMs, 7);
  assert.equal(summary.firstIntervalMs, 26);
  assert.equal(summary.framesObserved, 60);
  assert.equal(summary.networkRequests, 3,
    "per-switch counts should use request startTime and exclude a request started before the switch");
  assert.equal(summary.heapDeltaMB, 0);
  h.SG.perf.disable();
});

test("performance diagnostics use the browser URL parser while redacting credentials and query data", () => {
  const h = createHarness({
    observerTypes: ["resource"],
    locationHref: "https://game.example.invalid/play/index.html",
    urlConstructor: URL,
  });
  h.SG.perf.enable();
  h.performanceObservers[0].emit([
    { name: "../assets/theme.png?token=private#secret", startTime: 10 },
    { name: "https://alice:password@example.invalid/image.svg?token=private#secret", startTime: 11 },
  ]);

  const report = h.SG.perf.report();
  assert.deepEqual([...report.recentRequests], [
    "https://game.example.invalid/assets/theme.png",
    "https://example.invalid/image.svg",
  ], "relative URLs should resolve against location.href and credentials/query/fragment must be omitted");
  assert.doesNotMatch(JSON.stringify(report.recentRequests), /alice|password|token|secret/);
  h.SG.perf.disable();
});

test("the render loop records its own RAF timestamps for warm-up health", () => {
  const h = createHarness({ proxyCanvasContext: true });

  for (let i = 0; i <= 8; i++) h.SG.__test.loop(1000 + i * 16);

  assert.equal(h.SG.__test.warmSignals.lastTs, 1128);
  assert.equal(h.SG.__test.warmSignals.count, 8,
    "eight intervals from actual render-loop frames should satisfy the warm-up frame sample count");
  assert.deepEqual([...h.SG.__test.warmSignals.intervals], Array(8).fill(16));
});

test("hover pointer movement does not block warm-up, while a drag does until 300ms idle", () => {
  const hover = createHarness();
  hover.seedHealthyFrames();
  hover.startPicker.dispatch("focus");
  hover.window.dispatch("pointermove", { buttons: 0 });
  hover.flushOneWarmSlice({ timeRemaining: () => 100 });
  assert.ok(hover.createdCanvases.length > 0,
    "hover-only pointer movement should not be treated as recent user input");

  const drag = createHarness();
  drag.seedHealthyFrames();
  drag.startPicker.dispatch("focus");
  drag.window.dispatch("pointermove", { buttons: 1 });
  drag.flushOneWarmSlice({ timeRemaining: () => 100 });
  assert.equal(drag.createdCanvases.length, 0, "a pointer drag should defer speculative painting");
  assert.equal(drag.SG.__test.themeWarm.misses, 1);
  assert.equal(drag.timers[0].delay, 300);

  drag.advanceClock(300);
  for (let ts = 143; ts <= 428; ts += 15) drag.SG.__test.noteWarmFrame(ts);
  drag.flushOneWarmSlice({ timeRemaining: () => 100 });
  assert.ok(drag.createdCanvases.length > 0, "warm-up should resume once the 300ms input quiet window expires");
});

test("performance observers are created only on enable and disconnected on disable", () => {
  const h = createHarness({ observerTypes: ["event", "long-animation-frame", "resource"] });
  assert.equal(h.performanceObservers.length, 0, "diagnostics-off startup must not create observers");

  h.SG.perf.enable();
  assert.equal(h.performanceObservers.length, 3, "enable should observe only the supported entry types");
  const observers = [...h.performanceObservers];
  h.SG.perf.disable();
  assert.ok(observers.every(observer => observer.disconnected), "disable should disconnect every observer");

  observers[0].emit([{
    name: "click", startTime: 1, processingStart: 2, processingEnd: 3, duration: 4,
  }]);
  assert.equal(h.SG.perf.report().slowInputEvents.length, 0,
    "entries delivered by a disconnected observer after disable should be ignored");
});

test("a second theme switch closes the first request window and post-summary requests stay excluded", () => {
  const h = createHarness({ observerTypes: ["resource"] });
  h.setNow(1000);
  h.SG.perf.enable();

  h.setNow(1010);
  h.startPicker.value = "ash";
  h.startPicker.dispatch("change");
  const resourceObserver = h.performanceObservers[0];
  resourceObserver.emit([
    { name: "https://example.invalid/before-first.png", startTime: 1005 },
    { name: "https://example.invalid/first-window.png", startTime: 1015 },
    { name: "https://example.invalid/first-window-end.png", startTime: 1019 },
    { name: "https://example.invalid/second-window-boundary.png", startTime: 1020 },
  ]);

  h.setNow(1020);
  h.optionsPicker.value = "ember";
  h.optionsPicker.dispatch("change");
  resourceObserver.emit([
    { name: "https://example.invalid/second-window.png", startTime: 1025 },
  ]);
  for (let i = 0; i < 60; i++) {
    const ts = 1100 + i * 16;
    h.setNow(ts);
    h.SG.__test.perfRecordFrame(ts, "ember");
  }

  let report = h.SG.perf.report();
  assert.equal(report.switches.length, 2);
  assert.equal(report.switches[0].networkRequests, 2,
    "the first window ends exclusively at the second switch, excluding its start-time request");
  assert.equal(report.switches[1].networkRequests, 2,
    "the second window includes the request at its start time and its later request");

  resourceObserver.emit([
    { name: "https://example.invalid/after-summary.png", startTime: 3000 },
  ]);
  report = h.SG.perf.report();
  assert.equal(report.switches[1].networkRequests, 2,
    "requests starting after the second switch summary must not be retroactively included");
  h.SG.perf.disable();
});

test("warm-up requires 2ms of idle-start room and rejects stale RAF samples", () => {
  const clamped = createHarness();
  clamped.seedHealthyFrames(Array(8).fill(1));
  clamped.startPicker.dispatch("focus");
  clamped.flushOneWarmSlice({ timeRemaining: () => 1.99 });
  assert.equal(clamped.createdCanvases.length, 0, "less than the 2ms minimum must not start a cold icon");
  clamped.flushOneWarmSlice({ timeRemaining: () => 2 });
  assert.ok(clamped.createdCanvases.length > 0, "the clamped 2ms minimum should be sufficient");

  const stale = createHarness();
  stale.seedHealthyFrames();
  stale.advanceClock(251);
  stale.startPicker.dispatch("focus");
  stale.flushOneWarmSlice({ timeRemaining: () => 100 });
  assert.equal(stale.createdCanvases.length, 0, "warm-up must wait until fresh RAF samples resume");
});

test("performance diagnostics can be enabled through either supported opt-in flag", () => {
  for (const options of [{ locationSearch: "?other=1&sgperf=1" }, { storedPerf: true }]) {
    const h = createHarness(options);
    const initialCalls = h.performanceCalls();
    h.startPicker.value = "ash";
    h.startPicker.dispatch("change");
    assert.ok(h.performanceCalls() > initialCalls,
      "an opt-in flag should enable timing around theme changes");
    h.SG.perf.disable(true);
    assert.equal(h.storage.has("sg.perf"), false,
      "disable(true) should clear the persisted diagnostics flag");
  }
});

test("prewarmed theme images are reused by the next real selection repaint", () => {
  const h = createHarness({ idleSupport: true });
  const [darkIcon, lightIcon] = h.legendIcons;
  darkIcon.width = 60;
  darkIcon.height = 64;
  darkIcon.attributes["data-side"] = "dark";
  lightIcon.width = 48;
  lightIcon.height = 52;

  let darkPainterCalls = 0;
  h.themes.ash.sidePainters = {
    dark: {
      sovereign(context) {
        darkPainterCalls++;
        context.canvas.paintTheme = "ash-dark-sovereign";
      },
    },
  };

  h.seedHealthyFrames();
  h.startPicker.dispatch("pointerenter");
  assert.equal(h.SG.__test.themeWarm.queue.length, 4, "warm-up should use the two real legend jobs per inactive theme");
  h.flushOneWarmSlice();

  const warmedDarkImage = h.createdCanvases.find(image => image.paintTheme === "ash-dark-sovereign");
  const warmedLightImage = h.createdCanvases.find(image =>
    image.paintTheme === "ash" && image.width === 48 && image.height === 52);
  assert.ok(warmedDarkImage, "the next theme's dark-side sovereign image should be pre-rendered");
  assert.ok(warmedLightImage, "the next theme's light-side reaper image should be pre-rendered");
  assert.equal(warmedDarkImage.width, 60);
  assert.equal(warmedDarkImage.height, 64);
  assert.equal(warmedLightImage.width, 48);
  assert.equal(warmedLightImage.height, 52);
  assert.equal(darkPainterCalls, 1);
  assert.equal(h.paintCounts.get("ash:reaper"), 1);

  const canvasCountAfterWarm = h.createdCanvases.length;
  const painterCountsAfterWarm = [...h.paintCounts];
  h.startPicker.value = "ash";
  h.startPicker.dispatch("change");
  h.flushOneIconSlice();

  assert.equal(darkIcon.lastImage, warmedDarkImage,
    "the repaint should draw the cached dark-side image with its original size");
  assert.equal(lightIcon.lastImage, warmedLightImage,
    "the repaint should draw the cached light-side image with its original size");
  assert.equal(darkIcon.lastImage.paintTheme, "ash-dark-sovereign");
  assert.equal(lightIcon.lastImage.paintTheme, "ash");
  assert.equal(darkIcon.lastImage.width, darkIcon.width);
  assert.equal(darkIcon.lastImage.height, darkIcon.height);
  assert.equal(lightIcon.lastImage.width, lightIcon.width);
  assert.equal(lightIcon.lastImage.height, lightIcon.height);
  assert.equal(h.createdCanvases.length, canvasCountAfterWarm, "a cache hit must not create another render canvas");
  assert.deepEqual([...h.paintCounts], painterCountsAfterWarm, "a cache hit must not call a painter again");
  assert.equal(darkPainterCalls, 1, "the side-specific painter should not run during the selection repaint");
});
