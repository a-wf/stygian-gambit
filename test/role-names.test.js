"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const gameSource = fs.readFileSync(path.join(root, "game.js"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const styleSource = fs.readFileSync(path.join(root, "style.css"), "utf8");
const roleNamesSource = fs.readFileSync(path.join(root, "role-names.js"), "utf8");
const englishSource = fs.readFileSync(path.join(root, "i18n", "en.js"), "utf8");
const chineseSource = fs.readFileSync(path.join(root, "i18n", "zh.js"), "utf8");
const roles = ["sovereign", "reaper", "juggernaut", "trickster", "wildrider", "skirmisher", "harrower", "fury"];
const themes = [
  "classic", "galactic", "superhero", "justice", "shinobi", "spiritcourt",
  "piratecrew", "wonderkingdom", "olympian", "pharaonic", "celestial", "hyakki",
];
const bootBlock = `  state = freshState();
  buildBoardCache();
  seedAmbientParticles();
  buildLegendIcons();
  refreshLanguage();
  requestAnimationFrame(loop);
  Object.defineProperty(SG, "state", { get: () => state });`;

function matches(element, selector) {
  const match = selector.match(/^([a-z][\w-]*)?(?:\.([\w-]+))?$/i);
  if (!match) return false;
  if (match[1] && element.tagName.toLowerCase() !== match[1].toLowerCase()) return false;
  return !match[2] || element.className.split(/\s+/).includes(match[2]);
}

class FakeElement {
  constructor(tagName = "div", id = "") {
    this.tagName = tagName;
    this.id = id;
    this.value = "";
    this.title = "";
    this.disabled = false;
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.className = "";
    this.isConnected = true;
    this.innerHTMLWrites = 0;
    this.textContentWrites = 0;
    this._textContent = "";
    this._innerHTML = "";
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
    if ([
      "hud", "gameOverScreen", "planBar", "boardActions", "choiceScreen", "handoffScreen",
      "helpScreen", "trialsScreen", "optionsScreen", "boonScreen", "mirrorScreen",
      "onlineScreen", "startScreen",
    ].includes(id)) this.classList.add("hidden");
  }

  set textContent(value) {
    this.textContentWrites++;
    this._textContent = String(value);
    this.replaceChildren();
  }
  get textContent() {
    return this.children.length ? this.children.map(child => child.textContent).join("") : this._textContent;
  }
  set innerHTML(value) {
    this.innerHTMLWrites++;
    this._innerHTML = String(value);
    this.replaceChildren();
  }
  get innerHTML() { return this._innerHTML; }
  get firstChild() { return this.children[0] || null; }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  dispatch(type) {
    const handler = this.listeners.get(type);
    assert.ok(handler, `expected a ${type} listener on ${this.id || this.tagName}`);
    handler({ target: this });
  }
  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter(existing => existing !== child);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  replaceChildren(...children) {
    this.children.forEach(child => { child.parentElement = null; });
    this.children = [];
    children.forEach(child => this.appendChild(child));
  }
  getAttribute(name) {
    if (Object.prototype.hasOwnProperty.call(this.attributes, name)) return this.attributes[name];
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return this.dataset[key] || null;
    }
    return null;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = String(value);
    }
  }
  getClientRects() { return this.isConnected ? [{}] : []; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const found = [];
    const visit = node => node.children.forEach(child => {
      if (matches(child, selector)) found.push(child);
      visit(child);
    });
    visit(this);
    return found;
  }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (matches(node, selector)) return node;
    }
    return null;
  }
}

class FakeCanvas extends FakeElement {
  constructor(id = "") {
    super("canvas", id);
    this.width = 0;
    this.height = 0;
    const target = {
      canvas: this,
      save() {},
      restore() {},
      setTransform() {},
      clearRect() {},
      drawImage() {},
      translate() {},
      rotate() {},
      scale() {},
      createRadialGradient() { return { addColorStop() {} }; },
      createLinearGradient() { return { addColorStop() {} }; },
    };
    this.context = new Proxy(target, {
      get(object, key) { return key in object ? object[key] : () => {}; },
      set(object, key, value) { object[key] = value; return true; },
    });
  }
  getContext() { return this.context; }
}

