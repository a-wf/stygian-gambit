/* English — the reference dictionary. Every key the game uses must exist here.
   {name} placeholders are filled at runtime; values containing HTML are inserted as HTML. */
(window.SG = window.SG || {}).I18N_DICT = window.SG.I18N_DICT || {};
window.SG.I18N_DICT.en = {
  "doc.title": "Stygian Gambit",
  "lang.label": "Language",

  /* ---- sides, pieces ---- */
  "side.light": "Umbra",
  "side.dark": "Ember",
  "side.neutral": "the Underworld",
  "piece.sovereign": "Sovereign",
  "piece.reaper": "Reaper",
  "piece.juggernaut": "Juggernaut",
  "piece.trickster": "Trickster",
  "piece.wildrider": "Wildrider",
  "piece.skirmisher": "Skirmisher",
  "piece.harrower": "Harrower",
  "piece.fury": "Fury",
  "who": "{side}'s {piece}",

  /* ---- start screen ---- */
  "start.title": "STYGIAN GAMBIT",
  "start.subtitle": "Wizard's chess of the underworld. Plan in secret. Every blow is lethal.",
  "legend.sovereign": "<b>Sovereign</b> — your king. Endures 2 killing blows; the 3rd ends the war. Lose it, lose all.",
  "legend.reaper": "<b>Reaper</b> — the queen. Endures 1 killing blow. Her strike slays the target and all foes beside her.",
  "legend.juggernaut": "<b>Juggernaut</b> — lances any foe down a straight line. One hit, one kill.",
  "legend.trickster": "<b>Trickster</b> — the bishop: glides any distance along a diagonal and strikes down the whole diagonal.",
  "legend.wildrider": "<b>Wildrider</b> — knight's leap over any blocker; slays an adjacent foe.",
  "legend.skirmisher": "<b>Skirmisher</b> — steps forward, kills on the forward diagonals.",
  "legend.harrower": "<b>Harrower</b> — teleports beside any ally; its kill drags down a foe next to the victim too.",
  "legend.fury": "<b>Fury</b> — optional neutral horror. Prowls the board and slays whoever is nearest, either side.",
  "start.rules1": "<b>Each round has two phases.</b> In <b>Strategy</b>, you secretly command up to <b>3 pieces</b> (Move or Strike), in the order you want them to act, and may spend an <b>Aegis</b> to shield a piece from one lethal blow (limited supply). Validate to lock it in. In <b>Battle</b>, both plans play out interleaved — your 1st move, their 1st, your 2nd, their 2nd… and who resolves first alternates every round. A strike whose target has slipped away hits only shadow.",
  "start.rules2": "Every kill you land yields <b>10 Crystals</b>. Spend them in the Strategy phase to <b>summon reinforcements</b> onto any empty tile in your half of the board: <b>20</b> for a Skirmisher, <b>30</b> for a Juggernaut, Wildrider, or Trickster, <b>40</b> for a Harrower.",
  "start.furies": "Unleash <b>Furies</b> — neutral horrors that stalk the board and slay either side",
  "start.hazards": "Awaken <b>Styx Hazards</b> — lava, chasms &amp; soul-fonts that reshape the board",
  "start.movesPerRound": "Moves per round",
  "start.difficulty": "Difficulty",
  "start.warden": "Warden (bot)",
  "difficulty.easy": "Easy",
  "difficulty.normal": "Normal",
  "difficulty.hard": "Hard",
  "difficulty.unfair": "Unfair",
  "persona.random": "Random",
  "persona.balanced": "Balanced",
  "persona.butcher": "The Butcher",
  "persona.warden": "The Warden",
  "persona.swarm": "The Swarm",
  "persona.name.balanced": "The Warden of Balance",
  "persona.name.butcher": "The Butcher",
  "persona.name.warden": "The Warden",
  "persona.name.swarm": "The Swarm",
  "btn.hotseat": "Local Duel (1v1)",
  "btn.vsBot": "Duel the Bot",
  "btn.online": "🌐 Online Duel",
  "btn.descend": "▼ Chambers of the Descent",
  "btn.mirror": "🜃 Mirror of Night",
  "btn.trials": "⚑ Trials of the Underworld",
  "btn.daily": "☀ Daily Gambit",
  "btn.dailyDone": "Daily done ✓",
  "btn.help": "❔ How to Play",
  "btn.options": "⚙ Options",
  "hall.prefix": "⚜ Hall of the Fallen — {parts}",
  "hall.bot": "Bot — best <b>{best}</b> · {wins}/{plays} won",
  "hall.duel": "Duel — <b>{plays}</b> played",
  "hall.trials": "Trials — <b>{n}</b>/{total} cleared",
  "hall.daily": "Daily streak — <b>{n}</b>",

  /* ---- HUD ---- */
  "hud.aegis": "Aegis",
  "hud.crystals": "Crystals",
  "hud.forces": "Forces",
  "plan.label": "{side}: {used}/{max} commands · Aegis {aegis}/{aegisMax} · {crystals}◆",
  "btn.summon": "Summon…",
  "btn.placing": "Placing {piece}…",
  "btn.wardOn": "Ward: On",
  "btn.wardOff": "Ward: Off",
  "btn.threatOn": "Doom Sight: On",
  "btn.threatOff": "Doom Sight: Off",
  "btn.foresightOn": "Foresight: On",
  "btn.foresightOff": "Foresight: Off",
  "btn.undo": "Undo",
  "btn.clear": "Clear",
  "btn.replay": "↻ Replay",
  "btn.revert": "↺ Undo Round",
  "btn.validate": "Validate ▶",
  "title.threat": "Shade tiles enemies can strike",
  "title.foresight": "Forecast your own plan",
  "title.replay": "Re-watch the last clash",
  "title.revert": "Undo the last resolved round",
  "title.revertOnline": "Not available online — both players share one timeline",
  "title.options": "Options",
  "title.bid": "Bid crystals to force move order (highest bidder acts first)",
  "btn.mute": "Mute",
  "btn.unmute": "Unmute",
  "btn.bid": "Initiative: {n}◆",
  "btn.helpGame": "Help",
  "btn.quit": "Main Menu",
  "btn.back": "Back",
  "btn.done": "Done",
  "btn.close": "Close",
  "btn.playAgain": "Play Again",
  "btn.mainMenu": "Main Menu",

  /* ---- turn banner ---- */
  "banner.waiting": "⏳ Plan committed — waiting for your opponent…",
  "banner.placing": "Place your {piece} on a highlighted tile · click elsewhere to cancel",
  "banner.planning": "{chamber}{side} — plan in secret · Round {round} · {first} resolves first",
  "banner.chamber": "{name} ({n}/{total}) · ",
  "banner.battle": "Battle!",
  "banner.replay": "↻ REPLAY · ",
  "banner.handoff": "Pass the device…",

  /* ---- hotseat handoff ---- */
  "handoff.title": "PASS THE DEVICE",
  "handoff.text": "Hand over to {side}. Their plan stays secret.",
  "handoff.ready": "I am {side} — Ready",

  /* ---- choice pop-ups ---- */
  "choice.cancel": "Cancel",
  "choice.keep": "Keep it",
  "bid.title": "Bid for initiative",
  "bid.sub": "Bids must be multiples of 20◆ (minimum 20◆). The higher multiplier (X) moves first and pays in full; the other pays 70% of their pledge.<br>Available: <b>{have}◆</b> · Current bid: <b>{current}◆</b>.",
  "bid.zero": "No bid",
  "bid.zeroDesc": "Keep the usual initiative rules.",
  "bid.amount": "Bid {n}◆ ({x}×)",
  "bid.amountDesc": "Pledge {n} crystals (20 × {x}) for initiative.",
  "bid.allIn": "All in · {n}◆",
  "bid.custom": "Custom amount",
  "bid.customDesc": "Enter a multiple of 20◆ (20 × X) up to {max}◆.",
  "bid.prompt": "Enter multiplier X (e.g. 1 for 20◆, 2 for 40◆) or a multiple of 20 up to {max}◆:",
  "summon.title": "Summon a reinforcement",
  "summon.sub": "You have <b>{have}◆</b>. Pick one, then click an empty highlighted tile in your half. Until you validate, click a fresh summon to cancel it and get the crystals back.",
  "summon.subNoRoom": "You have <b>{have}◆</b>. <b>No empty tile left in your half.</b> Until you validate, click a fresh summon to cancel it and get the crystals back.",
  "summon.desc.skirmisher": "Steps forward, kills on the forward diagonals.",
  "summon.desc.juggernaut": "Lances any foe down a straight line.",
  "summon.desc.wildrider": "Knight's leap over blockers; slays an adjacent foe.",
  "summon.desc.trickster": "Glides any distance along the diagonals and strikes down them.",
  "summon.desc.harrower": "Teleports beside an ally; its kill drags down a second foe.",
  "reaper.title": "The Reaper's strike",
  "reaper.sub": "Target: <b>{target}</b>. Allies are never hit.",
  "reaper.spiral": "Reaping Spiral",
  "reaper.spiralDesc": "Hold her ground and slay every foe adjacent to her when she acts — {n} in reach right now.",
  "reaper.spiralDesc2": "Hold her ground and slay every foe within 2 tiles when she acts — {n} in reach right now.",
  "reaper.advance": "Slay & Advance",
  "reaper.advanceDesc": "Kill the {piece} and step onto its square.",
  "fresh.title": "Fresh {piece}",
  "fresh.cancel": "Cancel this summon",
  "fresh.cancelDesc": "Remove the {piece} and refund {cost}◆.",
  "fresh.cancelDescAegis": "Remove the {piece} and refund {cost}◆ plus its Aegis.",
  "fresh.order": "Give it an order",
  "fresh.orderDesc": "Select it to move or strike this round.",
  "fresh.sub": "Summoned this turn — nothing is final until you validate.",
  "fresh.subOnline": "Summoned this turn. Online, a new piece can only act from next round.",

  /* ---- planning notes ---- */
  "note.maxCmd": "Only {n} pieces may act each round.",
  "note.unward": "{who}'s Aegis is withdrawn.",
  "note.ward": "{who} is shielded — it will survive one lethal blow.",
  "note.noAegis": "No Aegis charges remain.",
  "note.noRoyalWard": "The Sovereign and Reaper cannot be shielded by Aegis.",
  "note.summonUndone": "Summon undone — {refund}",
  "note.summonCancelled": "Summon cancelled — {refund}",
  "note.refund": "{cost}◆ refunded.",
  "note.refundDropped1": "{cost}◆ refunded · 1 order that needed it removed.",
  "note.refundDroppedN": "{cost}◆ refunded · {n} orders that needed it removed.",
  "note.noEarlierRound": "The abyss remembers no earlier round.",
  "note.summonWait": "A summoned piece must wait a round before it can act.",

  /* ---- battle captions ---- */
  "cap.battleJoined": "Battle joined — {side} strikes first.",
  "cap.orderDies": "{side}'s order dies with its bearer.",
  "cap.advances": "{who} advances.",
  "cap.blocked": "{who}'s path is blocked.",
  "cap.spiral": "{who} unleashes a Reaping Spiral!",
  "cap.spiralMiss": "{who} sweeps her scythe through empty air.",
  "cap.whiff": "{who} strikes only shadow.",
  "cap.kill": "{who} strikes a killing blow!",
  "cap.furyStrike": "A Fury tears into {who}!",
  "cap.furyMove": "A Fury prowls closer…",
  "cap.furyStuck": "A Fury snarls, hemmed in.",

  /* ---- event log ---- */
  "log.start": "The gambit begins. Both houses plan in secret.",
  "log.trial": "Trial: {name}.",
  "log.foe": "Your foe: {persona} · {difficulty}.",
  "log.bidWon": "{side} wins initiative with a bid of {bid}◆.",
  "log.bidLoser": "{side} forfeits {paid}◆ (70% of pledge).",
  "log.bidTie": "Initiative bid tied at {bid}◆ — {side} acts first (both pay {paid}◆).",
  "log.furies": "Furies stalk this duel — beware the neutral horrors.",
  "log.furiesOnline": "Furies stalk this duel.",
  "log.online": "Online duel — you command {side}.",
  "log.interest": "{side} hoards +{gain}◆ of interest from the Styx.",
  "log.aegisBlock": "{who}'s Aegis shatters the blow!",
  "log.aegisAbyss": "{who}'s Aegis holds back the abyss!",
  "log.reels1": "{who} reels — 1 life remains.",
  "log.reelsN": "{who} reels — {n} lives remain.",
  "log.slain": "{who} is slain.",
  "log.slainBy": "{who} is slain by {side}.",
  "log.hazardShift": "The underworld shifts — the hazards move.",
  "log.chamber": "Chamber {n}/{total}: {name}.",
  "log.chamberBoss": "Chamber {n}/{total}: {name} — BOSS SHADE.",
  "log.summon": "{side} summons a {piece} from the abyss.",
  "log.furyRise": "A Fury claws its way up from the deep to hunt the living.",
  "log.replay": "↻ Replaying the last clash…",
  "log.revert": "↺ Time unravels — the last round is undone.",

  /* ---- floating combat text (drawn on the board) ---- */
  "fx.slain": "SLAIN",
  "fx.crystals": "+{n}◆",
  "fx.souls": "{n} SOULS · +{bonus}◆",
  "fx.aegis": "AEGIS ✦",
  "fx.lifeLost": "-1 LIFE",
  "fx.lifeGained": "+1 LIFE",
  "fx.shadow": "SHADOW",
  "fx.dodged": "DODGED",
  "fx.shoved": "SHOVED",
  "fx.shovedLava": "SHOVED → LAVA",
  "fx.engulfed": "ENGULFED",
  "fx.risen": "RISEN",

  /* ---- online duel ---- */
  "online.title": "ONLINE DUEL",
  "online.subtitle": "Play the same match live across two computers.",
  "online.furies": "Unleash <b>Furies</b>",
  "online.create": "Create a room",
  "online.createNote": "You'll get a code to share. You play <b>Umbra</b> (host).",
  "online.or": "— or —",
  "online.codePlaceholder": "CODE",
  "online.join": "Join a room",
  "online.joinNote": "Enter a friend's code. You play <b>Ember</b>.",
  "online.creating": "Creating room…",
  "online.joining": "Joining…",
  "online.codeLabel": "Your room code:",
  "online.codeWait": "Share it, then wait for your opponent to join…",
  "online.left": "<b>Opponent disconnected.</b> The duel cannot continue.",
  "net.unavailable": "Firebase is unavailable (no connection?).",
  "net.badCode": "Invalid code.",
  "net.notFound": "Room not found.",
  "net.full": "This room is already full.",

  /* ---- Boons, chambers, Mirror ---- */
  "boon.titleRun": "CHAMBER CLEARED — CHOOSE A BOON ({n}/{total})",
  "boon.subtitle": "The gods extend their bargains. Choose one to carry deeper.",
  "boon.charon.name": "Charon's Toll",
  "boon.charon.desc": "+5 crystals per kill.",
  "boon.hermes.name": "Hermes' Haste",
  "boon.hermes.desc": "You always resolve first each round.",
  "boon.hecate.name": "Hecate's Ward",
  "boon.hecate.desc": "+1 Aegis charge each chamber.",
  "boon.ares.name": "Ares' Wrath",
  "boon.ares.desc": "Your Reaping Spiral reaches 2 tiles.",
  "boon.nyx.name": "Nyx's Veil",
  "boon.nyx.desc": "Command a 4th piece each round.",
  "chamber.0": "Tartarus",
  "chamber.1": "Asphodel",
  "chamber.2": "Elysium",
  "chamber.3": "The Styx",
  "mirror.title": "MIRROR OF NIGHT",
  "mirror.sub1": "Spend Obols —",
  "mirror.sub2": "— on permanent power that carries between runs.",
  "mirror.aegis.name": "Aegis of Night",
  "mirror.aegis.desc": "+1 starting Aegis charge",
  "mirror.crystal.name": "Coffer of Souls",
  "mirror.crystal.desc": "+5 starting crystals",
  "mirror.level": "{name} · Lv {lv}/{max}",
  "mirror.cost": "{desc} — {cost} obols",
  "mirror.maxed": "{desc} — MAXED",

  /* ---- options ---- */
  "options.title": "RITES OF ACCESS",
  "options.subtitle": "Tune the tempo and readability of the underworld.",
  "options.speed": "Battle speed",
  "options.mute": "Mute sound",
  "options.reduceMotion": "Reduce motion (no screenshake, flash or zoom)",
  "options.glyphs": "Colorblind side glyphs (▲ Umbra / ▽ Ember)",

  /* ---- trials & daily ---- */
  "trials.title": "TRIALS OF THE UNDERWORLD",
  "trials.subtitle": "Handcrafted ordeals on the same engine. Clear them to fill the Hall.",
  "scenario.first-blood.name": "First Blood",
  "scenario.first-blood.blurb": "A small clash to learn the plan→battle rhythm. Slay the enemy Sovereign.",
  "scenario.cornered-king.name": "The Cornered King",
  "scenario.cornered-king.blurb": "Their Sovereign is trapped in the corner. Break the guard and end it.",
  "scenario.aegisless.name": "Aegisless",
  "scenario.aegisless.blurb": "No wards for anyone. Every blow is final — pure tactics.",
  "scenario.furybound.name": "Furybound",
  "scenario.furybound.blurb": "Survive 6 rounds as Furies stalk the board. Keep your Sovereign alive.",
  "scenario.outnumbered.name": "Outnumbered",
  "scenario.outnumbered.blurb": "A skeleton crew against a full house. Strike fast and true.",
  "scenario.regicide-rush.name": "Regicide Rush",
  "scenario.regicide-rush.blurb": "Their king marches with a single life. Punch through and behead the line.",
  "daily.name": "Daily · {name}",
  "daily.share": "⚔ Stygian Gambit — Daily {date} · {result} · streak {streak}",
  "daily.cleared1": "cleared in 1 round",
  "daily.clearedN": "cleared in {n} rounds",
  "daily.fell": "fell",

  /* ---- game over & ledger ---- */
  "over.triumph": "{side} TRIUMPHANT",
  "over.ruin": "MUTUAL RUIN",
  "over.trialWon": "TRIAL CLEARED",
  "over.trialLost": "TRIAL FAILED",
  "over.descentWon": "THE DESCENT CONQUERED",
  "over.descentLost": "FALLEN IN THE DESCENT",
  "ledger.title": "The Ledger of the Damned",
  "ledger.score": "Score",
  "ledger.kills": "Kills",
  "ledger.losses": "Losses",
  "ledger.spirals": "Reaping Spirals",
  "ledger.aegisBlocks": "Aegis blocks",
  "ledger.summons": "Reinforcements",
  "ledger.bestCombo": "Best combo",
  "ledger.rounds": "Rounds fought: {n}",
  "ledger.best": "Best score: <b>{best}</b> · Wins: <b>{wins}</b>/{plays}",
  "ledger.fastest": " · Fastest win: <b>{n}</b> rounds",
  "ledger.objDone": "Objective complete",
  "ledger.objFail": "Objective failed",
  "ledger.descent": "Chambers cleared: <b>{n}</b>/{total} · Obols earned: <b>+{obols}</b> (total {bank})",

  /* ---- help ---- */
  "help.title": "HOW TO PLAY",
  "help.subtitle": "Chess of the underworld: plan in secret, every blow is lethal.",
  "help.body": `<h2>Goal</h2>
<p>Slay the enemy <b>Sovereign</b> (king). It endures <b>2</b> killing blows; the <b>3rd</b> finishes it. Lose your Sovereign and you lose the war.</p>

<h2>A round in two phases</h2>
<p><b>1. Strategy (secret).</b> Command up to <b>3 pieces</b> — <b>Move</b> (blue tile) or <b>Strike</b> (red tile) — in the <b>order</b> you choose (1-2-3 badges appear). You may spend an <b>Aegis</b> to shield a piece. Click <b>Validate</b> to lock it in.</p>
<p><b>2. Battle.</b> Both plans play out <b>in turn</b>: your 1st action, theirs, your 2nd, theirs… The side that resolves first <b>alternates every round</b>. A strike whose target has moved hits only shadow (<b>SHADOW</b>).</p>

<h2>Combat</h2>
<p>Every strike is <b>lethal</b> (one hit, one kill). Exceptions: <b>royalty</b> has lives (Sovereign 3, Reaper 2), and a piece shielded by an <b>Aegis</b> survives (the shield absorbs one lethal blow, then breaks). On a killing blow the attacker <b>takes the victim's square</b> (a capture) — except the Reaper (see Reaping Spiral). Your <b>allies are never hit</b>.</p>

<h2>The roles</h2>
<ul class="help-roles">
  <li><b>Sovereign</b> (king) — moves one tile; endures 2 killing blows.</li>
  <li><b>Reaper</b> (queen) — glides in every direction. Her <b>Reaping Spiral</b> slays the target <i>and every adjacent foe</i>. When she strikes, a pop-up lets you choose: <b>hold</b> and sweep all around, or <b>slay and advance</b> onto the square.</li>
  <li><b>Juggernaut</b> (rook) — strikes down a straight line.</li>
  <li><b>Trickster</b> (bishop) — moves any distance along a diagonal and strikes down the whole diagonal (up to the first obstacle).</li>
  <li><b>Wildrider</b> (knight) — L-shaped leap over obstacles.</li>
  <li><b>Skirmisher</b> (pawn) — steps forward one tile, strikes on the forward diagonals.</li>
  <li><b>Harrower</b> — teleports beside any ally; its kill drags down a foe next to the victim.</li>
  <li><b>Fury</b> (optional) — a neutral horror that hunts and slays the nearest piece of either side.</li>
</ul>

<h2>Aegis (protection)</h2>
<p><b>3 base charges</b> per match. You can have <b>more</b> from a bonus — <b>Easy</b> difficulty (+1), the <b>Mirror of Night</b> upgrade (+1/+2) or <b>Hecate's</b> Boon (+1); bonus charges are highlighted and the counter shows <b>remaining/total</b>.</p>
<p>In the Strategy phase, turn <b>Ward</b> on and click one of your pieces: it gets a golden shield that stays active <b>until it is used</b> (even across several rounds). It absorbs <b>a single</b> lethal event — a strike, or lava — and then breaks. If two foes strike the same piece in the same round, the second blow kills it. Click the piece again to remove the shield and get the charge back. Clicking elsewhere leaves Ward mode.</p>

<h2>Crystals &amp; summoning</h2>
<p><b>10 crystals</b> per foe slain. Chaining several kills in one battle earns a <b>SOULS bonus</b>. Click <b>Summon…</b>: a pop-up offers the reinforcements (<b>20</b> Skirmisher · <b>30</b> Juggernaut/Wildrider/Trickster · <b>40</b> Harrower). Pick one, then click an empty highlighted tile in your half. Until you validate, <b>click a piece you just summoned</b> to cancel it (crystals refunded). <b>Undo</b> takes back your last action (order, summon or shield); <b>Clear</b> takes back the whole turn.</p>

<h2>Replay &amp; Undo</h2>
<p><b>↻ Replay</b> — replays the last battle (the board returns to just before the clash, the action plays again, then you are back to planning). <b>↺ Undo Round</b> — cancels the last resolved round and sends you back to its planning (the "sore loser" mode).</p>

<h2>Planning aids</h2>
<p><b>Doom Sight</b> — shades in red every tile an enemy piece can strike from where it stands now (it never reveals the hidden plan). <b>Foresight</b> — simulates <i>only your plan</i> on a frozen board and shows the result as ghosts (who hits, who dies ✖, who strikes shadow) so you can refine it before validating. The enemy also acts, so treat it as the best case, not a guarantee.</p>

<h2>Crystals: interest &amp; combos</h2>
<p>At the start of each Strategy phase you earn <b>interest</b>: +1 crystal per 20 banked (at most +5) — save or spend. Chaining kills in one battle triggers <b>SOULS</b> tiers that pay bonus crystals.</p>

<h2>Difficulty &amp; Wardens (vs bot)</h2>
<p>Choose the difficulty (<b>Easy → Unfair</b>) and an opposing <b>Warden</b> with its own temperament: <b>The Butcher</b> (hungry for kills), <b>The Warden</b> (defensive, hoards Aegis), <b>The Swarm</b> (summons nonstop), or random.</p>

<h2>Styx Hazards (optional)</h2>
<p>Turn them on in the menu to awaken the living terrain: <b>Lava</b> (a piece that stops on it or is pushed into it dies), <b>Chasm</b> (blocks movement and lines of strike), <b>Soul-font</b> (+5 crystals, or +1 life for royalty). The hazards shift every 3 rounds. <b>Gambit Shove</b>: the Juggernaut and the Wildrider push a royal that survives their blow back one tile — ideal for throwing it into lava.</p>

<h2>Solo modes</h2>
<p><b>⚑ Trials</b> — handcrafted scenarios with varied objectives (regicide, survival). <b>☀ Daily Gambit</b> — a date-seeded challenge, the same for everyone, one attempt per day, with a streak and a text to share. <b>▼ Chambers of the Descent</b> — a roguelike run of 4 ever-harder chambers; between chambers you <b>draft a divine Boon</b> (Charon, Hermes, Hecate, Ares, Nyx) and keep your crystals and boons. <b>🜃 Mirror of Night</b> — spend the <b>Obols</b> earned in runs on permanent upgrades.</p>

<h2>Online Duel</h2>
<p>One player clicks <b>Create a room</b> and shares the <b>code</b>; the other enters it in <b>Join a room</b>. Each player sees <b>their own army at the bottom</b>. You plan at the same time, in secret; once both have validated, the battle plays out identically on both screens. Online there is no <b>Undo Round</b> (both players share one timeline), no Styx Hazards, and a summoned piece can only act from the next round.</p>

<h2>Options (Rites of Access)</h2>
<p>Set the <b>battle speed</b> (0.5×–2×), turn on <b>Reduce motion</b> (no shake, flash or zoom) or the <b>colorblind glyphs</b> (▲ Umbra / ▽ Ember), and pick your <b>language</b>. Settings are kept between games.</p>

<h2>Tips</h2>
<ul class="help-roles">
  <li>The <b>order</b> of your commands matters: put a kill before a move to clear a line.</li>
  <li>Since initiative alternates, expect the enemy to strike before you in some rounds.</li>
  <li>Keep an Aegis for your Sovereign when it is threatened.</li>
  <li>When the game refuses an order, the banner tells you why (for example, only 3 pieces may act per round).</li>
</ul>`,
};
