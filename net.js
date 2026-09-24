/* Firebase Realtime Database netcode for Stygian Gambit — Online Duel.
   Peer-symmetric: the DB only relays each side's committed plan per round;
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
  let started = false, resolvedUpTo = -1;

  function randomCode() {
    let s = "";
    for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }

  const Net = SG.Net = {
    available: false,
    // callbacks wired by game.js
    onStart: null, onBothPlans: null, onOpponentLeft: null, onStatus: null,

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
      if (!this.init()) return cb("Firebase indisponible (pas de connexion ?).");
      code = randomCode(); mySide = "light";
      roomRef = db.ref("rooms/" + code);
      resolvedUpTo = -1; started = false;
      roomRef.set({
        config: { furies: !!(opts && opts.furies), firstSide: "light", createdAt: Date.now() },
        host: { present: true },
        status: "waiting",
      }).then(() => {
        roomRef.child("host/present").onDisconnect().set(false);
        watchStart(); watchPresence(); watchRounds();
        cb(null, { code: code, mySide: mySide });
      }).catch(e => cb(String(e && e.message || e)));
    },

    joinRoom(inCode, cb) {
      if (!this.init()) return cb("Firebase indisponible (pas de connexion ?).");
      inCode = (inCode || "").toUpperCase().trim();
      if (inCode.length < 3) return cb("Code invalide.");
      const ref = db.ref("rooms/" + inCode);
      ref.get().then(snap => {
        if (!snap.exists()) return cb("Salle introuvable.");
        const v = snap.val();
        if (v.status === "playing" || (v.guest && v.guest.present)) return cb("Salle déjà pleine.");
        code = inCode; mySide = "dark"; roomRef = ref; resolvedUpTo = -1; started = false;
        return ref.update({ guest: { present: true }, status: "playing" }).then(() => {
          roomRef.child("guest/present").onDisconnect().set(false);
          watchPresence(); watchRounds();
          started = true;
          if (Net.onStart) Net.onStart(Object.assign({}, v.config, { mySide: mySide }));
          cb(null, { code: code, mySide: mySide });
        });
      }).catch(e => cb(String(e && e.message || e)));
    },

    submitPlan(round, packet) {
      if (!roomRef) return;
      roomRef.child("rounds/" + round + "/plans/" + mySide).set(sanitize(packet))
        .catch(e => console.error("submitPlan", e));
    },

    leave() {
      try {
        if (roomRef) {
          roomRef.off();
          roomRef.child((mySide === "light" ? "host" : "guest") + "/present").set(false);
        }
      } catch (e) { /* ignore */ }
      roomRef = null; code = null; mySide = null; started = false; resolvedUpTo = -1;
    },
  };

  // Firebase rejects `undefined`; coerce to a clean plain object with nulls.
  function sanitize(packet) {
    return {
      commands: (packet.commands || []).map(c => ({
        pieceId: c.pieceId, kind: c.kind, row: c.row, col: c.col,
        targetId: c.targetId != null ? c.targetId : null,
        reaperMode: c.reaperMode || null,
      })),
      wards: packet.wards || [],
      summons: (packet.summons || []).map(s => ({ type: s.type, row: s.row, col: s.col })),
    };
  }

  function watchStart() {
    // Host waits for the guest to flip status to "playing".
    roomRef.child("status").on("value", s => {
      if (s.val() === "playing" && !started) {
        started = true;
        roomRef.child("config").get().then(c => {
          if (Net.onStart) Net.onStart(Object.assign({}, (c.val() || {}), { mySide: mySide }));
        });
      }
    });
  }

  function watchPresence() {
    const opp = mySide === "light" ? "guest" : "host";
    roomRef.child(opp + "/present").on("value", s => {
      if (started && s.exists() && s.val() === false && Net.onOpponentLeft) Net.onOpponentLeft();
    });
  }

  function watchRounds() {
    roomRef.child("rounds").on("value", s => {
      const rounds = s.val() || {};
      Object.keys(rounds).map(Number).sort((a, b) => a - b).forEach(n => {
        const pl = rounds[n] && rounds[n].plans;
        if (pl && pl.light && pl.dark && n > resolvedUpTo) {
          resolvedUpTo = n;
          if (Net.onBothPlans) Net.onBothPlans(n, { light: pl.light, dark: pl.dark });
        }
      });
    });
  }
})();