function loadRoleNames() {
  const sandbox = { window: { SG: {} } };
  vm.runInNewContext(roleNamesSource, sandbox, { filename: "role-names.js" });
  return sandbox.window.SG.ROLE_NAMES;
}

function createHarness({ initialTheme = "classic", initialLanguage = "en" } = {}) {
  const paints = new Map();
  const registry = loadRoleNames();
  const themeRegistry = Object.fromEntries(themes.map(id => {
    const painters = Object.fromEntries(roles.map(role => [role, context => {
      const key = `${id}:${role}`;
      paints.set(key, (paints.get(key) || 0) + 1);
      context.canvas.paintedAs = key;
    }]));
    return [id, { name: { en: id, zh: id }, description: { en: "", zh: "" }, painters }];
  }));
  const sg = { THEMES: themeRegistry, ROLE_NAMES: registry, I18N_DICT: {} };
  const windowListeners = new Map();
  const window = {
    SG: sg,
    addEventListener(type, handler) { windowListeners.set(type, handler); },
    dispatchEvent(event) {
      const handler = windowListeners.get(event.type);
      assert.ok(handler, `expected a window ${event.type} listener`);
      handler(event);
    },
  };
  const vmSandbox = { window };
  vm.runInNewContext(englishSource, vmSandbox, { filename: "i18n/en.js" });
  vm.runInNewContext(chineseSource, vmSandbox, { filename: "i18n/zh.js" });
  sg.I18N = {
    lang: initialLanguage,
    t(key, params) {
      let text = (sg.I18N_DICT[sg.I18N.lang] && sg.I18N_DICT[sg.I18N.lang][key]) ||
        (sg.I18N_DICT.en && sg.I18N_DICT.en[key]) || key;
      if (params) text = text.replace(/\{(\w+)\}/g, (match, name) =>
        params[name] == null ? match : String(params[name]));
      return text;
    },
  };

  const legendIcons = [];
  const legendRoots = [];
  const legendLabels = [];
  roles.forEach(role => {
    const wrapper = new FakeElement("span");
    wrapper.className = "icon-caption";
    const canvas = new FakeCanvas(`legend-${role}`);
    canvas.width = canvas.height = 52;
    canvas.className = "legend-icon";
    canvas.dataset.piece = role;
    canvas.dataset.side = role === "fury" ? "neutral" : "light";
    canvas.setAttribute("data-piece", role);
    canvas.setAttribute("data-side", canvas.dataset.side);
    const label = new FakeElement("span");
    label.className = "role-name-label";
    wrapper.append(canvas, label);
    legendIcons.push(canvas);
    legendLabels.push(label);
    legendRoots.push(wrapper);
  });

  const helpScreen = new FakeElement("div", "helpScreen");
  const helpBody = new FakeElement("div");
  helpBody.className = "help-body";
  helpScreen.appendChild(helpBody);
  let helpList;
  function rebuildHelpList(language = sg.I18N.lang) {
    helpList = new FakeElement("ul");
    helpList.className = "help-roles";
    roles.forEach(role => {
      const item = new FakeElement("li");
      const bold = new FakeElement("b");
      bold.textContent = sg.I18N_DICT[language][`piece.${role}`];
      item.appendChild(bold);
      helpList.appendChild(item);
    });
    helpBody.replaceChildren(helpList);
  }
  rebuildHelpList(initialLanguage);
  helpScreen.querySelector = selector =>
    selector === ".help-body ul.help-roles" ? helpList : FakeElement.prototype.querySelector.call(helpScreen, selector);

  const elements = new Map([
    ["board", new FakeCanvas("board")],
    ["themeSelect", new FakeElement("select", "themeSelect")],
    ["optThemeSelect", new FakeElement("select", "optThemeSelect")],
    ["helpScreen", helpScreen],
  ]);
  const animationFrames = [];
  const timers = [];
  const storage = new Map([["stygian_theme", initialTheme]]);
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new FakeElement("div", id));
      return elements.get(id);
    },
    createElement(tag) { return tag === "canvas" ? new FakeCanvas() : new FakeElement(tag); },
    querySelectorAll(selector) {
      if (selector === ".legend-icon") return legendIcons;
      if (selector === ".role-name-label") {
        return [...legendRoots, helpScreen].flatMap(rootNode => {
          if (matches(rootNode, selector)) return [rootNode, ...rootNode.querySelectorAll(selector)];
          return rootNode.querySelectorAll(selector);
        });
      }
      return [];
    },
    addEventListener() {},
  };
  const sandbox = {
    window,
    document,
    location: { search: "" },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    performance: { now() { return 0; } },
    requestAnimationFrame(callback) { animationFrames.push(callback); },
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout() {},
    console,
  };
  const instrumentation = `  state = freshState();
  Object.defineProperty(SG, "state", { get: () => state });
  SG.__roleNameTest = {
    buildLegendIcons, refreshRoleNameLabels, decorateHelpRoles, setTheme,
  };`;
  assert.equal(gameSource.split(bootBlock).length, 2, "expected the game boot block to remain recognizable");
  vm.runInNewContext(gameSource.replace(bootBlock, instrumentation), sandbox, { filename: "game.js" });
  sandbox.window.SG.__roleNameTest.buildLegendIcons();

  return {
    SG: sandbox.window.SG,
    document,
    legendIcons,
    legendLabels,
    helpScreen,
    getHelpList: () => helpList,
    rebuildHelpList,
    startPicker: elements.get("themeSelect"),
    optionsPicker: elements.get("optThemeSelect"),
    animationFrames,
    timers,
    paints,
    window,
  };
}

