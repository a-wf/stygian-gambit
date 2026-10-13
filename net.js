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

  function randomCode() {
    let s = "";
    for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }

  const Net = SG.Net = {
    available: false,
    // callbacks wired by game.js
    onStart: null, onBothBids: null, onBothPlans: null, onOpponentLeft: null, onStatus: null,

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

    createRoom(opts, cb) {
      if (!this.init()) return cb("net.unavailable");
      roomAttempt++;
      code = randomCode(); mySide = "light";
      roomRef = db.ref("rooms/" + code);
      resetRoomState();
      const ref = roomRef;
      roomRef.set({
        config: { furies: !!(opts && opts.furies), harrowerDrag: !!(opts && opts.harrowerDrag), firstSide: "light", createdAt: Date.now() },
        host: { present: true },
        status: "waiting",
      }).then(() => {
        if (roomRef !== ref) return;   // left before the room was created
        roomRef.child("host/present").onDisconnect().set(false);
        watchStart(); watchPresence(); watchRounds();
        cb(null, { code: code, mySide: mySide });
      }).catch(e => cb(String(e && e.message || e)));
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
          started = true;
          if (Net.onStart) Net.onStart(Object.assign({}, v.config, { mySide: mySide }));
          finish(null, { code: code, mySide: mySide });
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
    started = false; resolvedUpTo = -1; bidsResolvedUpTo = -1; bidAccepted = {}; lastRounds = {};
  }
  function subscribe(ref, cb) { ref.on("value", cb); subs.push({ ref, cb }); }
  function unsubscribeAll() {
    for (const s of subs) { try { s.ref.off("value", s.cb); } catch (e) { /* ignore */ } }
    subs = [];
  }

  // A bid is a whole, non-negative number of crystals; anything else is no bid. (The game re-validates
  // the amount against its own rules — multiples of 20, up to what the side holds — on both clients.)
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

  function watchStart() {
    // Host waits for the guest to flip status to "playing".
    const ref = roomRef;
    subscribe(ref.child("status"), s => {
      if (s.val() === "playing" && !started) {
        started = true;
        ref.child("config").get().then(c => {
          if (roomRef !== ref) return;
          if (Net.onStart) Net.onStart(Object.assign({}, (c.val() || {}), { mySide: mySide }));
        }).catch(e => console.error("watchStart", e));
      }
    });
  }

  function watchPresence() {
    const opp = mySide === "light" ? "guest" : "host";
    subscribe(roomRef.child(opp + "/present"), s => {
      if (started && s.exists() && s.val() === false && Net.onOpponentLeft) Net.onOpponentLeft();
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
