"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const gameSource = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
const bootBlock = `  state = freshState();
  buildBoardCache();
  seedAmbientParticles();
  buildLegendIcons();
  refreshLanguage();
  requestAnimationFrame(loop);
  Object.defineProperty(SG, "state", { get: () => state });`;

function createHarness({ legendCount = 2, helpCount = 0, clockStep = 0 } = {}) {
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
    constructor(canvas) { this.canvas = canvas; }
    save() {}
    restore() {}
    translate() {}
    setTransform() {}
    clearRect() {}
    beginPath() {}
    arc() {}
    fill() {}
    stroke() {}
    fillRect() {}
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
  const elements = new Map([
    ["board", new FakeCanvas("board")],
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
  const storage = new Map();
  let now = 0;
  const sandbox = {
    window: { SG: { THEMES: themes }, addEventListener() {} },
    document,
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
    },
    performance: { now() { const value = now; now += clockStep; return value; } },
    requestAnimationFrame(callback) { animationFrames.push(callback); },
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout() {},
    console,
  };

  const instrumentation = `  state = freshState();
  Object.defineProperty(SG, "state", { get: () => state });
  SG.__test = { setTheme, paintIcon };`;
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

  return {
    startPicker, optionsPicker, legendIcons, helpIcons, themes, paintCounts, createdCanvases,
    animationFrames, timers, storage, SG: sandbox.window.SG, makeTheme, flushOneIconSlice,
  };
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