test("role-name registry covers every theme/role pair in Chinese and English", () => {
  const registry = loadRoleNames();
  assert.deepEqual(Object.keys(registry).sort(), themes.slice().sort());
  assert.equal(Object.keys(registry).length * roles.length, 96);
  for (const theme of themes) {
    assert.deepEqual(Object.keys(registry[theme]).sort(), roles.slice().sort(), `${theme} role roster`);
    for (const role of roles) {
      for (const language of ["zh", "en"]) {
        assert.equal(typeof registry[theme][role][language], "string", `${theme}.${role}.${language}`);
        assert.ok(registry[theme][role][language].trim(), `${theme}.${role}.${language} must not be blank`);
      }
    }
  }
});

test("public-domain pantheon and yokai captions identify the depicted figures", () => {
  const names = loadRoleNames();
  const expected = {
    olympian: {
      zh: ["宙斯（雷霆之王）", "哈迪斯（冥界之王）", "赫拉克勒斯（狮皮巨力）", "赫尔墨斯（神使）", "波塞冬（海神）", "雅典娜（持盾女神）", "阿波罗（日耀弓神）", "阿瑞斯（战神）"],
      en: ["Zeus (thunder king)", "Hades (underworld king)", "Heracles (lion-skinned hero)", "Hermes (divine messenger)", "Poseidon (god of the sea)", "Athena (shield-bearing goddess)", "Apollo (sun-bright archer)", "Ares (god of war)"],
    },
    pharaonic: {
      zh: ["阿蒙·拉（太阳主神）", "伊西斯（魔法与守护女神）", "奥西里斯／卜塔（冥王与创造神）", "托特（智慧与书写之神）", "荷鲁斯（天空之鹰）", "阿努比斯／盖布（亡者引路者与大地神）", "塞赫麦特／哈索尔（狮首与日冠女神）", "塞特（风暴之神）"],
      en: ["Amun-Ra (sun god)", "Isis (magic and motherhood)", "Osiris / Ptah (underworld and creator gods)", "Thoth (wisdom and writing)", "Horus (falcon of the sky)", "Anubis / Geb (dead-guide and earth god)", "Sekhmet / Hathor (lioness and sun-crowned goddesses)", "Seth (god of storms)"],
    },
    celestial: {
      zh: ["地藏菩萨（九环锡杖）", "孙悟空（齐天大圣）", "牛魔王（火焰山主）", "二郎神（三目神将）", "哪吒（风火轮）", "天兵天将（持戟神军）", "后羿（射日神弓）", "铁扇公主（芭蕉扇）"],
      en: ["Ksitigarbha (nine-ring staff)", "Sun Wukong (Monkey King)", "Bull Demon King (mountain lord)", "Erlang Shen (three-eyed deity)", "Nezha (Wind-Fire Wheels)", "Heavenly Halberdiers (celestial host)", "Hou Yi (sun-shooting archer)", "Princess Iron Fan (banana-leaf fan)"],
    },
    hyakki: {
      zh: ["滑头鬼（明：鬼族首领）／酒吞童子（暗：鬼王）", "九尾妖狐（明：灵扇狐妖）／杀戮鬼（暗：巨镰鬼）", "饿者骷髅（巨骨骸灵）", "雪女（冰雪妖姬）", "大天狗／三眼乌天狗（鸦翼天狗）", "猫又（双尾鬼猫）", "酒吞童子／骨女（鬼王与骨女）", "钟馗（斩妖判官）"],
      en: ["Nurarihyon (Light: yokai elder) / Shuten-Doji (Dark: oni king)", "Nine-Tailed Fox (Light: spirit-fan fox) / Slaughter Oni (Dark: scythe-wielding oni)", "Gashadokuro (giant skeleton)", "Yuki-Onna (snow spirit)", "Daitengu / Three-Eyed Crow Tengu (raven-winged)", "Nekomata (fork-tailed cat)", "Shuten-Doji / Hone-Onna (oni king and bone woman)", "Zhong Kui (demon-quelling judge)"],
    },
  };
  for (const [theme, labels] of Object.entries(expected)) {
    roles.forEach((role, index) => {
      assert.equal(names[theme][role].zh, labels.zh[index], `${theme}.${role}.zh identity`);
      assert.equal(names[theme][role].en, labels.en[index], `${theme}.${role}.en identity`);
      assert.match(names[theme][role].zh, /（[^）]+）/, `${theme}.${role}.zh epithet`);
      assert.match(names[theme][role].en, /\([^)]+\)/, `${theme}.${role}.en epithet`);
    });
  }
});

