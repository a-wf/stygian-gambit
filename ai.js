(function () {
  "use strict";
  const SG = (window.SG = window.SG || {});

  const VALUE = { sovereign: 1000, reaper: 600, juggernaut: 240, trickster: 230, wildrider: 250, harrower: 210, skirmisher: 90 };

  // Named wardens reweight the scorer — each plays with a distinct temperament.
  const PERSONA = {
    balanced: { kill: 600, chip: 120, spiral: 160, wardAggr: 1,   defend: false, name: "The Warden of Balance" },
    butcher:  { kill: 820, chip: 170, spiral: 280, wardAggr: 0.5, defend: false, name: "The Butcher" },
    warden:   { kill: 480, chip: 100, spiral: 120, wardAggr: 2,   defend: true,  name: "The Warden" },
    swarm:    { kill: 600, chip: 120, spiral: 150, wardAggr: 0.8, defend: false, name: "The Swarm" },
  };
  SG.AI_PERSONA = PERSONA;

  function personaFor(name) { return PERSONA[name] || PERSONA.balanced; }

  function nearestOf(piece, list) {
    let best = null, bd = Infinity;
    for (const o of list) { const d = SG.chebyshev(piece, o); if (d < bd) { bd = d; best = o; } }
    return best;
  }

  SG.AI = {
    // Plans one round for `side` using only the visible board (never the opponent's hidden plan).
    // Difficulty sets how many pieces act + how sharply; persona reweights priorities.
    // Returns { commands: [...], wards: [pieceId...] }.
    planTurn(side) {
      const S = SG.state;
      const diff = S.difficulty || "normal";
      const P = personaFor(S.botPersona);
      let maxCmd = diff === "easy" ? 1 : diff === "normal" ? 2 : 3;
      if (S.boons && S.boons[side] && S.boons[side].nyx) maxCmd += 1;
      const sloppy = diff === "easy" ? 0.45 : 0;   // chance to pick a random legal move over the best one
      const sharpWard = diff === "hard" || diff === "unfair";

      const grid = SG.buildOccupancyGrid(S.pieces);
      const allies = S.pieces.filter(p => p.alive && p.side === side);
      const enemies = S.pieces.filter(p => p.alive && p.side !== side);
      if (!allies.length || !enemies.length) return { commands: [], wards: [] };

      const candidates = [];

      // Strikes — prefer lethal kills of high-value, unwarded targets.
      for (const p of allies) {
        const atk = SG.getAttackTiles(p, grid);
        for (const t of atk) {
          const e = grid[t.row][t.col];
          if (!e) continue;
          const lethal = !e.warded && e.lives <= 1;
          let score = VALUE[e.type] || 100;
          score += lethal ? P.kill : P.chip;
          if (e.warded) score -= 260;
          if (e.type === "sovereign") score += (diff === "unfair" ? 500 : 200); // finish the war
          const cand = { kind: "strike", pieceId: p.id, targetId: e.id, row: t.row, col: t.col, score };
          if (p.type === "reaper") {
            const adj = enemies.filter(en => SG.chebyshev(p, en) <= 1).length;
            cand.reaperMode = adj >= 2 ? "spiral" : "advance";
            if (adj >= 2) cand.score += P.spiral;
          }
          candidates.push(cand);
        }
      }

      // Advances — close on the enemy Sovereign (or nearest foe). The Warden persona
      // instead pulls a threatened royal toward safety.
      const enemyKing = enemies.find(e => e.type === "sovereign");
      for (const p of allies) {
        let mv = SG.getMoveTiles(p, grid);
        if (SG.terrainAt) mv = mv.filter(t => SG.terrainAt(t.row, t.col) !== "lava"); // never walk into lava
        if (!mv.length) continue;

        if (P.defend && (p.type === "sovereign" || p.type === "reaper") && !p.warded) {
          const threatened = enemies.some(e => SG.getAttackTiles(e, grid).some(t => t.row === p.row && t.col === p.col));
          if (threatened) {
            let safe = null, bestSafe = -Infinity;
            for (const t of mv) {
              const danger = enemies.some(e => SG.getAttackTiles(e, grid).some(a => a.row === t.row && a.col === t.col));
              const sc = (danger ? -100 : 100) + (Math.random() * 4);
              if (sc > bestSafe) { bestSafe = sc; safe = t; }
            }
            if (safe) { candidates.push({ kind: "move", pieceId: p.id, row: safe.row, col: safe.col, score: 400 }); continue; }
          }
        }

        const aim = enemyKing || nearestOf(p, enemies);
        if (!aim) continue;
        let best = null, bd = Infinity;
        for (const t of mv) { const d = Math.max(Math.abs(t.row - aim.row), Math.abs(t.col - aim.col)); if (d < bd) { bd = d; best = t; } }
        if (best) {
          const cur = Math.max(Math.abs(p.row - aim.row), Math.abs(p.col - aim.col));
          let score = 12 + (cur - bd) * 5;
          if (sloppy && Math.random() < sloppy) { const rt = mv[Math.floor(Math.random() * mv.length)]; candidates.push({ kind: "move", pieceId: p.id, row: rt.row, col: rt.col, score: 8 }); }
          else candidates.push({ kind: "move", pieceId: p.id, row: best.row, col: best.col, score });
        }
      }

      candidates.sort((a, b) => b.score - a.score);
      const used = new Set(), commands = [];
      for (const c of candidates) {
        if (commands.length >= maxCmd) break;
        if (used.has(c.pieceId)) continue;
        used.add(c.pieceId);
        commands.push(c.kind === "strike"
          ? { pieceId: c.pieceId, kind: "strike", targetId: c.targetId, row: c.row, col: c.col, reaperMode: c.reaperMode }
          : { pieceId: c.pieceId, kind: "move", row: c.row, col: c.col });
      }

      // Wards — shield the Sovereign, then the Reaper, then (warden persona) any threatened piece.
      const wards = [];
      let charges = S.aegis[side];
      if (diff === "easy") charges = 0; // an easy warden never wards
      const priority = allies
        .filter(p => !p.warded)
        .sort((a, b) => (VALUE[b.type] || 0) - (VALUE[a.type] || 0));
      for (const roy of priority) {
        if (charges <= 0) break;
        const isRoyal = roy.type === "sovereign" || roy.type === "reaper";
        if (!isRoyal && !P.defend) continue;                 // only the Warden wards commoners
        if (!isRoyal && Math.random() > 0.5 * P.wardAggr) continue;
        const threatened = enemies.some(e => SG.getAttackTiles(e, grid).some(t => t.row === roy.row && t.col === roy.col));
        if (threatened && (isRoyal || sharpWard || P.defend)) { wards.push(roy.id); charges--; }
      }

      return { commands, wards };
    },
  };
})();
