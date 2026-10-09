"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const gameSource = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
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
  locationSearch = "", storedPerf = false,
} = {}) {
  const paintCounts = new Map();
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
    constructor(canvas) { this.canvas = canvas; this.saveDepth = 0; }
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
    dispatch(type) {
      const handler = this.listeners.get(type);
      assert.ok(handler, `expected a ${type} listener on ${this.id}`);
      handler({ target: this });
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
  const document = {
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
    addEventListener() {},
  };
  const animationFrames = [];
  const timers = [];
  const idleCallbacks = [];
  const storage = new Map();
  if (storedPerf) storage.set("sg.perf", "1");
  let now = 0;
  let performanceCalls = 0;
  const sandbox = {
    window: { SG: { THEMES: themes }, addEventListener() {} },
    document,
    location: { search: locationSearch },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    performance: { now() { performanceCalls++; const value = now; now += clockStep; return value; } },
    requestAnimationFrame(callback) { animationFrames.push(callback); },
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout() {},
    console,
  };
  if (idleSupport) sandbox.requestIdleCallback = (callback, options) => { idleCallbacks.push({ callback, options }); };

  const instrumentation = `  state = freshState();
  Object.defineProperty(SG, "state", { get: () => state });
  SG.__test = {
    setTheme, paintIcon, paintFigure, drawPiece, drawForesight, perfRecordFrame, perfSeg,
    themeWarm, requestThemeWarm,
  };`;
  assert.equal(gameSource.split(bootBlock).length, 2, "expected the game boot block to remain recognizable");
  vm.runInNewContext(gameSource.replace(bootBlock, instrumentation), sandbox, { filename: "game.js" });

  function flushOneIconSlice() {
    const frame = animationFrames.shift();
    assert.ok(frame, "expected a queued animation frame");
    frame();
    const timer = timers.shift();
    assert.ok(timer, "expected the repaint task after its animation frame");
    timer();
  }

  function flushOneWarmSlice(deadline = { timeRemaining: () => 100 }) {
    if (idleCallbacks.length) {
      const idle = idleCallbacks.shift();
      assert.ok(idle, "expected a queued idle warm-up callback");
      idle.callback(deadline);
      return;
    }
    const frame = animationFrames.shift();
    assert.ok(frame, "expected a queued warm-up animation frame");
    frame();
    const timer = timers.shift();
    assert.ok(timer, "expected the warm-up task after its animation frame");
    timer();
  }

  return {
    board, startPicker, optionsPicker, legendIcons, helpIcons, themes, paintCounts, createdCanvases,
    animationFrames, timers, idleCallbacks, storage, SG: sandbox.window.SG, makeTheme,
    flushOneIconSlice, flushOneWarmSlice, performanceCalls: () => performanceCalls,
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

test("idle theme warm-up waits for real icon repaint and skips the newly active theme", () => {
  const h = createHarness({ idleSupport: true });
  h.startPicker.dispatch("pointerenter");
  h.startPicker.dispatch("focus");
  assert.equal(h.idleCallbacks.length, 1, "repeated intent signals should coalesce into one idle callback");
  assert.equal(h.createdCanvases.length, 0, "warm-up should not render synchronously on pointer or focus");

  h.startPicker.value = "ash";
  h.startPicker.dispatch("change");
  assert.equal(h.animationFrames.length, 1, "the actual switch should schedule its own repaint");

  const warmBeforeSwitch = h.idleCallbacks.shift();
  warmBeforeSwitch.callback({ timeRemaining: () => 100 });
  assert.equal(h.createdCanvases.length, 0,
    "warm-up must yield without painting while the actual switch repaint is pending");
  assert.equal(h.idleCallbacks.length, 1, "deferred warm-up should retry after the switch work");

  h.flushOneIconSlice();
  assert.equal(h.legendIcons[0].lastImage.paintTheme, "ash",
    "the selected theme's visible icon repaint should complete before prewarming");
  assert.equal(h.paintCounts.get("ash:sovereign"), 1);
  assert.equal(h.paintCounts.get("ash:reaper"), 1);

  h.flushOneWarmSlice();
  assert.equal(h.legendIcons[0].lastImage.paintTheme, "ash",
    "prewarming must not draw into or replace visible legend canvases");
  assert.equal(h.paintCounts.get("ash:sovereign"), 1,
    "a queued warm-up entry for the now-active theme should be skipped");
  assert.equal(h.paintCounts.get("ash:reaper"), 1);
  assert.equal(h.createdCanvases.length, 6,
    "the switch's two visible icons and both now-inactive themes should be rasterized");
  assert.equal(h.paintCounts.get("classic:sovereign"), 1,
    "the refreshed queue should include the theme that became inactive after the switch");
});

test("idle warm-up honors the minimum idle budget and keeps within icon-cache headroom", () => {
  const h = createHarness({ legendCount: 48, idleSupport: true });
  h.legendIcons.forEach((icon, index) => { icon.width = icon.height = 52 + index; });
  h.legendIcons.forEach(icon => {
    h.SG.__test.paintIcon(icon, icon.getAttribute("data-piece"), "light");
  });
  const activeImages = h.legendIcons.map(icon => icon.lastImage);
  assert.equal(h.createdCanvases.length, 48, "the active theme should have a cached image for every visible icon");
  h.startPicker.dispatch("pointerenter");

  h.flushOneWarmSlice({ timeRemaining: () => 7.99 });
  assert.equal(h.createdCanvases.length, 48,
    "an idle callback with less than eight milliseconds remaining should not start an icon");
  assert.equal(h.idleCallbacks.length, 1, "unprocessed icons should be rescheduled");

  h.flushOneWarmSlice({ timeRemaining: () => 100 });
  assert.equal(h.createdCanvases.length, 96,
    "with 48 distinct icons per theme, only one non-active theme should be warmed to preserve cache headroom");
  assert.equal(h.paintCounts.get("ash:sovereign") + h.paintCounts.get("ash:reaper"), 48,
    "warm-up should prioritize the next theme in picker order");
  assert.equal(h.paintCounts.has("ember:sovereign"), false,
    "lower-priority themes must be left unwarmed when the cache budget is exhausted");
  assert.ok(h.createdCanvases.length < 128, "warming must leave cache capacity for the active theme");

  const activePaintCounts = ["classic:sovereign", "classic:reaper"].map(key => h.paintCounts.get(key));
  h.legendIcons.forEach(icon => {
    h.SG.__test.paintIcon(icon, icon.getAttribute("data-piece"), "light");
  });
  assert.deepEqual(h.legendIcons.map(icon => icon.lastImage), activeImages,
    "prewarming inactive themes must not evict the active theme's cached icon images");
  assert.deepEqual(["classic:sovereign", "classic:reaper"].map(key => h.paintCounts.get(key)), activePaintCounts,
    "repainting active icons after warm-up should reuse their cached renderings");
});

test("fallback warm-up uses one icon per post-frame task when idle callbacks are unavailable", () => {
  const h = createHarness({ idleSupport: false });
  h.startPicker.dispatch("focus");

  assert.equal(h.animationFrames.length, 1);
  assert.equal(h.createdCanvases.length, 0, "fallback work should wait until after a frame");
  h.flushOneWarmSlice();
  assert.equal(h.createdCanvases.length, 1, "fallback mode should warm only one icon per task");
  assert.equal(h.animationFrames.length, 1, "remaining work should be yielded to a later frame/task");
});

test("repeated short idle periods latch one-icon tasks until completion and new chains start idle-first", () => {
  const h = createHarness({ idleSupport: true });
  h.startPicker.dispatch("pointerenter");

  for (let miss = 1; miss <= 3; miss++) {
    assert.equal(h.idleCallbacks.length, 1, "there should be one outstanding callback in the warm-up chain");
    assert.equal(h.idleCallbacks[0].options.timeout, 1000, "idle callbacks should have a starvation timeout");
    h.flushOneWarmSlice({ timeRemaining: () => 7.99 });
    assert.equal(h.createdCanvases.length, 0, "short idle periods must not start an icon render");
    assert.equal(h.SG.__test.themeWarm.misses, miss);
    assert.equal(h.SG.__test.themeWarm.fallback, miss === 3,
      "the third idle miss should latch fallback mode for the remainder of this chain");
  }

  assert.equal(h.idleCallbacks.length, 0, "after three idle misses, the next slice should use the task fallback");
  assert.equal(h.animationFrames.length, 1, "the fallback should wait until after a presented frame");
  assert.equal(h.SG.__test.themeWarm.scheduled, true);

  h.startPicker.dispatch("focus");
  h.SG.__test.requestThemeWarm();
  assert.equal(h.animationFrames.length, 1, "duplicate requests must reuse the existing fallback chain");
  assert.equal(h.idleCallbacks.length, 0, "fallback mode must not return to idle callbacks mid-chain");
  assert.equal(h.SG.__test.themeWarm.fallback, true);

  for (let icon = 1; icon <= 4; icon++) {
    const beforeSlice = h.createdCanvases.length;
    h.flushOneWarmSlice();
    assert.equal(h.createdCanvases.length - beforeSlice, 1,
      "each post-frame fallback task must process exactly one icon");
    if (icon < 4) {
      assert.equal(h.SG.__test.themeWarm.fallback, true, "fallback should persist while queue work remains");
      assert.equal(h.SG.__test.themeWarm.misses, 3, "fallback progress must not clear the miss history");
      assert.equal(h.idleCallbacks.length, 0, "subsequent icons must not wait for idle callbacks");
      assert.equal(h.animationFrames.length, 1, "each remaining icon should have one later task scheduled");
      assert.equal(h.SG.__test.themeWarm.queue.length, 4 - icon);
    }
  }

  assert.equal(h.SG.__test.themeWarm.scheduled, false);
  assert.equal(h.SG.__test.themeWarm.queue.length, 0);
  assert.equal(h.SG.__test.themeWarm.key, "");
  assert.equal(h.SG.__test.themeWarm.misses, 0);
  assert.equal(h.SG.__test.themeWarm.fallback, false, "chain completion should reset fallback mode");
  assert.equal(h.idleCallbacks.length, 0);
  assert.equal(h.animationFrames.length, 0);

  h.SG.__test.requestThemeWarm();
  assert.equal(h.SG.__test.themeWarm.scheduled, true, "a completed chain should allow a new request");
  assert.equal(h.SG.__test.themeWarm.fallback, false, "a new chain should start without the fallback latch");
  assert.equal(h.idleCallbacks.length, 1, "a new chain should try idle scheduling again");
  assert.equal(h.animationFrames.length, 0);
});

test("timed-out and zero-budget idle callbacks count as misses", () => {
  const h = createHarness({ idleSupport: true });
  h.startPicker.dispatch("focus");
  assert.equal(h.idleCallbacks[0].options.timeout, 1000);

  h.flushOneWarmSlice({ didTimeout: true, timeRemaining: () => 0 });
  assert.equal(h.SG.__test.themeWarm.misses, 1, "a timed-out idle callback should count as a miss");
  assert.equal(h.createdCanvases.length, 0);

  h.flushOneWarmSlice({ timeRemaining: () => 0 });
  assert.equal(h.SG.__test.themeWarm.misses, 2, "an idle callback with no time remaining should count as a miss");
  assert.equal(h.createdCanvases.length, 0);
  assert.equal(h.idleCallbacks.length, 1, "the chain should keep requesting bounded idle opportunities");
  assert.equal(h.idleCallbacks[0].options.timeout, 1000);
});

test("fallback survives repaint pauses and refreshes its queue after theme and legend-size changes", () => {
  const h = createHarness({ idleSupport: true });
  h.startPicker.dispatch("pointerenter");
  assert.equal(h.SG.__test.themeWarm.queue.length, 4);

  for (let miss = 1; miss <= 3; miss++) {
    h.flushOneWarmSlice({ timeRemaining: () => 7.99 });
    assert.equal(h.SG.__test.themeWarm.misses, miss);
  }
  assert.equal(h.SG.__test.themeWarm.fallback, true);
  assert.equal(h.idleCallbacks.length, 0);

  h.startPicker.value = "ash";
  h.startPicker.dispatch("change");
  h.legendIcons.forEach(icon => { icon.width = 60; icon.height = 64; });

  h.flushOneWarmSlice();
  assert.equal(h.createdCanvases.length, 0, "warming must pause while the real switch repaint is pending");
  assert.equal(h.SG.__test.themeWarm.fallback, true, "a repaint pause must preserve fallback mode");
  assert.equal(h.SG.__test.themeWarm.misses, 3, "a repaint pause must preserve the idle miss history");
  assert.equal(h.idleCallbacks.length, 0, "a paused fallback chain must not return to idle scheduling");

  h.flushOneIconSlice();
  assert.equal(h.legendIcons[0].lastImage.width, 60);
  assert.equal(h.legendIcons[0].lastImage.height, 64);
  assert.equal(h.SG.__test.themeWarm.fallback, true, "the actual icon repaint must not reset fallback mode");
  assert.equal(h.idleCallbacks.length, 0);

  const beforeRefresh = h.createdCanvases.length;
  h.flushOneWarmSlice();
  assert.equal(h.createdCanvases.length - beforeRefresh, 1,
    "resumed fallback work must remain bounded to one icon");
  assert.equal(h.SG.__test.themeWarm.fallback, true, "queue refresh must retain fallback mode");
  assert.equal(h.SG.__test.themeWarm.misses, 3, "queue refresh must retain the chain's miss history");
  assert.equal(h.idleCallbacks.length, 0, "queue refresh must continue with tasks instead of idle callbacks");
  assert.deepEqual([...h.SG.__test.themeWarm.queue.map(job => job.themeId)], ["ember", "classic", "classic"],
    "the refreshed queue should be in picker order, excluding the icon already processed in this slice");
  assert.ok(h.SG.__test.themeWarm.queue.every(job => job.w === 60 && job.h === 64),
    "the refreshed queue should use the current legend backing-store dimensions");

  while (h.SG.__test.themeWarm.scheduled) {
    const beforeSlice = h.createdCanvases.length;
    h.flushOneWarmSlice();
    assert.equal(h.createdCanvases.length - beforeSlice, 1,
      "every remaining fallback task should rasterize only one icon");
    assert.equal(h.SG.__test.themeWarm.fallback, h.SG.__test.themeWarm.scheduled,
      "fallback should stay latched until the final queued icon completes");
    assert.equal(h.idleCallbacks.length, 0);
  }
  assert.equal(h.SG.__test.themeWarm.scheduled, false);
  assert.equal(h.SG.__test.themeWarm.fallback, false, "completion should reset fallback after the refreshed queue drains");
  assert.equal(h.createdCanvases.length, 6, "the switch and refreshed inactive-theme queue should render six images");
  assert.ok(h.createdCanvases.every(canvas => canvas.width === 60 && canvas.height === 64),
    "neither stale sizes nor stale theme jobs should be rasterized");
  assert.equal(h.paintCounts.get("ash:sovereign"), 1, "the active theme should be rendered only for its visible repaint");
  assert.equal(h.paintCounts.get("ash:reaper"), 1);
  assert.equal(h.paintCounts.get("ember:sovereign"), 1);
  assert.equal(h.paintCounts.get("ember:reaper"), 1);
  assert.equal(h.paintCounts.get("classic:sovereign"), 1);
  assert.equal(h.paintCounts.get("classic:reaper"), 1);
});

test("theme warm-up keeps one chain and resets its state after completion and restart", () => {
  const h = createHarness({ idleSupport: true });
  h.startPicker.dispatch("pointerenter");
  h.startPicker.dispatch("focus");
  h.startPicker.dispatch("pointerdown");
  h.SG.__test.requestThemeWarm();
  assert.equal(h.idleCallbacks.length, 1, "repeated intent and request signals must not start duplicate chains");
  assert.equal(h.SG.__test.themeWarm.queue.length, 4);
  assert.equal(h.SG.__test.themeWarm.scheduled, true);

  h.flushOneWarmSlice({ timeRemaining: () => 0 });
  assert.equal(h.SG.__test.themeWarm.misses, 1);
  h.SG.__test.requestThemeWarm();
  assert.equal(h.idleCallbacks.length, 1, "a running chain should retain only its existing callback");
  assert.equal(h.SG.__test.themeWarm.misses, 1, "a duplicate request must not reset an in-flight chain");

  h.flushOneWarmSlice({ timeRemaining: () => 100 });
  assert.equal(h.SG.__test.themeWarm.scheduled, false);
  assert.equal(h.SG.__test.themeWarm.queue.length, 0);
  assert.equal(h.SG.__test.themeWarm.key, "");
  assert.equal(h.SG.__test.themeWarm.misses, 0);
  assert.equal(h.idleCallbacks.length, 0);
  assert.equal(h.animationFrames.length, 0);

  h.SG.__test.requestThemeWarm();
  assert.equal(h.SG.__test.themeWarm.scheduled, true, "a completed chain should allow a fresh request");
  assert.equal(h.SG.__test.themeWarm.misses, 0, "new chains should start with a clean miss counter");
  assert.equal(h.idleCallbacks.length, 1);
  h.flushOneWarmSlice({ timeRemaining: () => 100 });
  assert.equal(h.SG.__test.themeWarm.scheduled, false);
  assert.equal(h.SG.__test.themeWarm.queue.length, 0);
  assert.equal(h.SG.__test.themeWarm.key, "");
  assert.equal(h.SG.__test.themeWarm.misses, 0);
});

test("performance diagnostics stay untimed by default and report per-theme frame aggregates", () => {
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
    avgIntervalMs: 25, p95IntervalMs: 34, maxIntervalMs: 34, longFrames: 1,
    avgUpdateMs: 1.5, avgRenderMs: 7.5, maxRenderMs: 20,
    avgTerrainMs: 3, avgPiecesMs: 2, maxPiecesMs: 5,
    avgFiguresPerFrame: 1.5, avgFxMs: 1, avgScreenMs: 1.5,
  });
  assert.equal(report.iconRepaintMs, 0);
  h.SG.perf.disable();
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

test("idle warm-up stops when its remaining budget expires and resets misses after progress", () => {
  const h = createHarness({ idleSupport: true });
  h.startPicker.dispatch("pointerenter");

  h.flushOneWarmSlice({ timeRemaining: () => 0 });
  assert.equal(h.SG.__test.themeWarm.misses, 1, "a no-progress idle slice should leave a prior miss");
  assert.equal(h.createdCanvases.length, 0);
  assert.equal(h.SG.__test.themeWarm.queue.length, 4);

  let deadlineReads = 0;
  h.flushOneWarmSlice({
    timeRemaining() {
      return deadlineReads++ === 0 ? 100 : 7.99;
    },
  });

  assert.equal(deadlineReads, 2, "the budget should be checked before the next icon");
  assert.equal(h.createdCanvases.length, 1, "only the icon started with sufficient idle budget should render");
  assert.equal(h.SG.__test.themeWarm.queue.length, 3, "the remaining icons should stay queued");
  assert.equal(h.SG.__test.themeWarm.misses, 0, "making progress should reset the prior idle miss");
  assert.equal(h.SG.__test.themeWarm.fallback, false);
  assert.equal(h.idleCallbacks.length, 1, "remaining work should request another idle callback");
  assert.equal(h.animationFrames.length, 0, "partial idle progress must not switch to frame fallback");
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
