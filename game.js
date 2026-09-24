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
      pieces: [ { type:"sovereign", side:"light", row:2, col:4, lives:1 }, { type:"juggernaut", side:"light", row:1, col:3 }, { type:"juggernaut", side:"light", row:1, col:5 }, { type:"trickster", side:"light", row:2, col:2 }, { type:"trickster", side:"light", row:2, col:6 }, { type:"skirmisher", side:"light", row:3, col:4 },
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

  // Lives = killing blows the piece can take before it truly dies.
  const PIECE_DEFS = {
    sovereign:  { label: "Sovereign", lives: 3, moveKind: "king", attackKind: "melee" },
    reaper:     { label: "Reaper", lives: 2, moveKind: "slide", moveDirs: KING_DIRS, moveSteps: 7, attackKind: "melee", strikeAoe: true },
    juggernaut: { label: "Juggernaut", lives: 1, moveKind: "slide", moveDirs: ROOK_DIRS, moveSteps: 7, attackKind: "ranged", attackDirs: ROOK_DIRS, attackRange: 7 },
    trickster:  { label: "Trickster", lives: 1, moveKind: "slide", moveDirs: BISHOP_DIRS, moveSteps: 2, attackKind: "ranged", attackDirs: BISHOP_DIRS, attackRange: 3 },
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
      humanSide: "light",
      pieces: [],
      roundNumber: 0,
      firstSide: "light",       // resolves first this round (alternates)
      planningSide: "light",    // who is planning right now
      plan: { light: [], dark: [] },
      planLocked: { light: false, dark: false },
      aegis: { light: AEGIS_START, dark: AEGIS_START },
      crystals: { light: 0, dark: 0 },
      wardMode: false,
      summonMenuOpen: false,
      summonArmed: null,
      furiesEnabled: false,
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
      warded: false,
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
      if (d.warded) p.warded = true;
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
    return { id: p.id, type: p.type, side: p.side, facing: p.facing, lives: p.lives, maxLives: p.maxLives, warded: p.warded, row: p.row, col: p.col, alive: p.alive };
  }
  function snapshotState() {
    return {
      pieces: state.pieces.map(clonePieceDurable),
      crystals: { light: state.crystals.light, dark: state.crystals.dark },
      aegis: { light: state.aegis.light, dark: state.aegis.dark },
      furiesEnabled: state.furiesEnabled, furyCount: state.furyCount,
      roundNumber: state.roundNumber, firstSide: state.firstSide, planningSide: state.planningSide,
      humanSide: state.humanSide, mode: state.mode, nextPieceId: nextPieceId,
    };
  }
  function pieceFromDurable(d) {
    const c = cellCenter(d.row, d.col);
    return {
      id: d.id, type: d.type, side: d.side, facing: d.facing,
      lives: d.lives, maxLives: d.maxLives, warded: d.warded,
      row: d.row, col: d.col, x: c.x, y: c.y,
      animState: "idle", tween: null, dashMeta: null, trail: [],
      lunge: null, hitFlashUntil: 0, alive: d.alive, dyingUntil: 0,
      bobSeed: Math.random() * 1000, deathSpin: (Math.random() - 0.5) * 3.2, spawnPopUntil: 0,
    };
  }
  function loadSnapshotPieces(snap) {
    state.pieces = snap.pieces.map(pieceFromDurable);
    state.crystals = { light: snap.crystals.light, dark: snap.crystals.dark };
    state.aegis = { light: snap.aegis.light, dark: snap.aegis.dark };
    state.furiesEnabled = snap.furiesEnabled; state.furyCount = snap.furyCount;
    state.roundNumber = snap.roundNumber; state.firstSide = snap.firstSide; state.planningSide = snap.planningSide;
    state.humanSide = snap.humanSide; state.mode = snap.mode;
    nextPieceId = snap.nextPieceId;
    state.particles = []; state.slashes = []; state.projectiles = []; state.shockwaves = []; state.damageNumbers = [];
    state.flash = 0; state.shake = 0; state.zoom = 0; state.pendingBeat = 0;
    state.pendingMoves = [];
    state.battle = null;
  }

  function pieceById(id) { return state.pieces.find(p => p.id === id); }
  function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function cellCenter(row, col) { return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 }; }
  function chebyshev(a, b) { return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col)); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function sideLabel(side) { return side === "light" ? "Umbra" : side === "dark" ? "Ember" : "the Underworld"; }
  function otherSide(side) { return side === "light" ? "dark" : "light"; }
  function describePiece(p) { return `${sideLabel(p.side)}'s ${PIECE_DEFS[p.type].label}`; }
  function hexToRgba(hex, a) {
    const v = hex.replace("#", "");
    const r = parseInt(v.substring(0, 2), 16), g = parseInt(v.substring(2, 4), 16), b = parseInt(v.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  /* ---- Local records (localStorage, guarded) ---- */
  function loadStore(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; } }
  function saveStore(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode / blocked */ } }
  function scoreFor(side) {
    const s = state.stats[side];
    return s.kills * 10 + s.spirals * 20 + s.summons * 5 + s.bestCombo * 15 + s.aegisBroken * 8;
  }

  function hasBoon(side, id) { return !!(state.boons && state.boons[side] && state.boons[side][id]); }
  function crystalsPerKill(side) { return CRYSTALS_PER_KILL + (hasBoon(side, "charon") ? 5 : 0); }
  function maxCmdFor(side) { return MAX_CMD + (hasBoon(side, "nyx") ? 1 : 0); }
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
    if (kind === "lava") { spawnDamageText(piece.x, piece.y - 6, "ENGULFED", "#ff7a3a"); killPiece(piece, null, ts); }
    else if (kind === "font") {
      if (piece.maxLives > 1 && piece.lives < piece.maxLives && (piece.side === "light" || piece.side === "dark")) { piece.lives++; spawnDamageText(piece.x, piece.y - 6, "+1 LIFE", "#c98bd1"); syncSidePanels(); }
      else if (piece.side === "light" || piece.side === "dark") { state.crystals[piece.side] += 5; spawnDamageText(piece.x, piece.y - 6, "+5◆", "#8fd0ff"); syncSidePanels(); }
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
    audio.dash();
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
    if (existingIdx >= 0) { arr[existingIdx] = cmd; return true; }
    const distinct = new Set(arr.map(c => c.pieceId)).size;
    const cap = maxCmdFor(state.planningSide);
    if (distinct >= cap) { setCaption(`Only ${cap} pieces may act each round.`); return false; }
    arr.push(cmd);
    return true;
  }

  function toggleWard(piece) {
    const side = state.planningSide;
    if (piece.side !== side) return;
    if (piece.warded) { piece.warded = false; state.aegis[side]++; }
    else if (state.aegis[side] > 0) { piece.warded = true; state.aegis[side]--; bumpStat(side, "aegisUsed"); audio.boon(); }
    else setCaption("No Aegis charges remain.");
    syncSidePanels();
  }

  function onValidate() {
    if (state.scene !== "planning") return;
    const side = state.planningSide;
    state.planLocked[side] = true;
    clearSelection();
    state.wardMode = false;
    state.summonMenuOpen = false;
    state.summonArmed = null;
    state.pendingReaperStrike = null;
    const ts = state.lastTs;
    if (state.mode === "bot") {
      // the human just planned their side; the bot plans the other side, then battle
      const botSide = otherSide(state.humanSide);
      applyAIPlan(botSide);
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
    state.scene = "handoff";
    dom.handoffTitle.textContent = "PASS THE DEVICE";
    dom.handoffText.textContent = `Hand over to ${sideLabel(nextSide)}. Their plan stays secret.`;
    dom.btnHandoffReady.textContent = `I am ${sideLabel(nextSide)} — Ready`;
    dom.handoffScreen.classList.remove("hidden");
    dom.planBar.classList.add("hidden");
    refreshBanner();
  }
  function onHandoffReady() {
    dom.handoffScreen.classList.add("hidden");
    state.planningSide = state.handoffTo;
    state.handoffTo = null;
    state.scene = "planning";
    state.wardMode = false;
    state.summonMenuOpen = false;
    state.summonArmed = null;
    state.pendingReaperStrike = null;
    clearSelection();
    refreshBanner();
    updatePlanBar();
  }

  function beginPlanningPhase() {
    state.scene = "planning";
    state.plan = { light: [], dark: [] };
    state.planLocked = { light: false, dark: false };
    // vs bot: the human always plans first (whichever side they're on). Hotseat: light first.
    state.planningSide = state.mode === "bot" ? state.humanSide : "light";
    state.wardMode = false;
    state.summonMenuOpen = false;
    state.summonArmed = null;
    state.pendingReaperStrike = null;
    state.battle = null;
    // Hoarded Souls — interest on banked crystals (capped), a live save-vs-spend choice each round.
    for (const s of ["light", "dark"]) {
      const gain = Math.min(5, Math.floor(state.crystals[s] / 20));
      if (gain > 0) { state.crystals[s] += gain; logEvent(`${sideLabel(s)} hoards +${gain}◆ of interest from the Styx.`); }
    }
    clearSelection();
    if (!state.isReplay) { state.history.push(snapshotState()); if (state.history.length > 14) state.history.shift(); }
    refreshBanner();
    updatePlanBar();
    syncSidePanels();
  }

  /* ============================================================
   * BATTLE PHASE
   * ============================================================ */
  function beginBattle(ts) {
    state.scene = "battle";
    state.combo = { light: 0, dark: 0 };
    state.pendingMoves = [];
    if (!state.isReplay) {
      state.lastBattle = { fromSnapshot: snapshotState(), plans: JSON.parse(JSON.stringify(state.plan)), firstSide: state.firstSide };
    }
    clearSelection();
    state.wardMode = false;
    state.summonMenuOpen = false;
    state.summonArmed = null;
    state.pendingReaperStrike = null;
    dom.planBar.classList.add("hidden");
    dom.summonRow.classList.add("hidden");
    dom.reaperChoice.classList.add("hidden");
    // Hermes' Haste overrides initiative for the side that holds it.
    let fs = state.firstSide;
    if (hasBoon("light", "hermes") && !hasBoon("dark", "hermes")) fs = "light";
    else if (hasBoon("dark", "hermes") && !hasBoon("light", "hermes")) fs = "dark";
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
    setCaption(`Battle joined — ${sideLabel(fs)} strikes first.`);
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
      setCaption(`${sideLabel(side)}'s order dies with its bearer.`);
      return;
    }
    if (cmd.kind === "move") resolveMove(piece, cmd, ts);
    else resolveStrike(piece, cmd, ts);
  }

  function resolveMove(piece, cmd, ts) {
    const grid = buildOccupancyGrid(state.pieces);
    const legal = inBounds(cmd.row, cmd.col) && !grid[cmd.row][cmd.col] &&
      getMoveTiles(piece, grid).some(t => t.row === cmd.row && t.col === cmd.col);
    if (legal) {
      startDash(piece, cmd.row, cmd.col, ts, { kind: PIECE_DEFS[piece.type].moveKind === "tether" ? "tether" : "move" });
      setCaption(`${describePiece(piece)} advances.`);
      applyTerrainOnLand(piece, ts);
    } else {
      state.shake = Math.min(6, state.shake + 2);
      spawnDustPuff(piece.x, piece.y, piece.side, 6);
      setCaption(`${describePiece(piece)}'s path is blocked.`);
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
        setCaption(`${describePiece(piece)} unleashes a Reaping Spiral!`);
        bumpStat(piece.side, "spirals");
        for (const o of foes) { spawnSlash(piece, o, ts, "big"); strikeKill(o, piece, ts); }
      } else {
        setCaption(`${describePiece(piece)} sweeps her scythe through empty air.`);
      }
      return;
    }

    // Single-target strike (Reaper "advance" + every other piece).
    const target = pieceById(cmd.targetId);
    const inRange = target && target.alive &&
      getAttackTiles(piece, grid).some(t => t.row === target.row && t.col === target.col);
    const aimX = target ? target.x : cellCenter(cmd.row, cmd.col).x;
    const aimY = target ? target.y : cellCenter(cmd.row, cmd.col).y;
    piece.lunge = { fromX: piece.x, fromY: piece.y, targetX: aimX, targetY: aimY, startTs: ts, hitTs: ts, windupMs: 1, recoverMs: 260 };

    if (!inRange) {
      spawnSlash(piece, { x: aimX, y: aimY }, ts, "normal");
      spawnDamageText(aimX, aimY, "SHADOW", "#9a8fb0");
      audio.dash();
      setCaption(`${describePiece(piece)} strikes only shadow.`);
      return;
    }

    const tRow = target.row, tCol = target.col;
    if (defs.attackKind === "ranged") spawnProjectile(piece, target, ts, true);
    else spawnSlash(piece, target, ts, "big");
    state.shake = Math.min(9, state.shake + 3);
    state.flash = Math.min(1, state.flash + 0.18);
    setCaption(`${describePiece(piece)} strikes a killing blow!`);
    strikeKill(target, piece, ts);

    // Gambit Shove — Juggernaut & Wildrider knock a SURVIVING victim back a tile;
    // shoved into lava/off a chasm's edge is an environmental execution.
    if ((piece.type === "juggernaut" || piece.type === "wildrider") && target.alive) {
      const dr = Math.sign(target.row - piece.row), dc = Math.sign(target.col - piece.col);
      const nr = target.row + dr, nc = target.col + dc;
      const g = buildOccupancyGrid(state.pieces);
      if ((dr || dc) && inBounds(nr, nc) && !g[nr][nc] && terrainAt(nr, nc) !== "chasm") {
        startDash(target, nr, nc, ts, { kind: "move" });
        if (terrainAt(nr, nc) === "lava") { spawnDamageText(target.x, target.y - 6, "SHOVED → LAVA", "#ff7a3a"); killPiece(target, piece.side, ts); }
        else spawnDamageText(target.x, target.y - 6, "SHOVED", "#c7bcd4");
      }
    }

    // Harrower drags down a foe beside the victim.
    if (defs.strikeChain && !target.alive) {
      const g2 = buildOccupancyGrid(state.pieces);
      for (const [dr, dc] of KING_DIRS) {
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

  function strikeKill(target, attacker, ts) {
    if (!target.alive) return;
    if (target.warded) {
      target.warded = false;
      target.hitFlashUntil = ts + 240;
      spawnShockwave(target.x, target.y, "#e8c657", ts, { maxRadius: 54, durationMs: 440 });
      spawnBurstParticles(target.x, target.y, "neutral", 16);
      state.flash = Math.min(1, state.flash + 0.25);
      state.shake = Math.min(8, state.shake + 3);
      state.pendingBeat = Math.max(state.pendingBeat || 0, 120);
      spawnDamageText(target.x, target.y - 6, "AEGIS ✦", "#e8c657");
      bumpStat(target.side, "aegisBroken");
      audio.special();
      logEvent(`${describePiece(target)}'s Aegis shatters the blow!`);
      syncSidePanels();
      return;
    }
    target.lives -= 1;
    target.hitFlashUntil = ts + 200;
    spawnHitParticles(target.x, target.y, attacker ? attacker.side : null);
    if (target.lives <= 0) {
      killPiece(target, attacker ? attacker.side : null, ts);
    } else {
      spawnShockwave(target.x, target.y, glyphColor(target.side).glow, ts, { maxRadius: 46, durationMs: 380 });
      state.shake = Math.min(9, state.shake + 3);
      state.pendingBeat = Math.max(state.pendingBeat || 0, 120);
      triggerZoom(target.x, target.y, 0.06);
      spawnDamageText(target.x, target.y - 6, "-1 LIFE", "#c98bd1");
      audio.hit();
      logEvent(`${describePiece(target)} reels — ${target.lives} ${target.lives === 1 ? "life" : "lives"} remain.`);
    }
    syncSidePanels();
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
    spawnDamageText(target.x, target.y - 8, "SLAIN", "#ff6a6a");
    audio.death();
    logEvent(`${describePiece(target)} is slain${killerSide ? ` by ${sideLabel(killerSide)}` : ""}.`);
    bumpStat(killerSide, "kills");
    bumpStat(target.side, "losses");
    if (killerSide === "light" || killerSide === "dark") {
      const gain = crystalsPerKill(killerSide);
      state.crystals[killerSide] += gain;
      spawnDamageText(target.x + 18, target.y + 12, "+" + gain + "◆", "#8fd0ff");
      state.combo[killerSide] = (state.combo[killerSide] || 0) + 1;
      const chain = state.combo[killerSide];
      if (!state.isReplay) state.stats[killerSide].bestCombo = Math.max(state.stats[killerSide].bestCombo, chain);
      if (chain >= 2) {
        const bonus = 5 * (chain - 1);
        state.crystals[killerSide] += bonus;
        spawnDamageText(BOARD_PX / 2, BOARD_PX * 0.26, `${chain} SOULS · +${bonus}◆`, "#e8c657");
        state.shake = Math.min(15, state.shake + chain);
        state.flash = Math.min(1, state.flash + 0.04 * chain);
        audio.combo(chain);
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
    if (state.hazardsEnabled && state.roundNumber % 3 === 0) { genTerrain(); logEvent("The underworld shifts — the hazards move."); }
    beginPlanningPhase();
  }

  function endMatch(winnerSide, ts) {
    if (state.run && state.run.active) { handleRunEnd(winnerSide, ts); return; }
    state.scene = "gameover";
    state.winnerSide = winnerSide || null;
    const won = state.mode === "bot" ? (winnerSide === state.humanSide) : !!winnerSide;

    if (state.scenario) {
      // Trial / Daily outcome — separate progression, not the standard-duel record.
      state.trialResult = { id: state.scenario.id, won, rounds: state.roundNumber + 1, daily: !!state.scenario.daily };
      if (won && !state.scenario.daily) { const t = loadStore("sg.trials", {}); t[state.scenario.id] = true; saveStore("sg.trials", t); }
      if (state.scenario.daily) recordDaily(won);
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
    audio.gameOver();
    showGameOver();
  }

  /* ---- Chambers of the Descent (roguelike run) ---- */
  function newRun() { return { active: true, chamber: 0, boons: {}, botBoons: {}, carriedCrystals: 0 }; }
  function startDescent() { audio._ensure(); runState = newRun(); startChamber(); }
  function startChamber() {
    const cfg = CHAMBERS[runState.chamber];
    startMatch("bot", "dark", cfg.hazards, { run: runState, difficulty: cfg.difficulty, persona: cfg.persona, hazards: cfg.hazards });
    logEvent(`Chamber ${runState.chamber + 1}/${CHAMBERS.length}: ${cfg.name}${cfg.boss ? " — BOSS SHADE" : ""}.`);
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
        audio.gameOver(); showGameOver();
      } else {
        grantBotBoon(run);
        openBoonDraft(run);
      }
    } else {
      run.active = false; awardObols(false, run.chamber);
      state.scene = "gameover"; state.winnerSide = winnerSide; state.runOutcome = "defeat";
      audio.gameOver(); showGameOver();
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
      card.innerHTML = `<span class="trial-name">${b.name}</span><span class="trial-blurb">${b.desc}</span>`;
      card.addEventListener("click", () => { run.boons[b.id] = true; dom.boonScreen.classList.add("hidden"); startChamber(); });
      dom.boonList.appendChild(card);
    });
    dom.hud.classList.add("hidden");
    if (dom.boonTitle) dom.boonTitle.textContent = `CHAMBER CLEARED — CHOOSE A BOON (${run.chamber}/${CHAMBERS.length})`;
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

  /* ---- Trials + Daily Gambit launchers ---- */
  function startTrial(scenario) { audio._ensure(); startMatch("bot", scenario.humanSide, scenario.furies, { scenario }); }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function dailySeed() { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function dailyKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  function startDaily() {
    const rng = mulberry32(dailySeed());
    const base = SCENARIOS[Math.floor(rng() * SCENARIOS.length)];
    const mods = ["extra-furies", "bonus-crystals", "prewarded"];
    const mod = mods[Math.floor(rng() * mods.length)];
    const sc = JSON.parse(JSON.stringify(base));
    sc.name = `Daily · ${base.name}`;
    sc.daily = true; sc.dailyMod = mod;
    if (mod === "extra-furies") { sc.furies = true; sc.furyEvery = 3; }
    if (mod === "bonus-crystals") { sc.crystals = { light: (sc.crystals && sc.crystals.light) || 0, dark: ((sc.crystals && sc.crystals.dark) || 0) + 20 }; }
    if (mod === "prewarded") { for (const p of sc.pieces) if (p.side !== sc.humanSide && p.type === "sovereign") p.warded = true; }
    audio._ensure();
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
    state.dailyShare = `⚔ Stygian Gambit — Daily ${key.slice(5)} · ${won ? "cleared in " + rds + " round" + (rds === 1 ? "" : "s") : "fell"} · streak ${d.streak}`;
  }

  /* ============================================================
   * AI PLAN APPLICATION
   * ============================================================ */
  function applyAIPlan(side) {
    let plan = { commands: [], wards: [] };
    if (window.SG.AI && window.SG.AI.planTurn) plan = window.SG.AI.planTurn(side) || plan;
    state.plan[side] = plan.commands.slice(0, MAX_CMD);
    for (const id of plan.wards) {
      const p = pieceById(id);
      if (p && p.alive && p.side === side && !p.warded && state.aegis[side] > 0) { p.warded = true; state.aegis[side]--; }
    }
    aiSummon(side);
    syncSidePanels();
  }

  function aiSummon(side) {
    const persona = state.botPersona || "balanced";
    if (persona === "warden" && state.crystals[side] < 60) return;   // the Warden hoards
    const cap = persona === "swarm" ? 5 : 3;
    let guard = 0;
    while (guard++ < cap) {
      const opt = SUMMON_OPTIONS.slice().reverse().find(o => state.crystals[side] >= o.cost);
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
    spawnDamageText(p.x, p.y - 6, "RISEN", glyphColor(side).glow);
    bumpStat(side, "summons");
    audio.special();
    logEvent(`${sideLabel(side)} summons a ${PIECE_DEFS[type].label} from the abyss.`);
    syncSidePanels();
    return true;
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
    audio.special();
    logEvent("A Fury claws its way up from the deep to hunt the living.");
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
      setCaption(`A Fury tears into ${describePiece(target)}!`);
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
      setCaption(moved ? "A Fury prowls closer…" : "A Fury snarls, hemmed in.");
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
  function spawnDamageText(x, y, label, color) {
    state.damageNumbers.push({ x, y, label, color: color || "#ecdcc6", life: 0.9, maxLife: 0.9 });
    if (state.damageNumbers.length > 24) state.damageNumbers.shift();
  }
  function triggerZoom(x, y, amt) {
    if (state.reduceMotion) return;
    state.zoom = Math.max(state.zoom || 0, amt);
    state.zoomFocus = { x, y };
  }
  function updateParticles(dt, ts) {
    state.particles = state.particles.filter(p => { p.life -= dt; if (p.life <= 0) return false; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; return true; });
    state.damageNumbers = state.damageNumbers.filter(d => { d.life -= dt; d.y -= 26 * dt; return d.life > 0; });
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
   * AUDIO
   * ============================================================ */
  function AudioEngine() { this.ctx = null; this.master = null; this.muted = false; this.droneNodes = null; }
  AudioEngine.prototype._ensure = function () {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    this._startDrone();
  };
  AudioEngine.prototype._tone = function (freq, durMs, opts) {
    if (!this.ctx) return; opts = opts || {};
    const t0 = this.ctx.currentTime, osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = opts.type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.freqTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqTo), t0 + durMs / 1000);
    const peak = opts.gain != null ? opts.gain : 0.3;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t0); osc.stop(t0 + durMs / 1000 + 0.02);
  };
  AudioEngine.prototype._noise = function (durMs, opts) {
    if (!this.ctx) return; opts = opts || {};
    const t0 = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * (durMs / 1000));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const filter = this.ctx.createBiquadFilter(); filter.type = opts.filterType || "highpass"; filter.frequency.value = opts.freq || 800;
    const gain = this.ctx.createGain(); gain.gain.value = opts.gain != null ? opts.gain : 0.25;
    src.connect(filter); filter.connect(gain); gain.connect(this.master); src.start(t0);
  };
  AudioEngine.prototype._startDrone = function () {
    if (!this.ctx || this.droneNodes) return;
    const g = this.ctx.createGain(); g.gain.value = 0.045; g.connect(this.master);
    const o1 = this.ctx.createOscillator(); o1.type = "sine"; o1.frequency.value = 55;
    const o2 = this.ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = 58;
    o1.connect(g); o2.connect(g); o1.start(); o2.start();
    this.droneNodes = [o1, o2, g];
  };
  AudioEngine.prototype.hit = function () { this._ensure(); this._tone(150, 90, { type: "sine", gain: 0.22, freqTo: 60 }); };
  AudioEngine.prototype.dash = function () { this._ensure(); this._tone(320, 90, { type: "sawtooth", gain: 0.06, freqTo: 700 }); };
  AudioEngine.prototype.death = function () { this._ensure(); this._noise(280, { freq: 300, filterType: "lowpass", gain: 0.32 }); this._tone(220, 320, { gain: 0.16, freqTo: 55 }); };
  AudioEngine.prototype.boon = function () { this._ensure(); this._tone(660, 200, { gain: 0.2 }); this._tone(990, 260, { gain: 0.14 }); };
  AudioEngine.prototype.special = function () { this._ensure(); this._noise(160, { freq: 1400, gain: 0.2 }); this._tone(880, 200, { gain: 0.14 }); };
  AudioEngine.prototype.combo = function (chain) { this._ensure(); const semis = Math.min(chain, 10); this._tone(392 * Math.pow(2, semis / 12), 200, { gain: 0.16 }); };
  AudioEngine.prototype.gameOver = function () { this._ensure(); [440, 330, 262, 196].forEach((f, i) => setTimeout(() => this._tone(f, 360, { gain: 0.2 }), i * 180)); };
  AudioEngine.prototype.setMuted = function (m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.55; };
  const audio = new AudioEngine();

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
          if (legal) { p.row = cmd.row; p.col = cmd.col; if (terrainAt(p.row, p.col) === "lava") { p.alive = false; forecast.deaths.push({ id: p.id, row: p.row, col: p.col, type: p.type, side: p.side }); } }
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
              if (defs.strikeChain && !target.alive) { const g2 = buildOccupancyGrid(clones); for (const [dr, dc] of KING_DIRS) { const r = tRow + dr, c = tCol + dc; if (!inBounds(r, c)) continue; const o = g2[r][c]; if (o && o.alive && o.side !== p.side) { predKill(o, forecast); break; } } }
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
      ctx.globalAlpha = 0.26; ctx.save(); ctx.translate(cc.x, cc.y); ctx.scale(0.78, 0.78); paintFigure(m.type, sidePalette(m.side), TILE * 0.33, ts); ctx.restore();
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
      // order badge
      drawBadge(to.x, to.y - TILE * 0.38, i + 1);
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

  const INK = "#0b0710";
  const FACE = "#ecd6bf";
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

    ctx.save(); ctx.globalAlpha = fadeT * 0.32;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.95 + bob * 0.2, r * 0.9 * scale, r * 0.32 * scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fill(); ctx.restore();

    if (!dying) {
      ctx.save(); ctx.globalAlpha = fadeT;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 1.0, r * 0.78 * scale, r * 0.26 * scale, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(18,10,20,0.9)"; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = hexToRgba(pal.gold, 0.7); ctx.stroke(); ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = fadeT;
    ctx.translate(p.x + lungeX, p.y + lungeY + bob);
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
      const halo = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.85);
      halo.addColorStop(0, hexToRgba(colors.glow, 0.4)); halo.addColorStop(1, hexToRgba(colors.glow, 0));
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, r * 1.85, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 3;
    paintFigure(p.type, pal, r, ts);
    ctx.shadowBlur = 0;

    // hit flash overlay
    if (ts < p.hitFlashUntil) {
      ctx.globalAlpha = clamp((p.hitFlashUntil - ts) / 200, 0, 1) * 0.8;
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // life pips (royalty)
    if (!dying && p.maxLives > 1) drawLifePips(p, r, bob);
    // colorblind-safe side glyph
    if (!dying && state.colorGlyphs) drawSideGlyph(p, r, bob);
  }

  function drawSideGlyph(p, r, bob) {
    ctx.save();
    ctx.translate(p.x + r * 0.95, p.y + bob - r * 0.95);
    ctx.lineWidth = 1.4; ctx.strokeStyle = "#0b0710"; ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    if (p.side === "light") { ctx.moveTo(0, -5); ctx.lineTo(5, 4); ctx.lineTo(-5, 4); }
    else if (p.side === "dark") { ctx.moveTo(0, 5); ctx.lineTo(5, -4); ctx.lineTo(-5, -4); }
    else { ctx.moveTo(0, -5); ctx.lineTo(5, 0); ctx.lineTo(0, 5); ctx.lineTo(-5, 0); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawLifePips(p, r, bob) {
    const n = p.maxLives, gap = 8, w = (n - 1) * gap;
    const y = p.y + bob - r - 15;
    for (let i = 0; i < n; i++) {
      const x = p.x - w / 2 + i * gap;
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      if (i < p.lives) { ctx.fillStyle = p.type === "sovereign" ? "#e8c657" : "#c98bd1"; ctx.fill(); ctx.strokeStyle = "#0b0710"; ctx.lineWidth = 1; ctx.stroke(); }
      else { ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fill(); ctx.strokeStyle = "rgba(150,120,90,0.5)"; ctx.lineWidth = 1; ctx.stroke(); }
    }
  }

  // Painted, ink-outlined figures (unchanged Hades-style art).
  function paintFigure(type, pal, r, ts, c) {
    c = c || ctx;
    c.lineJoin = "round"; c.lineCap = "round";
    const bodyGrad = c.createLinearGradient(-r, -r * 1.2, r, r * 1.2);
    bodyGrad.addColorStop(0, pal.bright); bodyGrad.addColorStop(0.55, pal.mid); bodyGrad.addColorStop(1, pal.deep);
    function ink(w) { c.strokeStyle = INK; c.lineWidth = w || 2.4; c.stroke(); }
    function fillInk(style, w) { c.fillStyle = style; c.fill(); ink(w); }
    function head(cx, cy, rad) { c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); fillInk(FACE, 2.1); c.beginPath(); c.arc(cx - rad * 0.3, cy - rad * 0.3, rad * 0.28, 0, Math.PI * 2); c.fillStyle = "rgba(255,255,255,0.45)"; c.fill(); }
    function robe(topW, botW, topY, botY) { c.beginPath(); c.moveTo(-topW, topY); c.quadraticCurveTo(-botW * 1.08, (topY + botY) / 2, -botW, botY); c.lineTo(botW, botY); c.quadraticCurveTo(botW * 1.08, (topY + botY) / 2, topW, topY); c.closePath(); fillInk(bodyGrad, 2.6); }
    function eyes(cx, cy, dx, rad, color) { c.fillStyle = color; c.beginPath(); c.arc(cx - dx, cy, rad, 0, Math.PI * 2); c.arc(cx + dx, cy, rad, 0, Math.PI * 2); c.fill(); }
    function rr(x, y, w, h, rad) { c.beginPath(); c.moveTo(x + rad, y); c.arcTo(x + w, y, x + w, y + h, rad); c.arcTo(x + w, y + h, x, y + h, rad); c.arcTo(x, y + h, x, y, rad); c.arcTo(x, y, x + w, y, rad); c.closePath(); }

    switch (type) {
      case "sovereign": {
        robe(r * 0.5, r * 1.0, -r * 0.2, r * 1.15);
        c.beginPath(); c.moveTo(-r * 0.5, -r * 0.2); c.quadraticCurveTo(0, r * 0.15, r * 0.5, -r * 0.2); c.lineWidth = 5; c.strokeStyle = pal.rim; c.stroke(); ink(2);
        head(0, -r * 0.55, r * 0.32);
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.42); c.lineTo(0, r * 0.02); c.lineTo(r * 0.22, -r * 0.42); c.closePath(); fillInk("#cdb79a", 1.6);
        const cy = -r * 0.82;
        c.beginPath(); c.moveTo(-r * 0.36, cy + r * 0.16); c.lineTo(-r * 0.36, cy); c.lineTo(-r * 0.18, cy + r * 0.2); c.lineTo(0, cy - r * 0.18); c.lineTo(r * 0.18, cy + r * 0.2); c.lineTo(r * 0.36, cy); c.lineTo(r * 0.36, cy + r * 0.16); c.closePath(); fillInk(pal.gold, 2);
        break;
      }
      case "reaper": {
        c.beginPath(); c.moveTo(r * 0.55, -r * 1.28); c.lineTo(r * 0.72, r * 1.1); c.strokeStyle = INK; c.lineWidth = 4.6; c.stroke(); c.strokeStyle = pal.gold; c.lineWidth = 2.2; c.stroke();
        c.beginPath(); c.moveTo(r * 0.55, -r * 1.28); c.quadraticCurveTo(-r * 0.5, -r * 1.55, -r * 0.72, -r * 0.85); c.quadraticCurveTo(-r * 0.05, -r * 1.05, r * 0.55, -r * 1.02); c.closePath(); fillInk("#e9e2cf", 2);
        c.beginPath(); c.moveTo(0, -r * 1.05); c.quadraticCurveTo(-r * 1.0, -r * 0.5, -r * 0.85, r * 1.15); c.lineTo(r * 0.85, r * 1.15); c.quadraticCurveTo(r * 1.0, -r * 0.5, 0, -r * 1.05); c.closePath(); fillInk(bodyGrad, 2.5);
        c.beginPath(); c.ellipse(0, -r * 0.35, r * 0.32, r * 0.42, 0, 0, Math.PI * 2); c.fillStyle = "rgba(6,4,10,0.92)"; c.fill();
        eyes(0, -r * 0.4, r * 0.13, r * 0.06, pal.bright);
        break;
      }
      case "juggernaut": {
        rr(-r * 0.82, -r * 0.1, r * 1.64, r * 1.2, r * 0.22); fillInk(bodyGrad, 2.8);
        for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 0.82, -r * 0.05, r * 0.42, 0, Math.PI * 2); fillInk(pal.mid, 2.6); c.beginPath(); c.arc(sx * r * 0.82, -r * 0.05, r * 0.19, 0, Math.PI * 2); fillInk(pal.gold, 1.6); }
        head(0, -r * 0.5, r * 0.26);
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.5); c.lineTo(r * 0.22, -r * 0.5); ink(2.4);
        c.beginPath(); c.moveTo(0, r * 0.25); c.lineTo(r * 0.17, r * 0.5); c.lineTo(0, r * 0.75); c.lineTo(-r * 0.17, r * 0.5); c.closePath(); fillInk(pal.gold, 1.8);
        break;
      }
      case "trickster": {
        c.beginPath(); c.moveTo(r * 0.6, -r * 1.1); c.lineTo(r * 0.68, r * 1.1); c.strokeStyle = INK; c.lineWidth = 4; c.stroke(); c.strokeStyle = pal.gold; c.lineWidth = 1.8; c.stroke();
        c.beginPath(); c.arc(r * 0.62, -r * 1.18, r * 0.18, 0, Math.PI * 2); const og = c.createRadialGradient(r * 0.56, -r * 1.24, 1, r * 0.62, -r * 1.18, r * 0.2); og.addColorStop(0, "#ffffff"); og.addColorStop(1, pal.bright); fillInk(og, 1.6);
        robe(r * 0.32, r * 0.72, -r * 0.3, r * 1.15);
        c.beginPath(); c.moveTo(0, -r * 1.05); c.lineTo(-r * 0.42, -r * 0.18); c.lineTo(r * 0.42, -r * 0.18); c.closePath(); fillInk(bodyGrad, 2.5);
        c.beginPath(); c.moveTo(0, -r * 0.64); c.lineTo(r * 0.26, -r * 0.34); c.lineTo(0, -r * 0.02); c.lineTo(-r * 0.26, -r * 0.34); c.closePath(); fillInk("#e9e2cf", 2);
        c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(-r * 0.15, -r * 0.4); c.lineTo(-r * 0.02, -r * 0.32); c.moveTo(r * 0.15, -r * 0.4); c.lineTo(r * 0.02, -r * 0.32); c.stroke();
        break;
      }
      case "wildrider": {
        c.beginPath(); c.moveTo(-r * 0.9, r * 1.1); c.quadraticCurveTo(-r * 0.98, r * 0.1, -r * 0.4, -r * 0.15); c.lineTo(r * 0.4, -r * 0.15); c.quadraticCurveTo(r * 0.98, r * 0.1, r * 0.9, r * 1.1); c.closePath(); fillInk(bodyGrad, 2.5);
        c.beginPath(); c.arc(0, -r * 0.42, r * 0.42, 0, Math.PI * 2); fillInk(pal.mid, 2.5);
        for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * r * 0.3, -r * 0.64); c.quadraticCurveTo(sx * r * 0.9, -r * 1.02, sx * r * 0.72, -r * 1.4); c.quadraticCurveTo(sx * r * 0.55, -r * 0.98, sx * r * 0.16, -r * 0.72); c.closePath(); fillInk(pal.gold, 1.8); }
        eyes(0, -r * 0.42, r * 0.16, r * 0.075, "#fff2a0");
        c.beginPath(); c.moveTo(-r * 0.13, -r * 0.12); c.lineTo(-r * 0.05, r * 0.06); c.lineTo(r * 0.02, -r * 0.12); c.moveTo(r * 0.13, -r * 0.12); c.lineTo(r * 0.05, r * 0.06); c.lineTo(-r * 0.02, -r * 0.12); c.fillStyle = "#ffffff"; c.fill();
        break;
      }
      case "skirmisher": {
        c.beginPath(); c.moveTo(0, -r * 0.78); c.quadraticCurveTo(-r * 0.7, -r * 0.3, -r * 0.6, r * 0.7); c.quadraticCurveTo(-r * 0.3, r * 1.12, 0, r * 0.92); c.quadraticCurveTo(r * 0.3, r * 1.12, r * 0.6, r * 0.7); c.quadraticCurveTo(r * 0.7, -r * 0.3, 0, -r * 0.78); c.closePath(); fillInk(bodyGrad, 2.3);
        c.beginPath(); c.ellipse(0, -r * 0.22, r * 0.24, r * 0.3, 0, 0, Math.PI * 2); c.fillStyle = "rgba(6,4,10,0.88)"; c.fill();
        c.fillStyle = pal.bright; c.beginPath(); c.arc(0, -r * 0.26, r * 0.06, 0, Math.PI * 2); c.fill();
        break;
      }
      case "harrower": {
        c.beginPath(); c.moveTo(0, -r * 1.0); c.quadraticCurveTo(-r * 0.95, -r * 0.45, -r * 0.8, r * 1.12); c.lineTo(r * 0.8, r * 1.12); c.quadraticCurveTo(r * 0.95, -r * 0.45, 0, -r * 1.0); c.closePath(); fillInk(bodyGrad, 2.5);
        c.beginPath(); c.ellipse(0, -r * 0.35, r * 0.3, r * 0.38, 0, 0, Math.PI * 2); c.fillStyle = "rgba(6,4,10,0.9)"; c.fill();
        eyes(0, -r * 0.4, r * 0.11, r * 0.055, pal.bright);
        c.beginPath(); c.moveTo(r * 0.58, -r * 0.15); c.quadraticCurveTo(r * 1.02, r * 0.3, r * 0.72, r * 0.72); c.quadraticCurveTo(r * 0.5, r * 0.98, r * 0.78, r * 1.0); c.strokeStyle = INK; c.lineWidth = 4; c.stroke(); c.strokeStyle = pal.gold; c.lineWidth = 2; c.stroke();
        c.fillStyle = pal.gold; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(-r * 0.62, -r * 0.1 + i * r * 0.34, r * 0.07, 0, Math.PI * 2); c.fill(); }
        break;
      }
      case "fury": {
        for (const sx of [-1, 1]) {
          c.beginPath();
          c.moveTo(sx * r * 0.2, -r * 0.2);
          c.lineTo(sx * r * 1.15, -r * 0.85);
          c.lineTo(sx * r * 0.95, -r * 0.1);
          c.lineTo(sx * r * 1.08, r * 0.35);
          c.lineTo(sx * r * 0.35, r * 0.2);
          c.closePath(); fillInk(bodyGrad, 2.2);
        }
        c.beginPath();
        c.moveTo(0, -r * 0.55);
        c.quadraticCurveTo(-r * 0.4, -r * 0.1, -r * 0.35, r * 1.05);
        c.lineTo(r * 0.35, r * 1.05);
        c.quadraticCurveTo(r * 0.4, -r * 0.1, 0, -r * 0.55);
        c.closePath(); fillInk(pal.mid, 2.4);
        c.beginPath(); c.arc(0, -r * 0.62, r * 0.26, 0, Math.PI * 2); fillInk(pal.bright, 2);
        eyes(0, -r * 0.62, r * 0.09, r * 0.05, INK);
        break;
      }
      default:
        c.beginPath(); c.arc(0, 0, r * 0.5, 0, Math.PI * 2); fillInk(bodyGrad, 2.4);
    }
  }

  // Draw each role's figure into its legend icon canvas on the start screen.
  function buildLegendIcons() {
    const icons = document.querySelectorAll(".legend-icon");
    icons.forEach(cv => {
      const type = cv.getAttribute("data-piece");
      const side = cv.getAttribute("data-side") || "light";
      const lc = cv.getContext("2d");
      const w = cv.width, h = cv.height, r = w * 0.30;
      lc.clearRect(0, 0, w, h);
      const colors = glyphColor(side), pal = sidePalette(side);
      lc.save();
      lc.translate(w / 2, h * 0.56);
      const halo = lc.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.7);
      halo.addColorStop(0, hexToRgba(colors.glow, 0.4)); halo.addColorStop(1, hexToRgba(colors.glow, 0));
      lc.fillStyle = halo; lc.beginPath(); lc.arc(0, 0, r * 1.7, 0, Math.PI * 2); lc.fill();
      paintFigure(type, pal, r, 0, lc);
      lc.restore();
    });
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
      ctx.globalAlpha = a;
      ctx.font = "bold 15px Georgia";
      ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(8,4,12,0.92)"; ctx.strokeText(d.label, d.x, d.y);
      ctx.fillStyle = d.color; ctx.fillText(d.label, d.x, d.y);
    }
    ctx.restore();
    ctx.globalAlpha = 1; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }
  function drawImpactFlash() {
    if (!state.flash || state.reduceMotion) return;
    ctx.save(); ctx.globalAlpha = clamp(state.flash, 0, 0.45); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, BOARD_PX, BOARD_PX); ctx.restore();
  }

  function render(ts) {
    ctx.save();
    if (state.shake > 0.1 && !state.reduceMotion) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    if (state.zoom > 0.001) {
      const z = 1 + state.zoom, f = state.zoomFocus;
      ctx.translate(f.x, f.y); ctx.scale(z, z); ctx.translate(-f.x, -f.y);
    }
    if (boardCache) ctx.drawImage(boardCache, 0, 0);
    drawTerrain(ts);
    drawAmbientParticles();
    drawHighlights(ts);
    drawShockwaves(ts);
    const sorted = state.pieces.slice().sort((a, b) => (a.alive ? 0 : 1) - (b.alive ? 0 : 1));
    for (const p of sorted) drawPiece(p, ts);
    if (state.scene === "planning" && state.foresightOn) drawForesight(ts);
    drawPlanGhosts(ts);
    drawSlashes(ts);
    drawProjectiles(ts);
    drawParticles();
    drawDamageNumbers();
    drawImpactFlash();
    ctx.restore();
  }

  /* ============================================================
   * UI SYNC
   * ============================================================ */
  const dom = {};
  ["startScreen","hud","gameOverScreen","planBar","planLabel","btnWard","btnUndo","btnClear","btnValidate",
   "btnSummon","summonRow","summonBtns","summonHint","crystalLight","crystalDark",
   "reaperChoice","reaperSpiral","reaperAdvance","btnReplay","btnRevert","btnThreat","btnForesight",
   "btnHotseat","btnVsBot","btnPlayAgain","btnMainMenu","btnMute","btnQuit","turnBanner","eventLog","winnerHeadline","furyToggle","hazardToggle",
   "aegisLight","aegisDark","royalLight","royalDark","countLight","countDark",
   "handoffScreen","handoffTitle","handoffText","btnHandoffReady",
   "btnHelp","btnHelpGame","helpScreen","btnHelpClose","ledger","hallRecord",
   "difficulty","persona","btnTrials","btnDaily","trialsScreen","trialsList","btnTrialsClose","hazardToggle",
   "btnOptions","btnOptionsGame","optionsScreen","btnOptionsClose","optReduceMotion","optColorGlyphs","optSpeed","optSpeedVal",
   "btnDescend","btnMirror","boonScreen","boonList","boonTitle","mirrorScreen","btnMirrorClose","mirrorObols","mirrorUpgrades"].forEach(id => { dom[id] = document.getElementById(id); });

  function logEvent(text) {
    if (state.isReplay) return;
    state.eventLog.push(text);
    if (state.eventLog.length > 60) state.eventLog.shift();
    const div = document.createElement("div"); div.textContent = text; div.className = "log-enter";
    dom.eventLog.appendChild(div); dom.eventLog.scrollTop = dom.eventLog.scrollHeight;
  }
  function setCaption(text) { state.caption = text; if (state.scene === "battle") refreshBanner(); }

  function refreshBanner() {
    if (!dom.turnBanner) return;
    let txt = "";
    const chamber = state.run && state.run.active ? `${CHAMBERS[state.run.chamber].name} (${state.run.chamber + 1}/${CHAMBERS.length}) · ` : "";
    if (state.scene === "planning") txt = `${chamber}${sideLabel(state.planningSide)} — plan in secret · Round ${state.roundNumber + 1} · ${sideLabel(state.firstSide)} resolves first`;
    else if (state.scene === "battle") txt = (state.isReplay ? "↻ REPLAY · " : "") + (state.caption || "Battle!");
    else if (state.scene === "handoff") txt = "Pass the device…";
    dom.turnBanner.textContent = txt;
    dom.turnBanner.classList.toggle("side-light", state.planningSide === "light");
    dom.turnBanner.classList.toggle("side-dark", state.planningSide === "dark");
  }

  function aegisStr(side) {
    let s = "";
    for (let i = 0; i < AEGIS_START; i++) s += i < state.aegis[side] ? "⛨" : "<span class='spent'>⛨</span>";
    return s;
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
    dom.aegisLight.innerHTML = aegisStr("light");
    dom.aegisDark.innerHTML = aegisStr("dark");
    dom.crystalLight.textContent = state.crystals.light;
    dom.crystalDark.textContent = state.crystals.dark;
    dom.royalLight.innerHTML = royalStr("light");
    dom.royalDark.innerHTML = royalStr("dark");
    dom.countLight.textContent = state.pieces.filter(p => p.alive && p.side === "light").length;
    dom.countDark.textContent = state.pieces.filter(p => p.alive && p.side === "dark").length;
  }

  function updateSummonUI() {
    const open = state.scene === "planning" && state.summonMenuOpen;
    dom.summonRow.classList.toggle("hidden", !open);
    dom.btnSummon.classList.toggle("ward-on", state.summonMenuOpen);
    if (!open) return;
    const side = state.planningSide;
    SUMMON_OPTIONS.forEach((o, i) => {
      const btn = summonBtnEls[i];
      if (!btn) return;
      btn.textContent = `${o.label} · ${o.cost}`;
      btn.disabled = state.crystals[side] < o.cost;
      btn.classList.toggle("armed", state.summonArmed === o.type);
    });
    dom.summonHint.textContent = state.summonArmed
      ? `Place your ${PIECE_DEFS[state.summonArmed].label} on an empty tile in your half.`
      : `Crystals: ${state.crystals[side]} — choose a reinforcement:`;
  }

  const summonBtnEls = [];
  function buildSummonButtons() {
    if (!dom.summonBtns) return;
    dom.summonBtns.innerHTML = "";
    summonBtnEls.length = 0;
    SUMMON_OPTIONS.forEach(o => {
      const btn = document.createElement("button");
      btn.className = "btn btn-ghost";
      btn.addEventListener("click", () => {
        if (state.scene !== "planning") return;
        if (state.crystals[state.planningSide] < o.cost) return;
        state.summonArmed = state.summonArmed === o.type ? null : o.type;
        clearSelection();
        updatePlanBar();
      });
      dom.summonBtns.appendChild(btn);
      summonBtnEls.push(btn);
    });
  }

  function updatePlanBar() {
    if (state.scene !== "planning") { dom.planBar.classList.add("hidden"); dom.summonRow.classList.add("hidden"); return; }
    dom.planBar.classList.remove("hidden");
    const side = state.planningSide;
    const used = new Set(state.plan[side].map(c => c.pieceId)).size;
    dom.planLabel.textContent = `${sideLabel(side)}: ${used}/${maxCmdFor(side)} commands · Aegis ×${state.aegis[side]} · ${state.crystals[side]}◆`;
    dom.btnWard.textContent = state.wardMode ? "Ward: On" : "Ward: Off";
    dom.btnWard.classList.toggle("ward-on", state.wardMode);
    const canAct = !(state.mode === "bot" && state.planningSide !== state.humanSide);
    if (dom.btnReplay) dom.btnReplay.disabled = !state.lastBattle || !canAct;
    if (dom.btnRevert) dom.btnRevert.disabled = state.history.length < 2 || !canAct;
    if (dom.btnThreat) { dom.btnThreat.textContent = state.showThreat ? "Doom Sight: On" : "Doom Sight: Off"; dom.btnThreat.classList.toggle("ward-on", state.showThreat); }
    if (dom.btnForesight) { dom.btnForesight.textContent = state.foresightOn ? "Foresight: On" : "Foresight: Off"; dom.btnForesight.classList.toggle("ward-on", state.foresightOn); }
    updateSummonUI();
    dom.reaperChoice.classList.toggle("hidden", !state.pendingReaperStrike);
  }

  /* ---- Replay the last clash (visual re-run) ---- */
  function replayLastRound() {
    if (!state.lastBattle || state.scene !== "planning") return;
    if (state.mode === "bot" && state.planningSide !== state.humanSide) return;
    state.replayReturn = snapshotState();
    state.replayReturnPlan = JSON.parse(JSON.stringify(state.plan));
    logEvent("↻ Replaying the last clash…");
    loadSnapshotPieces(state.lastBattle.fromSnapshot);
    state.plan = JSON.parse(JSON.stringify(state.lastBattle.plans));
    state.firstSide = state.lastBattle.firstSide;
    state.isReplay = true;
    clearSelection();
    dom.planBar.classList.add("hidden");
    dom.summonRow.classList.add("hidden");
    dom.reaperChoice.classList.add("hidden");
    beginBattle(state.lastTs);
  }

  /* ---- Redo / Revert the last round (undo the outcome, replan) ---- */
  function revertRound() {
    if (state.scene !== "planning") return;
    if (state.mode === "bot" && state.planningSide !== state.humanSide) return;
    if (state.history.length < 2) { setCaption("The abyss remembers no earlier round."); refreshBanner(); return; }
    state.history.pop();                                    // discard this round's start
    const prev = state.history[state.history.length - 1];   // restore the previous round's start
    loadSnapshotPieces(prev);
    state.plan = { light: [], dark: [] };
    state.planLocked = { light: false, dark: false };
    state.lastBattle = null;
    state.wardMode = false; state.summonMenuOpen = false; state.summonArmed = null;
    state.pendingReaperStrike = null;
    state.scene = "planning";
    state.planningSide = state.mode === "bot" ? state.humanSide : "light";
    clearSelection();
    logEvent("↺ Time unravels — the last round is undone.");
    refreshBanner(); updatePlanBar(); syncSidePanels();
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
    const col = Math.floor(x / TILE), row = Math.floor(y / TILE);
    if (!inBounds(row, col)) return null;
    return { row, col };
  }

  canvas.addEventListener("click", (evt) => {
    if (state.scene !== "planning") return;
    // in bot mode, only the human side plans manually
    if (state.mode === "bot" && state.planningSide !== state.humanSide) return;
    const cell = canvasToCell(evt);
    if (!cell) { clearSelection(); return; }
    const grid = buildOccupancyGrid(state.pieces);
    const clicked = grid[cell.row][cell.col];

    if (state.pendingReaperStrike) { cancelReaperChoice(); return; }

    if (state.summonArmed) {
      if (homeRows(state.planningSide).includes(cell.row) && !clicked) {
        const armed = state.summonArmed;
        summonPiece(state.planningSide, armed, cell.row, cell.col);
        if (state.crystals[state.planningSide] < SUMMON_OPTIONS.find(o => o.type === armed).cost) state.summonArmed = null;
      } else {
        state.summonArmed = null;
      }
      updatePlanBar();
      return;
    }

    if (state.wardMode) {
      if (clicked && clicked.side === state.planningSide) { toggleWard(clicked); updatePlanBar(); }
      return;
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
        } else if (addPlanCommand({ pieceId: piece.id, kind: "strike", targetId: clicked.id, row: cell.row, col: cell.col })) {
          clearSelection(); updatePlanBar();
        }
        return;
      }
      if (clicked && isPlanControllable(clicked)) { selectPiece(clicked); return; }
      clearSelection();
      return;
    }
    if (clicked && isPlanControllable(clicked)) selectPiece(clicked);
  });

  dom.btnWard.addEventListener("click", () => { if (state.scene !== "planning") return; state.wardMode = !state.wardMode; if (state.wardMode) { state.summonMenuOpen = false; state.summonArmed = null; } clearSelection(); updatePlanBar(); });
  dom.btnSummon.addEventListener("click", () => {
    if (state.scene !== "planning") return;
    state.summonMenuOpen = !state.summonMenuOpen;
    if (state.summonMenuOpen) state.wardMode = false; else state.summonArmed = null;
    clearSelection();
    updatePlanBar();
  });
  buildSummonButtons();
  dom.reaperSpiral.addEventListener("click", () => commitReaperStrike("spiral"));
  dom.reaperAdvance.addEventListener("click", () => commitReaperStrike("advance"));
  if (dom.btnReplay) dom.btnReplay.addEventListener("click", () => replayLastRound());
  if (dom.btnRevert) dom.btnRevert.addEventListener("click", () => revertRound());
  if (dom.btnThreat) dom.btnThreat.addEventListener("click", () => { if (state.scene !== "planning") return; state.showThreat = !state.showThreat; updatePlanBar(); });
  if (dom.btnForesight) dom.btnForesight.addEventListener("click", () => { if (state.scene !== "planning") return; state.foresightOn = !state.foresightOn; updatePlanBar(); });
  function openHelp() { dom.helpScreen.classList.remove("hidden"); }
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
      card.innerHTML = `<span class="trial-name">${done ? "✓ " : ""}${sc.name} <em>· ${sc.difficulty}</em></span><span class="trial-blurb">${sc.blurb}</span>`;
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
    if (dom.optSpeedVal) dom.optSpeedVal.textContent = o.battleSpeed + "×";
  }
  function openOptions() { syncOptionsUI(); dom.optionsScreen.classList.remove("hidden"); }
  if (dom.btnOptions) dom.btnOptions.addEventListener("click", openOptions);
  if (dom.btnOptionsGame) dom.btnOptionsGame.addEventListener("click", openOptions);
  if (dom.btnOptionsClose) dom.btnOptionsClose.addEventListener("click", () => dom.optionsScreen.classList.add("hidden"));
  if (dom.optReduceMotion) dom.optReduceMotion.addEventListener("change", saveOptionsFromUI);
  if (dom.optColorGlyphs) dom.optColorGlyphs.addEventListener("change", saveOptionsFromUI);
  if (dom.optSpeed) dom.optSpeed.addEventListener("input", saveOptionsFromUI);

  /* ---- Descent + Mirror UI ---- */
  const MIRROR_UPG = {
    aegis: { name: "Aegis of Night", max: 2, desc: "+1 starting Aegis charge", cost: lv => 20 + lv * 20 },
    crystal: { name: "Coffer of Souls", max: 3, desc: "+5 starting crystals", cost: lv => 15 + lv * 15 },
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
      btn.innerHTML = `<span class="trial-name">${u.name} · Lv ${lv}/${u.max}</span><span class="trial-blurb">${u.desc} — ${maxed ? "MAXED" : cost + " obols"}</span>`;
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
    audio.boon(); refreshMirror(); refreshHallRecord();
  }
  if (dom.btnDescend) dom.btnDescend.addEventListener("click", () => startDescent());
  if (dom.btnMirror) dom.btnMirror.addEventListener("click", () => { refreshMirror(); dom.mirrorScreen.classList.remove("hidden"); });
  if (dom.btnMirrorClose) dom.btnMirrorClose.addEventListener("click", () => dom.mirrorScreen.classList.add("hidden"));
  dom.btnUndo.addEventListener("click", () => { if (state.scene !== "planning") return; state.plan[state.planningSide].pop(); clearSelection(); updatePlanBar(); });
  dom.btnClear.addEventListener("click", () => { if (state.scene !== "planning") return; state.plan[state.planningSide] = []; clearSelection(); updatePlanBar(); });
  dom.btnValidate.addEventListener("click", () => onValidate());
  dom.btnHandoffReady.addEventListener("click", () => onHandoffReady());
  dom.btnMute.addEventListener("click", () => { audio.setMuted(!audio.muted); dom.btnMute.textContent = audio.muted ? "Unmute" : "Mute"; });
  dom.btnQuit.addEventListener("click", () => showStart());
  dom.btnMainMenu.addEventListener("click", () => showStart());
  dom.btnPlayAgain.addEventListener("click", () => {
    if (state.runOutcome) startDescent();
    else if (state.scenario && !state.scenario.daily) startTrial(state.scenario);
    else startMatch(state.mode, state.humanSide, state.furiesEnabled);
  });
  dom.btnHotseat.addEventListener("click", () => { audio._ensure(); startMatch("hotseat", "light", dom.furyToggle && dom.furyToggle.checked); });
  dom.btnVsBot.addEventListener("click", () => { audio._ensure(); startMatch("bot", "dark", dom.furyToggle && dom.furyToggle.checked); });

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
    if (bot) parts.push(`Bot — best <b>${bot.bestScore}</b> · ${bot.wins}/${bot.plays} won`);
    if (hot) parts.push(`Duel — <b>${hot.plays}</b> played`);
    if (trialCount) parts.push(`Trials — <b>${trialCount}</b>/${SCENARIOS.length} cleared`);
    if (daily && daily.streak) parts.push(`Daily streak — <b>${daily.streak}</b>`);
    dom.hallRecord.innerHTML = parts.length ? `⚜ Hall of the Fallen — ${parts.join(" &nbsp;·&nbsp; ")}` : "";
    if (dom.btnDaily) {
      const doneToday = daily && daily.date === dailyKey();
      dom.btnDaily.disabled = !!doneToday;
      dom.btnDaily.textContent = doneToday ? "Daily done ✓" : "☀ Daily Gambit";
    }
  }

  function showStart() {
    state.scene = "start";
    refreshHallRecord();
    dom.startScreen.classList.remove("hidden");
    dom.hud.classList.add("hidden");
    dom.gameOverScreen.classList.add("hidden");
    dom.handoffScreen.classList.add("hidden");
    dom.planBar.classList.add("hidden");
    dom.summonRow.classList.add("hidden");
    dom.reaperChoice.classList.add("hidden");
    if (dom.boonScreen) dom.boonScreen.classList.add("hidden");
    if (dom.mirrorScreen) dom.mirrorScreen.classList.add("hidden");
    if (dom.trialsScreen) dom.trialsScreen.classList.add("hidden");
    if (dom.optionsScreen) dom.optionsScreen.classList.add("hidden");
    runState = null;
  }
  function showGameOver() {
    if (state.runOutcome) {
      dom.winnerHeadline.textContent = state.runOutcome === "victory" ? "THE DESCENT CONQUERED" : "FALLEN IN THE DESCENT";
    } else if (state.scenario) {
      const won = state.trialResult && state.trialResult.won;
      dom.winnerHeadline.textContent = won ? "TRIAL CLEARED" : "TRIAL FAILED";
    } else {
      dom.winnerHeadline.textContent = state.winnerSide ? `${sideLabel(state.winnerSide).toUpperCase()} TRIUMPHANT` : "MUTUAL RUIN";
    }
    if (dom.ledger) {
      const rows = [
        ["Kills", "kills"], ["Losses", "losses"], ["Reaping Spirals", "spirals"],
        ["Aegis blocks", "aegisBroken"], ["Reinforcements", "summons"], ["Best combo", "bestCombo"],
      ];
      const L = state.stats.light, D = state.stats.dark;
      let html = `<div class="ledger-head"><span>Umbra</span><span>The Ledger of the Damned</span><span>Ember</span></div>`;
      html += `<div class="ledger-row score"><span>${scoreFor("light")}</span><span>Score</span><span>${scoreFor("dark")}</span></div>`;
      for (const [label, key] of rows) html += `<div class="ledger-row"><span>${L[key]}</span><span>${label}</span><span>${D[key]}</span></div>`;
      html += `<div class="ledger-row"><span>—</span><span>Rounds fought: ${state.roundNumber + 1}</span><span>—</span></div>`;
      const rec = state.lastRecord;
      if (rec) html += `<div class="ledger-best">Best score: <b>${rec.bestScore}</b> · Wins: <b>${rec.wins}</b>/${rec.plays}${rec.fastest ? ` · Fastest win: <b>${rec.fastest}</b> rounds` : ""}</div>`;
      if (state.scenario && state.trialResult) html += `<div class="ledger-best">${state.trialResult.won ? "Objective complete" : "Objective failed"} · ${state.scenario.blurb || ""}</div>`;
      if (state.dailyShare) html += `<div class="ledger-best" style="color:var(--gold)">${state.dailyShare}</div>`;
      if (state.runOutcome) { const m = loadStore("sg.mirror", {}); html += `<div class="ledger-best">Chambers cleared: <b>${state.run ? state.run.chamber : 0}</b>/${CHAMBERS.length} · Obols earned: <b>+${state.obolsEarned || 0}</b> (total ${m.obols || 0})</div>`; }
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
    state.furiesEnabled = !!furiesEnabled;
    state.hazardsEnabled = opts.hazards != null ? !!opts.hazards : !!(dom.hazardToggle && dom.hazardToggle.checked);
    if (opts.scenario) state.hazardsEnabled = !!opts.scenario.hazards;
    const o = loadStore("sg.options", {});
    state.reduceMotion = o.reduceMotion || false;
    state.battleSpeed = o.battleSpeed || 1;
    state.colorGlyphs = o.colorGlyphs || false;
    if (mode === "bot") {
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
    if (mode === "bot") applyMirrorUpgrades(state.humanSide);
    // Hecate's Ward — +1 Aegis for any boon holder.
    for (const s of ["light", "dark"]) if (hasBoon(s, "hecate")) state.aegis[s] += 1;
    genTerrain();
    state.lastTs = performance.now();
    dom.eventLog.innerHTML = "";
    logEvent(opts.scenario ? `Trial: ${opts.scenario.name}.` : "The gambit begins. Both houses plan in secret.");
    if (mode === "bot") logEvent(`Your foe: ${SG.AI_PERSONA[state.botPersona].name} · ${state.difficulty.toUpperCase()}.`);
    if (state.furiesEnabled) { spawnFury(state.lastTs); logEvent("Furies stalk this duel — beware the neutral horrors."); }
    dom.startScreen.classList.add("hidden");
    dom.gameOverScreen.classList.add("hidden");
    dom.handoffScreen.classList.add("hidden");
    if (dom.trialsScreen) dom.trialsScreen.classList.add("hidden");
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
    const adt = Math.min((ts - lastAmbientTs) / 1000 || 0, 0.05);
    lastAmbientTs = ts;
    updateAmbientParticles(adt);
    if (state.scene === "battle" || state.scene === "planning") update(ts);
    else state.lastTs = ts;
    render(ts);
    requestAnimationFrame(loop);
  }

  /* ============================================================
   * BOOT
   * ============================================================ */
  state = freshState();
  buildBoardCache();
  seedAmbientParticles();
  buildLegendIcons();
  refreshHallRecord();
  requestAnimationFrame(loop);
  Object.defineProperty(SG, "state", { get: () => state });
})();
