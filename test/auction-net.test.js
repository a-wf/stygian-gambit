"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const netSource = fs.readFileSync(path.join(__dirname, "..", "net.js"), "utf8");

function createRealtimeDb() {
  const data = {};
  const listeners = new Map();
  const failedSets = new Set();
  const failedGets = new Set();
  const pendingSets = new Map();
  const pendingGets = new Map();
  const pendingUpdates = new Map();
  const writes = [];
  const offCalls = [];
  const getCalls = [];
  const updateCalls = [];

  function pathParts(pathname) { return pathname.split("/").filter(Boolean); }
  function readPath(pathname) {
    return pathParts(pathname).reduce((value, part) => value && value[part], data);
  }
  function writePath(pathname, value) {
    const parts = pathParts(pathname);
    let parent = data;
    for (const part of parts.slice(0, -1)) parent = parent[part] || (parent[part] = {});
    parent[parts.at(-1)] = value;
  }
  function snapshot(value) {
    return {
      exists: () => value !== undefined && value !== null,
      val: () => value === undefined ? null : value,
    };
  }
  function emit() {
    for (const [pathname, callbacks] of listeners) {
      const snap = snapshot(readPath(pathname));
      for (const callback of [...callbacks]) callback(snap);
    }
  }
  function ref(pathname) {
    return {
      child(childPath) { return ref([pathname, childPath].filter(Boolean).join("/")); },
      set(value) {
        writes.push({ pathname, value });
        const pending = pendingSets.get(pathname);
        if (pending && pending.length) {
          writePath(pathname, value);
          emit();
          return pending.shift().promise;
        }
        if (failedSets.has(pathname)) return Promise.reject(new Error("permission denied"));
        writePath(pathname, value);
        emit();
        return Promise.resolve();
      },
      update(values) {
        updateCalls.push({ pathname, values });
        const pending = pendingUpdates.get(pathname);
        if (pending && pending.length) {
          const operation = pending.shift();
          operation.commit = () => {
            const current = readPath(pathname) || {};
            writePath(pathname, Object.assign({}, current, values));
            emit();
          };
          return operation.promise;
        }
        const current = readPath(pathname) || {};
        writePath(pathname, Object.assign({}, current, values));
        emit();
        return Promise.resolve();
      },
      get() {
        getCalls.push(pathname);
        if (failedGets.has(pathname)) return Promise.reject(new Error("database unavailable"));
        const pending = pendingGets.get(pathname);
        if (pending && pending.length) return pending.shift().promise;
        return Promise.resolve(snapshot(readPath(pathname)));
      },
      on(event, callback) {
        assert.equal(event, "value");
        if (!listeners.has(pathname)) listeners.set(pathname, new Set());
        listeners.get(pathname).add(callback);
        queueMicrotask(() => {
          if (listeners.get(pathname)?.has(callback)) callback(snapshot(readPath(pathname)));
        });
      },
      off(event, callback) {
        offCalls.push({ pathname, event, callback });
        if (callback) {
          listeners.get(pathname)?.delete(callback);
          if (listeners.get(pathname)?.size === 0) listeners.delete(pathname);
        } else {
          listeners.delete(pathname);
        }
      },
      onDisconnect() {
        return { set() { return Promise.resolve(); } };
      },
    };
  }

  const firebase = {
    apps: [],
    initializeApp() { this.apps.push({}); },
    database() { return { ref }; },
  };
  return {
    data, failedSets, failedGets, writes, offCalls, getCalls, updateCalls, firebase,
    seed: writePath,
    listenerCount(pathname) { return listeners.get(pathname)?.size || 0; },
    holdNextGet(pathname) {
      let resolve, reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      if (!pendingGets.has(pathname)) pendingGets.set(pathname, []);
      pendingGets.get(pathname).push({ promise });
      return {
        resolve() { resolve(snapshot(readPath(pathname))); },
        reject,
      };
    },
    holdNextUpdate(pathname) {
      let resolve, reject;
      const operation = {
        promise: new Promise((res, rej) => { resolve = res; reject = rej; }),
        commit: null,
      };
      if (!pendingUpdates.has(pathname)) pendingUpdates.set(pathname, []);
      pendingUpdates.get(pathname).push(operation);
      return {
        resolve() {
          if (operation.commit) operation.commit();
          resolve();
        },
        reject,
      };
    },
    holdNextSet(pathname) {
      let resolve, reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      if (!pendingSets.has(pathname)) pendingSets.set(pathname, []);
      pendingSets.get(pathname).push({ promise, resolve, reject });
      return { resolve, reject };
    },
  };
}