test("homage captions keep Chinese homophone primaries, non-empty epithets, and no direct persona names", () => {
  const names = loadRoleNames();
  const protectedHomageThemes = ["galactic", "superhero", "justice", "shinobi", "spiritcourt", "piratecrew", "wonderkingdom"];
  const denylistThemes = ["classic", ...protectedHomageThemes];
  for (const theme of protectedHomageThemes) for (const role of roles) {
    const chinese = names[theme][role].zh;
    const parenthetical = chinese.match(/^([^（）]+)（([^（）]+)）$/u);
    assert.ok(parenthetical, `${theme}.${role}.zh should have a non-empty parenthetical epithet`);
    assert.ok(parenthetical[1].trim(), `${theme}.${role}.zh primary homophone should be non-empty`);
    assert.ok(parenthetical[2].trim(), `${theme}.${role}.zh epithet should be non-empty`);
    assert.ok(names[theme][role].en.trim(), `${theme}.${role}.en epithet should be non-empty`);
  }
  const representativeWordplay = [
    ["galactic", "reaper", "暗味达"],
    ["galactic", "wildrider", "波巴肥特"],
    ["superhero", "trickster", "编蛛侠客"],
    ["justice", "sovereign", "编幅侠影"],
  ];
  for (const [theme, role, spelling] of representativeWordplay) {
    assert.equal(names[theme][role].zh.split("（")[0], spelling, `${theme}.${role} primary homophone`);
  }
  const chineseExclusiveTerms = [
    "达斯维达", "达斯·维达", "维达", "欧比旺", "波巴费特", "波巴·费特", "原力", "绝地", "西斯", "风暴兵",
    "美国队长", "钢铁侠", "蜘蛛侠", "蝙蝠侠", "超人", "海王", "闪电侠", "绿灯侠", "神奇女侠", "雷神",
    "写轮眼", "宇智波", "鸣人", "鬼灭之刃", "日轮刀", "木叶", "九尾人柱力",
    "黑崎", "死神", "斩魄刀", "尸魂界", "瞬步", "白面虚",
    "草帽", "路飞", "索隆", "乌索普", "山治", "火拳艾斯", "海贼王",
    "白兔", "红心女王",
  ];
  const englishExclusiveTerms = [
    "Jedi", "Sith", "Stormtrooper", "Force", "Sharingan", "Hollow", "Flash-step",
    "Straw-hat", "Soul reaper", "Cape Crusader",
  ];
  const directPersonaNames = [
    "Darth Vader", "Obi-Wan Kenobi", "Boba Fett", "Captain America", "Nightwing", "Iron Man",
    "Spider-Man", "Batman", "The Flash", "Green Lantern", "Wonder Woman", "Thor", "Superman",
    "Aquaman", "The Riddler", "Naruto", "Ichigo Kurosaki", "Monkey D. Luffy", "Roronoa Zoro",
    "Usopp", "Sanji",
  ];
  const violations = [];
  for (const theme of denylistThemes) for (const role of roles) {
    const { zh, en } = names[theme][role];
    for (const term of chineseExclusiveTerms) {
      if (zh.includes(term)) violations.push(`${theme}.${role}.zh contains ${term}`);
    }
    for (const term of englishExclusiveTerms) {
      if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(en)) {
        violations.push(`${theme}.${role}.en contains ${term}`);
      }
    }
    for (const persona of directPersonaNames) {
      if (new RegExp(`\\b${persona.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(en)) {
        violations.push(`${theme}.${role}.en contains persona ${persona}`);
      }
    }
  }
  assert.deepEqual(violations, [], "homage captions should avoid official names and franchise-exclusive terms");
});

test("home legend captions follow theme and language without changing canvas work", () => {
  const h = createHarness();
  for (const role of roles) assert.equal(h.legendLabels[roles.indexOf(role)].textContent, h.SG.ROLE_NAMES.classic[role].en);
  h.paints.clear();

  h.startPicker.value = "galactic";
  h.startPicker.dispatch("change");
  assert.equal(h.SG.state.theme, "galactic");
  assert.equal(h.optionsPicker.value, "galactic");
  roles.forEach((role, index) => {
    assert.equal(h.legendLabels[index].textContent, h.SG.ROLE_NAMES.galactic[role].en);
  });
  assert.equal(h.paints.size, 0, "caption refresh must not paint canvases synchronously");
  assert.equal(h.animationFrames.length, 1, "the existing theme icon repaint should remain deferred/coalesced");

  h.SG.I18N.lang = "zh";
  h.window.dispatchEvent({ type: "sg:lang" });
  roles.forEach((role, index) => {
    assert.equal(h.legendLabels[index].textContent, h.SG.ROLE_NAMES.galactic[role].zh);
  });
  assert.equal(h.paints.size, 0, "language-only caption refresh must not repaint canvases");
  assert.equal(h.animationFrames.length, 1, "language-only caption refresh must not add scheduler work");
});

test("missing themes, roles, and locale labels fall back to readable text", () => {
  const h = createHarness();
  delete h.SG.ROLE_NAMES.galactic;
  h.startPicker.value = "galactic";
  h.startPicker.dispatch("change");
  assert.equal(h.legendLabels[0].textContent, "sovereign", "a theme without a registry entry falls back to role id");

  h.legendIcons[1].dataset.piece = "unlisted-role";
  h.SG.I18N.lang = "en";
  h.SG.__roleNameTest.refreshRoleNameLabels();
  assert.equal(h.legendLabels[1].textContent, "unlisted-role", "an unknown role falls back to its role id");

  h.SG.ROLE_NAMES.classic.sovereign = { zh: "中文备用名" };
  h.startPicker.value = "classic";
  h.startPicker.dispatch("change");
  h.SG.I18N.lang = "fr";
  h.SG.__roleNameTest.refreshRoleNameLabels();
  assert.equal(h.legendLabels[0].textContent, "中文备用名", "missing locale and English values fall back to the other available label");
});

test("captions use textContent for registry strings instead of interpreting markup", () => {
  const h = createHarness();
  const hostile = '<img src=x onerror="globalThis.compromised=true">';
  h.SG.ROLE_NAMES.classic.sovereign.en = hostile;
  const homeCaption = h.legendLabels[0];
  const homeHtmlWrites = homeCaption.innerHTMLWrites;
  h.SG.__roleNameTest.refreshRoleNameLabels();
  assert.equal(homeCaption.textContent, hostile);
  assert.equal(homeCaption.innerHTMLWrites, homeHtmlWrites);

  h.rebuildHelpList("en");
  h.helpScreen.classList.remove("hidden");
  h.SG.__roleNameTest.decorateHelpRoles();
  const helpCaption = h.getHelpList().querySelector(".role-name-label");
  assert.equal(helpCaption.textContent, hostile);
  assert.equal(helpCaption.innerHTMLWrites, 0, "generated Help captions must not parse registry markup");
});

test("Help decoration updates captions and keeps one icon/caption per role after repeat and rebuild", () => {
  const h = createHarness();
  h.helpScreen.classList.remove("hidden");
  h.SG.__roleNameTest.decorateHelpRoles();
  h.SG.__roleNameTest.decorateHelpRoles();
  const assertOneDecorationPerRole = () => {
    assert.equal(h.getHelpList().children.length, roles.length);
    for (const item of h.getHelpList().children) {
      assert.equal(item.querySelectorAll("canvas.role-icon").length, 1, "each role should have one icon");
      assert.equal(item.querySelectorAll(".role-name-label").length, 1, "each role should have one caption");
    }
  };
  assertOneDecorationPerRole();

  h.startPicker.value = "hyakki";
  h.startPicker.dispatch("change");
  h.SG.I18N.lang = "zh";
  h.window.dispatchEvent({ type: "sg:lang" });
  assertOneDecorationPerRole();
  roles.forEach((role, index) => {
    const label = h.getHelpList().children[index].querySelector(".role-name-label");
    assert.equal(label.textContent, h.SG.ROLE_NAMES.hyakki[role].zh);
  });

  h.rebuildHelpList("zh");
  h.SG.__roleNameTest.decorateHelpRoles();
  h.SG.__roleNameTest.decorateHelpRoles();
  assertOneDecorationPerRole();
  roles.forEach((role, index) => {
    assert.equal(
      h.getHelpList().children[index].querySelector(".role-name-label").textContent,
      h.SG.ROLE_NAMES.hyakki[role].zh,
    );
  });
});

test("Hyakki Sovereign and Reaper captions retain distinct light/dark identities", () => {
  const h = createHarness();
  h.startPicker.value = "hyakki";
  h.startPicker.dispatch("change");
  h.helpScreen.classList.remove("hidden");
  h.rebuildHelpList("en");
  h.SG.__roleNameTest.decorateHelpRoles();
  for (const language of ["zh", "en"]) {
    h.SG.I18N.lang = language;
    h.SG.__roleNameTest.refreshRoleNameLabels();
    const sovereign = h.SG.ROLE_NAMES.hyakki.sovereign[language];
    const reaper = h.SG.ROLE_NAMES.hyakki.reaper[language];
    assert.equal(h.legendLabels[0].textContent, sovereign);
    assert.equal(h.legendLabels[1].textContent, reaper);
    assert.equal(h.getHelpList().children[0].querySelector(".role-name-label").textContent, sovereign);
    assert.equal(h.getHelpList().children[1].querySelector(".role-name-label").textContent, reaper);
    assert.match(sovereign, /滑头鬼.*酒吞童子|Nurarihyon.*Shuten-Doji/);
    assert.match(reaper, /九尾妖狐.*杀戮鬼|Nine-Tailed Fox.*Slaughter Oni/);
    assert.notEqual(sovereign, reaper);
  }
});

test("home legend markup and styles provide caption wrappers, wrapping, and bidi isolation", () => {
  const legend = indexSource.match(/<div class="legend">([\s\S]*?)<\/div>\s*<p class="rules-note"/);
  assert.ok(legend, "expected the static start-screen legend");
  const items = [...legend[1].matchAll(/<div class="legend-item">([\s\S]*?)<\/div>/g)];
  assert.equal(items.length, roles.length);
  items.forEach((match, index) => {
    assert.match(match[1], /<span class="icon-caption">/);
    assert.match(match[1], new RegExp(`<canvas[^>]*data-piece="${roles[index]}"`));
    assert.match(match[1], /<span class="role-name-label"><\/span>/);
  });
  assert.ok(indexSource.indexOf('src="role-names.js') < indexSource.indexOf('src="game.js'),
    "the registry must load before game.js initializes captions");
  assert.match(styleSource, /\.role-name-label\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(styleSource, /\.role-name-label\s*\{[^}]*direction:\s* ltr;[^}]*unicode-bidi:\s* isolate/s);
  assert.doesNotMatch(styleSource, /\[dir="rtl"\]\s+\.icon-caption\s*\{[^}]*direction:\s*rtl/s);
});
