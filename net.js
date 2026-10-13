/* Firebase Realtime Database netcode for Stygian Gambit — Online Duel.
   Peer-symmetric: the DB only relays each side's sealed initiative bid, then committed plan, per round;
   both clients resolve the identical, deterministic battle locally. */
(function () {
  "use strict";
  const SG = (window.SG = window.SG || {});

  const CONFIG = {
    apiKey: "AIzaSyAf0xzLijkpQ0ptXXrD1bO0py8KN-pTWIg",
    authDomain: "stygian-gambit.firebaseapp.com",
    databaseURL: "https://stygian-gambit-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "stygian-gambit",
    storageBucket: "stygian-gambit.firebasestorage.app",
    messagingSenderId: "259635145546",
    appId: "1:259635145546:web:326735afd9e1b796286fb3",
  };

  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let db = null, roomRef = null, code = null, mySide = null;
  let started = false, resolvedUpTo = -1, bidsResolvedUpTo = -1;
  // Bids are only reported once OUR write for that round was accepted by the database: Firebase fires
  // local value events optimistically, so a rejected write could otherwise look like a revealed bid.
  let bidAccepted = {}, lastRounds = {};
  let subs = [];   // every .on() we registered, so leave() really unsubscribes (ref.off() alone skips children)
  // Bumped by every createRoom/joinRoom/leave: an async join step whose attempt is no longer the latest
  // was abandoned (left, or superseded by another room attempt) and must not touch state or start a game.
  let roomAttempt = 0;
  // Start handshake (see watchStart / awaitHostStart): `starting` = the host is confirming the room's
  // config; `startWaiter` = the guest claimed its seat and waits for that confirmation; `oppGone` = the
  // opponent's presence flag was last seen false; `timers` = pending retry/timeout timers of this room.
  let starting = false, startWaiter = null, oppGone = false, timers = [];
  const STALE = { stale: true };                 // rejection marker: the room attempt was abandoned
  // Bounded retries for the start handshake's reads/writes: 1 attempt + one per delay, then fail closed.
  const START_RETRY_DELAYS_MS = [250, 750, 1500];
  const GUEST_START_TIMEOUT_MS = 20000;          // the guest gives up waiting for the host's confirmation

  /* ---- Shared room settings (the host's choices are canonical) ----
     The host writes them once into rooms/<code>/config; BOTH clients (host included) then start from the
     copy read back from the room, normalized here, so they apply identical values. Every field is
     re-validated on read: a malformed, tampered or older (v1 = furies/harrowerDrag only) config falls back
     to the safe defaults below instead of breaking the game. Unknown extra fields are ignored. */
  const ROOM_CONFIG_VERSION = 2;
  const MOVES_OPTIONS = [1, 2, 3, 4, 5];
  const PLAN_SECONDS_OPTIONS = [20, 60, 90];
  const DIFFICULTIES = ["easy", "normal", "hard", "unfair"];
  const PERSONAS = ["random", "balanced", "butcher", "warden", "swarm"];
  const DEFAULTS = { movesPerRound: 3, planSeconds: 60, difficulty: "normal", persona: "balanced" };

  function pick(list, v, fallback) {
    if (typeof v === "number" || typeof v === "string") {
      const n = typeof list[0] === "number" ? Number(v) : v;
      if (list.indexOf(n) !== -1) return n;
    }
    return fallback;
  }
  // A theme id the local build knows (when the registry is loaded); otherwise null = "keep your own".
  function cleanTheme(v) {
    if (typeof v !== "string" || !/^[a-z0-9_-]{1,40}$/i.test(v)) return null;
    const themes = SG.THEMES;
    if (themes && typeof themes === "object") return Object.prototype.hasOwnProperty.call(themes, v) ? v : null;
    return v;
  }
  function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function cleanSeed(v, roomCode) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0 && n <= 0xFFFFFFFF) return n >>> 0;
    return hashString("sg-room:" + String(roomCode || ""));   // legacy rooms: both peers know the code
  }
  function randomSeed() { return Math.floor(Math.random() * 0x100000000) >>> 0; }
  function normalizeConfig(raw, roomCode) {
    const c = raw && typeof raw === "object" ? raw : {};
    const v = Number.isInteger(c.v) && c.v > 0 ? c.v : 1;
    return {
      v: v,
      furies: c.furies === true,
      harrowerDrag: c.harrowerDrag === true,
      hazards: c.hazards === true,
      movesPerRound: pick(MOVES_OPTIONS, c.movesPerRound, DEFAULTS.movesPerRound),
      // Recorded for the record/summary only: online duels stay untimed (no authoritative clock).
      planSeconds: pick(PLAN_SECONDS_OPTIONS, c.planSeconds, DEFAULTS.planSeconds),
      difficulty: pick(DIFFICULTIES, c.difficulty, DEFAULTS.difficulty),
      persona: pick(PERSONAS, c.persona, DEFAULTS.persona),
      theme: cleanTheme(c.theme),
      seed: cleanSeed(c.seed, roomCode),
      firstSide: c.firstSide === "dark" ? "dark" : "light",
      createdAt: Number.isFinite(Number(c.createdAt)) ? Number(c.createdAt) : 0,
    };
  }

  function randomCode() {
    let s = "";
    for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }

  const Net = SG.Net = {
    available: false,
    // callbacks wired by game.js
    onStart: null, onBothBids: null, onBothPlans: null, onOpponentLeft: null, onStatus: null,
    // Host only: onStartFailed(errKey) — the guest joined but the room could not be started consistently
    // (config unreadable / confirmation not written after bounded retries). The room was already left.
    onStartFailed: null,

    init() {
      if (db) return true;
      if (typeof firebase === "undefined" || !firebase.initializeApp) return false;
      try {
        if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(CONFIG);
        db = firebase.database();
        this.available = true;
        return true;
      } catch (e) { console.error("Firebase init failed", e); return false; }
    },

    getCode() { return code; },
    getSide() { return mySide; },
    normalizeConfig: normalizeConfig,
    CONFIG_VERSION: ROOM_CONFIG_VERSION,

    createRoom(opts, cb) {
      if (!this.init()) return cb("net.unavailable");
      roomAttempt++;
      code = randomCode(); mySide = "light";
      roomRef = db.ref("rooms/" + code);
      resetRoomState();
      const ref = roomRef;
      const o = opts || {};
      // The host's settings, validated before they are written (the guest re-validates on read).
      const config = normalizeConfig({
        v: ROOM_CONFIG_VERSION,
        furies: !!o.furies, harrowerDrag: !!o.harrowerDrag, hazards: !!o.hazards,
        movesPerRound: o.movesPerRound, planSeconds: o.planSeconds,
        difficulty: o.difficulty, persona: o.persona, theme: o.theme,
        seed: o.seed != null ? o.seed : randomSeed(),
        firstSide: "light", createdAt: Date.now(),
      }, code);
      if (config.theme == null) delete config.theme;   // keep the written object free of nulls
      roomRef.set({
        config: config,
        host: { present: true },
        status: "waiting",
      }).then(() => {
        if (roomRef !== ref) return;   // left before the room was created
        roomRef.child("host/present").onDisconnect().set(false);
        watchStart(); watchPresence(); watchRounds();
        cb(null, { code: code, mySide: mySide, config: normalizeConfig(config, code) });
      }).catch(e => cb(String(e && e.message || e)));
    },

    // Read-only look at a room before joining it: the guest is shown the host's settings and confirms.
    // Claims nothing and registers no listener. cb(err) or cb(null, { code, config }) — at most once.
    peekRoom(inCode, cb) {
      if (!this.init()) return cb("net.unavailable");
      inCode = (inCode || "").toUpperCase().trim();
      if (inCode.length < 3) return cb("net.badCode");
      let answered = false;
      const finish = (err, res) => { if (answered) return; answered = true; cb(err, res); };
      db.ref("rooms/" + inCode).get().then(snap => {
        if (!snap.exists()) return finish("net.notFound");
        const v = snap.val() || {};
        if (v.status === "playing" || (v.guest && v.guest.present)) return finish("net.full");
        finish(null, { code: inCode, config: normalizeConfig(v.config, inCode) });
      }).catch(e => finish(String(e && e.message || e)));
    },

    joinRoom(inCode, cb) {
      if (!this.init()) return cb("net.unavailable");
      inCode = (inCode || "").toUpperCase().trim();
      if (inCode.length < 3) return cb("net.badCode");
      const attempt = ++roomAttempt;
      const ref = db.ref("rooms/" + inCode);
      const stale = () => attempt !== roomAttempt;
      // cb runs at most once per attempt, even if a later step (or cb itself) throws into the outer catch.
      let answered = false;
      const finish = (err, res) => { if (answered) return; answered = true; cb(err, res); };
      // Drop our half-joined local state, but only while the room slot is still ours (never a newer session).
      const clearLocal = () => { if (roomRef === ref) { roomRef = null; code = null; mySide = null; resetRoomState(); } };
      // The guest seat was claimed but the join was abandoned meanwhile: free the seat again and, if
      // nothing else took over the room slot yet, drop the half-joined local state (no listeners exist).
      const abandon = () => {
        try { ref.child("guest/present").set(false).catch(() => {}); } catch (e) { /* ignore */ }
        clearLocal();
      };
      ref.get().then(snap => {
        if (stale()) return;           // left / another room attempt before the lookup returned
        if (!snap.exists()) return finish("net.notFound");
        const v = snap.val();
        if (v.status === "playing" || (v.guest && v.guest.present)) return finish("net.full");
        code = inCode; mySide = "dark"; roomRef = ref; resetRoomState();
        return ref.update({ guest: { present: true }, status: "playing" }).then(() => {
          if (stale() || roomRef !== ref) { abandon(); return; }
          ref.child("guest/present").onDisconnect().set(false);
          watchPresence(); watchRounds();
          // Not started yet: wait until the host confirms the exact config it starts with (cb runs then).
          awaitHostStart(ref, inCode, v.config, stale, finish);
        }, e => {
          // The write failed, so the seat was never ours: drop our half-joined local state first, so a
          // later leave() finds no roomRef and cannot mark the room's real guest absent.
          clearLocal();
          if (stale()) return;
          finish(String(e && e.message || e));
        });
      }).catch(e => { if (!stale()) finish(String(e && e.message || e)); });
    },

    // Sealed pre-planning initiative bid (whole crystals). Written before any plan of that round;
    // the game shows neither bid until both are in. Untimed: the room has no authoritative clock.
    // done(err) runs once per call: null when the database accepted the write, an error string when it
    // was rejected (or there is no room). Nothing is reported for a room that was left meanwhile.
    submitBid(round, bid, done) {
      const cb = typeof done === "function" ? done : null;
      const ref = roomRef;
      if (!ref) { if (cb) cb("net.noRoom"); return; }
      const r = Number(round);
      ref.child("rounds/" + round + "/bids/" + mySide).set({ bid: cleanBid(bid) })
        .then(() => {
          if (roomRef !== ref) return;
          bidAccepted[r] = true;
          if (cb) cb(null);
          processRounds();          // the opponent's bid may already be waiting for ours to be confirmed
        }, e => {
          console.error("submitBid", e);
          if (roomRef !== ref) return;
          if (cb) cb(String((e && e.message) || e || "net.writeFailed"));
        });
    },

    submitPlan(round, packet) {
      if (!roomRef) return;
      roomRef.child("rounds/" + round + "/plans/" + mySide).set(sanitize(packet))
        .catch(e => console.error("submitPlan", e));
    },

    leave() {
      roomAttempt++;
      try {
        if (roomRef) {
          unsubscribeAll();
          roomRef.off();
          roomRef.child((mySide === "light" ? "host" : "guest") + "/present").set(false);
        }
      } catch (e) { /* ignore */ }
      roomRef = null; code = null; mySide = null; resetRoomState();
    },
  };

  function resetRoomState() {
    unsubscribeAll();
    clearTimers();
    started = false; resolvedUpTo = -1; bidsResolvedUpTo = -1; bidAccepted = {}; lastRounds = {};
    starting = false; startWaiter = null; oppGone = false;
  }
  function subscribe(ref, cb) { ref.on("value", cb); subs.push({ ref, cb }); }
  function unsubscribeAll() {
    for (const s of subs) { try { s.ref.off("value", s.cb); } catch (e) { /* ignore */ } }
    subs = [];
  }

  // Timers belong to the current room and die with it (resetRoomState). Without a timer API (e.g. a bare
  // test sandbox) a retry runs on the next microtask instead; every step re-checks that its room is current.
  function later(fn, ms) {
    if (typeof setTimeout === "function") timers.push(setTimeout(fn, ms));
    else Promise.resolve().then(fn);
  }
  function clearTimers() {
    if (typeof clearTimeout === "function") for (const h of timers) { try { clearTimeout(h); } catch (e) { /* ignore */ } }
    timers = [];
  }
  // Runs step() (may return a promise) until it succeeds — at most 1 + START_RETRY_DELAYS_MS.length
  // times — and resolves with its value; rejects with its last error, or with STALE once !alive().
  function withRetry(step, alive) {
    return new Promise((resolve, reject) => {
      let retries = 0;
      const run = () => {
        if (!alive()) return reject(STALE);
        Promise.resolve().then(step).then(val => {
          if (!alive()) return reject(STALE);
          resolve(val);
        }, e => {
          if (!alive()) return reject(STALE);
          if (retries >= START_RETRY_DELAYS_MS.length) return reject(e);
          later(run, START_RETRY_DELAYS_MS[retries++]);
        });
      };
      run();
    });
  }
  // Stable fingerprint of a normalized config (normalizeConfig always builds the same key order), so the
  // guest can check it starts from exactly the settings the host confirmed.
  function configFingerprint(cfg) { return hashString(JSON.stringify(cfg)); }

  // A bid is a whole, non-negative number of crystals; anything else is no bid. (The game re-validates
  // the amount against its own rules — at least 20, up to what the side holds — on both clients.)
  function cleanBid(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  // Firebase rejects `undefined`; coerce to a clean plain object with nulls.
  function sanitize(packet) {
    return {
      commands: (packet.commands || []).map(c => ({
        pieceId: c.pieceId, kind: c.kind, row: c.row, col: c.col,
        targetId: c.targetId != null ? c.targetId : null,
        reaperMode: c.reaperMode || null,
      })),
      wards: packet.wards || [],
      summons: (packet.summons || []).map(s => ({ type: s.type, row: s.row, col: s.col, warded: !!s.warded })),
      aegis: typeof packet.aegis === "number" ? packet.aegis : null,
      bid: cleanBid(packet.bid),
    };
  }

  /* ---- Start handshake ----
     1. The guest claims its seat (status "playing") but does NOT start yet.
     2. The host reads rooms/<code>/config back (bounded retries), normalizes it, and writes
        rooms/<code>/start = { configHash } (bounded retries). Only once that write is confirmed does the
        host start, from that read-back config — never from its own menu.
     3. The guest starts when the confirmation's hash matches its normalized config snapshot (re-reading
        the room's config, bounded, if it does not), so both peers apply the identical canonical config.
     Any step that still fails fails closed: the failing side leaves the room and reports a localized error
     ("net.startFailed"); the other side sees the departure (guest: join error; host: opponent left). */
  function watchStart() {
    // Host waits for the guest to flip status to "playing".
    const ref = roomRef, attempt = roomAttempt, roomCode = code;
    const alive = () => roomRef === ref && attempt === roomAttempt;
    subscribe(ref.child("status"), s => {
      if (s.val() !== "playing" || started || starting || !alive()) return;
      starting = true;
      let cfg = null;
      withRetry(() => ref.child("config").get().then(c => { cfg = normalizeConfig(c.val(), roomCode); }), alive)
        .then(() => withRetry(() => ref.child("start").set({ configHash: configFingerprint(cfg), at: Date.now() }), alive))
        .then(() => {
          if (!alive() || started) return;
          starting = false; started = true;
          if (Net.onStart) Net.onStart(Object.assign({}, cfg, { mySide: mySide }));
          // The guest gave up while we were confirming: report it now that the match exists.
          if (alive() && oppGone && Net.onOpponentLeft) Net.onOpponentLeft();
        })
        .catch(e => {
          if (e === STALE || !alive()) return;
          console.error("watchStart", e);
          failStart("net.startFailed");
        });
    });
  }
  // Host: fail closed — leave the room (the waiting guest sees the host gone) and surface the error.
  function failStart(key) {
    Net.leave();
    if (Net.onStartFailed) Net.onStartFailed(key);
  }

  // Guest: start only on the host's confirmation, from a config whose fingerprint matches it.
  function awaitHostStart(ref, roomCode, snapshotConfig, stale, finish) {
    const alive = () => !stale() && roomRef === ref;
    const local = normalizeConfig(snapshotConfig, roomCode);
    let settled = false, checking = false, timeout = null;
    const settle = () => {
      settled = true; startWaiter = null;
      if (timeout != null && typeof clearTimeout === "function") clearTimeout(timeout);
    };
    const fail = key => {
      if (settled || !alive()) return;
      settle();
      Net.leave();          // frees the seat; anything still pending for this attempt becomes stale
      finish(key);
    };
    const begin = cfg => {
      if (settled || !alive()) return;
      settle();
      started = true;
      if (Net.onStart) Net.onStart(Object.assign({}, cfg, { mySide: mySide }));
      finish(null, { code: code, mySide: mySide });
    };
    startWaiter = { fail: fail };
    if (typeof setTimeout === "function") {
      timeout = setTimeout(() => fail("net.startFailed"), GUEST_START_TIMEOUT_MS);
      timers.push(timeout);
    }
    subscribe(ref.child("start"), s => {
      if (settled || checking || !alive()) return;
      const m = s.val();
      if (!m || typeof m !== "object" || !Number.isFinite(Number(m.configHash))) return;   // not confirmed yet
      const want = Number(m.configHash) >>> 0;
      if (configFingerprint(local) === want) return begin(local);
      // Our pre-join snapshot differs from what the host confirmed: re-read the room's config (bounded).
      checking = true;
      withRetry(() => ref.child("config").get().then(c => {
        const cfg = normalizeConfig(c.val(), roomCode);
        if (configFingerprint(cfg) !== want) throw new Error("config mismatch");
        return cfg;
      }), alive).then(begin, e => {
        if (e === STALE) return;
        console.error("joinRoom start", e);
        fail("net.startFailed");
      });
    });
  }

  function watchPresence() {
    const opp = mySide === "light" ? "guest" : "host";
    oppGone = false;
    subscribe(roomRef.child(opp + "/present"), s => {
      oppGone = s.exists() && s.val() === false;
      if (!oppGone) return;
      if (started) { if (Net.onOpponentLeft) Net.onOpponentLeft(); }
      else if (startWaiter) startWaiter.fail("net.startFailed");   // guest: the host left before starting
    });
  }

  function watchRounds() {
    subscribe(roomRef.child("rounds"), s => { lastRounds = s.val() || {}; processRounds(); });
  }
  function processRounds() {
    const rounds = lastRounds || {};
    Object.keys(rounds).map(Number).sort((a, b) => a - b).forEach(n => {
      const bd = rounds[n] && rounds[n].bids;
      if (bd && bd.light && bd.dark && n > bidsResolvedUpTo && bidAccepted[n]) {
        bidsResolvedUpTo = n;
        if (Net.onBothBids) Net.onBothBids(n, { light: bd.light.bid, dark: bd.dark.bid });
      }
      const pl = rounds[n] && rounds[n].plans;
      if (pl && pl.light && pl.dark && n > resolvedUpTo) {
        resolvedUpTo = n;
        if (Net.onBothPlans) Net.onBothPlans(n, { light: pl.light, dark: pl.dark });
      }
    });
  }
})();
