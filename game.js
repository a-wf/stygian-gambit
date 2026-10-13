(function () {
  "use strict";
  const SG = (window.SG = window.SG || {});

  /* ============================================================
   * CONSTANTS
   * ============================================================ */
  const TILE = 70;
  const BOARD_PX = TILE * 8;
  const DEATH_FX_MS = 950;      // longer, clearer death fade
  const STEP_MS = 850;          // gap between interleaved battle resolutions
  const CAPTURE_DELAY_MS = 650; // a lethal striker waits for the corpse to fade before seizing the tile
  const BATTLE_START_DELAY = 520;
  const AEGIS_START = 3;        // limited protection charges per side, per match
  const MAX_CMD = 3;           // up to three pieces commanded per round
  const CRYSTALS_PER_KILL = 10; // 3 kills = 30 crystals
  // Timed planning: each human planning turn gets this many seconds (start-screen choice, remembered).
  const PLAN_SECONDS_OPTIONS = [20, 60, 90];
  const PLAN_SECONDS_DEFAULT = 60;
  const PLAN_SECONDS_KEY = "sg.planSeconds";
  const PLAN_WARN_SECONDS = 10;  // final-stretch warning styling + one screen-reader announcement
  // Initiative auction: one sealed bid per side at the start of every round, before planning.
  const AUCTION_SECONDS = 10;    // each local human bidder's own short clock (never taken from the planning clock)
  const AUCTION_WARN_SECONDS = 3;
  const BID_STEP = 20;           // bids are multiples of 20◆ (the existing initiative rule)
  const SUMMON_OPTIONS = [
    { type: "skirmisher", cost: 20, label: "Skirmisher" },
    { type: "juggernaut", cost: 30, label: "Juggernaut" },
    { type: "wildrider",  cost: 30, label: "Wildrider" },
    { type: "trickster",  cost: 30, label: "Trickster" },
    { type: "harrower",   cost: 40, label: "Harrower" },
  ];

  // Trials of the Underworld — handcrafted scenarios on the same engine.
  const SCENARIOS = [
    { id: "first-blood", name: "First Blood", blurb: "A small clash to learn the plan→battle rhythm. Slay the enemy Sovereign.",
      humanSide: "dark", difficulty: "easy", persona: "balanced", furies: false, aegis: { light: 1, dark: 2 }, crystals: { light: 0, dark: 0 }, winCon: { type: "regicide" },
      pieces: [ { type:"sovereign", side:"light", row:0, col:4, lives:1 }, { type:"skirmisher", side:"light", row:1, col:3 }, { type:"skirmisher", side:"light", row:1, col:4 }, { type:"skirmisher", side:"light", row:1, col:5 }, { type:"juggernaut", side:"light", row:0, col:2 },
        { type:"sovereign", side:"dark", row:7, col:4 }, { type:"reaper", side:"dark", row:6, col:4 }, { type:"skirmisher", side:"dark", row:6, col:3 }, { type:"skirmisher", side:"dark", row:6, col:5 }, { type:"wildrider", side:"dark", row:7, col:2 } ] },
    { id: "cornered-king", name: "The Cornered King", blurb: "Their Sovereign is trapped in the corner. Break the guard and end it.",
      humanSide: "dark", difficulty: "hard", persona: "warden", furies: false, aegis: { light: 2, dark: 2 }, crystals: { light: 0, dark: 20 }, winCon: { type: "regicide" },
      pieces: [ { type:"sovereign", side:"light", row:0, col:7, lives:2 }, { type:"juggernaut", side:"light", row:0, col:6 }, { type:"trickster", side:"light", row:1, col:6 }, { type:"skirmisher", side:"light", row:1, col:7 },
        { type:"sovereign", side:"dark", row:7, col:0 }, { type:"reaper", side:"dark", row:3, col:5 }, { type:"juggernaut", side:"dark", row:3, col:7 }, { type:"wildrider", side:"dark", row:2, col:4 }, { type:"harrower", side:"dark", row:6, col:1 } ] },
    { id: "aegisless", name: "Aegisless", blurb: "No wards for anyone. Every blow is final — pure tactics.",
      humanSide: "dark", difficulty: "hard", persona: "butcher", furies: false, aegis: { light: 0, dark: 0 }, crystals: { light: 0, dark: 0 }, winCon: { type: "regicide" },
      pieces: [ { type:"sovereign", side:"light", row:0, col:4, lives:2 }, { type:"reaper", side:"light", row:1, col:4 }, { type:"juggernaut", side:"light", row:0, col:2 }, { type:"juggernaut", side:"light", row:0, col:6 }, { type:"skirmisher", side:"light", row:1, col:2 }, { type:"skirmisher", side:"light", row:1, col:6 },
        { type:"sovereign", side:"dark", row:7, col:4, lives:2 }, { type:"reaper", side:"dark", row:6, col:4 }, { type:"juggernaut", side:"dark", row:7, col:1 }, { type:"juggernaut", side:"dark", row:7, col:6 }, { type:"trickster", side:"dark", row:6, col:2 }, { type:"wildrider", side:"dark", row:6, col:6 } ] },
    { id: "furybound", name: "Furybound", blurb: "Survive 6 rounds as Furies stalk the board. Keep your Sovereign alive.",
      humanSide: "dark", difficulty: "normal", persona: "warden", furies: true, furyEvery: 2, aegis: { light: 2, dark: 3 }, crystals: { light: 0, dark: 0 }, winCon: { type: "survive", rounds: 6 },
      pieces: [ { type:"sovereign", side:"light", row:0, col:4, lives:3 }, { type:"reaper", side:"light", row:1, col:4 }, { type:"juggernaut", side:"light", row:0, col:0 }, { type:"juggernaut", side:"light", row:0, col:7 }, { type:"skirmisher", side:"light", row:1, col:2 }, { type:"skirmisher", side:"light", row:1, col:5 },
        { type:"sovereign", side:"dark", row:7, col:4, lives:3 }, { type:"reaper", side:"dark", row:6, col:4 }, { type:"juggernaut", side:"dark", row:7, col:1 }, { type:"wildrider", side:"dark", row:6, col:6 }, { type:"harrower", side:"dark", row:6, col:2 } ] },
    { id: "outnumbered", name: "Outnumbered", blurb: "A skeleton crew against a full house. Strike fast and true.",
      humanSide: "dark", difficulty: "unfair", persona: "swarm", furies: false, aegis: { light: 3, dark: 1 }, crystals: { light: 20, dark: 0 }, winCon: { type: "regicide" },
      pieces: [ { type:"sovereign", side:"light", row:0, col:4, lives:2 }, { type:"reaper", side:"light", row:0, col:3 }, { type:"juggernaut", side:"light", row:0, col:0 }, { type:"juggernaut", side:"light", row:0, col:7 }, { type:"trickster", side:"light", row:0, col:2 }, { type:"wildrider", side:"light", row:0, col:1 }, { type:"skirmisher", side:"light", row:1, col:3 }, { type:"skirmisher", side:"light", row:1, col:4 }, { type:"skirmisher", side:"light", row:1, col:5 },
        { type:"sovereign", side:"dark", row:7, col:4, lives:3 }, { type:"reaper", side:"dark", row:6, col:4 }, { type:"juggernaut", side:"dark", row:7, col:3 }, { type:"wildrider", side:"dark", row:6, col:5 } ] },
    { id: "regicide-rush", name: "Regicide Rush", blurb: "Their king marches with a single life. Punch through and behead the line.",
      humanSide: "dark", difficulty: "hard", persona: "butcher", furies: false, aegis: { light: 2, dark: 2 }, crystals: { light: 0, dark: 10 }, winCon: { type: "regicide" },
      pieces: [ { type:"sovereign", side:"light", row:2, col:4, lives:1 }, { type:"juggernaut", side:"light", row:1, col:3 }, { type:"juggernaut", side:"light", row:1, col:5 }, { type:"trickster", side:"light", row:1, col:2 }, { type:"trickster", side:"light", row:1, col:6 }, { type:"skirmisher", side:"light", row:3, col:4 },
        { type:"sovereign", side:"dark", row:7, col:4, lives:3 }, { type:"reaper", side:"dark", row:6, col:4 }, { type:"wildrider", side:"dark", row:6, col:2 }, { type:"wildrider", side:"dark", row:6, col:6 }, { type:"harrower", side:"dark", row:7, col:1 } ] },
  ];
  SG.SCENARIOS = SCENARIOS;

  // Boons of the Gods — drafted rule-modifiers, read at existing hooks.
  const BOONS = [
    { id: "charon", name: "Charon's Toll", desc: "+5 crystals per kill." },
    { id: "hermes", name: "Hermes' Haste", desc: "You always resolve first each round." },
    { id: "hecate", name: "Hecate's Ward", desc: "+1 Aegis charge each chamber." },
    { id: "ares", name: "Ares' Wrath", desc: "Your Reaping Spiral reaches 2 tiles." },
    { id: "nyx", name: "Nyx's Veil", desc: "Command a 4th piece each round." },
  ];
  SG.BOONS = BOONS;

  // Chambers of the Descent — an escalating roguelike run.
  const CHAMBERS = [
    { name: "Tartarus", difficulty: "normal", persona: "balanced", hazards: false },
    { name: "Asphodel", difficulty: "hard", persona: "swarm", hazards: false },
    { name: "Elysium", difficulty: "hard", persona: "warden", hazards: true },
    { name: "The Styx", difficulty: "unfair", persona: "butcher", hazards: true, boss: true },
  ];
  let runState = null;

  const KING_DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const ROOK_DIRS = [[-1,0],[1,0],[0,-1],[0,1]];
  const BISHOP_DIRS = [[-1,-1],[-1,1],[1,-1],[1,1]];
  const KNIGHT_OFFSETS = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
  const STRAIGHT_2 = [[-2,0],[2,0],[0,-2],[0,2]];

  // Lives = killing blows the piece can take before it truly dies.
  const PIECE_DEFS = {
    sovereign:  { label: "Sovereign", lives: 3, moveKind: "king", attackKind: "melee" },
    reaper:     { label: "Reaper", lives: 2, moveKind: "slide", moveDirs: KING_DIRS, moveSteps: 7, attackKind: "melee", strikeAoe: true },
    juggernaut: { label: "Juggernaut", lives: 1, moveKind: "slide", moveDirs: ROOK_DIRS, moveSteps: 7, attackKind: "ranged", attackDirs: ROOK_DIRS, attackRange: 7 },
    trickster:  { label: "Trickster", lives: 1, moveKind: "slide", moveDirs: BISHOP_DIRS, moveSteps: 7, attackKind: "ranged", attackDirs: BISHOP_DIRS, attackRange: 7 },
    wildrider:  { label: "Wildrider", lives: 1, moveKind: "leap", attackKind: "melee" },
    skirmisher: { label: "Skirmisher", lives: 1, moveKind: "pawn", attackKind: "pawnDiag" },
    harrower:   { label: "Harrower", lives: 1, moveKind: "tether", moveRange: 2, attackKind: "melee", strikeChain: true },
    fury:       { label: "Fury", lives: 1, moveKind: "king", attackKind: "melee" },
  };
  SG.PIECE_DEFS = PIECE_DEFS;
  const FURY_MAX = 3;

  /* ============================================================
   * STATE
   * ============================================================ */
  let state = null;
  let nextPieceId = 1;

  /* ---- Visual piece theme (themes.js registers SG.THEMES) ---- */
  const THEME_STORAGE_KEY = "stygian_theme";
  function readThemePreference() {
    try { return localStorage.getItem(THEME_STORAGE_KEY); } catch (e) { return null; } // storage blocked
  }
  function normalizeThemeId(id) {
    return id && SG.THEMES && Object.prototype.hasOwnProperty.call(SG.THEMES, id) ? id : "classic";
  }
  let activeThemeId = normalizeThemeId(readThemePreference());
  let onlineRoundSnap = null;   // identical round-start board both clients rewind to
  let onlineRoundIds = null;    // ids present at round start (summons this round can't be commanded)

  function newStats() { return { kills: 0, losses: 0, spirals: 0, aegisUsed: 0, aegisBroken: 0, summons: 0, bestCombo: 0 }; }
  function bumpStat(side, key, n) {
    if (state.isReplay) return;
    if (side !== "light" && side !== "dark") return;
    if (!state.stats || !state.stats[side]) return;
    state.stats[side][key] += (n || 1);
  }

  function freshState() {
    return {
      scene: "start",           // start | planning | handoff | battle | gameover
      mode: "hotseat",
      theme: activeThemeId,     // visual piece theme (cosmetic only)
      humanSide: "light",
      movesPerRound: 3,
      planSeconds: 0,           // configured per-turn planning clock (s); 0 = untimed (online, idle menus)
      planClock: null,          // the running clock of the current planning turn (see startPlanClock)
      auction: null,            // this round's initiative auction (sealed bids live here until revealed)
      auctionClock: null,       // the running 10 s clock of the current local bidder (see startAuctionClock)
      auctionDone: false,       // true once this round's bids are revealed into crystalBid (no re-auction)
      pieces: [],
      roundNumber: 0,
      firstSide: "light",       // resolves first this round (alternates)
      planningSide: "light",    // who is planning right now
      plan: { light: [], dark: [] },
      planLocked: { light: false, dark: false },
      aegis: { light: AEGIS_START, dark: AEGIS_START },
      crystals: { light: 0, dark: 0 },
      crystalBid: { light: 0, dark: 0 },
      wardMode: false,
      summonArmed: null,
      furiesEnabled: false,
      harrowerDragEnabled: false,
      furyCount: 0,
      pendingReaperStrike: null,
      selection: { pieceId: null, moveTiles: [], strikeTiles: [] },
      battle: null,             // { queue, index, stepAt }
      caption: "",
      handoffTo: null,
      particles: [], damageNumbers: [], slashes: [], projectiles: [], shockwaves: [],
      flash: 0, shake: 0,
      zoom: 0, zoomFocus: { x: BOARD_PX / 2, y: BOARD_PX / 2 },
      pendingBeat: 0,
      combo: { light: 0, dark: 0 },
      pendingMoves: [],
      showThreat: false,
      foresightOn: false,
      history: [], lastBattle: null,
      isReplay: false, replayReturn: null, replayReturnPlan: null,
      battleSpeed: 1,
      reduceMotion: false, colorGlyphs: false,
      difficulty: "normal", botPersona: "balanced",
      scenario: null,
      hazardsEnabled: false, terrain: null,
      boons: { light: {}, dark: {} },
      run: null,
      onlineWaiting: false, onlinePending: null,
      viewFlip: false,                  // render rotated 180° so this client's side sits at the bottom
      undoStack: [],                    // this planning turn's commands / summons / wards, newest last
      aegisMax: { light: AEGIS_START, dark: AEGIS_START },
      stats: { light: newStats(), dark: newStats() },
      eventLog: [],
      winnerSide: null,
      lastTs: 0,
    };
  }

  function makePiece(type, side, row, col, facing) {
    const defs = PIECE_DEFS[type];
    const c = cellCenter(row, col);
    return {
      id: nextPieceId++,
      type, side, facing,
      lives: defs.lives, maxLives: defs.lives,
      warded: false, wardRound: null,
      row, col, x: c.x, y: c.y,
      animState: "idle",
      tween: null, dashMeta: null, trail: [],
      lunge: null,
      hitFlashUntil: 0,
      alive: true, dyingUntil: 0,
      bobSeed: Math.random() * 1000,
      deathSpin: (Math.random() - 0.5) * 3.2,
      spawnPopUntil: 0,
    };
  }

  function buildScenarioPieces(sc) {
    const pieces = [];
    for (const d of sc.pieces) {
      const facing = d.side === "light" ? 1 : -1;
      const p = makePiece(d.type, d.side, d.row, d.col, facing);
      if (d.lives != null) p.lives = Math.min(d.lives, p.maxLives);
      if (d.warded && p.type !== "sovereign" && p.type !== "reaper") {
        p.warded = true;
        p.wardRound = 0;
      }
      pieces.push(p);
    }
    return pieces;
  }

  function buildStartingPieces() {
    const pieces = [];
    const backRank = ["juggernaut","wildrider","trickster","reaper","sovereign","trickster","wildrider","juggernaut"];
    function side(sideName, backRow, pawnRow, facing) {
      for (let col = 0; col < 8; col++) pieces.push(makePiece(backRank[col], sideName, backRow, col, facing));
      for (let col = 0; col < 8; col++) pieces.push(makePiece(col === 2 ? "harrower" : "skirmisher", sideName, pawnRow, col, facing));
    }
    side("light", 0, 1, 1);
    side("dark", 7, 6, -1);
    return pieces;
  }

  /* ---- Snapshots (durable state) — powers Replay + Redo/Revert ---- */
  function clonePieceDurable(p) {
    return { id: p.id, type: p.type, side: p.side, facing: p.facing, lives: p.lives, maxLives: p.maxLives, warded: p.warded, wardRound: p.wardRound, row: p.row, col: p.col, alive: p.alive };
  }
  function snapshotState() {
    return {
      pieces: state.pieces.map(clonePieceDurable),
      crystals: { light: state.crystals.light, dark: state.crystals.dark },
      crystalBid: { light: state.crystalBid.light, dark: state.crystalBid.dark },
      auctionDone: !!state.auctionDone,
      aegis: { light: state.aegis.light, dark: state.aegis.dark },
      furiesEnabled: state.furiesEnabled, furyCount: state.furyCount,
      roundNumber: state.roundNumber, firstSide: state.firstSide, planningSide: state.planningSide,
      humanSide: state.humanSide, mode: state.mode, movesPerRound: state.movesPerRound, nextPieceId: nextPieceId,
    };
  }
  function pieceFromDurable(d) {
    const c = cellCenter(d.row, d.col);
    return {
      id: d.id, type: d.type, side: d.side, facing: d.facing,
      lives: d.lives, maxLives: d.maxLives, warded: d.warded, wardRound: d.wardRound == null ? null : d.wardRound,
      row: d.row, col: d.col, x: c.x, y: c.y,
      animState: "idle", tween: null, dashMeta: null, trail: [],
      lunge: null, hitFlashUntil: 0, alive: d.alive, dyingUntil: 0,
      bobSeed: Math.random() * 1000, deathSpin: (Math.random() - 0.5) * 3.2, spawnPopUntil: 0,
    };
  }
  function loadSnapshotPieces(snap) {
    state.pieces = snap.pieces.map(pieceFromDurable);
    state.crystals = { light: snap.crystals.light, dark: snap.crystals.dark };
    state.crystalBid = snap.crystalBid ? { light: snap.crystalBid.light, dark: snap.crystalBid.dark } : { light: 0, dark: 0 };
    state.auctionDone = snap.auctionDone !== false;   // a restored round keeps its revealed bids (no re-auction)
    state.aegis = { light: snap.aegis.light, dark: snap.aegis.dark };
    state.furiesEnabled = snap.furiesEnabled; state.furyCount = snap.furyCount;
    state.roundNumber = snap.roundNumber; state.firstSide = snap.firstSide; state.planningSide = snap.planningSide;
    state.humanSide = snap.humanSide; state.mode = snap.mode;
    if (snap.movesPerRound != null) state.movesPerRound = snap.movesPerRound;
    nextPieceId = snap.nextPieceId;
    state.particles = []; state.slashes = []; state.projectiles = []; state.shockwaves = []; state.damageNumbers = [];
    state.flash = 0; state.shake = 0; state.zoom = 0; state.pendingBeat = 0;
    state.pendingMoves = [];
    state.battle = null;
  }

  function pieceById(id) { return state.pieces.find(p => p.id === id); }
  function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function cellCenter(row, col) { return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 }; }
  // Board-space → screen-space (the view is rotated 180° when this client plays the top side).
  function sx(x) { return state.viewFlip ? BOARD_PX - x : x; }
  function sy(y) { return state.viewFlip ? BOARD_PX - y : y; }
  function chebyshev(a, b) { return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col)); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  // i18n: every visible string goes through t(); dictionaries live in i18n/<lang>.js.
  function t(key, params) { return SG.I18N ? SG.I18N.t(key, params) : key; }
  function sideLabel(side) { return t(side === "light" ? "side.light" : side === "dark" ? "side.dark" : "side.neutral"); }
  function pieceName(type) { return t("piece." + type); }
  function otherSide(side) { return side === "light" ? "dark" : "light"; }
  function describePiece(p) { return t("who", { side: sideLabel(p.side), piece: pieceName(p.type) }); }
  function scenarioName(sc) {
    if (sc.fateCode) return t("fate.trialTitle", { code: sc.fateCode });
    const n = t("scenario." + sc.id + ".name");
    return sc.daily ? t("daily.name", { name: n }) : n;
  }
  function hexToRgba(hex, a) {
    const v = hex.replace("#", "");
    const r = parseInt(v.substring(0, 2), 16), g = parseInt(v.substring(2, 4), 16), b = parseInt(v.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  /* ---- Opt-in render diagnostics (developer only) ----
   * Off by default: while off, no extra timing calls are made and nothing is logged. Enable with the
   * query flag `?sgperf=1`, with localStorage "sg.perf" = "1" (persists across reloads), or by calling
   * `SG.perf.enable()` in the console. `SG.perf.report()` prints (console.table) and returns per-theme
   * frame statistics; each theme switch logs ONE summary line after the following frames were observed.
   * `SG.perf.reset()` clears the stats, `SG.perf.disable()` turns it off (pass `true` to also clear the
   * persisted flag). Segment times are main-thread time spent issuing canvas commands; GPU rasterisation
   * and compositing happen later and are only visible in the requestAnimationFrame interval figures. */
  const PERF_STORAGE_KEY = "sg.perf";
  const PERF_RING = 600;              // recent frame intervals kept per theme (for percentiles)
  const PERF_LONG_FRAME_MS = 25;      // RAF interval counted as a visible hitch (> 1.5 frames at 60 Hz)
  const PERF_SWITCH_FRAMES = 60;      // frames observed after a theme switch before its summary is logged
  const perf = {
    on: false, buckets: new Map(), lastFrameTs: null, switchRec: null, switches: [],
    iconMs: 0, iconSlices: 0, warmMs: 0, warmIcons: 0,
  };
  const perfSeg = { update: 0, render: 0, terrain: 0, pieces: 0, figures: 0, fx: 0, screen: 0 };
  function perfNow() {
    try {
      if (typeof performance !== "undefined" && performance && typeof performance.now === "function") return performance.now();
    } catch (e) { /* fall through */ }
    return Date.now();
  }
  function perfBucket(id) {
    let b = perf.buckets.get(id);
    if (!b) {
      b = { frames: 0, intervals: [], intervalSum: 0, intervalCount: 0, longFrames: 0, update: 0, render: 0, renderMax: 0,
            terrain: 0, pieces: 0, piecesMax: 0, figures: 0, fx: 0, screen: 0 };
      perf.buckets.set(id, b);
    }
    return b;
  }
  function perfPercentile(values, q) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  }
  const perfRound = v => Math.round(v * 100) / 100;
  function perfRecordFrame(ts, themeId) {
    const b = perfBucket(themeId);
    let interval = null;
    if (perf.lastFrameTs !== null) {
      const d = ts - perf.lastFrameTs;
      if (d > 0 && d < 1000) {      // ignore pauses (hidden tab, debugger)
        interval = d;
        b.intervals.push(d); if (b.intervals.length > PERF_RING) b.intervals.shift();
        b.intervalSum += d; b.intervalCount++;
        if (d > PERF_LONG_FRAME_MS) b.longFrames++;
      }
    }
    perf.lastFrameTs = ts;
    b.frames++;
    b.update += perfSeg.update; b.render += perfSeg.render; b.renderMax = Math.max(b.renderMax, perfSeg.render);
    b.terrain += perfSeg.terrain; b.pieces += perfSeg.pieces; b.piecesMax = Math.max(b.piecesMax, perfSeg.pieces);
    b.figures += perfSeg.figures; b.fx += perfSeg.fx; b.screen += perfSeg.screen;
    const s = perf.switchRec;
    if (s && s.to === themeId) {
      if (s.frames === 0) { s.firstFrameMs = perfNow() - s.at; s.firstRenderMs = perfSeg.render; s.firstInterval = interval; }
      s.frames++;
      if (interval !== null) { s.maxInterval = Math.max(s.maxInterval, interval); if (interval > PERF_LONG_FRAME_MS) s.longFrames++; }
      s.maxRender = Math.max(s.maxRender, perfSeg.render);
      if (s.frames >= PERF_SWITCH_FRAMES) perfFinishSwitch();
    }
    for (const k in perfSeg) perfSeg[k] = 0;
  }
  function perfFinishSwitch() {
    const s = perf.switchRec;
    if (!s) return;
    perf.switchRec = null;
    const summary = {
      from: s.from, to: s.to, handlerMs: perfRound(s.handlerMs),
      switchToFirstFrameMs: s.firstFrameMs === null ? null : perfRound(s.firstFrameMs),
      firstRenderMs: s.firstRenderMs === null ? null : perfRound(s.firstRenderMs),
      firstIntervalMs: s.firstInterval === null ? null : perfRound(s.firstInterval),
      framesObserved: s.frames, maxIntervalMs: perfRound(s.maxInterval), longFrames: s.longFrames, maxRenderMs: perfRound(s.maxRender),
      iconRepaintMs: perfRound(perf.iconMs - s.iconMs0), iconSlices: perf.iconSlices - s.iconSlices0,
    };
    perf.switches.push(summary); if (perf.switches.length > 20) perf.switches.shift();
    if (typeof console !== "undefined" && console.info) console.info("[Stygian Gambit perf] theme switch", JSON.stringify(summary));
  }
  function perfReport() {
    const rows = [];
    perf.buckets.forEach((b, id) => {
      const n = b.frames || 1;
      rows.push({
        theme: id, frames: b.frames,
        avgIntervalMs: perfRound(b.intervalCount ? b.intervalSum / b.intervalCount : 0),
        p95IntervalMs: perfRound(perfPercentile(b.intervals, 0.95)), maxIntervalMs: perfRound(b.intervals.length ? Math.max(...b.intervals) : 0),
        longFrames: b.longFrames,
        avgUpdateMs: perfRound(b.update / n), avgRenderMs: perfRound(b.render / n), maxRenderMs: perfRound(b.renderMax),
        avgTerrainMs: perfRound(b.terrain / n), avgPiecesMs: perfRound(b.pieces / n), maxPiecesMs: perfRound(b.piecesMax),
        avgFiguresPerFrame: perfRound(b.figures / n), avgFxMs: perfRound(b.fx / n), avgScreenMs: perfRound(b.screen / n),
      });
    });
    const result = { themes: rows, switches: perf.switches.slice(), iconRepaintMs: perfRound(perf.iconMs),
                     warmIcons: perf.warmIcons, warmMs: perfRound(perf.warmMs) };
    if (typeof console !== "undefined") {
      if (console.table) console.table(rows); else if (console.info) console.info(JSON.stringify(rows));
      if (console.info && result.switches.length) console.info("[Stygian Gambit perf] recent switches", JSON.stringify(result.switches));
    }
    return result;
  }
  function perfReset() {
    perf.buckets.clear(); perf.switches = []; perf.switchRec = null; perf.lastFrameTs = null;
    perf.iconMs = 0; perf.iconSlices = 0; perf.warmMs = 0; perf.warmIcons = 0;
    for (const k in perfSeg) perfSeg[k] = 0;
  }
  function perfEnable(persist) {
    if (persist) { try { localStorage.setItem(PERF_STORAGE_KEY, "1"); } catch (e) { /* storage blocked */ } }
    if (perf.on) return;
    perfReset();
    perf.on = true;
    if (typeof console !== "undefined" && console.info) console.info("[Stygian Gambit perf] diagnostics on — switch skins, then run SG.perf.report()");
  }
  function perfDisable(clearPersisted) {
    if (clearPersisted) { try { localStorage.removeItem(PERF_STORAGE_KEY); } catch (e) { /* storage blocked */ } }
    perf.on = false; perf.switchRec = null;
  }
  SG.perf = { enable: perfEnable, disable: perfDisable, reset: perfReset, report: perfReport };
  (function enablePerfFromFlags() {
    let flag = false;
    try { flag = typeof location !== "undefined" && /(?:^|[?&])sgperf=1(?:&|$)/.test(String(location.search || "")); } catch (e) { flag = false; }
    if (!flag) { try { flag = localStorage.getItem(PERF_STORAGE_KEY) === "1"; } catch (e) { flag = false; } }
    if (flag) perfEnable(false);
  })();

  /* ---- Local records (localStorage, guarded) ---- */
  function loadStore(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; } }
  function saveStore(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode / blocked */ } }
  function scoreFor(side) {
    const s = state.stats[side];
    return s.kills * 10 + s.spirals * 20 + s.summons * 5 + s.bestCombo * 15 + s.aegisBroken * 8;
  }

  function hasBoon(side, id) { return !!(state.boons && state.boons[side] && state.boons[side][id]); }
  function crystalsPerKill(side) { return CRYSTALS_PER_KILL + (hasBoon(side, "charon") ? 5 : 0); }
  function maxCmdFor(side) { const base = (state && state.movesPerRound != null) ? state.movesPerRound : MAX_CMD; return base + (hasBoon(side, "nyx") ? 1 : 0); }
  SG.hasBoon = hasBoon;

  function buildOccupancyGrid(pieces) {
    const grid = [];
    for (let r = 0; r < 8; r++) grid.push(new Array(8).fill(null));
    for (const p of pieces) if (p.alive) grid[p.row][p.col] = p;
    return grid;
  }
  SG.buildOccupancyGrid = buildOccupancyGrid;

  /* ---- Styx Hazards (living terrain): lava | chasm | font ---- */
  function terrainAt(r, c) { return state.terrain && inBounds(r, c) ? state.terrain[r][c] : null; }
  function terrainBlocks(r, c) { return terrainAt(r, c) === "chasm"; }
  SG.terrainAt = terrainAt;
  function genTerrain() {
    if (!state.hazardsEnabled) { state.terrain = null; return; }
    const t = []; for (let r = 0; r < 8; r++) t.push(new Array(8).fill(null));
    const grid = buildOccupancyGrid(state.pieces);
    const cells = [];
    for (let r = 2; r <= 5; r++) for (let c = 0; c < 8; c++) if (!grid[r][c]) cells.push([r, c]);
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const tmp = cells[i]; cells[i] = cells[j]; cells[j] = tmp; }
    for (const kind of ["lava", "lava", "chasm", "font"]) { const cell = cells.pop(); if (!cell) break; t[cell[0]][cell[1]] = kind; }
    state.terrain = t;
  }
  function applyTerrainOnLand(piece, ts) {
    const kind = terrainAt(piece.row, piece.col);
    if (!kind || !piece.alive) return;
    if (kind === "lava") environmentKill(piece, null, ts, t("fx.engulfed"));
    else if (kind === "font") {
      if (piece.maxLives > 1 && piece.lives < piece.maxLives && (piece.side === "light" || piece.side === "dark")) { piece.lives++; spawnDamageText(piece.x, piece.y - 6, t("fx.lifeGained"), "#c98bd1"); syncSidePanels(); }
      else if (piece.side === "light" || piece.side === "dark") { state.crystals[piece.side] += 5; spawnDamageText(piece.x, piece.y - 6, t("fx.crystals", { n: 5 }), "#8fd0ff"); syncSidePanels(); }
    }
  }
  SG.inBounds = inBounds;
  SG.chebyshev = chebyshev;

  /* ============================================================
   * MOVEMENT / ATTACK LEGALITY
   * ============================================================ */
  function slideMoveTiles(row, col, dirs, grid, maxSteps) {
    const tiles = [];
    for (const [dr, dc] of dirs) {
      for (let s = 1; s <= maxSteps; s++) {
        const r = row + dr * s, c = col + dc * s;
        if (!inBounds(r, c)) break;
        if (grid[r][c] || terrainBlocks(r, c)) break;   // pieces and chasms block; lava does not
        tiles.push({ row: r, col: c });
      }
    }
    return tiles;
  }
  function slideAttackTiles(row, col, side, dirs, grid, maxSteps) {
    const tiles = [];
    for (const [dr, dc] of dirs) {
      for (let s = 1; s <= maxSteps; s++) {
        const r = row + dr * s, c = col + dc * s;
        if (!inBounds(r, c)) break;
        if (terrainBlocks(r, c)) break;                 // a chasm blocks the line of strike
        const occ = grid[r][c];
        if (!occ) continue;
        if (occ.side !== side && occ.alive) tiles.push({ row: r, col: c });
        break;
      }
    }
    return tiles;
  }
  function leapMoveTiles(row, col, grid) {
    const tiles = [];
    for (const [dr, dc] of KNIGHT_OFFSETS) {
      const r = row + dr, c = col + dc;
      if (inBounds(r, c) && !grid[r][c] && !terrainBlocks(r, c)) tiles.push({ row: r, col: c });
    }
    for (const [dr, dc] of STRAIGHT_2) {
      const r = row + dr, c = col + dc;
      if (inBounds(r, c) && !grid[r][c] && !terrainBlocks(r, c)) tiles.push({ row: r, col: c });
    }
    return tiles;
  }
  function pawnMoveTiles(piece, grid) {
    const r = piece.row + piece.facing, c = piece.col;
    if (inBounds(r, c) && !grid[r][c] && !terrainBlocks(r, c)) return [{ row: r, col: c }];
    return [];
  }
  function pawnAttackTiles(piece, grid) {
    const r = piece.row + piece.facing, tiles = [];
    for (const dc of [-1, 1]) {
      const c = piece.col + dc;
      if (!inBounds(r, c)) continue;
      const occ = grid[r][c];
      if (occ && occ.side !== piece.side && occ.alive) tiles.push({ row: r, col: c });
    }
    return tiles;
  }
  function tetherMoveTiles(piece, grid) {
    const allies = state.pieces.filter(p => p.alive && p.side === piece.side && p.id !== piece.id);
    const seen = new Set(), tiles = [];
    for (const ally of allies) {
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = ally.row + dr, c = ally.col + dc;
        if (!inBounds(r, c)) continue;
        const key = r * 8 + c;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!grid[r][c] && !terrainBlocks(r, c)) tiles.push({ row: r, col: c });
      }
    }
    return tiles;
  }
  function getMoveTiles(piece, grid) {
    const defs = PIECE_DEFS[piece.type];
    switch (defs.moveKind) {
      case "king": return slideMoveTiles(piece.row, piece.col, KING_DIRS, grid, 1);
      case "slide": return slideMoveTiles(piece.row, piece.col, defs.moveDirs, grid, defs.moveSteps);
      case "leap": return leapMoveTiles(piece.row, piece.col, grid);
      case "pawn": return pawnMoveTiles(piece, grid);
      case "tether": return tetherMoveTiles(piece, grid);
      default: return [];
    }
  }
  function getAttackTiles(piece, grid) {
    const defs = PIECE_DEFS[piece.type];
    switch (defs.attackKind) {
      case "melee": return slideAttackTiles(piece.row, piece.col, piece.side, KING_DIRS, grid, 1);
      case "ranged": return slideAttackTiles(piece.row, piece.col, piece.side, defs.attackDirs, grid, defs.attackRange);
      case "pawnDiag": return pawnAttackTiles(piece, grid);
      default: return [];
    }
  }
  SG.getMoveTiles = getMoveTiles;
  SG.getAttackTiles = getAttackTiles;

  // Tiles a piece THREATENS (could strike from its current square), regardless of what stands there.
  function threatTiles(f, grid) {
    const defs = PIECE_DEFS[f.type], out = [];
    function line(dirs, range) {
      for (const [dr, dc] of dirs) for (let s = 1; s <= range; s++) {
        const r = f.row + dr * s, c = f.col + dc * s;
        if (!inBounds(r, c)) break;
        out.push({ row: r, col: c });
        if (grid[r][c]) break;
      }
    }
    if (defs.attackKind === "melee") line(KING_DIRS, 1);
    else if (defs.attackKind === "ranged") line(defs.attackDirs, defs.attackRange);
    else if (defs.attackKind === "pawnDiag") { const r = f.row + f.facing; for (const dc of [-1, 1]) { const c = f.col + dc; if (inBounds(r, c)) out.push({ row: r, col: c }); } }
    return out;
  }

  /* ============================================================
   * TWEEN / DASH (movement animation)
   * ============================================================ */
  function startDash(piece, row, col, ts, meta) {
    const dist = Math.max(Math.abs(row - piece.row), Math.abs(col - piece.col)) || 1;
    const durationMs = clamp(150 + (dist - 1) * 70, 150, 480);
    const fromX = piece.x, fromY = piece.y;
    piece.row = row; piece.col = col;
    const dest = cellCenter(row, col);
    piece.tween = { fromX, fromY, toX: dest.x, toY: dest.y, startTs: ts, durationMs };
    piece.animState = "dashing";
    piece.dashMeta = meta || { kind: "move" };
    if (meta && meta.kind === "tether") { spawnDissolve(fromX, fromY, piece.side); spawnConverge(dest.x, dest.y, piece.side); }
    else spawnDustPuff(fromX, fromY, piece.side, 4);

  }
  SG.startDash = startDash;

  function updateTweens(ts) {
    for (const p of state.pieces) {
      if (!p.tween) { if (p.trail && p.trail.length) p.trail.shift(); continue; }
      const t = (ts - p.tween.startTs) / p.tween.durationMs;
      if (t >= 1) {
        p.x = p.tween.toX; p.y = p.tween.toY;
        p.tween = null;
        p.animState = "idle";
        spawnDustPuff(p.x, p.y, p.side, 5);
      } else {
        const e = easeOutCubic(t);
        p.x = lerp(p.tween.fromX, p.tween.toX, e);
        p.y = lerp(p.tween.fromY, p.tween.toY, e);
        p.trail = p.trail || [];
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 6) p.trail.shift();
      }
    }
  }
  function updateLunges(ts) {
    for (const p of state.pieces) {
      if (p.lunge && p.lunge.hitTs != null && ts > p.lunge.hitTs + p.lunge.recoverMs) p.lunge = null;
    }
  }

  /* ============================================================
   * PLANNING PHASE
   * ============================================================ */
  function isPlanControllable(piece) {
    return piece && piece.alive && piece.side === state.planningSide;
  }
  function planFor(side) { return state.plan[side]; }
  function commandFor(side, pieceId) { return state.plan[side].find(c => c.pieceId === pieceId); }

  function selectPiece(piece) {
    const grid = buildOccupancyGrid(state.pieces);
    state.selection.pieceId = piece.id;
    state.selection.moveTiles = getMoveTiles(piece, grid);
    state.selection.strikeTiles = getAttackTiles(piece, grid);
  }
  function clearSelection() {
    state.selection.pieceId = null;
    state.selection.moveTiles = [];
    state.selection.strikeTiles = [];
  }

  function addPlanCommand(cmd) {
    const arr = state.plan[state.planningSide];
    const existingIdx = arr.findIndex(c => c.pieceId === cmd.pieceId);
    if (existingIdx >= 0) {
      state.undoStack.push({ type: "commandEdit", pieceId: cmd.pieceId, prev: arr[existingIdx] });
      arr[existingIdx] = cmd;
      return true;
    }
    const distinct = new Set(arr.map(c => c.pieceId)).size;
    const cap = maxCmdFor(state.planningSide);
    if (distinct >= cap) { setCaption(t("note.maxCmd", { n: cap })); return false; }
    arr.push(cmd);
    state.undoStack.push({ type: "command", pieceId: cmd.pieceId });
    return true;
  }

  function toggleWard(piece) {
    const side = state.planningSide;
    if (piece.side !== side) return;
    if (piece.type === "sovereign" || piece.type === "reaper") {
      setCaption(t("note.noRoyalWard"));
      return;
    }
    if (piece.warded) {
      if (piece.wardRound != null && piece.wardRound < state.roundNumber) {
        setCaption(t("note.shieldPermanent"));
        return;
      }
      piece.warded = false;
      piece.wardRound = null;
      state.aegis[side] = Math.min(state.aegisMax[side], state.aegis[side] + 1);  // never exceed the match's charges
      state.undoStack.push({ type: "unward", pieceId: piece.id });
      setCaption(t("note.unward", { who: describePiece(piece) }));
    } else if (state.aegis[side] > 0) {
      piece.warded = true; piece.wardRound = state.roundNumber; state.aegis[side]--;
      bumpStat(side, "aegisUsed");
      state.undoStack.push({ type: "ward", pieceId: piece.id });
      setCaption(t("note.ward", { who: describePiece(piece) }));
    } else setCaption(t("note.noAegis"));
    syncSidePanels();
  }

  // Undo the most recent planning action (command, summon or ward) for the side planning now.
  function undoLast() {
    const side = state.planningSide;
    const a = state.undoStack.pop();
    if (!a) { state.plan[side].pop(); return; }                    // legacy fallback
    if (a.type === "summon") {
      const p = pieceById(a.pieceId);
      if (p && p.warded) state.aegis[side] = Math.min(state.aegisMax[side], state.aegis[side] + 1);
      state.undoStack = state.undoStack.filter(e => e.pieceId !== a.pieceId);
      removeSummoned(a);
      setCaption(t("note.summonUndone", { refund: refundNote(a.cost, pruneStaleMoves(side)) }));
    } else if (a.type === "command") {
      state.plan[side] = state.plan[side].filter(c => c.pieceId !== a.pieceId);
    } else if (a.type === "commandEdit") {
      const i = state.plan[side].findIndex(c => c.pieceId === a.pieceId);
      if (i >= 0) state.plan[side][i] = a.prev;
    } else if (a.type === "ward") {
      const p = pieceById(a.pieceId);
      if (p && p.warded) { p.warded = false; p.wardRound = null; state.aegis[side] = Math.min(state.aegisMax[side], state.aegis[side] + 1); }
      if (state.stats[side]) state.stats[side].aegisUsed = Math.max(0, state.stats[side].aegisUsed - 1);
    } else if (a.type === "unward") {
      const p = pieceById(a.pieceId);
      if (p && !p.warded && state.aegis[side] > 0) { p.warded = true; p.wardRound = state.roundNumber; state.aegis[side]--; }
    }
  }

  // Per-turn UI leftovers that must never carry over to the next planner (hotseat secrecy, stale refunds).
  function resetTurnTransients() {
    state.planNote = null; state.planNoteUntil = 0;
    clearTimeout(planNoteTimer);
    closeChoice();
  }

  function onValidate() {
    if (state.scene !== "planning" || state.mode === "spectator") return;
    if (choiceOpen()) return;                       // a pending choice must be answered or cancelled first
    resetTurnTransients();
    if (state.mode === "online") {
      if (state.onlineWaiting) return;
      const side = state.humanSide;
      state.planLocked[side] = true;
      SG.Net.submitPlan(state.roundNumber, buildMyPacket());
      state.onlineWaiting = true;
      clearSelection();
      state.wardMode = false; state.summonArmed = null; state.pendingReaperStrike = null;
      updatePlanBar(); refreshBanner();
      return;
    }
    stopPlanClock();                                // the turn is sealed: a click and the expiry can never both submit
    const side = state.planningSide;
    state.planLocked[side] = true;
    clearSelection();
    state.wardMode = false;
    state.summonArmed = null;
    state.pendingReaperStrike = null;
    const ts = state.lastTs;
    if (state.mode === "bot") {
      // the human just planned their side; the bot plans the other side, then battle
      const botSide = otherSide(state.humanSide);
      applyAIPlan(botSide, state.difficulty);
      state.planLocked[botSide] = true;
      beginBattle(ts);
    } else if (side === "light") {
      state.handoffTo = "dark";
      showHandoff("dark");
    } else {
      beginBattle(ts);
    }
  }

  function showHandoff(nextSide) {
    resetTurnTransients();
    stopPlanClock();               // nobody's clock runs while the device changes hands
    state.scene = "handoff";
    dom.handoffTitle.textContent = t("handoff.title");
    dom.handoffText.textContent = t("handoff.text", { side: sideLabel(nextSide) });
    dom.btnHandoffReady.textContent = t("handoff.ready", { side: sideLabel(nextSide) });
    dom.handoffScreen.classList.remove("hidden");
    setPlanControlsVisible(false);
    refreshBanner();
  }
  function onHandoffReady() {
    if (state.mode === "spectator") return;  // bot-vs-bot never passes the device
    if (state.scene !== "handoff") return;   // a stray second "Ready" must not restart the next side's clock
    dom.handoffScreen.classList.add("hidden");
    state.planningSide = state.handoffTo;
    state.handoffTo = null;
    state.scene = "planning";
    state.undoStack = [];          // the next side's turn — the previous side's plan is locked in
    resetTurnTransients();
    state.wardMode = false;
    state.summonArmed = null;
    state.pendingReaperStrike = null;
    clearSelection();
    refreshBanner();
    updatePlanBar();
    startPlanClock();              // the second planner's own full turn starts only now, not on the pass screen
  }

  function beginPlanningPhase() {
    state.scene = "planning";
    state.plan = { light: [], dark: [] };
    state.planLocked = { light: false, dark: false };
    // vs bot / online: you control your own side. Hotseat: light first.
    state.planningSide = (state.mode === "bot" || state.mode === "online") ? state.humanSide : "light";
    state.onlineWaiting = false;
    state.undoStack = [];
    state.crystalBid = { light: 0, dark: 0 };
    state.auction = null;
    state.auctionDone = false;              // this round's sealed auction runs before anyone plans
    state.planNote = null; state.planNoteUntil = 0;
    state.wardMode = false;
    state.summonArmed = null;
    state.pendingReaperStrike = null;
    state.battle = null;
    // Hoarded Souls — interest on banked crystals (capped), a live save-vs-spend choice each round.
    for (const s of ["light", "dark"]) {
      const gain = Math.min(5, Math.floor(state.crystals[s] / 20));
      if (gain > 0) { state.crystals[s] += gain; logEvent(t("log.interest", { side: sideLabel(s), gain })); }
    }
    clearSelection();
    if (!state.isReplay) { state.history.push(snapshotState()); if (state.history.length > 14) state.history.shift(); }
    if (state.mode === "online") { onlineRoundSnap = snapshotState(); onlineRoundIds = new Set(state.pieces.filter(p => p.alive).map(p => p.id)); }
    // Spectator (bot vs bot): no auction dialog and no clocks — both bots plan (and bid) at once, then battle.
    if (state.mode === "spectator") { runSpectatorRound(); return; }
    // The initiative auction comes first; it enters the planning turn itself once the bids are revealed
    // (straight away when nobody can afford a bid). The planning clock starts only then, in full.
    beginAuction();
  }

  // Enters (or re-enters) the planning turn of the side in state.planningSide, with a fresh full clock.
  function enterPlanningTurn() {
    state.scene = "planning";
    refreshBanner();
    updatePlanBar();
    syncSidePanels();
    if (state.mode === "spectator") { runSpectatorRound(); return; }   // defensive: spectators never plan by hand
    startPlanClock();
  }

  // Bot vs bot: both sides are planned by the AI (bids included, as no auction ran) and the clash starts.
  function runSpectatorRound() {
    stopPlanClock();
    state.scene = "planning";
    refreshBanner();
    updatePlanBar();
    syncSidePanels();
    applyAIPlan("light", state.difficulty);
    applyAIPlan("dark", state.difficulty);
    state.planLocked = { light: true, dark: true };
    beginBattle(state.lastTs);
  }

  /* ============================================================
   * BATTLE PHASE
   * ============================================================ */
  // The existing initiative rules, in one place (used by the battle and by the auction reveal):
  // Hermes' Haste overrides the alternating order for the side that holds it; then a higher crystal bid
  // takes initiative and pays in full while the other bidder pays 70% of their pledge; equal non-zero
  // bids keep that order and both pay 70%; no bids keep it for free.
  function resolveInitiative(bids) {
    let fs = state.firstSide;
    if (hasBoon("light", "hermes") && !hasBoon("dark", "hermes")) fs = "light";
    else if (hasBoon("dark", "hermes") && !hasBoon("light", "hermes")) fs = "dark";
    const b = { light: (bids && bids.light) || 0, dark: (bids && bids.dark) || 0 };
    const pay = { light: 0, dark: 0 };
    let outcome = "none";
    if (b.light !== b.dark) {
      outcome = b.light > b.dark ? "light" : "dark";
      fs = outcome;
      const loser = otherSide(outcome);
      pay[outcome] = b[outcome];
      if (b[loser] > 0) pay[loser] = Math.round(b[loser] * 0.7);
    } else if (b.light > 0) {
      outcome = "tie";
      pay.light = pay.dark = Math.round(b.light * 0.7);
    }
    return { first: fs, outcome, bids: b, pay };
  }

  function beginBattle(ts) {
    // A Replay is a planning-turn tool: the planner's clock keeps running through it (see tickPlanClock).
    if (!state.isReplay) stopPlanClock();
    state.scene = "battle";
    state.combo = { light: 0, dark: 0 };
    state.pendingMoves = [];
    if (!state.isReplay) {
      state.lastBattle = { fromSnapshot: snapshotState(), plans: JSON.parse(JSON.stringify(state.plan)), firstSide: state.firstSide };
    }
    clearSelection();
    state.wardMode = false;
    state.summonArmed = null;
    state.pendingReaperStrike = null;
    setPlanControlsVisible(false);
    closeChoice();
    // Initiative: Hermes' Haste, then this round's (auction-sealed) crystal bids — see resolveInitiative.
    const ini = resolveInitiative(state.crystalBid);
    const fs = ini.first;
    for (const s of ["light", "dark"]) if (ini.pay[s] > 0) state.crystals[s] = Math.max(0, state.crystals[s] - ini.pay[s]);
    if (ini.outcome === "light" || ini.outcome === "dark") {
      const loser = otherSide(ini.outcome);
      logEvent(t("log.bidWon", { side: sideLabel(ini.outcome), bid: ini.bids[ini.outcome] }));
      if (ini.pay[loser] > 0) logEvent(t("log.bidLoser", { side: sideLabel(loser), paid: ini.pay[loser] }));
    } else if (ini.outcome === "tie") {
      logEvent(t("log.bidTie", { bid: ini.bids.light, side: sideLabel(fs), paid: ini.pay.light }));
    }
    syncSidePanels();
    const ss = otherSide(fs);
    const A = state.plan[fs], B = state.plan[ss];
    const queue = [];
    const bound = Math.max(maxCmdFor(fs), maxCmdFor(ss));
    for (let i = 0; i < bound; i++) {
      if (A[i]) queue.push({ side: fs, cmd: A[i] });
      if (B[i]) queue.push({ side: ss, cmd: B[i] });
    }
    // Furies act last, after both houses' commands.
    if (state.furiesEnabled) for (const f of state.pieces) if (f.alive && f.type === "fury") queue.push({ fury: f.id });
    state.battle = { queue, index: -1, stepAt: ts + BATTLE_START_DELAY };
    setCaption(t("cap.battleJoined", { side: sideLabel(fs) }));
    if (!queue.length) state.battle.stepAt = ts + 200; // both passed
  }

  // Deferred capture-moves (the striker advances onto the emptied tile after the death fade).
  function doCapture(m, ts) {
    const p = pieceById(m.pieceId);
    if (!p || !p.alive) return;
    const g = buildOccupancyGrid(state.pieces);
    if (!g[m.row][m.col]) { p.lunge = null; startDash(p, m.row, m.col, ts, { kind: "move" }); applyTerrainOnLand(p, ts); }
  }
  function processPendingMoves(ts) {
    if (!state.pendingMoves || !state.pendingMoves.length) return;
    const keep = [];
    for (const m of state.pendingMoves) { if (ts < m.at) keep.push(m); else doCapture(m, ts); }
    state.pendingMoves = keep;
  }
  function flushPendingMoves(ts) {
    if (!state.pendingMoves) return;
    for (const m of state.pendingMoves) doCapture(m, ts);
    state.pendingMoves = [];
  }

  function updateBattle(ts) {
    const b = state.battle;
    if (!b) return;
    if (ts < b.stepAt) return;
    b.index++;
    if (b.index >= b.queue.length) {
      state.battle = null;
      finishBattle(ts);
      return;
    }
    state.pendingBeat = 0;
    const step = b.queue[b.index];
    if (step.fury) resolveFury(pieceById(step.fury), ts);
    else resolveCommand(step.side, step.cmd, ts);
    // The whole tempo (base gap + the extra pause a kill earns) scales with the speed slider.
    b.stepAt = ts + (STEP_MS + (state.pendingBeat || 0)) / (state.battleSpeed || 1);
  }

  function resolveCommand(side, cmd, ts) {
    const piece = pieceById(cmd.pieceId);
    if (!piece || !piece.alive) {
      setCaption(t("cap.orderDies", { side: sideLabel(side) }));
      return;
    }
    if (cmd.kind === "move") resolveMove(piece, cmd, ts);
    else resolveStrike(piece, cmd, ts);
  }

  function linePathBeforeBlocker(piece, cmd, grid) {
    const dRow = cmd.row - piece.row, dCol = cmd.col - piece.col;
    const isLine = (dRow === 0 || dCol === 0 || Math.abs(dRow) === Math.abs(dCol)) && (dRow !== 0 || dCol !== 0);
    if (!isLine) return null;
    const steps = Math.max(Math.abs(dRow), Math.abs(dCol));
    const dr = Math.sign(dRow), dc = Math.sign(dCol);
    let lastFreeStep = 0, blocked = false;
    for (let s = 1; s <= steps; s++) {
      const r = piece.row + dr * s, c = piece.col + dc * s;
      if (!inBounds(r, c) || grid[r][c] || terrainBlocks(r, c)) {
        blocked = true;
        break;
      }
      lastFreeStep = s;
    }
    return blocked ? { lastFreeStep, dr, dc } : null;
  }

  function advanceToLastFreeStep(piece, cmd, grid, ts, captionKey) {
    const path = linePathBeforeBlocker(piece, cmd, grid);
    if (!path || path.lastFreeStep < 1) return false;
    const destR = piece.row + path.dr * path.lastFreeStep;
    const destC = piece.col + path.dc * path.lastFreeStep;
    piece.lunge = null;
    startDash(piece, destR, destC, ts, { kind: "move" });
    applyTerrainOnLand(piece, ts);
    state.shake = Math.min(6, state.shake + 1);
    const stop = cellCenter(destR, destC);
    spawnDustPuff(stop.x, stop.y, piece.side, 4);
    setCaption(t(captionKey, { who: describePiece(piece) }));
    return true;
  }

  function resolveMove(piece, cmd, ts) {
    const grid = buildOccupancyGrid(state.pieces);
    const legal = inBounds(cmd.row, cmd.col) && !grid[cmd.row][cmd.col] &&
      getMoveTiles(piece, grid).some(t => t.row === cmd.row && t.col === cmd.col);
    if (legal) {
      startDash(piece, cmd.row, cmd.col, ts, { kind: PIECE_DEFS[piece.type].moveKind === "tether" ? "tether" : "move" });
      setCaption(t("cap.advances", { who: describePiece(piece) }));
      applyTerrainOnLand(piece, ts);
    } else {
      if (!advanceToLastFreeStep(piece, cmd, grid, ts, "cap.advancesBlocked")) {
        state.shake = Math.min(6, state.shake + 2);
        spawnDustPuff(piece.x, piece.y, piece.side, 6);
        setCaption(t("cap.blocked", { who: describePiece(piece) }));
      }
    }
  }

  function resolveStrike(piece, cmd, ts) {
    const grid = buildOccupancyGrid(state.pieces);
    const defs = PIECE_DEFS[piece.type];

    // Reaping Spiral — the Reaper holds her ground and sweeps EVERY adjacent foe,
    // independent of the originally-marked target (which may have fled or already fallen).
    if (defs.strikeAoe && cmd.reaperMode !== "advance") {
      piece.lunge = { fromX: piece.x, fromY: piece.y, targetX: piece.x, targetY: piece.y - 2, startTs: ts, hitTs: ts, windupMs: 1, recoverMs: 300 };
      const radius = hasBoon(piece.side, "ares") ? 2 : 1;   // Ares' Wrath widens the sweep
      const foes = [];
      for (let dr = -radius; dr <= radius; dr++) for (let dc = -radius; dc <= radius; dc++) {
        if (!dr && !dc) continue;
        const r = piece.row + dr, c = piece.col + dc;
        if (!inBounds(r, c)) continue;
        const o = grid[r][c];
        if (o && o.alive && o.side !== piece.side) foes.push(o);
      }
      if (foes.length) {
        spawnShockwave(piece.x, piece.y, glyphColor(piece.side).glow, ts, { maxRadius: 62, durationMs: 440 });
        state.shake = Math.min(10, state.shake + 4);
        state.flash = Math.min(1, state.flash + 0.2);
        setCaption(t("cap.spiral", { who: describePiece(piece) }));
        bumpStat(piece.side, "spirals");
        for (const o of foes) {
          if (Math.random() < 0.5) {
            spawnSlash(piece, o, ts, "normal");
            spawnDamageText(o.x, o.y - 6, t("fx.dodged"), "#9a8fb0");

          } else {
            spawnSlash(piece, o, ts, "big");
            strikeKill(o, piece, ts);
          }
        }
      } else {
        setCaption(t("cap.spiralMiss", { who: describePiece(piece) }));
      }
      return;
    }

    // Single-target strike (Reaper "advance" + every other piece).
    const target = pieceById(cmd.targetId);
    const inRange = target && target.alive &&
      getAttackTiles(piece, grid).some(t => t.row === target.row && t.col === target.col);
    const aimX = target ? target.x : cellCenter(cmd.row, cmd.col).x;
    const aimY = target ? target.y : cellCenter(cmd.row, cmd.col).y;

    if (!inRange) {
      spawnSlash(piece, { x: aimX, y: aimY }, ts, "normal");
      spawnDamageText(aimX, aimY, t("fx.shadow"), "#9a8fb0");

      const advancesOnStrike = defs.attackKind === "melee" || defs.attackKind === "pawnDiag" ||
        (defs.strikeAoe && cmd.reaperMode === "advance");
      if (advancesOnStrike && inBounds(cmd.row, cmd.col) &&
          !grid[cmd.row][cmd.col] && !terrainBlocks(cmd.row, cmd.col)) {
        piece.lunge = null;
        startDash(piece, cmd.row, cmd.col, ts, { kind: "move" });
        applyTerrainOnLand(piece, ts);
        setCaption(t("cap.whiffAdvance", { who: describePiece(piece) }));
        return;
      }
      if (advancesOnStrike && advanceToLastFreeStep(piece, cmd, grid, ts, "cap.whiffAdvance")) return;
      piece.lunge = { fromX: piece.x, fromY: piece.y, targetX: aimX, targetY: aimY, startTs: ts, hitTs: ts, windupMs: 1, recoverMs: 260 };
      setCaption(t("cap.whiff", { who: describePiece(piece) }));
      return;
    }
    piece.lunge = { fromX: piece.x, fromY: piece.y, targetX: aimX, targetY: aimY, startTs: ts, hitTs: ts, windupMs: 1, recoverMs: 260 };

    const tRow = target.row, tCol = target.col;
    if (defs.attackKind === "ranged") spawnProjectile(piece, target, ts, true);
    else spawnSlash(piece, target, ts, "big");
    state.shake = Math.min(9, state.shake + 3);
    state.flash = Math.min(1, state.flash + 0.18);
    setCaption(t("cap.kill", { who: describePiece(piece) }));
    const outcome = strikeKill(target, piece, ts);

    // Gambit Shove — Juggernaut & Wildrider knock back a royal that SURVIVED on its lives.
    // A blow the Aegis absorbed carries no force, so a warded piece is never shoved.
    if ((piece.type === "juggernaut" || piece.type === "wildrider") && outcome === "wounded") {
      const dr = Math.sign(target.row - piece.row), dc = Math.sign(target.col - piece.col);
      const nr = target.row + dr, nc = target.col + dc;
      const g = buildOccupancyGrid(state.pieces);
      if ((dr || dc) && inBounds(nr, nc) && !g[nr][nc] && terrainAt(nr, nc) !== "chasm") {
        startDash(target, nr, nc, ts, { kind: "move" });
        if (terrainAt(nr, nc) === "lava") environmentKill(target, piece.side, ts, t("fx.shovedLava"));
        else spawnDamageText(target.x, target.y - 6, t("fx.shoved"), "#c7bcd4");
      }
    }

    // Harrower drags down a foe beside the victim.
    if (defs.strikeChain && state.harrowerDragEnabled && !target.alive) {
      const g2 = buildOccupancyGrid(state.pieces);
      for (const [dr, dc] of ROOK_DIRS) {
        const r = tRow + dr, c = tCol + dc;
        if (!inBounds(r, c)) continue;
        const o = g2[r][c];
        if (o && o.alive && o.side !== piece.side) { spawnSlash(piece, o, ts, "arc"); strikeKill(o, piece, ts); break; }
      }
    }
    // On a lethal kill, seize the emptied square — but only AFTER the corpse has faded,
    // so the eye sees the victim die first, then the killer advances onto the tile.
    if (!target.alive && piece.alive) {
      state.pendingMoves.push({ pieceId: piece.id, row: tRow, col: tCol, at: ts + CAPTURE_DELAY_MS / (state.battleSpeed || 1) });
    }
  }

  // Returns "blocked" (Aegis absorbed it), "wounded" (royal lost a life) or "killed".
  function strikeKill(target, attacker, ts) {
    if (!target.alive) return null;
    if (target.warded) {
      target.warded = false;
      target.wardRound = null;
      target.hitFlashUntil = ts + 240;
      spawnShockwave(target.x, target.y, "#e8c657", ts, { maxRadius: 54, durationMs: 440 });
      spawnBurstParticles(target.x, target.y, "neutral", 16);
      state.flash = Math.min(1, state.flash + 0.25);
      state.shake = Math.min(8, state.shake + 3);
      state.pendingBeat = Math.max(state.pendingBeat || 0, 120);
      spawnDamageText(target.x, target.y - 6, t("fx.aegis"), "#e8c657");
      bumpStat(target.side, "aegisBroken");

      logEvent(t("log.aegisBlock", { who: describePiece(target) }));
      syncSidePanels();
      return "blocked";
    }
    target.lives -= 1;
    target.hitFlashUntil = ts + 200;
    spawnHitParticles(target.x, target.y, attacker ? attacker.side : null);
    let outcome = "wounded";
    if (target.lives <= 0) {
      killPiece(target, attacker ? attacker.side : null, ts);
      outcome = "killed";
    } else {
      spawnShockwave(target.x, target.y, glyphColor(target.side).glow, ts, { maxRadius: 46, durationMs: 380 });
      state.shake = Math.min(9, state.shake + 3);
      state.pendingBeat = Math.max(state.pendingBeat || 0, 120);
      triggerZoom(target.x, target.y, 0.06);
      spawnDamageText(target.x, target.y - 6, t("fx.lifeLost"), "#c98bd1");

      logEvent(t(target.lives === 1 ? "log.reels1" : "log.reelsN", { who: describePiece(target), n: target.lives }));
    }
    syncSidePanels();
    return outcome;
  }

  // Lethal hazards (lava) go through the Aegis too: one charge holds back one lethal event.
  function environmentKill(piece, killerSide, ts, label) {
    if (!piece.alive) return false;
    if (piece.warded) {
      piece.warded = false;
      piece.wardRound = null;
      piece.hitFlashUntil = ts + 240;
      spawnShockwave(piece.x, piece.y, "#e8c657", ts, { maxRadius: 54, durationMs: 440 });
      spawnDamageText(piece.x, piece.y - 6, t("fx.aegis"), "#e8c657");
      bumpStat(piece.side, "aegisBroken");

      logEvent(t("log.aegisAbyss", { who: describePiece(piece) }));
      syncSidePanels();
      return false;
    }
    spawnDamageText(piece.x, piece.y - 6, label, "#ff7a3a");
    killPiece(piece, killerSide, ts);
    return true;
  }

  function killPiece(target, killerSide, ts) {
    target.alive = false;
    target.animState = "dying";
    target.dyingUntil = ts + DEATH_FX_MS;
    const royal = target.maxLives > 1 || target.type === "sovereign";
    spawnDeathParticles(target.x, target.y, target.side);
    spawnSoulParticles(target.x, target.y, target.side);
    spawnShockwave(target.x, target.y, glyphColor(target.side).glow, ts, { maxRadius: royal ? 60 : 44, durationMs: royal ? 460 : 400 });
    state.shake = Math.min(royal ? 14 : 11, state.shake + (royal ? 7 : 4.5));
    state.flash = Math.min(1, state.flash + (royal ? 0.34 : 0.2));
    state.pendingBeat = Math.max(state.pendingBeat || 0, royal ? 300 : 140);
    triggerZoom(target.x, target.y, royal ? 0.16 : 0.07);
    spawnDamageText(target.x, target.y - 8, t("fx.slain"), "#ff6a6a");

    logEvent(killerSide ? t("log.slainBy", { who: describePiece(target), side: sideLabel(killerSide) }) : t("log.slain", { who: describePiece(target) }));
    bumpStat(killerSide, "kills");
    bumpStat(target.side, "losses");
    if (killerSide === "light" || killerSide === "dark") {
      const gain = crystalsPerKill(killerSide);
      state.crystals[killerSide] += gain;
      spawnDamageText(target.x + 18, target.y + 12, t("fx.crystals", { n: gain }), "#8fd0ff");
      state.combo[killerSide] = (state.combo[killerSide] || 0) + 1;
      const chain = state.combo[killerSide];
      if (!state.isReplay) state.stats[killerSide].bestCombo = Math.max(state.stats[killerSide].bestCombo, chain);
      if (chain >= 2) {
        const bonus = 5 * (chain - 1);
        state.crystals[killerSide] += bonus;
        spawnDamageText(BOARD_PX / 2, BOARD_PX * 0.26, t("fx.souls", { n: chain, bonus }), "#e8c657", true);
        state.shake = Math.min(15, state.shake + chain);
        state.flash = Math.min(1, state.flash + 0.04 * chain);

      }
      syncSidePanels();
    }
    if (target.type === "fury") state.furyCount = Math.max(0, state.furyCount - 1);
  }

  function finishBattle(ts) {
    flushPendingMoves(ts);   // ensure every capture-move has resolved before the round closes
    if (state.isReplay) {
      state.isReplay = false;
      loadSnapshotPieces(state.replayReturn);
      state.plan = state.replayReturnPlan || { light: [], dark: [] };
      state.replayReturn = null; state.replayReturnPlan = null;
      state.scene = "planning";
      clearSelection();
      setCaption("");
      refreshBanner(); updatePlanBar(); syncSidePanels();
      // An online round that completed while we were replaying can resolve now.
      const pend = state.onlinePending;
      if (state.mode === "online" && pend && pend.round === state.roundNumber) { state.onlinePending = null; resolveOnlineRound(pend.plans); }
      return;
    }
    const lightKing = state.pieces.find(p => p.type === "sovereign" && p.side === "light" && p.alive);
    const darkKing = state.pieces.find(p => p.type === "sovereign" && p.side === "dark" && p.alive);
    if (!lightKing || !darkKing) {
      const winner = (!lightKing && !darkKing) ? null : (lightKing ? "light" : "dark");
      endMatch(winner, ts);
      return;
    }
    state.roundNumber++;
    state.firstSide = otherSide(state.firstSide);
    // Scenario objective: survive N rounds.
    if (state.scenario && state.scenario.winCon && state.scenario.winCon.type === "survive" && state.roundNumber >= state.scenario.winCon.rounds) {
      endMatch(state.humanSide, ts);
      return;
    }
    const furyEvery = (state.scenario && state.scenario.furyEvery) || 6;
    if (state.furiesEnabled && state.roundNumber % furyEvery === 0 && state.furyCount < FURY_MAX) spawnFury(ts);
    if (state.hazardsEnabled && state.roundNumber % 3 === 0) { genTerrain(); logEvent(t("log.hazardShift")); }
    beginPlanningPhase();
  }

  function endMatch(winnerSide, ts) {
    stopPlanClock();
    hideAuctionUI();
    if (state.run && state.run.active) { handleRunEnd(winnerSide, ts); return; }
    state.scene = "gameover";
    state.winnerSide = winnerSide || null;
    const won = state.mode === "bot" ? (winnerSide === state.humanSide) : !!winnerSide;

    if (state.scenario) {
      // Trial / Daily outcome — separate progression, not the standard-duel record.
      state.trialResult = { id: state.scenario.id, won, rounds: state.roundNumber + 1, daily: !!state.scenario.daily };
      if (won && !state.scenario.daily && !state.scenario.fateCode) { const t = loadStore("sg.trials", {}); t[state.scenario.id] = true; saveStore("sg.trials", t); }
      if (state.scenario.daily) recordDaily(won);
      state.lastRecord = null;
    } else if (state.mode === "spectator") {
      state.lastRecord = null;
    } else {
      const perspective = state.mode === "bot" ? state.humanSide : (winnerSide || "light");
      const score = scoreFor(perspective);
      const rec = loadStore("sg.records", {});
      const slot = rec[state.mode] || { bestScore: 0, wins: 0, plays: 0, fastest: null };
      slot.plays += 1;
      if (won) slot.wins += 1;
      if (score > slot.bestScore) slot.bestScore = score;
      if (won && (slot.fastest == null || state.roundNumber + 1 < slot.fastest)) slot.fastest = state.roundNumber + 1;
      rec[state.mode] = slot;
      saveStore("sg.records", rec);
      state.lastRecord = slot;
    }

    showGameOver();
  }

  /* ---- Chambers of the Descent (roguelike run) ---- */
  function newRun() { return { active: true, chamber: 0, boons: {}, botBoons: {}, carriedCrystals: 0 }; }
  function startDescent() {  runState = newRun(); startChamber(); }
  function startChamber() {
    const cfg = CHAMBERS[runState.chamber];
    startMatch("bot", "dark", cfg.hazards, { run: runState, difficulty: cfg.difficulty, persona: cfg.persona, hazards: cfg.hazards });
    logEvent(t(cfg.boss ? "log.chamberBoss" : "log.chamber", { n: runState.chamber + 1, total: CHAMBERS.length, name: t("chamber." + runState.chamber) }));
  }
  function grantBotBoon(run) {
    const owned = run.botBoons || (run.botBoons = {});
    const pool = BOONS.filter(b => !owned[b.id]);
    if (pool.length) owned[pool[Math.floor(Math.random() * pool.length)].id] = true;
  }
  function handleRunEnd(winnerSide, ts) {
    const won = winnerSide === state.humanSide;
    const run = state.run;
    if (won) {
      run.carriedCrystals = state.crystals[state.humanSide];
      run.chamber++;
      if (run.chamber >= CHAMBERS.length) {
        run.active = false; awardObols(true, run.chamber);
        state.scene = "gameover"; state.winnerSide = state.humanSide; state.runOutcome = "victory";
         showGameOver();
      } else {
        grantBotBoon(run);
        openBoonDraft(run);
      }
    } else {
      run.active = false; awardObols(false, run.chamber);
      state.scene = "gameover"; state.winnerSide = winnerSide; state.runOutcome = "defeat";
       showGameOver();
    }
  }
  function openBoonDraft(run) {
    if (!dom.boonScreen || !dom.boonList) { startChamber(); return; }
    const pool = BOONS.filter(b => !run.boons[b.id]);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    const offer = pool.slice(0, 3);
    dom.boonList.innerHTML = "";
    if (!offer.length) { startChamber(); return; }
    offer.forEach(b => {
      const card = document.createElement("button");
      card.className = "trial-card btn btn-ghost";
      card.innerHTML = `<span class="trial-name">${t("boon." + b.id + ".name")}</span><span class="trial-blurb">${t("boon." + b.id + ".desc")}</span>`;
      card.addEventListener("click", () => { run.boons[b.id] = true; dom.boonScreen.classList.add("hidden"); startChamber(); });
      dom.boonList.appendChild(card);
    });
    dom.hud.classList.add("hidden");
    if (dom.boonTitle) dom.boonTitle.textContent = t("boon.titleRun", { n: run.chamber, total: CHAMBERS.length });
    dom.boonScreen.classList.remove("hidden");
  }

  /* ---- Mirror of Night (persistent meta-progression) ---- */
  function applyMirrorUpgrades(side) {
    const m = loadStore("sg.mirror", {});
    if (m.aegisLv) state.aegis[side] += m.aegisLv;
    if (m.crystalLv) state.crystals[side] += m.crystalLv * 5;
  }
  function awardObols(won, chambersCleared) {
    const m = loadStore("sg.mirror", { obols: 0 });
    m.obols = (m.obols || 0) + chambersCleared * 3 + (won ? 12 : 0);
    saveStore("sg.mirror", m);
    state.obolsEarned = chambersCleared * 3 + (won ? 12 : 0);
  }

  /* ---- Online Duel (Firebase-synced, deterministic peer resolution) ---- */
  function startOnlineMatch(config, mySide) {
    state = freshState();
    nextPieceId = 1;
    state.mode = "online";
    state.humanSide = mySide;
    // Online duels stay untimed: the room only relays plans (no server clock), so a per-client
    // countdown could neither be enforced nor agreed on. The start screen says so.
    state.planSeconds = 0;
    state.furiesEnabled = !!config.furies;
    state.harrowerDragEnabled = !!config.harrowerDrag;
    state.hazardsEnabled = false;                 // terrain RNG would desync clients
    state.terrain = null;
    const o = loadStore("sg.options", {});
    state.reduceMotion = o.reduceMotion || false;
    state.battleSpeed = o.battleSpeed || 1;
    state.colorGlyphs = o.colorGlyphs || false;
    state.firstSide = config.firstSide || "light";
    state.viewFlip = mySide === "light";           // each player sees their own army at the bottom
    state.aegisMax = { light: state.aegis.light, dark: state.aegis.dark };
    state.pieces = buildStartingPieces();
    state.lastTs = performance.now();
    dom.eventLog.innerHTML = "";
    logEvent(t("log.online", { side: sideLabel(mySide) }));
    if (state.furiesEnabled) { spawnFury(state.lastTs); logEvent(t("log.furiesOnline")); }
    if (dom.onlineScreen) dom.onlineScreen.classList.add("hidden");
    dom.startScreen.classList.add("hidden");
    dom.gameOverScreen.classList.add("hidden");
    dom.handoffScreen.classList.add("hidden");
    hideAuctionUI();
    dom.hud.classList.remove("hidden");
    beginPlanningPhase();
    syncSidePanels();
  }
  function buildMyPacket() {
    const side = state.humanSide;
    const startIds = onlineRoundIds || new Set();
    // Summons carry their ward flag; `wards` is the COMPLETE set of shielded round-start pieces
    // (so a withdrawn ward is honoured too) and `aegis` is the charges left — both authoritative for this side.
    const summons = state.pieces.filter(p => p.alive && p.side === side && !startIds.has(p.id)).map(p => ({ type: p.type, row: p.row, col: p.col, warded: !!p.warded }));
    const wards = state.pieces.filter(p => p.alive && p.side === side && p.warded && startIds.has(p.id)).map(p => p.id);
    const commands = (state.plan[side] || []).map(c => ({ pieceId: c.pieceId, kind: c.kind, row: c.row, col: c.col, targetId: c.targetId, reaperMode: c.reaperMode }));
    return { commands, wards, summons, aegis: state.aegis[side], bid: (state.crystalBid && state.crystalBid[side]) || 0 };
  }
  function applyOnlinePacket(side, packet) {
    if (!packet) return;
    const wardSet = new Set(packet.wards || []);
    for (const p of state.pieces) {
      if (!p.alive || p.side !== side) continue;
      const warded = p.type !== "sovereign" && p.type !== "reaper" && wardSet.has(p.id);
      if (warded && !p.warded) p.wardRound = state.roundNumber;
      if (!warded) p.wardRound = null;
      p.warded = warded;
    }
    for (const s of (packet.summons || [])) {
      const sp = summonPiece(side, s.type, s.row, s.col);
      if (sp && s.warded) { sp.warded = true; sp.wardRound = state.roundNumber; }
    }
    if (typeof packet.aegis === "number") state.aegis[side] = clamp(packet.aegis, 0, state.aegisMax[side]);
    // Bids are sealed in the pre-planning auction; a plan packet can never change them afterwards.
    if (packet.bid != null && !state.auctionDone) state.crystalBid[side] = packet.bid || 0;
  }
  function resolveOnlineRound(plans) {
    if (state.mode !== "online" || !onlineRoundSnap) return;
    loadSnapshotPieces(onlineRoundSnap);                 // rewind both clients to the identical board
    applyOnlinePacket("light", plans.light);             // deterministic order: light then dark
    applyOnlinePacket("dark", plans.dark);
    state.plan.light = (plans.light && plans.light.commands) || [];
    state.plan.dark = (plans.dark && plans.dark.commands) || [];
    state.onlineWaiting = false;
    beginBattle(state.lastTs);
  }
  function onlineOpponentLeft() {
    if (state.mode !== "online") return;
    closeChoice();
    hideAuctionUI();
    state.auction = null;
    state.onlineWaiting = false;
    if (dom.onlineStatus) dom.onlineStatus.innerHTML = t("online.left");
    if (dom.onlineSetup) dom.onlineSetup.classList.remove("hidden");
    dom.hud.classList.add("hidden");
    if (dom.onlineScreen) dom.onlineScreen.classList.remove("hidden");
  }

  /* ---- Trials + Daily Gambit launchers ---- */
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function canonicalizeFateCode(code) {
    if (typeof code !== "string") return null;
    const trimmed = code.trim();
    return /^SG1-[A-Z0-9]{1,12}$/i.test(trimmed) ? trimmed.toUpperCase() : null;
  }
  function buildFateScenario(code) {
    const canonical = canonicalizeFateCode(code);
    if (!canonical) return null;
    let hash = 2166136261;
    for (let i = 0; i < canonical.length; i++) hash = Math.imul(hash ^ canonical.charCodeAt(i), 16777619);
    const rng = mulberry32(hash >>> 0);
    const sources = SCENARIOS.filter(sc => sc.winCon && sc.winCon.type === "regicide");
    if (!sources.length) return null;
    const source = sources[Math.floor(rng() * sources.length)];
    const scenario = Object.assign({}, source, {
      aegis: Object.assign({}, source.aegis),
      crystals: Object.assign({}, source.crystals),
      winCon: Object.assign({}, source.winCon),
      pieces: source.pieces.map(piece => Object.assign({}, piece)),
    });
    if (rng() < 0.5) scenario.pieces.forEach(piece => { piece.col = 7 - piece.col; });
    const mutableRoles = scenario.pieces.filter(piece => piece.type !== "sovereign" && piece.type !== "reaper");
    const roles = ["juggernaut", "trickster", "wildrider", "skirmisher", "harrower"];
    const swaps = Math.floor(rng() * 3);
    for (let i = 0; i < swaps && mutableRoles.length; i++) {
      const piece = mutableRoles[Math.floor(rng() * mutableRoles.length)];
      const alternatives = roles.filter(role => role !== piece.type);
      piece.type = alternatives[Math.floor(rng() * alternatives.length)];
    }
    scenario.aegis = { light: Math.floor(rng() * 3), dark: Math.floor(rng() * 3) };
    scenario.crystals = { light: Math.floor(rng() * 3) * 10, dark: Math.floor(rng() * 3) * 10 };
    scenario.fateCode = canonical;
    scenario.furies = false;
    scenario.hazards = false;
    scenario.movesPerRound = 3;
    scenario.harrowerDrag = true;
    delete scenario.furyEvery;

    const occupied = new Set();
    for (const piece of scenario.pieces) {
      const cell = piece.row + "," + piece.col;
      if (piece.row < 0 || piece.row > 7 || piece.col < 0 || piece.col > 7 || occupied.has(cell)) return null;
      occupied.add(cell);
    }
    if (!scenario.pieces.some(piece => piece.type === "sovereign" && piece.side === "light")
      || !scenario.pieces.some(piece => piece.type === "sovereign" && piece.side === "dark")) return null;
    return scenario;
  }
  function generateFateCode() {
    return "SG1-" + Math.random().toString(36).slice(2, 10).padEnd(8, "0").toUpperCase();
  }
  SG.FateSeeds = Object.freeze({
    canonicalizeCode: canonicalizeFateCode,
    buildFateScenario,
    generateCode: generateFateCode,
  });
  function startTrial(scenario) {
    const fate = !!scenario.fateCode;
    startMatch("bot", scenario.humanSide, fate ? false : scenario.furies, {
      scenario,
      ...(fate ? { movesPerRound: 3, harrowerDrag: true, hazards: false } : {}),
    });
  }
  function dailySeed() { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function dailyKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  function startDaily() {
    const rng = mulberry32(dailySeed());
    const base = SCENARIOS[Math.floor(rng() * SCENARIOS.length)];
    const mods = ["extra-furies", "bonus-crystals", "prewarded"];
    const mod = mods[Math.floor(rng() * mods.length)];
    const sc = JSON.parse(JSON.stringify(base));
    sc.daily = true; sc.dailyMod = mod;
    if (mod === "extra-furies") { sc.furies = true; sc.furyEvery = 3; }
    if (mod === "bonus-crystals") { sc.crystals = { light: (sc.crystals && sc.crystals.light) || 0, dark: ((sc.crystals && sc.crystals.dark) || 0) + 20 }; }
    if (mod === "prewarded") {
      const protectedPiece = sc.pieces.find(p => p.side !== sc.humanSide && p.type !== "sovereign" && p.type !== "reaper");
      if (protectedPiece) protectedPiece.warded = true;
    }

    startMatch("bot", sc.humanSide, sc.furies, { scenario: sc });
  }
  function recordDaily(won) {
    const key = dailyKey();
    const d = loadStore("sg.daily", { date: null, streak: 0, best: 0 });
    if (d.date === key) return;         // one counted attempt per day
    d.date = key;
    d.streak = won ? (d.streak || 0) + 1 : 0;
    d.best = Math.max(d.best || 0, d.streak);
    d.lastWon = won; d.lastRounds = state.roundNumber + 1;
    saveStore("sg.daily", d);
    const rds = state.roundNumber + 1;
    const result = won ? t(rds === 1 ? "daily.cleared1" : "daily.clearedN", { n: rds }) : t("daily.fell");
    state.dailyShare = t("daily.share", { date: key.slice(5), result, streak: d.streak });
  }

  /* ============================================================
   * AI PLAN APPLICATION
   * ============================================================ */
  function applyAIPlan(side, diff) {
    let plan = { commands: [], wards: [], bid: 0 };
    if (window.SG.AI && window.SG.AI.planTurn) plan = window.SG.AI.planTurn(side, diff) || plan;
    state.plan[side] = plan.commands.slice(0, maxCmdFor(side));
    if (!state.auctionDone) state.crystalBid[side] = plan.bid || 0;   // normally sealed earlier, in the auction
    for (const id of plan.wards) {
      const p = pieceById(id);
      if (p && p.alive && p.side === side && p.type !== "sovereign" && p.type !== "reaper" && !p.warded && state.aegis[side] > 0) {
        p.warded = true;
        p.wardRound = state.roundNumber;
        state.aegis[side]--;
      }
    }
    aiSummon(side);
    syncSidePanels();
  }

  function aiSummon(side) {
    const persona = state.botPersona || "balanced";
    const spendable = () => state.crystals[side] - ((state.crystalBid && state.crystalBid[side]) || 0);
    if (persona === "warden" && spendable() < 60) return;   // the Warden hoards
    const cap = persona === "swarm" ? 5 : 3;
    let guard = 0;
    while (guard++ < cap) {
      const opt = SUMMON_OPTIONS.slice().reverse().find(o => spendable() >= o.cost);
      if (!opt) break;
      const tiles = homeTilesFor(side);
      if (!tiles.length) break;
      const t = tiles[Math.floor(Math.random() * tiles.length)];
      if (!summonPiece(side, opt.type, t.row, t.col)) break;
    }
  }

  /* ============================================================
   * SUMMONING (spend crystals to place a reinforcement on the home rank)
   * ============================================================ */
  function homeRows(side) { return side === "light" ? [0, 1, 2, 3] : [4, 5, 6, 7]; }
  function homeTilesFor(side) {
    const grid = buildOccupancyGrid(state.pieces);
    const tiles = [];
    for (const r of homeRows(side)) for (let c = 0; c < 8; c++) if (!grid[r][c]) tiles.push({ row: r, col: c });
    return tiles;
  }
  function summonPiece(side, type, row, col) {
    const opt = SUMMON_OPTIONS.find(o => o.type === type);
    if (!opt || state.crystals[side] < opt.cost) return false;
    const grid = buildOccupancyGrid(state.pieces);
    if (!inBounds(row, col) || grid[row][col] || !homeRows(side).includes(row)) return false;
    state.crystals[side] -= opt.cost;
    const p = makePiece(type, side, row, col, side === "light" ? 1 : -1);
    p.spawnPopUntil = state.lastTs + 440;
    state.pieces.push(p);
    spawnBurstParticles(p.x, p.y, side, 24);
    spawnShockwave(p.x, p.y, glyphColor(side).glow, state.lastTs, { maxRadius: 54, durationMs: 470 });
    spawnDamageText(p.x, p.y - 6, t("fx.risen"), glyphColor(side).glow);
    bumpStat(side, "summons");

    logEvent(t("log.summon", { side: sideLabel(side), piece: pieceName(type) }));
    syncSidePanels();
    return p;
  }

  /* ============================================================
   * FURIES (optional neutral horrors — hunt and slay either side)
   * ============================================================ */
  function spawnFury(ts) {
    if (state.furyCount >= FURY_MAX) return;
    const grid = buildOccupancyGrid(state.pieces);
    const cand = [[3, 3], [3, 4], [4, 3], [4, 4], [3, 2], [4, 5], [2, 4], [5, 3]];
    let spot = cand.find(([r, c]) => !grid[r][c]);
    if (!spot) { for (let r = 2; r <= 5 && !spot; r++) for (let c = 1; c <= 6 && !spot; c++) if (!grid[r][c]) spot = [r, c]; }
    if (!spot) return;
    const p = makePiece("fury", "neutral", spot[0], spot[1], 1);
    p.spawnPopUntil = (state.lastTs || ts) + 440;
    state.pieces.push(p);
    state.furyCount++;
    spawnBurstParticles(p.x, p.y, "neutral", 24);
    spawnShockwave(p.x, p.y, "#5be07a", state.lastTs || ts, { maxRadius: 56, durationMs: 480 });

    logEvent(t("log.furyRise"));
  }

  function resolveFury(fury, ts) {
    if (!fury || !fury.alive) return;
    const grid = buildOccupancyGrid(state.pieces);
    const prey = state.pieces.filter(p => p.alive && p.type !== "fury");
    if (!prey.length) return;
    let target = null, bd = Infinity;
    for (const o of prey) { const d = chebyshev(fury, o); if (d < bd) { bd = d; target = o; } }
    if (!target) return;
    if (bd <= 1) {
      fury.lunge = { fromX: fury.x, fromY: fury.y, targetX: target.x, targetY: target.y, startTs: ts, hitTs: ts, windupMs: 1, recoverMs: 250 };
      spawnSlash(fury, target, ts, "normal");
      state.shake = Math.min(9, state.shake + 3);
      setCaption(t("cap.furyStrike", { who: describePiece(target) }));
      strikeKill(target, fury, ts);
    } else {
      let moved = false;
      const dr = Math.sign(target.row - fury.row), dc = Math.sign(target.col - fury.col);
      if (inBounds(fury.row + dr, fury.col + dc) && !grid[fury.row + dr][fury.col + dc] && !terrainBlocks(fury.row + dr, fury.col + dc)) { startDash(fury, fury.row + dr, fury.col + dc, ts, { kind: "move" }); moved = true; }
      else {
        for (const [ar, ac] of KING_DIRS) {
          const rr = fury.row + ar, cc = fury.col + ac;
          if (inBounds(rr, cc) && !grid[rr][cc] && !terrainBlocks(rr, cc) && Math.max(Math.abs(rr - target.row), Math.abs(cc - target.col)) < bd) { startDash(fury, rr, cc, ts, { kind: "move" }); moved = true; break; }
        }
      }
      if (moved) applyTerrainOnLand(fury, ts);
      setCaption(t(moved ? "cap.furyMove" : "cap.furyStuck"));
    }
  }

  /* ============================================================
   * PARTICLES / SLASHES / PROJECTILES / SHOCKWAVES
   * ============================================================ */
  function spawnHitParticles(x, y, side) {
    const color = side === "light" ? "#7fecf5" : side === "dark" ? "#ff8a5c" : "#8be09a";
    for (let i = 0; i < 8; i++) state.particles.push({ x, y, vx: (Math.random() - 0.5) * 170, vy: (Math.random() - 0.5) * 170 - 20, life: 0.35, maxLife: 0.35, color, size: 2 + Math.random() * 2.2 });
  }
  function spawnDeathParticles(x, y, side) {
    const color = side === "light" ? "#7fecf5" : side === "dark" ? "#ff8a5c" : "#8be09a";
    for (let i = 0; i < 30; i++) { const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 150; state.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6 + Math.random() * 0.5, maxLife: 1.1, color, size: 2 + Math.random() * 3 }); }
  }
  function spawnSoulParticles(x, y, side) {
    const color = side === "light" ? "#dff1ff" : side === "dark" ? "#ffe3cf" : "#d8ffe4";
    for (let i = 0; i < 8; i++) state.particles.push({ x: x + (Math.random() - 0.5) * 14, y: y - Math.random() * 6, vx: (Math.random() - 0.5) * 12, vy: -26 - Math.random() * 28, life: 1.3 + Math.random() * 0.5, maxLife: 1.8, color, size: 1.3 + Math.random() * 1.4, soft: true });
  }
  function spawnBurstParticles(x, y, side, n) {
    const color = side === "light" ? "#7fecf5" : side === "dark" ? "#ff8a5c" : "#e8c657";
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; state.particles.push({ x, y, vx: Math.cos(a) * (70 + Math.random() * 40), vy: Math.sin(a) * (70 + Math.random() * 40), life: 0.5, maxLife: 0.5, color, size: 3 }); }
  }
  function spawnDissolve(x, y, side) { spawnBurstParticles(x, y, side, 20); }
  function spawnConverge(x, y, side, n) {
    n = n || 16;
    const color = side === "light" ? "#7fecf5" : side === "dark" ? "#ff8a5c" : "#8be09a";
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, sx = x + Math.cos(a) * 32, sy = y + Math.sin(a) * 32; state.particles.push({ x: sx, y: sy, vx: (x - sx) / 0.24, vy: (y - sy) / 0.24, life: 0.24, maxLife: 0.24, color, size: 2.4 }); }
  }
  function spawnDustPuff(x, y, side, n) {
    const color = side === "light" ? "#b8c8d8" : side === "dark" ? "#d8b8a0" : "#a8d8b0";
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2; state.particles.push({ x, y: y + 6, vx: Math.cos(a) * 30, vy: Math.sin(a) * 20 - 8, life: 0.3, maxLife: 0.3, color, size: 1.5 + Math.random() * 1.5 }); }
  }
  function spawnSlash(attacker, target, ts, kind) {
    const angle = Math.atan2(target.y - attacker.y, target.x - attacker.x);
    const dist = Math.hypot(target.x - attacker.x, target.y - attacker.y) || 1;
    const reach = Math.min(dist, TILE * 0.6);
    state.slashes.push({ x: attacker.x + Math.cos(angle) * reach * 0.6, y: attacker.y + Math.sin(angle) * reach * 0.6, angle, side: attacker.side, startTs: ts, durationMs: kind === "big" ? 270 : kind === "arc" ? 200 : 220, size: kind === "big" ? 1.5 : kind === "arc" ? 0.7 : 1 });
  }
  function spawnProjectile(attacker, target, ts, big) {
    state.projectiles.push({ fromX: attacker.x, fromY: attacker.y, toX: target.x, toY: target.y, startTs: ts, durationMs: 200, side: attacker.side, big: !!big });
  }
  function spawnShockwave(x, y, color, ts, opts) {
    opts = opts || {};
    state.shockwaves.push({ x, y, color, startTs: ts, durationMs: opts.durationMs || 400, maxRadius: opts.maxRadius || 46 });
  }
  // `screen` = position is already in screen space (e.g. the centre-board combo banner).
  function spawnDamageText(x, y, label, color, screen) {
    state.damageNumbers.push({ x, y, label, color: color || "#ecdcc6", life: 0.9, maxLife: 0.9, rise: 0, screen: !!screen });
    if (state.damageNumbers.length > 24) state.damageNumbers.shift();
  }
  function triggerZoom(x, y, amt) {
    if (state.reduceMotion) return;
    state.zoom = Math.max(state.zoom || 0, amt);
    state.zoomFocus = { x, y };
  }
  function updateParticles(dt, ts) {
    state.particles = state.particles.filter(p => { p.life -= dt; if (p.life <= 0) return false; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; return true; });
    state.damageNumbers = state.damageNumbers.filter(d => { d.life -= dt; d.rise = (d.rise || 0) + 26 * dt; return d.life > 0; });
    state.slashes = state.slashes.filter(s => ts - s.startTs < s.durationMs);
    state.projectiles = state.projectiles.filter(p => ts - p.startTs < p.durationMs);
    state.shockwaves = state.shockwaves.filter(s => ts - s.startTs < s.durationMs);
    state.shake = Math.max(0, state.shake - dt * 16);
    state.flash = Math.max(0, (state.flash || 0) - dt * 3.4);
    state.zoom = Math.max(0, (state.zoom || 0) - dt * 0.5);
  }

  /* ============================================================
   * AMBIENT BACKGROUND
   * ============================================================ */
  let ambientParticles = [];
  function seedAmbientParticles() {
    ambientParticles = [];
    for (let i = 0; i < 30; i++) ambientParticles.push({ x: Math.random() * BOARD_PX, y: Math.random() * BOARD_PX, vx: (Math.random() - 0.5) * 5, vy: -3 - Math.random() * 7, size: 0.6 + Math.random() * 1.6, alpha: 0.06 + Math.random() * 0.12, warm: Math.random() < 0.4 });
  }
  function updateAmbientParticles(dt) {
    for (const p of ambientParticles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y < -10) { p.y = BOARD_PX + 10; p.x = Math.random() * BOARD_PX; }
      if (p.x < -10) p.x = BOARD_PX + 10;
      if (p.x > BOARD_PX + 10) p.x = -10;
    }
  }
  function drawAmbientParticles() {
    for (const p of ambientParticles) { ctx.beginPath(); ctx.fillStyle = p.warm ? `rgba(232,98,44,${p.alpha})` : `rgba(160,130,220,${p.alpha})`; ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
  }

  /* ============================================================
   * RENDERING — board
   * ============================================================ */
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  let boardCache = null;

  function buildBoardCache() {
    const off = document.createElement("canvas");
    off.width = BOARD_PX; off.height = BOARD_PX;
    const c = off.getContext("2d");
    const bg = c.createRadialGradient(BOARD_PX / 2, BOARD_PX * 0.42, 20, BOARD_PX / 2, BOARD_PX / 2, BOARD_PX * 0.85);
    bg.addColorStop(0, "#2a1420"); bg.addColorStop(0.5, "#160b16"); bg.addColorStop(1, "#070409");
    c.fillStyle = bg; c.fillRect(0, 0, BOARD_PX, BOARD_PX);
    for (let r = 0; r < 8; r++) for (let col = 0; col < 8; col++) {
      const light = (r + col) % 2 === 0, x = col * TILE, y = r * TILE;
      const tg = c.createLinearGradient(x, y, x + TILE, y + TILE);
      if (light) { tg.addColorStop(0, "#2b2033"); tg.addColorStop(1, "#1b1426"); }
      else { tg.addColorStop(0, "#140d16"); tg.addColorStop(1, "#0b060d"); }
      c.fillStyle = tg; c.fillRect(x, y, TILE, TILE);
      c.strokeStyle = light ? "rgba(190,160,210,0.055)" : "rgba(120,90,150,0.05)"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x + (r * 13 + col * 29) % TILE, y); c.quadraticCurveTo(x + TILE * 0.5, y + TILE * 0.5, x + (r * 31 + col * 17) % TILE, y + TILE); c.stroke();
      c.strokeStyle = "rgba(232,198,87,0.08)"; c.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
    }
    c.save(); c.shadowColor = "#ff5a2a"; c.shadowBlur = 14; c.strokeStyle = "rgba(255,95,45,0.45)"; c.lineWidth = 2; c.lineCap = "round";
    const veins = [[[0, 118], [150, 175], [300, 92], [455, 205], [560, 160]], [[70, 560], [165, 415], [300, 470], [420, 355], [520, 430]], [[0, 330], [140, 298], [265, 360], [400, 300], [560, 342]]];
    for (const v of veins) { c.beginPath(); c.moveTo(v[0][0], v[0][1]); for (let i = 1; i < v.length; i++) c.lineTo(v[i][0], v[i][1]); c.stroke(); }
    c.restore();
    drawMeanderBorder(c); drawCornerFlourishes(c);
    const vign = c.createRadialGradient(BOARD_PX / 2, BOARD_PX / 2, BOARD_PX * 0.32, BOARD_PX / 2, BOARD_PX / 2, BOARD_PX * 0.75);
    vign.addColorStop(0, "rgba(0,0,0,0)"); vign.addColorStop(1, "rgba(0,0,0,0.55)");
    c.fillStyle = vign; c.fillRect(0, 0, BOARD_PX, BOARD_PX);
    boardCache = off;
  }
  function drawMeanderBorder(c) {
    c.save();
    c.strokeStyle = "rgba(232,198,87,0.55)"; c.lineWidth = 2; c.strokeRect(4.5, 4.5, BOARD_PX - 9, BOARD_PX - 9);
    c.strokeStyle = "rgba(232,198,87,0.28)"; c.lineWidth = 1; c.strokeRect(9.5, 9.5, BOARD_PX - 19, BOARD_PX - 19);
    c.fillStyle = "rgba(232,198,87,0.5)";
    for (let i = 0; i < 8; i++) { const cpos = i * TILE + TILE / 2; for (const [x, y] of [[cpos, 7], [cpos, BOARD_PX - 7], [7, cpos], [BOARD_PX - 7, cpos]]) { c.beginPath(); c.arc(x, y, 1.7, 0, Math.PI * 2); c.fill(); } }
    c.restore();
  }
  function drawCornerFlourishes(c) {
    c.save(); c.strokeStyle = "rgba(232,198,87,0.6)"; c.lineWidth = 2; c.lineCap = "round";
    const corners = [[15, 15, 1, 1], [BOARD_PX - 15, 15, -1, 1], [15, BOARD_PX - 15, 1, -1], [BOARD_PX - 15, BOARD_PX - 15, -1, -1]];
    for (const [x, y, sx, sy] of corners) {
      c.beginPath(); c.moveTo(x + sx * 30, y); c.quadraticCurveTo(x, y, x, y + sy * 30); c.stroke();
      c.beginPath(); c.moveTo(x + sx * 20, y + sy * 4); c.quadraticCurveTo(x + sx * 6, y + sy * 6, x + sx * 4, y + sy * 20); c.stroke();
      c.beginPath(); c.arc(x + sx * 9, y + sy * 9, 2.4, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
  }

  /* ============================================================
   * RENDERING — highlights, plan ghosts, pieces
   * ============================================================ */
  function drawTerrain(ts) {
    if (!state.terrain) return;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const k = state.terrain[r][c]; if (!k) continue;
      const x = c * TILE, y = r * TILE, cx = x + TILE / 2, cy = y + TILE / 2;
      ctx.save();
      if (k === "lava") {
        const p = 0.5 + 0.5 * Math.sin(ts / 300 + r + c);
        ctx.fillStyle = `rgba(255,90,45,${0.16 + 0.1 * p})`; ctx.fillRect(x, y, TILE, TILE);
        ctx.shadowColor = "#ff5a2a"; ctx.shadowBlur = 12;
        ctx.strokeStyle = `rgba(255,150,60,${0.5 + 0.3 * p})`; ctx.lineWidth = 2; ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
        ctx.fillStyle = `rgba(255,190,90,${0.25 * p})`; ctx.beginPath(); ctx.arc(cx, cy, TILE * 0.2, 0, Math.PI * 2); ctx.fill();
      } else if (k === "chasm") {
        ctx.fillStyle = "rgba(2,1,4,0.82)"; ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
        ctx.strokeStyle = "rgba(120,90,150,0.35)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(cx, cy, TILE * 0.34, TILE * 0.30, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (k === "font") {
        const p = 0.5 + 0.5 * Math.sin(ts / 260 + r * 2 + c);
        ctx.fillStyle = `rgba(91,224,122,${0.13 + 0.08 * p})`; ctx.fillRect(x, y, TILE, TILE);
        ctx.shadowColor = "#5be07a"; ctx.shadowBlur = 12;
        ctx.strokeStyle = `rgba(120,255,160,${0.5 + 0.3 * p})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, TILE * 0.22, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawHighlights(ts) {
    if (state.scene !== "planning") return;
    if (state.showThreat) {
      const grid = buildOccupancyGrid(state.pieces);
      const foes = state.pieces.filter(p => p.alive && p.side !== state.planningSide);
      const mark = new Set();
      for (const f of foes) for (const t of threatTiles(f, grid)) mark.add(t.row * 8 + t.col);
      ctx.save();
      ctx.fillStyle = "rgba(220,60,60,0.13)";
      ctx.strokeStyle = "rgba(220,60,60,0.28)"; ctx.lineWidth = 1;
      mark.forEach(k => { const r = Math.floor(k / 8), c = k % 8; ctx.fillRect(c * TILE, r * TILE, TILE, TILE); ctx.strokeRect(c * TILE + 0.5, r * TILE + 0.5, TILE - 1, TILE - 1); });
      ctx.restore();
    }
    const sel = state.selection;
    const pulse = 0.06 * Math.sin(ts / 220);
    if (state.summonArmed) {
      const p2 = 0.08 * Math.sin(ts / 200);
      for (const t of homeTilesFor(state.planningSide)) { ctx.fillStyle = `rgba(143,208,255,${0.28 + p2})`; ctx.fillRect(t.col * TILE, t.row * TILE, TILE, TILE); }
      return;
    }
    if (state.wardMode) {
      for (const p of state.pieces) {
        if (!p.alive || p.side !== state.planningSide) continue;
        ctx.save();
        ctx.globalAlpha = 0.5 + pulse * 2;
        ctx.strokeStyle = "rgba(232,198,87,0.9)"; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
        ctx.strokeRect(p.col * TILE + 3, p.row * TILE + 3, TILE - 6, TILE - 6);
        ctx.restore();
      }
      return;
    }
    for (const t of sel.moveTiles) { ctx.fillStyle = `rgba(90,150,255,${0.26 + pulse})`; ctx.fillRect(t.col * TILE, t.row * TILE, TILE, TILE); }
    for (const t of sel.strikeTiles) { ctx.fillStyle = `rgba(220,60,60,${0.32 + pulse})`; ctx.fillRect(t.col * TILE, t.row * TILE, TILE, TILE); }
    if (sel.pieceId) {
      const p = pieceById(sel.pieceId);
      if (p) { ctx.save(); ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -(ts / 30) % 9; ctx.strokeRect(p.col * TILE + 2, p.row * TILE + 2, TILE - 4, TILE - 4); ctx.restore(); }
    }
  }

  /* ---- Oracle's Foresight — deterministically forecasts ONLY your ordered plan
     against a frozen board (enemies assumed static, so the hidden plan is never revealed). ---- */
  function predKill(o, forecast) {
    if (o.warded) { o.warded = false; return; }
    o.lives -= 1;
    if (o.lives <= 0) { o.alive = false; forecast.deaths.push({ id: o.id, row: o.row, col: o.col, type: o.type, side: o.side }); }
  }
  function predictPlan(side) {
    const real = state.pieces;
    const clones = real.map(p => ({ id: p.id, type: p.type, side: p.side, facing: p.facing, lives: p.lives, maxLives: p.maxLives, warded: p.warded, row: p.row, col: p.col, alive: p.alive }));
    const forecast = { moves: [], deaths: [], whiffs: [], captures: [] };
    try {
      state.pieces = clones;
      for (const cmd of state.plan[side]) {
        const p = clones.find(x => x.id === cmd.pieceId);
        if (!p || !p.alive) continue;
        let grid = buildOccupancyGrid(clones);
        if (cmd.kind === "move") {
          const legal = inBounds(cmd.row, cmd.col) && !grid[cmd.row][cmd.col] && getMoveTiles(p, grid).some(t => t.row === cmd.row && t.col === cmd.col);
          if (legal) {
            p.row = cmd.row; p.col = cmd.col;
            if (terrainAt(p.row, p.col) === "lava") {
              if (p.warded) p.warded = false;
              else { p.alive = false; forecast.deaths.push({ id: p.id, row: p.row, col: p.col, type: p.type, side: p.side }); }
            }
          }
        } else {
          const defs = PIECE_DEFS[p.type];
          if (defs.strikeAoe && cmd.reaperMode !== "advance") {
            let any = false;
            for (const [dr, dc] of KING_DIRS) { const r = p.row + dr, c = p.col + dc; if (!inBounds(r, c)) continue; const o = grid[r][c]; if (o && o.alive && o.side !== p.side) { predKill(o, forecast); any = true; } }
            if (!any) forecast.whiffs.push({ row: p.row, col: p.col });
          } else {
            const target = clones.find(x => x.id === cmd.targetId);
            const inRange = target && target.alive && getAttackTiles(p, grid).some(t => t.row === target.row && t.col === target.col);
            if (!inRange) { forecast.whiffs.push({ row: cmd.row, col: cmd.col }); }
            else {
              const tRow = target.row, tCol = target.col;
              predKill(target, forecast);
              if (defs.strikeChain && state.harrowerDragEnabled && !target.alive) { const g2 = buildOccupancyGrid(clones); for (const [dr, dc] of ROOK_DIRS) { const r = tRow + dr, c = tCol + dc; if (!inBounds(r, c)) continue; const o = g2[r][c]; if (o && o.alive && o.side !== p.side) { predKill(o, forecast); break; } } }
              if (!target.alive) { const g2 = buildOccupancyGrid(clones); if (!g2[tRow][tCol]) { p.row = tRow; p.col = tCol; forecast.captures.push({ id: p.id, row: tRow, col: tCol }); } }
            }
          }
        }
      }
      for (const cmd of state.plan[side]) { const p = clones.find(x => x.id === cmd.pieceId); if (p && p.alive) forecast.moves.push({ id: p.id, row: p.row, col: p.col, type: p.type, side: p.side }); }
    } finally { state.pieces = real; }
    return forecast;
  }
  function drawForesight(ts) {
    let fc;
    try { fc = predictPlan(state.planningSide); } catch (e) { return; }
    ctx.save();
    for (const m of fc.moves) {
      const cc = cellCenter(m.row, m.col);
      ctx.globalAlpha = 0.55; ctx.strokeStyle = hexToRgba(glyphColor(m.side).glow, 0.9); ctx.setLineDash([4, 3]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cc.x, cc.y, TILE * 0.40, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 0.26; ctx.save(); ctx.translate(cc.x, cc.y); if (state.viewFlip) ctx.rotate(Math.PI); ctx.scale(0.78, 0.78); paintFigure(m.type, sidePalette(m.side), TILE * 0.33, ts, ctx, m.side); ctx.restore();
    }
    ctx.globalAlpha = 0.95; ctx.setLineDash([]);
    for (const d of fc.deaths) {
      const cc = cellCenter(d.row, d.col);
      ctx.strokeStyle = "#ff4a4a"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cc.x - 12, cc.y - 12); ctx.lineTo(cc.x + 12, cc.y + 12); ctx.moveTo(cc.x + 12, cc.y - 12); ctx.lineTo(cc.x - 12, cc.y + 12); ctx.stroke();
    }
    for (const w of fc.whiffs) {
      const cc = cellCenter(w.row, w.col);
      ctx.globalAlpha = 0.6; ctx.strokeStyle = "#9a8fb0"; ctx.setLineDash([3, 3]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cc.x, cc.y, TILE * 0.3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function drawPlanGhosts(ts) {
    if (state.scene !== "planning") return;
    const plan = state.plan[state.planningSide];
    const glow = glyphColor(state.planningSide).glow;
    plan.forEach((cmd, i) => {
      const p = pieceById(cmd.pieceId);
      if (!p) return;
      const from = { x: p.x, y: p.y };
      const to = cellCenter(cmd.row, cmd.col);
      ctx.save();
      ctx.lineWidth = 2.5; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -(ts / 40) % 11;
      if (cmd.kind === "move") {
        ctx.strokeStyle = hexToRgba(glow, 0.85);
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
        ctx.setLineDash([]);
        arrowHead(from.x, from.y, to.x, to.y, hexToRgba(glow, 0.9));
      } else {
        ctx.strokeStyle = "rgba(255,90,72,0.85)";
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
        ctx.setLineDash([]);
        // target reticle
        ctx.strokeStyle = "rgba(255,90,72,0.95)"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(to.x, to.y, TILE * 0.34, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(to.x - 8, to.y - 8); ctx.lineTo(to.x + 8, to.y + 8);
        ctx.moveTo(to.x + 8, to.y - 8); ctx.lineTo(to.x - 8, to.y + 8); ctx.stroke();
      }
      ctx.restore();
    });
  }
  // Order badges (1·2·3) in screen space so the numbers always read upright.
  function drawPlanBadges() {
    if (state.scene !== "planning") return;
    state.plan[state.planningSide].forEach((cmd, i) => {
      if (!pieceById(cmd.pieceId)) return;
      const to = cellCenter(cmd.row, cmd.col);
      drawBadge(sx(to.x), sy(to.y) - TILE * 0.38, i + 1);
    });
  }
  function arrowHead(x1, y1, x2, y2, color) {
    const a = Math.atan2(y2 - y1, x2 - x1), len = 10;
    ctx.save(); ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - len * Math.cos(a - 0.4), y2 - len * Math.sin(a - 0.4));
    ctx.lineTo(x2 - len * Math.cos(a + 0.4), y2 - len * Math.sin(a + 0.4));
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function drawBadge(x, y, n) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#e8c657"; ctx.fill();
    ctx.strokeStyle = "#0b0710"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#0b0710"; ctx.font = "bold 12px Georgia"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(n), x, y + 0.5);
    ctx.restore();
    ctx.textBaseline = "alphabetic";
  }

  function glyphColor(side) {
    return side === "light" ? { fill: "#8ff2f5", glow: "#2fc6d6" } :
           side === "dark" ? { fill: "#ffc9b2", glow: "#ff5a48" } :
           { fill: "#c6ffd4", glow: "#5be07a" };
  }
  function sidePalette(side) {
    if (side === "light") return { deep: "#0f3d47", mid: "#1c8a98", bright: "#3fd8e0", rim: "#c4f8fc", gold: "#e8c657" };
    if (side === "dark") return { deep: "#5a0f1c", mid: "#a52334", bright: "#e8434f", rim: "#ff9a7a", gold: "#e8c657" };
    return { deep: "#1f5a2c", mid: "#2f9a48", bright: "#5be07a", rim: "#c6ffd4", gold: "#d8f0a0" };
  }

  // Per-frame constants of drawPiece, built once: a CanvasGradient is resolved in the user space that is
  // current when it is used to fill, so one halo gradient per (glow colour, radius) paints exactly like
  // a freshly created one under each piece's own transform. Both maps hold a handful of entries.
  const pieceHaloGradients = new Map();
  function pieceHalo(glow, r) {
    const key = glow + "|" + r;
    let g = pieceHaloGradients.get(key);
    if (!g) {
      g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.85);
      g.addColorStop(0, hexToRgba(glow, 0.4)); g.addColorStop(1, hexToRgba(glow, 0));
      if (pieceHaloGradients.size >= 32) pieceHaloGradients.clear();
      pieceHaloGradients.set(key, g);
    }
    return g;
  }
  const plinthRims = new Map();
  function plinthRim(gold) {
    let v = plinthRims.get(gold);
    if (v === undefined) {
      v = hexToRgba(gold, 0.7);
      if (plinthRims.size >= 32) plinthRims.clear();
      plinthRims.set(gold, v);
    }
    return v;
  }

  function drawPiece(p, ts) {
    if (!p.alive && p.animState !== "dying") return;
    const dying = p.animState === "dying";
    const fadeT = dying ? clamp((p.dyingUntil - ts) / DEATH_FX_MS, 0, 1) : 1;
    if (fadeT <= 0) return;
    const colors = glyphColor(p.side);
    const pal = sidePalette(p.side);
    const r = TILE * 0.33;

    let lungeX = 0, lungeY = 0;
    if (p.lunge && !dying) {
      const l = p.lunge, dx = l.targetX - l.fromX, dy = l.targetY - l.fromY, dist = Math.hypot(dx, dy) || 1, nx = dx / dist, ny = dy / dist;
      const t2 = clamp((ts - l.hitTs) / l.recoverMs, 0, 1);
      // snappy thrust out, then ease back with a small recoil dip
      let shape;
      if (t2 < 0.18) shape = easeOutCubic(t2 / 0.18);
      else { const b = (t2 - 0.18) / 0.82; shape = (1 - b) - 0.14 * Math.sin(b * Math.PI); }
      const thrust = 0.5 * TILE * shape;
      lungeX = nx * thrust; lungeY = ny * thrust;
    }
    const bob = dying ? 0 : Math.sin(ts / 480 + p.bobSeed) * 1.6;
    let scale = 1;
    if (p.spawnPopUntil && ts < p.spawnPopUntil) { const tp = 1 - clamp((p.spawnPopUntil - ts) / 380, 0, 1); scale = lerp(0.15, 1, easeOutBack(tp)); }
    const idlePulse = dying ? 1 : 1 + 0.045 * Math.sin(ts / 300 + p.id);

    if (p.trail && p.trail.length > 1) {
      ctx.save();
      for (let i = 0; i < p.trail.length; i++) { const tpt = p.trail[i]; ctx.globalAlpha = (i / p.trail.length) * 0.38 * fadeT; ctx.fillStyle = colors.glow; ctx.beginPath(); ctx.arc(tpt.x, tpt.y, r * 0.55, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }

    // "down" on screen: when the view is rotated 180°, board-space +y points up, so flip the offset.
    const dn = state.viewFlip ? -1 : 1;
    ctx.save(); ctx.globalAlpha = fadeT * 0.32;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + dn * (r * 0.95 + bob * 0.2), r * 0.9 * scale, r * 0.32 * scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fill(); ctx.restore();

    if (!dying) {
      ctx.save(); ctx.globalAlpha = fadeT;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + dn * r * 1.0, r * 0.78 * scale, r * 0.26 * scale, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(18,10,20,0.9)"; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = plinthRim(pal.gold); ctx.stroke(); ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = fadeT;
    ctx.translate(p.x + lungeX, p.y + lungeY + bob);
    if (state.viewFlip) ctx.rotate(Math.PI);   // keep the figure upright inside the rotated board
    if (dying) { const prog = 1 - fadeT; ctx.rotate((p.deathSpin || 0) * prog); ctx.scale(1 - prog * 0.4, 1 - prog * 0.4); ctx.translate(0, prog * 12); }
    else ctx.scale(scale * idlePulse, scale * idlePulse);

    // Aegis ward ring
    if (!dying && p.warded) {
      ctx.save();
      ctx.rotate(ts / 600); ctx.globalAlpha = 0.85;
      ctx.strokeStyle = "#e8c657"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    if (!dying) {
      ctx.fillStyle = pieceHalo(colors.glow, r); ctx.beginPath(); ctx.arc(0, 0, r * 1.85, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 3;
    paintFigure(p.type, pal, r, ts, ctx, p.side);
    ctx.shadowBlur = 0;

    // hit flash overlay
    if (ts < p.hitFlashUntil) {
      ctx.globalAlpha = clamp((p.hitFlashUntil - ts) / 200, 0, 1) * 0.8;
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // life pips + colorblind glyphs are drawn upright in the screen layer (drawPieceMarkers)
  }

  // Screen-space markers for each living piece — always upright, never clipped by the board edge.
  function drawPieceMarkers() {
    const r = TILE * 0.33;
    for (const p of state.pieces) {
      if (!p.alive) continue;
      const x = sx(p.x), y = sy(p.y);
      if (p.maxLives > 1) drawLifePips(p, x, y, r);
      if (state.colorGlyphs) drawSideGlyph(p, x, y, r);
    }
  }

  function drawSideGlyph(p, x, y, r) {
    ctx.save();
    ctx.translate(x + r * 0.95, y - r * 0.95);
    ctx.lineWidth = 1.4; ctx.strokeStyle = "#0b0710"; ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    if (p.side === "light") { ctx.moveTo(0, -5); ctx.lineTo(5, 4); ctx.lineTo(-5, 4); }
    else if (p.side === "dark") { ctx.moveTo(0, 5); ctx.lineTo(5, -4); ctx.lineTo(-5, -4); }
    else { ctx.moveTo(0, -5); ctx.lineTo(5, 0); ctx.lineTo(0, 5); ctx.lineTo(-5, 0); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawLifePips(p, cx, cy, r) {
    const n = p.maxLives, gap = 8, w = (n - 1) * gap;
    // Sit on the side facing the board centre: a top-row royal shows its lives below it, not off-canvas.
    const y = cy < BOARD_PX / 2 ? cy + r + 12 : cy - r - 15;
    for (let i = 0; i < n; i++) {
      const x = cx - w / 2 + i * gap;
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      if (i < p.lives) { ctx.fillStyle = p.type === "sovereign" ? "#e8c657" : "#c98bd1"; ctx.fill(); ctx.strokeStyle = "#0b0710"; ctx.lineWidth = 1; ctx.stroke(); }
      else { ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fill(); ctx.strokeStyle = "rgba(150,120,90,0.5)"; ctx.lineWidth = 1; ctx.stroke(); }
    }
  }

  // Figures are drawn by the active visual theme (themes.js). Missing or broken painters fall back to
  // classic, and if themes.js is unavailable entirely a self-contained glowing disc is drawn instead.
  // A theme may also give a side its own figure for a role via `sidePainters[side][type]`; the side is
  // always the piece's owner (never its board position), so a flipped view keeps each side's art.
  const failedPainters = new Set();
  const FALLBACK_INITIALS = { sovereign: "S", reaper: "R", juggernaut: "J", trickster: "T", wildrider: "W", skirmisher: "K", harrower: "H", fury: "F" };

  // Painters run under save/restore depth tracking so a throw mid-draw (with nested c.save() calls still
  // open) unwinds the canvas exactly back to the baseline instead of leaking transforms/styles, and a
  // stray extra c.restore() inside a painter can never pop state its caller saved.
  // The tracking wrappers are installed on a context ONCE and then stay: installing and deleting own
  // save/restore properties around every figure (as before) pushes the context object into the engines'
  // slow "dictionary" property mode, which taxes every later ctx.* access on every figure, every frame.
  // Outside a painter (floor < 0) the wrappers just count and pass through.
  const PAINT_GUARD = typeof Symbol === "function" ? Symbol("sgPaintGuard") : "__sgPaintGuard";
  function paintGuardFor(c) {
    const existing = c[PAINT_GUARD];
    if (existing) return existing;
    const baseSave = c.save, baseRestore = c.restore;
    const g = { depth: 0, floor: -1, baseRestore };
    c.save = function () { g.depth++; return baseSave.call(c); };
    c.restore = function () {
      if (g.floor >= 0 && g.depth <= g.floor) return;   // never pop below the running painter's baseline
      if (g.depth > 0) g.depth--;
      return baseRestore.call(c);
    };
    c[PAINT_GUARD] = g;
    return g;
  }
  function runPainter(painter, c, pal, r, ts) {
    const g = paintGuardFor(c);
    const outerFloor = g.floor;                          // supports a painter that paints a nested figure
    g.floor = g.depth;
    try {
      const helpers = typeof SG.createFigureHelpers === "function" ? SG.createFigureHelpers(c, pal, r, ts) : {};
      painter(c, pal, r, ts, helpers);
    } finally {
      while (g.depth > g.floor) { g.depth--; g.baseRestore.call(c); }
      g.floor = outerFloor;
    }
  }

  function paintFallbackFigure(c, type, pal, r) {
    const g = c.createRadialGradient(0, -r * 0.25, r * 0.1, 0, 0, r);
    g.addColorStop(0, pal.rim || "#ffffff");
    g.addColorStop(0.45, pal.bright || "#cccccc");
    g.addColorStop(1, pal.deep || "#222222");
    c.shadowColor = pal.bright || "#ffffff"; c.shadowBlur = r * 0.6;
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, r * 0.82, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
    c.lineWidth = Math.max(1, r * 0.08); c.strokeStyle = pal.gold || "#e8c657"; c.stroke();
    const letter = FALLBACK_INITIALS[type] || (type ? String(type).charAt(0).toUpperCase() : "?");
    c.fillStyle = pal.deep || "#000000";
    c.font = `bold ${Math.round(r * 0.9)}px serif`;
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(letter, 0, r * 0.05);
  }

  // Returns true when the painter completed. A broken painter must never stop the render loop: it is
  // remembered (and skipped from then on) so the caller can try the next candidate.
  function tryPainter(painter, type, c, pal, r, ts) {
    if (failedPainters.has(painter)) return false;
    c.save();
    try {
      runPainter(painter, c, pal, r, ts);
      return true;
    } catch (err) {
      failedPainters.add(painter);
      if (typeof console !== "undefined") console.warn("[Stygian Gambit] figure painter failed for", type, err);
      return false;
    } finally {
      c.restore();
    }
  }

  // Candidates, in order: the side override (if any) or the theme painter, then classic's painter for the
  // role (or classic.default), then the built-in disc. Resolved per call without allocations because this
  // runs for every figure on every frame. `themeId` is only passed by the icon pre-render (warm-up); every
  // other caller paints with the active theme.
  const hasOwn = Object.prototype.hasOwnProperty;
  function paintFigure(type, pal, r, ts, c, side, themeId) {
    c = c || ctx;
    ts = ts || 0;
    const themes = SG.THEMES || {};
    const classic = (themes.classic && themes.classic.painters) || {};
    const theme = themes[themeId || (state && state.theme) || activeThemeId || "classic"] || themes.classic;
    const fallback = classic[type] || classic.default;
    const sidePainters = theme ? theme.sidePainters : null;
    const sideSet = side && sidePainters && hasOwn.call(sidePainters, side) ? sidePainters[side] : null;
    const sidePainter = sideSet && hasOwn.call(sideSet, type) && typeof sideSet[type] === "function" ? sideSet[type] : null;
    const primary = sidePainter || (theme && theme.painters && theme.painters[type]) || fallback;
    c.save();
    try {
      if (primary && tryPainter(primary, type, c, pal, r, ts)) return;
      if (fallback && fallback !== primary && tryPainter(fallback, type, c, pal, r, ts)) return;
      paintFallbackFigure(c, type, pal, r);
    } finally {
      c.restore();
    }
  }

  // Draw a role's figure (static pose, ts = 0) with its halo into a w x h 2D context.
  function drawIconFigure(lc, type, side, w, h, themeId) {
    const r = w * 0.30;
    const colors = glyphColor(side), pal = sidePalette(side);
    lc.save();
    lc.translate(w / 2, h * 0.56);
    const halo = lc.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.7);
    halo.addColorStop(0, hexToRgba(colors.glow, 0.4)); halo.addColorStop(1, hexToRgba(colors.glow, 0));
    lc.fillStyle = halo; lc.beginPath(); lc.arc(0, 0, r * 1.7, 0, Math.PI * 2); lc.fill();
    paintFigure(type, pal, r, 0, lc, side, themeId);
    lc.restore();
  }

  // Static icon images are cached per (theme, role, side, backing size). Icons are always painted at
  // ts = 0 from fixed side palettes (and, where a theme defines them, side-specific painters, which is
  // why the side must stay part of the key), and painters are deterministic (no randomness, no text/web
  // fonts), so these are all the inputs. Entries also remember the theme object they were painted
  // from, so a replaced theme definition is never served stale. Animated board figures are NOT cached.
  // Bounded LRU: 12 themes x 8 role/side pairs at 52px fits comfortably (~10 KB per image).
  const ICON_CACHE_MAX = 128;
  const iconCache = new Map();
  // Same resolution as paintFigure(): the theme the figure would actually be drawn with right now
  // (or, for the warm-up pre-render, with the given theme id).
  function currentFigureTheme(themeId) {
    const themes = SG.THEMES || {};
    const id = themeId || (state && state.theme) || activeThemeId || "classic";
    return themes[id] ? { id, theme: themes[id] } : { id: "classic", theme: themes.classic };
  }
  function iconImage(type, side, w, h, themeId) {
    const { id, theme } = currentFigureTheme(themeId);
    const key = `${id}|${type}|${side}|${w}x${h}`;
    const hit = iconCache.get(key);
    if (hit && hit.theme === theme) {
      iconCache.delete(key); iconCache.set(key, hit);       // refresh LRU position
      return hit.img;
    }
    const img = document.createElement("canvas");
    img.width = w; img.height = h;
    drawIconFigure(img.getContext("2d"), type, side, w, h, id); // only cached if painting completed
    iconCache.delete(key);
    iconCache.set(key, { theme, img });
    while (iconCache.size > ICON_CACHE_MAX) iconCache.delete(iconCache.keys().next().value);
    return img;
  }

  // Draw each role's figure into an icon canvas (legend, help roles, choice cards) in the current theme.
  // Size is read from the canvas backing store at paint time, so a resized canvas gets a matching image.
  function paintIcon(cv, type, side) {
    const w = cv.width, h = cv.height;
    if (!w || !h) return;
    const lc = cv.getContext("2d");
    if (!lc) return;
    const img = iconImage(type, side, w, h);
    lc.save();
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalAlpha = 1; lc.globalCompositeOperation = "source-over";
    lc.clearRect(0, 0, w, h);
    lc.drawImage(img, 0, 0);
    lc.restore();
  }
  function legendIconJobs() {
    return [...document.querySelectorAll(".legend-icon")].map(cv =>
      ({ cv, type: cv.getAttribute("data-piece"), side: cv.getAttribute("data-side") || "light" }));
  }
  function buildLegendIcons() {
    legendIconJobs().forEach(j => paintIcon(j.cv, j.type, j.side));
    refreshRoleNameLabels();
  }
  function refreshRoleNameLabels() {
    const themeId = activeThemeId || "classic";
    const lang = (SG.I18N && SG.I18N.lang) || "en";
    document.querySelectorAll(".role-name-label").forEach(label => {
      const piece = label.closest(".icon-caption")?.querySelector("canvas")?.dataset.piece ||
        label.closest(".icon-caption")?.dataset.piece;
      const entry = piece && SG.ROLE_NAMES && SG.ROLE_NAMES[themeId] && SG.ROLE_NAMES[themeId][piece];
      label.textContent = entry ? (entry[lang] || entry.en || entry.zh) : (piece || "");
    });
  }

  // Deferred, coalesced repaint of the theme-dependent icons after a theme switch, so the input that
  // triggered it gets visual feedback (select + board) before any expensive figure painting runs.
  // - Coalescing: at most one runner is pending; further requests only bump `gen`.
  // - Latest wins: the runner re-collects its targets whenever `gen` moved, and every paint reads the
  //   theme current at paint time, so an older selection can never overwrite a newer one.
  // - Yielding: each slice runs in a task after the next frame is presented and stops once its time
  //   budget is spent (always making progress by at least one icon); cache hits are near-free.
  // - Hidden document: requestAnimationFrame is paused, so work resumes once the page is visible.
  // - Stale DOM: targets are re-collected per generation and detached canvases are skipped.
  const ICON_SLICE_MS = 6;
  const iconRepaint = { gen: 0, queueGen: -1, queue: [], pending: false };
  function iconRepaintJobs() {
    const jobs = legendIconJobs();
    const roles = dom.helpScreen ? dom.helpScreen.querySelectorAll("canvas.role-icon") : [];
    roles.forEach(cv => {
      const type = cv.dataset.piece;
      if (type) jobs.push({ cv, type, side: type === "fury" ? "neutral" : "light" });
    });
    // Icons on screen first; ones inside hidden overlays still get refreshed afterwards.
    const shown = jobs.filter(j => j.cv.getClientRects().length > 0);
    return shown.concat(jobs.filter(j => !shown.includes(j)));
  }
  function runIconRepaintSoon() {
    requestAnimationFrame(() => setTimeout(runIconRepaint, 0));
  }
  function runIconRepaint() {
    try {
      if (iconRepaint.queueGen !== iconRepaint.gen) {
        iconRepaint.queueGen = iconRepaint.gen;   // set first: a failing collection must not retry forever
        iconRepaint.queue = [];
        iconRepaint.queue = iconRepaintJobs();
      }
      const start = performance.now();
      while (iconRepaint.queue.length) {
        const j = iconRepaint.queue.shift();
        if (j.cv.isConnected) {
          try { paintIcon(j.cv, j.type, j.side); }
          catch (err) { if (typeof console !== "undefined") console.warn("[Stygian Gambit] icon repaint failed for", j.type, err); }
        }
        if (performance.now() - start >= ICON_SLICE_MS) break;
      }
      if (perf.on) { perf.iconMs += perfNow() - start; perf.iconSlices++; }
    } finally {
      if (iconRepaint.queue.length || iconRepaint.queueGen !== iconRepaint.gen) runIconRepaintSoon();
      else iconRepaint.pending = false;
    }
  }
  function scheduleIconRepaint() {
    iconRepaint.gen++;
    if (iconRepaint.pending) return;
    iconRepaint.pending = true;
    runIconRepaintSoon();
  }

  // Theme warm-up. Once the player shows intent to change skin (pointer over, focus on, or press on a
  // theme picker), the legend icons of the other themes are pre-rendered into the icon cache in small,
  // yielding slices. That is exactly the work a switch would otherwise do right after the change (same
  // cache keys, same static ts = 0 pose, same painters and fallbacks), and it also lets the JS engine
  // parse/compile each theme's painter code before that theme's first animated board frame. Nothing is
  // drawn on screen, animated board figures are still painted live every frame, and an actual switch's
  // own icon repaint always goes first.
  // - Idle-first where supported: requestIdleCallback slices that start an icon only while at least
  //   WARM_MIN_IDLE_MS of idle time remains; elsewhere one icon per task after a presented frame.
  // - Guaranteed progress: idle periods can stay shorter than WARM_MIN_IDLE_MS for good (high refresh
  //   rates, heavy themes) and idle callbacks can be starved, so idle requests carry a timeout and,
  //   after WARM_IDLE_MISS_LIMIT consecutive idle slices that could not start an icon (idle progress
  //   resets the count), the chain switches to fallback mode for the rest of its life: one icon per
  //   after-frame task, never waiting for idle again between icons (queue refreshes keep the mode; a
  //   new chain starts idle-first again). Every slice is bounded either way, and the warm-up still
  //   pauses (same chain, same mode) while a real switch's icon repaint is pending.
  // - Bounded: themes are taken in picker order starting after the active one (arrow-key order) and only
  //   as many as fit the icon LRU with room to spare, so warming never evicts the active theme's icons.
  // - Never stale: each slice re-derives the plan (active theme, legend canvas sizes) and replaces the
  //   remaining queue when it changed; a single chain runs at a time, later requests just let it be.
  // - Hidden document: the rAF fallback pauses, idle callbacks keep the per-icon bound.
  const WARM_MIN_IDLE_MS = 8;
  const WARM_IDLE_MISS_LIMIT = 3;
  const WARM_IDLE_TIMEOUT_MS = 1000;
  const WARM_CACHE_HEADROOM = 32;
  const themeWarm = { scheduled: false, queue: [], key: "", misses: 0, fallback: false };
  function themeWarmJobs() {
    const ids = Object.keys(SG.THEMES || {});
    const sizes = new Map();
    legendIconJobs().forEach(j => {
      const w = j.cv.width, h = j.cv.height;
      if (w && h && j.type) sizes.set(`${j.type}|${j.side}|${w}x${h}`, { type: j.type, side: j.side, w, h });
    });
    const perTheme = [...sizes.values()];
    if (!perTheme.length || !ids.length) return { key: "", jobs: [] };
    const maxThemes = Math.max(0, Math.floor((ICON_CACHE_MAX - WARM_CACHE_HEADROOM) / perTheme.length) - 1);
    const active = currentFigureTheme().id;
    const at = ids.indexOf(active);
    const order = [];
    for (let i = 1; i <= ids.length && order.length < maxThemes; i++) {
      const id = ids[(Math.max(at, 0) + i) % ids.length];
      if (id !== active) order.push(id);
    }
    const jobs = [];
    order.forEach(themeId => perTheme.forEach(j => jobs.push({ themeId, type: j.type, side: j.side, w: j.w, h: j.h })));
    return { key: jobs.length ? `${active}|${order.join(",")}|${[...sizes.keys()].join(",")}` : "", jobs };
  }
  // Replace the remaining queue when the plan changed (theme switched, legend canvases resized).
  function refreshThemeWarmQueue() {
    let plan;
    try { plan = themeWarmJobs(); } catch (e) { plan = { key: "", jobs: [] }; }
    if (plan.key !== themeWarm.key) { themeWarm.key = plan.key; themeWarm.queue = plan.jobs; }
  }
  function scheduleThemeWarmSlice() {
    if (typeof requestIdleCallback === "function" && !themeWarm.fallback) {
      requestIdleCallback(runThemeWarm, { timeout: WARM_IDLE_TIMEOUT_MS });
    } else {
      requestAnimationFrame(() => setTimeout(runThemeWarm, 0));
    }
  }
  function runThemeWarm(deadline) {
    const idle = !!deadline && typeof deadline.timeRemaining === "function";
    try {
      if (iconRepaint.pending) return;                    // a real switch is repainting: retry later
      refreshThemeWarmQueue();
      const start = perf.on ? perfNow() : 0;
      let done = 0;
      while (themeWarm.queue.length) {
        if (idle && deadline.timeRemaining() < WARM_MIN_IDLE_MS) break;
        const j = themeWarm.queue.shift();
        done++;
        if (!SG.THEMES || !hasOwn.call(SG.THEMES, j.themeId)) continue;
        if (j.themeId === currentFigureTheme().id) continue;   // the active theme is handled by its repaint
        try { iconImage(j.type, j.side, j.w, j.h, j.themeId); }
        catch (err) { if (typeof console !== "undefined") console.warn("[Stygian Gambit] theme warm-up failed for", j.themeId, j.type, err); }
        if (perf.on) perf.warmIcons++;
        if (!idle) break;                                 // no idle deadline: one icon per task
      }
      // An idle slice that could not take a job is a miss; idle progress resets the count. Hitting the
      // limit latches fallback mode for this chain (fallback slices leave the state untouched).
      if (idle) {
        if (!done && themeWarm.queue.length) {
          if (++themeWarm.misses >= WARM_IDLE_MISS_LIMIT) themeWarm.fallback = true;
        } else themeWarm.misses = 0;
      }
      if (perf.on) perf.warmMs += perfNow() - start;
    } finally {
      if (themeWarm.queue.length) scheduleThemeWarmSlice();
      else { themeWarm.scheduled = false; themeWarm.key = ""; themeWarm.misses = 0; themeWarm.fallback = false; }
    }
  }
  function requestThemeWarm() {
    if (themeWarm.scheduled) return;                      // the running chain re-validates its plan per slice
    themeWarm.key = ""; themeWarm.queue = []; themeWarm.misses = 0; themeWarm.fallback = false;
    refreshThemeWarmQueue();
    if (!themeWarm.queue.length) return;
    themeWarm.scheduled = true;
    scheduleThemeWarmSlice();
  }

  function drawSlashes(ts) {
    for (const s of state.slashes) {
      const t = clamp((ts - s.startTs) / s.durationMs, 0, 1), colors = glyphColor(s.side);
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.angle);
      ctx.globalAlpha = (1 - t) * 0.95; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3.4 * s.size * (1 - t * 0.35);
      ctx.shadowColor = colors.glow; ctx.shadowBlur = 11;
      ctx.beginPath(); const len = TILE * 0.5 * s.size * (0.45 + t * 0.65); ctx.arc(0, 0, len, -0.85 + t * 0.5, 0.85 + t * 0.5); ctx.stroke();
      ctx.restore();
    }
  }
  function drawProjectiles(ts) {
    for (const pr of state.projectiles) {
      const t = clamp((ts - pr.startTs) / pr.durationMs, 0, 1), colors = glyphColor(pr.side);
      ctx.save();
      for (let i = 4; i >= 0; i--) {
        const tt = clamp(t - i * 0.06, 0, 1), x = lerp(pr.fromX, pr.toX, tt), y = lerp(pr.fromY, pr.toY, tt);
        ctx.globalAlpha = (1 - t * 0.3) * (1 - i / 6); ctx.shadowColor = colors.glow; ctx.shadowBlur = i === 0 ? 14 : 4;
        ctx.fillStyle = i === 0 ? "#ffffff" : colors.glow; ctx.beginPath(); ctx.arc(x, y, (pr.big ? 6.5 : 5) - i * 0.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
  function drawShockwaves(ts) {
    for (const s of state.shockwaves) {
      const t = clamp((ts - s.startTs) / s.durationMs, 0, 1);
      ctx.save(); ctx.globalAlpha = (1 - t) * 0.75; ctx.strokeStyle = s.color; ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.maxRadius * easeOutCubic(t), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  }
  function drawParticles() {
    for (const pt of state.particles) { ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1) * (pt.soft ? 0.65 : 1); ctx.fillStyle = pt.color; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  function drawDamageNumbers() {
    if (!state.damageNumbers.length) return;
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    for (const d of state.damageNumbers) {
      const a = clamp(d.life / d.maxLife, 0, 1);
      const X = d.screen ? d.x : sx(d.x), Y = (d.screen ? d.y : sy(d.y)) - (d.rise || 0);
      ctx.globalAlpha = a;
      ctx.font = "bold 15px Georgia";
      ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(8,4,12,0.92)"; ctx.strokeText(d.label, X, Y);
      ctx.fillStyle = d.color; ctx.fillText(d.label, X, Y);
    }
    ctx.restore();
    ctx.globalAlpha = 1; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }
  function drawImpactFlash() {
    if (!state.flash || state.reduceMotion) return;
    ctx.save(); ctx.globalAlpha = clamp(state.flash, 0, 0.45); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, BOARD_PX, BOARD_PX); ctx.restore();
  }

  // Board-space drawing; rotated 180° when this client plays the top side so its army sits at the bottom.
  function withWorld(fn) {
    ctx.save();
    if (state.viewFlip) { ctx.translate(BOARD_PX, BOARD_PX); ctx.rotate(Math.PI); }
    fn();
    ctx.restore();
  }

  function render(ts) {
    // Diagnostics segments (SG.perf); a single boolean check per segment while diagnostics are off.
    const P = perf.on;
    const renderStart = P ? perfNow() : 0;
    let mark = renderStart;
    const lap = P ? key => { const now = perfNow(); perfSeg[key] += now - mark; mark = now; } : null;
    ctx.save();
    if (state.shake > 0.1 && !state.reduceMotion) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    if (state.zoom > 0.001) {
      const z = 1 + state.zoom, fx = sx(state.zoomFocus.x), fy = sy(state.zoomFocus.y);
      ctx.translate(fx, fy); ctx.scale(z, z); ctx.translate(-fx, -fy);
    }
    withWorld(() => {
      if (boardCache) ctx.drawImage(boardCache, 0, 0);
      drawTerrain(ts);
    });
    drawAmbientParticles();                       // screen space: embers always drift upward
    if (P) lap("terrain");
    withWorld(() => {
      drawHighlights(ts);
      drawShockwaves(ts);
      if (P) lap("fx");
      const sorted = state.pieces.slice().sort((a, b) => (a.alive ? 0 : 1) - (b.alive ? 0 : 1));
      for (const p of sorted) drawPiece(p, ts);
      if (P) {
        lap("pieces");
        for (const p of sorted) if (p.alive || p.animState === "dying") perfSeg.figures++;
      }
      if (state.scene === "planning" && state.foresightOn) drawForesight(ts);
      drawPlanGhosts(ts);
      drawSlashes(ts);
      drawProjectiles(ts);
      drawParticles();
    });
    if (P) lap("fx");
    // Screen layer — text and markers stay upright and on-canvas.
    drawPieceMarkers();
    drawPlanBadges();
    drawDamageNumbers();
    drawImpactFlash();
    ctx.restore();
    if (P) { lap("screen"); perfSeg.render += mark - renderStart; }
  }

  /* ============================================================
   * UI SYNC
   * ============================================================ */
  const dom = {};
  ["startScreen","hud","gameOverScreen","planBar","boardActions","planLabel","btnWard","btnUndo","btnClear","btnValidate",
   "btnSummon","btnBid","crystalLight","crystalDark",
   "btnReplay","btnRevert","btnThreat","btnForesight","choiceScreen","choiceTitle","choiceSub","choiceOptions","choiceCancel",
   "btnHotseat","btnVsBot","btnSpectator","btnFateNew","btnFatePlay","fateCode","fateStatus","btnPlayAgain","btnMainMenu","btnQuit","turnBanner","eventLog","winnerHeadline","furyToggle","hazardToggle","harrowerToggle",
   "aegisLight","aegisDark","royalLight","royalDark","countLight","countDark","panelLight","panelDark","midPanel","titleSideLight","titleSideDark",
   "handoffScreen","handoffTitle","handoffText","btnHandoffReady",
   "auctionScreen","auctionTitle","auctionSub","auctionTimer","auctionControls","auctionOptions","auctionAmount","auctionCustomLabel",
   "auctionError","btnAuctionPass","btnAuctionLock","auctionReveal","btnAuctionContinue","btnAuctionQuit","btnAuctionRetry",
   "btnHelp","btnHelpGame","helpScreen","btnHelpClose","ledger","hallRecord",
   "difficulty","persona","movesPerRound","planSeconds","turnTimer","turnTimerLive","btnTrials","btnDaily","trialsScreen","trialsList","btnTrialsClose","hazardToggle",
   "btnOptions","btnOptionsGame","optionsScreen","btnOptionsClose","optReduceMotion","optColorGlyphs","optSpeed","optSpeedVal",
   "themeSelect","optThemeSelect",
   "btnDescend","btnMirror","boonScreen","boonList","boonTitle","mirrorScreen","btnMirrorClose","mirrorObols","mirrorUpgrades",
   "btnOnline","onlineScreen","onlineStatus","onlineSetup","onlineFury","onlineHarrower","btnCreateRoom","joinCode","btnJoinRoom","btnOnlineClose"].forEach(id => { dom[id] = document.getElementById(id); });

  function setPlanControlsVisible(visible) {
    dom.planBar.classList.toggle("hidden", !visible);
    dom.boardActions.classList.toggle("hidden", !visible);
  }

  function logEvent(text) {
    if (state.isReplay) return;
    state.eventLog.push(text);
    if (state.eventLog.length > 60) state.eventLog.shift();
    const div = document.createElement("div"); div.textContent = text; div.className = "log-enter";
    dom.eventLog.appendChild(div); dom.eventLog.scrollTop = dom.eventLog.scrollHeight;
  }
  // In battle the caption narrates the fight; in planning it's a short-lived note
  // (e.g. "Only 3 pieces may act each round") that used to be silently dropped.
  let planNoteTimer = null;
  function setCaption(text) {
    state.caption = text;
    if (state.scene === "battle") { refreshBanner(); return; }
    if (state.scene === "planning" && text) {
      state.planNote = text; state.planNoteUntil = performance.now() + 2600;
      refreshBanner();
      clearTimeout(planNoteTimer); planNoteTimer = setTimeout(refreshBanner, 2650);
    }
  }

  function refreshBanner() {
    if (!dom.turnBanner) return;
    let txt = "", note = false;
    const chamber = state.run && state.run.active ? t("banner.chamber", { name: t("chamber." + state.run.chamber), n: state.run.chamber + 1, total: CHAMBERS.length }) : "";
    if (state.mode === "spectator" && (state.scene === "planning" || state.scene === "battle")) {
      txt = t("banner.spectator", { round: state.roundNumber + 1 });
      if (state.caption) txt += " · " + state.caption;
    }
    else if (state.scene === "planning" && state.mode === "online" && state.onlineWaiting) txt = t("banner.waiting");
    else if (state.scene === "planning" && state.planNote && performance.now() < (state.planNoteUntil || 0)) { txt = state.planNote; note = true; }
    else if (state.scene === "planning" && state.summonArmed) { txt = t("banner.placing", { piece: pieceName(state.summonArmed) }); note = true; }
    else if (state.scene === "planning") txt = t("banner.planning", { chamber, side: sideLabel(state.planningSide), round: state.roundNumber + 1, first: sideLabel(resolveInitiative(state.crystalBid).first) });
    else if (state.scene === "battle") txt = (state.isReplay ? t("banner.replay") : "") + (state.caption || t("banner.battle"));
    else if (state.scene === "handoff") txt = t("banner.handoff");
    else if (state.scene === "auction") txt = t("banner.auction", { chamber, round: state.roundNumber + 1 });
    dom.turnBanner.textContent = txt;
    dom.turnBanner.classList.toggle("note", note);
    dom.turnBanner.classList.toggle("side-light", state.planningSide === "light");
    dom.turnBanner.classList.toggle("side-dark", state.planningSide === "dark");
  }

  /* ---- Timed planning (per-turn decision clock) ----
   * Policy, kept deliberately simple and exploit-free:
   *  - Only a HUMAN's local planning turn is timed (Local Duel, Duel the Bot, Trials, Daily, Descent).
   *    Each hotseat side gets its own full turn; the Warden's instant plan never touches the clock;
   *    Online Duels are untimed (no authoritative server clock exists to enforce one).
   *  - The clock is a fixed deadline on the monotonic clock (performance.now / rAF timestamps), so it
   *    never drifts with frame rate and is immune to wall-clock changes. It is NOT paused by Help,
   *    Options, a pick-one pop-up, a Replay or a hidden tab — time spent there is planning time.
   *    It stops for good when the turn is sealed (Validate / expiry), on the pass-device screen, in
   *    battle, at game over and on the menu. A new match replaces `state`, discarding any old clock.
   *  - On expiry the turn is sealed through the normal onValidate() path, exactly once: whatever was
   *    already ordered stands; an unanswered pop-up / an armed-but-unplaced summon never became an
   *    order and is dropped; no orders at all simply ends the side's turn (an empty plan).
   *    If it lapses mid-Replay (or while the tab was hidden), it fires on the first planning frame back. */
  let planClockGen = 0;   // generation token: a stale clock object can never seal a later turn
  function normalizePlanSeconds(v) {
    const n = parseInt(v, 10);
    return PLAN_SECONDS_OPTIONS.includes(n) ? n : PLAN_SECONDS_DEFAULT;
  }
  function planTimerEnabled() { return !!state && state.mode !== "online" && state.mode !== "spectator" && state.planSeconds > 0; }
  // Same monotonic timebase as rAF timestamps (falls back to Date.now when performance.now is missing).
  function monotonicNow() { return perfNow(); }
  // True once the running clock's deadline has passed, even if no frame has sealed the turn yet
  // (e.g. rAF was throttled in a background tab). Late input is then ignored; the next frame submits.
  function planClockExpired() {
    const c = state && state.planClock;
    return !!c && monotonicNow() >= c.deadline;
  }
  function planClockSecondsLeft(c, now) {
    return Math.max(0, Math.min(c.seconds, Math.ceil((c.deadline - now) / 1000)));
  }
  function formatClock(sec) { return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
  function announcePlanClock(text) { if (dom.turnTimerLive) dom.turnTimerLive.textContent = text; }
  // Writes the HUD countdown only when the shown second changes (once per second, never per frame).
  function renderPlanClock(now, force) {
    const el = dom.turnTimer;
    if (!el) return;
    const c = state && state.planClock;
    if (!c) {
      if (force || !el.classList.contains("hidden")) {
        el.classList.add("hidden");
        el.classList.remove("warn");
        el.textContent = "";
      }
      return;
    }
    const sec = planClockSecondsLeft(c, now);
    if (!force && sec === c.shownSec) return;
    c.shownSec = sec;
    el.textContent = t("timer.label", { time: formatClock(sec) });
    el.classList.toggle("warn", sec <= PLAN_WARN_SECONDS);
    el.classList.toggle("calm", !!state.reduceMotion);   // in-game Reduce Motion option: no warning pulse
    el.classList.toggle("side-light", c.side === "light");
    el.classList.toggle("side-dark", c.side === "dark");
    el.classList.remove("hidden");
  }
  function stopPlanClock() {
    if (!state) return;
    state.planClock = null;
    renderPlanClock(0, true);
  }
  // Starts a fresh, full clock for whoever is planning right now (no-op → untimed for online / AI).
  function startPlanClock() {
    if (!planTimerEnabled() || state.scene !== "planning" || state.isReplay) { stopPlanClock(); return; }
    if (state.mode === "bot" && state.planningSide !== state.humanSide) { stopPlanClock(); return; }
    const now = monotonicNow();
    const side = state.planningSide;
    state.planClock = {
      gen: ++planClockGen, side, round: state.roundNumber, seconds: state.planSeconds,
      startedAt: now, deadline: now + state.planSeconds * 1000,
      fired: false, warned: false, shownSec: -1,
    };
    renderPlanClock(now, true);
    announcePlanClock(t("timer.start", { side: sideLabel(side), n: state.planSeconds }));
  }
  // Called every animation frame with its timestamp.
  function tickPlanClock(now) {
    const c = state.planClock;
    if (!c) return;
    const replaying = state.scene === "battle" && state.isReplay;
    if (state.scene !== "planning" && !replaying) { stopPlanClock(); return; }   // safety net
    renderPlanClock(now, false);
    const sec = planClockSecondsLeft(c, now);
    if (!c.warned && sec > 0 && sec <= PLAN_WARN_SECONDS) {
      c.warned = true;
      announcePlanClock(t("timer.warn", { n: sec }));
    }
    if (c.fired || now < c.deadline || replaying) return;   // a Replay finishes first, then the turn seals
    c.fired = true;
    expirePlanClock(c.gen);
  }
  // Time's up: seal the current turn exactly once through the normal submit path.
  function expirePlanClock(gen) {
    const c = state.planClock;
    if (!c || c.gen !== gen) return false;
    if (state.scene !== "planning" || state.isReplay || state.planningSide !== c.side || state.planLocked[c.side]) {
      stopPlanClock();
      return false;
    }
    if (choiceOpen()) cancelChoice();               // an unanswered pop-up never became an order
    state.summonArmed = null; state.wardMode = false; state.pendingReaperStrike = null;
    const who = sideLabel(c.side);
    logEvent(t("log.timeUp", { side: who }));
    announcePlanClock(t("timer.expired", { side: who }));
    onValidate();                                   // stops the clock and moves on (handoff / battle)
    if (state.planClock === c) stopPlanClock();     // defensive: never leave a spent clock behind
    return true;
  }

  /* ---- Initiative auction (one sealed bid per side, before anyone plans) ----
   * Flow per round: beginPlanningPhase → beginAuction → bid dialog(s) → reveal → enterPlanningTurn.
   *  - Same currency and rules as before (multiples of 20◆ up to what the side holds; see resolveInitiative).
   *    The revealed bids land in state.crystalBid exactly where the old in-plan "Initiative" button put
   *    them, so the summon reserve, the payment when the clash begins and its log lines are unchanged.
   *    The planning-stage bid button is now a read-only display: there is no second bid.
   *  - Sealed: bids live in state.auction.bids until every bid is in. Nothing about a bid (amount, pass,
   *    timeout) is shown, logged or announced before the reveal; the input is cleared after each lock.
   *  - Local Duel: Light bids → pass-device screen → Dark bids → reveal (its button hands the device back
   *    to Light, whose full planning turn starts only then). Duel the Bot: the Warden seals its bid from
   *    public information (SG.AI.planBid) before the human's bid exists. A side that cannot afford 20◆
   *    passes automatically (public: crystal counts are on screen).
   *  - Each local human bidder gets their own AUCTION clock (AUCTION_SECONDS, monotonic deadline),
   *    separate from the planning clock, which never runs during the auction. Expiry = a pass, sealed
   *    exactly once through lockAuctionBid; the timeout is reported at the reveal, not before.
   *  - Online: both clients write their bid to the room (rounds/N/bids) before any plan; untimed, like
   *    online planning (no authoritative clock). Both clients validate both bids identically.
   *  - One auction per round: Replay and Undo Round restore the round's revealed bids (snapshot field
   *    auctionDone) instead of re-running it. */
  let auctionGen = 0;         // a stale auction object can never act on a later one
  let auctionClockGen = 0;    // a stale bid clock can never seal a later bidder
  let auctionOptionButtons = [];
  function maxBidFor(side) {
    const have = (state.crystals && state.crystals[side]) || 0;
    return Math.floor(Math.max(0, have) / BID_STEP) * BID_STEP;
  }
  // Strict bid format: a whole number of crystals, a multiple of 20, from 0 up to maxBid. Anything else → null.
  function normalizeBid(raw, maxBid) {
    if (typeof raw === "number") { if (!Number.isFinite(raw)) return null; raw = String(raw); }
    if (typeof raw !== "string") return null;
    const s = raw.trim();
    if (!/^\d{1,6}$/.test(s)) return null;
    const n = parseInt(s, 10);
    if (n % BID_STEP !== 0 || n > maxBid) return null;
    return n;
  }
  // Quick amounts mirror the old bid pop-up: 20…100◆, plus "all in" when more is affordable.
  function auctionQuickAmounts(max) {
    const out = [];
    for (let n = BID_STEP; n <= Math.min(5 * BID_STEP, max); n += BID_STEP) out.push(n);
    if (max > 5 * BID_STEP) out.push(max);
    return out;
  }
  function setAttr(el, name, value) { if (el && typeof el.setAttribute === "function") el.setAttribute(name, value); }
  function auctionActive() { return !!state && state.scene === "auction" && !!state.auction; }
  // The Warden's sealed bid: only public information, never the human's bid (which doesn't exist yet).
  function aiAuctionBid(side) {
    let bid = 0;
    try {
      const AI = window.SG && window.SG.AI;
      if (AI && typeof AI.planBid === "function") bid = AI.planBid(side, state.difficulty);
    } catch (e) { bid = 0; }
    const ok = normalizeBid(bid, maxBidFor(side));
    return ok == null ? 0 : ok;
  }

  function beginAuction() {
    stopPlanClock();
    stopAuctionClock();
    closeChoice();
    state.onlineBidsPending = (state.onlineBidsPending && state.onlineBidsPending.round === state.roundNumber) ? state.onlineBidsPending : null;
    const a = state.auction = {
      gen: ++auctionGen, round: state.roundNumber, phase: "start",
      bids: { light: null, dark: null }, timedOut: { light: false, dark: false },
      queue: [], cur: null, asked: [], holder: "light",
      online: state.mode === "online", submitted: false, autoPass: false, result: null,
    };
    const canBid = s => maxBidFor(s) >= BID_STEP;
    if (a.online) {
      // Affordability is identical on both clients, so a round where nobody can bid needs no exchange.
      if (!canBid("light") && !canBid("dark")) { a.bids.light = a.bids.dark = 0; revealAuction(); return; }
      state.scene = "auction";
      setPlanControlsVisible(false);
      refreshBanner();
      if (canBid(state.humanSide)) openAuctionDialog(state.humanSide);
      else { a.cur = state.humanSide; a.phase = "bid"; a.autoPass = true; sealAuctionBid(state.humanSide, 0, false); }
      return;
    }
    for (const s of ["light", "dark"]) if (!canBid(s)) a.bids[s] = 0;
    if (state.mode === "bot") {
      const botSide = otherSide(state.humanSide);
      if (a.bids[botSide] == null) a.bids[botSide] = aiAuctionBid(botSide);
    }
    a.queue = (state.mode === "hotseat" ? ["light", "dark"] : [state.humanSide]).filter(s => a.bids[s] == null);
    if (!a.queue.length) { revealAuction(); return; }   // nobody to ask
    state.scene = "auction";
    setPlanControlsVisible(false);
    refreshBanner();
    nextAuctionBidder();
  }
  function nextAuctionBidder() {
    const a = state.auction;
    if (!a.queue.length) { revealAuction(); return; }
    const side = a.queue.shift();
    // Local Duel: whoever holds the device bids; anyone else gets the private pass-device screen first.
    if (state.mode === "hotseat" && side !== a.holder) showAuctionHandoff(side);
    else openAuctionDialog(side);
  }
  function showAuctionHandoff(side) {
    const a = state.auction;
    a.phase = "handoff"; a.cur = side;
    stopAuctionClock();
    hideAuctionScreen();
    renderAuctionHandoff();
    dom.handoffScreen.classList.remove("hidden");
    if (dom.hud) dom.hud.inert = true;
    refreshBanner();
    if (dom.btnHandoffReady && dom.btnHandoffReady.focus) dom.btnHandoffReady.focus();
  }
  function renderAuctionHandoff() {
    const a = state.auction;
    const prev = a.asked.length ? a.asked[a.asked.length - 1] : null;
    dom.handoffTitle.textContent = t("handoff.title");
    dom.handoffText.textContent = prev
      ? t("auction.handoffText", { prev: sideLabel(prev), side: sideLabel(a.cur) })
      : t("auction.handoffTextFirst", { side: sideLabel(a.cur) });
    dom.btnHandoffReady.textContent = t("auction.handoffReady", { side: sideLabel(a.cur) });
  }
  function onAuctionHandoffReady() {
    const a = state.auction;
    if (!auctionActive() || a.phase !== "handoff") return;   // a stray second click does nothing
    dom.handoffScreen.classList.add("hidden");
    openAuctionDialog(a.cur);
  }
  function openAuctionDialog(side) {
    const a = state.auction;
    a.phase = "bid"; a.cur = side; a.holder = side;
    a.asked.push(side);
    renderAuctionDialog(true);           // fresh: an empty slate, nothing left from a previous bidder
    showAuctionScreen();
    if (!a.online) startAuctionClock(side);
    refreshBanner();
    const first = auctionOptionButtons.length ? auctionOptionButtons[0].b : dom.auctionAmount;
    if (first && first.focus) first.focus();
  }
  // Seals the current bidder's bid exactly once: a lock / pass click ("manual") or the clock ("timeout").
  function lockAuctionBid(side, raw, reason) {
    const a = state.auction;
    if (!auctionActive() || a.phase !== "bid" || a.cur !== side) return false;
    if (reason !== "timeout" && auctionClockExpired()) return false;   // too late: the next frame passes for them
    const max = maxBidFor(side);
    const amount = normalizeBid(raw, max);
    if (amount == null) { showAuctionError(t("auction.errInvalid", { max })); return false; }
    sealAuctionBid(side, amount, reason === "timeout");
    return true;
  }
  function sealAuctionBid(side, amount, timedOut) {
    const a = state.auction;
    stopAuctionClock();
    a.bids[side] = amount;
    a.timedOut[side] = !!timedOut;
    a.phase = "sealed";
    clearAuctionInput();                  // nothing of this bid stays on screen for the next bidder
    if (!a.autoPass) announcePlanClock(t("auction.sealed", { side: sideLabel(side) }));   // same words for a pass or a timeout
    if (a.online) {
      a.submitted = true;
      sendOnlineBid(a);
      return;
    }
    hideAuctionScreen();
    nextAuctionBidder();
  }
  // Online: write this side's sealed bid to the room. The reveal needs both bids confirmed by the room
  // (SG.Net only reports them once our own write was accepted); a rejected write leaves the auction in a
  // visible "bidError" state with Retry / Main Menu, never a silent wait. One write in flight at a time.
  function sendOnlineBid(a) {
    a.phase = "waiting";                    // set first: the room may echo both bids synchronously
    a.bidError = null;
    const attempt = a.bidAttempt = (a.bidAttempt || 0) + 1;
    renderAuctionDialog(false);
    showAuctionScreen();
    if (SG.Net && typeof SG.Net.submitBid === "function") {
      SG.Net.submitBid(a.round, a.bids[state.humanSide] || 0, err => onOnlineBidWritten(a, attempt, err));
    }
    const pend = state.onlineBidsPending;
    if (pend && pend.round === a.round && state.auction === a && a.phase === "waiting") {
      state.onlineBidsPending = null;
      applyOnlineBids(pend.round, pend.bids);
    }
  }
  function onOnlineBidWritten(a, attempt, err) {
    if (!err) return;                       // accepted: keep waiting for the opponent's confirmed bid
    // Stale results (left the match, a newer attempt, or already revealed) change nothing.
    if (state.mode !== "online" || state.auction !== a || !auctionActive() || a.bidAttempt !== attempt || a.phase !== "waiting") return;
    a.phase = "bidError";
    a.bidError = String(err);
    renderAuctionDialog(false);
    showAuctionScreen();
    announcePlanClock(t("auction.errSubmit"));
    if (dom.btnAuctionRetry && dom.btnAuctionRetry.focus) dom.btnAuctionRetry.focus();
  }
  function retryOnlineBid() {
    const a = state.auction;
    if (!auctionActive() || !a.online || a.phase !== "bidError") return false;   // never two writes in flight
    sendOnlineBid(a);                       // the same sealed amount: a bid can't change once sealed
    return true;
  }
  // Online: both sealed bids arrived from the room. Invalid values count as no bid — on both clients alike.
  function applyOnlineBids(round, bids) {
    const a = state.auction;
    if (state.mode !== "online") return;
    if (!auctionActive() || !a.online || a.round !== round || a.phase !== "waiting") {   // incl. "bidError": revealed only after a retry
      if (round >= state.roundNumber) state.onlineBidsPending = { round, bids };
      return;
    }
    for (const s of ["light", "dark"]) {
      const v = normalizeBid(bids ? bids[s] : null, maxBidFor(s));
      a.bids[s] = v == null ? 0 : v;
    }
    revealAuction();
  }
  function auctionBidText(side, a) {
    const n = a.bids[side] || 0;
    if (n > 0) return t("auction.revealBid", { side: sideLabel(side), n });
    return t(a.timedOut[side] ? "auction.revealTimeout" : "auction.revealPass", { side: sideLabel(side) });
  }
  function auctionResultText(ini) {
    if (ini.outcome === "light" || ini.outcome === "dark") {
      const loser = otherSide(ini.outcome);
      let s = t("auction.resultWon", { side: sideLabel(ini.outcome), n: ini.pay[ini.outcome] });
      if (ini.pay[loser] > 0) s += " " + t("auction.resultLoser", { side: sideLabel(loser), n: ini.pay[loser] });
      return s;
    }
    if (ini.outcome === "tie") return t("auction.resultTie", { n: ini.bids.light, side: sideLabel(ini.first), paid: ini.pay.light });
    return t("auction.resultNone", { side: sideLabel(ini.first) });
  }
  function revealAuction() {
    const a = state.auction;
    stopAuctionClock();
    const bids = { light: a.bids.light || 0, dark: a.bids.dark || 0 };
    state.crystalBid = { light: bids.light, dark: bids.dark };
    state.auctionDone = true;
    // The round-start snapshots carry the revealed bids: Undo Round and the online re-sync never re-auction.
    const h = state.history[state.history.length - 1];
    if (h && h.roundNumber === state.roundNumber) { h.crystalBid = { light: bids.light, dark: bids.dark }; h.auctionDone = true; }
    if (state.mode === "online" && onlineRoundSnap && onlineRoundSnap.roundNumber === state.roundNumber) {
      onlineRoundSnap.crystalBid = { light: bids.light, dark: bids.dark };
      onlineRoundSnap.auctionDone = true;
    }
    const ini = a.result = resolveInitiative(bids);
    const anyBid = bids.light > 0 || bids.dark > 0;
    const shown = a.asked.length > 0 || a.submitted || anyBid;
    for (const s of ["light", "dark"]) if (a.timedOut[s]) logEvent(t("log.auctionTimeout", { side: sideLabel(s) }));
    if (shown) logEvent(t("log.auctionReveal", {
      lightSide: sideLabel("light"), light: bids.light, darkSide: sideLabel("dark"), dark: bids.dark, first: sideLabel(ini.first),
    }));
    if (!shown) { a.phase = "done"; hideAuctionUI(); enterPlanningTurn(); return; }   // nobody could bid: straight to planning
    a.phase = "reveal";
    state.scene = "auction";
    setPlanControlsVisible(false);
    if (dom.handoffScreen) dom.handoffScreen.classList.add("hidden");
    renderAuctionDialog(false);
    showAuctionScreen();
    announcePlanClock(t("auction.revealTitle") + " — " + auctionBidText("light", a) + " · " + auctionBidText("dark", a) + ". " + auctionResultText(ini));
    syncSidePanels();
    refreshBanner();
    if (dom.btnAuctionContinue && dom.btnAuctionContinue.focus) dom.btnAuctionContinue.focus();
  }
  function onAuctionContinue() {
    const a = state.auction;
    if (!auctionActive() || a.phase !== "reveal") return;   // exactly once
    a.phase = "done";
    hideAuctionUI();
    enterPlanningTurn();                  // the planner's full configured turn starts only now
  }

  /* -- auction dialog (DOM) -- */
  function showAuctionScreen() {
    if (!dom.auctionScreen) return;
    dom.auctionScreen.classList.remove("hidden");
    if (dom.hud) dom.hud.inert = true;    // no board / plan-bar input while the auction is up
  }
  function hideAuctionScreen() {
    if (dom.auctionScreen) dom.auctionScreen.classList.add("hidden");
    if (dom.hud && !choiceOpen()) dom.hud.inert = false;
  }
  // Full cleanup (main menu, new match, opponent left, game over): no clock, no dialog.
  function hideAuctionUI() {
    stopAuctionClock();
    hideAuctionScreen();
    clearAuctionInput();
  }
  function showAuctionError(msg) { if (dom.auctionError) dom.auctionError.textContent = msg || ""; }
  function clearAuctionInput() {
    if (dom.auctionAmount) dom.auctionAmount.value = "";
    if (dom.auctionOptions) dom.auctionOptions.innerHTML = "";
    auctionOptionButtons = [];
    showAuctionError("");
  }
  function syncAuctionPressed() {
    const v = dom.auctionAmount ? String(dom.auctionAmount.value).trim() : "";
    for (const o of auctionOptionButtons) setAttr(o.b, "aria-pressed", v === String(o.n) ? "true" : "false");
  }
  function selectAuctionAmount(n) {
    const a = state.auction;
    if (!auctionActive() || a.phase !== "bid" || auctionClockExpired()) return;
    if (dom.auctionAmount) dom.auctionAmount.value = String(n);
    showAuctionError("");
    syncAuctionPressed();
  }
  function setHidden(el, hidden) { if (el) el.classList.toggle("hidden", !!hidden); }
  function renderAuctionDialog(fresh) {
    const a = state.auction;
    if (!a || !dom.auctionScreen) return;
    const bidding = a.phase === "bid", reveal = a.phase === "reveal";
    const side = a.cur || state.humanSide;
    setHidden(dom.auctionControls, !bidding);
    setHidden(dom.auctionReveal, !reveal);
    setHidden(dom.btnAuctionContinue, !reveal);
    setHidden(dom.btnAuctionQuit, !(a.online && (bidding || a.phase === "waiting" || a.phase === "bidError")));
    setHidden(dom.btnAuctionRetry, !(a.online && a.phase === "bidError"));
    dom.auctionScreen.classList.toggle("side-light", bidding && side === "light");
    dom.auctionScreen.classList.toggle("side-dark", bidding && side === "dark");
    const untimedNote = a.online ? "<br>" + t("auction.onlineUntimed") : "";
    if (bidding) {
      const max = maxBidFor(side);
      const keep = fresh ? "0" : (dom.auctionAmount ? dom.auctionAmount.value : "0");
      if (dom.auctionTitle) dom.auctionTitle.textContent = t("auction.title", { side: sideLabel(side) });
      if (dom.auctionSub) dom.auctionSub.innerHTML = t("auction.sub", { have: state.crystals[side] || 0, max }) + untimedNote;
      if (dom.auctionOptions) {
        dom.auctionOptions.innerHTML = "";
        setAttr(dom.auctionOptions, "aria-label", t("auction.quick"));
      }
      auctionOptionButtons = [];
      for (const n of auctionQuickAmounts(max)) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn-ghost auction-option";
        const allIn = n > 5 * BID_STEP;
        b.textContent = allIn ? t("auction.allIn", { n }) : `${n}◆`;
        setAttr(b, "aria-label", t("auction.optionAria", { n }));
        b.addEventListener("click", () => selectAuctionAmount(n));
        if (dom.auctionOptions) dom.auctionOptions.appendChild(b);
        auctionOptionButtons.push({ b, n });
      }
      if (dom.auctionAmount) {
        dom.auctionAmount.min = "0"; dom.auctionAmount.step = String(BID_STEP); dom.auctionAmount.max = String(max);
        dom.auctionAmount.value = keep;
      }
      if (dom.auctionCustomLabel) dom.auctionCustomLabel.textContent = t("auction.custom", { max });
      if (dom.btnAuctionPass) dom.btnAuctionPass.textContent = t("auction.pass");
      if (dom.btnAuctionLock) dom.btnAuctionLock.textContent = t("auction.lock");
      if (fresh) showAuctionError("");
      syncAuctionPressed();
    } else if (a.phase === "waiting") {
      if (dom.auctionTitle) dom.auctionTitle.textContent = t("auction.waitingTitle");
      if (dom.auctionSub) dom.auctionSub.innerHTML = t(a.autoPass ? "auction.waitingNoFunds" : "auction.waiting") + untimedNote;
    } else if (a.phase === "bidError") {
      if (dom.auctionTitle) dom.auctionTitle.textContent = t("auction.errSubmitTitle");
      if (dom.auctionSub) dom.auctionSub.textContent = t("auction.errSubmit");
      if (dom.btnAuctionRetry) dom.btnAuctionRetry.textContent = t("auction.retry");
    } else if (reveal) {
      const ini = a.result || resolveInitiative(a.bids);
      if (dom.auctionTitle) dom.auctionTitle.textContent = t("auction.revealTitle");
      if (dom.auctionSub) dom.auctionSub.innerHTML = "";
      if (dom.auctionReveal) {
        dom.auctionReveal.innerHTML = "";
        for (const line of [auctionBidText("light", a), auctionBidText("dark", a), auctionResultText(ini)]) {
          const p = document.createElement("p");
          p.textContent = line;
          dom.auctionReveal.appendChild(p);
        }
      }
      if (dom.btnAuctionContinue) {
        dom.btnAuctionContinue.textContent = state.mode === "hotseat"
          ? t("auction.continueHotseat", { side: sideLabel(state.planningSide) })
          : t("auction.continue");
      }
    }
  }

  /* -- auction clock: distinct from the planning clock (own state field, generation and DOM) -- */
  function auctionTimerEnabled() { return !!state && state.mode !== "online"; }
  function auctionClockExpired() {
    const c = state && state.auctionClock;
    return !!c && monotonicNow() >= c.deadline;
  }
  function renderAuctionClock(now, force) {
    const el = dom.auctionTimer;
    if (!el) return;
    const c = state && state.auctionClock;
    if (!c) {
      if (force || !el.classList.contains("hidden")) { el.classList.add("hidden"); el.classList.remove("warn"); el.textContent = ""; }
      return;
    }
    const sec = planClockSecondsLeft(c, now);
    if (!force && sec === c.shownSec) return;
    c.shownSec = sec;
    el.textContent = t("timer.label", { time: formatClock(sec) });
    el.classList.toggle("warn", sec <= AUCTION_WARN_SECONDS);
    el.classList.toggle("calm", !!state.reduceMotion);
    el.classList.remove("hidden");
  }
  function stopAuctionClock() {
    if (!state) return;
    state.auctionClock = null;
    renderAuctionClock(0, true);
  }
  function startAuctionClock(side) {
    const a = state.auction;
    if (!auctionTimerEnabled() || !auctionActive() || a.phase !== "bid" || a.cur !== side) { stopAuctionClock(); return; }
    const now = monotonicNow();
    state.auctionClock = {
      kind: "auction", gen: ++auctionClockGen, auctionGen: a.gen, side, round: a.round, seconds: AUCTION_SECONDS,
      startedAt: now, deadline: now + AUCTION_SECONDS * 1000, fired: false, warned: false, shownSec: -1,
    };
    renderAuctionClock(now, true);
    announcePlanClock(t("auction.timerStart", { side: sideLabel(side), n: AUCTION_SECONDS }));
  }
  // Called every animation frame with its timestamp.
  function tickAuctionClock(now) {
    const c = state.auctionClock;
    if (!c) return;
    const a = state.auction;
    if (!auctionActive() || a.gen !== c.auctionGen || a.phase !== "bid" || a.cur !== c.side) { stopAuctionClock(); return; }   // safety net
    renderAuctionClock(now, false);
    const sec = planClockSecondsLeft(c, now);
    if (!c.warned && sec > 0 && sec <= AUCTION_WARN_SECONDS) { c.warned = true; announcePlanClock(t("timer.warn", { n: sec })); }
    if (c.fired || now < c.deadline) return;
    c.fired = true;
    expireAuctionClock(c.gen);
  }
  // Time's up: the bidder silently passes (0◆), sealed exactly once; the reveal says it timed out.
  function expireAuctionClock(gen) {
    const c = state.auctionClock;
    if (!c || c.gen !== gen) return false;
    const a = state.auction;
    if (!auctionActive() || a.gen !== c.auctionGen || a.phase !== "bid" || a.cur !== c.side) { stopAuctionClock(); return false; }
    return lockAuctionBid(c.side, "0", "timeout");
  }

  function aegisStr(side) {
    const max = Math.max(state.aegisMax[side], state.aegis[side]);
    let s = "";
    for (let i = 0; i < max; i++) {
      const bonus = i >= AEGIS_START ? " bonus" : "";              // charges from Mirror / Easy / Hecate
      s += i < state.aegis[side] ? `<span class='pip${bonus}'>⛨</span>` : `<span class='spent${bonus}'>⛨</span>`;
    }
    return s + ` <span class='aegis-count'>${state.aegis[side]}/${max}</span>`;
  }
  function royalStr(side) {
    const k = state.pieces.find(p => p.type === "sovereign" && p.side === side);
    const q = state.pieces.find(p => p.type === "reaper" && p.side === side);
    function pips(p, cls, glyph) {
      if (!p || !p.alive) return `<span class='${cls}'>${glyph}</span> ☠`;
      let s = `<span class='${cls}'>${glyph}</span> `;
      for (let i = 0; i < p.maxLives; i++) s += i < p.lives ? "●" : "<span class='pip-lost'>●</span>";
      return s;
    }
    return pips(k, "king", "♛") + " &nbsp; " + pips(q, "queen", "♕");
  }
  function syncSidePanels() {
    if (state.mode === "bot" || state.mode === "online") {
      const humanSide = state.humanSide;
      const opponentSide = otherSide(humanSide);
      dom.panelLight.style.order = humanSide === "light" ? "1" : "3";
      dom.midPanel.style.order = "2";
      dom.panelDark.style.order = humanSide === "dark" ? "1" : "3";
      dom.titleSideLight.textContent = humanSide === "light"
        ? `${sideLabel(humanSide)} (${t("hud.you")})`
        : sideLabel(opponentSide);
      dom.titleSideDark.textContent = humanSide === "dark"
        ? `${sideLabel(humanSide)} (${t("hud.you")})`
        : sideLabel(opponentSide);
    } else {
      dom.panelLight.style.order = "1";
      dom.midPanel.style.order = "2";
      dom.panelDark.style.order = "3";
      dom.titleSideLight.textContent = sideLabel("light");
      dom.titleSideDark.textContent = sideLabel("dark");
    }
    dom.aegisLight.innerHTML = aegisStr("light");
    dom.aegisDark.innerHTML = aegisStr("dark");
    dom.crystalLight.textContent = state.crystals.light;
    dom.crystalDark.textContent = state.crystals.dark;
    dom.royalLight.innerHTML = royalStr("light");
    dom.royalDark.innerHTML = royalStr("dark");
    dom.countLight.textContent = state.pieces.filter(p => p.alive && p.side === "light").length;
    dom.countDark.textContent = state.pieces.filter(p => p.alive && p.side === "dark").length;
  }

  /* ---- Choice pop-up: every moment the player must pick between options ---- */
  let choiceCancelFn = null;
  let choiceClosedAt = 0;          // swallow the 2nd click of a double-click that lands on the board
  function choiceOpen() { return dom.choiceScreen && !dom.choiceScreen.classList.contains("hidden"); }
  function openChoice(opts) {
    dom.choiceTitle.textContent = opts.title;
    dom.choiceSub.innerHTML = opts.sub || "";
    dom.choiceOptions.innerHTML = "";
    for (const o of opts.options) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice-card btn btn-ghost";
      b.disabled = !!o.disabled;
      if (o.icon) {
        const cv = document.createElement("canvas");
        cv.width = 52; cv.height = 52; cv.className = "choice-icon";
        paintIcon(cv, o.icon.type, o.icon.side);
        b.appendChild(cv);
      }
      const t = document.createElement("span");
      t.className = "choice-text";
      t.innerHTML = `<span class="choice-label">${o.label}</span>${o.desc ? `<span class="choice-desc">${o.desc}</span>` : ""}`;
      b.appendChild(t);
      if (o.badge) { const g = document.createElement("span"); g.className = "choice-badge"; g.textContent = o.badge; b.appendChild(g); }
      b.addEventListener("click", () => { if (planClockExpired()) return; closeChoice(); o.onPick(); });   // too late: the next frame seals the turn
      dom.choiceOptions.appendChild(b);
    }
    dom.choiceCancel.textContent = opts.cancelLabel || t("choice.cancel");
    choiceCancelFn = opts.onCancel || null;
    dom.choiceScreen.classList.remove("hidden");
    if (dom.hud) dom.hud.inert = true;             // board + plan bar unreachable (mouse and keyboard) while choosing
    const first = dom.choiceOptions.querySelector("button:not(:disabled)") || dom.choiceCancel;
    first.focus();
  }
  function closeChoice() {
    if (choiceOpen()) choiceClosedAt = performance.now();
    if (dom.choiceScreen) dom.choiceScreen.classList.add("hidden");
    if (dom.hud) dom.hud.inert = false;
    choiceCancelFn = null;
  }
  function cancelChoice() { const fn = choiceCancelFn; closeChoice(); if (fn) fn(); }

  function openSummonChoice() {
    const side = state.planningSide, have = state.crystals[side] - ((state.crystalBid && state.crystalBid[side]) || 0);
    const room = homeTilesFor(side).length > 0;
    openChoice({
      title: t("summon.title"),
      sub: t(room ? "summon.sub" : "summon.subNoRoom", { have }),
      options: SUMMON_OPTIONS.map(o => ({
        icon: { type: o.type, side }, label: pieceName(o.type), desc: t("summon.desc." + o.type), badge: `${o.cost}◆`,
        disabled: !room || have < o.cost,
        onPick: () => { state.summonArmed = o.type; clearSelection(); updatePlanBar(); },
      })),
    });
  }
  function openReaperChoice() {
    const pend = state.pendingReaperStrike;
    const reaper = pend && pieceById(pend.pieceId), target = pend && pieceById(pend.targetId);
    if (!reaper || !target) { cancelReaperChoice(); return; }
    const radius = hasBoon(reaper.side, "ares") ? 2 : 1;
    const inReach = state.pieces.filter(o => o.alive && o.side !== reaper.side && chebyshev(reaper, o) <= radius).length;
    openChoice({
      title: t("reaper.title"),
      sub: t("reaper.sub", { target: describePiece(target) }),
      options: [
        { icon: { type: "reaper", side: reaper.side }, label: t("reaper.spiral"),
          desc: t(radius === 2 ? "reaper.spiralDesc2" : "reaper.spiralDesc", { n: inReach }),
          onPick: () => commitReaperStrike("spiral") },
        { icon: { type: target.type, side: target.side }, label: t("reaper.advance"),
          desc: t("reaper.advanceDesc", { piece: pieceName(target.type) }),
          onPick: () => commitReaperStrike("advance") },
      ],
      onCancel: () => cancelReaperChoice(),
    });
  }
  function summonedThisTurn(p) { return !!p && state.undoStack.some(a => a.type === "summon" && a.pieceId === p.id); }
  function openSummonedChoice(p) {
    const entry = state.undoStack.find(a => a.type === "summon" && a.pieceId === p.id);
    const label = pieceName(p.type);
    const canOrder = state.mode !== "online";
    const options = [{
      icon: { type: p.type, side: p.side }, label: t("fresh.cancel"),
      desc: t(p.warded ? "fresh.cancelDescAegis" : "fresh.cancelDesc", { piece: label, cost: entry ? entry.cost : 0 }),
      onPick: () => cancelSummon(p.id),
    }];
    if (canOrder) options.push({ label: t("fresh.order"), desc: t("fresh.orderDesc"), onPick: () => selectPiece(p) });
    openChoice({
      title: t("fresh.title", { piece: label }),
      sub: t(canOrder ? "fresh.sub" : "fresh.subOnline"),
      options, cancelLabel: t("choice.keep"),
    });
  }
  // Take back a summon placed this turn (any order, not only the latest action).
  function removeSummoned(entry) {
    const i = state.pieces.findIndex(p => p.id === entry.pieceId);
    if (i >= 0) state.pieces.splice(i, 1);
    state.crystals[entry.side] += entry.cost;
    state.plan[state.planningSide] = state.plan[state.planningSide].filter(c => c.pieceId !== entry.pieceId);
    if (!state.isReplay && state.stats[entry.side]) state.stats[entry.side].summons = Math.max(0, state.stats[entry.side].summons - 1);
  }
  // When a piece leaves the board mid-plan, an order may have relied on it (a Harrower teleports
  // beside an ally). Drop orders that are no longer legal instead of letting them fizzle in battle.
  function pruneStaleMoves(side) {
    const grid = buildOccupancyGrid(state.pieces);
    const stale = new Set(state.plan[side].filter(c => {
      if (c.kind !== "move") return false;
      const q = pieceById(c.pieceId);
      return !q || !getMoveTiles(q, grid).some(t => t.row === c.row && t.col === c.col);
    }).map(c => c.pieceId));
    if (!stale.size) return 0;
    state.plan[side] = state.plan[side].filter(c => !stale.has(c.pieceId));
    state.undoStack = state.undoStack.filter(a => !((a.type === "command" || a.type === "commandEdit") && stale.has(a.pieceId)));
    return stale.size;
  }
  function refundNote(cost, dropped) {
    return t(!dropped ? "note.refund" : dropped === 1 ? "note.refundDropped1" : "note.refundDroppedN", { cost, n: dropped });
  }
  function cancelSummon(pieceId) {
    const side = state.planningSide;
    const entry = state.undoStack.find(a => a.type === "summon" && a.pieceId === pieceId);
    if (!entry) return;
    const p = pieceById(pieceId);
    if (p && p.warded) {
      state.aegis[side] = Math.min(state.aegisMax[side], state.aegis[side] + 1);
      if (state.stats[side]) state.stats[side].aegisUsed = Math.max(0, state.stats[side].aegisUsed - 1);
    }
    state.undoStack = state.undoStack.filter(a => a.pieceId !== pieceId);   // its ward / order entries go too
    removeSummoned(entry);
    setCaption(t("note.summonCancelled", { refund: refundNote(entry.cost, pruneStaleMoves(side)) }));
    clearSelection(); syncSidePanels(); updatePlanBar();
  }

  function updatePlanBar() {
    if (state.scene !== "planning") { setPlanControlsVisible(false); return; }
    if (state.mode === "spectator") { setPlanControlsVisible(false); refreshBanner(); return; }
    if (state.mode === "online" && state.onlineWaiting) { setPlanControlsVisible(false); closeChoice(); refreshBanner(); return; }
    setPlanControlsVisible(true);
    const side = state.planningSide;
    const used = new Set(state.plan[side].map(c => c.pieceId)).size;
    dom.planLabel.textContent = t("plan.label", { side: sideLabel(side), used, max: maxCmdFor(side), aegis: state.aegis[side], aegisMax: state.aegisMax[side], crystals: state.crystals[side] });
    dom.btnWard.textContent = t(state.wardMode ? "btn.wardOn" : "btn.wardOff");
    dom.btnWard.classList.toggle("ward-on", state.wardMode);
    const canAct = !(state.mode === "bot" && state.planningSide !== state.humanSide);
    if (dom.btnReplay) dom.btnReplay.disabled = !state.lastBattle || !canAct;
    if (dom.btnRevert) {
      dom.btnRevert.disabled = state.history.length < 2 || !canAct || state.mode === "online";
      dom.btnRevert.title = t(state.mode === "online" ? "title.revertOnline" : "title.revert");
    }
    if (dom.btnThreat) { dom.btnThreat.textContent = t(state.showThreat ? "btn.threatOn" : "btn.threatOff"); dom.btnThreat.classList.toggle("ward-on", state.showThreat); }
    if (dom.btnForesight) { dom.btnForesight.textContent = t(state.foresightOn ? "btn.foresightOn" : "btn.foresightOff"); dom.btnForesight.classList.toggle("ward-on", state.foresightOn); }
    dom.btnSummon.classList.toggle("ward-on", !!state.summonArmed);
    dom.btnSummon.textContent = state.summonArmed ? t("btn.placing", { piece: pieceName(state.summonArmed) }) : t("btn.summon");
    if (dom.btnBid) {
      // Read-only: the bid was sealed in this round's auction, before planning — no second bid here.
      const bid = (state.crystalBid && state.crystalBid[side]) || 0;
      dom.btnBid.textContent = t("btn.bidLocked", { n: bid });
      dom.btnBid.title = t("title.bidLocked");
      dom.btnBid.disabled = true;
      dom.btnBid.classList.toggle("ward-on", bid > 0);
    }
    refreshBanner();
  }

  /* ---- Replay the last clash (visual re-run) ---- */
  function replayLastRound() {
    if (!state.lastBattle || state.scene !== "planning") return;
    if (state.mode === "spectator") return;
    if (state.mode === "bot" && state.planningSide !== state.humanSide) return;
    state.replayReturn = snapshotState();
    state.replayReturnPlan = JSON.parse(JSON.stringify(state.plan));
    logEvent(t("log.replay"));
    loadSnapshotPieces(state.lastBattle.fromSnapshot);
    state.plan = JSON.parse(JSON.stringify(state.lastBattle.plans));
    state.firstSide = state.lastBattle.firstSide;
    state.isReplay = true;
    clearSelection();
    setPlanControlsVisible(false);
    closeChoice();
    beginBattle(state.lastTs);
  }

  /* ---- Redo / Revert the last round (undo the outcome, replan) ---- */
  function revertRound() {
    if (state.scene !== "planning") return;
    if (state.mode === "spectator") return;
    if (state.mode === "online") return;   // a one-sided rewind would desync the two boards
    if (state.mode === "bot" && state.planningSide !== state.humanSide) return;
    if (state.history.length < 2) { setCaption(t("note.noEarlierRound")); refreshBanner(); return; }
    state.history.pop();                                    // discard this round's start
    const prev = state.history[state.history.length - 1];   // restore the previous round's start
    loadSnapshotPieces(prev);
    state.plan = { light: [], dark: [] };
    state.planLocked = { light: false, dark: false };
    state.lastBattle = null;
    state.wardMode = false; state.summonArmed = null;
    state.pendingReaperStrike = null;
    state.undoStack = [];                                   // that turn's actions belong to the discarded timeline
    resetTurnTransients();
    state.scene = "planning";
    state.planningSide = state.mode === "bot" ? state.humanSide : "light";
    clearSelection();
    logEvent(t("log.revert"));
    hideAuctionUI();
    state.auction = null;
    refreshBanner(); updatePlanBar(); syncSidePanels();
    // One auction per round: the restored round keeps the bids revealed for it (snapshot auctionDone).
    if (!state.auctionDone) { beginAuction(); return; }
    startPlanClock();                                       // the round is re-planned from scratch: a fresh turn
  }

  function cancelReaperChoice() { state.pendingReaperStrike = null; updatePlanBar(); }
  function commitReaperStrike(mode) {
    const pend = state.pendingReaperStrike;
    if (!pend) return;
    addPlanCommand({ pieceId: pend.pieceId, kind: "strike", targetId: pend.targetId, row: pend.row, col: pend.col, reaperMode: mode });
    state.pendingReaperStrike = null;
    clearSelection();
    updatePlanBar();
  }

  /* ============================================================
   * INPUT
   * ============================================================ */
  function canvasToCell(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left) * (canvas.width / rect.width);
    const y = (evt.clientY - rect.top) * (canvas.height / rect.height);
    let col = Math.floor(x / TILE), row = Math.floor(y / TILE);
    if (state.viewFlip) { col = 7 - col; row = 7 - row; }   // screen → board when the view is rotated
    if (!inBounds(row, col)) return null;
    return { row, col };
  }

  function onlineSelectable(pc) { return state.mode !== "online" || !onlineRoundIds || onlineRoundIds.has(pc.id); }

  canvas.addEventListener("click", (evt) => {
    if (state.scene !== "planning" || state.mode === "spectator") return;
    if (planClockExpired()) return;                 // time's up: the next frame seals the plan as it stands
    if (choiceOpen() || performance.now() - choiceClosedAt < 350) return;   // stray click from the pop-up
    // in bot mode, only the human side plans manually
    if (state.mode === "bot" && state.planningSide !== state.humanSide) return;
    if (state.mode === "online" && state.onlineWaiting) return; // already committed this round
    const cell = canvasToCell(evt);
    if (!cell) { clearSelection(); return; }
    const grid = buildOccupancyGrid(state.pieces);
    const clicked = grid[cell.row][cell.col];

    if (state.pendingReaperStrike) { cancelReaperChoice(); return; }

    if (state.summonArmed) {
      if (homeRows(state.planningSide).includes(cell.row) && !clicked) {
        const armed = state.summonArmed;
        const cost = SUMMON_OPTIONS.find(o => o.type === armed).cost;
        const sp = summonPiece(state.planningSide, armed, cell.row, cell.col);
        if (sp) state.undoStack.push({ type: "summon", pieceId: sp.id, cost, side: state.planningSide });
        state.summonArmed = null;          // one placement per pick — control returns to the board
        updatePlanBar();
        return;
      }
      state.summonArmed = null;            // clicked elsewhere: drop the summon and handle this click normally
      updatePlanBar();
    }

    if (state.wardMode) {
      if (clicked && clicked.side === state.planningSide) { toggleWard(clicked); updatePlanBar(); return; }
      state.wardMode = false;              // clicked off your pieces: leave Ward mode and handle this click normally
      updatePlanBar();
    }

    const sel = state.selection;
    if (sel.pieceId) {
      const piece = pieceById(sel.pieceId);
      if (!piece || !piece.alive) { clearSelection(); return; }
      if (clicked && clicked.id === piece.id) { clearSelection(); return; }
      const isMove = sel.moveTiles.some(t => t.row === cell.row && t.col === cell.col);
      const isStrike = sel.strikeTiles.some(t => t.row === cell.row && t.col === cell.col);
      if (isMove && !clicked) { if (addPlanCommand({ pieceId: piece.id, kind: "move", row: cell.row, col: cell.col })) { clearSelection(); updatePlanBar(); } return; }
      if (isStrike && clicked && clicked.side !== piece.side) {
        if (piece.type === "reaper") {
          state.pendingReaperStrike = { pieceId: piece.id, targetId: clicked.id, row: cell.row, col: cell.col };
          clearSelection();
          updatePlanBar();
          openReaperChoice();                       // pop-up: Reaping Spiral or Slay & Advance
        } else if (addPlanCommand({ pieceId: piece.id, kind: "strike", targetId: clicked.id, row: cell.row, col: cell.col })) {
          clearSelection(); updatePlanBar();
        }
        return;
      }
      if (clicked && isPlanControllable(clicked)) { clearSelection(); pickOwnPiece(clicked); return; }
      clearSelection();
      return;
    }
    if (clicked && isPlanControllable(clicked)) pickOwnPiece(clicked);
  });

  // Clicking one of your pieces: a piece summoned this turn offers to cancel the summon; others get selected.
  function pickOwnPiece(p) {
    if (summonedThisTurn(p)) { openSummonedChoice(p); return; }
    if (!onlineSelectable(p)) { setCaption(t("note.summonWait")); return; }
    selectPiece(p);
  }

  dom.btnWard.addEventListener("click", () => { if (planningLocked()) return; state.wardMode = !state.wardMode; if (state.wardMode) { state.summonArmed = null; } clearSelection(); updatePlanBar(); });
  dom.btnSummon.addEventListener("click", () => {
    if (planningLocked()) return;
    const wasArmed = !!state.summonArmed;
    state.wardMode = false; state.summonArmed = null;
    clearSelection(); updatePlanBar();
    if (!wasArmed) openSummonChoice();          // clicking while placing simply cancels the placement
  });
  // (#btnBid is a read-only display of the auction-sealed bid; bidding happens in the pre-planning auction.)
  if (dom.btnAuctionPass) dom.btnAuctionPass.addEventListener("click", () => { if (state.auction) lockAuctionBid(state.auction.cur, "0", "manual"); });
  if (dom.btnAuctionLock) dom.btnAuctionLock.addEventListener("click", () => {
    if (state.auction) lockAuctionBid(state.auction.cur, dom.auctionAmount ? dom.auctionAmount.value : "", "manual");
  });
  if (dom.auctionAmount) {
    dom.auctionAmount.addEventListener("input", () => { showAuctionError(""); syncAuctionPressed(); });
    dom.auctionAmount.addEventListener("keydown", (e) => {
      if (e && e.key === "Enter") {
        if (e.preventDefault) e.preventDefault();
        if (state.auction) lockAuctionBid(state.auction.cur, dom.auctionAmount.value, "manual");
      }
    });
  }
  if (dom.btnAuctionContinue) dom.btnAuctionContinue.addEventListener("click", () => onAuctionContinue());
  if (dom.btnAuctionQuit) dom.btnAuctionQuit.addEventListener("click", () => { if (auctionActive() && state.auction.online) showStart(); });
  if (dom.btnAuctionRetry) dom.btnAuctionRetry.addEventListener("click", () => retryOnlineBid());
  dom.choiceCancel.addEventListener("click", () => cancelChoice());
  dom.choiceScreen.addEventListener("click", (e) => { if (e.target === dom.choiceScreen) cancelChoice(); });  // backdrop
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (choiceOpen()) { cancelChoice(); return; }
    if (state.scene === "planning" && state.summonArmed) { state.summonArmed = null; updatePlanBar(); }
  });
  if (dom.btnReplay) dom.btnReplay.addEventListener("click", () => replayLastRound());
  if (dom.btnRevert) dom.btnRevert.addEventListener("click", () => revertRound());
  if (dom.btnThreat) dom.btnThreat.addEventListener("click", () => { if (planningLocked()) return; state.showThreat = !state.showThreat; updatePlanBar(); });
  if (dom.btnForesight) dom.btnForesight.addEventListener("click", () => { if (planningLocked()) return; state.foresightOn = !state.foresightOn; updatePlanBar(); });
  // Put each piece's figurine in front of its line in the help's role list, so roles can be told apart.
  // A line is matched by its bold piece name (in the current language), falling back to list order.
  const ROLE_ORDER = ["sovereign", "reaper", "juggernaut", "trickster", "wildrider", "skirmisher", "harrower", "fury"];
  function decorateHelpRoles() {
    const list = dom.helpScreen && dom.helpScreen.querySelector(".help-body ul.help-roles");
    if (!list) return;
    list.classList.add("with-icons");
    [...list.children].forEach((li, i) => {
      const existing = li.querySelector("canvas.role-icon");
      if (existing) {                                           // repaint so a theme switch shows here too
        const tp = existing.dataset.piece;
        if (tp) paintIcon(existing, tp, tp === "fury" ? "neutral" : "light");
        const label = li.querySelector(".role-name-label");
        if (label) {
          const entry = SG.ROLE_NAMES && SG.ROLE_NAMES[activeThemeId] && SG.ROLE_NAMES[activeThemeId][tp];
          label.textContent = entry ? (entry[(SG.I18N && SG.I18N.lang) || "en"] || entry.en || entry.zh) : tp;
        }
        return;
      }
      const name = ((li.querySelector("b") || {}).textContent || "").trim();
      const type = ROLE_ORDER.find(tp => pieceName(tp) === name) || ROLE_ORDER[i];
      if (!type) return;
      const text = document.createElement("span");
      text.className = "role-text";
      while (li.firstChild) text.appendChild(li.firstChild);   // keep the line as one block beside the icon
      const caption = document.createElement("span");
      caption.className = "icon-caption";
      caption.dataset.piece = type;
      const cv = document.createElement("canvas");
      cv.width = 52; cv.height = 52; cv.className = "role-icon";
      cv.dataset.piece = type;
      paintIcon(cv, type, type === "fury" ? "neutral" : "light");
      const label = document.createElement("span");
      label.className = "role-name-label";
      const entry = SG.ROLE_NAMES && SG.ROLE_NAMES[activeThemeId] && SG.ROLE_NAMES[activeThemeId][type];
      label.textContent = entry ? (entry[(SG.I18N && SG.I18N.lang) || "en"] || entry.en || entry.zh) : type;
      caption.append(cv, label);
      li.append(caption, text);
    });
  }
  function openHelp() { decorateHelpRoles(); dom.helpScreen.classList.remove("hidden"); }
  function closeHelp() { dom.helpScreen.classList.add("hidden"); }
  if (dom.btnHelp) dom.btnHelp.addEventListener("click", openHelp);
  if (dom.btnHelpGame) dom.btnHelpGame.addEventListener("click", openHelp);
  if (dom.btnHelpClose) dom.btnHelpClose.addEventListener("click", closeHelp);

  function populateTrials() {
    if (!dom.trialsList) return;
    const cleared = loadStore("sg.trials", {});
    dom.trialsList.innerHTML = "";
    SCENARIOS.forEach(sc => {
      const done = !!cleared[sc.id];
      const card = document.createElement("button");
      card.className = "trial-card btn btn-ghost" + (done ? " cleared" : "");
      card.innerHTML = `<span class="trial-name">${done ? "✓ " : ""}${scenarioName(sc)} <em>· ${t("difficulty." + sc.difficulty)}</em></span><span class="trial-blurb">${t("scenario." + sc.id + ".blurb")}</span>`;
      card.addEventListener("click", () => { dom.trialsScreen.classList.add("hidden"); startTrial(sc); });
      dom.trialsList.appendChild(card);
    });
  }
  if (dom.btnTrials) dom.btnTrials.addEventListener("click", () => { populateTrials(); dom.trialsScreen.classList.remove("hidden"); });
  if (dom.btnTrialsClose) dom.btnTrialsClose.addEventListener("click", () => dom.trialsScreen.classList.add("hidden"));
  if (dom.btnDaily) dom.btnDaily.addEventListener("click", () => startDaily());

  /* ---- Rites of Access (options) ---- */
  function syncOptionsUI() {
    const o = loadStore("sg.options", {});
    if (dom.optReduceMotion) dom.optReduceMotion.checked = !!o.reduceMotion;
    if (dom.optColorGlyphs) dom.optColorGlyphs.checked = !!o.colorGlyphs;
    if (dom.optSpeed) dom.optSpeed.value = o.battleSpeed || 1;
    if (dom.optSpeedVal) dom.optSpeedVal.textContent = (o.battleSpeed || 1) + "×";
  }
  function saveOptionsFromUI() {
    const o = {
      reduceMotion: dom.optReduceMotion ? dom.optReduceMotion.checked : false,
      colorGlyphs: dom.optColorGlyphs ? dom.optColorGlyphs.checked : false,
      battleSpeed: dom.optSpeed ? parseFloat(dom.optSpeed.value) : 1,
    };
    saveStore("sg.options", o);
    // apply live to the current match
    state.reduceMotion = o.reduceMotion; state.colorGlyphs = o.colorGlyphs; state.battleSpeed = o.battleSpeed;
    if (state.planClock) renderPlanClock(monotonicNow(), true);   // Reduce Motion applies to the running countdown at once
    if (state.auctionClock) renderAuctionClock(monotonicNow(), true);
    if (dom.optSpeedVal) dom.optSpeedVal.textContent = o.battleSpeed + "×";
  }
  function openOptions() { syncOptionsUI(); dom.optionsScreen.classList.remove("hidden"); }
  if (dom.btnOptions) dom.btnOptions.addEventListener("click", openOptions);
  if (dom.btnOptionsGame) dom.btnOptionsGame.addEventListener("click", openOptions);
  if (dom.btnOptionsClose) dom.btnOptionsClose.addEventListener("click", () => dom.optionsScreen.classList.add("hidden"));
  if (dom.optReduceMotion) dom.optReduceMotion.addEventListener("change", saveOptionsFromUI);
  if (dom.optColorGlyphs) dom.optColorGlyphs.addEventListener("change", saveOptionsFromUI);
  if (dom.optSpeed) dom.optSpeed.addEventListener("input", saveOptionsFromUI);

  /* ---- Piece theme picker (start screen + options) ---- */
  function themeDisplayName(id) {
    const key = "theme." + id + ".name", tr = t(key);
    if (tr !== key) return tr;
    const th = SG.THEMES[id], lang = (SG.I18N && SG.I18N.lang) || "en";
    return (th && th.name && (th.name[lang] || th.name.en)) || id;
  }
  function themeDescription(id) {
    const key = "theme." + id + ".desc", tr = t(key);
    if (tr !== key) return tr;
    const th = SG.THEMES[id], lang = (SG.I18N && SG.I18N.lang) || "en";
    return (th && th.description && (th.description[lang] || th.description.en)) || "";
  }
  function themeSelects() { return [dom.themeSelect, dom.optThemeSelect].filter(Boolean); }
  function syncThemeSelects() {
    const desc = themeDescription(activeThemeId);
    themeSelects().forEach(sel => { sel.value = activeThemeId; sel.title = desc; });
  }
  // (Re)fill both pickers; called at boot and on language change so names follow the language.
  function buildThemeOptions() {
    const ids = Object.keys(SG.THEMES || {});
    themeSelects().forEach(sel => {
      sel.innerHTML = "";
      for (const id of ids) {
        const o = document.createElement("option");
        o.value = id; o.textContent = themeDisplayName(id); o.title = themeDescription(id);
        sel.appendChild(o);
      }
    });
    syncThemeSelects();
  }
  // Cosmetic only: theme state and both pickers update immediately, the board redraws on the next
  // animation frame, and legend / help role icons repaint in deferred, yielding slices afterwards
  // (see scheduleIconRepaint) so a theme switch never blocks input feedback.
  function setTheme(id, persist = true) {
    const perfStart = perf.on ? perfNow() : 0;
    const from = perf.on ? currentFigureTheme().id : null;
    activeThemeId = normalizeThemeId(id);
    refreshRoleNameLabels();
    if (state) state.theme = activeThemeId;
    if (persist) { try { localStorage.setItem(THEME_STORAGE_KEY, activeThemeId); } catch (e) { /* storage blocked */ } }
    syncThemeSelects();
    scheduleIconRepaint();
    if (perf.on) {
      if (perf.switchRec) perfFinishSwitch();             // log the interrupted one with what it saw
      perf.switchRec = {
        from, to: activeThemeId, at: perfStart, handlerMs: perfNow() - perfStart,
        frames: 0, firstFrameMs: null, firstRenderMs: null, firstInterval: null,
        maxInterval: 0, longFrames: 0, maxRender: 0, iconMs0: perf.iconMs, iconSlices0: perf.iconSlices,
      };
    }
  }
  themeSelects().forEach(sel => {
    sel.addEventListener("change", e => setTheme(e.target.value));
    // Intent to change skin: pre-render the other themes' icons while the player is still choosing.
    ["pointerenter", "focus", "pointerdown"].forEach(type => sel.addEventListener(type, requestThemeWarm));
  });

  /* ---- Descent + Mirror UI ---- */
  const MIRROR_UPG = {
    aegis: { max: 2, cost: lv => 20 + lv * 20 },
    crystal: { max: 3, cost: lv => 15 + lv * 15 },
  };
  function refreshMirror() {
    const m = loadStore("sg.mirror", { obols: 0 });
    if (dom.mirrorObols) dom.mirrorObols.textContent = m.obols || 0;
    if (!dom.mirrorUpgrades) return;
    dom.mirrorUpgrades.innerHTML = "";
    Object.keys(MIRROR_UPG).forEach(key => {
      const u = MIRROR_UPG[key], lv = m[key + "Lv"] || 0, maxed = lv >= u.max, cost = u.cost(lv);
      const btn = document.createElement("button");
      btn.className = "trial-card btn btn-ghost";
      const desc = t("mirror." + key + ".desc");
      btn.innerHTML = `<span class="trial-name">${t("mirror.level", { name: t("mirror." + key + ".name"), lv, max: u.max })}</span><span class="trial-blurb">${maxed ? t("mirror.maxed", { desc }) : t("mirror.cost", { desc, cost })}</span>`;
      btn.disabled = maxed || (m.obols || 0) < cost;
      btn.addEventListener("click", () => buyMirror(key));
      dom.mirrorUpgrades.appendChild(btn);
    });
  }
  function buyMirror(key) {
    const u = MIRROR_UPG[key], m = loadStore("sg.mirror", { obols: 0 }), lv = m[key + "Lv"] || 0;
    if (lv >= u.max) return;
    const cost = u.cost(lv);
    if ((m.obols || 0) < cost) return;
    m.obols -= cost; m[key + "Lv"] = lv + 1; saveStore("sg.mirror", m);
     refreshMirror(); refreshHallRecord();
  }
  if (dom.btnDescend) dom.btnDescend.addEventListener("click", () => startDescent());

  /* ---- Online Duel wiring ---- */
  // net.js reports i18n keys ("net.*"); anything else is a raw SDK message shown as-is.
  function showNetError(err) {
    const b = document.createElement("b");
    b.style.color = "var(--ember)";
    b.textContent = /^net\./.test(err) ? t(err) : err;
    dom.onlineStatus.innerHTML = ""; dom.onlineStatus.appendChild(b);
  }
  function openOnline() {
    if (dom.onlineSetup) dom.onlineSetup.classList.remove("hidden");
    if (dom.onlineStatus) dom.onlineStatus.innerHTML = "";
    if (dom.onlineScreen) dom.onlineScreen.classList.remove("hidden");
  }
  if (SG.Net) {
    SG.Net.onStart = (config) => startOnlineMatch(config, config.mySide || SG.Net.getSide());
    SG.Net.onBothPlans = (round, plans) => {
      // Resolve now if we're idle on that round; otherwise (e.g. mid-Replay) queue it.
      if (state.mode === "online" && !state.isReplay && state.scene === "planning" && round === state.roundNumber) resolveOnlineRound(plans);
      else state.onlinePending = { round, plans };
    };
    // Sealed pre-planning bids: both are in → reveal (or queue it if we're not at that auction yet).
    SG.Net.onBothBids = (round, bids) => applyOnlineBids(round, bids);
    SG.Net.onOpponentLeft = () => onlineOpponentLeft();
  }
  if (dom.btnOnline) dom.btnOnline.addEventListener("click", openOnline);
  if (dom.btnOnlineClose) dom.btnOnlineClose.addEventListener("click", () => { if (SG.Net) SG.Net.leave(); showStart(); });
  if (dom.btnCreateRoom) dom.btnCreateRoom.addEventListener("click", () => {

    if (dom.onlineStatus) dom.onlineStatus.textContent = t("online.creating");
    SG.Net.createRoom({ furies: dom.onlineFury && dom.onlineFury.checked, harrowerDrag: dom.onlineHarrower && dom.onlineHarrower.checked }, (err, res) => {
      if (err) { showNetError(err); return; }
      if (dom.onlineSetup) dom.onlineSetup.classList.add("hidden");
      dom.onlineStatus.innerHTML = `${t("online.codeLabel")}<br><span class="room-code" dir="ltr">${res.code}</span><br>${t("online.codeWait")}`;
    });
  });
  if (dom.btnJoinRoom) dom.btnJoinRoom.addEventListener("click", () => {

    const codeVal = dom.joinCode ? dom.joinCode.value : "";
    if (dom.onlineStatus) dom.onlineStatus.textContent = t("online.joining");
    SG.Net.joinRoom(codeVal, (err) => {
      if (err) { showNetError(err); return; }
      // onStart fires from the SDK callback and launches the match
    });
  });
  if (dom.btnMirror) dom.btnMirror.addEventListener("click", () => { refreshMirror(); dom.mirrorScreen.classList.remove("hidden"); });
  if (dom.btnMirrorClose) dom.btnMirrorClose.addEventListener("click", () => dom.mirrorScreen.classList.add("hidden"));
  function planningLocked() { return state.scene !== "planning" || state.mode === "spectator" || choiceOpen() || planClockExpired() || (state.mode === "online" && state.onlineWaiting); }
  dom.btnUndo.addEventListener("click", () => {
    if (planningLocked()) return;
    undoLast(); clearSelection(); syncSidePanels(); updatePlanBar();
  });
  dom.btnClear.addEventListener("click", () => {
    if (planningLocked()) return;
    while (state.undoStack.length) undoLast();       // reverts this turn's summons and wards too
    state.plan[state.planningSide] = [];            // (the auction-sealed bid stands)
    clearSelection(); syncSidePanels(); updatePlanBar();
  });
  dom.btnValidate.addEventListener("click", () => onValidate());
  dom.btnHandoffReady.addEventListener("click", () => {
    if (state.scene === "auction") onAuctionHandoffReady();   // the auction's private pass-device screen
    else onHandoffReady();
  });
  dom.btnQuit.addEventListener("click", () => showStart());
  dom.btnMainMenu.addEventListener("click", () => showStart());
  dom.btnPlayAgain.addEventListener("click", () => {
    if (state.runOutcome) startDescent();
    else if (state.scenario && !state.scenario.daily) startTrial(state.scenario);
    else if (state.mode === "spectator") startMatch("spectator", null, state.furiesEnabled, {
      movesPerRound: state.movesPerRound, harrowerDrag: state.harrowerDragEnabled, hazards: state.hazardsEnabled,
      difficulty: state.difficulty, persona: state.botPersona,
    });
    else startMatch(state.mode, state.humanSide, state.furiesEnabled, { movesPerRound: state.movesPerRound, harrowerDrag: state.harrowerDragEnabled, planSeconds: state.planSeconds });
  });
  dom.btnHotseat.addEventListener("click", () => {  startMatch("hotseat", "light", dom.furyToggle && dom.furyToggle.checked, { harrowerDrag: dom.harrowerToggle && dom.harrowerToggle.checked }); });
  dom.btnVsBot.addEventListener("click", () => {  startMatch("bot", "dark", dom.furyToggle && dom.furyToggle.checked, { harrowerDrag: dom.harrowerToggle && dom.harrowerToggle.checked }); });
  if (dom.btnSpectator) dom.btnSpectator.addEventListener("click", () => {
    startMatch("spectator", null, dom.furyToggle && dom.furyToggle.checked, {
      movesPerRound: dom.movesPerRound ? parseInt(dom.movesPerRound.value, 10) || 3 : 3,
      difficulty: dom.difficulty ? dom.difficulty.value : "normal",
      persona: dom.persona ? dom.persona.value : "balanced",
      harrowerDrag: dom.harrowerToggle && dom.harrowerToggle.checked,
      hazards: dom.hazardToggle && dom.hazardToggle.checked,
    });
  });
  if (dom.btnFateNew) dom.btnFateNew.addEventListener("click", () => {
    dom.fateCode.value = generateFateCode();
    dom.fateStatus.textContent = "";
    dom.fateCode.removeAttribute("aria-invalid");
  });
  function playFate() {
    const scenario = buildFateScenario(dom.fateCode.value);
    if (!scenario) {
      dom.fateStatus.textContent = t("fate.invalid");
      dom.fateCode.setAttribute("aria-invalid", "true");
      return;
    }
    dom.fateCode.value = scenario.fateCode;
    dom.fateStatus.textContent = "";
    dom.fateCode.removeAttribute("aria-invalid");
    startTrial(scenario);
  }
  if (dom.btnFatePlay) dom.btnFatePlay.addEventListener("click", playFate);
  if (dom.fateCode) {
    dom.fateCode.value = generateFateCode();
    dom.fateCode.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); playFate(); }
    });
  }
  // Turn-timer choice (20 / 60 / 90 s, default 60) is remembered like the piece theme.
  if (dom.planSeconds) {
    dom.planSeconds.value = String(normalizePlanSeconds(loadStore(PLAN_SECONDS_KEY, PLAN_SECONDS_DEFAULT)));
    dom.planSeconds.addEventListener("change", () => {
      const v = normalizePlanSeconds(dom.planSeconds.value);
      dom.planSeconds.value = String(v);
      saveStore(PLAN_SECONDS_KEY, v);
    });
  }

  /* ============================================================
   * SCENE MANAGEMENT
   * ============================================================ */
  function refreshHallRecord() {
    if (!dom.hallRecord) return;
    const rec = loadStore("sg.records", {});
    const bot = rec.bot, hot = rec.hotseat;
    const daily = loadStore("sg.daily", null);
    const trials = loadStore("sg.trials", {});
    const trialCount = Object.keys(trials).filter(k => trials[k]).length;
    const parts = [];
    if (bot) parts.push(t("hall.bot", { best: bot.bestScore, wins: bot.wins, plays: bot.plays }));
    if (hot) parts.push(t("hall.duel", { plays: hot.plays }));
    if (trialCount) parts.push(t("hall.trials", { n: trialCount, total: SCENARIOS.length }));
    if (daily && daily.streak) parts.push(t("hall.daily", { n: daily.streak }));
    dom.hallRecord.innerHTML = parts.length ? t("hall.prefix", { parts: parts.join(" &nbsp;·&nbsp; ") }) : "";
    if (dom.btnDaily) {
      const doneToday = daily && daily.date === dailyKey();
      dom.btnDaily.disabled = !!doneToday;
      dom.btnDaily.textContent = t(doneToday ? "btn.dailyDone" : "btn.daily");
    }
  }

  function showStart() {
    state.scene = "start";
    stopPlanClock();
    hideAuctionUI();
    state.auction = null;
    refreshHallRecord();
    dom.startScreen.classList.remove("hidden");
    dom.hud.classList.add("hidden");
    dom.gameOverScreen.classList.add("hidden");
    dom.handoffScreen.classList.add("hidden");
    setPlanControlsVisible(false);
    closeChoice();
    if (dom.boonScreen) dom.boonScreen.classList.add("hidden");
    if (dom.mirrorScreen) dom.mirrorScreen.classList.add("hidden");
    if (dom.trialsScreen) dom.trialsScreen.classList.add("hidden");
    if (dom.optionsScreen) dom.optionsScreen.classList.add("hidden");
    if (dom.onlineScreen) dom.onlineScreen.classList.add("hidden");
    if (state && state.mode === "online" && SG.Net) SG.Net.leave();
    runState = null;
  }
  function showGameOver() {
    if (state.runOutcome) {
      dom.winnerHeadline.textContent = t(state.runOutcome === "victory" ? "over.descentWon" : "over.descentLost");
    } else if (state.scenario && state.scenario.fateCode) {
      const won = state.trialResult && state.trialResult.won;
      dom.winnerHeadline.textContent = t(won ? "over.fateWon" : "over.fateLost", { code: state.scenario.fateCode });
    } else if (state.scenario) {
      const won = state.trialResult && state.trialResult.won;
      dom.winnerHeadline.textContent = t(won ? "over.trialWon" : "over.trialLost");
    } else {
      dom.winnerHeadline.textContent = state.winnerSide ? t("over.triumph", { side: sideLabel(state.winnerSide).toUpperCase() }) : t("over.ruin");
    }
    if (dom.ledger) {
      const rows = [
        [t("ledger.kills"), "kills"], [t("ledger.losses"), "losses"], [t("ledger.spirals"), "spirals"],
        [t("ledger.aegisBlocks"), "aegisBroken"], [t("ledger.summons"), "summons"], [t("ledger.bestCombo"), "bestCombo"],
      ];
      const L = state.stats.light, D = state.stats.dark;
      let html = `<div class="ledger-head"><span>${sideLabel("light")}</span><span>${t("ledger.title")}</span><span>${sideLabel("dark")}</span></div>`;
      html += `<div class="ledger-row score"><span>${scoreFor("light")}</span><span>${t("ledger.score")}</span><span>${scoreFor("dark")}</span></div>`;
      for (const [label, key] of rows) html += `<div class="ledger-row"><span>${L[key]}</span><span>${label}</span><span>${D[key]}</span></div>`;
      html += `<div class="ledger-row"><span>—</span><span>${t("ledger.rounds", { n: state.roundNumber + 1 })}</span><span>—</span></div>`;
      const rec = state.lastRecord;
      if (rec) html += `<div class="ledger-best">${t("ledger.best", { best: rec.bestScore, wins: rec.wins, plays: rec.plays })}${rec.fastest ? t("ledger.fastest", { n: rec.fastest }) : ""}</div>`;
      if (state.scenario && state.trialResult) {
        const blurb = state.scenario.fateCode ? "" : " · " + t("scenario." + state.scenario.id + ".blurb");
        html += `<div class="ledger-best">${t(state.trialResult.won ? "ledger.objDone" : "ledger.objFail")}${blurb}</div>`;
      }
      if (state.scenario && state.scenario.fateCode) html += `<div class="ledger-best">${t("fate.seedLabel", { code: state.scenario.fateCode })}</div>`;
      if (state.dailyShare) html += `<div class="ledger-best" style="color:var(--gold)">${state.dailyShare}</div>`;
      if (state.runOutcome) { const m = loadStore("sg.mirror", {}); html += `<div class="ledger-best">${t("ledger.descent", { n: state.run ? state.run.chamber : 0, total: CHAMBERS.length, obols: state.obolsEarned || 0, bank: m.obols || 0 })}</div>`; }
      dom.ledger.innerHTML = html;
    }
    dom.gameOverScreen.classList.remove("hidden");
  }
  function startMatch(mode, humanSide, furiesEnabled, opts) {
    opts = opts || {};
    state = freshState();
    nextPieceId = 1;
    state.mode = mode;
    state.humanSide = humanSide;
    state.movesPerRound = opts.movesPerRound != null ? opts.movesPerRound : (dom.movesPerRound ? parseInt(dom.movesPerRound.value, 10) || 3 : 3);
    state.planSeconds = normalizePlanSeconds(opts.planSeconds != null ? opts.planSeconds : (dom.planSeconds ? dom.planSeconds.value : PLAN_SECONDS_DEFAULT));
    state.furiesEnabled = !!furiesEnabled;
    // Explicit option wins; Descent runs and Trials keep their canonical drag (on) unless overridden;
    // custom matches follow the start-screen checkbox.
    state.harrowerDragEnabled = opts.harrowerDrag != null
      ? !!opts.harrowerDrag
      : (opts.run || opts.scenario ? true : !!(dom.harrowerToggle && dom.harrowerToggle.checked));
    if (opts.scenario && opts.scenario.harrowerDrag != null) state.harrowerDragEnabled = !!opts.scenario.harrowerDrag;
    state.hazardsEnabled = opts.hazards != null ? !!opts.hazards : !!(dom.hazardToggle && dom.hazardToggle.checked);
    if (opts.scenario) state.hazardsEnabled = !!opts.scenario.hazards;
    const o = loadStore("sg.options", {});
    state.reduceMotion = o.reduceMotion || false;
    state.battleSpeed = o.battleSpeed || 1;
    state.colorGlyphs = o.colorGlyphs || false;
    if (mode === "bot" || mode === "spectator") {
      state.difficulty = opts.difficulty || (dom.difficulty ? dom.difficulty.value : "normal");
      let persona = opts.persona || (dom.persona ? dom.persona.value : "balanced");
      if (persona === "random") { const keys = Object.keys(SG.AI_PERSONA); persona = keys[Math.floor(Math.random() * keys.length)]; }
      state.botPersona = persona;
    }
    state.scenario = opts.scenario || null;
    if (opts.scenario) {
      const sc = opts.scenario;
      state.pieces = buildScenarioPieces(sc);
      if (sc.aegis) state.aegis = { light: sc.aegis.light != null ? sc.aegis.light : state.aegis.light, dark: sc.aegis.dark != null ? sc.aegis.dark : state.aegis.dark };
      if (sc.crystals) state.crystals = { light: sc.crystals.light || 0, dark: sc.crystals.dark || 0 };
      if (sc.difficulty) state.difficulty = sc.difficulty;
      if (sc.persona) state.botPersona = sc.persona;
    } else {
      state.pieces = buildStartingPieces();
    }
    // Difficulty config knobs (only the standard duel; scenarios set their own).
    if (mode === "bot" && !opts.scenario) applyDifficultyConfig();
    // Chambers of the Descent — run context (boons, carried crystals, escalating bot boons).
    if (opts.run) {
      state.run = opts.run;
      state.boons[state.humanSide] = Object.assign({}, opts.run.boons);
      state.boons[otherSide(state.humanSide)] = Object.assign({}, opts.run.botBoons);
      if (opts.run.carriedCrystals) state.crystals[state.humanSide] += opts.run.carriedCrystals;
    }
    // Mirror of Night — persistent upgrades apply to the human in bot play.
    if (mode === "bot" && !(opts.scenario && opts.scenario.fateCode)) applyMirrorUpgrades(state.humanSide);
    // Hecate's Ward — +1 Aegis for any boon holder.
    for (const s of ["light", "dark"]) if (hasBoon(s, "hecate")) state.aegis[s] += 1;
    state.aegisMax = { light: state.aegis.light, dark: state.aegis.dark };   // this match's real charge count
    genTerrain();
    state.lastTs = performance.now();
    dom.eventLog.innerHTML = "";
    logEvent(opts.scenario ? t("log.trial", { name: scenarioName(opts.scenario) }) : t("log.start"));
    if (mode === "bot") logEvent(t("log.foe", { persona: t("persona.name." + state.botPersona), difficulty: t("difficulty." + state.difficulty).toUpperCase() }));
    if (mode === "spectator") logEvent(t("log.spectator", { persona: t("persona.name." + state.botPersona), difficulty: t("difficulty." + state.difficulty).toUpperCase() }));
    if (state.furiesEnabled) { spawnFury(state.lastTs); logEvent(t("log.furies")); }
    dom.startScreen.classList.add("hidden");
    dom.gameOverScreen.classList.add("hidden");
    dom.handoffScreen.classList.add("hidden");
    if (dom.trialsScreen) dom.trialsScreen.classList.add("hidden");
    hideAuctionUI();
    dom.hud.classList.remove("hidden");
    beginPlanningPhase();
    syncSidePanels();
  }
  function applyDifficultyConfig() {
    const bot = otherSide(state.humanSide), you = state.humanSide;
    if (state.difficulty === "easy") { state.aegis[you] = AEGIS_START + 1; state.aegis[bot] = 2; }
    else if (state.difficulty === "hard") { state.crystals[bot] += 10; }
    else if (state.difficulty === "unfair") { state.crystals[bot] += 20; state.aegis[bot] = AEGIS_START + 1; }
  }

  /* ============================================================
   * GAME LOOP
   * ============================================================ */
  function update(ts) {
    const dt = Math.min((ts - state.lastTs) / 1000 || 0, 1 / 20);
    state.lastTs = ts;
    updateTweens(ts);
    updateLunges(ts);
    updateParticles(dt, ts);
    processPendingMoves(ts);
    if (state.scene === "battle") updateBattle(ts);
  }

  let lastAmbientTs = performance.now();
  function loop(ts) {
    const P = perf.on;
    const updateStart = P ? perfNow() : 0;
    const adt = Math.min((ts - lastAmbientTs) / 1000 || 0, 0.05);
    lastAmbientTs = ts;
    updateAmbientParticles(adt);
    if (state.scene === "battle" || state.scene === "planning" || state.scene === "auction") update(ts);
    else state.lastTs = ts;
    tickPlanClock(ts);
    tickAuctionClock(ts);
    if (P) perfSeg.update += perfNow() - updateStart;
    render(ts);
    if (P && perf.on) perfRecordFrame(ts, currentFigureTheme().id);
    requestAnimationFrame(loop);
  }

  // Language switch (fired by i18n.js): redraw every piece of dynamic text currently on screen.
  // Past event-log lines keep the language they were written in.
  function refreshLanguage() {
    refreshRoleNameLabels();
    if (!state) return;
    if (dom.fateCode && dom.fateCode.getAttribute("aria-invalid") === "true") dom.fateStatus.textContent = t("fate.invalid");
    buildThemeOptions();
    syncSidePanels();
    dom.btnSummon.textContent = t("btn.summon");
    dom.btnWard.textContent = t("btn.wardOff");
    dom.btnThreat.textContent = t("btn.threatOff");
    dom.btnForesight.textContent = t("btn.foresightOff");
    dom.btnRevert.title = t("title.revert");
    refreshHallRecord();
    if (state.scene === "planning") updatePlanBar();
    if (state.scene === "handoff" && state.handoffTo) {
      dom.handoffText.textContent = t("handoff.text", { side: sideLabel(state.handoffTo) });
      dom.btnHandoffReady.textContent = t("handoff.ready", { side: sideLabel(state.handoffTo) });
    }
    refreshBanner();
    if (state.planClock) renderPlanClock(performance.now(), true);   // countdown label follows the language
    if (auctionActive()) {
      if (state.auction.phase === "handoff") renderAuctionHandoff();
      else renderAuctionDialog(false);                   // keeps the typed amount
      if (state.auctionClock) renderAuctionClock(performance.now(), true);
    }
    if (!dom.gameOverScreen.classList.contains("hidden")) showGameOver();
    if (dom.trialsScreen && !dom.trialsScreen.classList.contains("hidden")) populateTrials();
    if (dom.mirrorScreen && !dom.mirrorScreen.classList.contains("hidden")) refreshMirror();
    if (dom.helpScreen && !dom.helpScreen.classList.contains("hidden")) decorateHelpRoles();
    if (choiceOpen()) cancelChoice();               // its text was generated in the old language
  }
  window.addEventListener("sg:lang", refreshLanguage);

  /* ============================================================
   * BOOT
   * ============================================================ */
  state = freshState();
  buildBoardCache();
  seedAmbientParticles();
  buildLegendIcons();
  refreshLanguage();
  requestAnimationFrame(loop);
  Object.defineProperty(SG, "state", { get: () => state });
})();
