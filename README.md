# Stygian Gambit

A Hades-styled hack-and-slash **chess variant**. Plan in secret, every blow is lethal.
Pure vanilla HTML/CSS/JS on an HTML5 canvas — no build step, no dependencies.

**▶ Play: https://a-wf.github.io/stygian-gambit/**

## How it plays
- Each round has two phases: **Strategy** (secretly command up to 3 pieces — Move or Strike — in a chosen order, spend Aegis wards) and **Battle** (both plans resolve interleaved; initiative alternates).
- Every strike is lethal. Royalty has lives (Sovereign 3, Reaper 2). Win by slaying the enemy Sovereign.
- 8 roles (Sovereign, Reaper, Juggernaut, Trickster, Wildrider, Skirmisher, Harrower, + optional neutral Furies).
- Crystal economy & summoning, capture-moves, Reaping Spiral.

## Modes
- **Local Duel (1v1)** and **Duel the Bot** (difficulty tiers + AI personalities).
- **Trials of the Underworld** (handcrafted scenarios), **Daily Gambit** (seeded, with streak).
- **Chambers of the Descent** — a roguelike run with drafted **Boons** and the persistent **Mirror of Night**.
- Styx Hazards (living terrain), replay & undo, threat overlay, foresight, and accessibility options.

## Run locally
It's a static site — open `index.html`, or serve it:

```bash
python3 -m http.server 8420
```

then visit http://localhost:8420.