function loadNet(firebase, errors = [], random = null) {
  const sandbox = {
    window: { SG: {} },
    firebase,
    console: { error(...args) { errors.push(args); } },
  };
  if (random) {
    sandbox.Math = Object.create(Math);
    sandbox.Math.random = random;
  }
  vm.runInNewContext(netSource, sandbox, { filename: "net.js" });
  return { Net: sandbox.window.SG.Net, errors };
}

function waitForAsyncCallbacks() {
  return new Promise(resolve => setImmediate(resolve));
}

function createRoom(net, options = {}) {
  return new Promise(resolve => net.createRoom(options, (error, result) => resolve({ error, result })));
}

function joinRoom(net, code) {
  return new Promise(resolve => net.joinRoom(code, error => resolve(error)));
}

test("online bids are written to each side path and reported only when both are ready", async () => {
  const db = createRealtimeDb();
  const light = loadNet(db.firebase);
  const dark = loadNet(db.firebase);
  const created = await createRoom(light.Net);
  assert.equal(created.error, null);
  const code = created.result.code;
  assert.equal(await joinRoom(dark.Net, code), null);
  await waitForAsyncCallbacks();

  const lightReady = [];
  const darkReady = [];
  light.Net.onBothBids = (round, bids) => lightReady.push({ round, light: bids.light, dark: bids.dark });
  dark.Net.onBothBids = (round, bids) => darkReady.push({ round, light: bids.light, dark: bids.dark });

  light.Net.submitBid(0, 20);
  await waitForAsyncCallbacks();
  assert.equal(db.data.rooms[code].rounds["0"].bids.light.bid, 20);
  assert.equal(db.data.rooms[code].rounds["0"].bids.dark, undefined);
  assert.equal(lightReady.length, 0, "a single sealed bid is not reported as a result");
  assert.equal(darkReady.length, 0);

  dark.Net.submitBid(0, 40);
  await waitForAsyncCallbacks();
  assert.deepEqual(lightReady, [{ round: 0, light: 20, dark: 40 }]);
  assert.deepEqual(darkReady, [{ round: 0, light: 20, dark: 40 }]);

  light.Net.submitBid(0, 60);
  await waitForAsyncCallbacks();
  assert.equal(lightReady.length, 1, "a later update does not resolve the same round twice");
  assert.equal(darkReady.length, 1);
});

test("online plan serialization preserves the sealed bid in addition to the auction write", async () => {
  const db = createRealtimeDb();
  const light = loadNet(db.firebase);
  const created = await createRoom(light.Net);
  const code = created.result.code;

  light.Net.submitPlan(3, { commands: [], wards: [], summons: [], aegis: 2, bid: 40 });
  await waitForAsyncCallbacks();
  assert.equal(db.data.rooms[code].rounds["3"].plans.light.bid, 40,
    "the sanitized Firebase plan packet must retain its bid field");
});

test("a bid is not revealed until its write is accepted, and a rejected write can be retried", async () => {
  const db = createRealtimeDb();
  const light = loadNet(db.firebase);
  const dark = loadNet(db.firebase);
  const created = await createRoom(light.Net);
  const code = created.result.code;
  assert.equal(await joinRoom(dark.Net, code), null);
  await waitForAsyncCallbacks();

  const outcomes = [];
  const timeline = [];
  light.Net.onBothBids = (round, bids) => {
    outcomes.push({ round, light: bids.light, dark: bids.dark });
    timeline.push("revealed");
  };
  dark.Net.submitBid(2, 40);
  await waitForAsyncCallbacks();

  const bidPath = `rooms/${code}/rounds/2/bids/light`;
  const pending = db.holdNextSet(bidPath);
  light.Net.submitBid(2, 20, error => {
    timeline.push(error || "accepted");
  });
  assert.equal(db.data.rooms[code].rounds["2"].bids.light.bid, 20,
    "the Firebase value event can be optimistic while the set promise is pending");
  await waitForAsyncCallbacks();
  assert.deepEqual(outcomes, [], "the local value event alone must not reveal either bid");
  assert.deepEqual(timeline, [], "the completion callback waits for Firebase's write result");

  pending.reject(new Error("permission denied"));
  await waitForAsyncCallbacks();
  assert.deepEqual(timeline, ["permission denied"]);
  assert.deepEqual(outcomes, [], "a rejected optimistic write is not treated as a reveal");

  light.Net.submitBid(2, 20, error => {
    timeline.push(error || "accepted");
  });
  await waitForAsyncCallbacks();
  assert.deepEqual(timeline, ["permission denied", "accepted", "revealed"],
    "the successful write callback precedes bid reveal");
  assert.deepEqual(outcomes, [{ round: 2, light: 20, dark: 40 }]);
  assert.equal(db.writes.filter(write => write.pathname === bidPath).length, 2,
    "retry writes the same sealed bid once more, without duplicate retries");
  assert.equal(db.data.rooms[code].rounds["2"].bids.light.bid, 20);
});

test("online bid write and room read errors are contained and surfaced", async () => {
  const db = createRealtimeDb();
  const lightErrors = [];
  const light = loadNet(db.firebase, lightErrors);
  const dark = loadNet(db.firebase);
  const created = await createRoom(light.Net);
  const code = created.result.code;
  assert.equal(await joinRoom(dark.Net, code), null);
  await waitForAsyncCallbacks();

  const failedBidPath = `rooms/${code}/rounds/1/bids/light`;
  db.failedSets.add(failedBidPath);
  const bidErrors = [];
  assert.doesNotThrow(() => light.Net.submitBid(1, 40, error => bidErrors.push(error)));
  await waitForAsyncCallbacks();
  assert.ok(lightErrors.some(args => args[0] === "submitBid" && args[1].message === "permission denied"));
  assert.deepEqual(bidErrors, ["permission denied"]);
  assert.equal(db.data.rooms[code].rounds?.["1"], undefined, "a rejected write does not create a bid");

  db.failedGets.add("rooms/FAIL");
  const reader = loadNet(db.firebase);
  assert.equal(await joinRoom(reader.Net, "FAIL"), "database unavailable",
    "Firebase read errors reach the existing join error callback");
});

test("leave ignores an in-flight bid result, unsubscribes only its listeners, and rejoin uses fresh listeners", async () => {
  const db = createRealtimeDb();
  const hostA = loadNet(db.firebase, [], () => 0);
  const createdA = await createRoom(hostA.Net);
  const codeA = createdA.result.code;
  const hostB = loadNet(db.firebase, [], () => 0.5);
  const createdB = await createRoom(hostB.Net);
  const codeB = createdB.result.code;
  assert.notEqual(codeA, codeB, "deterministic room codes keep the rejoin target distinct");

  const guest = loadNet(db.firebase);
  assert.equal(await joinRoom(guest.Net, codeA), null);
  await waitForAsyncCallbacks();

  const bidPathA = `rooms/${codeA}/rounds/0/bids/dark`;
  const pending = db.holdNextSet(bidPathA);
  const writeResults = [];
  const revealed = [];
  guest.Net.onBothBids = (round, bids) => revealed.push({ round, bids });
  guest.Net.submitBid(0, 20, error => writeResults.push(error));
  await waitForAsyncCallbacks();
  assert.equal(db.listenerCount(`rooms/${codeA}/rounds`), 2,
    "both host and guest are subscribed before the guest leaves");

  guest.Net.leave();
  assert.equal(db.listenerCount(`rooms/${codeA}/rounds`), 1,
    "leave removes the guest callback without removing the host's same-path listener");
  assert.equal(db.listenerCount(`rooms/${codeA}/host/present`), 0,
    "the guest's presence listener is also removed");
  assert.equal(db.offCalls.filter(call =>
    call.pathname === `rooms/${codeA}/rounds` && call.event === "value" && call.callback).length, 1);

  pending.resolve();
  await waitForAsyncCallbacks();
  assert.deepEqual(writeResults, [], "a late successful write after leave is ignored");
  assert.deepEqual(revealed, [], "the left room cannot reveal a late bid");

  db.seed(`rooms/${codeB}`, {
    config: {},
    host: { present: true },
    status: "waiting",
  });
  assert.equal(await joinRoom(guest.Net, codeB), null);
  await waitForAsyncCallbacks();
  assert.equal(db.listenerCount(`rooms/${codeA}/rounds`), 1,
    "the old room retains only its host listener after rejoin");
  assert.equal(db.listenerCount(`rooms/${codeB}/rounds`), 2,
    "the rejoined client adds one new-room listener alongside its host's listener");

  db.seed(`rooms/${codeB}/rounds/1/bids/light`, { bid: 40 });
  const rejoinResults = [];
  guest.Net.submitBid(1, 20, error => rejoinResults.push(error));
  await waitForAsyncCallbacks();
  assert.deepEqual(rejoinResults, [null]);
  assert.equal(revealed.length, 1, "new-room callbacks work after rejoining");
  assert.deepEqual(JSON.parse(JSON.stringify(revealed[0])), {
    round: 1,
    bids: { light: 40, dark: 20 },
  });

  db.seed(`rooms/${codeA}/rounds/0/bids/dark`, { bid: 60 });
  assert.equal(revealed.length, 1, "the old room cannot deliver events into the new session");
});

test("leave before the room lookup resolves ignores the stale join result", async () => {
  const db = createRealtimeDb();
  const code = "GET";
  const roomPath = `rooms/${code}`;
  db.seed(roomPath, {
    config: { furies: true },
    host: { present: true },
    status: "waiting",
  });
  const pendingGet = db.holdNextGet(roomPath);
  const net = loadNet(db.firebase).Net;
  const starts = [];
  const callbacks = [];
  net.onStart = config => starts.push(config);

  net.joinRoom(code, (error, result) => callbacks.push({ error, result }));
  assert.deepEqual(db.getCalls, [roomPath], "the join is waiting on this room lookup");
  net.leave();
  pendingGet.resolve();
  await waitForAsyncCallbacks();

  assert.deepEqual(starts, [], "a stale lookup cannot start the game");
  assert.deepEqual(callbacks, [], "an abandoned lookup has no join completion callback");
  assert.equal(net.getCode(), null);
  assert.equal(net.getSide(), null);
  assert.deepEqual(db.updateCalls, [], "the stale lookup cannot claim the guest seat");
  assert.deepEqual(db.writes, [], "leaving before room assignment does not mutate room presence");
  assert.equal(db.listenerCount(`${roomPath}/status`), 0);
  assert.equal(db.listenerCount(`${roomPath}/guest/present`), 0);
  assert.equal(db.listenerCount(`${roomPath}/rounds`), 0);
});

test("leave while the guest claim is pending cleans stale presence without starting or throwing", async () => {
  const db = createRealtimeDb();
  const code = "UPD";
  const roomPath = `rooms/${code}`;
  db.seed(roomPath, {
    config: { harrowerDrag: true },
    host: { present: true },
    status: "waiting",
  });
  const pendingUpdate = db.holdNextUpdate(roomPath);
  const net = loadNet(db.firebase).Net;
  const starts = [];
  const callbacks = [];
  net.onStart = config => starts.push(config);

  net.joinRoom(code, (error, result) => callbacks.push({ error, result }));
  await waitForAsyncCallbacks();
  assert.equal(db.updateCalls.length, 1, "the guest update started after the room read");

  net.leave();
  assert.equal(db.data.rooms[code].guest.present, false,
    "leave marks the guest absent before the pending claim completes");
  pendingUpdate.resolve();
  await waitForAsyncCallbacks();

  assert.deepEqual(starts, [], "a late successful claim cannot start the game");
  assert.deepEqual(callbacks, [], "the stale completion cannot leak a TypeError or another join error");
  assert.equal(db.data.rooms[code].guest.present, false,
    "the stale successful claim is cleaned up after it commits");
  assert.deepEqual(db.writes
    .filter(write => write.pathname === `${roomPath}/guest/present`)
    .map(write => write.value), [false, false],
  "leave and stale-claim cleanup both mark the guest absent");
  assert.equal(net.getCode(), null);
  assert.equal(net.getSide(), null);
  assert.equal(db.listenerCount(`${roomPath}/guest/present`), 0);
  assert.equal(db.listenerCount(`${roomPath}/rounds`), 0);
});

test("a failed current guest claim clears local state and later leave cannot clear another guest", async () => {
  const db = createRealtimeDb();
  const code = "FAIL";
  const roomPath = `rooms/${code}`;
  db.seed(roomPath, {
    config: {},
    host: { present: true },
    status: "waiting",
  });
  const pendingUpdate = db.holdNextUpdate(roomPath);
  const net = loadNet(db.firebase).Net;
  const callbacks = [];

  net.joinRoom(code, error => callbacks.push(error));
  await waitForAsyncCallbacks();
  assert.equal(db.updateCalls.length, 1, "the guest seat claim is pending");

  pendingUpdate.reject(new Error("permission denied"));
  await waitForAsyncCallbacks();
  assert.deepEqual(callbacks, ["permission denied"],
    "the current claim reports its error exactly once");
  assert.equal(net.getCode(), null, "a rejected claim clears the local room code");
  assert.equal(net.getSide(), null, "a rejected claim clears the local side");

  db.seed(`${roomPath}/guest/present`, true);
  net.leave();
  await waitForAsyncCallbacks();
  assert.equal(db.data.rooms[code].guest.present, true,
    "leave does not mark a different guest absent");
  assert.deepEqual(db.writes.filter(write =>
    write.pathname === `${roomPath}/guest/present`), [],
  "the failed local claim left no room reference for leave to write through");
  assert.deepEqual(callbacks, ["permission denied"], "leave does not repeat the callback");
});

test("a newer room attempt remains current when an older guest claim completes", async () => {
  const db = createRealtimeDb();
  const oldCode = "OLD";
  const oldRoomPath = `rooms/${oldCode}`;
  db.seed(oldRoomPath, {
    config: { furies: true },
    host: { present: true },
    status: "waiting",
  });
  const pendingUpdate = db.holdNextUpdate(oldRoomPath);
  const net = loadNet(db.firebase, [], () => 0).Net;
  const starts = [];
  const oldJoinCallbacks = [];
  net.onStart = config => starts.push(config);

  net.joinRoom(oldCode, (error, result) => oldJoinCallbacks.push({ error, result }));
  await waitForAsyncCallbacks();
  assert.equal(db.updateCalls.length, 1, "the original guest claim is still pending");

  const newerRoom = await createRoom(net);
  assert.equal(newerRoom.error, null);
  assert.notEqual(newerRoom.result.code, oldCode);
  pendingUpdate.resolve();
  await waitForAsyncCallbacks();

  assert.deepEqual(starts, [], "the old join cannot start the newer room's game");
  assert.deepEqual(oldJoinCallbacks, [], "the superseded join is ignored");
  assert.equal(net.getCode(), newerRoom.result.code);
  assert.equal(net.getSide(), "light");
  assert.equal(db.data.rooms[oldCode].guest.present, false,
    "the old room's stale guest claim is released");
  assert.equal(db.listenerCount(`${oldRoomPath}/guest/present`), 0);
  assert.equal(db.listenerCount(`${oldRoomPath}/rounds`), 0);
  assert.equal(db.listenerCount(`rooms/${newerRoom.result.code}/status`), 1);
  assert.equal(db.listenerCount(`rooms/${newerRoom.result.code}/rounds`), 1);
});

test("a failed stale guest claim does not clear a newer room session", async () => {
  const db = createRealtimeDb();
  const oldCode = "OLD";
  const oldRoomPath = `rooms/${oldCode}`;
  db.seed(oldRoomPath, {
    config: {},
    host: { present: true },
    status: "waiting",
  });
  const pendingUpdate = db.holdNextUpdate(oldRoomPath);
  const net = loadNet(db.firebase, [], () => 0).Net;
  const oldJoinCallbacks = [];

  net.joinRoom(oldCode, error => oldJoinCallbacks.push(error));
  await waitForAsyncCallbacks();
  assert.equal(db.updateCalls.length, 1, "the old guest claim is still pending");

  const newerRoom = await createRoom(net);
  assert.equal(newerRoom.error, null);
  assert.notEqual(newerRoom.result.code, oldCode);
  pendingUpdate.reject(new Error("permission denied"));
  await waitForAsyncCallbacks();

  assert.deepEqual(oldJoinCallbacks, [], "the superseded failed join is ignored");
  assert.equal(net.getCode(), newerRoom.result.code,
    "the stale failure cannot clear the newer room code");
  assert.equal(net.getSide(), "light",
    "the stale failure cannot clear the newer room side");
  assert.equal(db.listenerCount(`rooms/${newerRoom.result.code}/status`), 1);
  assert.equal(db.listenerCount(`rooms/${newerRoom.result.code}/rounds`), 1);
});
