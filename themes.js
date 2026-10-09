/* Stygian Gambit — modular piece-theme engine.
 *
 * A theme is { id, name: {en, fr, zh, ar}, description: {…}, painters: { <pieceType>: fn } }.
 * name/description may instead be i18n keys (e.g. "theme.<id>.name"); game.js resolves the
 * "theme.<id>.name" / "theme.<id>.desc" dictionary entries first in either case.
 * Each painter is called as painter(c, pal, r, ts, helpers) with the canvas already translated
 * to the tile centre (and wrapped in save/restore by game.js). Figures should stay roughly within
 * -1.3r … 1.3r so they fit both board tiles and the 52px legend canvases.
 *   c    — CanvasRenderingContext2D
 *   pal  — side palette { deep, mid, bright, rim, gold }
 *   r    — figure radius in px
 *   ts   — animation timestamp in ms (0 for static icons)
 * Missing painters fall back to the classic theme, then to classic.default.
 */
(function () {
  "use strict";
  const SG = (window.SG = window.SG || {});
  SG.THEMES = SG.THEMES || {};

  const INK = "#0b0710";

  // Painters call rgba() many times per figure per frame, mostly with a handful of palette colours and
  // animated alphas, so the hex → "r,g,b" parse is memoised (pure function, bounded map; output identical).
  const RGB_MEMO_MAX = 512;
  const rgbMemo = new Map();
  function rgbTriplet(hex) {
    const memoKey = typeof hex === "string" ? hex : null;
    if (memoKey !== null) {
      const hit = rgbMemo.get(memoKey);
      if (hit !== undefined) return hit;
    }
    let h = String(hex || "#ffffff").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h.slice(0, 6), 16);
    const rgb = isNaN(n) ? "255,255,255" : `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
    if (memoKey !== null) {
      if (rgbMemo.size >= RGB_MEMO_MAX) rgbMemo.clear();
      rgbMemo.set(memoKey, rgb);
    }
    return rgb;
  }
  function rgba(hex, a) {
    return `rgba(${rgbTriplet(hex)},${a})`;
  }

  /* ============================================================
   * SHARED DRAWING HELPERS
   * ============================================================ */
  SG.createFigureHelpers = function (c, pal, r, ts, options = {}) {
    const ink0 = options.ink || INK;
    const time = ts || 0;
    c.lineJoin = "round"; c.lineCap = "round";

    // The shared body gradient is created on first use only: many painters never touch it, and this
    // factory runs for every figure on every frame. A gradient is resolved in the user space current at
    // fill time, so creating it later (from the same c/pal/r, and no built-in painter reassigns pal's
    // colours) paints identically.
    let bodyGrad = null;
    function getBodyGrad() {
      if (bodyGrad === null) {
        bodyGrad = c.createLinearGradient(-r, -r * 1.2, r, r * 1.2);
        bodyGrad.addColorStop(0, pal.bright); bodyGrad.addColorStop(0.55, pal.mid); bodyGrad.addColorStop(1, pal.deep);
      }
      return bodyGrad;
    }

    function ink(w) { c.strokeStyle = ink0; c.lineWidth = w || 2.4; c.stroke(); }
    function fillInk(style, w) { c.fillStyle = style; c.fill(); ink(w); }
    function head(cx, cy, rad, faceColor = "#cdb79a") {
      c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); fillInk(faceColor, 2.1);
      c.beginPath(); c.arc(cx - rad * 0.3, cy - rad * 0.3, rad * 0.28, 0, Math.PI * 2);
      c.fillStyle = "rgba(255,255,255,0.45)"; c.fill();
    }
    function robe(topW, botW, topY, botY, grad) {
      if (grad === undefined) grad = getBodyGrad();
      c.beginPath(); c.moveTo(-topW, topY);
      c.quadraticCurveTo(-botW * 1.08, (topY + botY) / 2, -botW, botY);
      c.lineTo(botW, botY);
      c.quadraticCurveTo(botW * 1.08, (topY + botY) / 2, topW, topY);
      c.closePath(); fillInk(grad, 2.6);
    }
    function rr(x, y, w, h, rad) {
      c.beginPath(); c.moveTo(x + rad, y);
      c.arcTo(x + w, y, x + w, y + h, rad); c.arcTo(x + w, y + h, x, y + h, rad);
      c.arcTo(x, y + h, x, y, rad); c.arcTo(x, y, x + w, y, rad); c.closePath();
    }
    function eyes(cx, cy, dx, rad, color) {
      c.fillStyle = color; c.beginPath();
      c.arc(cx - dx, cy, rad, 0, Math.PI * 2); c.arc(cx + dx, cy, rad, 0, Math.PI * 2); c.fill();
    }
    // 0…1 oscillation; static (0.5) for icons where ts is 0.
    function pulse(speed, phase) { return time ? 0.5 + 0.5 * Math.sin(time / (speed || 300) + (phase || 0)) : 0.5; }
    // Glowing plasma blade: soft outer bloom, saturated body, white-hot core.
    function energyBlade(x1, y1, x2, y2, w, glowColor, coreColor = "#ffffff") {
      const flick = time ? 0.82 + 0.18 * Math.sin(time / 70 + x1 * 0.37 + y2 * 0.21) : 1;
      c.save();
      c.shadowBlur = 0; c.shadowColor = "transparent";
      c.lineCap = "round";
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
      c.globalCompositeOperation = "lighter";
      c.strokeStyle = rgba(glowColor, 0.16 * flick); c.lineWidth = w * 3.6; c.stroke();
      c.strokeStyle = rgba(glowColor, 0.38 * flick); c.lineWidth = w * 2.2; c.stroke();
      c.globalCompositeOperation = "source-over";
      c.strokeStyle = glowColor; c.lineWidth = w * 1.25; c.stroke();
      c.strokeStyle = coreColor; c.lineWidth = Math.max(1, w * 0.55); c.stroke();
      c.restore();
    }
    // Radial light source (white centre → colour → transparent).
    function glowOrb(cx, cy, rad, color) {
      if (rad <= 0) return;
      c.save();
      c.shadowBlur = 0; c.shadowColor = "transparent";
      c.globalCompositeOperation = "lighter";
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.3, rgba(color, 0.85));
      g.addColorStop(1, rgba(color, 0));
      c.fillStyle = g; c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    // Brushed-metal gradient along an axis.
    function metal(x0, y0, x1, y1, light = "#dfe4ea", mid = "#8a93a2", dark = "#3a404c") {
      const g = c.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, light); g.addColorStop(0.45, mid); g.addColorStop(0.55, dark); g.addColorStop(1, mid);
      return g;
    }
    // Closed polygon from flat [x0,y0,x1,y1,…] (in r units).
    function poly(pts) {
      c.beginPath(); c.moveTo(pts[0] * r, pts[1] * r);
      for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i] * r, pts[i + 1] * r);
      c.closePath();
    }
    return {
      INK: ink0,
      // Lazy accessor; assigning h.bodyGrad replaces it with a plain value (robe() keeps its own default).
      get bodyGrad() { return getBodyGrad(); },
      set bodyGrad(value) { Object.defineProperty(this, "bodyGrad", { value, writable: true, enumerable: true, configurable: true }); },
      ink, fillInk, head, robe, rr, eyes, energyBlade, glowOrb, pulse, metal, poly, rgba,
    };
  };

  /* ============================================================
   * THEME: CLASSIC UNDERWORLD (original Hades-style art, unchanged)
   * ============================================================ */
  const CLASSIC_FACE = "#ecd6bf";
  SG.THEMES.classic = {
    id: "classic",
    name: { en: "Classic Underworld", fr: "Monde Souterrain Classique", zh: "经典冥界", ar: "العالم السفلي الكلاسيكي" },
    description: {
      en: "Painted, ink-outlined shades of the underworld.",
      fr: "Ombres des Enfers peintes et cernées d'encre.",
      zh: "手绘墨线勾勒的冥界幽影。",
      ar: "ظلال العالم السفلي مرسومة ومحددة بالحبر.",
    },
    painters: {
      sovereign(c, pal, r, ts, h) {
        const { robe, ink, head, fillInk } = h;
        robe(r * 0.5, r * 1.0, -r * 0.2, r * 1.15);
        c.beginPath(); c.moveTo(-r * 0.5, -r * 0.2); c.quadraticCurveTo(0, r * 0.15, r * 0.5, -r * 0.2); c.lineWidth = 5; c.strokeStyle = pal.rim; c.stroke(); ink(2);
        head(0, -r * 0.55, r * 0.32, CLASSIC_FACE);
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.42); c.lineTo(0, r * 0.02); c.lineTo(r * 0.22, -r * 0.42); c.closePath(); fillInk("#cdb79a", 1.6);
        const cy = -r * 0.82;
        c.beginPath(); c.moveTo(-r * 0.36, cy + r * 0.16); c.lineTo(-r * 0.36, cy); c.lineTo(-r * 0.18, cy + r * 0.2); c.lineTo(0, cy - r * 0.18); c.lineTo(r * 0.18, cy + r * 0.2); c.lineTo(r * 0.36, cy); c.lineTo(r * 0.36, cy + r * 0.16); c.closePath(); fillInk(pal.gold, 2);
      },
      reaper(c, pal, r, ts, h) {
        const { fillInk, eyes, bodyGrad, INK: K } = h;
        c.beginPath(); c.moveTo(r * 0.55, -r * 1.28); c.lineTo(r * 0.72, r * 1.1); c.strokeStyle = K; c.lineWidth = 4.6; c.stroke(); c.strokeStyle = pal.gold; c.lineWidth = 2.2; c.stroke();
        c.beginPath(); c.moveTo(r * 0.55, -r * 1.28); c.quadraticCurveTo(-r * 0.5, -r * 1.55, -r * 0.72, -r * 0.85); c.quadraticCurveTo(-r * 0.05, -r * 1.05, r * 0.55, -r * 1.02); c.closePath(); fillInk("#e9e2cf", 2);
        c.beginPath(); c.moveTo(0, -r * 1.05); c.quadraticCurveTo(-r * 1.0, -r * 0.5, -r * 0.85, r * 1.15); c.lineTo(r * 0.85, r * 1.15); c.quadraticCurveTo(r * 1.0, -r * 0.5, 0, -r * 1.05); c.closePath(); fillInk(bodyGrad, 2.5);
        c.beginPath(); c.ellipse(0, -r * 0.35, r * 0.32, r * 0.42, 0, 0, Math.PI * 2); c.fillStyle = "rgba(6,4,10,0.92)"; c.fill();
        eyes(0, -r * 0.4, r * 0.13, r * 0.06, pal.bright);
      },
      juggernaut(c, pal, r, ts, h) {
        const { rr, fillInk, head, ink, bodyGrad } = h;
        rr(-r * 0.82, -r * 0.1, r * 1.64, r * 1.2, r * 0.22); fillInk(bodyGrad, 2.8);
        for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 0.82, -r * 0.05, r * 0.42, 0, Math.PI * 2); fillInk(pal.mid, 2.6); c.beginPath(); c.arc(sx * r * 0.82, -r * 0.05, r * 0.19, 0, Math.PI * 2); fillInk(pal.gold, 1.6); }
        head(0, -r * 0.5, r * 0.26, CLASSIC_FACE);
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.5); c.lineTo(r * 0.22, -r * 0.5); ink(2.4);
        c.beginPath(); c.moveTo(0, r * 0.25); c.lineTo(r * 0.17, r * 0.5); c.lineTo(0, r * 0.75); c.lineTo(-r * 0.17, r * 0.5); c.closePath(); fillInk(pal.gold, 1.8);
      },
      trickster(c, pal, r, ts, h) {
        const { fillInk, robe, bodyGrad, INK: K } = h;
        c.beginPath(); c.moveTo(r * 0.6, -r * 1.1); c.lineTo(r * 0.68, r * 1.1); c.strokeStyle = K; c.lineWidth = 4; c.stroke(); c.strokeStyle = pal.gold; c.lineWidth = 1.8; c.stroke();
        c.beginPath(); c.arc(r * 0.62, -r * 1.18, r * 0.18, 0, Math.PI * 2); const og = c.createRadialGradient(r * 0.56, -r * 1.24, 1, r * 0.62, -r * 1.18, r * 0.2); og.addColorStop(0, "#ffffff"); og.addColorStop(1, pal.bright); fillInk(og, 1.6);
        robe(r * 0.32, r * 0.72, -r * 0.3, r * 1.15);
        c.beginPath(); c.moveTo(0, -r * 1.05); c.lineTo(-r * 0.42, -r * 0.18); c.lineTo(r * 0.42, -r * 0.18); c.closePath(); fillInk(bodyGrad, 2.5);
        c.beginPath(); c.moveTo(0, -r * 0.64); c.lineTo(r * 0.26, -r * 0.34); c.lineTo(0, -r * 0.02); c.lineTo(-r * 0.26, -r * 0.34); c.closePath(); fillInk("#e9e2cf", 2);
        c.strokeStyle = K; c.lineWidth = 2; c.beginPath(); c.moveTo(-r * 0.15, -r * 0.4); c.lineTo(-r * 0.02, -r * 0.32); c.moveTo(r * 0.15, -r * 0.4); c.lineTo(r * 0.02, -r * 0.32); c.stroke();
      },
      wildrider(c, pal, r, ts, h) {
        const { fillInk, eyes, bodyGrad } = h;
        c.beginPath(); c.moveTo(-r * 0.9, r * 1.1); c.quadraticCurveTo(-r * 0.98, r * 0.1, -r * 0.4, -r * 0.15); c.lineTo(r * 0.4, -r * 0.15); c.quadraticCurveTo(r * 0.98, r * 0.1, r * 0.9, r * 1.1); c.closePath(); fillInk(bodyGrad, 2.5);
        c.beginPath(); c.arc(0, -r * 0.42, r * 0.42, 0, Math.PI * 2); fillInk(pal.mid, 2.5);
        for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * r * 0.3, -r * 0.64); c.quadraticCurveTo(sx * r * 0.9, -r * 1.02, sx * r * 0.72, -r * 1.4); c.quadraticCurveTo(sx * r * 0.55, -r * 0.98, sx * r * 0.16, -r * 0.72); c.closePath(); fillInk(pal.gold, 1.8); }
        eyes(0, -r * 0.42, r * 0.16, r * 0.075, "#fff2a0");
        c.beginPath(); c.moveTo(-r * 0.13, -r * 0.12); c.lineTo(-r * 0.05, r * 0.06); c.lineTo(r * 0.02, -r * 0.12); c.moveTo(r * 0.13, -r * 0.12); c.lineTo(r * 0.05, r * 0.06); c.lineTo(-r * 0.02, -r * 0.12); c.fillStyle = "#ffffff"; c.fill();
      },
      skirmisher(c, pal, r, ts, h) {
        const { fillInk, bodyGrad } = h;
        c.beginPath(); c.moveTo(0, -r * 0.78); c.quadraticCurveTo(-r * 0.7, -r * 0.3, -r * 0.6, r * 0.7); c.quadraticCurveTo(-r * 0.3, r * 1.12, 0, r * 0.92); c.quadraticCurveTo(r * 0.3, r * 1.12, r * 0.6, r * 0.7); c.quadraticCurveTo(r * 0.7, -r * 0.3, 0, -r * 0.78); c.closePath(); fillInk(bodyGrad, 2.3);
        c.beginPath(); c.ellipse(0, -r * 0.22, r * 0.24, r * 0.3, 0, 0, Math.PI * 2); c.fillStyle = "rgba(6,4,10,0.88)"; c.fill();
        c.fillStyle = pal.bright; c.beginPath(); c.arc(0, -r * 0.26, r * 0.06, 0, Math.PI * 2); c.fill();
      },
      harrower(c, pal, r, ts, h) {
        const { fillInk, eyes, bodyGrad, INK: K } = h;
        c.beginPath(); c.moveTo(0, -r * 1.0); c.quadraticCurveTo(-r * 0.95, -r * 0.45, -r * 0.8, r * 1.12); c.lineTo(r * 0.8, r * 1.12); c.quadraticCurveTo(r * 0.95, -r * 0.45, 0, -r * 1.0); c.closePath(); fillInk(bodyGrad, 2.5);
        c.beginPath(); c.ellipse(0, -r * 0.35, r * 0.3, r * 0.38, 0, 0, Math.PI * 2); c.fillStyle = "rgba(6,4,10,0.9)"; c.fill();
        eyes(0, -r * 0.4, r * 0.11, r * 0.055, pal.bright);
        c.beginPath(); c.moveTo(r * 0.58, -r * 0.15); c.quadraticCurveTo(r * 1.02, r * 0.3, r * 0.72, r * 0.72); c.quadraticCurveTo(r * 0.5, r * 0.98, r * 0.78, r * 1.0); c.strokeStyle = K; c.lineWidth = 4; c.stroke(); c.strokeStyle = pal.gold; c.lineWidth = 2; c.stroke();
        c.fillStyle = pal.gold; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(-r * 0.62, -r * 0.1 + i * r * 0.34, r * 0.07, 0, Math.PI * 2); c.fill(); }
      },
      fury(c, pal, r, ts, h) {
        const { fillInk, eyes, bodyGrad, INK: K } = h;
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
        eyes(0, -r * 0.62, r * 0.09, r * 0.05, K);
      },
      default(c, pal, r, ts, h) {
        c.beginPath(); c.arc(0, 0, r * 0.5, 0, Math.PI * 2); h.fillInk(h.bodyGrad, 2.4);
      },
    },
  };
  /* ============================================================
   * THEME: GALACTIC VANGUARD — an original space-opera homage
   * ============================================================ */
  const GUNMETAL = ["#9aa3b2", "#4b5262", "#1c2029"];
  const VOID = "#07060b";

  // Saber hilt: ink outline, brushed metal grip, emitter collar and grip ridges.
  function saberHilt(c, h, x1, y1, x2, y2, w) {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    c.strokeStyle = h.INK; c.lineWidth = w + 2.4; c.stroke();
    c.strokeStyle = h.metal(x1 - w, y1 - w, x1 + w, y1 + w, "#eef1f5", "#9aa3b2", "#3a404c"); c.lineWidth = w; c.stroke();
    const dx = x2 - x1, dy = y2 - y1;
    c.strokeStyle = "rgba(11,7,16,0.85)"; c.lineWidth = Math.max(1, w * 0.22);
    for (const f of [0.3, 0.45, 0.6]) {
      const px = x1 + dx * f, py = y1 + dy * f, len = Math.hypot(dx, dy) || 1, nx = -dy / len * w * 0.5, ny = dx / len * w * 0.5;
      c.beginPath(); c.moveTo(px - nx, py - ny); c.lineTo(px + nx, py + ny); c.stroke();
    }
    // emitter collar at the blade end
    c.beginPath(); c.arc(x2, y2, w * 0.62, 0, Math.PI * 2); c.fillStyle = "#2a2f3a"; c.fill(); h.ink(1.4);
  }
  // Visor/eye slit with a hot glow.
  function glowSlit(c, h, pts, color) {
    h.poly(pts); c.fillStyle = color; c.fill();
    c.save(); c.shadowBlur = 0; c.shadowColor = "transparent"; c.globalCompositeOperation = "lighter";
    c.strokeStyle = h.rgba(color, 0.55); c.lineWidth = 1.6; c.stroke(); c.restore();
  }

  SG.THEMES.galactic = {
    id: "galactic",
    name: { en: "Galactic Vanguard", fr: "Avant-garde Galactique", zh: "星际先锋", ar: "طليعة المجرة" },
    description: {
      en: "Plasma blades, armored hunters and repulsor drones from a galaxy far below.",
      fr: "Lames de plasma, chasseurs en armure et drones à répulseurs d'une galaxie lointaine.",
      zh: "等离子光刃、重甲猎手与反重力无人机，来自遥远的星系。",
      ar: "سيوف بلازما وصيّادون مدرّعون وطائرات مسيّرة من مجرة بعيدة.",
    },
    painters: {
      /* Hooded Galactic Monarch — layered mantle, masked face, metallic crest, diagonal saber. */
      sovereign(c, pal, r, ts, h) {
        const { fillInk, robe, poly, metal, glowOrb, energyBlade, rr } = h;
        // outer mantle (cape) behind
        const cape = c.createLinearGradient(0, -r * 0.4, 0, r * 1.2);
        cape.addColorStop(0, pal.deep); cape.addColorStop(1, VOID);
        c.beginPath(); c.moveTo(-r * 0.55, -r * 0.42);
        c.quadraticCurveTo(-r * 1.12, r * 0.3, -r * 1.02, r * 1.18);
        c.quadraticCurveTo(0, r * 1.02, r * 1.02, r * 1.18);
        c.quadraticCurveTo(r * 1.12, r * 0.3, r * 0.55, -r * 0.42);
        c.closePath(); fillInk(cape, 2.6);
        // inner robe
        robe(r * 0.38, r * 0.72, -r * 0.34, r * 1.12);
        // front mantle lapels
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(sx * r * 0.08, -r * 0.36);
          c.quadraticCurveTo(sx * r * 0.62, -r * 0.4, sx * r * 0.7, -r * 0.05);
          c.quadraticCurveTo(sx * r * 0.5, r * 0.5, sx * r * 0.62, r * 1.1);
          c.lineTo(sx * r * 0.34, r * 1.12);
          c.quadraticCurveTo(sx * r * 0.2, r * 0.4, sx * r * 0.08, -r * 0.36);
          c.closePath(); fillInk(pal.deep, 2);
          c.beginPath(); c.moveTo(sx * r * 0.12, -r * 0.3); c.quadraticCurveTo(sx * r * 0.24, r * 0.4, sx * r * 0.37, r * 1.06);
          c.strokeStyle = pal.rim; c.lineWidth = 1.3; c.stroke();
        }
        // belt with diamond clasp
        rr(-r * 0.36, r * 0.2, r * 0.72, r * 0.13, r * 0.04); fillInk(metal(-r * 0.4, 0, r * 0.4, 0, "#f6e7a8", pal.gold, "#7a5a1c"), 1.5);
        poly([0, 0.14, 0.1, 0.265, 0, 0.39, -0.1, 0.265]); fillInk(pal.bright, 1.3);
        // hood
        const hood = c.createLinearGradient(-r * 0.5, -r * 1.2, r * 0.5, -r * 0.2);
        hood.addColorStop(0, pal.mid); hood.addColorStop(1, pal.deep);
        c.beginPath(); c.moveTo(-r * 0.5, -r * 0.24);
        c.quadraticCurveTo(-r * 0.6, -r * 0.95, 0, -r * 1.2);
        c.quadraticCurveTo(r * 0.6, -r * 0.95, r * 0.5, -r * 0.24);
        c.quadraticCurveTo(0, -r * 0.12, -r * 0.5, -r * 0.24);
        c.closePath(); fillInk(hood, 2.4);
        // recessed face
        const rec = c.createRadialGradient(0, -r * 0.55, r * 0.05, 0, -r * 0.58, r * 0.34);
        rec.addColorStop(0, "#1a1422"); rec.addColorStop(1, VOID);
        c.beginPath(); c.ellipse(0, -r * 0.58, r * 0.27, r * 0.32, 0, 0, Math.PI * 2); c.fillStyle = rec; c.fill();
        // metallic half-mask
        poly([-0.2, -0.66, 0.2, -0.66, 0.17, -0.42, 0.06, -0.32, -0.06, -0.32, -0.17, -0.42]);
        fillInk(metal(-r * 0.2, -r * 0.7, r * 0.2, -r * 0.35, "#f2f4f7", "#a7aebb", "#4a515e"), 1.4);
        c.beginPath(); c.moveTo(0, -r * 0.62); c.lineTo(0, -r * 0.36); c.strokeStyle = "rgba(11,7,16,0.6)"; c.lineWidth = 1; c.stroke();
        glowSlit(c, h, [-0.16, -0.6, -0.04, -0.57, -0.05, -0.53, -0.15, -0.55], pal.bright);
        glowSlit(c, h, [0.16, -0.6, 0.04, -0.57, 0.05, -0.53, 0.15, -0.55], pal.bright);
        // crest diadem on the hood brow
        poly([-0.24, -0.82, -0.12, -0.86, 0, -1.08, 0.12, -0.86, 0.24, -0.82, 0.12, -0.76, 0, -0.8, -0.12, -0.76]);
        fillInk(metal(-r * 0.25, -r * 1.05, r * 0.25, -r * 0.75, "#fff3c4", pal.gold, "#7a5a1c"), 1.4);
        glowOrb(0, -r * 0.86, r * 0.07, pal.bright);
        // saber: hilt held at the right hip, blade sweeping up-right
        const hx = r * 0.36, hy = r * 0.5, tx = r * 1.12, ty = -r * 1.1;
        const len = Math.hypot(tx - hx, ty - hy), ux = (tx - hx) / len, uy = (ty - hy) / len;
        const ex = hx + ux * r * 0.2, ey = hy + uy * r * 0.2;          // emitter
        const bx = hx - ux * r * 0.2, by = hy - uy * r * 0.2;          // pommel
        energyBlade(ex, ey, tx, ty, Math.max(2, r * 0.1), pal.bright);
        saberHilt(c, h, bx, by, ex, ey, Math.max(2.6, r * 0.13));
        c.beginPath(); c.arc(hx, hy, r * 0.12, 0, Math.PI * 2); fillInk("#1b1622", 1.6);   // gloved hand
      },

      /* Galactic Inquisitor — split-hem robe, sleek mask, double-ended plasma staff. */
      reaper(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, energyBlade, glowOrb } = h;
        // dark under-layer seen through the split hem
        c.beginPath(); c.moveTo(-r * 0.3, -r * 0.3); c.lineTo(r * 0.3, -r * 0.3); c.lineTo(r * 0.5, r * 1.12); c.lineTo(-r * 0.5, r * 1.12); c.closePath(); fillInk("#120d18", 2);
        // two sweeping robe halves with jagged split hem
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(sx * r * 0.04, -r * 0.62);
          c.quadraticCurveTo(sx * r * 0.62, -r * 0.5, sx * r * 0.66, -r * 0.18);
          c.quadraticCurveTo(sx * r * 1.02, r * 0.5, sx * r * 1.0, r * 1.16);
          c.lineTo(sx * r * 0.62, r * 0.98); c.lineTo(sx * r * 0.3, r * 1.16);
          c.quadraticCurveTo(sx * r * 0.1, r * 0.7, sx * r * 0.06, r * 0.32);
          c.lineTo(sx * r * 0.04, -r * 0.62); c.closePath(); fillInk(bodyGrad, 2.3);
        }
        // angular pauldrons
        for (const sx of [-1, 1]) {
          poly([sx * 0.22, -0.46, sx * 0.72, -0.42, sx * 0.8, -0.16, sx * 0.5, -0.06, sx * 0.26, -0.24]);
          fillInk(metal(sx * r * 0.2, -r * 0.5, sx * r * 0.8, -r * 0.05, ...GUNMETAL), 1.8);
          c.beginPath(); c.moveTo(sx * r * 0.32, -r * 0.36); c.lineTo(sx * r * 0.7, -r * 0.33); c.strokeStyle = pal.bright; c.lineWidth = 1.2; c.stroke();
        }
        // sleek pointed helmet-mask
        c.beginPath(); c.moveTo(0, -r * 1.16);
        c.quadraticCurveTo(r * 0.36, -r * 1.1, r * 0.33, -r * 0.74);
        c.lineTo(r * 0.17, -r * 0.44); c.lineTo(0, -r * 0.36); c.lineTo(-r * 0.17, -r * 0.44); c.lineTo(-r * 0.33, -r * 0.74);
        c.quadraticCurveTo(-r * 0.36, -r * 1.1, 0, -r * 1.16); c.closePath();
        fillInk(metal(-r * 0.35, -r * 1.15, r * 0.35, -r * 0.4, "#5b6274", "#262a35", "#0d0f15"), 2.2);
        c.beginPath(); c.moveTo(0, -r * 1.14); c.lineTo(0, -r * 0.84); c.strokeStyle = "rgba(220,228,240,0.45)"; c.lineWidth = 1.2; c.stroke();
        glowSlit(c, h, [-0.26, -0.82, -0.05, -0.74, -0.06, -0.69, -0.24, -0.74], pal.bright);
        glowSlit(c, h, [0.26, -0.82, 0.05, -0.74, 0.06, -0.69, 0.24, -0.74], pal.bright);
        c.strokeStyle = "rgba(11,7,16,0.8)"; c.lineWidth = 1;
        for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-r * 0.08 + i * r * 0.08, -r * 0.56); c.lineTo(-r * 0.08 + i * r * 0.08, -r * 0.46); c.stroke(); }
        // double-ended plasma staff across the body
        const cx = 0, cy = r * 0.22, a = -0.6, ux = Math.cos(a), uy = Math.sin(a), hl = r * 0.32, bl = r * 0.7;
        const e1x = cx + ux * hl, e1y = cy + uy * hl, e2x = cx - ux * hl, e2y = cy - uy * hl;
        const bw = Math.max(1.8, r * 0.085);
        energyBlade(e1x, e1y, e1x + ux * bl, e1y + uy * bl, bw, pal.bright);
        energyBlade(e2x, e2y, e2x - ux * bl, e2y - uy * bl, bw, pal.bright);
        saberHilt(c, h, e2x, e2y, e1x, e1y, Math.max(2.6, r * 0.13));
        c.beginPath(); c.arc(e2x, e2y, Math.max(2.6, r * 0.13) * 0.62, 0, Math.PI * 2); c.fillStyle = "#2a2f3a"; c.fill(); h.ink(1.4);
        glowOrb(cx, cy, r * 0.1, pal.bright);
        for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + ux * r * 0.17 * s, cy + uy * r * 0.17 * s, r * 0.1, 0, Math.PI * 2); fillInk("#1b1622", 1.5); }
      },

      /* Beskar Blast Colossus — T-visor helmet, oversized pauldrons, chest plate, side thrusters. */
      juggernaut(c, pal, r, ts, h) {
        const { fillInk, rr, bodyGrad, poly, metal, glowOrb, pulse } = h;
        const BESKAR = (x0, y0, x1, y1) => metal(x0, y0, x1, y1, "#f4f6f9", "#a9b1bd", "#525a67");
        // side thrusters with plasma exhaust
        const flare = 0.75 + 0.5 * pulse(110);
        for (const sx of [-1, 1]) {
          const x = sx * r * 0.98;
          glowOrb(x, r * 0.98, r * 0.24 * flare, pal.bright);
          rr(x - r * 0.15, r * 0.02, r * 0.3, r * 0.82, r * 0.08); fillInk(metal(x - r * 0.15, 0, x + r * 0.15, 0, ...GUNMETAL), 2);
          poly([x / r - 0.17, 0.84, x / r + 0.17, 0.84, x / r + 0.12, 0.98, x / r - 0.12, 0.98]); fillInk("#22262f", 1.6);
        }
        // armored torso
        rr(-r * 0.78, -r * 0.18, r * 1.56, r * 1.3, r * 0.2); fillInk(bodyGrad, 2.8);
        // chest plate
        poly([-0.52, -0.08, 0.52, -0.08, 0.44, 0.4, 0, 0.56, -0.44, 0.4]); fillInk(BESKAR(-r * 0.5, -r * 0.1, r * 0.5, r * 0.55), 2);
        c.beginPath(); c.moveTo(0, -r * 0.06); c.lineTo(0, r * 0.52); c.strokeStyle = "rgba(11,7,16,0.45)"; c.lineWidth = 1.1; c.stroke();
        // belt + buckle
        rr(-r * 0.7, r * 0.7, r * 1.4, r * 0.16, r * 0.04); fillInk("#2a2228", 1.6);
        rr(-r * 0.13, r * 0.68, r * 0.26, r * 0.2, r * 0.04); fillInk(pal.gold, 1.4);
        // oversized angular pauldrons
        for (const sx of [-1, 1]) {
          poly([sx * 0.32, -0.34, sx * 1.12, -0.42, sx * 1.24, 0.02, sx * 0.98, 0.26, sx * 0.48, 0.06]);
          fillInk(BESKAR(sx * r * 0.3, -r * 0.45, sx * r * 1.2, r * 0.25), 2.4);
          poly([sx * 0.5, -0.24, sx * 1.04, -0.3, sx * 1.1, -0.18, sx * 0.54, -0.12]); c.fillStyle = pal.mid; c.fill();
          c.fillStyle = pal.gold; c.beginPath(); c.arc(sx * r * 0.98, r * 0.08, r * 0.05, 0, Math.PI * 2); c.fill();
        }
        // helmet
        c.beginPath(); c.moveTo(-r * 0.36, -r * 0.36); c.lineTo(-r * 0.38, -r * 0.8);
        c.quadraticCurveTo(-r * 0.36, -r * 1.16, 0, -r * 1.17);
        c.quadraticCurveTo(r * 0.36, -r * 1.16, r * 0.38, -r * 0.8);
        c.lineTo(r * 0.36, -r * 0.36); c.lineTo(r * 0.16, -r * 0.28); c.lineTo(-r * 0.16, -r * 0.28); c.closePath();
        fillInk(BESKAR(-r * 0.38, -r * 1.15, r * 0.38, -r * 0.3), 2.4);
        c.beginPath(); c.moveTo(-r * 0.32, -r * 1.0); c.quadraticCurveTo(0, -r * 1.12, r * 0.32, -r * 1.0); c.strokeStyle = pal.mid; c.lineWidth = 2; c.stroke();
        // the T-visor (broken at the crossbar ends)
        poly([-0.3, -0.86, -0.06, -0.86, -0.06, -0.48, 0.06, -0.48, 0.06, -0.86, 0.3, -0.86, 0.3, -0.76, 0.08, -0.74, -0.08, -0.74, -0.3, -0.76]);
        c.fillStyle = VOID; c.fill();
        c.beginPath(); c.moveTo(-r * 0.26, -r * 0.83); c.lineTo(-r * 0.1, -r * 0.83); c.strokeStyle = h.rgba(pal.bright, 0.7); c.lineWidth = 1; c.stroke();
        c.strokeStyle = "rgba(11,7,16,0.6)"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(-r * 0.24, -r * 0.62); c.lineTo(-r * 0.14, -r * 0.4); c.moveTo(r * 0.24, -r * 0.62); c.lineTo(r * 0.14, -r * 0.4); c.stroke();
      },

      /* Force Mystic / Cyber-Sage — flowing tunic, sculpted cowl, levitating holocron with energy rings. */
      trickster(c, pal, r, ts, h) {
        const { fillInk, robe, bodyGrad, glowOrb, pulse, eyes, rgba } = h;
        robe(r * 0.34, r * 0.84, -r * 0.4, r * 1.15);
        // waist sash
        c.beginPath(); c.moveTo(-r * 0.62, r * 0.74); c.quadraticCurveTo(0, r * 0.88, r * 0.62, r * 0.74);
        c.strokeStyle = h.INK; c.lineWidth = 5; c.stroke(); c.strokeStyle = pal.gold; c.lineWidth = 2.6; c.stroke();
        // flowing sleeves reaching to cupped hands
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(sx * r * 0.26, -r * 0.38);
          c.quadraticCurveTo(sx * r * 0.9, -r * 0.1, sx * r * 0.62, r * 0.6);
          c.lineTo(sx * r * 0.28, r * 0.52);
          c.quadraticCurveTo(sx * r * 0.5, r * 0.1, sx * r * 0.2, -r * 0.18); c.closePath(); fillInk(bodyGrad, 2.2);
          c.beginPath(); c.arc(sx * r * 0.3, r * 0.5, r * 0.11, 0, Math.PI * 2); fillInk("#cdb79a", 1.5);
        }
        // sculpted cowl hood
        const hood = c.createLinearGradient(0, -r * 1.25, 0, -r * 0.3);
        hood.addColorStop(0, pal.bright); hood.addColorStop(0.5, pal.mid); hood.addColorStop(1, pal.deep);
        c.beginPath(); c.moveTo(0, -r * 1.24);
        c.quadraticCurveTo(r * 0.52, -r * 1.1, r * 0.48, -r * 0.6);
        c.quadraticCurveTo(r * 0.44, -r * 0.32, r * 0.18, -r * 0.3);
        c.lineTo(-r * 0.18, -r * 0.3);
        c.quadraticCurveTo(-r * 0.44, -r * 0.32, -r * 0.48, -r * 0.6);
        c.quadraticCurveTo(-r * 0.52, -r * 1.1, 0, -r * 1.24); c.closePath(); fillInk(hood, 2.3);
        c.beginPath(); c.moveTo(0, -r * 1.2); c.quadraticCurveTo(r * 0.12, -r * 0.95, 0, -r * 0.85); c.strokeStyle = rgba(pal.rim, 0.6); c.lineWidth = 1.2; c.stroke();
        // shadowed face with glowing eyes
        c.beginPath(); c.ellipse(0, -r * 0.6, r * 0.22, r * 0.26, 0, 0, Math.PI * 2); c.fillStyle = VOID; c.fill();
        c.beginPath(); c.ellipse(0, -r * 0.5, r * 0.15, r * 0.13, 0, 0, Math.PI); c.fillStyle = "#8f7d68"; c.fill();
        eyes(0, -r * 0.63, r * 0.085, r * 0.04, pal.bright);
        // energy field rings
        const cx = 0, cy = r * 0.16, spin = ts ? ts / 900 : 0.4, p = pulse(260);
        glowOrb(cx, cy, r * (0.48 + 0.08 * p), pal.bright);
        c.save(); c.shadowBlur = 0; c.shadowColor = "transparent";
        for (let i = 0; i < 2; i++) {
          c.beginPath(); c.ellipse(cx, cy, r * (0.5 + i * 0.14), r * (0.14 + i * 0.05), spin * (i ? -1 : 1) + i * 0.8, 0, Math.PI * 2);
          c.strokeStyle = rgba(pal.rim, 0.55 + 0.3 * p - i * 0.2); c.lineWidth = 1.2; c.setLineDash([r * 0.18, r * 0.1]); c.stroke();
        }
        c.setLineDash([]); c.restore();
        // faceted holocron
        const s = r * 0.24, rot = ts ? Math.sin(ts / 700) * 0.25 : 0;
        c.save(); c.translate(cx, cy - r * 0.04); c.rotate(rot);
        const hg = c.createLinearGradient(-s, -s, s, s);
        hg.addColorStop(0, "#ffffff"); hg.addColorStop(0.4, pal.rim); hg.addColorStop(1, pal.mid);
        c.beginPath(); c.moveTo(0, -s * 1.2); c.lineTo(s, 0); c.lineTo(0, s * 1.2); c.lineTo(-s, 0); c.closePath(); fillInk(hg, 1.8);
        c.beginPath(); c.moveTo(0, -s * 1.2); c.lineTo(s * 0.3, 0); c.lineTo(0, s * 1.2); c.moveTo(-s, 0); c.lineTo(s * 0.3, 0); c.lineTo(s, 0);
        c.strokeStyle = rgba("#0b0710", 0.45); c.lineWidth = 1; c.stroke();
        c.beginPath(); c.moveTo(0, -s * 1.2); c.lineTo(-s, 0); c.lineTo(s * 0.3, 0); c.closePath(); c.fillStyle = "rgba(255,255,255,0.35)"; c.fill();
        c.restore();
        glowOrb(cx + r * 0.02, cy - r * 0.04, r * 0.12 * (0.7 + 0.5 * p), "#ffffff");
      },

      /* Speeder Scout — swept flight helmet, pilot, wedge speeder with dual repulsor turbines. */
      wildrider(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, pulse, rr, rgba } = h;
        const thr = 0.7 + 0.6 * pulse(80);
        // underside repulsor glow
        c.save(); c.shadowBlur = 0; c.shadowColor = "transparent"; c.globalCompositeOperation = "lighter";
        const ug = c.createRadialGradient(0, r * 1.06, 0, 0, r * 1.06, r * 0.8);
        ug.addColorStop(0, rgba(pal.bright, 0.55)); ug.addColorStop(1, rgba(pal.bright, 0));
        c.fillStyle = ug; c.beginPath(); c.ellipse(0, r * 1.06, r * 0.85, r * 0.22, 0, 0, Math.PI * 2); c.fill();
        c.restore();
        // turbine plasma exhaust plumes
        for (const sx of [-1, 1]) {
          const x = sx * r * 0.86;
          c.save(); c.shadowBlur = 0; c.shadowColor = "transparent"; c.globalCompositeOperation = "lighter";
          const fg = c.createLinearGradient(0, r * 0.8, 0, r * (1.0 + 0.3 * thr));
          fg.addColorStop(0, "rgba(255,255,255,0.9)"); fg.addColorStop(0.35, rgba(pal.bright, 0.8)); fg.addColorStop(1, rgba(pal.bright, 0));
          c.fillStyle = fg; c.beginPath(); c.moveTo(x - r * 0.15, r * 0.82); c.lineTo(x + r * 0.15, r * 0.82); c.lineTo(x, r * (1.0 + 0.3 * thr)); c.closePath(); c.fill();
          c.restore();
        }
        // pilot torso + arms (behind the cowling)
        poly([-0.3, -0.3, 0.3, -0.3, 0.26, 0.4, -0.26, 0.4]); fillInk(bodyGrad, 2.2);
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(sx * r * 0.26, -r * 0.2); c.quadraticCurveTo(sx * r * 0.52, r * 0.02, sx * r * 0.44, r * 0.3);
          c.strokeStyle = h.INK; c.lineWidth = 5.2; c.stroke(); c.strokeStyle = pal.mid; c.lineWidth = 3; c.stroke();
        }
        // wedge speeder chassis
        poly([-0.92, 0.5, -0.5, 0.26, 0.5, 0.26, 0.92, 0.5, 0.66, 0.92, -0.66, 0.92]);
        fillInk(metal(0, r * 0.26, 0, r * 0.92, "#e6eaf0", "#8a93a2", "#3a404c"), 2.4);
        poly([-0.62, 0.48, 0.62, 0.48, 0.5, 0.62, -0.5, 0.62]); c.fillStyle = pal.mid; c.fill();
        // windscreen + handlebar
        poly([-0.34, 0.3, 0.34, 0.3, 0.22, 0.16, -0.22, 0.16]); fillInk(rgba(pal.rim, 0.55), 1.4);
        c.beginPath(); c.moveTo(-r * 0.46, r * 0.3); c.lineTo(r * 0.46, r * 0.3); c.strokeStyle = h.INK; c.lineWidth = 2.6; c.stroke();
        // dual repulsor turbines
        for (const sx of [-1, 1]) {
          const x = sx * r * 0.86, y = r * 0.64;
          rr(x - r * 0.2, y - r * 0.24, r * 0.4, r * 0.44, r * 0.12); fillInk(metal(x - r * 0.2, 0, x + r * 0.2, 0, ...GUNMETAL), 2);
          c.beginPath(); c.ellipse(x, y + r * 0.06, r * 0.13, r * 0.13, 0, 0, Math.PI * 2); c.fillStyle = VOID; c.fill();
          glowOrb(x, y + r * 0.06, r * 0.13 * thr, pal.bright);
        }
        // swept flight helmet with stabilizer fins
        for (const sx of [-1, 1]) { poly([sx * 0.2, -0.86, sx * 0.62, -1.18, sx * 0.48, -0.86, sx * 0.34, -0.56]); fillInk(pal.gold, 1.6); }
        c.beginPath(); c.arc(0, -r * 0.66, r * 0.36, 0, Math.PI * 2);
        fillInk(metal(-r * 0.36, -r * 1.0, r * 0.36, -r * 0.3, "#f4f6f9", pal.rim, pal.mid), 2.3);
        c.beginPath(); c.moveTo(0, -r * 1.02); c.lineTo(0, -r * 0.8); c.strokeStyle = pal.deep; c.lineWidth = 2.4; c.stroke();
        // wrap-around visor with sky reflection
        const vg = c.createLinearGradient(0, -r * 0.78, 0, -r * 0.5);
        vg.addColorStop(0, "#0e0a14"); vg.addColorStop(0.6, pal.deep); vg.addColorStop(1, pal.bright);
        c.beginPath(); c.moveTo(-r * 0.32, -r * 0.74); c.quadraticCurveTo(0, -r * 0.82, r * 0.32, -r * 0.74);
        c.quadraticCurveTo(r * 0.3, -r * 0.5, 0, -r * 0.48); c.quadraticCurveTo(-r * 0.3, -r * 0.5, -r * 0.32, -r * 0.74); c.closePath(); fillInk(vg, 1.6);
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.7); c.lineTo(-r * 0.06, -r * 0.73); c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = 1.2; c.stroke();
      },

      /* Shock Trooper — angular ceramic helmet, visor band, cheek vents, plasma carbine. */
      skirmisher(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, rr, rgba } = h;
        const CERAMIC = (x0, y0, x1, y1) => metal(x0, y0, x1, y1, "#ffffff", "#e3e7ee", "#9ea7b4");
        // armored body
        c.beginPath(); c.moveTo(-r * 0.42, -r * 0.3);
        c.quadraticCurveTo(-r * 0.72, -r * 0.2, -r * 0.62, r * 0.7);
        c.quadraticCurveTo(-r * 0.3, r * 1.08, 0, r * 0.98); c.quadraticCurveTo(r * 0.3, r * 1.08, r * 0.62, r * 0.7);
        c.quadraticCurveTo(r * 0.72, -r * 0.2, r * 0.42, -r * 0.3); c.closePath(); fillInk(bodyGrad, 2.3);
        // ceramic chest plate
        poly([-0.36, -0.22, 0.36, -0.22, 0.3, 0.28, 0, 0.38, -0.3, 0.28]); fillInk(CERAMIC(-r * 0.36, -r * 0.22, r * 0.3, r * 0.38), 1.8);
        c.fillStyle = pal.mid; rr(-r * 0.2, -r * 0.08, r * 0.4, r * 0.1, r * 0.03); c.fill();
        // angular ceramic helmet
        c.beginPath(); c.moveTo(-r * 0.34, -r * 0.32); c.lineTo(-r * 0.38, -r * 0.74);
        c.quadraticCurveTo(-r * 0.34, -r * 1.1, 0, -r * 1.12);
        c.quadraticCurveTo(r * 0.34, -r * 1.1, r * 0.38, -r * 0.74);
        c.lineTo(r * 0.34, -r * 0.32); c.lineTo(r * 0.14, -r * 0.24); c.lineTo(-r * 0.14, -r * 0.24); c.closePath();
        fillInk(CERAMIC(-r * 0.38, -r * 1.1, r * 0.38, -r * 0.3), 2.3);
        // side-colour crest stripe
        c.beginPath(); c.moveTo(0, -r * 1.1); c.lineTo(0, -r * 0.86); c.strokeStyle = pal.mid; c.lineWidth = 3; c.stroke();
        // dark visor band
        poly([-0.34, -0.8, 0, -0.72, 0.34, -0.8, 0.32, -0.66, 0, -0.6, -0.32, -0.66]); fillInk(VOID, 1.4);
        c.beginPath(); c.moveTo(-r * 0.28, -r * 0.75); c.lineTo(-r * 0.1, -r * 0.7); c.moveTo(r * 0.28, -r * 0.75); c.lineTo(r * 0.1, -r * 0.7);
        c.strokeStyle = rgba(pal.bright, 0.85); c.lineWidth = 1.3; c.stroke();
        // cheek vents + breather
        c.strokeStyle = "rgba(11,7,16,0.75)"; c.lineWidth = 1;
        for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const x = sx * r * (0.16 + i * 0.05); c.beginPath(); c.moveTo(x, -r * 0.52); c.lineTo(x, -r * 0.38); c.stroke(); }
        poly([-0.08, -0.5, 0.08, -0.5, 0.06, -0.34, -0.06, -0.34]); fillInk("#2b303a", 1);
        // plasma carbine across the torso
        c.save(); c.translate(0, r * 0.38); c.rotate(-0.38);
        rr(-r * 0.66, -r * 0.08, r * 1.22, r * 0.16, r * 0.04); fillInk(metal(0, -r * 0.08, 0, r * 0.08, "#6b7385", "#2b303a", "#11141a"), 1.8);
        rr(-r * 0.66, -r * 0.02, r * 0.24, r * 0.22, r * 0.04); fillInk("#2b303a", 1.5);                   // stock
        rr(-r * 0.1, -r * 0.2, r * 0.32, r * 0.1, r * 0.03); fillInk("#3a404c", 1.3);                     // scope
        rr(r * 0.1, r * 0.06, r * 0.1, r * 0.2, r * 0.02); fillInk("#2b303a", 1.3);                         // magazine
        c.fillStyle = pal.bright; rr(-r * 0.2, -r * 0.03, r * 0.5, r * 0.04, r * 0.02); c.fill();          // charge coil
        glowOrb(r * 0.6, 0, r * 0.12, pal.bright);                                                           // muzzle
        c.restore();
        // gloved hands
        for (const [x, y] of [[-r * 0.28, r * 0.48], [r * 0.18, r * 0.26]]) { c.beginPath(); c.arc(x, y, r * 0.1, 0, Math.PI * 2); fillInk("#1b1622", 1.4); }
      },

      /* Bounty Hunter — asymmetric armor, rangefinder, twin jetpack, gauntlet tractor tether + claw. */
      harrower(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, pulse, rr, rgba } = h;
        const fl = 0.7 + 0.6 * pulse(90, 1.3);
        // twin jetpack thrusters (behind)
        for (const sx of [-1, 1]) {
          const x = sx * r * 0.56;
          c.save(); c.shadowBlur = 0; c.shadowColor = "transparent"; c.globalCompositeOperation = "lighter";
          const fg = c.createLinearGradient(0, r * 0.36, 0, r * (0.5 + 0.32 * fl));
          fg.addColorStop(0, "rgba(255,255,255,0.9)"); fg.addColorStop(0.3, rgba(pal.bright, 0.85)); fg.addColorStop(1, rgba(pal.bright, 0));
          c.fillStyle = fg; c.beginPath(); c.moveTo(x - r * 0.1, r * 0.36); c.lineTo(x + r * 0.1, r * 0.36); c.lineTo(x, r * (0.5 + 0.32 * fl)); c.closePath(); c.fill();
          c.restore();
          rr(x - r * 0.13, -r * 0.62, r * 0.26, r * 0.98, r * 0.12); fillInk(metal(x - r * 0.13, 0, x + r * 0.13, 0, ...GUNMETAL), 2);
          c.beginPath(); c.moveTo(x, -r * 0.62); c.quadraticCurveTo(x, -r * 0.82, x + sx * r * 0.02, -r * 0.84); c.strokeStyle = h.INK; c.lineWidth = 2; c.stroke();
        }
        // half-cape over the left shoulder
        c.beginPath(); c.moveTo(-r * 0.2, -r * 0.4); c.quadraticCurveTo(-r * 0.92, -r * 0.2, -r * 0.86, r * 1.14);
        c.lineTo(-r * 0.32, r * 1.04); c.quadraticCurveTo(-r * 0.3, r * 0.3, -r * 0.2, -r * 0.4); c.closePath();
        const cape = c.createLinearGradient(0, -r * 0.4, 0, r * 1.1); cape.addColorStop(0, "#3a2e2a"); cape.addColorStop(1, "#140f12");
        fillInk(cape, 2.2);
        // body armour
        c.beginPath(); c.moveTo(-r * 0.4, -r * 0.36);
        c.lineTo(r * 0.44, -r * 0.36); c.quadraticCurveTo(r * 0.58, r * 0.4, r * 0.46, r * 1.12);
        c.lineTo(-r * 0.4, r * 1.12); c.quadraticCurveTo(-r * 0.5, r * 0.4, -r * 0.4, -r * 0.36); c.closePath(); fillInk(bodyGrad, 2.4);
        poly([-0.3, -0.26, 0.32, -0.26, 0.26, 0.16, -0.26, 0.16]); fillInk(metal(-r * 0.3, -r * 0.26, r * 0.3, r * 0.16, "#d4c9b0", "#8c8170", "#4a4238"), 1.6);
        // utility belt with pouches
        rr(-r * 0.46, r * 0.34, r * 0.94, r * 0.14, r * 0.04); fillInk("#3b2f22", 1.6);
        for (const x of [-0.36, -0.14, 0.18]) { rr(x * r, r * 0.32, r * 0.16, r * 0.2, r * 0.03); fillInk(pal.gold, 1.2); }
        // big left pauldron (asymmetric)
        poly([-0.18, -0.42, -0.66, -0.48, -0.74, -0.16, -0.46, -0.04]); fillInk(metal(-r * 0.7, -r * 0.5, -r * 0.2, -r * 0.05, "#d4c9b0", pal.mid, pal.deep), 2);
        // right arm raised with wrist gauntlet
        c.beginPath(); c.moveTo(r * 0.4, -r * 0.3); c.quadraticCurveTo(r * 0.72, -r * 0.28, r * 0.74, r * 0.0);
        c.strokeStyle = h.INK; c.lineWidth = 6.2; c.stroke(); c.strokeStyle = pal.mid; c.lineWidth = 3.6; c.stroke();
        rr(r * 0.62, -r * 0.08, r * 0.24, r * 0.2, r * 0.05); fillInk(metal(r * 0.62, 0, r * 0.86, 0, ...GUNMETAL), 1.6);
        // curved magnetic tractor tether
        const gx = r * 0.84, gy = r * 0.02, kx = r * 0.98, ky = r * 0.96, qx = r * 1.36, qy = r * 0.3;
        c.save(); c.shadowBlur = 0; c.shadowColor = "transparent";
        c.beginPath(); c.moveTo(gx, gy); c.quadraticCurveTo(qx, qy, kx, ky);
        c.globalCompositeOperation = "lighter"; c.strokeStyle = rgba(pal.bright, 0.3); c.lineWidth = 5; c.stroke();
        c.globalCompositeOperation = "source-over"; c.strokeStyle = pal.bright; c.lineWidth = 1.8;
        c.setLineDash([r * 0.1, r * 0.06]); c.lineDashOffset = ts ? -ts / 40 : 0; c.stroke(); c.setLineDash([]);
        c.restore();
        glowOrb(gx, gy, r * 0.12, pal.bright);
        // grappling claw
        c.save(); c.translate(kx, ky); c.rotate(0.35);
        c.beginPath(); c.arc(0, 0, r * 0.08, 0, Math.PI * 2); fillInk(metal(-r * 0.08, 0, r * 0.08, 0, ...GUNMETAL), 1.4);
        for (const a of [-0.9, 0, 0.9]) {
          c.save(); c.rotate(a);
          c.beginPath(); c.moveTo(0, r * 0.06); c.quadraticCurveTo(r * 0.1, r * 0.16, r * 0.02, r * 0.26);
          c.strokeStyle = h.INK; c.lineWidth = 3.4; c.stroke(); c.strokeStyle = "#c9ced8"; c.lineWidth = 1.6; c.stroke();
          c.restore();
        }
        c.restore();
        // hunter helmet
        c.beginPath(); c.moveTo(-r * 0.3, -r * 0.4); c.lineTo(-r * 0.32, -r * 0.82);
        c.quadraticCurveTo(-r * 0.28, -r * 1.08, 0, -r * 1.08); c.quadraticCurveTo(r * 0.28, -r * 1.08, r * 0.32, -r * 0.82);
        c.lineTo(r * 0.3, -r * 0.4); c.lineTo(0, -r * 0.32); c.closePath();
        fillInk(metal(-r * 0.32, -r * 1.08, r * 0.32, -r * 0.32, "#c8d4c0", pal.mid, pal.deep), 2.3);
        // narrow visor slit with a glowing scan line
        poly([-0.24, -0.8, 0.24, -0.8, 0.22, -0.7, 0.05, -0.68, 0.05, -0.5, -0.05, -0.5, -0.05, -0.68, -0.22, -0.7]); c.fillStyle = VOID; c.fill();
        c.beginPath(); c.moveTo(-r * 0.18, -r * 0.75); c.lineTo(r * 0.18, -r * 0.75); c.strokeStyle = rgba(pal.bright, 0.5 + 0.4 * pulse(400)); c.lineWidth = 1.2; c.stroke();
        // shoulder rangefinder antenna
        c.beginPath(); c.moveTo(r * 0.28, -r * 0.84); c.lineTo(r * 0.36, -r * 1.2); c.strokeStyle = h.INK; c.lineWidth = 3.2; c.stroke(); c.strokeStyle = "#c9ced8"; c.lineWidth = 1.4; c.stroke();
        rr(r * 0.28, -r * 1.3, r * 0.2, r * 0.12, r * 0.03); fillInk("#2b303a", 1.3);
        glowOrb(r * 0.4, -r * 1.24, r * 0.07, "#ff4a3a");
      },

      /* Viper Recon Drone — diamond chassis, pulsing optic eye, swept foils, repulsor glow. */
      fury(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, pulse, rgba } = h;
        const p = pulse(220), bob = ts ? Math.sin(ts / 420) * r * 0.04 : 0;
        // underside repulsor glow (does not bob)
        c.save(); c.shadowBlur = 0; c.shadowColor = "transparent"; c.globalCompositeOperation = "lighter";
        const ug = c.createRadialGradient(0, r * 1.0, 0, 0, r * 1.0, r * 0.7);
        ug.addColorStop(0, rgba(pal.bright, 0.5 + 0.25 * p)); ug.addColorStop(1, rgba(pal.bright, 0));
        c.fillStyle = ug; c.beginPath(); c.ellipse(0, r * 1.0, r * 0.7, r * 0.2, 0, 0, Math.PI * 2); c.fill();
        c.restore();
        c.translate(0, bob);
        // repulsor emitter beams
        c.save(); c.shadowBlur = 0; c.shadowColor = "transparent"; c.globalCompositeOperation = "lighter";
        for (const sx of [-1, 1]) {
          const bg = c.createLinearGradient(0, r * 0.4, 0, r * 0.98);
          bg.addColorStop(0, rgba(pal.bright, 0.55)); bg.addColorStop(1, rgba(pal.bright, 0));
          c.fillStyle = bg; c.beginPath(); c.moveTo(sx * r * 0.36, r * 0.4); c.lineTo(sx * r * 0.22, r * 0.4); c.lineTo(sx * r * 0.18, r * 0.98); c.lineTo(sx * r * 0.44, r * 0.98); c.closePath(); c.fill();
        }
        c.restore();
        // swept stabilizer foils
        for (const sx of [-1, 1]) {
          poly([sx * 0.22, -0.18, sx * 1.22, -0.72, sx * 1.04, -0.32, sx * 1.2, 0.18, sx * 0.34, 0.26]); fillInk(bodyGrad, 2.2);
          c.beginPath(); c.moveTo(sx * r * 0.36, -r * 0.08); c.lineTo(sx * r * 1.02, -r * 0.48); c.moveTo(sx * r * 0.4, r * 0.14); c.lineTo(sx * r * 1.04, r * 0.08);
          c.strokeStyle = rgba(pal.rim, 0.75); c.lineWidth = 1.1; c.stroke();
          glowOrb(sx * r * 1.18, -r * 0.68, r * 0.08, pal.bright);
        }
        // sensor spines
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(sx * r * 0.06, -r * 0.86); c.lineTo(sx * r * 0.2, -r * 1.2); c.strokeStyle = h.INK; c.lineWidth = 2.8; c.stroke(); c.strokeStyle = "#c9ced8"; c.lineWidth = 1.2; c.stroke();
          glowOrb(sx * r * 0.2, -r * 1.2, r * 0.07, pal.bright);
        }
        // diamond interceptor chassis
        poly([0, -0.96, 0.52, -0.14, 0, 0.84, -0.52, -0.14]); fillInk(metal(-r * 0.5, -r * 0.9, r * 0.5, r * 0.8, ...GUNMETAL), 2.4);
        poly([0, -0.96, 0.52, -0.14, 0, -0.14]); c.fillStyle = rgba(pal.bright, 0.28); c.fill();
        poly([0, 0.84, -0.52, -0.14, 0, -0.14]); c.fillStyle = "rgba(0,0,0,0.25)"; c.fill();
        c.beginPath(); c.moveTo(0, -r * 0.96); c.lineTo(0, r * 0.84); c.moveTo(-r * 0.52, -r * 0.14); c.lineTo(r * 0.52, -r * 0.14);
        c.strokeStyle = "rgba(11,7,16,0.5)"; c.lineWidth = 1; c.stroke();
        // emitter nubs
        for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 0.29, r * 0.38, r * 0.07, 0, Math.PI * 2); fillInk(pal.bright, 1.2); }
        // central pulsing optic eye
        c.beginPath(); c.arc(0, -r * 0.16, r * 0.25, 0, Math.PI * 2); fillInk(metal(-r * 0.25, -r * 0.4, r * 0.25, 0, "#eef1f5", "#8a93a2", "#2b303a"), 2);
        c.beginPath(); c.arc(0, -r * 0.16, r * 0.17, 0, Math.PI * 2); c.fillStyle = VOID; c.fill();
        glowOrb(0, -r * 0.16, r * (0.15 + 0.08 * p), pal.bright);
        c.beginPath(); c.arc(-r * 0.05, -r * 0.21, r * 0.04, 0, Math.PI * 2); c.fillStyle = "rgba(255,255,255,0.9)"; c.fill();
      },
    },
  };

  /* ============================================================
   * THEME: SUPERHUMAN LEGION — an original superhero homage
   * ============================================================ */
  const TAU = Math.PI * 2;
  const HERO_SKIN = "#e9c6a1";
  const LEATHER = ["#a8754a", "#6b4428", "#2e1b0f"];
  const SILVER = ["#f7f9fc", "#bcc4d0", "#5d6674"];
  const ARC = "#8ff3ff";       // plasma core / repulsor cyan
  const ELDRITCH = "#ffb23e";  // mystic-arts amber
  const GAMMA = "#8dff4f";     // gamma radiation green
  const THUNDER = "#a8dcff";   // storm lightning blue-white
  const STING = "#ffe45c";     // bio-electric stinger yellow

  // Deterministic 0…1 noise (stable per seed, so static icons never jitter).
  function heroHash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  // Inked limb: thick quadratic stroke with an ink outline (color may be a gradient).
  function heroLimb(c, h, x1, y1, cx, cy, x2, y2, w, color) {
    c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(cx, cy, x2, y2);
    c.strokeStyle = h.INK; c.lineWidth = w + 2.6; c.stroke();
    c.strokeStyle = color; c.lineWidth = w; c.stroke();
  }
  // Five-pointed star path.
  function heroStar(c, cx, cy, R, inner = 0.42) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? R * inner : R;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.closePath();
  }
  // Crackling lightning bolt (re-rolls its zig-zag every ~70ms). Returns its vertices for branching.
  function heroBolt(c, h, ts, x1, y1, x2, y2, w, color, seed, segs = 5, jitter) {
    const frame = ts ? Math.floor(ts / 70) : 0, s0 = seed * 17.3 + frame * 5.17;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const jit = jitter == null ? len * 0.16 : jitter;
    const pts = [[x1, y1]];
    for (let i = 1; i < segs; i++) {
      const t = i / segs, o = (heroHash(s0 + i * 7.31) - 0.5) * 2 * jit;
      pts.push([x1 + dx * t + nx * o, y1 + dy * t + ny * o]);
    }
    pts.push([x2, y2]);
    const flick = ts ? 0.65 + 0.35 * heroHash(s0 + 99) : 1;
    c.save();
    c.shadowBlur = 0; c.shadowColor = "transparent"; c.lineCap = "round"; c.lineJoin = "round";
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.globalCompositeOperation = "lighter";
    c.strokeStyle = h.rgba(color, 0.22 * flick); c.lineWidth = w * 4; c.stroke();
    c.strokeStyle = h.rgba(color, 0.55 * flick); c.lineWidth = w * 2; c.stroke();
    c.globalCompositeOperation = "source-over";
    c.strokeStyle = color; c.lineWidth = w * 1.1; c.stroke();
    c.strokeStyle = "#ffffff"; c.lineWidth = Math.max(0.8, w * 0.45); c.stroke();
    c.restore();
    return pts;
  }
  // Mystic mandala: halo, double ring, rotating rune ring, counter-rotating seal of two squares,
  // spinning inner diamond and a hot core. dir = ±1 sets the spin direction.
  function heroMandala(c, h, ts, cx, cy, R, color, dir) {
    const { rgba } = h;
    const spin = (ts ? ts / 1500 : 0.35) * dir, p = h.pulse(420, cx * 0.05);
    const lw = Math.max(0.9, R * 0.055);
    c.save();
    c.shadowBlur = 0; c.shadowColor = "transparent";
    c.translate(cx, cy);
    c.globalCompositeOperation = "lighter";
    const g = c.createRadialGradient(0, 0, 0, 0, 0, R * 1.15);
    g.addColorStop(0, rgba(color, 0.42 + 0.2 * p)); g.addColorStop(0.6, rgba(color, 0.16)); g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, R * 1.15, 0, TAU); c.fill();
    const ring = (rad, a, wm = 1) => { c.beginPath(); c.arc(0, 0, rad, 0, TAU); c.strokeStyle = rgba(color, a); c.lineWidth = lw * wm; c.stroke(); };
    ring(R, 0.3, 3.2); ring(R, 0.95); ring(R * 0.82, 0.85);
    // rotating rune ring: ticks, chevrons, dots and crosses between the two outer rings
    c.save(); c.rotate(spin);
    c.strokeStyle = rgba(color, 0.95); c.fillStyle = rgba(color, 0.95); c.lineWidth = lw;
    const s = R * 0.055;
    for (let i = 0; i < 16; i++) {
      c.save(); c.rotate(i * Math.PI / 8);
      c.beginPath();
      if (i % 4 === 0) { c.moveTo(R * 0.85, 0); c.lineTo(R * 0.97, 0); c.stroke(); }
      else if (i % 4 === 1) { c.moveTo(R * 0.87, -s); c.lineTo(R * 0.95, 0); c.lineTo(R * 0.87, s); c.stroke(); }
      else if (i % 4 === 2) { c.arc(R * 0.91, 0, s * 0.6, 0, TAU); c.fill(); }
      else { c.moveTo(R * 0.91, -s); c.lineTo(R * 0.91, s); c.moveTo(R * 0.87, 0); c.lineTo(R * 0.95, 0); c.stroke(); }
      c.restore();
    }
    c.restore();
    // counter-rotating eight-point seal (two intersecting squares)
    c.save(); c.rotate(-spin * 1.4);
    const hs = R * 0.56;
    for (const k of [0, Math.PI / 4]) {
      c.save(); c.rotate(k);
      c.beginPath(); c.rect(-hs, -hs, hs * 2, hs * 2); c.strokeStyle = rgba(color, 0.85); c.lineWidth = lw; c.stroke();
      c.restore();
    }
    c.restore();
    ring(R * 0.5, 0.8);
    // spinning inner diamond
    c.save(); c.rotate(spin * 2.2);
    c.beginPath(); c.moveTo(0, -R * 0.42); c.lineTo(R * 0.42, 0); c.lineTo(0, R * 0.42); c.lineTo(-R * 0.42, 0); c.closePath();
    c.strokeStyle = rgba(color, 0.9); c.lineWidth = lw; c.stroke();
    c.restore();
    ring(R * 0.24, 0.75);
    c.restore();
    h.glowOrb(cx, cy, R * 0.32 * (0.8 + 0.35 * p), color);
  }

  SG.THEMES.superhero = {
    id: "superhero",
    name: { en: "Superhuman Legion", fr: "Légion Surhumaine", zh: "超能军团", ar: "فيلق الخارقين" },
    description: {
      en: "Powered armor, star-forged shields, mystic mandalas and thunder hammers of legendary champions.",
      fr: "Armures assistées, boucliers forgés aux étoiles, mandalas mystiques et marteaux de foudre de champions légendaires.",
      zh: "动力战甲、星铸坚盾、秘术光轮与雷霆战锤的传奇英雄。",
      ar: "دروع معززة، تروس مصهورة من النجوم، ماندالا سحرية ومطارق رعدية لأبطال أسطوريين.",
    },
    painters: {
      /* Shield Commander — winged battle cowl, chevron scale armor, concentric star aegis, tactical baton. */
      sovereign(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, pulse, rr, rgba, head, energyBlade } = h;
        const SIL = (x0, y0, x1, y1) => metal(x0, y0, x1, y1, ...SILVER);
        // legs + leather boots
        for (const sx of [-1, 1]) {
          poly([sx * 0.05, 0.46, sx * 0.33, 0.46, sx * 0.33, 0.9, sx * 0.07, 0.9]); fillInk(pal.deep, 2.2);
          poly([sx * 0.05, 0.84, sx * 0.35, 0.84, sx * 0.37, 1.15, sx * 0.03, 1.15]); fillInk(metal(sx * r * 0.03, 0, sx * r * 0.37, 0, ...LEATHER), 1.8);
        }
        // torso with chevron scale armor
        const torso = () => {
          c.beginPath(); c.moveTo(-r * 0.5, -r * 0.36);
          c.quadraticCurveTo(-r * 0.58, -r * 0.05, -r * 0.36, r * 0.52); c.lineTo(r * 0.36, r * 0.52);
          c.quadraticCurveTo(r * 0.58, -r * 0.05, r * 0.5, -r * 0.36);
          c.quadraticCurveTo(0, -r * 0.46, -r * 0.5, -r * 0.36); c.closePath();
        };
        torso(); fillInk(bodyGrad, 2.5); c.shadowBlur = 0; // drop shadow only on the base silhouette; inner details skip the blur
        c.save(); torso(); c.clip();
        for (let i = 0; i < 6; i++) {
          const y = -r * 0.3 + i * r * 0.15;
          c.beginPath(); c.moveTo(-r * 0.6, y); c.lineTo(0, y + r * 0.12); c.lineTo(r * 0.6, y);
          c.strokeStyle = "rgba(11,7,16,0.38)"; c.lineWidth = 1.4; c.stroke();
          c.beginPath(); c.moveTo(-r * 0.6, y + 1.4); c.lineTo(0, y + r * 0.12 + 1.4); c.lineTo(r * 0.6, y + 1.4);
          c.strokeStyle = rgba(pal.rim, 0.3); c.lineWidth = 1; c.stroke();
        }
        const sheen = c.createLinearGradient(-r * 0.5, -r * 0.4, r * 0.2, r * 0.2);
        sheen.addColorStop(0, "rgba(255,255,255,0.24)"); sheen.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = sheen; c.fillRect(-r * 0.6, -r * 0.5, r * 1.2, r * 1.1);
        c.restore();
        heroStar(c, 0, -r * 0.12, r * 0.15); fillInk(SIL(-r * 0.15, -r * 0.27, r * 0.15, r * 0.03), 1.4);
        // utility belt
        rr(-r * 0.38, r * 0.4, r * 0.76, r * 0.13, r * 0.03); fillInk(metal(-r * 0.38, 0, r * 0.38, 0, "#f2e2a6", pal.gold, "#6e521c"), 1.5);
        rr(-r * 0.08, r * 0.385, r * 0.16, r * 0.16, r * 0.03); fillInk(SIL(-r * 0.08, r * 0.38, r * 0.08, r * 0.55), 1.2);
        // shield arm (behind the aegis)
        heroLimb(c, h, -r * 0.46, -r * 0.28, -r * 0.74, -r * 0.1, -r * 0.62, r * 0.12, Math.max(3, r * 0.2), pal.mid);
        // concentric star-forged aegis with central star
        const ax = -r * 0.62, ay = r * 0.14, R = r * 0.5;
        c.beginPath(); c.arc(ax, ay, R, 0, TAU); fillInk(metal(ax - R, ay - R, ax + R, ay + R, pal.bright, pal.mid, pal.deep), 2.4);
        c.beginPath(); c.arc(ax, ay, R * 0.78, 0, TAU); fillInk(SIL(ax - R, ay - R, ax + R, ay + R), 1.2);
        c.beginPath(); c.arc(ax, ay, R * 0.58, 0, TAU); fillInk(metal(ax - R, ay - R, ax + R, ay + R, pal.bright, pal.mid, pal.deep), 1.2);
        const core = c.createRadialGradient(ax - R * 0.1, ay - R * 0.1, 0, ax, ay, R * 0.4);
        core.addColorStop(0, pal.mid); core.addColorStop(1, pal.deep);
        c.beginPath(); c.arc(ax, ay, R * 0.38, 0, TAU); fillInk(core, 1.2);
        heroStar(c, ax, ay, R * 0.33); fillInk(SIL(ax - R * 0.3, ay - R * 0.3, ax + R * 0.3, ay + R * 0.3), 1.1);
        c.save();
        c.beginPath(); c.arc(ax, ay, R, 0, TAU); c.clip();
        const sg = c.createRadialGradient(ax - R * 0.45, ay - R * 0.5, 0, ax - R * 0.2, ay - R * 0.2, R * 1.3);
        sg.addColorStop(0, "rgba(255,255,255,0.55)"); sg.addColorStop(0.35, "rgba(255,255,255,0.08)"); sg.addColorStop(1, "rgba(0,0,0,0.3)");
        c.fillStyle = sg; c.fillRect(ax - R, ay - R, R * 2, R * 2);
        c.restore();
        glowOrb(ax + Math.cos(-2.3) * R * 0.88, ay + Math.sin(-2.3) * R * 0.88, r * 0.1 * (0.6 + 0.8 * pulse(520)), "#ffffff");
        // baton arm + electrified tactical baton
        heroLimb(c, h, r * 0.46, -r * 0.28, r * 0.84, -r * 0.12, r * 0.64, r * 0.18, Math.max(3, r * 0.2), pal.mid);
        const b0x = r * 0.5, b0y = r * 0.44, b1x = r * 0.92, b1y = -r * 0.4, bw = Math.max(2.4, r * 0.09);
        c.beginPath(); c.moveTo(b0x, b0y); c.lineTo(b1x, b1y);
        c.strokeStyle = h.INK; c.lineWidth = bw + 2.4; c.stroke();
        c.strokeStyle = metal(b0x - r * 0.06, b0y, b0x + r * 0.06, b0y, ...GUNMETAL); c.lineWidth = bw; c.stroke();
        energyBlade(r * 0.84, -r * 0.24, b1x, b1y, Math.max(1.6, r * 0.065), pal.bright);
        glowOrb(b1x, b1y, r * 0.12 * (0.8 + 0.4 * pulse(160)), pal.bright);
        c.beginPath(); c.arc(r * 0.64, r * 0.18, r * 0.12, 0, TAU); fillInk(metal(r * 0.52, 0, r * 0.76, 0, ...LEATHER), 1.6);
        c.beginPath(); c.moveTo(r * 0.56, r * 0.14); c.lineTo(r * 0.72, r * 0.14); c.strokeStyle = "rgba(11,7,16,0.5)"; c.lineWidth = 1; c.stroke();
        // neck, face, winged battle cowl
        rr(-r * 0.1, -r * 0.5, r * 0.2, r * 0.16, r * 0.04); fillInk(pal.deep, 1.6);
        head(0, -r * 0.66, r * 0.26, HERO_SKIN);
        for (const sx of [-1, 1]) {
          poly([sx * 0.26, -0.8, sx * 0.44, -0.98, sx * 0.42, -0.9, sx * 0.54, -0.92, sx * 0.46, -0.82, sx * 0.56, -0.8, sx * 0.42, -0.72, sx * 0.28, -0.66]);
          fillInk(SIL(sx * r * 0.26, -r * 0.98, sx * r * 0.56, -r * 0.66), 1.5);
          c.beginPath(); c.moveTo(sx * r * 0.3, -r * 0.77); c.lineTo(sx * r * 0.44, -r * 0.87); c.moveTo(sx * r * 0.3, -r * 0.72); c.lineTo(sx * r * 0.48, -r * 0.79);
          c.strokeStyle = "rgba(11,7,16,0.45)"; c.lineWidth = 1; c.stroke();
        }
        const cowl = c.createLinearGradient(0, -r * 1.02, 0, -r * 0.5);
        cowl.addColorStop(0, pal.bright); cowl.addColorStop(0.45, pal.mid); cowl.addColorStop(1, pal.deep);
        c.beginPath(); c.moveTo(-r * 0.27, -r * 0.52); c.lineTo(-r * 0.29, -r * 0.78);
        c.quadraticCurveTo(-r * 0.27, -r * 1.0, 0, -r * 1.01); c.quadraticCurveTo(r * 0.27, -r * 1.0, r * 0.29, -r * 0.78);
        c.lineTo(r * 0.27, -r * 0.52); c.lineTo(r * 0.17, -r * 0.57);
        c.quadraticCurveTo(0, -r * 0.6, -r * 0.17, -r * 0.57); c.closePath(); fillInk(cowl, 2.2);
        poly([0, -0.97, 0.08, -0.8, 0.04, -0.8, 0, -0.89, -0.04, -0.8, -0.08, -0.8]); fillInk(SIL(-r * 0.08, -r * 0.97, r * 0.08, -r * 0.8), 1);
        for (const sx of [-1, 1]) {
          c.beginPath(); c.ellipse(sx * r * 0.1, -r * 0.69, r * 0.075, r * 0.04, sx * 0.15, 0, TAU); fillInk(HERO_SKIN, 1.2);
          c.beginPath(); c.arc(sx * r * 0.09, -r * 0.69, r * 0.025, 0, TAU); c.fillStyle = h.INK; c.fill();
        }
        c.beginPath(); c.moveTo(-r * 0.06, -r * 0.47); c.lineTo(r * 0.06, -r * 0.47); c.strokeStyle = "rgba(11,7,16,0.6)"; c.lineWidth = 1.2; c.stroke();
      },

      /* Web Phantom — arachnid cowl with big white lenses, web-weave suit, dual electrified stun batons. */
      reaper(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, metal, glowOrb, pulse, rgba } = h;
        const WEB = "rgba(11,7,16,0.5)", lw = Math.max(3, r * 0.19);
        // crouched acrobat legs
        for (const sx of [-1, 1]) {
          heroLimb(c, h, sx * r * 0.16, r * 0.42, sx * r * 0.74, r * 0.62, sx * r * 0.5, r * 1.08, lw, pal.mid);
          c.beginPath(); c.ellipse(sx * r * 0.54, r * 1.1, r * 0.13, r * 0.07, 0, 0, TAU); fillInk(pal.deep, 1.6);
        }
        const torso = () => {
          c.beginPath(); c.moveTo(-r * 0.44, -r * 0.38);
          c.quadraticCurveTo(-r * 0.5, 0, -r * 0.24, r * 0.5); c.lineTo(r * 0.24, r * 0.5);
          c.quadraticCurveTo(r * 0.5, 0, r * 0.44, -r * 0.38);
          c.quadraticCurveTo(0, -r * 0.48, -r * 0.44, -r * 0.38); c.closePath();
        };
        torso(); fillInk(bodyGrad, 2.4); c.shadowBlur = 0; // drop shadow only on the base silhouette; inner details skip the blur
        // dark side panels + web weave across chest and shoulders (clipped)
        c.save(); torso(); c.clip();
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(sx * r * 0.5, -r * 0.08); c.quadraticCurveTo(sx * r * 0.22, r * 0.2, sx * r * 0.16, r * 0.55);
          c.lineTo(sx * r * 0.6, r * 0.55); c.closePath(); c.fillStyle = rgba(pal.deep, 0.85); c.fill();
        }
        const wx = 0, wy = -r * 0.14;
        c.strokeStyle = WEB; c.lineWidth = 0.9;
        for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; c.beginPath(); c.moveTo(wx, wy); c.lineTo(wx + Math.cos(a) * r, wy + Math.sin(a) * r); c.stroke(); }
        for (const rad of [0.17, 0.32, 0.5]) {
          c.beginPath();
          for (let i = 0; i < 10; i++) {
            const a0 = i * Math.PI / 5, a1 = (i + 1) * Math.PI / 5, am = (a0 + a1) / 2, R0 = rad * r, Rm = R0 * 0.82;
            c.moveTo(wx + Math.cos(a0) * R0, wy + Math.sin(a0) * R0);
            c.quadraticCurveTo(wx + Math.cos(am) * Rm, wy + Math.sin(am) * Rm, wx + Math.cos(a1) * R0, wy + Math.sin(a1) * R0);
          }
          c.stroke();
        }
        c.restore();
        // arachnid chest emblem
        c.fillStyle = h.INK;
        c.beginPath(); c.ellipse(0, -r * 0.08, r * 0.05, r * 0.08, 0, 0, TAU); c.fill();
        c.beginPath(); c.arc(0, -r * 0.19, r * 0.035, 0, TAU); c.fill();
        c.strokeStyle = h.INK; c.lineWidth = 1.1;
        const ex = [0.11, 0.12, 0.12, 0.11], ey = [-0.26, -0.2, -0.04, 0.02], fx = [0.13, 0.17, 0.17, 0.13], fy = [-0.34, -0.24, 0.06, 0.16];
        for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
          c.beginPath(); c.moveTo(sx * r * 0.03, -r * (0.16 - k * 0.04)); c.lineTo(sx * r * ex[k], r * ey[k]); c.lineTo(sx * r * fx[k], r * fy[k]); c.stroke();
        }
        // arms + dual electrified stun batons
        for (const sx of [-1, 1]) {
          heroLimb(c, h, sx * r * 0.4, -r * 0.3, sx * r * 0.82, -r * 0.24, sx * r * 0.7, r * 0.18, Math.max(2.6, r * 0.16), pal.mid);
          const b0x = sx * r * 0.56, b0y = r * 0.42, b1x = sx * r * 1.0, b1y = -r * 0.36, bw = Math.max(2.2, r * 0.085);
          c.beginPath(); c.moveTo(b0x, b0y); c.lineTo(b1x, b1y);
          c.strokeStyle = h.INK; c.lineWidth = bw + 2.4; c.stroke();
          c.strokeStyle = metal(b0x - r * 0.05, b0y, b0x + r * 0.05, b0y, ...GUNMETAL); c.lineWidth = bw; c.stroke();
          const mx = sx * r * 0.82, my = -r * 0.04;
          heroBolt(c, h, ts, mx, my, b1x, b1y, Math.max(0.9, r * 0.035), pal.bright, sx > 0 ? 11 : 23, 4, r * 0.07);
          heroBolt(c, h, ts, b1x, b1y, b1x + sx * r * 0.16, b1y + r * 0.24, Math.max(0.8, r * 0.03), pal.bright, sx > 0 ? 31 : 47, 3, r * 0.05);
          glowOrb(b1x, b1y, r * 0.13 * (0.75 + 0.45 * pulse(90, sx)), pal.bright);
          c.beginPath(); c.arc(sx * r * 0.7, r * 0.18, r * 0.1, 0, TAU); fillInk(pal.deep, 1.5);
        }
        // arachnid cowl with web lines and big white reflective lenses
        const mg = c.createRadialGradient(-r * 0.1, -r * 0.84, r * 0.02, 0, -r * 0.72, r * 0.38);
        mg.addColorStop(0, pal.bright); mg.addColorStop(0.55, pal.mid); mg.addColorStop(1, pal.deep);
        const mask = () => { c.beginPath(); c.ellipse(0, -r * 0.72, r * 0.29, r * 0.34, 0, 0, TAU); };
        mask(); fillInk(mg, 2.3);
        c.save(); mask(); c.clip();
        const mx0 = 0, my0 = -r * 0.62;
        c.strokeStyle = WEB; c.lineWidth = 0.8;
        for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.beginPath(); c.moveTo(mx0, my0); c.lineTo(mx0 + Math.cos(a) * r * 0.5, my0 + Math.sin(a) * r * 0.5); c.stroke(); }
        for (const rad of [0.12, 0.24, 0.36]) {
          c.beginPath();
          for (let i = 0; i < 12; i++) {
            const a0 = i * Math.PI / 6, a1 = (i + 1) * Math.PI / 6, am = (a0 + a1) / 2, R0 = rad * r, Rm = R0 * 0.85;
            c.moveTo(mx0 + Math.cos(a0) * R0, my0 + Math.sin(a0) * R0);
            c.quadraticCurveTo(mx0 + Math.cos(am) * Rm, my0 + Math.sin(am) * Rm, mx0 + Math.cos(a1) * R0, my0 + Math.sin(a1) * R0);
          }
          c.stroke();
        }
        c.restore();
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(sx * r * 0.035, -r * 0.64);
          c.quadraticCurveTo(sx * r * 0.04, -r * 0.87, sx * r * 0.25, -r * 0.86);
          c.quadraticCurveTo(sx * r * 0.26, -r * 0.68, sx * r * 0.035, -r * 0.64); c.closePath();
          const lg = c.createLinearGradient(sx * r * 0.05, -r * 0.86, sx * r * 0.25, -r * 0.64);
          lg.addColorStop(0, "#ffffff"); lg.addColorStop(0.55, "#e3ebf4"); lg.addColorStop(1, "#a9b6c6");
          fillInk(lg, Math.max(2.6, r * 0.07));
          c.beginPath(); c.moveTo(sx * r * 0.09, -r * 0.79); c.lineTo(sx * r * 0.17, -r * 0.82);
          c.strokeStyle = "rgba(255,255,255,0.95)"; c.lineWidth = 1.2; c.stroke();
          c.beginPath(); c.moveTo(sx * r * 0.1, -r * 0.7); c.lineTo(sx * r * 0.2, -r * 0.74);
          c.strokeStyle = rgba(pal.rim, 0.45 + 0.3 * pulse(700, sx)); c.lineWidth = 1; c.stroke();
        }
      },
      /* Arc-Reactor Ironclad — layered powered armor, slotted faceplate, hydraulic pauldrons, palm repulsors. */
      juggernaut(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, pulse, rr, rgba } = h;
        const GOLD = (x0, y0, x1, y1) => metal(x0, y0, x1, y1, "#fff1bf", pal.gold, "#7a5418");
        const TI = (x0, y0, x1, y1) => metal(x0, y0, x1, y1, "#eef1f5", "#a3abb8", "#4a515e");
        const ARMOR = (x0, y0, x1, y1) => metal(x0, y0, x1, y1, pal.rim, pal.mid, pal.deep);
        const p = pulse(240), pr = pulse(140, 1.1);
        // armored legs: crimson thighs, titanium knees, gold shins
        for (const sx of [-1, 1]) {
          poly([sx * 0.08, 0.5, sx * 0.4, 0.5, sx * 0.38, 0.84, sx * 0.1, 0.84]); fillInk(ARMOR(sx * r * 0.08, 0, sx * r * 0.4, 0), 2.2);
          poly([sx * 0.08, 0.86, sx * 0.4, 0.86, sx * 0.44, 1.15, sx * 0.04, 1.15]); fillInk(GOLD(sx * r * 0.04, 0, sx * r * 0.44, 0), 2);
          c.beginPath(); c.arc(sx * r * 0.24, r * 0.85, r * 0.09, 0, TAU); fillInk(TI(sx * r * 0.15, r * 0.76, sx * r * 0.33, r * 0.94), 1.4);
        }
        // arms angled out, palms forward with repulsor emitters
        for (const sx of [-1, 1]) {
          heroLimb(c, h, sx * r * 0.62, -r * 0.16, sx * r * 0.8, r * 0.02, sx * r * 0.8, r * 0.24, Math.max(3.4, r * 0.24), pal.mid);
          poly([sx * 0.68, 0.2, sx * 0.92, 0.16, sx * 1.02, 0.5, sx * 0.82, 0.54]); fillInk(ARMOR(sx * r * 0.68, r * 0.16, sx * r * 1.02, r * 0.54), 2);
          rr(sx > 0 ? r * 0.8 : -r * 1.04, r * 0.44, r * 0.24, r * 0.08, r * 0.03); fillInk(TI(0, r * 0.44, 0, r * 0.52), 1.2);
          const hx = sx * r * 0.95, hy = r * 0.62;
          c.beginPath(); c.arc(hx, hy, r * 0.13, 0, TAU); fillInk(TI(hx - r * 0.13, hy - r * 0.13, hx + r * 0.13, hy + r * 0.13), 1.6);
          c.beginPath(); c.arc(hx, hy, r * 0.075, 0, TAU); c.fillStyle = "#0c1a22"; c.fill();
          glowOrb(hx, hy, r * 0.13 * (0.75 + 0.55 * pr), ARC);
        }
        // hydraulic pistons from pauldrons to upper arms
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(sx * r * 0.56, -r * 0.04); c.lineTo(sx * r * 0.72, r * 0.2);
          c.strokeStyle = h.INK; c.lineWidth = 4.2; c.stroke(); c.strokeStyle = TI(sx * r * 0.56, 0, sx * r * 0.72, 0); c.lineWidth = 2.2; c.stroke();
          c.beginPath(); c.arc(sx * r * 0.72, r * 0.2, r * 0.035, 0, TAU); c.fillStyle = pal.gold; c.fill();
        }
        // armored torso, layered chest plates, segmented gold abdomen
        rr(-r * 0.6, -r * 0.42, r * 1.2, r * 1.0, r * 0.22); fillInk(bodyGrad, 2.8); c.shadowBlur = 0; // drop shadow only on the base silhouette; inner details skip the blur
        for (const sx of [-1, 1]) {
          poly([sx * 0.04, -0.34, sx * 0.52, -0.36, sx * 0.5, 0.04, sx * 0.2, 0.14, sx * 0.04, 0.06]);
          fillInk(ARMOR(sx * r * 0.04, -r * 0.36, sx * r * 0.52, r * 0.14), 1.8);
          c.beginPath(); c.moveTo(sx * r * 0.1, -r * 0.28); c.lineTo(sx * r * 0.46, -r * 0.3);
          c.strokeStyle = rgba(pal.rim, 0.5); c.lineWidth = 1; c.stroke();
        }
        for (let i = 0; i < 3; i++) { rr(-r * 0.24 + i * r * 0.02, r * 0.16 + i * r * 0.11, r * 0.48 - i * r * 0.04, r * 0.1, r * 0.03); fillInk(GOLD(-r * 0.24, 0, r * 0.24, 0), 1.3); }
        rr(-r * 0.5, r * 0.48, r * 1.0, r * 0.1, r * 0.03); fillInk(TI(0, r * 0.48, 0, r * 0.58), 1.4);
        // pulsing arc reactor
        const rx = 0, ry = -r * 0.1;
        c.beginPath(); c.arc(rx, ry, r * 0.17, 0, TAU); fillInk(TI(rx - r * 0.17, ry - r * 0.17, rx + r * 0.17, ry + r * 0.17), 1.8);
        c.beginPath(); c.arc(rx, ry, r * 0.12, 0, TAU); c.fillStyle = "#0c1a22"; c.fill();
        glowOrb(rx, ry, r * (0.16 + 0.1 * p), ARC);
        c.save();
        c.shadowBlur = 0; c.shadowColor = "transparent"; c.globalCompositeOperation = "lighter";
        c.strokeStyle = rgba(ARC, 0.9); c.lineWidth = 1;
        for (let i = 0; i < 10; i++) {
          const a = i * TAU / 10;
          c.beginPath(); c.moveTo(rx + Math.cos(a) * r * 0.075, ry + Math.sin(a) * r * 0.075); c.lineTo(rx + Math.cos(a) * r * 0.115, ry + Math.sin(a) * r * 0.115); c.stroke();
        }
        c.beginPath(); c.arc(rx, ry, r * (0.2 + 0.08 * p), 0, TAU); c.strokeStyle = rgba(ARC, 0.45 * (1 - p) + 0.1); c.lineWidth = 1.4; c.stroke();
        c.restore();
        c.beginPath(); c.arc(rx, ry, r * 0.04, 0, TAU); c.fillStyle = "#ffffff"; c.fill();
        // bulky layered hydraulic pauldrons
        for (const sx of [-1, 1]) {
          c.beginPath(); c.ellipse(sx * r * 0.68, -r * 0.26, r * 0.32, r * 0.25, sx * 0.25, 0, TAU);
          fillInk(ARMOR(sx * r * 0.38, -r * 0.52, sx * r * 0.98, r * 0.0), 2.4);
          c.beginPath(); c.ellipse(sx * r * 0.7, -r * 0.2, r * 0.24, r * 0.15, sx * 0.25, Math.PI * 1.05, Math.PI * 1.95);
          c.strokeStyle = "rgba(11,7,16,0.5)"; c.lineWidth = 1.3; c.stroke();
          c.beginPath(); c.ellipse(sx * r * 0.7, -r * 0.14, r * 0.24, r * 0.12, sx * 0.25, Math.PI * 0.1, Math.PI * 0.9);
          c.strokeStyle = pal.gold; c.lineWidth = 1.5; c.stroke();
          c.fillStyle = pal.gold; c.beginPath(); c.arc(sx * r * 0.86, -r * 0.3, r * 0.035, 0, TAU); c.fill();
        }
        // titanium collar
        rr(-r * 0.16, -r * 0.52, r * 0.32, r * 0.14, r * 0.04); fillInk(TI(0, -r * 0.52, 0, -r * 0.38), 1.5);
        // helmet shell + gold faceplate + slotted visor
        c.beginPath(); c.moveTo(-r * 0.3, -r * 0.5); c.lineTo(-r * 0.33, -r * 0.82);
        c.quadraticCurveTo(-r * 0.3, -r * 1.12, 0, -r * 1.13); c.quadraticCurveTo(r * 0.3, -r * 1.12, r * 0.33, -r * 0.82);
        c.lineTo(r * 0.3, -r * 0.5); c.lineTo(r * 0.14, -r * 0.4); c.lineTo(-r * 0.14, -r * 0.4); c.closePath();
        fillInk(ARMOR(-r * 0.33, -r * 1.13, r * 0.33, -r * 0.4), 2.4);
        poly([-0.22, -0.88, -0.1, -0.88, -0.07, -1.03, 0.07, -1.03, 0.1, -0.88, 0.22, -0.88, 0.25, -0.66, 0.15, -0.48, 0.07, -0.43, -0.07, -0.43, -0.15, -0.48, -0.25, -0.66]);
        fillInk(GOLD(-r * 0.25, -r * 1.03, r * 0.25, -r * 0.42), 1.6);
        glowSlit(c, h, [-0.2, -0.76, -0.05, -0.72, -0.06, -0.68, -0.19, -0.7], ARC);
        glowSlit(c, h, [0.2, -0.76, 0.05, -0.72, 0.06, -0.68, 0.19, -0.7], ARC);
        c.strokeStyle = h.INK; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(-r * 0.1, -r * 0.52); c.lineTo(r * 0.1, -r * 0.52); c.stroke();
        c.strokeStyle = "rgba(11,7,16,0.55)"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.64); c.lineTo(-r * 0.12, -r * 0.55); c.moveTo(r * 0.22, -r * 0.64); c.lineTo(r * 0.12, -r * 0.55); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.26, -r * 0.94); c.quadraticCurveTo(-r * 0.2, -r * 1.06, -r * 0.08, -r * 1.08); c.strokeStyle = "rgba(255,255,255,0.5)"; c.lineWidth = 1.2; c.stroke();
      },

      /* Mystic Sorcerer — levitation cloak, high flared collar, eye talisman, twin spellcasting mandalas. */
      trickster(c, pal, r, ts, h) {
        const { fillInk, poly, metal, glowOrb, pulse, rgba, rr, head, robe, eyes } = h;
        const p = pulse(300), bob = ts ? Math.sin(ts / 520) * r * 0.05 : 0, wv = ts ? Math.sin(ts / 340) * r * 0.05 : 0;
        // levitation aura on the floor (does not bob)
        c.save();
        c.shadowBlur = 0; c.shadowColor = "transparent"; c.globalCompositeOperation = "lighter";
        const ag = c.createRadialGradient(0, r * 1.14, 0, 0, r * 1.14, r * 0.62);
        ag.addColorStop(0, rgba(ELDRITCH, 0.4 + 0.2 * p)); ag.addColorStop(1, rgba(ELDRITCH, 0));
        c.fillStyle = ag; c.beginPath(); c.ellipse(0, r * 1.14, r * 0.62, r * 0.13, 0, 0, TAU); c.fill();
        c.restore();
        c.save(); c.translate(0, bob);
        // flowing levitation cloak with rippling hem
        const cloak = c.createLinearGradient(0, -r * 0.5, 0, r * 1.1);
        cloak.addColorStop(0, pal.bright); cloak.addColorStop(0.4, pal.mid); cloak.addColorStop(1, pal.deep);
        c.beginPath(); c.moveTo(-r * 0.34, -r * 0.42);
        c.quadraticCurveTo(-r * 0.9, r * 0.2, -r * 0.98, r * 0.98 + wv);
        c.quadraticCurveTo(-r * 0.74, r * 0.86, -r * 0.6, r * 1.06 - wv);
        c.quadraticCurveTo(-r * 0.4, r * 0.92, -r * 0.22, r * 1.1 + wv);
        c.quadraticCurveTo(0, r * 0.96, r * 0.22, r * 1.1 - wv);
        c.quadraticCurveTo(r * 0.4, r * 0.92, r * 0.6, r * 1.06 + wv);
        c.quadraticCurveTo(r * 0.74, r * 0.86, r * 0.98, r * 0.98 - wv);
        c.quadraticCurveTo(r * 0.9, r * 0.2, r * 0.34, -r * 0.42); c.closePath(); fillInk(cloak, 2.4); c.shadowBlur = 0; // drop shadow only on the base silhouette; inner details skip the blur
        c.strokeStyle = "rgba(11,7,16,0.28)"; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(-r * 0.4, -r * 0.1); c.quadraticCurveTo(-r * 0.62, r * 0.5, -r * 0.6, r * 1.0);
        c.moveTo(r * 0.4, -r * 0.1); c.quadraticCurveTo(r * 0.62, r * 0.5, r * 0.6, r * 1.0); c.stroke();
        // wrapped mystic tunic with leather belt and gold clasps
        const tunic = c.createLinearGradient(0, -r * 0.42, 0, r * 1.0);
        tunic.addColorStop(0, "#3c4c7c"); tunic.addColorStop(1, "#151a32");
        robe(r * 0.3, r * 0.42, -r * 0.42, r * 1.0, tunic);
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.4); c.lineTo(r * 0.14, r * 0.3); c.strokeStyle = "rgba(11,7,16,0.5)"; c.lineWidth = 1.3; c.stroke();
        rr(-r * 0.34, r * 0.28, r * 0.68, r * 0.12, r * 0.03); fillInk(metal(0, r * 0.28, 0, r * 0.4, ...LEATHER), 1.4);
        for (const x of [-0.2, 0, 0.2]) { c.beginPath(); c.arc(x * r, r * 0.34, r * 0.04, 0, TAU); fillInk(pal.gold, 1); }
        // outstretched spellcasting arms
        for (const sx of [-1, 1]) heroLimb(c, h, sx * r * 0.28, -r * 0.34, sx * r * 0.55, -r * 0.38, sx * r * 0.74, -r * 0.12, Math.max(2.8, r * 0.17), "#2c3864");
        // eldritch mandalas flanking the hands
        heroMandala(c, h, ts, -r * 0.8, -r * 0.1, r * 0.36, ELDRITCH, 1);
        heroMandala(c, h, ts, r * 0.8, -r * 0.1, r * 0.36, ELDRITCH, -1);
        // casting hands: thumb, index and pinky extended
        const fInk = Math.max(2.6, r * 0.11), fSkin = fInk - 1.6;
        for (const sx of [-1, 1]) {
          const hx = sx * r * 0.8, hy = -r * 0.1;
          for (const a of [-0.95, -0.35, 0.25, 0.85]) {
            const len = r * (a === 0.25 ? 0.07 : 0.13), fx = hx + sx * Math.cos(a) * len, fy = hy + Math.sin(a) * len;
            c.beginPath(); c.moveTo(hx, hy); c.lineTo(fx, fy);
            c.strokeStyle = h.INK; c.lineWidth = fInk; c.stroke(); c.strokeStyle = HERO_SKIN; c.lineWidth = fSkin; c.stroke();
          }
          c.beginPath(); c.arc(hx, hy, r * 0.085, 0, TAU); fillInk(HERO_SKIN, 1.4);
          glowOrb(hx, hy, r * 0.12, ELDRITCH);
        }
        // high flared collar framing the head
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(sx * r * 0.08, -r * 0.42); c.lineTo(sx * r * 0.36, -r * 0.44);
          c.quadraticCurveTo(sx * r * 0.5, -r * 0.7, sx * r * 0.5, -r * 1.02);
          c.quadraticCurveTo(sx * r * 0.36, -r * 0.88, sx * r * 0.2, -r * 0.82);
          c.quadraticCurveTo(sx * r * 0.18, -r * 0.6, sx * r * 0.08, -r * 0.42); c.closePath();
          fillInk(metal(sx * r * 0.08, -r * 1.02, sx * r * 0.5, -r * 0.42, pal.bright, pal.mid, pal.deep), 2);
          c.beginPath(); c.moveTo(sx * r * 0.14, -r * 0.46); c.quadraticCurveTo(sx * r * 0.24, -r * 0.66, sx * r * 0.44, -r * 0.94);
          c.strokeStyle = pal.gold; c.lineWidth = 1.3; c.stroke();
        }
        // head: swept dark hair with silver temples, goatee
        head(0, -r * 0.66, r * 0.22, HERO_SKIN);
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.68); c.quadraticCurveTo(-r * 0.26, -r * 0.92, 0, -r * 0.92);
        c.quadraticCurveTo(r * 0.26, -r * 0.92, r * 0.22, -r * 0.68); c.quadraticCurveTo(r * 0.14, -r * 0.8, 0, -r * 0.8);
        c.quadraticCurveTo(-r * 0.14, -r * 0.8, -r * 0.22, -r * 0.68); c.closePath(); fillInk("#2a1d18", 1.4);
        c.strokeStyle = "#d9d9de"; c.lineWidth = 1.4;
        for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * r * 0.2, -r * 0.82); c.quadraticCurveTo(sx * r * 0.23, -r * 0.76, sx * r * 0.21, -r * 0.69); c.stroke(); }
        eyes(0, -r * 0.67, r * 0.08, r * 0.025, h.INK);
        c.strokeStyle = h.INK; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(-r * 0.13, -r * 0.73); c.lineTo(-r * 0.04, -r * 0.71); c.moveTo(r * 0.13, -r * 0.73); c.lineTo(r * 0.04, -r * 0.71); c.stroke();
        poly([-0.09, -0.56, 0, -0.58, 0.09, -0.56, 0.05, -0.53, 0.03, -0.46, 0, -0.43, -0.03, -0.46, -0.05, -0.53]); c.fillStyle = "#2a1d18"; c.fill();
        // eye talisman amulet on a gold chain
        c.beginPath(); c.moveTo(-r * 0.14, -r * 0.42); c.quadraticCurveTo(-r * 0.1, -r * 0.28, 0, -r * 0.27);
        c.quadraticCurveTo(r * 0.1, -r * 0.28, r * 0.14, -r * 0.42); c.strokeStyle = pal.gold; c.lineWidth = 1.2; c.stroke();
        c.beginPath(); c.ellipse(0, -r * 0.19, r * 0.13, r * 0.09, 0, 0, TAU); fillInk(metal(-r * 0.13, -r * 0.28, r * 0.13, -r * 0.1, "#fff1bf", pal.gold, "#7a5418"), 1.4);
        c.beginPath(); c.moveTo(-r * 0.1, -r * 0.19); c.quadraticCurveTo(0, -r * 0.27, r * 0.1, -r * 0.19); c.quadraticCurveTo(0, -r * 0.11, -r * 0.1, -r * 0.19); c.closePath();
        c.fillStyle = VOID; c.fill();
        glowOrb(0, -r * 0.19, r * 0.08 * (0.8 + 0.5 * p), "#7dffa8");
        c.restore();
      },
      /* Thunder Vanguard — Norse winged helm, flowing cape on shoulder discs, raised storm hammer. */
      wildrider(c, pal, r, ts, h) {
        const { fillInk, poly, metal, glowOrb, pulse, rgba, rr, head, eyes } = h;
        const SIL = (x0, y0, x1, y1) => metal(x0, y0, x1, y1, ...SILVER);
        const p = pulse(180), wv = ts ? Math.sin(ts / 380) * r * 0.05 : 0, bw = Math.max(1, r * 0.045);
        // flowing cape (behind)
        const cape = c.createLinearGradient(0, -r * 0.4, 0, r * 1.1);
        cape.addColorStop(0, pal.mid); cape.addColorStop(1, pal.deep);
        c.beginPath(); c.moveTo(-r * 0.36, -r * 0.38); c.lineTo(r * 0.36, -r * 0.38);
        c.quadraticCurveTo(r * 0.66, r * 0.3, r * 0.62, r * 1.1);
        c.quadraticCurveTo(r * 0.3, r * 1.0 + wv, 0, r * 1.14);
        c.quadraticCurveTo(-r * 0.5, r * 1.02 - wv, -r * 1.04, r * 1.0 + wv);
        c.quadraticCurveTo(-r * 0.86, r * 0.3, -r * 0.36, -r * 0.38); c.closePath(); fillInk(cape, 2.4); c.shadowBlur = 0; // drop shadow only on the base silhouette; inner details skip the blur
        c.strokeStyle = "rgba(11,7,16,0.28)"; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(-r * 0.4, -r * 0.2); c.quadraticCurveTo(-r * 0.7, r * 0.4, -r * 0.72, r * 0.98);
        c.moveTo(r * 0.42, -r * 0.1); c.quadraticCurveTo(r * 0.56, r * 0.5, r * 0.5, r * 1.04); c.stroke();
        // legs + boots
        for (const sx of [-1, 1]) {
          poly([sx * 0.05, 0.46, sx * 0.3, 0.46, sx * 0.32, 0.9, sx * 0.07, 0.9]); fillInk("#26242e", 2.1);
          poly([sx * 0.05, 0.84, sx * 0.34, 0.84, sx * 0.36, 1.15, sx * 0.03, 1.15]); fillInk(metal(sx * r * 0.03, 0, sx * r * 0.36, 0, ...LEATHER), 1.8);
        }
        // dark armored tunic with rows of silver discs
        const tun = c.createLinearGradient(0, -r * 0.4, 0, r * 0.55);
        tun.addColorStop(0, pal.deep); tun.addColorStop(1, "#121018");
        c.beginPath(); c.moveTo(-r * 0.42, -r * 0.38); c.quadraticCurveTo(-r * 0.5, 0, -r * 0.3, r * 0.52); c.lineTo(r * 0.3, r * 0.52);
        c.quadraticCurveTo(r * 0.5, 0, r * 0.42, -r * 0.38); c.quadraticCurveTo(0, -r * 0.46, -r * 0.42, -r * 0.38); c.closePath(); fillInk(tun, 2.4);
        for (const sx of [-1, 1]) for (const y of [-0.2, 0.0, 0.2]) {
          c.beginPath(); c.arc(sx * r * 0.15, y * r, r * 0.065, 0, TAU); fillInk(SIL(sx * r * 0.09, (y - 0.06) * r, sx * r * 0.21, (y + 0.06) * r), 1.1);
          c.beginPath(); c.arc(sx * r * 0.15, y * r, r * 0.03, 0, TAU); c.strokeStyle = "rgba(11,7,16,0.5)"; c.lineWidth = 0.8; c.stroke();
        }
        rr(-r * 0.32, r * 0.36, r * 0.64, r * 0.12, r * 0.03); fillInk(metal(0, r * 0.36, 0, r * 0.48, ...LEATHER), 1.4);
        rr(-r * 0.07, r * 0.345, r * 0.14, r * 0.15, r * 0.03); fillInk(SIL(-r * 0.07, r * 0.34, r * 0.07, r * 0.5), 1.1);
        // left arm down, bare with vambrace and fist
        heroLimb(c, h, -r * 0.42, -r * 0.3, -r * 0.64, 0, -r * 0.56, r * 0.36, Math.max(3, r * 0.2), HERO_SKIN);
        heroLimb(c, h, -r * 0.6, r * 0.14, -r * 0.6, r * 0.2, -r * 0.57, r * 0.28, Math.max(3.4, r * 0.22), SIL(-r * 0.7, 0, -r * 0.46, 0));
        c.beginPath(); c.arc(-r * 0.56, r * 0.38, r * 0.1, 0, TAU); fillInk(HERO_SKIN, 1.5);
        // shoulder medallion discs where the cape fastens
        for (const sx of [-1, 1]) {
          c.beginPath(); c.arc(sx * r * 0.36, -r * 0.32, r * 0.11, 0, TAU); fillInk(SIL(sx * r * 0.25, -r * 0.43, sx * r * 0.47, -r * 0.21), 1.6);
          c.beginPath(); c.arc(sx * r * 0.36, -r * 0.32, r * 0.065, 0, TAU); c.strokeStyle = "rgba(11,7,16,0.5)"; c.lineWidth = 1; c.stroke();
          c.beginPath(); c.arc(sx * r * 0.36, -r * 0.32, r * 0.03, 0, TAU); c.fillStyle = pal.gold; c.fill();
        }
        // long flowing hair, face, short beard
        const hair = c.createLinearGradient(0, -r * 0.9, 0, -r * 0.2);
        hair.addColorStop(0, "#f4d27a"); hair.addColorStop(1, "#a8792e");
        c.beginPath(); c.moveTo(-r * 0.24, -r * 0.74); c.quadraticCurveTo(-r * 0.34, -r * 0.46, -r * 0.4, -r * 0.26);
        c.lineTo(-r * 0.16, -r * 0.34); c.lineTo(r * 0.16, -r * 0.34); c.lineTo(r * 0.4, -r * 0.26);
        c.quadraticCurveTo(r * 0.34, -r * 0.46, r * 0.24, -r * 0.74); c.closePath(); fillInk(hair, 1.8);
        head(0, -r * 0.62, r * 0.23, HERO_SKIN);
        c.beginPath(); c.moveTo(-r * 0.21, -r * 0.62); c.quadraticCurveTo(-r * 0.2, -r * 0.4, 0, -r * 0.36);
        c.quadraticCurveTo(r * 0.2, -r * 0.4, r * 0.21, -r * 0.62); c.quadraticCurveTo(r * 0.12, -r * 0.5, 0, -r * 0.5);
        c.quadraticCurveTo(-r * 0.12, -r * 0.5, -r * 0.21, -r * 0.62); c.closePath(); fillInk(hair, 1.2);
        c.beginPath(); c.moveTo(-r * 0.05, -r * 0.46); c.lineTo(r * 0.05, -r * 0.46); c.strokeStyle = "rgba(11,7,16,0.65)"; c.lineWidth = 1.1; c.stroke();
        eyes(0, -r * 0.65, r * 0.08, r * 0.03, THUNDER);
        c.strokeStyle = h.INK; c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(-r * 0.14, -r * 0.71); c.lineTo(-r * 0.04, -r * 0.69); c.moveTo(r * 0.14, -r * 0.71); c.lineTo(r * 0.04, -r * 0.69); c.stroke();
        // Norse winged war helmet
        for (const sx of [-1, 1]) {
          poly([sx * 0.2, -0.76, sx * 0.3, -0.94, sx * 0.42, -1.08, sx * 0.41, -0.97, sx * 0.5, -0.99, sx * 0.43, -0.88, sx * 0.5, -0.85, sx * 0.37, -0.78, sx * 0.24, -0.7]);
          fillInk(SIL(sx * r * 0.2, -r * 1.08, sx * r * 0.5, -r * 0.7), 1.4);
          c.beginPath(); c.moveTo(sx * r * 0.26, -r * 0.8); c.lineTo(sx * r * 0.4, -r * 0.96); c.moveTo(sx * r * 0.28, -r * 0.76); c.lineTo(sx * r * 0.44, -r * 0.86);
          c.strokeStyle = "rgba(11,7,16,0.45)"; c.lineWidth = 0.9; c.stroke();
        }
        c.beginPath(); c.moveTo(-r * 0.25, -r * 0.7); c.quadraticCurveTo(-r * 0.26, -r * 0.94, 0, -r * 0.95);
        c.quadraticCurveTo(r * 0.26, -r * 0.94, r * 0.25, -r * 0.7); c.quadraticCurveTo(0, -r * 0.77, -r * 0.25, -r * 0.7); c.closePath();
        fillInk(SIL(-r * 0.25, -r * 0.95, r * 0.25, -r * 0.7), 2);
        c.beginPath(); c.moveTo(-r * 0.24, -r * 0.74); c.quadraticCurveTo(0, -r * 0.81, r * 0.24, -r * 0.74); c.strokeStyle = pal.gold; c.lineWidth = 1.6; c.stroke();
        // raised hammer arm
        heroLimb(c, h, r * 0.42, -r * 0.3, r * 0.68, -r * 0.36, r * 0.72, -r * 0.66, Math.max(3, r * 0.2), HERO_SKIN);
        heroLimb(c, h, r * 0.68, -r * 0.44, r * 0.7, -r * 0.5, r * 0.71, -r * 0.58, Math.max(3.4, r * 0.22), SIL(r * 0.6, 0, r * 0.82, 0));
        // storm hammer: handle from the fist up into a square head, perpendicular to the haft
        // head pulled ~0.085r inward along the haft so the fist still grips it; glow capped at 0.28r so the
        // halo (and every bolt below, incl. its outer glow stroke) stays within ±1.25r of the piece centre
        const hx = r * 0.81, hy = -r * 0.96, rot = Math.atan2(r * 0.12, r * 0.34);
        glowOrb(hx, hy, r * (0.2 + 0.08 * p), THUNDER);
        c.save();
        c.translate(hx, hy); c.rotate(rot);
        c.beginPath(); c.moveTo(0, r * 0.13); c.lineTo(0, r * 0.5);
        c.strokeStyle = h.INK; c.lineWidth = Math.max(3, r * 0.1) + 2.4; c.stroke();
        c.strokeStyle = metal(-r * 0.05, 0, r * 0.05, 0, ...LEATHER); c.lineWidth = Math.max(3, r * 0.1); c.stroke();
        c.strokeStyle = "rgba(11,7,16,0.55)"; c.lineWidth = 0.9;
        for (let i = 0; i < 4; i++) { const y = r * (0.2 + i * 0.07); c.beginPath(); c.moveTo(-r * 0.05, y); c.lineTo(r * 0.05, y + r * 0.03); c.stroke(); }
        c.beginPath(); c.arc(0, r * 0.53, r * 0.04, 0, TAU); fillInk(SIL(-r * 0.04, r * 0.5, r * 0.04, r * 0.56), 1);
        rr(-r * 0.22, -r * 0.13, r * 0.44, r * 0.26, r * 0.03); fillInk(SIL(-r * 0.22, -r * 0.13, r * 0.22, r * 0.13), 2.2);
        rr(-r * 0.16, -r * 0.08, r * 0.32, r * 0.16, r * 0.02); c.strokeStyle = "rgba(11,7,16,0.45)"; c.lineWidth = 1; c.stroke();
        for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 0.1, 0, r * 0.04, 0, TAU); c.stroke(); }
        c.beginPath(); c.moveTo(-r * 0.18, -r * 0.1); c.lineTo(r * 0.1, -r * 0.1); c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = 1.1; c.stroke();
        c.restore();
        c.beginPath(); c.arc(r * 0.72, -r * 0.68, r * 0.1, 0, TAU); fillInk(HERO_SKIN, 1.5);
        // branching lightning discharge
        // (endpoints + jitter + outer glow half-width 2·w kept ≤ 1.25r on both axes)
        heroBolt(c, h, ts, r * 0.98, -r * 1.04, r * 1.14, -r * 1.1, bw, THUNDER, 1, 3, r * 0.03);
        heroBolt(c, h, ts, r * 0.62, -r * 1.02, r * 0.3, -r * 1.08, bw, THUNDER, 2, 4, r * 0.04);
        const main = heroBolt(c, h, ts, r * 1.0, -r * 0.88, r * 1.1, -r * 0.38, bw * 1.1, THUNDER, 3, 5, r * 0.05);
        heroBolt(c, h, ts, main[2][0], main[2][1], r * 0.9, -r * 0.48, bw * 0.75, THUNDER, 4, 3);
        if (!ts || heroHash(Math.floor(ts / 140)) > 0.4) heroBolt(c, h, ts, r * 0.64, -r * 0.86, r * 0.5, -r * 0.6, bw * 0.7, THUNDER, 5, 3);
      },

      /* Sharpshooter — drawn compound bow, nocked plasma arrow, back quiver, asymmetric vest, HUD monocle. */
      skirmisher(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, pulse, rgba, rr, head, eyes, energyBlade } = h;
        const p = pulse(260), ay = -r * 0.16;
        // back quiver with fletched arrows over the right shoulder
        c.save();
        c.translate(r * 0.42, -r * 0.3); c.rotate(0.35);
        for (let k = 0; k < 3; k++) {
          const x = -r * 0.05 + k * r * 0.05;
          c.beginPath(); c.moveTo(x, -r * 0.5); c.lineTo(x, -r * 0.74); c.strokeStyle = h.INK; c.lineWidth = 2.4; c.stroke(); c.strokeStyle = "#c9ced8"; c.lineWidth = 1; c.stroke();
          c.beginPath(); c.moveTo(x, -r * 0.82); c.lineTo(x + r * 0.035, -r * 0.7); c.lineTo(x, -r * 0.66); c.lineTo(x - r * 0.035, -r * 0.7); c.closePath(); fillInk(k === 1 ? pal.bright : pal.mid, 1);
        }
        rr(-r * 0.1, -r * 0.55, r * 0.2, r * 0.95, r * 0.06); fillInk(metal(-r * 0.1, 0, r * 0.1, 0, ...LEATHER), 1.8);
        c.beginPath(); c.moveTo(-r * 0.1, -r * 0.42); c.lineTo(r * 0.1, -r * 0.42); c.strokeStyle = pal.gold; c.lineWidth = 1.4; c.stroke();
        c.restore();
        // wide archer stance
        for (const sx of [-1, 1]) {
          heroLimb(c, h, sx * r * 0.14, r * 0.46, sx * r * 0.3, r * 0.8, sx * r * 0.42, r * 1.06, Math.max(3, r * 0.19), pal.deep);
          c.beginPath(); c.ellipse(sx * r * 0.45, r * 1.1, r * 0.13, r * 0.065, 0, 0, TAU); fillInk(metal(sx * r * 0.32, 0, sx * r * 0.58, 0, ...LEATHER), 1.4);
        }
        // asymmetric archer vest: darker right panel, quiver strap, arrowhead emblem
        const torso = () => {
          c.beginPath(); c.moveTo(-r * 0.4, -r * 0.36);
          c.quadraticCurveTo(-r * 0.48, 0, -r * 0.26, r * 0.5); c.lineTo(r * 0.26, r * 0.5);
          c.quadraticCurveTo(r * 0.48, 0, r * 0.4, -r * 0.36);
          c.quadraticCurveTo(0, -r * 0.46, -r * 0.4, -r * 0.36); c.closePath();
        };
        torso(); fillInk(bodyGrad, 2.4); c.shadowBlur = 0; // drop shadow only on the base silhouette; inner details skip the blur
        c.save(); torso(); c.clip();
        c.beginPath(); c.moveTo(r * 0.02, -r * 0.5); c.lineTo(r * 0.6, -r * 0.5); c.lineTo(r * 0.6, r * 0.6); c.lineTo(r * 0.1, r * 0.6); c.closePath();
        c.fillStyle = rgba(pal.deep, 0.7); c.fill();
        c.beginPath(); c.moveTo(r * 0.02, -r * 0.5); c.lineTo(r * 0.1, r * 0.6); c.strokeStyle = rgba(pal.rim, 0.5); c.lineWidth = 1; c.stroke();
        c.restore();
        c.beginPath(); c.moveTo(-r * 0.3, -r * 0.34); c.lineTo(r * 0.3, r * 0.42);
        c.strokeStyle = h.INK; c.lineWidth = Math.max(3, r * 0.1) + 2; c.stroke(); c.strokeStyle = metal(0, -r * 0.3, 0, r * 0.4, ...LEATHER); c.lineWidth = Math.max(3, r * 0.1); c.stroke();
        poly([-0.22, -0.2, -0.12, -0.26, -0.15, -0.2, -0.12, -0.14]); fillInk(pal.gold, 1);
        rr(-r * 0.3, r * 0.38, r * 0.6, r * 0.11, r * 0.03); fillInk("#2b303a", 1.4);
        // head: short sandy hair, eye + targeting monocle over the aiming eye
        rr(-r * 0.09, -r * 0.48, r * 0.18, r * 0.14, r * 0.04); fillInk(HERO_SKIN, 1.4);
        head(0, -r * 0.66, r * 0.23, HERO_SKIN);
        c.beginPath(); c.moveTo(-r * 0.23, -r * 0.7); c.lineTo(-r * 0.22, -r * 0.84); c.lineTo(-r * 0.12, -r * 0.9);
        c.lineTo(-r * 0.06, -r * 0.96); c.lineTo(0, -r * 0.9); c.lineTo(r * 0.08, -r * 0.95); c.lineTo(r * 0.12, -r * 0.88);
        c.lineTo(r * 0.22, -r * 0.84); c.lineTo(r * 0.23, -r * 0.7); c.quadraticCurveTo(0, -r * 0.8, -r * 0.23, -r * 0.7); c.closePath();
        fillInk("#7a5432", 1.4);
        eyes(r * 0.09, -r * 0.67, 0, r * 0.028, h.INK);
        c.strokeStyle = h.INK; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(r * 0.04, -r * 0.73); c.lineTo(r * 0.14, -r * 0.74); c.moveTo(-r * 0.05, -r * 0.52); c.lineTo(r * 0.05, -r * 0.53); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.09, -r * 0.68); c.lineTo(-r * 0.22, -r * 0.66); c.lineTo(-r * 0.24, -r * 0.58); c.strokeStyle = "#2b303a"; c.lineWidth = 2; c.stroke();
        c.beginPath(); c.arc(-r * 0.09, -r * 0.68, r * 0.075, 0, TAU); fillInk(rgba(pal.bright, 0.75), 1.4);
        glowOrb(-r * 0.09, -r * 0.68, r * 0.07 * (0.7 + 0.5 * p), pal.bright);
        c.save();
        c.shadowBlur = 0; c.shadowColor = "transparent"; c.globalCompositeOperation = "lighter";
        c.strokeStyle = rgba(pal.bright, 0.45 + 0.35 * p); c.lineWidth = 0.9;
        c.beginPath(); c.arc(-r * 0.09, -r * 0.68, r * 0.13, 0, TAU); c.stroke();
        c.beginPath();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.moveTo(-r * 0.09 + dx * r * 0.1, -r * 0.68 + dy * r * 0.1); c.lineTo(-r * 0.09 + dx * r * 0.16, -r * 0.68 + dy * r * 0.16); }
        c.stroke();
        c.restore();
        // compound bow: recurved limbs, riser, cams and cables
        const gx = -r * 0.8, bowW = Math.max(2.4, r * 0.09);
        const limb = (y0, cy, y1) => {
          c.beginPath(); c.moveTo(gx, y0); c.quadraticCurveTo(-r * 0.86, cy, -r * 0.66, y1);
          c.strokeStyle = h.INK; c.lineWidth = bowW + 2.4; c.stroke();
          c.strokeStyle = metal(gx - r * 0.05, 0, gx + r * 0.05, 0, pal.bright, pal.mid, pal.deep); c.lineWidth = bowW; c.stroke();
        };
        limb(-r * 0.44, -r * 0.8, -r * 0.98); limb(r * 0.12, r * 0.48, r * 0.66);
        c.beginPath(); c.moveTo(gx, -r * 0.46); c.quadraticCurveTo(-r * 0.9, ay, gx, r * 0.14);
        c.strokeStyle = h.INK; c.lineWidth = bowW * 1.4 + 2.4; c.stroke();
        c.strokeStyle = metal(gx - r * 0.06, 0, gx + r * 0.06, 0, ...GUNMETAL); c.lineWidth = bowW * 1.4; c.stroke();
        c.beginPath(); c.moveTo(-r * 0.64, -r * 0.98); c.lineTo(-r * 0.7, r * 0.66); c.strokeStyle = "rgba(11,7,16,0.45)"; c.lineWidth = 0.8; c.stroke();
        for (const y of [-r * 0.98, r * 0.66]) {
          c.beginPath(); c.arc(-r * 0.66, y, r * 0.07, 0, TAU); fillInk(metal(-r * 0.73, y, -r * 0.59, y, ...GUNMETAL), 1.2);
          c.beginPath(); c.arc(-r * 0.66, y, r * 0.02, 0, TAU); c.fillStyle = pal.bright; c.fill();
        }
        // bow arm (bare) with leather bracer, gripping the riser
        heroLimb(c, h, -r * 0.38, -r * 0.3, -r * 0.58, -r * 0.24, -r * 0.76, -r * 0.1, Math.max(2.8, r * 0.17), HERO_SKIN);
        heroLimb(c, h, -r * 0.52, -r * 0.19, -r * 0.6, -r * 0.16, -r * 0.7, -r * 0.13, Math.max(3.2, r * 0.2), metal(0, -r * 0.24, 0, -r * 0.08, ...LEATHER));
        c.beginPath(); c.arc(gx, -r * 0.06, r * 0.09, 0, TAU); fillInk(HERO_SKIN, 1.4);
        // taut bowstring to the nock
        c.beginPath(); c.moveTo(-r * 0.62, -r * 0.98); c.lineTo(r * 0.26, ay); c.lineTo(-r * 0.62, r * 0.66);
        c.strokeStyle = h.INK; c.lineWidth = 2; c.stroke(); c.strokeStyle = "#f1f1f1"; c.lineWidth = 0.9; c.stroke();
        // nocked plasma arrow
        c.beginPath(); c.moveTo(r * 0.24, ay); c.lineTo(-r * 1.04, ay);
        c.strokeStyle = h.INK; c.lineWidth = 2.8; c.stroke(); c.strokeStyle = "#2b303a"; c.lineWidth = 1.4; c.stroke();
        energyBlade(-r * 0.3, ay, -r * 1.0, ay, Math.max(0.9, r * 0.03), pal.bright);
        for (const sy of [-1, 1]) { poly([0.24, -0.16, 0.1, -0.16 + sy * 0.08, 0.06, -0.16 + sy * 0.07, 0.14, -0.16]); fillInk(pal.bright, 1); }
        poly([-1.22, -0.16, -1.06, -0.23, -1.09, -0.16, -1.06, -0.09]); fillInk(metal(-r * 1.22, ay - r * 0.07, -r * 1.06, ay + r * 0.07, "#ffffff", pal.rim, pal.bright), 1.2);
        glowOrb(-r * 1.12, ay, r * 0.15 * (0.75 + 0.45 * p), pal.bright);
        // drawing arm pulled to the chin
        heroLimb(c, h, r * 0.38, -r * 0.3, r * 0.58, -r * 0.34, r * 0.72, -r * 0.22, Math.max(2.8, r * 0.17), pal.mid);
        heroLimb(c, h, r * 0.72, -r * 0.22, r * 0.52, -r * 0.12, r * 0.3, ay, Math.max(2.6, r * 0.15), pal.mid);
        c.beginPath(); c.arc(r * 0.28, ay, r * 0.085, 0, TAU); fillInk(metal(r * 0.2, 0, r * 0.36, 0, ...LEATHER), 1.4);
      },
      /* Gamma Titan — hulking brawler, gamma-veined deltoids, armored fists smashing a fissured shockwave. */
      harrower(c, pal, r, ts, h) {
        const { fillInk, poly, metal, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(300), sw = ts ? (ts / 900) % 1 : 0.45;
        const skin = c.createLinearGradient(-r * 0.8, -r * 0.8, r * 0.8, r * 1.0);
        skin.addColorStop(0, pal.bright); skin.addColorStop(0.5, pal.mid); skin.addColorStop(1, pal.deep);
        const TI = (x0, y0, x1, y1) => metal(x0, y0, x1, y1, "#eef1f5", "#a3abb8", "#4a515e");
        const vein = (pts, w) => {
          c.save();
          c.shadowBlur = 0; c.shadowColor = "transparent"; c.lineCap = "round"; c.lineJoin = "round";
          c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
          c.globalCompositeOperation = "lighter";
          c.strokeStyle = rgba(GAMMA, 0.25 + 0.35 * p); c.lineWidth = w * 3; c.stroke();
          c.globalCompositeOperation = "source-over";
          c.strokeStyle = GAMMA; c.lineWidth = w; c.stroke();
          c.strokeStyle = rgba("#ffffff", 0.3 + 0.5 * p); c.lineWidth = Math.max(0.6, w * 0.4); c.stroke();
          c.restore();
        };
        // kinetic shockwave rings + ground glow
        c.save();
        c.shadowBlur = 0; c.shadowColor = "transparent"; c.globalCompositeOperation = "lighter";
        const gg = c.createRadialGradient(0, r * 1.04, 0, 0, r * 1.04, r * 0.85);
        gg.addColorStop(0, rgba(GAMMA, 0.35 + 0.2 * p)); gg.addColorStop(1, rgba(GAMMA, 0));
        c.fillStyle = gg; c.beginPath(); c.ellipse(0, r * 1.04, r * 0.85, r * 0.2, 0, 0, TAU); c.fill();
        for (let k = 0; k < 2; k++) {
          const t = (sw + k * 0.5) % 1;
          c.beginPath(); c.ellipse(0, r * 1.04, r * (0.35 + 0.85 * t), r * (0.08 + 0.12 * t), 0, 0, TAU);
          c.strokeStyle = rgba(GAMMA, 0.6 * (1 - t)); c.lineWidth = 1 + 2.4 * (1 - t); c.stroke();
        }
        c.restore();
        // radiating ground fissures
        const cracks = [
          [[-0.1, 1.0], [-0.32, 1.06], [-0.5, 1.02], [-0.72, 1.1], [-0.96, 1.06], [-1.18, 1.14]],
          [[0.1, 1.0], [0.3, 1.08], [0.52, 1.03], [0.74, 1.12], [1.0, 1.07], [1.2, 1.15]],
          [[-0.05, 1.02], [-0.12, 1.12], [-0.06, 1.2], [-0.14, 1.26]],
          [[0.05, 1.02], [0.18, 1.14], [0.12, 1.24]],
          [[-0.5, 1.02], [-0.56, 1.16], [-0.48, 1.24]],
          [[0.74, 1.12], [0.82, 1.22]],
        ];
        for (const cr of cracks) {
          c.beginPath(); c.moveTo(cr[0][0] * r, cr[0][1] * r);
          for (let i = 1; i < cr.length; i++) c.lineTo(cr[i][0] * r, cr[i][1] * r);
          c.strokeStyle = h.INK; c.lineWidth = 2.6; c.stroke();
          vein(cr.map(([x, y]) => [x * r, y * r]), 1);
        }
        // flung rock debris
        const lift = Math.sin(sw * Math.PI) * r * 0.12;
        for (const [x, y, s] of [[-0.86, 0.86, 0.07], [0.9, 0.88, 0.06], [-0.62, 0.78, 0.05], [0.66, 0.76, 0.045]]) {
          poly([x - s, y - lift / r, x, y - s - lift / r, x + s, y - s * 0.3 - lift / r, x + s * 0.6, y + s * 0.6 - lift / r, x - s * 0.5, y + s * 0.7 - lift / r]);
          fillInk(metal((x - s) * r, (y - s) * r, (x + s) * r, (y + s) * r, "#a59a8a", "#6e655a", "#3a342e"), 1.2);
        }
        // short powerful legs in torn shorts
        for (const sx of [-1, 1]) {
          heroLimb(c, h, sx * r * 0.42, r * 0.66, sx * r * 0.5, r * 0.86, sx * r * 0.46, r * 1.0, Math.max(3.6, r * 0.24), skin);
          heroLimb(c, h, sx * r * 0.2, r * 0.38, sx * r * 0.46, r * 0.46, sx * r * 0.44, r * 0.7, Math.max(4.4, r * 0.32), "#3f2459");
          poly([sx * 0.3, 0.66, sx * 0.36, 0.76, sx * 0.42, 0.68, sx * 0.48, 0.77, sx * 0.56, 0.66]); c.fillStyle = "#3f2459"; c.fill();
          c.beginPath(); c.ellipse(sx * r * 0.5, r * 1.02, r * 0.15, r * 0.07, 0, 0, TAU); fillInk(skin, 1.6);
        }
        // massive torso: pecs and abs
        c.beginPath(); c.moveTo(-r * 0.5, -r * 0.42); c.quadraticCurveTo(-r * 0.6, r * 0.1, -r * 0.34, r * 0.44); c.lineTo(r * 0.34, r * 0.44);
        c.quadraticCurveTo(r * 0.6, r * 0.1, r * 0.5, -r * 0.42); c.quadraticCurveTo(0, -r * 0.64, -r * 0.5, -r * 0.42); c.closePath(); fillInk(skin, 2.6); c.shadowBlur = 0; // drop shadow only on the base silhouette; inner details skip the blur
        c.strokeStyle = "rgba(11,7,16,0.55)"; c.lineWidth = 1.6;
        for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * r * 0.04, -r * 0.2); c.quadraticCurveTo(sx * r * 0.28, -r * 0.02, sx * r * 0.44, -r * 0.24); c.stroke(); }
        c.lineWidth = 1.1;
        c.beginPath(); c.moveTo(0, -r * 0.2); c.lineTo(0, r * 0.36);
        for (const y of [0.04, 0.16, 0.28]) { c.moveTo(-r * 0.14, y * r); c.quadraticCurveTo(-r * 0.07, (y + 0.03) * r, 0, y * r); c.quadraticCurveTo(r * 0.07, (y + 0.03) * r, r * 0.14, y * r); }
        c.stroke();
        rr(-r * 0.36, r * 0.36, r * 0.72, r * 0.14, r * 0.04); fillInk("#3f2459", 1.6);
        // arms driving the armored fists into the ground
        for (const sx of [-1, 1]) {
          heroLimb(c, h, sx * r * 0.78, -r * 0.2, sx * r * 1.0, r * 0.34, sx * r * 0.5, r * 0.74, Math.max(5, r * 0.34), skin);
          c.beginPath(); c.moveTo(sx * r * 0.82, -r * 0.12); c.quadraticCurveTo(sx * r * 0.96, r * 0.3, sx * r * 0.62, r * 0.64);
          c.strokeStyle = rgba(pal.rim, 0.35); c.lineWidth = Math.max(1.4, r * 0.06); c.stroke();
          vein([[sx * r * 0.88, r * 0.18], [sx * r * 0.84, r * 0.3], [sx * r * 0.88, r * 0.4], [sx * r * 0.76, r * 0.52]], 1);
          glowOrb(sx * r * 0.48, r * 1.0, r * 0.22 * (0.6 + 0.6 * p), GAMMA);
          c.save();
          c.translate(sx * r * 0.48, r * 0.84); c.rotate(sx * 0.15);
          rr(-r * 0.17, -r * 0.27, r * 0.34, r * 0.12, r * 0.03); fillInk(pal.deep, 1.4);
          rr(-r * 0.21, -r * 0.17, r * 0.42, r * 0.32, r * 0.09); fillInk(TI(-r * 0.21, -r * 0.17, r * 0.21, r * 0.15), 2.2);
          for (let k = 0; k < 4; k++) { rr(-r * 0.19 + k * r * 0.1, r * 0.06, r * 0.08, r * 0.09, r * 0.02); fillInk(metal(0, r * 0.06, 0, r * 0.15, "#fff1bf", pal.gold, "#7a5418"), 1); }
          c.beginPath(); c.moveTo(-r * 0.15, -r * 0.1); c.lineTo(r * 0.08, -r * 0.1); c.strokeStyle = "rgba(255,255,255,0.6)"; c.lineWidth = 1.1; c.stroke();
          c.restore();
        }
        // huge bulging deltoids with pulsing gamma veins
        for (const sx of [-1, 1]) {
          const cx = sx * r * 0.64, cy = -r * 0.36;
          const dg = c.createRadialGradient(cx - sx * r * 0.08, cy - r * 0.14, r * 0.02, cx, cy, r * 0.4);
          dg.addColorStop(0, pal.bright); dg.addColorStop(0.6, pal.mid); dg.addColorStop(1, pal.deep);
          c.beginPath(); c.ellipse(cx, cy, r * 0.38, r * 0.32, sx * 0.3, 0, TAU); fillInk(dg, 2.6);
          vein([[cx - sx * r * 0.2, cy - r * 0.04], [cx - sx * r * 0.06, cy + r * 0.03], [cx + sx * r * 0.05, cy - r * 0.08], [cx + sx * r * 0.2, cy - r * 0.02]], Math.max(1, r * 0.045));
          vein([[cx - sx * r * 0.06, cy + r * 0.03], [cx, cy + r * 0.15], [cx + sx * r * 0.12, cy + r * 0.2]], Math.max(0.9, r * 0.035));
        }
        // trapezius hump
        c.beginPath(); c.moveTo(-r * 0.36, -r * 0.52); c.quadraticCurveTo(0, -r * 0.74, r * 0.36, -r * 0.52); c.quadraticCurveTo(0, -r * 0.5, -r * 0.36, -r * 0.52); c.closePath(); fillInk(skin, 1.8);
        // head low between the shoulders: furrowed brow, glowing glare, grimace
        c.beginPath(); c.moveTo(-r * 0.2, -r * 0.72); c.quadraticCurveTo(0, -r * 0.84, r * 0.2, -r * 0.72);
        c.lineTo(r * 0.22, -r * 0.52); c.quadraticCurveTo(r * 0.16, -r * 0.36, 0, -r * 0.36);
        c.quadraticCurveTo(-r * 0.16, -r * 0.36, -r * 0.22, -r * 0.52); c.closePath(); fillInk(skin, 2.2);
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.66); c.lineTo(-r * 0.24, -r * 0.78); c.lineTo(-r * 0.14, -r * 0.8); c.lineTo(-r * 0.1, -r * 0.88);
        c.lineTo(0, -r * 0.82); c.lineTo(r * 0.08, -r * 0.9); c.lineTo(r * 0.14, -r * 0.8); c.lineTo(r * 0.24, -r * 0.78); c.lineTo(r * 0.22, -r * 0.66);
        c.quadraticCurveTo(0, -r * 0.74, -r * 0.22, -r * 0.66); c.closePath(); fillInk("#17151c", 1.4);
        glowSlit(c, h, [-0.16, -0.63, -0.04, -0.59, -0.06, -0.56, -0.15, -0.59], GAMMA);
        glowSlit(c, h, [0.16, -0.63, 0.04, -0.59, 0.06, -0.56, 0.15, -0.59], GAMMA);
        c.strokeStyle = h.INK; c.lineWidth = 2.6;
        c.beginPath(); c.moveTo(-r * 0.18, -r * 0.68); c.lineTo(-r * 0.03, -r * 0.61); c.moveTo(r * 0.18, -r * 0.68); c.lineTo(r * 0.03, -r * 0.61); c.stroke();
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(-r * 0.03, -r * 0.7); c.lineTo(-r * 0.02, -r * 0.64); c.moveTo(r * 0.03, -r * 0.7); c.lineTo(r * 0.02, -r * 0.64); c.stroke();
        rr(-r * 0.11, -r * 0.49, r * 0.22, r * 0.075, r * 0.02); fillInk("#2a0b0e", 1.2);
        c.fillStyle = "#f2efe4"; c.fillRect(-r * 0.09, -r * 0.485, r * 0.18, r * 0.022); c.fillRect(-r * 0.08, -r * 0.44, r * 0.16, r * 0.018);
      },

      /* Swarm Sentinel — compact flight suit, twin pairs of hard-light insect wings, antenna cowl, wrist stingers. */
      fury(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, pulse, rgba, rr, head } = h;
        const p = pulse(200), bob = ts ? Math.sin(ts / 380) * r * 0.05 : 0, flutter = ts ? Math.sin(ts / 28) : 0;
        const wingA = ts ? 0.75 + 0.25 * Math.abs(flutter) : 1;
        c.save(); c.translate(0, bob);
        // twin pairs of translucent hard-light wings (motion-blur ghost pass only while animating, skipped for static icons)
        const wing = (L, W, alpha) => {
          c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(L * 0.45, -W, L, -W * 0.15); c.quadraticCurveTo(L * 0.6, W * 0.7, 0, 0); c.closePath();
          const wg = c.createLinearGradient(0, 0, L, 0);
          wg.addColorStop(0, rgba(pal.rim, 0.6 * alpha)); wg.addColorStop(0.5, rgba(pal.bright, 0.32 * alpha)); wg.addColorStop(1, rgba(pal.bright, 0.12 * alpha));
          c.fillStyle = wg; c.fill();
          c.save();
          c.globalCompositeOperation = "lighter";
          c.strokeStyle = rgba(pal.rim, 0.85 * alpha); c.lineWidth = 1.2; c.stroke();
          c.beginPath(); c.moveTo(0, 0); c.lineTo(L * 0.92, -W * 0.25); c.moveTo(L * 0.2, -W * 0.1); c.lineTo(L * 0.55, -W * 0.62);
          c.moveTo(L * 0.3, -W * 0.08); c.lineTo(L * 0.62, W * 0.22); c.moveTo(L * 0.55, -W * 0.3); c.lineTo(L * 0.8, -W * 0.5);
          c.strokeStyle = rgba(pal.rim, 0.5 * alpha); c.lineWidth = 0.8; c.stroke();
          c.restore();
        };
        c.save();
        c.shadowBlur = 0; c.shadowColor = "transparent";
        for (const sx of [-1, 1]) {
          for (const [rx, ry, L, W, ang] of [[0.12, -0.3, 1.02, 0.36, -0.55], [0.12, -0.12, 0.78, 0.26, 0.35]]) {
            c.save();
            c.translate(sx * rx * r, ry * r); c.scale(sx, 1);
            if (ts > 0) { c.save(); c.rotate(ang - 0.12 * flutter); wing(L * r, W * r, 0.3); c.restore(); } // ghost pass only while animating
            c.rotate(ang + 0.07 * flutter); wing(L * r, W * r, wingA);
            c.restore();
          }
          glowOrb(sx * r * 0.14, -r * 0.24, r * 0.1 * (0.7 + 0.5 * p), pal.bright);
        }
        c.restore();
        // compact flight suit: legs together, dark stripe bands
        const suit = () => {
          c.beginPath(); c.moveTo(-r * 0.26, -r * 0.38); c.quadraticCurveTo(-r * 0.32, 0, -r * 0.16, r * 0.3);
          c.quadraticCurveTo(-r * 0.2, r * 0.7, -r * 0.06, r * 1.12); c.lineTo(r * 0.06, r * 1.12);
          c.quadraticCurveTo(r * 0.2, r * 0.7, r * 0.16, r * 0.3); c.quadraticCurveTo(r * 0.32, 0, r * 0.26, -r * 0.38);
          c.quadraticCurveTo(0, -r * 0.46, -r * 0.26, -r * 0.38); c.closePath();
        };
        suit(); fillInk(bodyGrad, 2.3); c.shadowBlur = 0; // drop shadow only on the base silhouette; inner details skip the blur
        c.save(); suit(); c.clip();
        c.fillStyle = "rgba(18,14,24,0.85)";
        poly([-0.4, -0.4, 0, -0.06, 0.4, -0.4, 0.4, -0.3, 0, 0.06, -0.4, -0.3]); c.fill();
        for (const y of [0.26, 0.62, 0.9]) { c.fillRect(-r * 0.4, y * r, r * 0.8, r * 0.07); }
        c.beginPath(); c.moveTo(0, r * 0.4); c.lineTo(0, r * 1.12); c.strokeStyle = "rgba(11,7,16,0.5)"; c.lineWidth = 1; c.stroke();
        c.restore();
        rr(-r * 0.17, r * 0.16, r * 0.34, r * 0.08, r * 0.03); fillInk(metal(0, r * 0.16, 0, r * 0.24, "#fff1bf", pal.gold, "#7a5418"), 1.2);
        // arms with twin wrist bio-electric stinger blasters
        for (const sx of [-1, 1]) {
          heroLimb(c, h, sx * r * 0.24, -r * 0.32, sx * r * 0.5, -r * 0.3, sx * r * 0.64, r * 0.06, Math.max(2.4, r * 0.13), pal.mid);
          const wx = sx * r * 0.66, wy = r * 0.1;
          c.beginPath(); c.arc(wx, wy, r * 0.1, 0, TAU); fillInk(metal(wx - r * 0.1, wy - r * 0.1, wx + r * 0.1, wy + r * 0.1, ...GUNMETAL), 1.5);
          c.beginPath(); c.arc(wx, wy, r * 0.06, 0, TAU); c.strokeStyle = pal.gold; c.lineWidth = 1.2; c.stroke();
          const mx = sx * r * 0.74, my = r * 0.17;
          const bolt = heroBolt(c, h, ts, mx, my, sx * r * 1.06, r * 0.44, Math.max(1, r * 0.04), STING, sx > 0 ? 61 : 73, 4, r * 0.06);
          heroBolt(c, h, ts, bolt[2][0], bolt[2][1], sx * r * 1.12, r * 0.22, Math.max(0.8, r * 0.03), STING, sx > 0 ? 83 : 97, 3, r * 0.04);
          glowOrb(mx, my, r * 0.14 * (0.7 + 0.6 * pulse(70, sx)), STING);
        }
        // antenna flight cowl with wrap goggle visor
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(sx * r * 0.08, -r * 0.8); c.quadraticCurveTo(sx * r * 0.14, -r * 1.12, sx * r * 0.38, -r * 1.16);
          c.strokeStyle = h.INK; c.lineWidth = 2.8; c.stroke(); c.strokeStyle = pal.mid; c.lineWidth = 1.3; c.stroke();
          glowOrb(sx * r * 0.38, -r * 1.16, r * 0.08 * (0.7 + 0.5 * p), pal.bright);
        }
        head(0, -r * 0.6, r * 0.21, HERO_SKIN);
        const cowl = c.createLinearGradient(0, -r * 0.86, 0, -r * 0.5);
        cowl.addColorStop(0, pal.bright); cowl.addColorStop(0.5, pal.mid); cowl.addColorStop(1, pal.deep);
        c.beginPath(); c.moveTo(-r * 0.21, -r * 0.5); c.lineTo(-r * 0.23, -r * 0.66);
        c.quadraticCurveTo(-r * 0.22, -r * 0.86, 0, -r * 0.87); c.quadraticCurveTo(r * 0.22, -r * 0.86, r * 0.23, -r * 0.66);
        c.lineTo(r * 0.21, -r * 0.5); c.lineTo(r * 0.13, -r * 0.55); c.quadraticCurveTo(0, -r * 0.58, -r * 0.13, -r * 0.55); c.closePath();
        fillInk(cowl, 2);
        poly([-0.21, -0.7, 0, -0.65, 0.21, -0.7, 0.19, -0.6, 0, -0.57, -0.19, -0.6]);
        const vg = c.createLinearGradient(0, -r * 0.7, 0, -r * 0.57);
        vg.addColorStop(0, "#ffffff"); vg.addColorStop(0.4, pal.rim); vg.addColorStop(1, pal.bright);
        fillInk(vg, 1.4);
        c.beginPath(); c.moveTo(-r * 0.15, -r * 0.66); c.lineTo(-r * 0.05, -r * 0.64); c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 1; c.stroke();
        c.beginPath(); c.moveTo(-r * 0.04, -r * 0.45); c.lineTo(r * 0.04, -r * 0.45); c.strokeStyle = "rgba(11,7,16,0.6)"; c.lineWidth = 1.1; c.stroke();
        c.restore();
      },
    },
  };

  /* ============================================================
   * THEME: VIGILANTES & PARAGONS — an original comic-league homage
   * ============================================================ */
  const JL_CAPE = ["#ff6a52", "#c4182b", "#5c0610"];   // solar-red cape cloth
  const JL_GOLD = ["#fff3b8", "#f2c230", "#7a5410"];   // polished gold
  const JL_HAIR = "#17121c";
  const JL_SOLAR = "#ffcf4a";    // sunburst flare
  const JL_TRUTH = "#ffd86b";    // glowing coil of verity
  const JL_TACHYON = "#ffd84a";  // sprinter tachyon-spark yellow
  const JL_EMERALD = "#3dff8f";  // hard-light emerald
  const JL_AQUA = "#5fe8ff";     // tidal sheen
  const JL_CYBER = "#ff2d3c";    // crimson ocular sensor
  const JL_DARK_SKIN = "#8d5c3e";

  // Heroic V-shaped torso path (all values in r units).
  function jlTorso(c, r, sw, ww, top, bot) {
    c.beginPath(); c.moveTo(-sw * r, top * r);
    c.quadraticCurveTo(-(sw + 0.08) * r, (top + 0.22) * r, -ww * r, bot * r); c.lineTo(ww * r, bot * r);
    c.quadraticCurveTo((sw + 0.08) * r, (top + 0.22) * r, sw * r, top * r);
    c.quadraticCurveTo(0, (top - 0.1) * r, -sw * r, top * r); c.closePath();
  }
  // Two straight legs with boots; legFill / bootFill may be colours or gradients.
  function jlLegs(c, h, r, legFill, bootFill, bootTop = 0.8) {
    for (const sx of [-1, 1]) {
      h.poly([sx * 0.05, 0.44, sx * 0.31, 0.44, sx * 0.31, 0.9, sx * 0.07, 0.9]); h.fillInk(legFill, 2.2);
      h.poly([sx * 0.04, bootTop, sx * 0.33, bootTop, sx * 0.35, 1.13, sx * 0.03, 1.13]); h.fillInk(bootFill, 1.8);
    }
  }
  // Chiselled heroic face centred at (0, cy); w = half-width in r units.
  function jlFace(c, h, r, cy, w, skin) {
    c.beginPath(); c.moveTo(-w * r, cy * r - r * 0.08);
    c.quadraticCurveTo(-w * r, cy * r - r * 0.32, 0, cy * r - r * 0.33);
    c.quadraticCurveTo(w * r, cy * r - r * 0.32, w * r, cy * r - r * 0.08);
    c.lineTo(w * 0.92 * r, cy * r + r * 0.07); c.lineTo(w * 0.42 * r, cy * r + r * 0.2);
    c.lineTo(-w * 0.42 * r, cy * r + r * 0.2); c.lineTo(-w * 0.92 * r, cy * r + r * 0.07); c.closePath();
    h.fillInk(skin, 2);
    c.beginPath(); c.ellipse(-w * 0.4 * r, cy * r - r * 0.14, w * 0.28 * r, r * 0.06, -0.3, 0, TAU);
    c.fillStyle = "rgba(255,255,255,0.32)"; c.fill();
  }
  // Muscle sheen + light pec/ab lines clipped to a torso path.
  function jlTorsoDetail(c, h, r, path) {
    c.save(); path(); c.clip();
    const sheen = c.createLinearGradient(-r * 0.5, -r * 0.45, r * 0.25, r * 0.2);
    sheen.addColorStop(0, "rgba(255,255,255,0.26)"); sheen.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = sheen; c.fillRect(-r * 0.62, -r * 0.55, r * 1.24, r * 1.1);
    c.strokeStyle = "rgba(11,7,16,0.32)"; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(0, -r * 0.3); c.lineTo(0, r * 0.4);
    c.moveTo(-r * 0.12, r * 0.12); c.lineTo(r * 0.12, r * 0.12); c.moveTo(-r * 0.11, r * 0.26); c.lineTo(r * 0.11, r * 0.26);
    c.stroke();
    c.restore();
  }
  // Gold buckle belt across the waist.
  function jlBelt(c, h, r, y, w, fill) {
    h.rr(-w * r, y * r, w * 2 * r, r * 0.1, r * 0.03); h.fillInk(fill || h.metal(0, y * r, 0, (y + 0.1) * r, ...JL_GOLD), 1.4);
  }

  SG.THEMES.justice = {
    id: "justice",
    name: { en: "Vigilantes & Paragons", fr: "Justiciers & Parangons", zh: "义警与典范", ar: "المقتصّون والأبطال القدوة" },
    description: {
      en: "Solar capes, shadow cowls, tidal tridents and hard-light constructs of an original league of paragons.",
      fr: "Capes solaires, capuches d'ombre, tridents des marées et constructions de lumière solide d'une ligue originale de parangons.",
      zh: "太阳披风、暗影头罩、潮汐三叉戟与硬光造物——一支原创的英雄联盟。",
      ar: "عباءات شمسية وأقنعة ظلال ورماح ثلاثية للمدّ وتشكيلات من الضوء الصلب لعصبة أبطال أصلية.",
    },
    painters: {
      /* Solar Paragon — flowing solar cape, diamond crest with sun glyph, chiselled jaw, hover bob, sunburst flare. */
      reaper(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(380), bob = ts ? Math.sin(ts / 520) * r * 0.035 : 0;
        c.save(); c.translate(0, bob);
        // sunburst aura behind the head (slowly rotating while animated)
        c.save();
        c.shadowBlur = 0; c.shadowColor = "transparent";
        c.translate(0, -r * 0.66); c.rotate(ts ? ts / 2400 : 0);
        c.globalCompositeOperation = "lighter";
        const rayG = c.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 0.5);
        rayG.addColorStop(0, rgba(JL_SOLAR, ts ? 0.4 + 0.3 * p : 0.55)); rayG.addColorStop(1, rgba(JL_SOLAR, 0));
        const halo = c.createRadialGradient(0, 0, r * 0.18, 0, 0, r * 0.46);
        halo.addColorStop(0, rgba(JL_SOLAR, ts ? 0.22 + 0.16 * p : 0.3)); halo.addColorStop(1, rgba(JL_SOLAR, 0));
        c.fillStyle = halo; c.beginPath(); c.arc(0, 0, r * 0.46, 0, TAU); c.fill();
        for (let i = 0; i < 12; i++) {
          const a = i * TAU / 12, L = r * (i % 2 ? 0.4 : 0.5) * (ts ? 0.9 + 0.1 * p : 1), b = r * 0.25;
          c.beginPath(); c.moveTo(Math.cos(a - 0.1) * b, Math.sin(a - 0.1) * b);
          c.lineTo(Math.cos(a) * L, Math.sin(a) * L); c.lineTo(Math.cos(a + 0.1) * b, Math.sin(a + 0.1) * b); c.closePath();
          c.fillStyle = rayG; c.fill();
        }
        c.restore();
        // flowing solar cape with a rippling hem
        const wave = (i) => (ts ? Math.sin(ts / 260 + i * 1.3) * r * 0.035 : 0);
        const hem = [[-0.98, 1.04], [-0.5, 1.09], [0, 1.05], [0.5, 1.09], [0.98, 1.04]];
        c.beginPath(); c.moveTo(-r * 0.42, -r * 0.4);
        c.bezierCurveTo(-r * 0.72, -r * 0.1, -r * 0.92, r * 0.5, hem[0][0] * r + wave(0), hem[0][1] * r);
        for (let i = 1; i < hem.length; i++) {
          const mx = (hem[i - 1][0] + hem[i][0]) / 2 * r;
          c.quadraticCurveTo(mx + wave(i + 3), r * 0.96, hem[i][0] * r + wave(i), hem[i][1] * r + wave(i + 7) * 0.5);
        }
        c.bezierCurveTo(r * 0.92, r * 0.5, r * 0.72, -r * 0.1, r * 0.42, -r * 0.4);
        c.quadraticCurveTo(0, -r * 0.5, -r * 0.42, -r * 0.4); c.closePath();
        const capeG = c.createLinearGradient(-r, 0, r, 0);
        capeG.addColorStop(0, JL_CAPE[2]); capeG.addColorStop(0.3, JL_CAPE[1]); capeG.addColorStop(0.5, JL_CAPE[0]);
        capeG.addColorStop(0.7, JL_CAPE[1]); capeG.addColorStop(1, JL_CAPE[2]);
        fillInk(capeG, 2.4); c.shadowBlur = 0; // drop shadow only on the base silhouette; inner details skip the blur
        c.strokeStyle = "rgba(11,7,16,0.35)"; c.lineWidth = 1.2;
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(sx * r * 0.5, -r * 0.2); c.quadraticCurveTo(sx * r * 0.74, r * 0.4, sx * r * 0.72 + wave(sx + 2), r * 1.04); c.stroke();
        }
        // legs + solar boots
        jlLegs(c, h, r, pal.deep, metal(-r * 0.35, 0, r * 0.35, 0, ...JL_CAPE));
        // torso
        const torso = () => jlTorso(c, r, 0.5, 0.32, -0.4, 0.5);
        torso(); fillInk(bodyGrad, 2.5);
        jlTorsoDetail(c, h, r, torso);
        jlBelt(c, h, r, 0.36, 0.33);
        rr(-r * 0.07, r * 0.345, r * 0.14, r * 0.13, r * 0.03); fillInk(metal(0, r * 0.34, 0, r * 0.48, ...JL_CAPE), 1.1);
        // diamond chest crest with a solar glyph
        poly([-0.26, -0.33, 0.26, -0.33, 0.33, -0.21, 0, 0.14, -0.33, -0.21]);
        fillInk(metal(-r * 0.3, -r * 0.33, r * 0.3, r * 0.1, ...JL_GOLD), 1.6);
        poly([-0.2, -0.28, 0.2, -0.28, 0.25, -0.2, 0, 0.06, -0.25, -0.2]);
        fillInk(metal(-r * 0.25, -r * 0.28, r * 0.25, r * 0.06, ...JL_CAPE), 1);
        const gx = 0, gy = -r * 0.15;
        if (ts) glowOrb(gx, gy, r * 0.12 * (0.6 + 0.6 * p), JL_SOLAR);
        c.beginPath(); c.arc(gx, gy, r * 0.05, 0, TAU); fillInk(JL_GOLD[1], 1);
        c.strokeStyle = JL_GOLD[0]; c.lineWidth = Math.max(1, r * 0.03);
        c.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          c.moveTo(gx + Math.cos(a) * r * 0.075, gy + Math.sin(a) * r * 0.075); c.lineTo(gx + Math.cos(a) * r * 0.11, gy + Math.sin(a) * r * 0.11);
        }
        c.stroke();
        // arms: fists planted on the hips
        for (const sx of [-1, 1]) {
          heroLimb(c, h, sx * r * 0.46, -r * 0.32, sx * r * 0.76, -r * 0.02, sx * r * 0.44, r * 0.34, Math.max(3, r * 0.2), pal.mid);
          c.beginPath(); c.arc(sx * r * 0.43, r * 0.35, r * 0.1, 0, TAU); fillInk(pal.deep, 1.6);
          c.beginPath(); c.arc(sx * r * 0.42, -r * 0.37, r * 0.06, 0, TAU); fillInk(metal(0, -r * 0.43, 0, -r * 0.31, ...JL_GOLD), 1.2);
        }
        // neck, chiselled face, dark hair with forelock curl
        rr(-r * 0.1, -r * 0.54, r * 0.2, r * 0.16, r * 0.04); fillInk(HERO_SKIN, 1.6);
        jlFace(c, h, r, -0.68, 0.22, HERO_SKIN);
        c.beginPath(); c.moveTo(-r * 0.23, -r * 0.7); c.quadraticCurveTo(-r * 0.26, -r * 1.05, 0, -r * 1.04);
        c.quadraticCurveTo(r * 0.26, -r * 1.05, r * 0.23, -r * 0.7); c.lineTo(r * 0.2, -r * 0.84);
        c.quadraticCurveTo(0, -r * 0.93, -r * 0.2, -r * 0.84); c.closePath(); fillInk(JL_HAIR, 1.6);
        c.beginPath(); c.moveTo(-r * 0.01, -r * 0.92); c.bezierCurveTo(-r * 0.12, -r * 0.86, r * 0.05, -r * 0.79, -r * 0.05, -r * 0.76);
        c.strokeStyle = JL_HAIR; c.lineWidth = Math.max(1.6, r * 0.045); c.stroke();
        c.strokeStyle = h.INK; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-r * 0.15, -r * 0.79); c.lineTo(-r * 0.04, -r * 0.77); c.moveTo(r * 0.15, -r * 0.79); c.lineTo(r * 0.04, -r * 0.77); c.stroke();
        for (const sx of [-1, 1]) {
          c.beginPath(); c.arc(sx * r * 0.09, -r * 0.72, r * 0.03, 0, TAU); c.fillStyle = "#2f5fc4"; c.fill();
        }
        c.strokeStyle = "rgba(11,7,16,0.55)"; c.lineWidth = 1.1;
        c.beginPath(); c.moveTo(-r * 0.06, -r * 0.57); c.lineTo(r * 0.06, -r * 0.57); c.moveTo(0, -r * 0.5); c.lineTo(0, -r * 0.535); c.stroke();
        // sunburst eye flare
        for (const sx of [-1, 1]) {
          const ex = sx * r * 0.09, ey = -r * 0.72, k = ts ? 0.5 + 0.9 * p : 0.6;
          glowOrb(ex, ey, r * 0.05 * k, JL_SOLAR);
          if (ts) {
            c.save();
            c.globalCompositeOperation = "lighter";
            c.strokeStyle = rgba(JL_SOLAR, 0.25 + 0.4 * p); c.lineWidth = 1;
            c.beginPath(); c.moveTo(ex - r * 0.1 * k, ey); c.lineTo(ex + r * 0.1 * k, ey); c.stroke();
            c.restore();
          }
        }
        c.restore();
      },

      /* Dark Vigilante — scalloped wing cape, pointed cowl ears, white slit eyes, barbed gothic chevron crest, finned gauntlets. */
      sovereign(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(520);
        const flap = (i) => (ts ? Math.sin(ts / 340 + i * 0.9) * r * 0.03 : 0);
        // scalloped wing cape: serrated tips joined by inward-curving scallops
        const tips = [[-1.12, -0.08], [-1.06, 0.44], [-1.12, 0.96], [-0.7, 1.08], [-0.24, 1.12], [0.24, 1.12], [0.7, 1.08], [1.12, 0.96], [1.06, 0.44], [1.12, -0.08]];
        const T = tips.map(([x, y], i) => [x * r + (Math.abs(x) > 1 ? Math.sign(x) * flap(i) * 0.6 : 0), y * r + (y > 0.9 ? flap(i + 3) : 0)]);
        c.beginPath(); c.moveTo(-r * 0.36, -r * 0.44);
        c.quadraticCurveTo(-r * 0.82, -r * 0.46, T[0][0], T[0][1]);
        for (let i = 1; i < T.length; i++) {
          const mx = (T[i - 1][0] + T[i][0]) / 2, my = (T[i - 1][1] + T[i][1]) / 2;
          c.quadraticCurveTo(mx * 0.82, my + (r * 0.3 - my) * 0.2, T[i][0], T[i][1]);
        }
        c.quadraticCurveTo(r * 0.82, -r * 0.46, r * 0.36, -r * 0.44);
        c.quadraticCurveTo(0, -r * 0.54, -r * 0.36, -r * 0.44); c.closePath();
        const capeG = c.createRadialGradient(0, -r * 0.2, r * 0.1, 0, r * 0.2, r * 1.2);
        capeG.addColorStop(0, pal.deep); capeG.addColorStop(0.5, "#17151e"); capeG.addColorStop(1, "#07060b");
        fillInk(capeG, 2.4); c.shadowBlur = 0; // drop shadow only on the base silhouette; inner details skip the blur
        c.lineWidth = 1.1;
        for (const sx of [-1, 1]) for (const [x, y] of [[0.7, 1.04], [0.24, 1.08], [1.0, 0.44]]) {
          c.beginPath(); c.moveTo(sx * r * 0.36, -r * 0.38); c.quadraticCurveTo(sx * r * (x * 0.7), r * 0.2, sx * r * x, r * y);
          c.strokeStyle = rgba(pal.mid, 0.22); c.stroke();
        }
        // legs + armoured boots
        jlLegs(c, h, r, pal.deep, metal(-r * 0.35, 0, r * 0.35, 0, ...GUNMETAL), 0.74);
        // torso with shadowed flanks
        const torso = () => jlTorso(c, r, 0.46, 0.3, -0.42, 0.5);
        torso(); fillInk(bodyGrad, 2.5);
        jlTorsoDetail(c, h, r, torso);
        c.save(); torso(); c.clip();
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(sx * r * 0.56, -r * 0.4); c.quadraticCurveTo(sx * r * 0.26, r * 0.05, sx * r * 0.22, r * 0.55);
          c.lineTo(sx * r * 0.6, r * 0.55); c.closePath(); c.fillStyle = "rgba(11,7,16,0.45)"; c.fill();
        }
        c.restore();
        // nocturnal gothic chest crest: barbed downward chevron crowned by a lancet finial spike
        c.strokeStyle = rgba(pal.gold, 0.8); c.lineWidth = 1;
        poly([-0.28, -0.29, -0.17, -0.29, 0, -0.12, 0.17, -0.29, 0.28, -0.29, 0.168, -0.178, 0.215, -0.12, 0.126, -0.136,
          0, -0.01, -0.126, -0.136, -0.215, -0.12, -0.168, -0.178]);
        c.fillStyle = "#0b0a10"; c.fill(); c.stroke();
        poly([0, -0.33, 0.035, -0.22, 0, -0.15, -0.035, -0.22]);
        c.fillStyle = "#0b0a10"; c.fill(); c.stroke();
        // utility belt with pouches
        jlBelt(c, h, r, 0.36, 0.31);
        for (const x of [-0.24, -0.12, 0.08, 0.2]) { rr(x * r, r * 0.37, r * 0.08, r * 0.1, r * 0.02); fillInk(metal(0, r * 0.37, 0, r * 0.47, ...JL_GOLD), 1); }
        // arms with serrated gauntlet blades
        for (const sx of [-1, 1]) {
          heroLimb(c, h, sx * r * 0.42, -r * 0.32, sx * r * 0.74, -r * 0.06, sx * r * 0.38, r * 0.3, Math.max(3, r * 0.19), pal.mid);
          const ex = sx * r * 0.6, ey = r * 0.02, fx = sx * r * 0.4, fy = r * 0.28;
          const dx = fx - ex, dy = fy - ey, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
          let nx = uy, ny = -ux; if (nx * sx < 0) { nx = -nx; ny = -ny; }
          c.beginPath(); c.moveTo(ex, ey); c.lineTo(fx, fy);
          c.strokeStyle = h.INK; c.lineWidth = Math.max(3, r * 0.2) + 2.6; c.stroke();
          c.strokeStyle = metal(ex, ey, fx, fy, ...GUNMETAL); c.lineWidth = Math.max(3, r * 0.2); c.stroke();
          for (const t of [0.2, 0.45, 0.7]) {
            const bx = ex + dx * t + nx * r * 0.08, by = ey + dy * t + ny * r * 0.08;
            c.beginPath(); c.moveTo(bx - ux * r * 0.05, by - uy * r * 0.05); c.lineTo(bx + ux * r * 0.05, by + uy * r * 0.05);
            c.lineTo(bx + nx * r * 0.12 - ux * r * 0.07, by + ny * r * 0.12 - uy * r * 0.07); c.closePath();
            fillInk(metal(bx, by - r * 0.06, bx, by + r * 0.06, ...SILVER), 1);
          }
          c.beginPath(); c.arc(fx, fy, r * 0.095, 0, TAU); fillInk("#16151d", 1.5);
        }
        // lower face, then pointed cowl with cheek cut-outs
        rr(-r * 0.1, -r * 0.54, r * 0.2, r * 0.16, r * 0.04); fillInk("#16151d", 1.6);
        jlFace(c, h, r, -0.64, 0.2, HERO_SKIN);
        const cowl = c.createLinearGradient(0, -r * 1.08, 0, -r * 0.46);
        cowl.addColorStop(0, pal.deep); cowl.addColorStop(0.55, "#1b1a23"); cowl.addColorStop(1, "#0d0c12");
        c.beginPath(); c.moveTo(-r * 0.235, -r * 0.47); c.lineTo(-r * 0.25, -r * 0.76); c.lineTo(-r * 0.235, -r * 1.08);
        c.lineTo(-r * 0.12, -r * 0.96); c.quadraticCurveTo(0, -r * 1.03, r * 0.12, -r * 0.96); c.lineTo(r * 0.235, -r * 1.08);
        c.lineTo(r * 0.25, -r * 0.76); c.lineTo(r * 0.235, -r * 0.47); c.lineTo(r * 0.16, -r * 0.5); c.lineTo(r * 0.13, -r * 0.6);
        c.quadraticCurveTo(0, -r * 0.57, -r * 0.13, -r * 0.6); c.lineTo(-r * 0.16, -r * 0.5); c.closePath();
        fillInk(cowl, 2);
        c.beginPath(); c.moveTo(-r * 0.03, -r * 0.84); c.lineTo(0, -r * 0.62); c.lineTo(r * 0.03, -r * 0.84);
        c.strokeStyle = "rgba(255,255,255,0.1)"; c.lineWidth = 1; c.stroke();
        // glowing white slit eyes
        glowSlit(c, h, [-0.17, -0.75, -0.05, -0.71, -0.06, -0.68, -0.16, -0.7], "#f4f8ff");
        glowSlit(c, h, [0.17, -0.75, 0.05, -0.71, 0.06, -0.68, 0.16, -0.7], "#f4f8ff");
        if (ts) for (const sx of [-1, 1]) glowOrb(sx * r * 0.11, -r * 0.71, r * 0.07 * (0.5 + 0.6 * p), "#dfe9ff");
        c.beginPath(); c.moveTo(-r * 0.07, -r * 0.52); c.quadraticCurveTo(0, -r * 0.545, r * 0.07, -r * 0.52);
        c.strokeStyle = "rgba(11,7,16,0.7)"; c.lineWidth = 1.2; c.stroke();
      },

      /* Amazonian Demi-Goddess — star tiara, flowing hair, eagle breastplate, crossed vambraces, glowing coil of verity, pteruges. */
      juggernaut(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(340), sway = ts ? Math.sin(ts / 600) * r * 0.04 : 0;
        // flowing dark hair behind head and shoulders
        c.beginPath(); c.moveTo(0, -r * 1.0);
        c.quadraticCurveTo(-r * 0.38, -r * 1.02, -r * 0.37, -r * 0.7);
        c.quadraticCurveTo(-r * 0.44, -r * 0.36, -r * 0.52 + sway, -r * 0.1);
        c.quadraticCurveTo(-r * 0.34, -r * 0.18, -r * 0.24, -r * 0.42); c.lineTo(r * 0.24, -r * 0.42);
        c.quadraticCurveTo(r * 0.34, -r * 0.18, r * 0.52 + sway, -r * 0.1);
        c.quadraticCurveTo(r * 0.44, -r * 0.36, r * 0.37, -r * 0.7);
        c.quadraticCurveTo(r * 0.38, -r * 1.02, 0, -r * 1.0); c.closePath();
        const hairG = c.createLinearGradient(0, -r, 0, -r * 0.1);
        hairG.addColorStop(0, "#3a2a40"); hairG.addColorStop(1, JL_HAIR);
        fillInk(hairG, 2.2); c.shadowBlur = 0; // drop shadow only on the base silhouette; inner details skip the blur
        c.strokeStyle = "rgba(255,255,255,0.14)"; c.lineWidth = 1;
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(sx * r * 0.3, -r * 0.82); c.quadraticCurveTo(sx * r * 0.4, -r * 0.4, sx * r * 0.46 + sway, -r * 0.16); c.stroke();
        }
        // legs: bare thighs, tall boots with silver stripe and knee guards
        jlLegs(c, h, r, HERO_SKIN, metal(-r * 0.35, 0, r * 0.35, 0, pal.bright, pal.mid, pal.deep), 0.66);
        c.strokeStyle = SILVER[0]; c.lineWidth = Math.max(1, r * 0.03);
        c.beginPath(); for (const sx of [-1, 1]) { c.moveTo(sx * r * 0.18, r * 0.7); c.lineTo(sx * r * 0.19, r * 1.1); } c.stroke();
        for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 0.18, r * 0.68, r * 0.08, Math.PI, TAU); c.closePath(); fillInk(metal(0, r * 0.6, 0, r * 0.7, ...SILVER), 1.2); }
        // armoured pteruges fanning from the belt
        for (let i = 0; i < 7; i++) {
          const x = (-0.33 + i * 0.11) * r, a = (i - 3) * 0.07;
          c.save(); c.translate(x, r * 0.36); c.rotate(-a);
          rr(-r * 0.05, 0, r * 0.1, r * (0.32 + (i % 2) * 0.04), r * 0.03);
          fillInk(metal(-r * 0.05, 0, r * 0.05, 0, pal.bright, pal.mid, pal.deep), 1.2);
          c.beginPath(); c.arc(0, r * (0.27 + (i % 2) * 0.04), r * 0.022, 0, TAU); c.fillStyle = JL_GOLD[1]; c.fill();
          c.restore();
        }
        // corset torso
        const torso = () => jlTorso(c, r, 0.4, 0.28, -0.4, 0.42);
        torso(); fillInk(bodyGrad, 2.4);
        c.save(); torso(); c.clip();
        const sheen = c.createLinearGradient(-r * 0.4, -r * 0.4, r * 0.2, r * 0.2);
        sheen.addColorStop(0, "rgba(255,255,255,0.26)"); sheen.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = sheen; c.fillRect(-r * 0.6, -r * 0.5, r * 1.2, r * 1.0);
        c.restore();
        // golden eagle breastplate
        poly([0, -0.15, -0.08, -0.25, -0.2, -0.29, -0.36, -0.36, -0.3, -0.27, -0.38, -0.25, -0.3, -0.2, -0.35, -0.16, -0.23, -0.14, -0.11, -0.15, 0, -0.07,
          0.11, -0.15, 0.23, -0.14, 0.35, -0.16, 0.3, -0.2, 0.38, -0.25, 0.3, -0.27, 0.36, -0.36, 0.2, -0.29, 0.08, -0.25]);
        fillInk(metal(-r * 0.38, -r * 0.36, r * 0.38, -r * 0.07, ...JL_GOLD), 1.4);
        c.strokeStyle = "rgba(122,84,16,0.8)"; c.lineWidth = 0.9;
        c.beginPath(); for (const sx of [-1, 1]) { c.moveTo(sx * r * 0.08, -r * 0.2); c.lineTo(sx * r * 0.3, -r * 0.26); c.moveTo(sx * r * 0.08, -r * 0.16); c.lineTo(sx * r * 0.28, -r * 0.19); } c.stroke();
        poly([-0.04, -0.2, 0.04, -0.2, 0, -0.12]); fillInk(JL_GOLD[0], 0.9);
        jlBelt(c, h, r, 0.32, 0.29);
        heroStar(c, 0, r * 0.37, r * 0.05); fillInk("#e8293a", 0.9);
        // glowing golden coil of verity at the hip
        const lx = r * 0.36, ly = r * 0.52;
        c.save();
        c.globalCompositeOperation = "lighter";
        c.strokeStyle = rgba(JL_TRUTH, ts ? 0.22 + 0.22 * p : 0.3); c.lineWidth = Math.max(3, r * 0.11);
        for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse(lx + k * r * 0.02, ly + k * r * 0.035, r * 0.15, r * 0.09, -0.2, 0, TAU); c.stroke(); }
        c.restore();
        for (let k = 0; k < 3; k++) {
          c.beginPath(); c.ellipse(lx + k * r * 0.02, ly + k * r * 0.035, r * 0.15, r * 0.09, -0.2, 0, TAU);
          c.strokeStyle = h.INK; c.lineWidth = Math.max(2.4, r * 0.06) + 1.6; c.stroke();
          c.strokeStyle = JL_TRUTH; c.lineWidth = Math.max(2.4, r * 0.06); c.stroke();
        }
        c.beginPath(); c.moveTo(lx + r * 0.12, ly + r * 0.1); c.quadraticCurveTo(lx + r * 0.3, ly + r * 0.24, lx + r * 0.18, ly + r * 0.42);
        c.strokeStyle = h.INK; c.lineWidth = Math.max(2.4, r * 0.06) + 1.6; c.stroke();
        c.strokeStyle = JL_TRUTH; c.lineWidth = Math.max(2.4, r * 0.06); c.stroke();
        const sa = ts ? ts / 500 : 2.2;
        glowOrb(lx + Math.cos(sa) * r * 0.15, ly + Math.sin(sa) * r * 0.09, r * 0.07 * (ts ? 0.7 + 0.6 * p : 0.8), JL_TRUTH);
        // arms crossed before the chest in silver reflective vambraces
        const aw = Math.max(3, r * 0.17), vw = Math.max(3, r * 0.15);
        for (const sx of [-1, 1]) heroLimb(c, h, sx * r * 0.38, -r * 0.32, sx * r * 0.56, -r * 0.16, sx * r * 0.56, r * 0.06, aw, HERO_SKIN);
        for (const sx of [-1, 1]) {
          const ex = sx * r * 0.56, ey = r * 0.06, wx = -sx * r * 0.16, wy = -r * 0.1;
          c.beginPath(); c.moveTo(ex, ey); c.lineTo(wx, wy);
          c.strokeStyle = h.INK; c.lineWidth = vw + 2.6; c.stroke();
          c.strokeStyle = metal(ex, ey - vw, ex, ey + vw, ...SILVER); c.lineWidth = vw; c.stroke();
          c.beginPath(); c.moveTo(ex + (wx - ex) * 0.12, ey + (wy - ey) * 0.12 - vw * 0.25); c.lineTo(ex + (wx - ex) * 0.85, ey + (wy - ey) * 0.85 - vw * 0.25);
          c.strokeStyle = "rgba(255,255,255,0.85)"; c.lineWidth = 1; c.stroke();
          c.beginPath(); c.arc(-sx * r * 0.2, -r * 0.12, r * 0.08, 0, TAU); fillInk(HERO_SKIN, 1.4);
          if (ts) {
            const t = ((ts / 900) + (sx > 0 ? 0 : 0.5)) % 1;
            glowOrb(ex + (wx - ex) * t, ey + (wy - ey) * t - vw * 0.2, r * 0.07 * (0.5 + 0.6 * p), "#ffffff");
          }
        }
        // face, framing hair, golden star tiara
        rr(-r * 0.08, -r * 0.54, r * 0.16, r * 0.14, r * 0.04); fillInk(HERO_SKIN, 1.4);
        h.head(0, -r * 0.68, r * 0.22, HERO_SKIN);
        c.beginPath(); c.moveTo(-r * 0.235, -r * 0.6); c.quadraticCurveTo(-r * 0.29, -r * 0.99, 0, -r * 0.97);
        c.quadraticCurveTo(r * 0.29, -r * 0.99, r * 0.235, -r * 0.6); c.lineTo(r * 0.18, -r * 0.76);
        c.quadraticCurveTo(0, -r * 0.86, -r * 0.18, -r * 0.76); c.closePath(); fillInk(JL_HAIR, 1.4);
        c.beginPath(); c.moveTo(-r * 0.21, -r * 0.79); c.quadraticCurveTo(0, -r * 0.9, r * 0.21, -r * 0.79);
        c.lineTo(r * 0.2, -r * 0.75); c.quadraticCurveTo(0, -r * 0.85, -r * 0.2, -r * 0.75); c.closePath();
        fillInk(metal(0, -r * 0.9, 0, -r * 0.75, ...JL_GOLD), 1.2);
        poly([-0.08, -0.84, 0, -0.99, 0.08, -0.84, 0, -0.82]); fillInk(metal(0, -r, 0, -r * 0.82, ...JL_GOLD), 1.2);
        heroStar(c, 0, -r * 0.88, r * 0.045); fillInk("#e8293a", 0.8);
        if (ts) glowOrb(0, -r * 0.88, r * 0.08 * (0.4 + 0.7 * p), "#ff8a70");
        for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 0.085, -r * 0.68, r * 0.028, 0, TAU); c.fillStyle = "#1d2a4a"; c.fill(); }
        c.strokeStyle = h.INK; c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(-r * 0.14, -r * 0.74); c.lineTo(-r * 0.04, -r * 0.73); c.moveTo(r * 0.14, -r * 0.74); c.lineTo(r * 0.04, -r * 0.73); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.05, -r * 0.57); c.quadraticCurveTo(0, -r * 0.55, r * 0.05, -r * 0.57); c.strokeStyle = "#a8233a"; c.lineWidth = 1.6; c.stroke();
      },

      /* Crimson Sprinter — sleek cowl with bolt ear fins, tachyon-chevron energy crest, runner lean, speed belt, tachyon spark trail. */
      harrower(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(110), frame = ts ? Math.floor(ts / 60) : 0;
        // tachyon spark trail streaming behind the runner
        c.save();
        c.shadowBlur = 0; c.shadowColor = "transparent";
        c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 6; i++) {
          const y = (-0.5 + i * 0.27) * r, x1 = -r * (0.36 + 0.05 * (i % 3));
          const x0 = -r * (ts ? 0.95 + 0.2 * heroHash(frame * 0.37 + i * 3.1) : 1.08 - 0.06 * (i % 2));
          const g = c.createLinearGradient(x0, y, x1, y);
          g.addColorStop(0, rgba(JL_TACHYON, 0)); g.addColorStop(1, rgba(JL_TACHYON, 0.55));
          c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y);
          c.strokeStyle = g; c.lineWidth = Math.max(1.2, r * (0.035 + 0.02 * (i % 2))); c.stroke();
        }
        c.restore();
        heroBolt(c, h, ts, -r * 0.45, -r * 0.2, -r * 0.98, -r * 0.06, Math.max(0.8, r * 0.03), JL_TACHYON, 5, 4, r * 0.06);
        heroBolt(c, h, ts, -r * 0.5, r * 0.5, -r * 1.02, r * 0.66, Math.max(0.8, r * 0.03), JL_TACHYON, 9, 4, r * 0.06);
        if (ts) for (let k = 0; k < 3; k++) {
          const t = (ts / 380 + k / 3) % 1;
          glowOrb(-r * (0.45 + 0.6 * t), r * (-0.36 + 0.42 * k), r * 0.08 * (1 - t), JL_TACHYON);
        }
        // dynamic runner lean
        c.save(); c.rotate(0.16);
        const lw = Math.max(3, r * 0.18);
        heroLimb(c, h, -r * 0.1, r * 0.4, -r * 0.5, r * 0.62, -r * 0.74, r * 0.92, lw, pal.mid);
        heroLimb(c, h, r * 0.1, r * 0.4, r * 0.62, r * 0.44, r * 0.44, r * 0.97, lw, pal.mid);
        for (const [bx, by, a] of [[-0.76, 0.95, 0.9], [0.46, 0.98, 0.15]]) {
          c.save(); c.translate(bx * r, by * r); c.rotate(a);
          c.beginPath(); c.ellipse(r * 0.04, 0, r * 0.13, r * 0.07, 0, 0, TAU); fillInk(metal(0, -r * 0.07, 0, r * 0.07, ...JL_GOLD), 1.5);
          c.restore();
        }
        // sleek torso
        const torso = () => jlTorso(c, r, 0.4, 0.26, -0.4, 0.46);
        torso(); fillInk(bodyGrad, 2.4); c.shadowBlur = 0; // drop shadow only on the base silhouette; inner details skip the blur
        jlTorsoDetail(c, h, r, torso);
        // tachyon energy crest: forward-pointing notched banner with a glowing edge
        poly([-0.17, -0.3, 0.1, -0.3, 0.2, -0.15, 0.1, 0, -0.17, 0, -0.11, -0.15]);
        fillInk(metal(0, -r * 0.3, 0, 0, "#5a1018", "#2a070c", "#14030a"), 1.4);
        poly([-0.13, -0.27, 0.085, -0.27, 0.165, -0.15, 0.085, -0.03, -0.13, -0.03, -0.08, -0.15]);
        c.strokeStyle = rgba(JL_TACHYON, ts ? 0.45 + 0.4 * p : 0.65); c.lineWidth = 1; c.stroke();
        // angular lightning chevron inside the crest (kinked lower arm)
        poly([-0.09, -0.26, -0.01, -0.26, 0.1, -0.15, 0.03, -0.085, 0.06, -0.085, -0.05, -0.01, 0, -0.115, -0.03, -0.115, 0.015, -0.15]);
        fillInk(metal(-r * 0.09, -r * 0.26, r * 0.1, -r * 0.01, ...JL_GOLD), 1.1);
        if (ts) glowOrb(r * 0.1, -r * 0.15, r * 0.07 * (0.5 + 0.6 * p), JL_TACHYON);
        // lightning speed belt
        poly([-0.27, 0.3, 0.27, 0.3, 0.26, 0.38, 0.07, 0.38, 0, 0.45, -0.07, 0.38, -0.26, 0.38]);
        fillInk(metal(0, r * 0.3, 0, r * 0.45, ...JL_GOLD), 1.3);
        // pumping arms: back arm swung behind, front arm driving forward
        heroLimb(c, h, -r * 0.36, -r * 0.3, -r * 0.7, -r * 0.02, -r * 0.8, -r * 0.24, Math.max(2.6, r * 0.16), pal.mid);
        heroLimb(c, h, r * 0.36, -r * 0.3, r * 0.52, r * 0.08, r * 0.78, -r * 0.14, Math.max(2.6, r * 0.16), pal.mid);
        for (const [fx, fy] of [[-0.8, -0.24], [0.78, -0.14]]) { c.beginPath(); c.arc(fx * r, fy * r, r * 0.09, 0, TAU); fillInk(pal.deep, 1.4); }
        // sleek cowl, exposed jaw, white lenses and golden bolt ear fins
        const cowl = c.createLinearGradient(0, -r * 0.94, 0, -r * 0.46);
        cowl.addColorStop(0, pal.bright); cowl.addColorStop(0.5, pal.mid); cowl.addColorStop(1, pal.deep);
        c.beginPath(); c.arc(0, -r * 0.68, r * 0.24, 0, TAU); fillInk(cowl, 2);
        c.beginPath(); c.moveTo(-r * 0.16, -r * 0.62); c.quadraticCurveTo(0, -r * 0.66, r * 0.16, -r * 0.62);
        c.lineTo(r * 0.12, -r * 0.5); c.quadraticCurveTo(0, -r * 0.42, -r * 0.12, -r * 0.5); c.closePath(); fillInk(HERO_SKIN, 1.3);
        c.beginPath(); c.moveTo(-r * 0.05, -r * 0.52); c.lineTo(r * 0.05, -r * 0.52); c.strokeStyle = "rgba(11,7,16,0.6)"; c.lineWidth = 1.1; c.stroke();
        glowSlit(c, h, [-0.17, -0.74, -0.05, -0.71, -0.06, -0.67, -0.16, -0.69], "#ffffff");
        glowSlit(c, h, [0.17, -0.74, 0.05, -0.71, 0.06, -0.67, 0.16, -0.69], "#ffffff");
        c.beginPath(); c.arc(-r * 0.09, -r * 0.83, r * 0.06, 0, TAU); c.fillStyle = "rgba(255,255,255,0.3)"; c.fill();
        for (const sx of [-1, 1]) {
          poly([sx * 0.2, -0.62, sx * 0.33, -0.75, sx * 0.27, -0.75, sx * 0.4, -0.92, sx * 0.22, -0.73, sx * 0.28, -0.73, sx * 0.2, -0.68]);
          fillInk(metal(sx * r * 0.2, -r * 0.92, sx * r * 0.4, -r * 0.62, ...JL_GOLD), 1.1);
        }
        // crackle of speed energy around the stride (animated only)
        if (ts) {
          heroBolt(c, h, ts, r * 0.3, r * 0.6, r * 0.62, r * 0.86, Math.max(0.7, r * 0.025), JL_TACHYON, 13, 3, r * 0.05);
          glowOrb(r * 0.46, r * 0.98, r * 0.1 * (0.5 + 0.6 * p), JL_TACHYON);
        }
        c.restore();
      },

      /* Emerald Ring-bearer — glowing power ring on an outstretched fist casting hard-light construct beams,
         cosmic willpower ring-sigil chest emblem, translucent geometric hard-light plates, emerald aura. */
      wildrider(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(300), EM = JL_EMERALD;
        // emerald willpower aura
        c.save();
        c.shadowBlur = 0; c.shadowColor = "transparent";
        c.globalCompositeOperation = "lighter";
        const aura = c.createRadialGradient(0, -r * 0.15, r * 0.2, 0, -r * 0.1, r * 1.08);
        aura.addColorStop(0, rgba(EM, ts ? 0.14 + 0.12 * p : 0.18)); aura.addColorStop(1, rgba(EM, 0));
        c.fillStyle = aura; c.beginPath(); c.arc(0, -r * 0.1, r * 1.08, 0, TAU); c.fill();
        c.restore();
        // legs + boots
        jlLegs(c, h, r, pal.deep, metal(-r * 0.35, 0, r * 0.35, 0, "#3c3f48", "#1b1d23", "#08090c"), 0.76);
        // torso with dark flank panels and emerald seams
        const torso = () => jlTorso(c, r, 0.44, 0.28, -0.4, 0.48);
        torso(); fillInk(bodyGrad, 2.5); c.shadowBlur = 0; // drop shadow only on the base silhouette; inner details skip the blur
        jlTorsoDetail(c, h, r, torso);
        c.save(); torso(); c.clip();
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(sx * r * 0.5, -r * 0.42); c.lineTo(sx * r * 0.22, -r * 0.1); c.lineTo(sx * r * 0.2, r * 0.55);
          c.lineTo(sx * r * 0.6, r * 0.55); c.closePath(); c.fillStyle = "rgba(14,16,20,0.72)"; c.fill();
          c.beginPath(); c.moveTo(sx * r * 0.5, -r * 0.42); c.lineTo(sx * r * 0.22, -r * 0.1); c.lineTo(sx * r * 0.2, r * 0.55);
          c.strokeStyle = rgba(EM, 0.75); c.lineWidth = 1; c.stroke();
        }
        c.restore();
        // translucent geometric hard-light armour plates (pauldrons + abdominal facets)
        const plate = (pts, a) => {
          poly(pts);
          c.save();
          c.globalCompositeOperation = "lighter";
          c.fillStyle = rgba(EM, 0.16 * a); c.fill();
          c.strokeStyle = rgba(EM, 0.85 * a); c.lineWidth = 1.2; c.stroke();
          c.restore();
        };
        const shimmer = ts ? 0.75 + 0.35 * p : 1;
        for (const sx of [-1, 1]) {
          plate([sx * 0.3, -0.44, sx * 0.5, -0.47, sx * 0.62, -0.34, sx * 0.58, -0.18, sx * 0.42, -0.22, sx * 0.32, -0.32], shimmer);
          plate([sx * 0.06, 0.06, sx * 0.24, 0.04, sx * 0.22, 0.2, sx * 0.06, 0.22], shimmer * 0.8);
        }
        // cosmic willpower ring-sigil: dark disc, diagonal energy ray flares, concentric outer/inner rings
        const ly = -r * 0.15;
        c.beginPath(); c.arc(0, ly, r * 0.15, 0, TAU); fillInk("#0e1a12", 1.4);
        c.save();
        c.globalCompositeOperation = "lighter";
        c.fillStyle = rgba(EM, 0.8);
        for (let i = 0; i < 8; i++) {
          // offset by 22.5deg so no flare sits on the horizontal/vertical axes
          const a = Math.PI / 8 + i * Math.PI / 4, b = r * 0.09, w = 0.17;
          const L = r * (i % 2 ? 0.175 : 0.22) * (ts ? 0.92 + 0.12 * p : 1);
          c.beginPath(); c.moveTo(Math.cos(a - w) * b, ly + Math.sin(a - w) * b);
          c.lineTo(Math.cos(a) * L, ly + Math.sin(a) * L);
          c.lineTo(Math.cos(a + w) * b, ly + Math.sin(a + w) * b); c.closePath(); c.fill();
        }
        c.restore();
        c.save();
        c.strokeStyle = EM;
        c.lineWidth = Math.max(1, r * 0.02); c.beginPath(); c.arc(0, ly, r * 0.125, 0, TAU); c.stroke();
        c.lineWidth = Math.max(1.4, r * 0.035); c.beginPath(); c.arc(0, ly, r * 0.065, 0, TAU); c.stroke();
        c.fillStyle = rgba(EM, 0.35); c.beginPath(); c.arc(0, ly, r * 0.045, 0, TAU); c.fill();
        c.restore();
        glowOrb(0, ly, r * 0.06 * (ts ? 0.7 + 0.6 * p : 0.9), EM);
        jlBelt(c, h, r, 0.36, 0.29, metal(0, r * 0.36, 0, r * 0.46, "#3c3f48", "#1b1d23", "#08090c"));
        rr(-r * 0.05, r * 0.365, r * 0.1, r * 0.09, r * 0.02); fillInk(EM, 1);
        // left fist on the hip
        heroLimb(c, h, -r * 0.42, -r * 0.3, -r * 0.74, -r * 0.02, -r * 0.42, r * 0.33, Math.max(3, r * 0.18), pal.mid);
        c.beginPath(); c.arc(-r * 0.42, r * 0.34, r * 0.095, 0, TAU); fillInk("#eef0ea", 1.4);
        // hard-light construct: beams fanning from the ring into a faceted shield bracket
        const rx = r * 0.86, ry = -r * 0.24, cs = ts ? 0.8 + 0.3 * p : 1;
        const bracket = [[1.02, -0.62], [1.14, -0.44], [1.14, -0.04], [1.02, 0.14]];
        c.save();
        c.shadowBlur = 0; c.shadowColor = "transparent";
        c.globalCompositeOperation = "lighter";
        c.beginPath(); c.moveTo(rx, ry); for (const [x, y] of bracket) c.lineTo(x * r, y * r); c.closePath();
        c.fillStyle = rgba(EM, 0.13 * cs); c.fill();
        c.beginPath(); c.moveTo(bracket[0][0] * r, bracket[0][1] * r); for (const [x, y] of bracket.slice(1)) c.lineTo(x * r, y * r);
        c.strokeStyle = rgba(EM, 0.9 * cs); c.lineWidth = Math.max(1.4, r * 0.04); c.stroke();
        c.beginPath(); c.moveTo(1.02 * r, -0.36 * r); c.lineTo(1.08 * r, -0.24 * r); c.lineTo(1.02 * r, -0.12 * r);
        c.strokeStyle = rgba(EM, 0.6 * cs); c.lineWidth = 1; c.stroke();
        c.restore();
        for (const [x, y] of [[1.06, -0.5], [1.1, -0.24], [1.06, 0.02]]) h.energyBlade(rx, ry, x * r, y * r, Math.max(0.8, r * 0.025), EM);
        // outstretched ring arm and gloved fist
        heroLimb(c, h, r * 0.42, -r * 0.3, r * 0.62, -r * 0.3, r * 0.78, -r * 0.24, Math.max(3, r * 0.18), pal.mid);
        c.beginPath(); c.arc(r * 0.8, -r * 0.24, r * 0.1, 0, TAU); fillInk("#eef0ea", 1.5);
        c.beginPath(); c.arc(rx, ry, r * 0.04, 0, TAU); c.strokeStyle = EM; c.lineWidth = Math.max(1.4, r * 0.035); c.stroke();
        glowOrb(rx, ry, r * 0.13 * (ts ? 0.75 + 0.5 * p : 0.9), EM);
        // face, short hair, domino mask with glowing emerald eyes
        rr(-r * 0.09, -r * 0.54, r * 0.18, r * 0.15, r * 0.04); fillInk(HERO_SKIN, 1.5);
        jlFace(c, h, r, -0.68, 0.21, HERO_SKIN);
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.74); c.quadraticCurveTo(-r * 0.25, -r * 1.03, 0, -r * 1.02);
        c.quadraticCurveTo(r * 0.25, -r * 1.03, r * 0.22, -r * 0.74); c.lineTo(r * 0.18, -r * 0.85);
        c.quadraticCurveTo(0, -r * 0.92, -r * 0.18, -r * 0.85); c.closePath(); fillInk("#3a2a1c", 1.5);
        poly([-0.22, -0.78, -0.08, -0.79, 0, -0.74, 0.08, -0.79, 0.22, -0.78, 0.2, -0.68, 0.08, -0.65, 0, -0.69, -0.08, -0.65, -0.2, -0.68]);
        fillInk("#0f3a22", 1.3);
        for (const sx of [-1, 1]) {
          c.beginPath(); c.ellipse(sx * r * 0.1, -r * 0.72, r * 0.05, r * 0.025, 0, 0, TAU); c.fillStyle = "#eafff2"; c.fill();
          if (ts) glowOrb(sx * r * 0.1, -r * 0.72, r * 0.06 * (0.5 + 0.6 * p), EM);
        }
        c.beginPath(); c.moveTo(-r * 0.06, -r * 0.55); c.lineTo(r * 0.06, -r * 0.55); c.strokeStyle = "rgba(11,7,16,0.6)"; c.lineWidth = 1.1; c.stroke();
      },

      /* Verdant Bowman — feathered archer cap, domino mask, compound recurve bow with a drawn energy string,
         nocked trick arrow, back quiver with fletchings. */
      skirmisher(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(160), EM = JL_EMERALD, ay = -r * 0.36;
        // back quiver over the right shoulder
        c.save(); c.translate(r * 0.3, -r * 0.25); c.rotate(0.45);
        rr(-r * 0.1, -r * 0.55, r * 0.2, r * 0.75, r * 0.05); fillInk(metal(-r * 0.1, 0, r * 0.1, 0, ...LEATHER), 2);
        c.restore();
        // legs in an archer's stance + leather boots
        for (const sx of [-1, 1]) {
          heroLimb(c, h, sx * r * 0.14, r * 0.42, sx * r * 0.36, r * 0.7, sx * r * 0.44, r * 1.02, Math.max(3, r * 0.18), pal.deep);
          c.beginPath(); c.ellipse(sx * r * 0.47, r * 1.06, r * 0.13, r * 0.07, 0, 0, TAU); fillInk(metal(0, r, 0, r * 1.13, ...LEATHER), 1.5);
        }
        // tunic torso
        const torso = () => jlTorso(c, r, 0.4, 0.28, -0.4, 0.48);
        torso(); fillInk(bodyGrad, 2.4); c.shadowBlur = 0; // drop shadow only on the base silhouette; inner details skip the blur
        jlTorsoDetail(c, h, r, torso);
        c.save(); torso(); c.clip();
        c.beginPath(); c.moveTo(r * 0.44, -r * 0.44); c.lineTo(r * 0.3, -r * 0.44); c.lineTo(-r * 0.34, r * 0.42); c.lineTo(-r * 0.2, r * 0.42); c.closePath();
        fillInk(metal(0, -r * 0.4, 0, r * 0.4, ...LEATHER), 1.1);
        c.restore();
        // arrow fletchings poking out of the quiver
        c.save(); c.translate(r * 0.3, -r * 0.25); c.rotate(0.45);
        for (const [x, col] of [[-0.06, pal.bright], [0, "#f3efe2"], [0.06, EM]]) {
          c.beginPath(); c.moveTo(x * r, -r * 0.55); c.lineTo(x * r, -r * 0.68); c.strokeStyle = "#5a3d22"; c.lineWidth = 1.4; c.stroke();
          poly([x - 0.025, -0.62, x, -0.76, x + 0.025, -0.62, x, -0.66]); fillInk(col, 0.9);
        }
        c.restore();
        jlBelt(c, h, r, 0.36, 0.29, metal(0, r * 0.36, 0, r * 0.46, ...LEATHER));
        rr(-r * 0.05, r * 0.36, r * 0.1, r * 0.1, r * 0.02); fillInk(metal(0, r * 0.36, 0, r * 0.46, ...JL_GOLD), 1);
        // face, goatee, domino mask, feathered archer cap
        rr(-r * 0.09, -r * 0.54, r * 0.18, r * 0.15, r * 0.04); fillInk(HERO_SKIN, 1.5);
        jlFace(c, h, r, -0.68, 0.2, HERO_SKIN);
        poly([-0.06, -0.52, 0.06, -0.52, 0, -0.44]); fillInk("#c79a3c", 0.9);
        poly([-0.21, -0.77, -0.08, -0.79, 0, -0.74, 0.08, -0.79, 0.21, -0.77, 0.19, -0.68, 0.08, -0.66, 0, -0.7, -0.08, -0.66, -0.19, -0.68]);
        fillInk("#123a22", 1.2);
        for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(sx * r * 0.1, -r * 0.725, r * 0.045, r * 0.022, 0, 0, TAU); c.fillStyle = "#f2fbf4"; c.fill(); }
        const cap = c.createLinearGradient(0, -r * 1.04, 0, -r * 0.72);
        cap.addColorStop(0, pal.bright); cap.addColorStop(0.5, pal.mid); cap.addColorStop(1, pal.deep);
        c.beginPath(); c.moveTo(-r * 0.24, -r * 0.74); c.quadraticCurveTo(-r * 0.22, -r * 1.0, r * 0.06, -r * 1.02);
        c.lineTo(r * 0.4, -r * 0.96); c.quadraticCurveTo(r * 0.24, -r * 0.88, r * 0.24, -r * 0.74);
        c.quadraticCurveTo(0, -r * 0.84, -r * 0.24, -r * 0.74); c.closePath(); fillInk(cap, 1.8);
        c.save(); c.translate(r * 0.16, -r * 0.92); c.rotate(-0.75);
        c.beginPath(); c.ellipse(r * 0.13, 0, r * 0.15, r * 0.045, 0, 0, TAU); fillInk("#f3efe2", 1.1);
        c.beginPath(); c.moveTo(0, 0); c.lineTo(r * 0.27, 0); c.strokeStyle = "rgba(11,7,16,0.55)"; c.lineWidth = 0.9; c.stroke();
        c.restore();
        // compound recurve bow with limb cams
        const gx = -r * 0.84, top = [-0.6, -0.98], bot = [-0.6, 0.26];
        const bowPath = () => {
          c.beginPath(); c.moveTo(-0.68 * r, -1.06 * r); c.quadraticCurveTo(-0.6 * r, -1.03 * r, top[0] * r, top[1] * r);
          c.quadraticCurveTo(-0.9 * r, -0.67 * r, gx, ay); c.quadraticCurveTo(-0.9 * r, -0.05 * r, bot[0] * r, bot[1] * r);
          c.quadraticCurveTo(-0.6 * r, 0.31 * r, -0.68 * r, 0.34 * r);
        };
        bowPath(); c.strokeStyle = h.INK; c.lineWidth = Math.max(3, r * 0.08) + 2.6; c.stroke();
        bowPath(); c.strokeStyle = metal(-r * 0.9, 0, -r * 0.6, 0, ...GUNMETAL); c.lineWidth = Math.max(3, r * 0.08); c.stroke();
        for (const [x, y] of [top, bot]) { c.beginPath(); c.arc(x * r, y * r, r * 0.05, 0, TAU); fillInk(metal(x * r - r * 0.05, 0, x * r + r * 0.05, 0, ...SILVER), 1); }
        // bow arm gripping the riser
        heroLimb(c, h, -r * 0.36, -r * 0.32, -r * 0.6, -r * 0.4, -r * 0.82, ay, Math.max(2.6, r * 0.16), pal.mid);
        // nocked trick arrow
        const hx = r * 0.12;
        c.beginPath(); c.moveTo(hx + r * 0.04, ay); c.lineTo(-r * 1.02, ay);
        c.strokeStyle = h.INK; c.lineWidth = Math.max(1.6, r * 0.035) + 2; c.stroke();
        c.strokeStyle = "#c9a46a"; c.lineWidth = Math.max(1.6, r * 0.035); c.stroke();
        for (const s of [-1, 1]) { poly([0.06, -0.36, 0.14, -0.36 + s * 0.06, 0.16, -0.36]); fillInk(EM, 0.8); }
        poly([-1.0, -0.42, -1.16, -0.36, -1.0, -0.3, -0.96, -0.36]); fillInk(metal(-r * 1.16, 0, -r * 0.96, 0, ...SILVER), 1.1);
        glowOrb(-r * 1.04, ay, r * 0.08 * (ts ? 0.6 + 0.7 * p : 0.9), EM);
        // drawn energy string
        const sw = Math.max(0.8, r * 0.022);
        h.energyBlade(top[0] * r, top[1] * r, hx, ay, sw, EM);
        h.energyBlade(bot[0] * r, bot[1] * r, hx, ay, sw, EM);
        if (ts) glowOrb(hx, ay, r * 0.07 * (0.5 + 0.6 * p), EM);
        c.beginPath(); c.arc(gx, ay, r * 0.085, 0, TAU); fillInk(pal.deep, 1.4);
        // draw arm anchored at the jaw
        heroLimb(c, h, r * 0.38, -r * 0.32, r * 0.74, -r * 0.4, r * 0.15, ay, Math.max(2.6, r * 0.16), pal.mid);
        c.beginPath(); c.arc(hx + r * 0.02, ay, r * 0.085, 0, TAU); fillInk(pal.deep, 1.4);
      },

      /* Abyssal Monarch — heavy golden scale armour, five-pronged trident with water sheen, flowing mane,
         oceanic crown, swirling tidal crests around the base. */
      trickster(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(420), ph = ts ? ts / 420 : 0, sway = ts ? Math.sin(ts / 650) * r * 0.035 : 0;
        const MANE = "#d6a24a";
        // back tidal swell
        c.save();
        c.shadowBlur = 0; c.shadowColor = "transparent";
        c.beginPath(); c.moveTo(-r * 1.16, r * 1.16);
        for (let i = 0; i <= 24; i++) {
          const x = -1.16 + i * (2.32 / 24);
          c.lineTo(x * r, r * (0.86 + 0.06 * Math.sin(x * 6.5 + ph)));
        }
        c.lineTo(r * 1.16, r * 1.16); c.closePath();
        const sea = c.createLinearGradient(0, r * 0.8, 0, r * 1.16);
        sea.addColorStop(0, rgba("#1590b8", 0.85)); sea.addColorStop(1, rgba("#0b3d57", 0.9));
        c.fillStyle = sea; c.fill();
        c.restore();
        // flowing golden mane
        c.beginPath(); c.moveTo(0, -r * 1.0);
        c.quadraticCurveTo(-r * 0.4, -r * 1.02, -r * 0.38, -r * 0.68);
        c.quadraticCurveTo(-r * 0.46, -r * 0.4, -r * 0.5 + sway, -r * 0.26);
        c.lineTo(-r * 0.22, -r * 0.42); c.lineTo(r * 0.22, -r * 0.42); c.lineTo(r * 0.5 + sway, -r * 0.26);
        c.quadraticCurveTo(r * 0.46, -r * 0.4, r * 0.38, -r * 0.68);
        c.quadraticCurveTo(r * 0.4, -r * 1.02, 0, -r * 1.0); c.closePath();
        fillInk(metal(-r * 0.4, -r, r * 0.4, -r * 0.3, "#f3d48a", MANE, "#7a531c"), 2.2);
        c.shadowBlur = 0; // drop shadow only on the base silhouette; inner details skip the blur
        // legs + golden greaves
        jlLegs(c, h, r, bodyGrad, metal(-r * 0.35, 0, r * 0.35, 0, ...JL_GOLD), 0.74);
        // heavy golden scale armour torso
        const torso = () => jlTorso(c, r, 0.48, 0.3, -0.42, 0.5);
        torso(); fillInk(metal(-r * 0.5, -r * 0.4, r * 0.5, r * 0.5, ...JL_GOLD), 2.5);
        c.save(); torso(); c.clip();
        c.strokeStyle = "rgba(110,72,12,0.65)"; c.lineWidth = 1;
        for (let row = 0; row < 11; row++) {
          const y = (-0.44 + row * 0.09) * r, off = row % 2 ? 0.06 : 0;
          c.beginPath();
          for (let x = -0.66 + off; x <= 0.66; x += 0.12) { c.moveTo((x + 0.06) * r, y); c.arc(x * r, y, r * 0.06, 0, Math.PI); }
          c.stroke();
        }
        const sheen = c.createLinearGradient(-r * 0.5, -r * 0.45, r * 0.3, r * 0.2);
        sheen.addColorStop(0, "rgba(255,255,255,0.3)"); sheen.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = sheen; c.fillRect(-r * 0.62, -r * 0.55, r * 1.24, r * 1.1);
        c.restore();
        // side-coloured sash, belt and pauldron shells
        jlBelt(c, h, r, 0.36, 0.31, metal(0, r * 0.36, 0, r * 0.46, pal.bright, pal.mid, pal.deep));
        c.beginPath(); c.arc(0, r * 0.41, r * 0.06, 0, TAU); fillInk(metal(0, r * 0.35, 0, r * 0.47, ...JL_GOLD), 1);
        for (const sx of [-1, 1]) {
          c.beginPath(); c.arc(sx * r * 0.44, -r * 0.3, r * 0.15, Math.PI, TAU); c.closePath();
          fillInk(metal(sx * r * 0.3, -r * 0.45, sx * r * 0.6, -r * 0.3, pal.bright, pal.mid, pal.deep), 1.6);
        }
        // left arm resting on the hip with gold bracer
        heroLimb(c, h, -r * 0.44, -r * 0.3, -r * 0.76, r * 0.0, -r * 0.48, r * 0.32, Math.max(3, r * 0.19), HERO_SKIN);
        c.beginPath(); c.moveTo(-r * 0.66, r * 0.08); c.lineTo(-r * 0.56, r * 0.24);
        c.strokeStyle = h.INK; c.lineWidth = Math.max(3, r * 0.19) + 2.6; c.stroke();
        c.strokeStyle = metal(-r * 0.7, 0, -r * 0.5, 0, ...JL_GOLD); c.lineWidth = Math.max(3, r * 0.19); c.stroke();
        c.beginPath(); c.arc(-r * 0.47, r * 0.33, r * 0.095, 0, TAU); fillInk(HERO_SKIN, 1.4);
        // five-pronged golden trident with a travelling water sheen
        const tx = r * 0.64, tTop = -1.18, sheenT = ts ? (ts / 1400) % 1 : 0.35;
        const tg = c.createLinearGradient(tx, r * 1.0, tx, tTop * r);
        tg.addColorStop(0, JL_GOLD[2]); tg.addColorStop(Math.max(0, sheenT - 0.1), JL_GOLD[1]);
        tg.addColorStop(sheenT, "#e8fbff"); tg.addColorStop(Math.min(1, sheenT + 0.1), JL_GOLD[1]); tg.addColorStop(1, JL_GOLD[0]);
        const sw = Math.max(2.4, r * 0.07);
        c.beginPath(); c.moveTo(tx, r * 1.0); c.lineTo(tx, -r * 0.86);
        c.strokeStyle = h.INK; c.lineWidth = sw + 2.4; c.stroke(); c.strokeStyle = tg; c.lineWidth = sw; c.stroke();
        c.beginPath(); c.moveTo(tx - r * 0.22, -r * 0.84); c.quadraticCurveTo(tx, -r * 0.76, tx + r * 0.22, -r * 0.84);
        c.strokeStyle = h.INK; c.lineWidth = sw + 2.4; c.stroke(); c.strokeStyle = tg; c.lineWidth = sw; c.stroke();
        const prongs = [[-0.22, -1.0, -0.26], [-0.11, -1.08, -0.12], [0, tTop + 0.06, 0], [0.11, -1.08, 0.12], [0.22, -1.0, 0.26]];
        for (const [ox, oy, cx] of prongs) {
          const bx = tx + ox * r * 0.95, topX = tx + cx * r * 0.95 * 0.85;
          c.beginPath(); c.moveTo(bx, -r * 0.83); c.quadraticCurveTo(tx + cx * r, -r * 0.92, topX, oy * r);
          c.strokeStyle = h.INK; c.lineWidth = Math.max(1.8, r * 0.05) + 2.2; c.stroke(); c.strokeStyle = tg; c.lineWidth = Math.max(1.8, r * 0.05); c.stroke();
          poly([topX / r - 0.035, oy + 0.02, topX / r, oy - 0.06, topX / r + 0.035, oy + 0.02]); fillInk(JL_GOLD[0], 1);
        }
        glowOrb(tx, -r * 0.84, r * 0.07 * (ts ? 0.6 + 0.6 * p : 0.8), JL_AQUA);
        if (ts) for (let k = 0; k < 2; k++) {
          const t = (ts / 900 + k * 0.5) % 1;
          glowOrb(tx + r * (k ? 0.08 : -0.08), -r * 0.8 + t * r * 0.9, r * 0.04 * (1 - t), JL_AQUA);
        }
        // right arm gripping the trident shaft
        heroLimb(c, h, r * 0.44, -r * 0.3, r * 0.74, -r * 0.08, tx, r * 0.1, Math.max(3, r * 0.19), HERO_SKIN);
        c.beginPath(); c.arc(tx, r * 0.1, r * 0.1, 0, TAU); fillInk(HERO_SKIN, 1.4);
        // face, golden beard, oceanic crown
        rr(-r * 0.1, -r * 0.54, r * 0.2, r * 0.16, r * 0.04); fillInk(HERO_SKIN, 1.6);
        jlFace(c, h, r, -0.68, 0.21, HERO_SKIN);
        c.beginPath(); c.moveTo(-r * 0.21, -r * 0.68); c.lineTo(-r * 0.2, -r * 0.55); c.quadraticCurveTo(-r * 0.12, -r * 0.38, 0, -r * 0.36);
        c.quadraticCurveTo(r * 0.12, -r * 0.38, r * 0.2, -r * 0.55); c.lineTo(r * 0.21, -r * 0.68);
        c.quadraticCurveTo(r * 0.14, -r * 0.58, r * 0.07, -r * 0.6); c.quadraticCurveTo(0, -r * 0.52, -r * 0.07, -r * 0.6);
        c.quadraticCurveTo(-r * 0.14, -r * 0.58, -r * 0.21, -r * 0.68); c.closePath();
        fillInk(metal(-r * 0.2, -r * 0.7, r * 0.2, -r * 0.36, "#f3d48a", MANE, "#7a531c"), 1.4);
        c.beginPath(); c.moveTo(-r * 0.05, -r * 0.565); c.lineTo(r * 0.05, -r * 0.565); c.strokeStyle = "rgba(11,7,16,0.7)"; c.lineWidth = 1.1; c.stroke();
        for (const sx of [-1, 1]) {
          c.beginPath(); c.arc(sx * r * 0.09, -r * 0.71, r * 0.03, 0, TAU); c.fillStyle = "#1a6f8a"; c.fill();
          c.beginPath(); c.moveTo(sx * r * 0.15, -r * 0.77); c.lineTo(sx * r * 0.04, -r * 0.76); c.strokeStyle = h.INK; c.lineWidth = 1.5; c.stroke();
        }
        c.beginPath(); c.moveTo(-r * 0.23, -r * 0.8); c.lineTo(-r * 0.23, -r * 0.92); c.lineTo(-r * 0.15, -r * 0.88); c.lineTo(-r * 0.11, -r * 1.0);
        c.lineTo(-r * 0.05, -r * 0.9); c.lineTo(0, -r * 1.07); c.lineTo(r * 0.05, -r * 0.9); c.lineTo(r * 0.11, -r * 1.0); c.lineTo(r * 0.15, -r * 0.88);
        c.lineTo(r * 0.23, -r * 0.92); c.lineTo(r * 0.23, -r * 0.8); c.quadraticCurveTo(0, -r * 0.87, -r * 0.23, -r * 0.8); c.closePath();
        fillInk(metal(0, -r * 1.07, 0, -r * 0.8, ...JL_GOLD), 1.4);
        c.strokeStyle = rgba(JL_AQUA, 0.8); c.lineWidth = 1;
        c.beginPath(); c.moveTo(-r * 0.2, -r * 0.84); c.quadraticCurveTo(-r * 0.1, -r * 0.88, -r * 0.05, -r * 0.85); c.moveTo(r * 0.2, -r * 0.84); c.quadraticCurveTo(r * 0.1, -r * 0.88, r * 0.05, -r * 0.85); c.stroke();
        c.beginPath(); c.arc(0, -r * 0.87, r * 0.035, 0, TAU); fillInk(JL_AQUA, 0.9);
        glowOrb(0, -r * 0.87, r * 0.06 * (ts ? 0.6 + 0.7 * p : 0.8), JL_AQUA);
        // swirling tidal crests at the feet
        c.save();
        c.shadowBlur = 0; c.shadowColor = "transparent";
        c.beginPath(); c.moveTo(-r * 1.16, r * 1.16);
        for (let i = 0; i <= 24; i++) {
          const x = -1.16 + i * (2.32 / 24);
          c.lineTo(x * r, r * (1.03 + 0.045 * Math.sin(x * 8 - ph * 1.3)));
        }
        c.lineTo(r * 1.16, r * 1.16); c.closePath();
        const front = c.createLinearGradient(0, r * 0.98, 0, r * 1.16);
        front.addColorStop(0, rgba("#5fd6f0", 0.9)); front.addColorStop(1, rgba("#1376a0", 0.95));
        c.fillStyle = front; c.fill();
        c.strokeStyle = h.INK; c.lineWidth = 1.4; c.stroke();
        for (const [cx0, dir] of [[-0.78, 1], [0, -1], [0.78, 1]]) {
          const cx = (cx0 + (ts ? Math.sin(ph * 0.5 + cx0) * 0.04 : 0)) * r, cy = r * 0.98;
          c.beginPath();
          for (let k = 0; k <= 20; k++) {
            const a = -Math.PI / 2 + dir * (k / 20) * Math.PI * 1.7, rad = r * (0.13 - 0.1 * k / 20);
            const x = cx + Math.cos(a) * rad, y = cy + r * 0.04 + Math.sin(a) * rad;
            if (k) c.lineTo(x, y); else c.moveTo(x, y);
          }
          c.strokeStyle = h.INK; c.lineWidth = 3.4; c.stroke();
          c.strokeStyle = "#e9fbff"; c.lineWidth = 1.6; c.stroke();
        }
        c.restore();
      },

      /* Cybernetic Titan — half-organic half-promethium chassis, crimson ocular sensor with lens flare,
         chest power reactor, arm sonic cannon with charge rings. */
      fury(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(240), CY = JL_CYBER;
        const PROM = ["#f2f4f8", "#9aa3b2", "#3a4150"];
        // cybernetic legs: promethium plating with side-coloured joints
        jlLegs(c, h, r, metal(-r * 0.31, 0, r * 0.31, 0, ...PROM), metal(-r * 0.35, 0, r * 0.35, 0, ...GUNMETAL), 0.78);
        // chassis torso
        const torso = () => jlTorso(c, r, 0.5, 0.32, -0.42, 0.5);
        torso(); fillInk(bodyGrad, 2.6); c.shadowBlur = 0; // drop shadow only on the base silhouette; inner details skip the blur
        for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 0.18, r * 0.66, r * 0.07, 0, TAU); fillInk(pal.mid, 1.2); }
        // right half promethium plating with a jagged seam; left half organic suit
        c.save(); torso(); c.clip();
        c.beginPath(); c.moveTo(r * 0.02, -r * 0.6); c.lineTo(-r * 0.04, -r * 0.3); c.lineTo(r * 0.05, -r * 0.05); c.lineTo(-r * 0.03, r * 0.2);
        c.lineTo(r * 0.04, r * 0.6); c.lineTo(r * 0.7, r * 0.6); c.lineTo(r * 0.7, -r * 0.6); c.closePath();
        fillInk(metal(0, -r * 0.5, r * 0.6, r * 0.5, ...PROM), 1.6);
        c.strokeStyle = "rgba(11,7,16,0.45)"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(r * 0.08, -r * 0.02); c.lineTo(r * 0.6, -r * 0.02); c.moveTo(r * 0.06, r * 0.24); c.lineTo(r * 0.6, r * 0.24);
        c.moveTo(r * 0.3, -r * 0.02); c.lineTo(r * 0.3, r * 0.24); c.stroke();
        for (const [x, y] of [[0.14, 0.04], [0.5, 0.04], [0.14, 0.3], [0.44, 0.3]]) { c.beginPath(); c.arc(x * r, y * r, r * 0.015, 0, TAU); c.fillStyle = "#2a2f3a"; c.fill(); }
        c.strokeStyle = rgba(CY, 0.8); c.lineWidth = 1;
        c.beginPath(); c.moveTo(r * 0.38, -r * 0.3); c.lineTo(r * 0.5, -r * 0.3); c.lineTo(r * 0.56, -r * 0.2); c.stroke();
        c.restore();
        c.save(); torso(); c.clip(); // organic-half muscle detail, intersected with the chassis silhouette
        jlTorsoDetail(c, h, r, () => { c.beginPath(); c.rect(-r * 0.6, -r * 0.6, r * 0.6, r * 1.2); });
        c.restore();
        // chest power reactor
        const rx = r * 0.02, ry = -r * 0.17;
        c.beginPath(); c.arc(rx, ry, r * 0.13, 0, TAU); fillInk(metal(rx - r * 0.13, ry - r * 0.13, rx + r * 0.13, ry + r * 0.13, ...GUNMETAL), 1.6);
        c.beginPath(); c.arc(rx, ry, r * 0.085, 0, TAU); c.fillStyle = "#2a0408"; c.fill();
        c.save();
        c.translate(rx, ry); c.rotate(ts ? ts / 700 : 0);
        c.strokeStyle = rgba(CY, 0.9); c.lineWidth = Math.max(1, r * 0.02);
        for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(0, 0, r * 0.065, i * Math.PI / 2 + 0.2, i * Math.PI / 2 + 1.3); c.stroke(); }
        c.restore();
        glowOrb(rx, ry, r * 0.09 * (ts ? 0.7 + 0.6 * p : 0.9), CY);
        jlBelt(c, h, r, 0.36, 0.33, metal(0, r * 0.36, 0, r * 0.46, ...GUNMETAL));
        rr(-r * 0.06, r * 0.38, r * 0.12, r * 0.06, r * 0.02); c.fillStyle = rgba(CY, ts ? 0.55 + 0.4 * p : 0.8); c.fill();
        // organic left arm, fist on the hip
        heroLimb(c, h, -r * 0.46, -r * 0.32, -r * 0.78, -r * 0.02, -r * 0.48, r * 0.32, Math.max(3, r * 0.2), JL_DARK_SKIN);
        c.beginPath(); c.arc(-r * 0.47, r * 0.33, r * 0.1, 0, TAU); fillInk(JL_DARK_SKIN, 1.4);
        // promethium shoulder + upper arm, then sonic arm cannon
        c.beginPath(); c.arc(r * 0.48, -r * 0.3, r * 0.16, Math.PI, TAU); c.closePath(); fillInk(metal(r * 0.32, -r * 0.46, r * 0.64, -r * 0.3, ...PROM), 1.6);
        heroLimb(c, h, r * 0.48, -r * 0.3, r * 0.72, -r * 0.2, r * 0.62, r * 0.04, Math.max(3, r * 0.2), metal(r * 0.5, 0, r * 0.75, 0, ...PROM));
        const b0x = r * 0.56, b0y = r * 0.06, mx = r * 0.86, my = -r * 0.14;
        const dx = mx - b0x, dy = my - b0y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
        const bw = Math.max(4, r * 0.22);
        c.beginPath(); c.moveTo(b0x, b0y); c.lineTo(mx, my);
        c.strokeStyle = h.INK; c.lineWidth = bw + 2.6; c.stroke();
        c.strokeStyle = metal(b0x + nx * bw / 2, b0y + ny * bw / 2, b0x - nx * bw / 2, b0y - ny * bw / 2, ...PROM); c.lineWidth = bw; c.stroke();
        for (const t of [0.35, 0.6]) {
          const qx = b0x + dx * t, qy = b0y + dy * t;
          c.beginPath(); c.moveTo(qx + nx * bw * 0.5, qy + ny * bw * 0.5); c.lineTo(qx - nx * bw * 0.5, qy - ny * bw * 0.5);
          c.strokeStyle = "rgba(11,7,16,0.55)"; c.lineWidth = 1.2; c.stroke();
        }
        const ang = Math.atan2(uy, ux);
        c.beginPath(); c.ellipse(mx, my, r * 0.045, bw * 0.55, ang, 0, TAU); fillInk(metal(mx, my - bw, mx, my + bw, ...GUNMETAL), 1.4);
        c.beginPath(); c.ellipse(mx, my, r * 0.025, bw * 0.32, ang, 0, TAU); c.fillStyle = CY; c.fill();
        // expanding charge rings at the muzzle (static icon: two fixed rings)
        c.save();
        c.globalCompositeOperation = "lighter";
        for (let k = 0; k < 3; k++) {
          const t = ts ? (ts / 650 + k / 3) % 1 : [0.25, 0.6, -1][k];
          if (t < 0) continue;
          const d = r * (0.04 + 0.12 * t), rr2 = r * (0.12 + 0.08 * t);
          c.beginPath(); c.ellipse(mx + ux * d, my + uy * d, r * 0.03, rr2, ang, 0, TAU);
          c.strokeStyle = rgba(CY, (ts ? 1 - t : 0.85) * 0.9); c.lineWidth = Math.max(1, r * 0.03); c.stroke();
        }
        c.restore();
        glowOrb(mx + ux * r * 0.04, my + uy * r * 0.04, r * 0.11 * (ts ? 0.6 + 0.6 * p : 0.85), CY);
        // half-organic head with promethium faceplate
        rr(-r * 0.1, -r * 0.54, r * 0.2, r * 0.16, r * 0.04); fillInk(metal(-r * 0.1, 0, r * 0.1, 0, ...GUNMETAL), 1.6);
        const headPath = () => { c.beginPath(); c.arc(0, -r * 0.7, r * 0.24, 0, TAU); };
        headPath(); fillInk(JL_DARK_SKIN, 2.2);
        c.save(); headPath(); c.clip();
        c.beginPath(); c.moveTo(-r * 0.3, -r * 1.0); c.lineTo(-r * 0.3, -r * 0.84); c.lineTo(-r * 0.06, -r * 0.84); c.lineTo(-r * 0.01, -r * 0.7);
        c.lineTo(-r * 0.03, -r * 0.5); c.lineTo(r * 0.3, -r * 0.5); c.lineTo(r * 0.3, -r * 1.0); c.closePath();
        fillInk(metal(-r * 0.1, -r * 0.95, r * 0.25, -r * 0.5, ...PROM), 1.4);
        c.strokeStyle = "rgba(11,7,16,0.45)"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(r * 0.02, -r * 0.6); c.lineTo(r * 0.24, -r * 0.6); c.moveTo(r * 0.18, -r * 0.84); c.lineTo(r * 0.18, -r * 0.62); c.stroke();
        c.beginPath(); c.arc(-r * 0.12, -r * 0.78, r * 0.06, 0, TAU); c.fillStyle = "rgba(255,255,255,0.22)"; c.fill();
        c.restore();
        // organic eye
        c.beginPath(); c.ellipse(-r * 0.09, -r * 0.71, r * 0.04, r * 0.022, 0, 0, TAU); c.fillStyle = "#f4efe6"; c.fill();
        c.beginPath(); c.arc(-r * 0.09, -r * 0.71, r * 0.016, 0, TAU); c.fillStyle = "#2a1a10"; c.fill();
        c.beginPath(); c.moveTo(-r * 0.15, -r * 0.77); c.lineTo(-r * 0.04, -r * 0.76); c.strokeStyle = h.INK; c.lineWidth = 1.5; c.stroke();
        c.beginPath(); c.moveTo(-r * 0.07, -r * 0.57); c.lineTo(r * 0.03, -r * 0.57); c.strokeStyle = "rgba(11,7,16,0.65)"; c.lineWidth = 1.1; c.stroke();
        // crimson ocular sensor with lens flare
        const ex = r * 0.1, ey = -r * 0.71;
        c.beginPath(); c.arc(ex, ey, r * 0.065, 0, TAU); fillInk("#1c1f27", 1.2);
        c.beginPath(); c.arc(ex, ey, r * 0.042, 0, TAU); c.fillStyle = CY; c.fill();
        glowOrb(ex, ey, r * 0.09 * (ts ? 0.7 + 0.6 * p : 0.9), CY);
        c.save();
        c.globalCompositeOperation = "lighter";
        const fl = ts ? 0.55 + 0.45 * p : 0.6;
        c.strokeStyle = rgba(CY, 0.55 * fl); c.lineWidth = Math.max(1, r * 0.022);
        c.beginPath(); c.moveTo(ex - r * 0.22 * fl, ey); c.lineTo(ex + r * 0.22 * fl, ey); c.moveTo(ex, ey - r * 0.1 * fl); c.lineTo(ex, ey + r * 0.1 * fl); c.stroke();
        c.strokeStyle = rgba("#ffffff", 0.7 * fl); c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(ex - r * 0.1 * fl, ey); c.lineTo(ex + r * 0.1 * fl, ey); c.stroke();
        c.restore();
        c.beginPath(); c.arc(ex - r * 0.014, ey - r * 0.014, r * 0.012, 0, TAU); c.fillStyle = "#ffffff"; c.fill();
      },
    },
  };

  /* ============================================================
   * THEME: SHINOBI CLANS — an original hidden-village ninja homage
   * ============================================================ */
  const NB_SKIN = "#f4d2ab";
  const NB_PALE = "#f5e9de";
  const NB_ORANGE = ["#ffbe6b", "#ff7d1f", "#a8420b"];
  const NB_GOLD_HAIR = ["#fff6b0", "#f7c829", "#b0730b"];
  const NB_SILVER_HAIR = ["#ffffff", "#d6dbe5", "#8a93a6"];
  const NB_DARK_HAIR = ["#4a5480", "#1c1f36", "#0b0c16"];
  const NB_RED_HAIR = ["#f0646a", "#b4232c", "#5a0d14"];
  const NB_NIGHT = ["#3a4160", "#1d2133", "#0c0e17"];
  const NB_GREEN = ["#6fe08a", "#2f9e4c", "#11512a"];
  const NB_SAND = ["#f7e4ac", "#cea65e", "#7a5826"];
  const NB_ROPE = ["#c4a8ff", "#6f4dba", "#2f1d5c"];
  const NB_PLATE = ["#f7f9fc", "#b2bbc8", "#505867"];
  const NB_BAND = "#1e2437";
  const NB_WRAP = "#efe8d9";
  const NB_SANDAL = "#2a2433";
  const NB_CHAKRA = "#52c8ff";   // azure chakra
  const NB_VIOLET = "#b08cff";   // lightning violet
  const NB_CRIMSON = "#ff2c3c";  // ocular crimson
  const NB_EMERALD = "#4dffa2";  // gate-release steam

  // Three-stop cloth gradient along an axis.
  function nbCloth(c, x0, y0, x1, y1, cols) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, cols[0]); g.addColorStop(0.5, cols[1]); g.addColorStop(1, cols[2]);
    return g;
  }
  // Ninja trousers, bandage-wrapped shins and open sandals (straight stance).
  function nbLegs(c, h, r, pants, wrap = NB_WRAP) {
    for (const sx of [-1, 1]) {
      h.poly([sx * 0.05, 0.42, sx * 0.3, 0.42, sx * 0.29, 0.84, sx * 0.08, 0.84]); h.fillInk(pants, 2.2);
      h.poly([sx * 0.08, 0.8, sx * 0.29, 0.8, sx * 0.28, 1.02, sx * 0.09, 1.02]); h.fillInk(wrap, 1.6);
      c.strokeStyle = "rgba(11,7,16,0.35)"; c.lineWidth = 1;
      c.beginPath();
      for (const y of [0.88, 0.95]) { c.moveTo(sx * 0.09 * r, y * r); c.lineTo(sx * 0.28 * r, (y - 0.04) * r); }
      c.stroke();
      h.poly([sx * 0.06, 1.02, sx * 0.31, 1.02, sx * 0.34, 1.12, sx * 0.04, 1.12]); h.fillInk(NB_SANDAL, 1.6);
    }
  }
  // Youthful face centred at (0, cy); w = half-width (r units). Spans cy-0.3 … cy+0.2.
  function nbFace(c, h, r, cy, w, skin) {
    c.beginPath(); c.moveTo(-w * r, (cy - 0.05) * r);
    c.quadraticCurveTo(-w * r, (cy - 0.3) * r, 0, (cy - 0.3) * r);
    c.quadraticCurveTo(w * r, (cy - 0.3) * r, w * r, (cy - 0.05) * r);
    c.quadraticCurveTo(w * 0.92 * r, (cy + 0.13) * r, 0, (cy + 0.2) * r);
    c.quadraticCurveTo(-w * 0.92 * r, (cy + 0.13) * r, -w * r, (cy - 0.05) * r);
    c.closePath(); h.fillInk(skin, 2);
    c.beginPath(); c.ellipse(-w * 0.45 * r, (cy - 0.14) * r, w * 0.26 * r, r * 0.05, -0.3, 0, TAU);
    c.fillStyle = "rgba(255,255,255,0.3)"; c.fill();
  }
  // Almond eye at (x, y) px; sx = -1 left / +1 right. drawIris(x, y, rad) may replace the default iris.
  function nbEye(c, h, r, x, y, sx, iris, drawIris) {
    const w = r * 0.072, hh = r * 0.042;
    const path = () => {
      c.beginPath(); c.moveTo(x - sx * w, y + hh * 0.25);
      c.quadraticCurveTo(x, y - hh * 1.5, x + sx * w, y - hh * 0.55);
      c.quadraticCurveTo(x + sx * w * 0.2, y + hh * 1.3, x - sx * w, y + hh * 0.25); c.closePath();
    };
    path(); c.fillStyle = "#fbf7ef"; c.fill();
    c.save(); path(); c.clip();
    if (drawIris) drawIris(x, y, hh * 1.05);
    else {
      c.beginPath(); c.arc(x, y, hh * 1.05, 0, TAU); c.fillStyle = iris; c.fill();
      c.beginPath(); c.arc(x, y, hh * 0.5, 0, TAU); c.fillStyle = "#120c14"; c.fill();
    }
    c.restore();
    c.beginPath(); c.moveTo(x - sx * w * 1.1, y + hh * 0.3); c.quadraticCurveTo(x, y - hh * 1.6, x + sx * w * 1.15, y - hh * 0.65);
    c.strokeStyle = h.INK; c.lineWidth = Math.max(1.2, r * 0.026); c.stroke();
    c.beginPath(); c.arc(x - hh * 0.35, y - hh * 0.4, hh * 0.28, 0, TAU); c.fillStyle = "rgba(255,255,255,0.9)"; c.fill();
  }
  // Crimson ocular iris (original pinwheel): outer ring, dark pupil and four skewed diamond blade
  // shards radiating from the pupil, spinning as a pinwheel while animated.
  function nbOcular(c, ts, x, y, rad, dir = 1) {
    c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fillStyle = NB_CRIMSON; c.fill();
    c.strokeStyle = "#3a0008"; c.lineWidth = Math.max(0.5, rad * 0.08);
    c.beginPath(); c.arc(x, y, rad * 0.86, 0, TAU); c.stroke();
    const spin = (ts ? ts / 380 : 0.5) * dir;
    c.fillStyle = "#16020a";
    for (let i = 0; i < 4; i++) {
      const a = spin + i * TAU / 4, pt = (ang, k) => [x + Math.cos(ang) * rad * k, y + Math.sin(ang) * rad * k];
      const [bx, by] = pt(a, 0.2), [lx, ly] = pt(a + 0.42 * dir, 0.5), [tx, ty] = pt(a + 0.2 * dir, 0.8), [rx, ry] = pt(a - 0.12 * dir, 0.46);
      c.beginPath(); c.moveTo(bx, by); c.lineTo(lx, ly); c.lineTo(tx, ty); c.lineTo(rx, ry); c.closePath(); c.fill();
    }
    c.beginPath(); c.arc(x, y, rad * 0.26, 0, TAU); c.fill();
    c.beginPath(); c.arc(x, y, rad * 0.1, 0, TAU); c.fillStyle = NB_CRIMSON; c.fill();
  }
  // Wave-crest village sigil (original glyph): three stacked wave lines behind a solid centre diamond,
  // stamped on brow-guard plates. Spans about ±1.6s × ±0.95s.
  function nbWaveCrest(c, x, y, s, color = "#2b303c") {
    c.strokeStyle = color; c.lineWidth = Math.max(0.6, s * 0.16); c.lineCap = "round";
    for (const k of [-1, 0, 1]) {
      c.beginPath();
      for (let j = 0; j <= 16; j++) {
        const t = j / 16, px = x + s * (-1.6 + 3.2 * t), py = y + k * s * 0.75 + Math.sin(t * TAU * 1.5) * s * 0.18;
        if (j) c.lineTo(px, py); else c.moveTo(px, py);
      }
      c.stroke();
    }
    c.lineCap = "butt";
    c.beginPath(); c.moveTo(x, y - s * 0.55); c.lineTo(x + s * 0.4, y); c.lineTo(x, y + s * 0.55); c.lineTo(x - s * 0.4, y); c.closePath();
    c.fillStyle = color; c.fill();
    c.strokeStyle = NB_PLATE[0]; c.lineWidth = Math.max(0.5, s * 0.1); c.stroke();
  }
  // Cloth band with a riveted steel brow-guard plate, centred at (cx, cy) r-units and rotated by ang.
  function nbHeadband(c, h, r, cx, cy, halfW, ang = 0, cloth = NB_BAND) {
    c.save(); c.translate(cx * r, cy * r); c.rotate(ang);
    h.rr(-halfW * r, -r * 0.05, halfW * 2 * r, r * 0.1, r * 0.03); h.fillInk(cloth, 1.4);
    h.rr(-r * 0.15, -r * 0.066, r * 0.3, r * 0.132, r * 0.025);
    h.fillInk(h.metal(0, -r * 0.066, 0, r * 0.066, ...NB_PLATE), 1.3);
    c.fillStyle = "#5a6271";
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      c.beginPath(); c.arc(sx * r * 0.122, sy * r * 0.037, Math.max(0.6, r * 0.011), 0, TAU); c.fill();
    }
    nbWaveCrest(c, 0, 0, r * 0.048);
    c.restore();
  }
  // Sample a cubic Bézier into n+1 points (px).
  function nbBezierPts(x0, y0, x1, y1, x2, y2, x3, y3, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]);
    }
    return out;
  }
  // Closed tapered ribbon path along a centre line, width w0 → w1 (px).
  function nbStrip(c, pts, w0, w1) {
    const L = [], R = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      const w = (w0 + (w1 - w0) * i / (n - 1)) / 2;
      L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]); R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
    }
    c.beginPath(); c.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n; i++) c.lineTo(L[i][0], L[i][1]);
    for (let i = n - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
    c.closePath();
  }
  // Folded paper-crane motif inside a faint origami-square frame (pale lilac/indigo facets). Spans ±s.


  const SS_GARB = ["#3d3650", "#1a1624", "#060409"];
  const SS_GARB_LIGHT = ["#554c6c", "#2a2438", "#0d0a14"];
  const SS_STEEL = ["#f4f7fb", "#a7b0bf", "#3b4352"];
  const SS_IRON = ["#959ba7", "#4b505c", "#16191f"];
  const SS_WOOD = ["#d6ad78", "#8f663d", "#45291a"];
  const SS_SKIN = ["#e8c6a3", "#c39676", "#7c5641"];
  const SS_SHADE = ["#2c2440", "#100b1a", "#020104"];
  const SS_UMBRA = "#8a5cff";  // umbral violet undertone

  function ssSide(c, pal, x0, y0, x1, y1) { return nbCloth(c, x0, y0, x1, y1, [pal.bright, pal.mid, pal.deep]); }
  function ssLine(c, pts) { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); }
  // Stroke the current path twice: ink outline, then colour (w px).
  function ssInkStroke(c, h, w, color) { c.strokeStyle = h.INK; c.lineWidth = w + 1.8; c.stroke(); c.strokeStyle = color; c.lineWidth = w; c.stroke(); }
  // Sample a quadratic curve into n+1 points.
  function ssQuad(x0, y0, cx, cy, x1, y1, n = 10) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]);
    }
    return pts;
  }
  // Inked ribbon along a centre-line; wfn(t) gives the full width at 0…1.
  function ssRibbon(c, h, pts, wfn, fill, inkW = 1.3) {
    const n = pts.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, w = wfn(i / (n - 1)) / 2;
      L.push([pts[i][0] - dy / len * w, pts[i][1] + dx / len * w]); R.push([pts[i][0] + dy / len * w, pts[i][1] - dx / len * w]);
    }
    c.beginPath(); ssLine(c, L); for (let i = n - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]); c.closePath();
    h.fillInk(fill, inkW);
  }
  // Soft cluster of drifting smoke puffs (spans about ±1.2·rad).
  function ssSmoke(c, x, y, rad, ts, seed, color, alpha = 0.6, n = 6) {
    if (!(rad > 0)) return;
    c.save();
    for (let i = 0; i < n; i++) {
      const a = seed * 1.7 + i * TAU / n + (ts ? ts / 2200 : 0) * (i % 2 ? 1 : -1);
      const d = rad * (0.3 + 0.28 * heroHash(seed + i * 3.1));
      const pr = rad * (0.4 + 0.18 * heroHash(seed * 2.3 + i)) * (ts ? 0.92 + 0.08 * Math.sin(ts / 500 + i + seed) : 1);
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.8;
      const g = c.createRadialGradient(px, py, 0, px, py, pr);
      g.addColorStop(0, rgba(color, alpha)); g.addColorStop(0.6, rgba(color, alpha * 0.55)); g.addColorStop(1, rgba(color, 0));
      c.fillStyle = g; c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill();
    }
    c.restore();
  }
  // Glowing speed arc (radius R, angles a0 → a1).
  function ssSpeedArc(c, x, y, R, a0, a1, w, color, alpha) {
    if (!(R > 0) || !(alpha > 0.01)) return;
    if (a1 < a0) { const t = a0; a0 = a1; a1 = t; }
    c.save(); c.globalCompositeOperation = "lighter"; c.lineCap = "round";
    c.beginPath(); c.arc(x, y, R, a0, a1);
    c.strokeStyle = rgba(color, alpha * 0.3); c.lineWidth = w * 2.2; c.stroke();
    c.strokeStyle = rgba(color, alpha); c.lineWidth = w; c.stroke();
    c.strokeStyle = rgba("#ffffff", alpha * 0.6); c.lineWidth = Math.max(0.5, w * 0.35); c.stroke();
    c.restore();
  }
  // Narrow, menacing glowing eyes.
  function ssEyes(c, x, y, dx, s, color, p) {
    c.save(); c.globalCompositeOperation = "lighter";
    for (const sx of [-1, 1]) {
      const ex = x + sx * dx, g = c.createRadialGradient(ex, y, 0, ex, y, s * 3);
      g.addColorStop(0, "rgba(255,255,255,0.85)"); g.addColorStop(0.3, rgba(color, 0.6 * (0.6 + 0.4 * p))); g.addColorStop(1, rgba(color, 0));
      c.fillStyle = g; c.beginPath(); c.arc(ex, y, s * 3, 0, TAU); c.fill();
    }
    c.restore();
    for (const sx of [-1, 1]) {
      c.beginPath(); c.ellipse(x + sx * dx, y, s * 1.3, s * 0.5, -sx * 0.18, 0, TAU); c.fillStyle = color; c.fill();
      c.beginPath(); c.ellipse(x + sx * dx, y, s * 0.7, s * 0.25, -sx * 0.18, 0, TAU); c.fillStyle = "#ffffff"; c.fill();
    }
  }
  // Masked ninja head: hood, eye slit with glowing eyes, hachigane headband with fluttering tails.
  function ssHead(c, h, pal, ts, x, y, s, o = {}) {
    const p = h.pulse(420, x * 0.05 + y * 0.03), dir = o.dir || -1;
    if (o.tails !== false) {
      for (let k = 0; k < 2; k++) {
        const pts = [];
        for (let i = 0; i <= 6; i++) {
          const t = i / 6, wv = (ts ? Math.sin(ts / 230 - t * 5 + k * 1.3) : 0.6) * s * 0.3 * t;
          pts.push([x + dir * (s * 0.75 + t * s * (1.5 - k * 0.35)), y - s * 0.5 + t * s * (0.3 + k * 0.45) + wv]);
        }
        ssRibbon(c, h, pts, (t) => s * (0.3 - 0.14 * t), o.band || pal.mid, 1);
      }
    }
    c.beginPath(); c.arc(x, y, s, 0, TAU); h.fillInk(nbCloth(c, x - s, y - s, x + s, y + s, o.hood || SS_GARB), 1.6);
    h.rr(x - s * 0.74, y - s * 0.2, s * 1.48, s * 0.36, s * 0.16);
    c.fillStyle = o.shadowFace ? "#07040c" : nbCloth(c, x, y - s * 0.2, x, y + s * 0.16, SS_SKIN); c.fill();
    c.strokeStyle = h.INK; c.lineWidth = 1; c.stroke();
    ssEyes(c, x + (o.look || 0) * s, y - s * 0.02, s * 0.3, s * 0.1, o.eyes || pal.bright, p);
    if (o.band !== false) {
      c.beginPath(); c.moveTo(x - s * 0.96, y - s * 0.36); c.quadraticCurveTo(x, y - s * 0.66, x + s * 0.96, y - s * 0.36);
      ssInkStroke(c, h, s * 0.24, o.band || pal.mid);
      h.rr(x - s * 0.3, y - s * 0.68, s * 0.6, s * 0.28, s * 0.06); h.fillInk(h.metal(x - s * 0.3, y - s * 0.68, x + s * 0.3, y - s * 0.4, ...SS_STEEL), 1);
      c.beginPath(); c.arc(x, y - s * 0.54, s * 0.08, 0, TAU); c.moveTo(x - s * 0.17, y - s * 0.46); c.lineTo(x + s * 0.17, y - s * 0.62);
      c.strokeStyle = h.INK; c.lineWidth = Math.max(0.6, s * 0.05); c.stroke();
    }
    c.beginPath(); c.moveTo(x - s * 0.5, y + s * 0.42); c.quadraticCurveTo(x, y + s * 0.58, x + s * 0.5, y + s * 0.42);
    c.strokeStyle = "rgba(0,0,0,0.5)"; c.lineWidth = Math.max(0.6, s * 0.06); c.stroke();
  }
  // Straight ninjato: grip behind (x, y), blade along ang; w = blade width px.
  function ssBlade(c, h, pal, x, y, ang, blade, hilt, w, o = {}) {
    const glow = o.glow || pal.bright, ga = o.glowA == null ? 1 : o.glowA;
    c.save(); c.translate(x, y); c.rotate(ang);
    h.rr(-hilt, -w * 0.45, hilt, w * 0.9, w * 0.25); h.fillInk(o.wrap || "#16121d", 1.1);
    c.beginPath();
    for (let k = 1; k < 5; k++) {
      const gx = -hilt + k * hilt / 5;
      c.moveTo(gx - w * 0.2, -w * 0.38); c.lineTo(gx + w * 0.2, w * 0.38); c.moveTo(gx + w * 0.2, -w * 0.38); c.lineTo(gx - w * 0.2, w * 0.38);
    }
    c.strokeStyle = rgba(pal.mid, 0.95); c.lineWidth = Math.max(0.6, w * 0.16); c.stroke();
    c.beginPath(); c.arc(-hilt, 0, w * 0.48, 0, TAU); h.fillInk(pal.bright, 1);
    h.rr(-w * 0.18, -w * 0.95, w * 0.36, w * 1.9, w * 0.08); h.fillInk(nbCloth(c, 0, -w, 0, w, SS_IRON), 1.1);
    c.beginPath(); c.moveTo(w * 0.18, -w * 0.4); c.lineTo(blade - w * 1.4, -w * 0.4); c.lineTo(blade, w * 0.4); c.lineTo(w * 0.18, w * 0.4); c.closePath();
    h.fillInk(h.metal(0, -w * 0.4, 0, w * 0.4, ...SS_STEEL), 1.1);
    c.save(); c.globalCompositeOperation = "lighter";
    c.beginPath(); c.moveTo(w * 0.3, w * 0.3); c.lineTo(blade - w * 0.2, w * 0.32);
    c.strokeStyle = rgba(glow, 0.32 * ga); c.lineWidth = w * 0.9; c.stroke();
    c.strokeStyle = rgba(glow, 0.9 * ga); c.lineWidth = Math.max(0.6, w * 0.22); c.stroke();
    c.restore();
    c.restore();
  }
  // Kunai centred on (x, y) pointing along ang; total length len (ring at the back).

  // Four-bladed folding Fuuma shuriken (windmill star) of radius R; o.ghost draws a shadow-clone copy.
  function ssFuuma(c, h, pal, x, y, R, rot, o = {}) {
    if (!(R > 0)) return;
    const ghost = !!o.ghost, P = (rad, a) => [Math.cos(a) * rad, Math.sin(a) * rad];
    c.save(); c.translate(x, y); c.rotate(rot);
    if (ghost) c.globalAlpha = o.alpha == null ? 0.5 : o.alpha;
    for (let k = 0; k < 4; k++) {
      const a = k * TAU / 4;
      const b0 = P(R * 0.24, a - 0.55), c1 = P(R * 0.8, a - 0.3), tip = P(R, a + 0.1), c2 = P(R * 0.5, a + 0.16), b1 = P(R * 0.24, a + 0.62);
      c.beginPath(); c.moveTo(b0[0], b0[1]); c.quadraticCurveTo(c1[0], c1[1], tip[0], tip[1]); c.quadraticCurveTo(c2[0], c2[1], b1[0], b1[1]); c.closePath();
      h.fillInk(ghost ? nbCloth(c, -R, -R, R, R, SS_SHADE) : h.metal(-R, -R, R, R, ...SS_STEEL), 1.3);
      if (!ghost) {
        const g0 = P(R * 0.34, a - 0.12), g1 = P(R * 0.74, a - 0.04);
        c.beginPath(); c.moveTo(g0[0], g0[1]); c.lineTo(g1[0], g1[1]); c.strokeStyle = rgba(SS_STEEL[2], 0.75); c.lineWidth = Math.max(0.6, R * 0.035); c.stroke();
      }
      c.save(); c.globalCompositeOperation = "lighter";
      c.beginPath(); c.moveTo(b0[0], b0[1]); c.quadraticCurveTo(c1[0], c1[1], tip[0], tip[1]);
      c.strokeStyle = rgba(pal.bright, ghost ? 0.6 : 0.85); c.lineWidth = Math.max(0.8, R * 0.05); c.stroke();
      c.restore();
    }
    c.beginPath(); c.arc(0, 0, R * 0.3, 0, TAU); h.fillInk(ghost ? SS_SHADE[1] : nbCloth(c, -R * 0.3, -R * 0.3, R * 0.3, R * 0.3, SS_IRON), 1.3);
    c.beginPath(); c.arc(0, 0, R * 0.21, 0, TAU); c.strokeStyle = ghost ? rgba(pal.bright, 0.8) : pal.mid; c.lineWidth = Math.max(0.8, R * 0.06); c.stroke();
    for (let k = 0; k < 4; k++) { const [px, py] = P(R * 0.21, k * TAU / 4 + Math.PI / 4); c.beginPath(); c.arc(px, py, Math.max(0.5, R * 0.025), 0, TAU); c.fillStyle = pal.gold; c.fill(); }
    c.beginPath(); c.arc(0, 0, R * 0.1, 0, TAU); c.fillStyle = "#05030a"; c.fill();
    c.restore();
  }
  // Paper talisman (ofuda) hanging from (x, y), w × hh px, rotated by ang.

  // Glowing iron chain along a polyline (link size s px).
  function ssChain(c, h, pts, s, glow, gAlpha = 1) {
    if (pts.length < 2 || !(s > 0)) return;
    c.save(); c.globalCompositeOperation = "lighter";
    c.beginPath(); ssLine(c, pts); c.strokeStyle = rgba(glow, 0.28 * gAlpha); c.lineWidth = s * 2.6; c.stroke();
    c.strokeStyle = rgba(glow, 0.55 * gAlpha); c.lineWidth = s * 1.1; c.stroke();
    c.restore();
    let k = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.round(len / (s * 1.2))), a = Math.atan2(y1 - y0, x1 - x0);
      for (let j = 0; j < n; j++, k++) {
        const t = (j + 0.5) / n;
        c.beginPath(); c.ellipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, s * 0.7, k % 2 ? s * 0.16 : s * 0.4, a, 0, TAU);
        c.strokeStyle = h.INK; c.lineWidth = s * 0.3 + 1.1; c.stroke();
        c.strokeStyle = k % 2 ? SS_STEEL[1] : SS_STEEL[0]; c.lineWidth = s * 0.3; c.stroke();
      }
    }
  }
  // Translucent rising shadow-clone silhouette (base centre (x, y), height ≈ 2.4·s).
  function ssClone(c, pal, x, y, s, alpha) {
    if (!(alpha > 0.01) || !(s > 0)) return;
    c.save(); c.globalAlpha = Math.min(1, alpha);
    const g = c.createLinearGradient(x, y - s * 1.25, x, y + s * 0.9);
    g.addColorStop(0, "rgba(44,36,64,0.95)"); g.addColorStop(0.55, "rgba(16,11,26,0.9)"); g.addColorStop(1, "rgba(2,1,4,0)");
    const body = () => {
      c.beginPath(); c.moveTo(x - s * 0.3, y - s * 0.66);
      c.quadraticCurveTo(x - s * 0.62, y - s * 0.1, x - s * 0.48, y + s * 0.9); c.lineTo(x + s * 0.48, y + s * 0.9);
      c.quadraticCurveTo(x + s * 0.62, y - s * 0.1, x + s * 0.3, y - s * 0.66); c.closePath();
    };
    body(); c.fillStyle = g; c.fill();
    c.beginPath(); c.arc(x, y - s * 0.95, s * 0.28, 0, TAU); c.fill();
    c.strokeStyle = rgba(pal.bright, 0.75); c.lineWidth = Math.max(0.8, s * 0.05); c.stroke();
    body(); c.stroke();
    c.globalCompositeOperation = "lighter"; c.fillStyle = rgba(pal.bright, 0.95);
    for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(x + sx * s * 0.1, y - s * 0.95, s * 0.07, s * 0.028, -sx * 0.2, 0, TAU); c.fill(); }
    c.restore();
  }
  // Half of a glowing umbral sigil ring (front: lower half, else upper half) with orbiting rune ticks.
  function ssUmbralRing(c, pal, cx, cy, rx, ry, ts, front, p) {
    const a0 = front ? 0 : Math.PI, rot = ts ? ts / 2600 : 0;
    c.save(); c.globalCompositeOperation = "lighter";
    for (const [k, al, w] of [[1, 0.25, ry * 0.45], [1, 0.85, ry * 0.12], [0.8, 0.55, ry * 0.08]]) {
      c.beginPath();
      for (let i = 0; i <= 24; i++) { const a = a0 + i * Math.PI / 24, x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      c.strokeStyle = rgba(pal.bright, al * (0.6 + 0.4 * p)); c.lineWidth = Math.max(0.8, w); c.stroke();
    }
    c.beginPath();
    for (let i = 0; i < 18; i++) {
      const a = rot + i * TAU / 18;
      if ((Math.sin(a + 0.05) >= 0) !== front) continue;
      c.moveTo(cx + Math.cos(a) * rx * 0.9, cy + Math.sin(a) * ry * 0.9); c.lineTo(cx + Math.cos(a + 0.1) * rx * 0.9, cy + Math.sin(a + 0.1) * ry * 0.9);
    }
    c.strokeStyle = rgba(pal.rim, 0.9); c.lineWidth = Math.max(0.8, ry * 0.12); c.stroke();
    c.restore();
  }
  // Spinning circular sawblade with n teeth.



  SG.THEMES.shinobi = {
    id: "shinobi",
    name: { en: "Shinobi Clans", fr: "Clans Shinobi", zh: "忍界宗族", ar: "عشائر الشينوبي" },
    description: {
      en: "Chakra masters, ocular jutsu, sand barriers, shurikenjutsu, and shadow techniques of the hidden ninja villages.",
      fr: "Maîtres du chakra, jutsu oculaires, barrières de sable, shurikenjutsu et techniques d'ombre des villages ninjas cachés.",
      zh: "查克拉大师、瞳术秘仪、砂之壁垒、手里剑术与影子秘术的隐村忍者。",
      ar: "أسياد التشاكرا، تقنيات العيون، حواجز الرمال، فنون الشوريكين وتقنيات الظلال من القرى الخفية.",
    },
    painters: {
      /* Sage Champion — spiky golden hair, steel brow-guard with wave-crest sigil, flame-hemmed sage cloak,
         crimson sage pigment and a swirling azure rasen-orb ringed by orbiting chakra motes. */
      sovereign(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(260), sway = ts ? Math.sin(ts / 420) * r * 0.03 : 0;
        // flame tongues clipped to a cloak panel (they flicker while animated)
        const flames = (path) => {
          c.save(); path(); c.clip();
          for (let i = 0; i < 8; i++) {
            const x = (-0.84 + i * 0.24) * r;
            const tip = (0.56 + (i % 2) * 0.08) * r + (ts ? Math.sin(ts / 140 + i * 1.7) * r * 0.035 : 0);
            c.beginPath(); c.moveTo(x - r * 0.14, r * 1.0);
            c.quadraticCurveTo(x - r * 0.1, r * 0.78, x + r * 0.03, tip);
            c.quadraticCurveTo(x + r * 0.01, r * 0.8, x + r * 0.14, r * 1.0); c.closePath();
            c.fillStyle = "#d8261c"; c.fill();
            c.strokeStyle = "rgba(11,7,16,0.55)"; c.lineWidth = 1; c.stroke();
          }
          c.restore();
        };
        // sage cloak back panel (base silhouette)
        const cloakBack = () => {
          c.beginPath(); c.moveTo(-r * 0.46, -r * 0.42);
          c.quadraticCurveTo(-r * 0.66, r * 0.2, -r * 0.72 - sway, r * 0.94);
          c.quadraticCurveTo(0, r * 0.99, r * 0.72 - sway, r * 0.94);
          c.quadraticCurveTo(r * 0.66, r * 0.2, r * 0.46, -r * 0.42);
          c.quadraticCurveTo(0, -r * 0.52, -r * 0.46, -r * 0.42); c.closePath();
        };
        cloakBack(); fillInk(bodyGrad, 2.4); c.shadowBlur = 0; // drop shadow only on the base silhouette
        flames(cloakBack);
        cloakBack(); c.strokeStyle = h.INK; c.lineWidth = 2.2; c.stroke();
        // orange jumpsuit legs + torso with black shoulder yoke
        nbLegs(c, h, r, nbCloth(c, -r * 0.3, 0, r * 0.3, 0, NB_ORANGE));
        const torso = () => jlTorso(c, r, 0.44, 0.31, -0.42, 0.48);
        torso(); fillInk(nbCloth(c, -r * 0.45, -r * 0.4, r * 0.45, r * 0.45, NB_ORANGE), 2.4);
        c.save(); torso(); c.clip();
        c.fillStyle = "#1d1b28"; c.fillRect(-r * 0.6, -r * 0.6, r * 1.2, r * 0.28);
        c.strokeStyle = "rgba(11,7,16,0.5)"; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(0, -r * 0.32); c.lineTo(0, r * 0.48); c.stroke();
        c.restore();
        rr(-r * 0.32, r * 0.32, r * 0.64, r * 0.09, r * 0.03); fillInk("#1d1b28", 1.4);
        // open sage cloak front panels over the shoulders
        for (const sx of [-1, 1]) {
          const panel = () => {
            c.beginPath(); c.moveTo(sx * r * 0.5, -r * 0.42); c.lineTo(sx * r * 0.3, -r * 0.42);
            c.quadraticCurveTo(sx * r * 0.34, r * 0.3, sx * r * 0.4, r * 0.95);
            c.lineTo(sx * r * 0.72 - sway, r * 0.94);
            c.quadraticCurveTo(sx * r * 0.66, r * 0.2, sx * r * 0.5, -r * 0.42); c.closePath();
          };
          panel(); fillInk(bodyGrad, 2); flames(panel);
          panel(); c.strokeStyle = h.INK; c.lineWidth = 1.8; c.stroke();
          c.beginPath(); c.moveTo(sx * r * 0.3, -r * 0.42); c.quadraticCurveTo(sx * r * 0.34, r * 0.3, sx * r * 0.4, r * 0.95);
          c.strokeStyle = rgba(pal.rim, 0.55); c.lineWidth = 1; c.stroke();
        }
        // left fist planted on the hip; right arm extended, palm cupped beneath the orb
        const aw = Math.max(3, r * 0.19);
        heroLimb(c, h, -r * 0.44, -r * 0.34, -r * 0.74, -r * 0.02, -r * 0.48, r * 0.3, aw, pal.mid);
        c.beginPath(); c.arc(-r * 0.47, r * 0.31, r * 0.09, 0, TAU); fillInk(NB_SKIN, 1.4);
        heroLimb(c, h, r * 0.44, -r * 0.34, r * 0.66, -r * 0.18, r * 0.66, r * 0.04, aw, pal.mid);
        c.beginPath(); c.ellipse(r * 0.67, r * 0.04, r * 0.1, r * 0.075, 0, 0, TAU); fillInk(NB_SKIN, 1.4);
        // headband tails fluttering behind the head
        const tw = ts ? Math.sin(ts / 230) * r * 0.03 : 0;
        for (const k of [0, 1]) {
          nbStrip(c, nbBezierPts(r * 0.2, -r * 0.86, r * 0.3, -r * 0.88, r * 0.36, -r * (0.82 - k * 0.06) + tw,
            r * (0.46 - k * 0.04), -r * (0.78 - k * 0.1) + tw * (k ? -1 : 1), 6), r * 0.07, r * 0.05);
          fillInk(NB_BAND, 1.2);
        }
        // neck, spiky golden crown, face, brow-guard, side bangs
        rr(-r * 0.09, -r * 0.54, r * 0.18, r * 0.14, r * 0.04); fillInk(NB_SKIN, 1.5);
        const goldHair = nbCloth(c, 0, -r * 1.18, 0, -r * 0.6, NB_GOLD_HAIR);
        poly([-0.22, -0.6, -0.4, -0.76, -0.28, -0.82, -0.44, -0.98, -0.24, -0.96, -0.27, -1.13, -0.08, -1.02, 0.0, -1.18,
          0.09, -1.02, 0.27, -1.13, 0.24, -0.96, 0.44, -0.98, 0.29, -0.82, 0.41, -0.74, 0.22, -0.6]);
        fillInk(goldHair, 1.8);
        nbFace(c, h, r, -0.68, 0.21, NB_SKIN);
        nbHeadband(c, h, r, 0, -0.86, 0.225);
        for (const sx of [-1, 1]) {
          poly([sx * 0.15, -0.93, sx * 0.22, -0.76, sx * 0.25, -0.92]); fillInk(goldHair, 1.2);
          poly([sx * 0.2, -0.84, sx * 0.26, -0.6, sx * 0.15, -0.78]); fillInk(goldHair, 1.2);
        }
        // crimson sage pigment, toad-sage bar pupils, whisker marks, brows
        for (const sx of [-1, 1]) {
          const ex = sx * r * 0.092, ey = -r * 0.71;
          c.beginPath(); c.ellipse(ex, ey - r * 0.01, r * 0.088, r * 0.058, -sx * 0.25, 0, TAU);
          c.fillStyle = rgba("#e2412b", 0.78); c.fill();
          nbEye(c, h, r, ex, ey, sx, "#ffcf3a", (x, y, rad) => {
            c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fillStyle = "#ffcf3a"; c.fill();
            c.fillStyle = "#1a0c08"; c.fillRect(x - rad * 0.7, y - rad * 0.2, rad * 1.4, rad * 0.4);
          });
          if (ts) glowOrb(ex, ey, r * 0.06 * (0.6 + 0.6 * p), "#ff9a3a");
          c.strokeStyle = "rgba(11,7,16,0.7)"; c.lineWidth = Math.max(0.8, r * 0.018);
          c.beginPath();
          for (let k = 0; k < 3; k++) { const y = -r * (0.63 - k * 0.035); c.moveTo(sx * r * 0.12, y); c.lineTo(sx * r * 0.19, y + r * 0.006 * (k - 1)); }
          c.moveTo(sx * r * 0.04, -r * 0.785); c.lineTo(sx * r * 0.15, -r * 0.8);
          c.stroke();
        }
        c.beginPath(); c.moveTo(-r * 0.07, -r * 0.565); c.quadraticCurveTo(0, -r * 0.5, r * 0.07, -r * 0.565); c.closePath();
        c.fillStyle = "#ffffff"; c.fill(); c.strokeStyle = h.INK; c.lineWidth = 1.2; c.stroke();
        // swirling azure rasen-orb above the right palm
        const ox = r * 0.7, oy = -r * 0.21, oR = r * 0.19;
        glowOrb(ox, oy, oR * (ts ? 1.75 + 0.25 * p : 1.7), NB_CHAKRA);
        const og = c.createRadialGradient(ox - oR * 0.3, oy - oR * 0.3, oR * 0.08, ox, oy, oR);
        og.addColorStop(0, "#ffffff"); og.addColorStop(0.45, "#a6e6ff"); og.addColorStop(1, "#1f78d2");
        c.beginPath(); c.arc(ox, oy, oR, 0, TAU); c.fillStyle = og; c.fill();
        c.strokeStyle = "#0d3a72"; c.lineWidth = 1.2; c.stroke();
        c.save(); c.beginPath(); c.arc(ox, oy, oR * 0.96, 0, TAU); c.clip();
        c.translate(ox, oy); c.rotate(ts ? ts / 110 : 0.7);
        c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = Math.max(1, r * 0.024);
        for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(0, 0, oR * (0.28 + 0.17 * i), i * 1.6, i * 1.6 + 2.3); c.stroke(); }
        c.restore();
        // orbiting chakra rings; motes ride them while animated
        for (let k = 0; k < 2; k++) {
          const rx = oR * 1.7, ry = oR * 0.48;
          c.save(); c.translate(ox, oy); c.rotate(k ? 0.65 : -0.55);
          c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU);
          c.strokeStyle = rgba(NB_CHAKRA, ts ? 0.45 + 0.3 * p : 0.6); c.lineWidth = Math.max(0.8, r * 0.018); c.stroke();
          if (ts) {
            c.globalCompositeOperation = "lighter"; c.fillStyle = "#e6fbff";
            for (let i = 0; i < 5; i++) {
              const a = (k ? -1 : 1) * ts / (k ? 240 : 310) + i * TAU / 5;
              c.beginPath(); c.arc(Math.cos(a) * rx, Math.sin(a) * ry, r * (0.02 + 0.01 * (i % 2)), 0, TAU); c.fill();
            }
          }
          c.restore();
        }
      },

      /* Crimson Ocular Rogue — high-collared midnight tunic, twisted rope belt knot, parted dark bangs,
         spinning pinwheel-shard crimson eyes and a crackling azure/violet lightning blade in the right palm. */
      reaper(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(160), flutter = ts ? Math.sin(ts / 300) * r * 0.025 : 0;
        // waist cloth hanging behind the legs (base silhouette)
        c.beginPath(); c.moveTo(-r * 0.36, r * 0.3); c.lineTo(r * 0.36, r * 0.3);
        c.quadraticCurveTo(r * 0.5, r * 0.6, r * 0.46 + flutter, r * 0.9);
        c.lineTo(-r * 0.46 + flutter, r * 0.9);
        c.quadraticCurveTo(-r * 0.5, r * 0.6, -r * 0.36, r * 0.3); c.closePath();
        fillInk(nbCloth(c, 0, r * 0.3, 0, r * 0.9, NB_NIGHT), 2.2); c.shadowBlur = 0; // drop shadow only on the base silhouette
        // katana slung across the back; the wrapped hilt peeks over the right shoulder
        c.beginPath(); c.moveTo(-r * 0.4, r * 0.36); c.lineTo(r * 0.3, -r * 0.5);
        c.strokeStyle = h.INK; c.lineWidth = r * 0.1 + 2.4; c.stroke();
        c.strokeStyle = "#2c2a3a"; c.lineWidth = r * 0.1; c.stroke();
        c.beginPath(); c.moveTo(r * 0.3, -r * 0.5); c.lineTo(r * 0.43, -r * 0.66);
        c.strokeStyle = h.INK; c.lineWidth = r * 0.07 + 2.2; c.stroke();
        c.strokeStyle = "#d9d2c2"; c.lineWidth = r * 0.07; c.stroke();
        c.strokeStyle = "#3a2c50"; c.lineWidth = 1;
        c.beginPath();
        for (const t of [0.3, 0.55, 0.8]) {
          const x = r * (0.3 + 0.13 * t), y = -r * (0.5 + 0.16 * t);
          c.moveTo(x - r * 0.03, y - r * 0.01); c.lineTo(x + r * 0.03, y + r * 0.01);
        }
        c.stroke();
        c.beginPath(); c.ellipse(r * 0.3, -r * 0.5, r * 0.075, r * 0.03, -0.9, 0, TAU);
        fillInk(metal(r * 0.24, -r * 0.55, r * 0.36, -r * 0.45, ...NB_PLATE), 1);
        // legs + tunic with an open V neckline
        nbLegs(c, h, r, "#2b2a3c", "#3b3652");
        const torso = () => jlTorso(c, r, 0.44, 0.3, -0.42, 0.48);
        torso(); fillInk(bodyGrad, 2.4);
        c.save(); torso(); c.clip();
        const sheen = c.createLinearGradient(-r * 0.5, -r * 0.45, r * 0.25, r * 0.2);
        sheen.addColorStop(0, "rgba(255,255,255,0.2)"); sheen.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = sheen; c.fillRect(-r * 0.6, -r * 0.55, r * 1.2, r * 1.1);
        c.restore();
        poly([-0.13, -0.45, 0.13, -0.45, 0, -0.14]); fillInk(NB_SKIN, 1.4);
        // twisted rope belt with a looped knot and hanging tails
        rr(-r * 0.34, r * 0.3, r * 0.68, r * 0.1, r * 0.05); fillInk(nbCloth(c, 0, r * 0.3, 0, r * 0.4, NB_ROPE), 1.6);
        c.strokeStyle = "rgba(11,7,16,0.5)"; c.lineWidth = 1;
        c.beginPath();
        for (let i = 0; i < 9; i++) { const x = (-0.3 + i * 0.075) * r; c.moveTo(x, r * 0.305); c.lineTo(x + r * 0.05, r * 0.395); }
        c.stroke();
        const kx = -r * 0.1, ky = r * 0.35;
        for (const k of [0, 1]) {
          const ox = k * r * 0.06;
          nbStrip(c, nbBezierPts(kx + ox, ky, kx + ox - r * 0.05, ky + r * 0.15, kx + ox - r * 0.02 + flutter, ky + r * 0.3,
            kx + ox - r * 0.06 + flutter, ky + r * 0.42, 6), r * 0.06, r * 0.04);
          fillInk(NB_ROPE[1], 1.2);
        }
        for (const sx of [-1, 1]) {
          c.beginPath(); c.ellipse(kx + sx * r * 0.075, ky, r * 0.07, r * 0.045, sx * 0.4, 0, TAU); fillInk(NB_ROPE[1], 1.3);
        }
        c.beginPath(); c.arc(kx, ky, r * 0.045, 0, TAU); fillInk(NB_ROPE[0], 1.2);
        // high stand-up collar
        c.beginPath(); c.moveTo(-r * 0.3, -r * 0.4); c.lineTo(-r * 0.27, -r * 0.62);
        c.quadraticCurveTo(0, -r * 0.7, r * 0.27, -r * 0.62); c.lineTo(r * 0.3, -r * 0.4);
        c.quadraticCurveTo(0, -r * 0.48, -r * 0.3, -r * 0.4); c.closePath();
        fillInk(nbCloth(c, -r * 0.3, 0, r * 0.3, 0, NB_NIGHT), 1.8);
        c.beginPath(); c.moveTo(-r * 0.27, -r * 0.62); c.quadraticCurveTo(0, -r * 0.7, r * 0.27, -r * 0.62);
        c.strokeStyle = rgba(pal.rim, 0.6); c.lineWidth = 1; c.stroke();
        // right arm thrust down-forward; left hand grips the right wrist
        const aw = Math.max(3, r * 0.18);
        heroLimb(c, h, r * 0.44, -r * 0.34, r * 0.72, -r * 0.1, r * 0.64, r * 0.16, aw, pal.deep);
        heroLimb(c, h, -r * 0.44, -r * 0.34, -r * 0.3, r * 0.25, r * 0.46, r * 0.14, aw, pal.deep);
        c.beginPath(); c.arc(r * 0.48, r * 0.14, r * 0.085, 0, TAU); fillInk(NB_SKIN, 1.3);
        // crackling lightning blade gathered in the open right palm
        const lx = r * 0.68, ly = r * 0.2;
        glowOrb(lx, ly, r * (ts ? 0.24 + 0.08 * p : 0.26), NB_CHAKRA);
        c.beginPath(); c.arc(r * 0.65, r * 0.18, r * 0.075, 0, TAU); fillInk(NB_SKIN, 1.3);
        for (let i = 0; i < 6; i++) {
          const a = -0.9 + i * 0.42 + (ts ? (heroHash(Math.floor(ts / 90) + i) - 0.5) * 0.3 : 0);
          const L = r * (0.28 + 0.14 * heroHash(i * 3.1 + 1));
          heroBolt(c, h, ts, lx, ly, lx + Math.cos(a) * L, ly + Math.sin(a) * L, Math.max(1, r * 0.026), i % 2 ? NB_VIOLET : NB_CHAKRA, i + 1, 4);
        }
        if (ts) {
          c.save(); c.globalCompositeOperation = "lighter"; c.strokeStyle = "#e9f6ff"; c.lineWidth = 1;
          const f = Math.floor(ts / 60);
          c.beginPath();
          for (let i = 0; i < 7; i++) {
            const a = heroHash(f * 3.3 + i) * TAU, d = r * (0.16 + 0.26 * heroHash(f + i * 9.1));
            const x0 = lx + Math.cos(a) * d, y0 = ly + Math.sin(a) * d * 0.8;
            c.moveTo(x0, y0); c.lineTo(x0 + Math.cos(a) * r * 0.05, y0 + Math.sin(a) * r * 0.05);
          }
          c.stroke(); c.restore();
        }
        glowOrb(lx, ly, r * 0.1, "#ffffff");
        // neck, swept-back dark spikes, face, cap of hair with long parted bangs
        rr(-r * 0.09, -r * 0.56, r * 0.18, r * 0.14, r * 0.04); fillInk(NB_SKIN, 1.5);
        const hair = nbCloth(c, -r * 0.2, -r * 1.1, r * 0.3, -r * 0.5, NB_DARK_HAIR);
        poly([-0.2, -0.62, -0.26, -0.86, -0.16, -1.02, 0.04, -1.06, 0.2, -1.14, 0.22, -1.0, 0.4, -1.04, 0.32, -0.88,
          0.44, -0.8, 0.27, -0.72, 0.22, -0.6]);
        fillInk(hair, 1.8);
        nbFace(c, h, r, -0.68, 0.205, NB_SKIN);
        c.beginPath(); c.moveTo(-r * 0.23, -r * 0.76); c.quadraticCurveTo(-r * 0.26, -r * 1.02, 0, -r * 1.02);
        c.quadraticCurveTo(r * 0.26, -r * 1.02, r * 0.23, -r * 0.76); c.lineTo(r * 0.14, -r * 0.88); c.lineTo(r * 0.03, -r * 0.84);
        c.lineTo(0, -r * 0.9); c.lineTo(-r * 0.03, -r * 0.84); c.lineTo(-r * 0.14, -r * 0.88); c.closePath();
        fillInk(hair, 1.6);
        for (const sx of [-1, 1]) {
          poly([sx * 0.05, -0.92, sx * 0.25, -0.86, sx * 0.27, -0.62, sx * 0.21, -0.48, sx * 0.17, -0.7, sx * 0.1, -0.82]);
          fillInk(hair, 1.4);
        }
        // spinning pinwheel-shard crimson eyes, stern brows, tight mouth
        for (const sx of [-1, 1]) {
          const ex = sx * r * 0.09, ey = -r * 0.71;
          nbEye(c, h, r, ex, ey, sx, NB_CRIMSON, (x, y, rad) => nbOcular(c, ts, x, y, rad, sx));
          glowOrb(ex, ey, r * 0.055 * (ts ? 0.7 + 0.6 * p : 0.8), NB_CRIMSON);
          c.beginPath(); c.moveTo(sx * r * 0.035, -r * 0.765); c.lineTo(sx * r * 0.15, -r * 0.8);
          c.strokeStyle = h.INK; c.lineWidth = Math.max(1.2, r * 0.025); c.stroke();
        }
        c.beginPath(); c.moveTo(-r * 0.05, -r * 0.565); c.lineTo(r * 0.05, -r * 0.57);
        c.strokeStyle = "rgba(11,7,16,0.7)"; c.lineWidth = 1.2; c.stroke();
      },

      /* Sand Fortress — huge banded sand gourd on the back, a crystalline sand barrier arching over the
         shoulders, a swirling sand vortex around the base, pale skin, crimson brow glyph and kohl-rimmed eyes. */
      juggernaut(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, rgba, rr } = h;
        // crystalline sand barrier arching behind the shoulders (base silhouette)
        const by = -r * 0.18, R0 = r * 0.82, R1 = r * 0.97, a0 = Math.PI * 1.08, a1 = Math.PI * 1.92;
        c.beginPath(); c.arc(0, by, R1, a0, a1); c.arc(0, by, R0, a1, a0, true); c.closePath();
        fillInk(rgba(NB_SAND[1], 0.55), 1.8); c.shadowBlur = 0; // drop shadow only on the base silhouette
        const N = 9;
        for (let i = 0; i < N; i++) {
          const s0 = a0 + (a1 - a0) * i / N, s1 = a0 + (a1 - a0) * (i + 1) / N;
          c.beginPath(); c.arc(0, by, R1, s0, s1); c.arc(0, by, R0, s1, s0, true); c.closePath();
          const sh = ts ? 0.26 + 0.22 * Math.sin(ts / 300 + i * 0.9) : (i % 2 ? 0.18 : 0.38);
          c.fillStyle = `rgba(255,248,220,${sh.toFixed(3)})`; c.fill();
          c.strokeStyle = rgba(NB_SAND[2], 0.8); c.lineWidth = 1; c.stroke();
        }
        // banded sand gourd strapped across the back
        const gGrad = (x, y, R) => {
          const g = c.createRadialGradient(x - R * 0.35, y - R * 0.35, R * 0.1, x, y, R);
          g.addColorStop(0, NB_SAND[0]); g.addColorStop(0.6, NB_SAND[1]); g.addColorStop(1, NB_SAND[2]);
          return g;
        };
        const gx = r * 0.3, gy = -r * 0.06, gR = r * 0.42, ux = r * 0.32, uy = -r * 0.66, uR = r * 0.2;
        c.beginPath(); c.arc(gx, gy, gR, 0, TAU); fillInk(gGrad(gx, gy, gR), 2.2);
        c.beginPath(); c.arc(gx, gy, gR * 0.8, Math.PI * 1.2, Math.PI * 1.75);
        c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = Math.max(1, r * 0.03); c.stroke();
        rr(ux - r * 0.09, uy, r * 0.18, gy - gR - uy + r * 0.06, r * 0.04); fillInk(NB_SAND[1], 1.6);
        c.beginPath(); c.arc(ux, uy, uR, 0, TAU); fillInk(gGrad(ux, uy, uR), 2);
        rr(ux - r * 0.11, gy - gR - r * 0.05, r * 0.22, r * 0.07, r * 0.02); fillInk("#5a3b22", 1.3);
        rr(ux - r * 0.06, uy - uR - r * 0.07, r * 0.12, r * 0.09, r * 0.02); fillInk("#6b4a2c", 1.3);
        // swirling sand vortex: back half behind the body, front half drawn last
        const vortex = (front) => {
          const s = front ? 0 : Math.PI;
          c.save();
          c.beginPath(); c.ellipse(0, r * 0.94, r * 0.98, r * 0.2, 0, s, s + Math.PI);
          c.strokeStyle = h.INK; c.lineWidth = r * 0.09 + 2.2; c.stroke();
          c.strokeStyle = nbCloth(c, -r, 0, r, 0, NB_SAND); c.lineWidth = r * 0.09; c.stroke();
          c.setLineDash([r * 0.06, r * 0.05]); c.lineDashOffset = ts ? -ts / 30 : 0;
          c.strokeStyle = rgba(NB_SAND[2], 0.7); c.lineWidth = r * 0.03; c.stroke();
          c.setLineDash([]);
          c.restore();
          c.fillStyle = "#8a6a34";
          for (let i = 0; i < 9; i++) {
            const f = ((i + 0.5) / 9 + (ts ? ts / 4200 : 0)) % 1, a = s + f * Math.PI;
            const k = 0.9 + 0.2 * heroHash(i * 3.7 + (front ? 11 : 0));
            const x = Math.cos(a) * r * 0.98 * k, y = r * 0.94 + Math.sin(a) * r * 0.2 * k - r * 0.08 * heroHash(i + 5);
            c.beginPath(); c.arc(x, y, Math.max(0.7, r * 0.018), 0, TAU); c.fill();
          }
        };
        vortex(false);
        // legs, long coat with a front slit, gourd strap
        nbLegs(c, h, r, pal.deep);
        c.beginPath(); c.moveTo(-r * 0.44, -r * 0.42); c.quadraticCurveTo(-r * 0.52, r * 0.2, -r * 0.5, r * 0.8);
        c.lineTo(r * 0.5, r * 0.8); c.quadraticCurveTo(r * 0.52, r * 0.2, r * 0.44, -r * 0.42);
        c.quadraticCurveTo(0, -r * 0.52, -r * 0.44, -r * 0.42); c.closePath();
        fillInk(bodyGrad, 2.4);
        c.beginPath(); c.moveTo(0, r * 0.42); c.lineTo(0, r * 0.8);
        c.strokeStyle = "rgba(11,7,16,0.55)"; c.lineWidth = 1.4; c.stroke();
        poly([0.34, -0.47, 0.5, -0.36, -0.34, 0.46, -0.48, 0.36]);
        fillInk(nbCloth(c, -r * 0.4, r * 0.4, r * 0.4, -r * 0.4, ["#b58e5c", "#7d5a36", "#3e2a16"]), 1.6);
        c.beginPath(); c.arc(-r * 0.3, r * 0.3, r * 0.06, 0, TAU); fillInk(metal(0, r * 0.24, 0, r * 0.36, ...NB_PLATE), 1.2);
        // stoic crossed arms
        const aw = Math.max(3, r * 0.19);
        heroLimb(c, h, r * 0.44, -r * 0.34, r * 0.66, r * 0.12, -r * 0.24, r * 0.06, aw, pal.mid);
        c.beginPath(); c.arc(-r * 0.26, r * 0.05, r * 0.085, 0, TAU); fillInk(NB_PALE, 1.3);
        heroLimb(c, h, -r * 0.44, -r * 0.34, -r * 0.66, r * 0.02, r * 0.26, -r * 0.06, aw, pal.mid);
        c.beginPath(); c.arc(r * 0.28, -r * 0.07, r * 0.085, 0, TAU); fillInk(NB_PALE, 1.3);
        // neck, messy crimson hair, pale face, fringe
        rr(-r * 0.09, -r * 0.56, r * 0.18, r * 0.14, r * 0.04); fillInk(NB_PALE, 1.5);
        const hair = nbCloth(c, 0, -r * 1.1, 0, -r * 0.6, NB_RED_HAIR);
        poly([-0.24, -0.66, -0.34, -0.8, -0.26, -0.88, -0.32, -1.0, -0.14, -0.98, -0.1, -1.1, 0.04, -1.0, 0.16, -1.08,
          0.18, -0.96, 0.32, -0.98, 0.26, -0.86, 0.34, -0.76, 0.24, -0.66]);
        fillInk(hair, 1.8);
        nbFace(c, h, r, -0.68, 0.205, NB_PALE);
        c.beginPath(); c.moveTo(-r * 0.235, -r * 0.78); c.quadraticCurveTo(-r * 0.25, -r * 1.02, 0, -r * 1.02);
        c.quadraticCurveTo(r * 0.25, -r * 1.02, r * 0.235, -r * 0.78);
        for (const [x, y] of [[0.2, -0.9], [0.16, -0.95], [0.03, -0.95], [-0.02, -0.86], [-0.07, -0.93], [-0.12, -0.82], [-0.16, -0.92], [-0.2, -0.78]]) c.lineTo(x * r, y * r);
        c.closePath(); fillInk(hair, 1.5);
        // crimson brow glyph (original stroke mark)
        c.save(); c.translate(r * 0.1, -r * 0.855);
        c.strokeStyle = "#c2262e"; c.lineWidth = Math.max(0.9, r * 0.018);
        c.beginPath(); c.moveTo(-r * 0.04, -r * 0.03); c.lineTo(r * 0.04, -r * 0.03);
        c.moveTo(-r * 0.03, 0); c.quadraticCurveTo(0, r * 0.03, r * 0.03, 0);
        c.moveTo(0, -r * 0.045); c.lineTo(0, r * 0.045);
        c.moveTo(-r * 0.035, r * 0.035); c.lineTo(-r * 0.015, r * 0.05); c.moveTo(r * 0.035, r * 0.035); c.lineTo(r * 0.015, r * 0.05);
        c.stroke(); c.restore();
        // kohl-rimmed, browless eyes with pale teal irises
        for (const sx of [-1, 1]) {
          const ex = sx * r * 0.09, ey = -r * 0.71;
          c.beginPath(); c.ellipse(ex, ey, r * 0.09, r * 0.06, -sx * 0.15, 0, TAU); c.fillStyle = "#1a1018"; c.fill();
          nbEye(c, h, r, ex, ey, sx, "#8fe0c8", (x, y, rad) => {
            c.beginPath(); c.arc(x, y, rad * 0.85, 0, TAU); c.fillStyle = "#8fe0c8"; c.fill();
            c.beginPath(); c.arc(x, y, rad * 0.22, 0, TAU); c.fillStyle = "#120c14"; c.fill();
          });
        }
        c.beginPath(); c.moveTo(-r * 0.05, -r * 0.57); c.lineTo(r * 0.05, -r * 0.57);
        c.strokeStyle = "rgba(11,7,16,0.65)"; c.lineWidth = 1.1; c.stroke();
        vortex(true);
      },

      /* Masked Copy-Tactician — swept silver spikes, cloth mask over mouth and neck, slanted brow-guard over
         one eye, flak vest with scroll pouches; the visible eye flares crimson and an azure lightning blade
         hums at the hip while animated. */
      trickster(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, energyBlade, rgba, rr } = h;
        const flash = ts ? Math.pow(Math.max(0, Math.sin(ts / 650)), 6) : 0;
        const UNDER = "#232839";
        nbLegs(c, h, r, "#262b3f"); c.shadowBlur = 0; // drop shadow only on the base silhouette
        // flak vest with scroll pouches over a dark undershirt
        const torso = () => jlTorso(c, r, 0.44, 0.31, -0.42, 0.48);
        torso(); fillInk(bodyGrad, 2.4);
        c.save(); torso(); c.clip();
        c.strokeStyle = "rgba(11,7,16,0.45)"; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(0, -r * 0.42); c.lineTo(0, r * 0.48); c.stroke();
        c.restore();
        for (const sx of [-1, 1]) {
          const x = sx * r * 0.22 - r * 0.065;
          rr(x, -r * 0.3, r * 0.13, r * 0.26, r * 0.03); fillInk(pal.mid, 1.3);
          c.strokeStyle = "rgba(11,7,16,0.5)"; c.lineWidth = 1;
          c.beginPath();
          for (const y of [-0.24, -0.16, -0.08]) { c.moveTo(x + r * 0.015, y * r); c.lineTo(x + r * 0.115, y * r); }
          c.stroke();
        }
        poly([-0.28, -0.42, -0.24, -0.58, 0.24, -0.58, 0.28, -0.42]); fillInk(pal.deep, 1.6);
        rr(-r * 0.32, r * 0.32, r * 0.64, r * 0.09, r * 0.03); fillInk(UNDER, 1.4);
        // left hand raised in a hand-seal at the chest
        const aw = Math.max(3, r * 0.18);
        heroLimb(c, h, -r * 0.44, -r * 0.34, -r * 0.62, r * 0.06, -r * 0.1, -r * 0.08, aw, UNDER);
        rr(-r * 0.115, -r * 0.24, r * 0.05, r * 0.14, r * 0.02); fillInk(NB_SKIN, 1.1);
        c.beginPath(); c.arc(-r * 0.09, -r * 0.08, r * 0.075, 0, TAU); fillInk(UNDER, 1.3);
        // right arm low, gripping a crackling azure lightning blade at the hip
        heroLimb(c, h, r * 0.44, -r * 0.34, r * 0.66, -r * 0.04, r * 0.5, r * 0.3, aw, UNDER);
        energyBlade(r * 0.54, r * 0.34, r * 0.94, r * 0.8, Math.max(2, r * 0.06), NB_CHAKRA);
        heroBolt(c, h, ts, r * 0.54, r * 0.34, r * 0.94, r * 0.8, Math.max(1, r * 0.02), NB_CHAKRA, 4, 5, r * 0.06);
        if (ts) heroBolt(c, h, ts, r * 0.58, r * 0.38, r * 0.9, r * 0.76, Math.max(0.8, r * 0.016), NB_VIOLET, 9, 4, r * 0.08);
        c.beginPath(); c.arc(r * 0.5, r * 0.31, r * 0.085, 0, TAU); fillInk(UNDER, 1.4);
        rr(r * 0.45, r * 0.27, r * 0.1, r * 0.06, r * 0.015); fillInk(metal(0, r * 0.27, 0, r * 0.33, ...NB_PLATE), 1);
        // swept silver spikes, face, cloth mask over nose, mouth and neck
        const hair = nbCloth(c, -r * 0.3, -r * 1.2, r * 0.4, -r * 0.6, NB_SILVER_HAIR);
        poly([-0.22, -0.66, -0.3, -0.84, -0.22, -0.9, -0.3, -1.02, -0.12, -1.0, -0.1, -1.16, 0.04, -1.04, 0.14, -1.2,
          0.2, -1.04, 0.36, -1.12, 0.32, -0.96, 0.48, -0.94, 0.33, -0.82, 0.42, -0.7, 0.23, -0.66]);
        fillInk(hair, 1.8);
        nbFace(c, h, r, -0.68, 0.205, NB_SKIN);
        c.beginPath(); c.moveTo(-r * 0.215, -r * 0.7); c.quadraticCurveTo(-r * 0.1, -r * 0.665, 0, -r * 0.71);
        c.quadraticCurveTo(r * 0.1, -r * 0.665, r * 0.215, -r * 0.7);
        c.quadraticCurveTo(r * 0.21, -r * 0.52, r * 0.18, -r * 0.4); c.lineTo(-r * 0.18, -r * 0.4);
        c.quadraticCurveTo(-r * 0.21, -r * 0.52, -r * 0.215, -r * 0.7); c.closePath();
        fillInk(nbCloth(c, -r * 0.22, 0, r * 0.22, 0, ["#3c4462", "#272d44", "#141827"]), 1.6);
        c.strokeStyle = "rgba(255,255,255,0.14)"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(0, -r * 0.7); c.lineTo(0, -r * 0.62);
        c.moveTo(-r * 0.15, -r * 0.5); c.quadraticCurveTo(0, -r * 0.46, r * 0.15, -r * 0.5); c.stroke();
        // slanted brow-guard hiding the right eye
        nbHeadband(c, h, r, 0.02, -0.82, 0.25, 0.42);
        // the visible eye: lazy and half-lidded, flashing a crimson ocular flare while animated
        const ex = -r * 0.095, ey = -r * 0.74;
        nbEye(c, h, r, ex, ey, -1, "#3a3640", (x, y, rad) => {
          c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fillStyle = "#3a3640"; c.fill();
          c.beginPath(); c.arc(x, y, rad * 0.45, 0, TAU); c.fillStyle = "#120c14"; c.fill();
          if (flash > 0.02) { c.globalAlpha *= flash; nbOcular(c, ts, x, y, rad, 1); }
        });
        c.beginPath(); c.moveTo(ex - r * 0.08, ey - r * 0.005); c.quadraticCurveTo(ex, ey - r * 0.04, ex + r * 0.08, ey - r * 0.03);
        c.lineTo(ex + r * 0.08, ey - r * 0.06); c.lineTo(ex - r * 0.08, ey - r * 0.06); c.closePath();
        c.fillStyle = NB_SKIN; c.fill();
        c.beginPath(); c.moveTo(ex - r * 0.08, ey - r * 0.005); c.quadraticCurveTo(ex, ey - r * 0.04, ex + r * 0.08, ey - r * 0.03);
        c.strokeStyle = h.INK; c.lineWidth = Math.max(1.2, r * 0.026); c.stroke();
        if (flash > 0.02) {
          glowOrb(ex, ey, r * 0.13 * flash, NB_CRIMSON);
          c.save(); c.globalCompositeOperation = "lighter";
          c.strokeStyle = rgba(NB_CRIMSON, 0.7 * flash); c.lineWidth = Math.max(1, r * 0.02);
          c.beginPath(); c.moveTo(ex - r * 0.2 * flash, ey); c.lineTo(ex + r * 0.2 * flash, ey); c.stroke();
          c.restore();
        }
      },

      /* Verdant Lotus Striker — glossy bowl cut, bold brows, green martial suit under a flak vest, orange leg
         warmers, bandaged hands, crouching lotus stance; an emerald gate-release steam aura surges while animated. */
      wildrider(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(200), lw = Math.max(3, r * 0.2);
        const suit = nbCloth(c, -r * 0.6, -r * 0.5, r * 0.6, r * 0.9, NB_GREEN);
        const warmer = nbCloth(c, -r * 0.7, 0, r * 0.9, 0, NB_ORANGE);
        // emerald gate-release steam (animated only)
        if (ts) {
          c.save(); c.shadowBlur = 0; c.shadowColor = "transparent"; c.globalCompositeOperation = "lighter";
          const aura = c.createRadialGradient(0, -r * 0.1, r * 0.2, 0, -r * 0.1, r * 1.05);
          aura.addColorStop(0, rgba(NB_EMERALD, 0.16 + 0.12 * p)); aura.addColorStop(1, rgba(NB_EMERALD, 0));
          c.fillStyle = aura; c.beginPath(); c.arc(0, -r * 0.1, r * 1.05, 0, TAU); c.fill();
          for (let i = 0; i < 12; i++) {
            const t = (ts / 900 + heroHash(i * 4.7)) % 1, x0 = (heroHash(i * 2.3) - 0.5) * 1.5 * r;
            const x = x0 + Math.sin(ts / 260 + i) * r * 0.06 * t, y = r * (0.9 - 1.8 * t), rad = r * (0.08 + 0.12 * t);
            const g = c.createRadialGradient(x, y, 0, x, y, rad);
            g.addColorStop(0, rgba(NB_EMERALD, 0.5 * (1 - t))); g.addColorStop(1, rgba(NB_EMERALD, 0));
            c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill();
          }
          c.restore();
        }
        // back leg stretched out behind (base silhouette), orange warmer and sandal
        heroLimb(c, h, r * 0.12, r * 0.42, r * 0.34, r * 0.5, r * 0.5, r * 0.7, lw * 1.1, suit);
        c.shadowBlur = 0; // drop shadow only on the base silhouette
        heroLimb(c, h, r * 0.5, r * 0.7, r * 0.66, r * 0.86, r * 0.82, r * 0.99, lw, suit);
        heroLimb(c, h, r * 0.58, r * 0.8, r * 0.7, r * 0.9, r * 0.8, r * 0.98, lw * 1.25, warmer);
        poly([0.74, 0.98, 0.98, 1.02, 0.98, 1.1, 0.72, 1.1]); fillInk(NB_SANDAL, 1.5);
        // front leg deeply bent in a lunge
        heroLimb(c, h, -r * 0.12, r * 0.42, -r * 0.36, r * 0.4, -r * 0.48, r * 0.6, lw * 1.1, suit);
        heroLimb(c, h, -r * 0.48, r * 0.6, -r * 0.56, r * 0.8, -r * 0.54, r * 1.0, lw, suit);
        heroLimb(c, h, -r * 0.51, r * 0.7, -r * 0.55, r * 0.85, -r * 0.54, r * 0.98, lw * 1.25, warmer);
        c.strokeStyle = "rgba(11,7,16,0.4)"; c.lineWidth = 1;
        c.beginPath();
        for (const y of [0.78, 0.86, 0.94]) { c.moveTo(-r * 0.62, y * r); c.lineTo(-r * 0.44, y * r); }
        for (const t of [0.3, 0.6]) { const x = r * (0.58 + 0.22 * t), y = r * (0.8 + 0.18 * t); c.moveTo(x - r * 0.05, y + r * 0.06); c.lineTo(x + r * 0.05, y - r * 0.06); }
        c.stroke();
        poly([-0.68, 1.0, -0.42, 1.0, -0.4, 1.1, -0.7, 1.1]); fillInk(NB_SANDAL, 1.5);
        // upper body dropped into the crouch
        c.save(); c.translate(-r * 0.04, r * 0.05);
        // rear arm tucked behind the back
        heroLimb(c, h, r * 0.42, -r * 0.34, r * 0.66, -r * 0.02, r * 0.44, r * 0.2, lw, suit);
        c.beginPath(); c.arc(r * 0.44, r * 0.21, r * 0.085, 0, TAU); fillInk(NB_WRAP, 1.3);
        // green suit torso under an open flak vest
        const torso = () => jlTorso(c, r, 0.44, 0.31, -0.42, 0.46);
        torso(); fillInk(suit, 2.4);
        c.save(); torso(); c.clip();
        for (const sx of [-1, 1]) {
          poly([sx * 0.56, -0.5, sx * 0.1, -0.5, sx * 0.07, 0.5, sx * 0.5, 0.5]); fillInk(bodyGrad, 1.6);
          rr(sx * r * 0.24 - r * 0.07, -r * 0.18, r * 0.14, r * 0.12, r * 0.02); fillInk(pal.mid, 1.1);
        }
        c.restore();
        torso(); c.strokeStyle = h.INK; c.lineWidth = 2.2; c.stroke();
        // brow-guard worn as a belt
        nbHeadband(c, h, r, 0, 0.35, 0.33, 0, "#c8232c");
        // lead arm thrust forward, open palm beckoning, bandaged forearm
        heroLimb(c, h, -r * 0.42, -r * 0.34, -r * 0.66, -r * 0.32, -r * 0.8, -r * 0.14, lw, suit);
        heroLimb(c, h, -r * 0.7, -r * 0.27, -r * 0.76, -r * 0.21, -r * 0.8, -r * 0.14, lw * 0.92, NB_WRAP);
        c.strokeStyle = "rgba(11,7,16,0.35)"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(-r * 0.78, -r * 0.27); c.lineTo(-r * 0.7, -r * 0.2); c.moveTo(-r * 0.83, -r * 0.2); c.lineTo(-r * 0.75, -r * 0.14); c.stroke();
        c.beginPath(); c.ellipse(-r * 0.84, -r * 0.1, r * 0.07, r * 0.095, 0.4, 0, TAU); fillInk(NB_SKIN, 1.3);
        // glossy bowl cut, round face, bold brows, gritted grin
        rr(-r * 0.09, -r * 0.54, r * 0.18, r * 0.14, r * 0.04); fillInk(NB_SKIN, 1.5);
        nbFace(c, h, r, -0.68, 0.2, NB_SKIN);
        const bowl = nbCloth(c, -r * 0.25, -r * 1.05, r * 0.25, -r * 0.6, ["#3a3f58", "#12131c", "#050508"]);
        c.beginPath(); c.moveTo(-r * 0.255, -r * 0.58); c.lineTo(-r * 0.255, -r * 0.8);
        c.arc(0, -r * 0.8, r * 0.255, Math.PI, TAU); c.lineTo(r * 0.255, -r * 0.58); c.lineTo(r * 0.2, -r * 0.58);
        c.lineTo(r * 0.2, -r * 0.8); c.lineTo(-r * 0.2, -r * 0.8); c.lineTo(-r * 0.2, -r * 0.58); c.closePath();
        fillInk(bowl, 1.8);
        c.beginPath(); c.arc(0, -r * 0.8, r * 0.2, Math.PI * 1.15, Math.PI * 1.45);
        c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = Math.max(1, r * 0.03); c.stroke();
        for (const sx of [-1, 1]) {
          c.beginPath(); c.ellipse(sx * r * 0.09, -r * 0.765, r * 0.065, r * 0.026, sx * 0.15, 0, TAU); c.fillStyle = "#0c0b10"; c.fill();
          c.beginPath(); c.arc(sx * r * 0.09, -r * 0.705, r * 0.04, 0, TAU); fillInk("#fbf7ef", 1.2);
          c.beginPath(); c.arc(sx * r * 0.09, -r * 0.705, r * 0.017, 0, TAU); c.fillStyle = "#0c0b10"; c.fill();
        }
        rr(-r * 0.08, -r * 0.605, r * 0.16, r * 0.05, r * 0.015); fillInk("#ffffff", 1.2);
        c.beginPath(); c.moveTo(-r * 0.075, -r * 0.58); c.lineTo(r * 0.075, -r * 0.58);
        c.strokeStyle = "rgba(11,7,16,0.5)"; c.lineWidth = 0.8; c.stroke();
        // gleaming-grin star (animated)
        const tw = ts ? Math.pow(Math.max(0, Math.sin(ts / 520)), 8) : 0;
        if (tw > 0.05) {
          const gx = r * 0.11, gy = -r * 0.6, s = r * 0.08 * tw;
          c.save(); c.globalCompositeOperation = "lighter"; c.fillStyle = rgba("#ffffff", 0.9);
          c.beginPath(); c.moveTo(gx, gy - s); c.lineTo(gx + s * 0.25, gy); c.lineTo(gx, gy + s); c.lineTo(gx - s * 0.25, gy); c.closePath(); c.fill();
          c.beginPath(); c.moveTo(gx - s, gy); c.lineTo(gx, gy + s * 0.25); c.lineTo(gx + s, gy); c.lineTo(gx, gy - s * 0.25); c.closePath(); c.fill();
          c.restore();
          glowOrb(gx, gy, s, NB_EMERALD);
        }
        c.restore();
      },

      /* Wind Shuriken Scout — dark mesh tunic, hooded cowl leaving only the eyes, an oversized four-bladed
         demon-wind shuriken (spinning while animated), hip pouch with paper talismans and a kunai holster. */
      skirmisher(c, pal, r, ts, h) {
        const { fillInk } = h;
        const p = h.pulse(220, 0.5), rot = ts ? ts / 150 : 0.35, bob = ts ? Math.sin(ts / 450) * r * 0.03 : 0;
        const SX = r * 0.42, SY = -r * 0.42 + bob, SR = r * 0.6;
        const garb = nbCloth(c, -r * 0.8, -r * 0.5, r * 0.2, r * 0.8, SS_GARB);
        // wind streaks
        c.save(); c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 5; i++) {
          const ph = ts ? (ts / 600 + i * 0.2) % 1 : i * 0.2, x0 = r * (-0.2 - 0.7 * ph), y0 = r * (0.55 + 0.1 * i - 0.25 * ph);
          c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 - r * 0.22, y0 + r * 0.08);
          c.strokeStyle = rgba(i % 2 ? pal.bright : "#ffffff", 0.45 * Math.sin(Math.PI * ph)); c.lineWidth = Math.max(0.6, r * 0.015); c.stroke();
        }
        c.restore();
        // shadow-clone shurikens trailing the flight
        for (const [x, y, R, ph] of [[-0.62, -0.82, 0.26, 0], [0.8, 0.62, 0.24, 1.6]]) {
          const al = 0.35 + 0.25 * Math.sin((ts || 0) / 300 + ph);
          ssSpeedArc(c, x * r, y * r + bob, R * r * 1.12, rot * 1.2 + ph, rot * 1.2 + ph + 2.2, Math.max(0.8, r * 0.025), pal.bright, al);
          ssFuuma(c, h, pal, x * r, y * r + bob, R * r, -rot * 1.2 + ph, { ghost: true, alpha: al + 0.15 });
        }
        // scarf and headband streaming back
        const scarf = [];
        for (let i = 0; i <= 8; i++) { const t = i / 8, wv = (ts ? Math.sin(ts / 200 - t * 5) : 0.5) * r * 0.07 * t; scarf.push([-r * 0.4 - t * r * 0.6, -r * 0.18 + bob - t * r * 0.4 + wv]); }
        ssRibbon(c, h, scarf, (t) => r * (0.13 - 0.06 * t), ssSide(c, pal, -r * 0.4, -r * 0.2, -r, -r * 0.6), 1.2);
        // tucked legs and leaping body
        heroLimb(c, h, -r * 0.55, r * 0.32 + bob, -r * 0.8, r * 0.5, -r * 1.0, r * 0.46 + bob, r * 0.13, garb);
        heroLimb(c, h, -r * 0.45, r * 0.3 + bob, -r * 0.18, r * 0.42, -r * 0.16, r * 0.5 + bob, r * 0.14, garb);
        heroLimb(c, h, -r * 0.16, r * 0.5 + bob, -r * 0.2, r * 0.68, -r * 0.34, r * 0.76 + bob, r * 0.11, garb);
        c.beginPath(); c.ellipse(-r * 1.02, r * 0.46 + bob, r * 0.08, r * 0.045, 0.4, 0, TAU); fillInk("#0d0a12", 1);
        c.beginPath(); c.ellipse(-r * 0.37, r * 0.78 + bob, r * 0.08, r * 0.045, -0.3, 0, TAU); fillInk("#0d0a12", 1);
        c.beginPath(); c.moveTo(-r * 0.5, -r * 0.18 + bob); c.lineTo(-r * 0.22, -r * 0.12 + bob); c.lineTo(-r * 0.38, r * 0.36 + bob); c.lineTo(-r * 0.64, r * 0.3 + bob); c.closePath(); fillInk(garb, 2);
        c.beginPath(); c.moveTo(-r * 0.6, r * 0.18 + bob); c.lineTo(-r * 0.36, r * 0.24 + bob); ssInkStroke(c, h, r * 0.06, pal.mid);
        // balancing arm
        heroLimb(c, h, -r * 0.46, -r * 0.12 + bob, -r * 0.7, -r * 0.1, -r * 0.84, r * 0.04 + bob, r * 0.11, garb);
        olHand(c, h, -r * 0.84, r * 0.04 + bob, r * 0.05, SS_GARB_LIGHT);
        // the colossal Fuuma shuriken and its slicing arcs
        for (let k = 0; k < 3; k++) {
          const a = rot * 1.4 + k * TAU / 3;
          ssSpeedArc(c, SX, SY, SR * (1.06 + 0.04 * k), a, a + 1.1, Math.max(0.8, r * 0.03), k % 2 ? pal.rim : pal.bright, 0.55 + 0.3 * p);
        }
        wkGlow(c, SX, SY, SR * 0.5, pal.bright, 0.3 + 0.2 * p);
        ssFuuma(c, h, pal, SX, SY, SR, rot);
        // throwing arm releasing the star
        heroLimb(c, h, -r * 0.28, -r * 0.1 + bob, -r * 0.06, -r * 0.2, r * 0.1, -r * 0.16 + bob, r * 0.11, garb);
        c.beginPath(); c.moveTo(-r * 0.02, -r * 0.2 + bob); c.lineTo(r * 0.02, -r * 0.1 + bob); ssInkStroke(c, h, r * 0.04, pal.bright);
        olHand(c, h, r * 0.1, -r * 0.16 + bob, r * 0.055, SS_GARB_LIGHT);
        ssHead(c, h, pal, ts, -r * 0.4, -r * 0.32 + bob, r * 0.16, { look: 0.18 });
      },

      harrower(c, pal, r, ts, h) {
        const { fillInk } = h;
        const p = h.pulse(240, 1.3), bob = ts ? Math.sin(ts / 520) * r * 0.015 : 0;
        const spin = ts ? ts / 210 : 0.9, HX = r * 0.12, HY = -r * 0.66 + bob, ORX = r * 0.6, ORY = r * 0.3;
        const W = [HX + Math.cos(spin) * ORX, HY + Math.sin(spin) * ORY], wFront = Math.sin(spin) > 0;
        const garb = nbCloth(c, -r * 0.5, -r * 0.4, r * 0.5, r * 0.9, SS_GARB);
        // swirling shadow smoke
        ssSmoke(c, -r * 0.55, r * 0.72, r * 0.3, ts, 2, "#160f22", 0.75);
        ssSmoke(c, r * 0.5, r * 0.8, r * 0.24, ts, 5, "#160f22", 0.7);
        c.save(); c.globalCompositeOperation = "lighter";
        for (let k = 0; k < 3; k++) {
          const a = (ts ? -ts / 900 : 0) + k * TAU / 3;
          c.beginPath();
          for (let i = 0; i <= 14; i++) { const b = a + i * 0.12, x = Math.cos(b) * r * (0.8 - i * 0.012), y = r * 0.6 + Math.sin(b) * r * 0.26; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
          c.strokeStyle = rgba(k % 2 ? SS_UMBRA : pal.deep, 0.5); c.lineWidth = Math.max(1, r * 0.05); c.stroke();
        }
        c.restore();
        // whirling chain loop, trailing speed arcs and the flying iron weight (depth-sorted against the body)
        const orbit = (front) => {
          c.save(); c.globalCompositeOperation = "lighter";
          c.beginPath();
          for (let i = 0; i <= 24; i++) { const a = (front ? 0 : Math.PI) + i * Math.PI / 24, x = HX + Math.cos(a) * ORX, y = HY + Math.sin(a) * ORY; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
          c.strokeStyle = rgba(pal.bright, 0.22 + 0.15 * p); c.lineWidth = Math.max(1, r * 0.035); c.stroke();
          for (let j = 0; j < 12; j++) {
            const a = spin - 1.3 + j * 0.11;
            if ((Math.sin(a + 0.055) > 0) !== front) continue;
            c.beginPath(); c.moveTo(HX + Math.cos(a) * ORX, HY + Math.sin(a) * ORY); c.lineTo(HX + Math.cos(a + 0.11) * ORX, HY + Math.sin(a + 0.11) * ORY);
            c.strokeStyle = rgba(pal.bright, 0.08 + 0.07 * j); c.lineWidth = Math.max(1, r * (0.03 + 0.006 * j)); c.stroke();
            if (j % 3 === 0) {
              c.beginPath(); c.moveTo(HX + Math.cos(a) * ORX * 1.12, HY + Math.sin(a) * ORY * 1.15); c.lineTo(HX + Math.cos(a + 0.2) * ORX * 1.12, HY + Math.sin(a + 0.2) * ORY * 1.15);
              c.strokeStyle = rgba("#ffffff", 0.06 * j); c.lineWidth = Math.max(0.6, r * 0.012); c.stroke();
            }
          }
          c.restore();
          if (wFront !== front) return;
          ssChain(c, h, [[HX, HY], W], r * 0.034, pal.bright, 0.8 + 0.2 * p);
          wkGlow(c, W[0], W[1], r * 0.16, pal.bright, 0.5);
          c.beginPath(); c.arc(W[0], W[1], r * 0.075, 0, TAU); fillInk(nbCloth(c, W[0] - r * 0.08, W[1] - r * 0.08, W[0] + r * 0.08, W[1] + r * 0.08, SS_IRON), 1.4);
          c.beginPath(); c.arc(W[0], W[1], r * 0.045, 0, TAU); c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.8, r * 0.018); c.stroke();
        };
        orbit(false);
        // scarf trailing back
        const scarf = [];
        for (let i = 0; i <= 8; i++) {
          const t = i / 8, wv = (ts ? Math.sin(ts / 220 - t * 5) : 0.5) * r * 0.07 * t;
          scarf.push([-r * 0.05 - t * r * 0.95, -r * 0.2 + bob - t * r * 0.32 + wv]);
        }
        ssRibbon(c, h, scarf, (t) => r * (0.14 - 0.06 * t), ssSide(c, pal, 0, -r * 0.2, -r, -r * 0.5), 1.3);
        // back leg kneeling, torso leaning forward, front leg in a deep lunge
        heroLimb(c, h, -r * 0.2, r * 0.34, -r * 0.35, r * 0.55, -r * 0.42, r * 0.82, r * 0.17, garb);
        heroLimb(c, h, -r * 0.42, r * 0.82, -r * 0.62, r * 0.86, -r * 0.82, r * 0.8, r * 0.13, garb);
        c.beginPath(); c.ellipse(-r * 0.88, r * 0.76, r * 0.1, r * 0.05, -0.6, 0, TAU); fillInk("#0d0a12", 1.2);
        c.beginPath(); c.moveTo(-r * 0.24, -r * 0.18 + bob); c.lineTo(r * 0.16, -r * 0.1 + bob); c.lineTo(r * 0.08, r * 0.4); c.lineTo(-r * 0.32, r * 0.38); c.closePath(); fillInk(garb, 2);
        c.save(); c.beginPath(); c.moveTo(-r * 0.24, -r * 0.18 + bob); c.lineTo(r * 0.16, -r * 0.1 + bob); c.lineTo(r * 0.08, r * 0.4); c.lineTo(-r * 0.32, r * 0.38); c.closePath(); c.clip();
        c.beginPath();
        for (let k = -4; k <= 4; k++) { c.moveTo(k * r * 0.08 - r * 0.2, -r * 0.2); c.lineTo(k * r * 0.08 + r * 0.1, r * 0.1); c.moveTo(k * r * 0.08 + r * 0.1, -r * 0.2); c.lineTo(k * r * 0.08 - r * 0.2, r * 0.1); }
        c.strokeStyle = "rgba(160,170,190,0.22)"; c.lineWidth = Math.max(0.5, r * 0.01); c.stroke();
        c.restore();
        c.beginPath(); c.moveTo(-r * 0.31, r * 0.27); c.lineTo(r * 0.1, r * 0.3); ssInkStroke(c, h, r * 0.07, pal.mid);
        heroLimb(c, h, -r * 0.05, r * 0.34, r * 0.12, r * 0.26, r * 0.32, r * 0.4, r * 0.17, garb);
        heroLimb(c, h, r * 0.32, r * 0.4, r * 0.38, r * 0.62, r * 0.36, r * 0.82, r * 0.13, garb);
        c.beginPath();
        for (let k = 0; k < 3; k++) { const y = r * (0.56 + k * 0.08); c.moveTo(r * 0.29, y); c.lineTo(r * 0.44, y + r * 0.03); }
        c.strokeStyle = rgba(pal.bright, 0.9); c.lineWidth = Math.max(0.8, r * 0.022); c.stroke();
        c.beginPath(); c.ellipse(r * 0.42, r * 0.87, r * 0.12, r * 0.05, 0, 0, TAU); fillInk("#0d0a12", 1.2);
        // raised arm spinning the chain, head
        heroLimb(c, h, -r * 0.1, -r * 0.14 + bob, -r * 0.2, -r * 0.5, HX, HY, r * 0.13, garb);
        olHand(c, h, HX, HY, r * 0.06, SS_GARB_LIGHT);
        ssHead(c, h, pal, ts, r * 0.06, -r * 0.32 + bob, r * 0.17, { look: 0.15 });
        // front arm and the curved steel sickle
        const KX = r * 0.52, KY = r * 0.16, ka = ts ? Math.sin(ts / 400) * 0.08 : 0, ca = Math.cos(ka), sa = Math.sin(ka);
        const rot = (x, y) => [KX + (x - KX) * ca - (y - KY) * sa, KY + (x - KX) * sa + (y - KY) * ca];
        c.save(); c.translate(KX, KY); c.rotate(ka); c.translate(-KX, -KY);
        c.beginPath(); c.moveTo(r * 0.45, r * 0.44); c.lineTo(r * 0.6, -r * 0.12); ssInkStroke(c, h, r * 0.06, SS_WOOD[1]);
        c.beginPath(); c.moveTo(r * 0.49, r * 0.3); c.lineTo(r * 0.55, r * 0.08); c.strokeStyle = pal.mid; c.lineWidth = Math.max(1, r * 0.04); c.stroke();
        const BX = r * 0.6, BY = -r * 0.12;
        c.beginPath(); c.moveTo(BX - r * 0.03, BY + r * 0.04); c.quadraticCurveTo(BX + r * 0.22, BY - r * 0.22, BX + r * 0.47, BY + r * 0.06);
        c.quadraticCurveTo(BX + r * 0.22, BY - r * 0.06, BX + r * 0.02, BY + r * 0.08); c.closePath();
        fillInk(h.metal(BX, BY - r * 0.2, BX + r * 0.4, BY + r * 0.1, ...SS_STEEL), 1.4);
        c.save(); c.globalCompositeOperation = "lighter";
        c.beginPath(); c.moveTo(BX + r * 0.04, BY + r * 0.06); c.quadraticCurveTo(BX + r * 0.22, BY - r * 0.06, BX + r * 0.45, BY + r * 0.06);
        c.strokeStyle = rgba(pal.bright, 0.4 + 0.3 * p); c.lineWidth = Math.max(1, r * 0.05); c.stroke();
        c.strokeStyle = "rgba(255,255,255,0.85)"; c.lineWidth = Math.max(0.6, r * 0.015); c.stroke();
        c.restore();
        c.restore();
        heroLimb(c, h, r * 0.12, -r * 0.08 + bob, r * 0.42, -r * 0.04, KX, KY, r * 0.13, garb);
        olHand(c, h, KX, KY, r * 0.06, SS_GARB_LIGHT);
        // chain from the sickle's butt up to the spinning fist, with side-coloured sparks
        const butt = rot(r * 0.45, r * 0.44), cx = ts ? Math.sin(ts / 600) * r * 0.08 : 0;
        const chain = ssQuad(butt[0], butt[1], -r * 0.05 + cx, r * 0.62, HX, HY, 12);
        ssChain(c, h, chain, r * 0.032, pal.bright, 0.7 + 0.3 * p);
        for (let i = 0; i < 4; i++) {
          const ph = ts ? (ts / 700 + i * 0.25) % 1 : i * 0.25 + 0.1, pt = chain[Math.min(chain.length - 1, Math.floor(ph * chain.length))];
          wkSparkle(c, pt[0] + Math.cos(i * 2.1) * r * 0.05, pt[1] + Math.sin(i * 2.1) * r * 0.05, r * 0.06 * Math.sin(Math.PI * ph), pal.bright, ph * 3, 0.9);
        }
        orbit(true);
      },

      fury(c, pal, r, ts, h) {
        const { fillInk } = h;
        const p = h.pulse(360, 0.2), sway = ts ? Math.sin(ts / 760) * r * 0.025 : 0, bob = ts ? Math.sin(ts / 980) * r * 0.012 : 0;
        const CY = r * 0.96, CRX = r * 0.98, CRY = r * 0.2;
        // umbral sigil circle (dark disc + back half of the ring)
        c.save(); c.translate(0, CY); c.scale(1, CRY / CRX);
        const disc = c.createRadialGradient(0, 0, 0, 0, 0, CRX);
        disc.addColorStop(0, "rgba(2,1,6,0.95)"); disc.addColorStop(0.7, rgba(pal.deep, 0.75)); disc.addColorStop(1, rgba(pal.deep, 0));
        c.fillStyle = disc; c.beginPath(); c.arc(0, 0, CRX, 0, TAU); c.fill();
        c.restore();
        ssUmbralRing(c, pal, 0, CY, CRX * 0.92, CRY * 0.92, ts, false, p);
        // rising shadow clones
        for (let k = 0; k < 2; k++) {
          const sx = k ? 1 : -1, ph = ts ? (ts / 3200 + k * 0.5) % 1 : 0.5;
          ssClone(c, pal, sx * r * 0.68, r * 0.55 - ph * r * 0.3, r * 0.42, 0.8 * Math.sin(Math.PI * ph));
        }
        // trailing scarf (tail behind the body)
        const scarf = [];
        for (let i = 0; i <= 9; i++) {
          const t = i / 9, wv = (ts ? Math.sin(ts / 260 - t * 5.5) : Math.sin(1 - t * 5.5)) * r * 0.08 * t;
          scarf.push([r * 0.12 + t * r * 0.96, -r * 0.46 + bob + t * r * (-0.12 + 0.5 * t) + wv]);
        }
        ssRibbon(c, h, scarf, (t) => r * (0.17 - 0.08 * t), ssSide(c, pal, r * 0.1, -r * 0.5, r * 1.1, 0), 1.4);
        c.beginPath(); ssLine(c, scarf.slice(1)); c.strokeStyle = rgba(pal.rim, 0.55); c.lineWidth = Math.max(0.6, r * 0.015); c.stroke();
        // twin ninjato crossed at his back
        for (const sx of [-1, 1]) {
          const gx = sx * r * 0.3, gy = -r * 0.6 + bob, tx = -sx * r * 0.92, ty = r * 0.42;
          ssBlade(c, h, pal, gx, gy, Math.atan2(ty - gy, tx - gx), Math.hypot(tx - gx, ty - gy), r * 0.28, r * 0.06, { glowA: 0.6 + 0.4 * p });
        }
        // hakama legs, wrapped shins and tabi
        const garb = nbCloth(c, -r * 0.5, -r * 0.45, r * 0.5, r * 0.95, SS_GARB);
        c.beginPath(); c.moveTo(-r * 0.3, r * 0.1); c.lineTo(-r * 0.5, r * 0.86); c.lineTo(-r * 0.12, r * 0.88); c.lineTo(0, r * 0.42);
        c.lineTo(r * 0.12, r * 0.88); c.lineTo(r * 0.5, r * 0.86); c.lineTo(r * 0.3, r * 0.1); c.closePath(); fillInk(garb, 2);
        for (const sx of [-1, 1]) {
          c.beginPath();
          for (let k = 0; k < 3; k++) { const y = r * (0.62 + k * 0.08); c.moveTo(sx * r * 0.16, y); c.lineTo(sx * r * 0.45, y + r * 0.04); }
          c.strokeStyle = rgba(pal.mid, 0.9); c.lineWidth = Math.max(0.8, r * 0.025); c.stroke();
          c.beginPath(); c.ellipse(sx * r * 0.32, r * 0.92, r * 0.17, r * 0.06, 0, 0, TAU); fillInk("#0d0a12", 1.4);
        }
        // long open coat with side-coloured hem
        c.beginPath(); c.moveTo(-r * 0.36, -r * 0.42 + bob); c.quadraticCurveTo(-r * 0.52, 0, -r * 0.5 + sway, r * 0.62); c.lineTo(-r * 0.1 + sway, r * 0.56);
        c.lineTo(0, r * 0.3); c.lineTo(r * 0.1 + sway, r * 0.56); c.lineTo(r * 0.5 + sway, r * 0.62); c.quadraticCurveTo(r * 0.52, 0, r * 0.36, -r * 0.42 + bob); c.closePath();
        fillInk(garb, 2.2);
        c.beginPath(); c.moveTo(-r * 0.5 + sway, r * 0.6); c.lineTo(-r * 0.1 + sway, r * 0.54); c.moveTo(r * 0.1 + sway, r * 0.54); c.lineTo(r * 0.5 + sway, r * 0.6);
        c.strokeStyle = pal.bright; c.lineWidth = Math.max(1, r * 0.035); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.2, -r * 0.42 + bob); c.lineTo(0, -r * 0.08); c.lineTo(r * 0.2, -r * 0.42 + bob);
        ssInkStroke(c, h, r * 0.05, pal.mid);
        // obi with a knotted side-coloured sash
        h.rr(-r * 0.36, r * 0.06, r * 0.72, r * 0.13, r * 0.03); fillInk(ssSide(c, pal, 0, r * 0.06, 0, r * 0.19), 1.6);
        for (const [dx, len] of [[0.05, 0.3], [0.14, 0.24]]) {
          const pts = ssQuad(r * 0.2, r * 0.13, r * (0.24 + dx) + sway, r * 0.3, r * (0.2 + dx) + sway * 1.5, r * (0.13 + len), 6);
          ssRibbon(c, h, pts, (t) => r * (0.07 - 0.02 * t), pal.mid, 1);
        }
        c.beginPath(); c.arc(r * 0.2, r * 0.125, r * 0.05, 0, TAU); fillInk(pal.bright, 1.2);
        // iron shoulder guards
        for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(sx * r * 0.38, -r * 0.36 + bob, r * 0.13, r * 0.08, sx * 0.4, 0, TAU); fillInk(nbCloth(c, 0, -r * 0.44, 0, -r * 0.28, SS_IRON), 1.4); }
        // umbral vortex behind the seal
        const SX = 0, SY = -r * 0.26 + bob;
        wkGlow(c, SX, SY, r * 0.34, pal.bright, 0.45 + 0.35 * p);
        c.save(); c.globalCompositeOperation = "lighter";
        for (let k = 0; k < 3; k++) {
          const a = (ts ? ts / 420 : 0) + k * TAU / 3;
          c.beginPath(); c.arc(SX, SY, r * (0.2 + 0.03 * k), a, a + 1.4);
          c.strokeStyle = rgba(k % 2 ? SS_UMBRA : pal.bright, 0.7); c.lineWidth = Math.max(0.8, r * 0.025); c.stroke();
        }
        c.restore();
        // arms bent inward to the seal
        for (const sx of [-1, 1]) {
          heroLimb(c, h, sx * r * 0.36, -r * 0.34 + bob, sx * r * 0.58, -r * 0.12, sx * r * 0.12, -r * 0.2 + bob, r * 0.15, garb);
          c.beginPath(); c.moveTo(sx * r * 0.2, -r * 0.27 + bob); c.lineTo(sx * r * 0.22, -r * 0.13 + bob); ssInkStroke(c, h, r * 0.045, pal.bright);
        }
        // the hand seal: clasped fists, index and middle fingers raised
        const glove = nbCloth(c, -r * 0.1, SY - r * 0.1, r * 0.1, SY + r * 0.1, SS_GARB_LIGHT);
        h.rr(-r * 0.11, SY - r * 0.02, r * 0.22, r * 0.13, r * 0.05); fillInk(glove, 1.3);
        h.rr(-r * 0.045, SY - r * 0.16, r * 0.09, r * 0.16, r * 0.03); fillInk(glove, 1.2);
        c.beginPath(); c.moveTo(0, SY - r * 0.16); c.lineTo(0, SY); c.strokeStyle = h.INK; c.lineWidth = 0.8; c.stroke();
        wkGlow(c, 0, SY - r * 0.16, r * 0.08, pal.bright, 0.7 + 0.3 * p);
        // neck wrap of the scarf
        h.rr(-r * 0.2, -r * 0.52 + bob, r * 0.4, r * 0.12, r * 0.05); fillInk(ssSide(c, pal, 0, -r * 0.52, 0, -r * 0.4), 1.4);
        // shadow cowl with glowing eyes under a lacquered kasa
        ssHead(c, h, pal, ts, 0, -r * 0.66 + bob, r * 0.19, { band: false, tails: false, shadowFace: true });
        const KY = -r * 0.82 + bob;
        c.beginPath(); c.moveTo(-r * 0.6, KY + r * 0.1); c.quadraticCurveTo(-r * 0.3, KY - r * 0.08, 0, KY - r * 0.28);
        c.quadraticCurveTo(r * 0.3, KY - r * 0.08, r * 0.6, KY + r * 0.1); c.quadraticCurveTo(0, KY + r * 0.02, -r * 0.6, KY + r * 0.1); c.closePath();
        fillInk(nbCloth(c, 0, KY - r * 0.28, 0, KY + r * 0.1, ["#4a4058", "#1d1828", "#08060c"]), 1.8);
        c.beginPath();
        for (let k = -3; k <= 3; k++) { if (!k) continue; c.moveTo(0, KY - r * 0.26); c.lineTo(k * r * 0.17, KY + r * 0.06 - Math.abs(k) * r * 0.005); }
        c.strokeStyle = "rgba(255,255,255,0.12)"; c.lineWidth = Math.max(0.5, r * 0.012); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.58, KY + r * 0.09); c.quadraticCurveTo(0, KY + r * 0.01, r * 0.58, KY + r * 0.09);
        c.strokeStyle = pal.bright; c.lineWidth = Math.max(1, r * 0.03); c.stroke();
        c.beginPath(); c.arc(0, KY - r * 0.27, r * 0.035, 0, TAU); fillInk(pal.gold, 1);
        // front half of the sigil ring and rising umbral motes
        ssUmbralRing(c, pal, 0, CY, CRX * 0.92, CRY * 0.92, ts, true, p);
        for (let i = 0; i < 9; i++) {
          const ph = ts ? (ts / 2400 + heroHash(i + 0.5)) % 1 : heroHash(i + 0.5);
          const x = r * (-0.85 + 1.7 * heroHash(i * 2.7 + 1)) + Math.sin(ph * 6 + i) * r * 0.04, y = CY - ph * r * 0.9;
          c.beginPath(); c.arc(x, y, Math.max(0.6, r * 0.022), 0, TAU); c.fillStyle = rgba(i % 3 ? pal.bright : SS_UMBRA, 0.85 * Math.sin(Math.PI * ph)); c.fill();
        }
      },
    },
  };

  /* ============================================================
   * THEME: SPIRIT COURT REAPERS — an original afterlife-swordsman homage
   * ============================================================ */
  const SR_SKIN = "#f3d3b0";
  const SR_ELDER = "#e8c5a0";
  const SR_TAN = "#e0b088";
  const SR_TAWNY = "#9c6643";
  const SR_WHITE = ["#ffffff", "#e8e6ef", "#a39eb5"];   // captain-coat cloth
  const SR_STEEL = ["#f6f8fc", "#b8c0cc", "#4c5463"];
  const SR_WOOD = ["#b3834f", "#6e4826", "#2e1b0c"];
  const SR_BEARD = ["#ffffff", "#e4e2ea", "#9b96aa"];
  const SR_HAIR_BLACK = ["#4a4f6e", "#1b1c2c", "#08080f"];
  const SR_HAIR_ORANGE = ["#ffd08a", "#ff8a1e", "#b0420a"];
  const SR_HAIR_SILVER = ["#ffffff", "#dfe7f2", "#8e9bb0"];
  const SR_HAIR_VIOLET = ["#c9a2ff", "#7a45c9", "#33195e"];
  const SR_HAIR_ASH = ["#8a8296", "#2c2636", "#0d0a12"];
  const SR_GOLD = ["#fff3b8", "#f2c230", "#7a5410"];
  const SR_HILT = "#1c1925";
  const SR_TABI = "#efe9dc";
  const SR_SANDAL = "#7c5c34";
  const SR_SOLAR = "#ffd23a";     // solar inferno core
  const SR_FLAME = "#ff6618";     // solar inferno flame
  const SR_CRIMSON = "#e4122f";   // crescent slash rim
  const SR_WARLORD = "#ffd440";   // warlord spirit pressure
  const SR_SAKURA = "#ff8cc8";    // blossom petal glow
  const SR_FLASH = "#fff0a8";     // white-gold flash-step lightning
  const SR_REISHI = "#4fc8ff";    // azure spirit-particle arrow
  const SR_FROST = "#9ce8ff";     // glacial frost
  const SR_JADE = "#36ff9a";      // berserker-burst jade

  // Side-tinted black robe cloth: the side palette glints through the black.
  function srDark(c, r, pal) {
    const g = c.createLinearGradient(-r * 0.6, -r * 0.5, r * 0.5, r * 1.1);
    g.addColorStop(0, pal.mid); g.addColorStop(0.28, pal.deep); g.addColorStop(0.7, "#14111b"); g.addColorStop(1, "#050409");
    return g;
  }
  function srWhite(c, r) { return nbCloth(c, -r * 0.6, -r * 0.5, r * 0.6, r * 1.0, SR_WHITE); }
  // Captain-coat back panel (r units): shoulders ±sw at y −0.44, hem ±hw at y hy; rag = { n, depth, seed } shreds the hem.
  function srCoatBack(c, r, sw, hw, hy, sway = 0, rag = null) {
    c.beginPath(); c.moveTo(-sw * r, -r * 0.44);
    c.quadraticCurveTo(-(sw + 0.14) * r, r * 0.25, -hw * r + sway, hy * r);
    if (rag) {
      for (let i = 1; i < rag.n; i++) {
        const d = i % 2 ? rag.depth * (0.5 + 0.5 * heroHash(rag.seed + i * 2.3)) : rag.depth * 0.1;
        c.lineTo((-hw + 2 * hw * i / rag.n) * r + sway, (hy - d) * r);
      }
      c.lineTo(hw * r + sway, hy * r);
    } else c.quadraticCurveTo(0, (hy + 0.05) * r, hw * r + sway, hy * r);
    c.quadraticCurveTo((sw + 0.14) * r, r * 0.25, sw * r, -r * 0.44);
    c.quadraticCurveTo(0, -r * 0.56, -sw * r, -r * 0.44); c.closePath();
  }
  // Wide pleated hakama over split-toe socks and straw sandals. o: { sway, hw, ragged (seed) }.
  function srHakama(c, h, r, fill, o = {}) {
    const sway = o.sway || 0, hw = o.hw || 0.54;
    for (const sx of [-1, 1]) {
      h.poly([sx * 0.1, 0.95, sx * 0.3, 0.95, sx * 0.32, 1.07, sx * 0.08, 1.07]); h.fillInk(SR_TABI, 1.4);
      h.poly([sx * 0.06, 1.06, sx * 0.35, 1.06, sx * 0.36, 1.13, sx * 0.05, 1.13]); h.fillInk(SR_SANDAL, 1.2);
    }
    const hem = (xa, xb) => {
      for (let i = 1; i <= 4; i++) {
        const x = xa + (xb - xa) * i / 4;
        const up = o.ragged && i % 2 && i < 4 ? 0.05 + 0.07 * heroHash(o.ragged + i * 3.1 + xa / r) : 0;
        c.lineTo(x, r * (1.0 - up));
      }
    };
    c.beginPath(); c.moveTo(-r * 0.34, r * 0.3);
    c.quadraticCurveTo(-r * (hw - 0.06), r * 0.66, -r * hw + sway, r * 1.0);
    hem(-r * hw + sway, -r * 0.04);
    c.lineTo(0, r * 0.62); c.lineTo(r * 0.04, r * 1.0);
    hem(r * 0.04, r * hw + sway);
    c.quadraticCurveTo(r * (hw - 0.06), r * 0.66, r * 0.34, r * 0.3); c.closePath();
    h.fillInk(fill, 2.2);
    c.strokeStyle = "rgba(255,255,255,0.13)"; c.lineWidth = 1;
    c.beginPath();
    for (const x of [-0.24, -0.12, 0.12, 0.24]) { c.moveTo(x * r, r * 0.38); c.lineTo(x * 1.7 * r + sway, r * 0.95); }
    c.stroke();
  }
  // Black kimono torso with a crossed white under-collar and waist sash. o: { sw, ww, open (skin), sash }.
  function srKimono(c, h, r, pal, o = {}) {
    const sw = o.sw || 0.44, ww = o.ww || 0.33, bot = 0.38;
    const path = () => jlTorso(c, r, sw, ww, -0.42, bot);
    path(); h.fillInk(o.fill || srDark(c, r, pal), 2.4);
    c.save(); path(); c.clip();
    const sheen = c.createLinearGradient(-r * 0.5, -r * 0.45, r * 0.3, r * 0.25);
    sheen.addColorStop(0, "rgba(255,255,255,0.16)"); sheen.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = sheen; c.fillRect(-r * 0.62, -r * 0.55, r * 1.24, r * 1.0);
    c.strokeStyle = h.INK; c.lineWidth = 1.2;
    if (o.open) {
      h.poly([-0.17, -0.5, 0.17, -0.5, 0, 0.14]); c.fillStyle = o.open; c.fill();
      c.strokeStyle = "rgba(11,7,16,0.4)";
      c.beginPath(); c.moveTo(-r * 0.1, -r * 0.3); c.quadraticCurveTo(0, -r * 0.24, r * 0.1, -r * 0.3); c.stroke();
      c.strokeStyle = h.INK;
      for (const sx of [-1, 1]) { h.poly([sx * 0.26, -0.5, sx * 0.17, -0.5, 0, 0.14, sx * 0.06, 0.2]); c.fillStyle = SR_WHITE[1]; c.fill(); c.stroke(); }
    } else {
      h.poly([-0.26, -0.5, -0.17, -0.5, 0.02, -0.02, -0.04, 0.04]); c.fillStyle = SR_WHITE[1]; c.fill(); c.stroke();
      h.poly([0.26, -0.5, 0.17, -0.5, -0.06, 0.24, 0.02, 0.26]); c.fillStyle = SR_WHITE[0]; c.fill(); c.stroke();
    }
    c.restore();
    if (o.sash !== false) { h.rr(-(ww + 0.02) * r, (bot - 0.11) * r, (ww + 0.02) * 2 * r, r * 0.1, r * 0.03); h.fillInk(o.sash || SR_WHITE[1], 1.4); }
    return path;
  }
  // Open captain-coat front panels with a diamond-band hem. o: { hem, sway, rag (shred depth) }.
  function srHaori(c, h, r, pal, o = {}) {
    const hem = o.hem || 0.98, sway = o.sway || 0;
    for (const sx of [-1, 1]) {
      const panel = () => {
        c.beginPath(); c.moveTo(sx * r * 0.5, -r * 0.43); c.lineTo(sx * r * 0.26, -r * 0.45);
        c.quadraticCurveTo(sx * r * 0.3, r * 0.3, sx * r * 0.36, hem * r);
        if (o.rag) {
          for (let i = 1; i <= 4; i++) {
            const d = i % 2 && i < 4 ? o.rag * (0.5 + 0.5 * heroHash(i * 3.7 + sx)) : 0;
            c.lineTo(sx * (0.36 + 0.32 * i / 4) * r + sway * i / 4, (hem - d) * r);
          }
        } else c.lineTo(sx * r * 0.68 + sway, hem * r);
        c.quadraticCurveTo(sx * r * 0.66, r * 0.15, sx * r * 0.5, -r * 0.43); c.closePath();
      };
      panel(); h.fillInk(srWhite(c, r), 2);
      c.save(); panel(); c.clip();
      if (o.rag) {
        c.fillStyle = "rgba(11,7,16,0.55)";
        for (const [x, y] of [[0.5, 0.1], [0.44, 0.52]]) {
          c.beginPath(); c.moveTo(sx * x * r, y * r); c.lineTo(sx * (x + 0.05) * r, (y + 0.12) * r); c.lineTo(sx * (x + 0.01) * r, (y + 0.05) * r); c.closePath(); c.fill();
        }
      } else {
        const y0 = (hem - 0.17) * r, bh = 0.1 * r, cy = y0 + bh / 2, d = bh * 0.36;
        c.fillStyle = "#16131d"; c.fillRect(-r * 0.8, y0, r * 1.6, bh);
        c.fillStyle = SR_WHITE[0];
        for (let i = -6; i <= 6; i++) {
          const x = i * 0.12 * r;
          c.beginPath(); c.moveTo(x, cy - d); c.lineTo(x + d, cy); c.lineTo(x, cy + d); c.lineTo(x - d, cy); c.closePath(); c.fill();
        }
      }
      c.strokeStyle = "rgba(11,7,16,0.18)"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(sx * r * 0.42, -r * 0.2); c.quadraticCurveTo(sx * r * 0.48, r * 0.3, sx * r * 0.52, hem * r); c.stroke();
      c.restore();
      panel(); c.strokeStyle = h.INK; c.lineWidth = 1.8; c.stroke();
      c.beginPath(); c.moveTo(sx * r * 0.26, -r * 0.45); c.quadraticCurveTo(sx * r * 0.3, r * 0.3, sx * r * 0.36, hem * r);
      c.strokeStyle = h.rgba(pal.rim, 0.7); c.lineWidth = Math.max(1, r * 0.022); c.stroke();
    }
  }
  // Katana with its guard at (x, y) px, blade pointing along ang.
  // o: { blade, hilt, w (r units), bend, guard: round|square|star|blossom|none, notched, bladeFill, hamon, wrap, hiltFill, guardFill }.
  function srKatana(c, h, r, x, y, ang, o = {}) {
    const L = (o.blade == null ? 0.7 : o.blade) * r, HL = (o.hilt || 0.2) * r, w = (o.w || 0.08) * r;
    const bend = o.bend == null ? 0.06 : o.bend;
    c.save(); c.translate(x, y); c.rotate(ang);
    if (L > 0) {
      const N = 14, edge = [], spine = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, px = t * L * 0.93, yc = -bend * L * t * t, hw = w * 0.5 * (1 - 0.25 * t);
        spine.push([px, yc - hw]);
        if (o.notched && i > 0 && i < N - 1 && (i % 3 === 1 || i === 8)) {
          const d = w * (0.35 + 0.35 * heroHash(i * 4.1 + 2));
          edge.push([px - w * 0.18, yc + hw], [px, yc + hw - d], [px + w * 0.12, yc + hw]);
        } else edge.push([px, yc + hw]);
      }
      c.beginPath(); c.moveTo(spine[0][0], spine[0][1]);
      for (const p of spine) c.lineTo(p[0], p[1]);
      c.lineTo(L, -bend * L - w * 0.05);
      for (let i = edge.length - 1; i >= 0; i--) c.lineTo(edge[i][0], edge[i][1]);
      c.closePath();
      h.fillInk(o.bladeFill || h.metal(0, -w, 0, w, ...SR_STEEL), 1.6);
      if (o.hamon !== false) {
        c.beginPath();
        for (let i = 0; i <= 10; i++) {
          const t = i / 10, px = t * L * 0.9, yc = -bend * L * t * t, hw = w * 0.5 * (1 - 0.25 * t);
          const yy = yc + hw * (0.3 + 0.14 * Math.sin(i * 2.1));
          if (i) c.lineTo(px, yy); else c.moveTo(px, yy);
        }
        c.strokeStyle = o.hamon || "rgba(255,255,255,0.75)"; c.lineWidth = Math.max(0.7, w * 0.12); c.stroke();
      }
    }
    h.rr(-HL, -w * 0.45, HL, w * 0.9, w * 0.3); h.fillInk(o.hiltFill || SR_HILT, 1.4);
    c.strokeStyle = o.wrap || SR_TABI; c.lineWidth = Math.max(0.6, w * 0.12);
    c.beginPath();
    for (let i = 0; i < 4; i++) {
      const x0 = -HL + HL * (0.12 + i * 0.2);
      c.moveTo(x0, -w * 0.38); c.lineTo(x0 + HL * 0.1, w * 0.38); c.moveTo(x0, w * 0.38); c.lineTo(x0 + HL * 0.1, -w * 0.38);
    }
    c.stroke();
    h.rr(-HL - w * 0.14, -w * 0.5, w * 0.22, w, w * 0.08); h.fillInk(h.metal(0, -w, 0, w, ...SR_GOLD), 1);
    const g = o.guard || "round", gf = o.guardFill || "#2b2733";
    c.beginPath();
    if (g === "round") { c.ellipse(0, 0, w * 0.28, w * 1.05, 0, 0, TAU); h.fillInk(gf, 1.4); }
    else if (g === "square") { h.rr(-w * 0.18, -w * 1.0, w * 0.36, w * 2.0, w * 0.12); h.fillInk(gf, 1.4); }
    else if (g === "star") {
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4, rad = i % 2 ? w * 0.42 : w * 1.25;
        if (i) c.lineTo(Math.cos(a) * rad * 0.6, Math.sin(a) * rad); else c.moveTo(Math.cos(a) * rad * 0.6, Math.sin(a) * rad);
      }
      c.closePath(); h.fillInk(gf, 1.3);
    } else if (g === "blossom") {
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * Math.PI / 2, ox = Math.cos(a) * w * 0.22, oy = Math.sin(a) * w * 0.55;
        c.moveTo(ox + w * 0.3, oy); c.arc(ox, oy, w * 0.3, 0, TAU);
      }
      h.fillInk(gf, 1.2);
    }
    c.restore();
  }
  // Spiky hair crown around an ellipse (r units) from angle a0 to a1 through the top (−π/2 is up). Returns tips in px.
  function srSpikes(c, r, cx, cy, rx, ry, n, a0, a1, len, seed, sweep = 0) {
    const tips = [];
    c.beginPath();
    for (let i = 0; i <= n * 2; i++) {
      const a = a0 + (a1 - a0) * i / (n * 2), tip = i % 2 === 1;
      const k = tip ? 1 + len * (0.7 + 0.6 * heroHash(seed + i * 1.37)) : 1, aa = tip ? a + sweep : a;
      const x = (cx + Math.cos(aa) * rx * k) * r, y = (cy + Math.sin(aa) * ry * k) * r;
      if (tip) tips.push([x, y]);
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.closePath();
    return tips;
  }
  // Tapered crescent band along a circular arc, bulging inward to thickness th (px).
  function srCrescent(c, cx, cy, R, a0, a1, th, n = 22) {
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    for (let i = n; i >= 0; i--) {
      const t = i / n, a = a0 + (a1 - a0) * t, rad = R - th * Math.pow(Math.sin(Math.PI * t), 0.8);
      c.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    c.closePath();
  }
  // Notched cherry-blossom petal blade of length s pointing along ang from (x, y).
  function srPetal(c, x, y, s, ang, fill, ink) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.moveTo(0, 0);
    c.bezierCurveTo(s * 0.35, -s * 0.45, s * 0.95, -s * 0.38, s, -s * 0.1);
    c.lineTo(s * 0.82, 0); c.lineTo(s, s * 0.1);
    c.bezierCurveTo(s * 0.95, s * 0.38, s * 0.35, s * 0.45, 0, 0); c.closePath();
    c.fillStyle = fill; c.fill();
    if (ink) { c.strokeStyle = ink; c.lineWidth = Math.max(0.5, s * 0.08); c.stroke(); }
    c.restore();
  }
  // Flame tongue rooted at (x, y) rising len px along ang (0 = straight up), base width w.
  function srFlame(c, x, y, len, w, ang, fill) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.moveTo(-w * 0.5, 0);
    c.quadraticCurveTo(-w * 0.55, -len * 0.45, -w * 0.08, -len * 0.7);
    c.quadraticCurveTo(-w * 0.04, -len * 0.88, w * 0.1, -len);
    c.quadraticCurveTo(w * 0.18, -len * 0.62, w * 0.42, -len * 0.38);
    c.quadraticCurveTo(w * 0.58, -len * 0.12, w * 0.5, 0); c.closePath();
    c.fillStyle = fill; c.fill();
    c.restore();
  }
  // Six-armed snowflake of radius s.
  function srSnowflake(c, x, y, s, ang, color) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.strokeStyle = color; c.lineWidth = Math.max(0.6, s * 0.16); c.lineCap = "round";
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a), bx = ca * s * 0.55, by = sa * s * 0.55;
      c.moveTo(0, 0); c.lineTo(ca * s, sa * s);
      for (const d of [-1, 1]) { const b = a + d * 0.7; c.moveTo(bx, by); c.lineTo(bx + Math.cos(b) * s * 0.3, by + Math.sin(b) * s * 0.3); }
    }
    c.stroke(); c.restore();
  }

  SG.THEMES.spiritcourt = {
    id: "spiritcourt",
    name: { en: "Spirit Court Reapers", fr: "Faucheurs de la Cour des Esprits", zh: "灵廷幽冥武士", ar: "حصادو محكمة الأرواح" },
    description: {
      en: "Lords of the spirit court, awakened spirit blades, blossom blade storms, solar infernos, and masked berserkers.",
      fr: "Seigneurs de la cour des esprits, lames spirituelles éveillées, tempêtes de pétales, brasiers solaires et guerriers masqués.",
      zh: "幽冥灵廷各席统领、觉醒魂灵秘刃、万樱花刃风暴、炽阳烈焰与异面狂战。",
      ar: "قادة محكمة الأرواح، سيوف الأرواح المستيقظة، عواصف بتلات الكرز، الجحيم الشمسي والمحاربون المقنعون.",
    },
    painters: {
      /* Grand Spiritual Commander — venerable bald elder with brow scars, drooping white brows and a long
         corded beard, white captain coat over black robes, knotted wooden staff-sheath in one hand and an
         incandescent solar blade drawn in the other, ringed by a sunburst, swirling flame arcs and embers. */
      sovereign(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, glowOrb, pulse, rgba, rr, energyBlade, metal } = h;
        const p = pulse(230), sway = ts ? Math.sin(ts / 520) * r * 0.025 : 0;
        // captain coat back panel showing the side-coloured lining (base silhouette)
        srCoatBack(c, r, 0.5, 0.74, 1.04, sway); fillInk(bodyGrad, 2.4); c.shadowBlur = 0; // drop shadow only on the base silhouette
        // solar sunburst behind the drawn blade
        const sx0 = r * 0.72, sy0 = -r * 0.66, spin = ts ? ts / 900 : 0.6;
        c.save(); c.globalCompositeOperation = "lighter";
        const sg = c.createRadialGradient(sx0, sy0, 0, sx0, sy0, r * 0.48);
        sg.addColorStop(0, rgba(SR_SOLAR, 0.5 + 0.25 * p)); sg.addColorStop(0.55, rgba(SR_FLAME, 0.32)); sg.addColorStop(1, rgba(SR_FLAME, 0));
        c.fillStyle = sg; c.beginPath();
        for (let i = 0; i < 24; i++) {
          const a = -spin * 0.4 + i * TAU / 24, R = i % 2 ? r * 0.26 : r * (i % 4 === 0 ? 0.47 : 0.4);
          const x = sx0 + Math.cos(a) * R, y = sy0 + Math.sin(a) * R;
          if (i) c.lineTo(x, y); else c.moveTo(x, y);
        }
        c.closePath(); c.fill();
        c.restore();
        // three swirling flame arcs orbiting the blade
        for (let k = 0; k < 3; k++) {
          const a0 = spin + k * TAU / 3;
          srCrescent(c, sx0, sy0, r * 0.4, a0, a0 + 1.7, r * (0.1 + 0.02 * p));
          c.fillStyle = rgba(k % 2 ? SR_FLAME : "#ff9124", 0.85); c.fill();
          c.save(); c.globalCompositeOperation = "lighter";
          c.strokeStyle = rgba(SR_SOLAR, 0.6); c.lineWidth = Math.max(0.8, r * 0.015); c.stroke();
          c.restore();
        }
        // hakama, black robe and the open white captain coat
        srHakama(c, h, r, srDark(c, r, pal), { sway: sway * 0.5 });
        srKimono(c, h, r, pal, { sw: 0.46, ww: 0.35 });
        srHaori(c, h, r, pal, { hem: 1.02, sway });
        // knotted wooden staff (the blade's sheath) planted at the left
        const stx = -r * 0.64, aw = Math.max(4, r * 0.21), sleeve = srDark(c, r, pal);
        c.beginPath(); c.moveTo(stx, -r * 0.54); c.lineTo(stx + r * 0.02, r * 1.1);
        c.strokeStyle = h.INK; c.lineWidth = r * 0.11 + 2.4; c.stroke();
        c.strokeStyle = nbCloth(c, stx - r * 0.06, 0, stx + r * 0.06, 0, SR_WOOD); c.lineWidth = r * 0.11; c.stroke();
        for (const y of [-0.16, 0.42, 0.82]) { c.beginPath(); c.ellipse(stx + r * 0.012, y * r, r * 0.07, r * 0.03, 0.1, 0, TAU); fillInk(SR_WOOD[1], 1); }
        rr(stx - r * 0.075, -r * 0.6, r * 0.15, r * 0.07, r * 0.02); fillInk(metal(0, -r * 0.6, 0, -r * 0.53, ...SR_GOLD), 1.2);
        c.beginPath(); c.ellipse(stx, -r * 0.62, r * 0.07, r * 0.035, 0, 0, TAU); fillInk("#1a1009", 1.1);
        // left arm gripping the staff
        heroLimb(c, h, -r * 0.44, -r * 0.36, -r * 0.7, -r * 0.16, -r * 0.62, r * 0.05, aw, sleeve);
        c.beginPath(); c.ellipse(-r * 0.63, r * 0.07, r * 0.085, r * 0.075, 0, 0, TAU); fillInk(SR_ELDER, 1.3);
        // right arm raising the drawn solar blade
        heroLimb(c, h, r * 0.44, -r * 0.36, r * 0.76, -r * 0.16, r * 0.58, -r * 0.31, aw, sleeve);
        const gx = r * 0.62, gy = -r * 0.42, ang = Math.atan2(-0.6, 0.24), ux = Math.cos(ang), uy = Math.sin(ang), bl = r * 0.64;
        const bg = c.createLinearGradient(gx, gy, gx + ux * bl, gy + uy * bl);
        bg.addColorStop(0, "#fff7d6"); bg.addColorStop(0.5, "#ffd76a"); bg.addColorStop(1, "#ff8a2a");
        srKatana(c, h, r, gx, gy, ang, { blade: 0.64, hilt: 0.22, w: 0.085, bend: 0.04, bladeFill: bg, hamon: "rgba(255,255,255,0.9)", guardFill: metal(0, -r * 0.1, 0, r * 0.1, ...SR_GOLD) });
        c.beginPath(); c.ellipse(gx - ux * r * 0.1, gy - uy * r * 0.1, r * 0.085, r * 0.075, ang, 0, TAU); fillInk(SR_ELDER, 1.3);
        // flame tongues licking up the blade + white-hot core
        c.save(); c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 7; i++) {
          const t = 0.08 + i * 0.14, fl = ts ? Math.sin(ts / 110 + i * 1.9) : 0;
          srFlame(c, gx + ux * bl * t, gy + uy * bl * t, r * (0.26 - 0.13 * t + 0.03 * fl), r * 0.11, 0.3 + 0.12 * fl, rgba(i % 2 ? SR_FLAME : "#ffa030", 0.75));
        }
        c.restore();
        energyBlade(gx + ux * r * 0.04, gy + uy * r * 0.04, gx + ux * bl * 0.92, gy + uy * bl * 0.92, Math.max(1.4, r * 0.035), SR_FLAME, "#fff6c8");
        // rising embers
        for (let i = 0; i < 10; i++) {
          const t = ts ? (ts / 1700 + i / 10) % 1 : i / 10;
          const ex = sx0 + (heroHash(i * 7.7) - 0.5) * r * 0.8 + (ts ? Math.sin(ts / 300 + i) * r * 0.03 : 0);
          glowOrb(ex, sy0 + r * 0.35 - t * r * 0.72, r * (0.025 + 0.02 * heroHash(i + 3)) * (1 - t * 0.5), i % 2 ? SR_SOLAR : SR_FLAME);
        }
        // neck, ears and bald scarred crown
        rr(-r * 0.09, -r * 0.56, r * 0.18, r * 0.14, r * 0.04); fillInk(SR_ELDER, 1.5);
        for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(sx * r * 0.2, -r * 0.7, r * 0.04, r * 0.065, 0, 0, TAU); fillInk(SR_ELDER, 1.2); }
        c.beginPath(); c.ellipse(0, -r * 0.74, r * 0.2, r * 0.23, 0, 0, TAU); fillInk(SR_ELDER, 2);
        c.beginPath(); c.ellipse(-r * 0.07, -r * 0.88, r * 0.07, r * 0.035, -0.4, 0, TAU); c.fillStyle = "rgba(255,255,255,0.4)"; c.fill();
        c.strokeStyle = "#9a4b3c"; c.lineWidth = Math.max(1, r * 0.022);
        c.beginPath();
        c.moveTo(-r * 0.12, -r * 0.92); c.lineTo(-r * 0.02, -r * 0.84); c.moveTo(-r * 0.03, -r * 0.93); c.lineTo(-r * 0.11, -r * 0.83);
        c.moveTo(r * 0.03, -r * 0.92); c.lineTo(r * 0.13, -r * 0.84);
        c.stroke();
        c.strokeStyle = "rgba(11,7,16,0.35)"; c.lineWidth = 1;
        c.beginPath(); for (const y of [-0.82, -0.79]) { c.moveTo(-r * 0.08, y * r); c.quadraticCurveTo(0, (y - 0.015) * r, r * 0.08, y * r); } c.stroke();
        // drooping white brows, closed eyes, nose
        const beard = nbCloth(c, -r * 0.2, -r * 0.6, r * 0.2, r * 0.3, SR_BEARD);
        for (const sx of [-1, 1]) {
          poly([sx * 0.03, -0.77, sx * 0.15, -0.8, sx * 0.25, -0.73, sx * 0.29, -0.6, sx * 0.21, -0.68, sx * 0.12, -0.73, sx * 0.03, -0.74]); fillInk(beard, 1.1);
          c.beginPath(); c.moveTo(sx * r * 0.04, -r * 0.7); c.quadraticCurveTo(sx * r * 0.1, -r * 0.68, sx * r * 0.15, -r * 0.7);
          c.strokeStyle = h.INK; c.lineWidth = Math.max(1, r * 0.022); c.stroke();
        }
        c.beginPath(); c.moveTo(0, -r * 0.7); c.lineTo(-r * 0.03, -r * 0.63); c.lineTo(r * 0.02, -r * 0.62);
        c.strokeStyle = "rgba(11,7,16,0.55)"; c.lineWidth = 1.1; c.stroke();
        // long flowing beard tied with a cord near its tip
        const bsw = ts ? Math.sin(ts / 600) * r * 0.03 : 0;
        c.beginPath(); c.moveTo(-r * 0.19, -r * 0.7);
        c.quadraticCurveTo(-r * 0.22, -r * 0.3, -r * 0.12 + bsw, r * 0.05);
        c.quadraticCurveTo(-r * 0.06 + bsw, r * 0.25, bsw, r * 0.34);
        c.quadraticCurveTo(r * 0.06 + bsw, r * 0.25, r * 0.12 + bsw, r * 0.05);
        c.quadraticCurveTo(r * 0.22, -r * 0.3, r * 0.19, -r * 0.7);
        c.quadraticCurveTo(r * 0.12, -r * 0.6, 0, -r * 0.61); c.quadraticCurveTo(-r * 0.12, -r * 0.6, -r * 0.19, -r * 0.7);
        c.closePath(); fillInk(beard, 1.8);
        c.strokeStyle = "rgba(120,114,138,0.55)"; c.lineWidth = 1;
        c.beginPath();
        for (const x of [-0.1, -0.04, 0.03, 0.09]) { c.moveTo(x * r, -r * 0.5); c.quadraticCurveTo(x * 1.2 * r, -r * 0.1, x * 0.6 * r + bsw, r * 0.22); }
        c.stroke();
        rr(-r * 0.11 + bsw, r * 0.1, r * 0.22, r * 0.05, r * 0.02); fillInk(metal(0, r * 0.1, 0, r * 0.15, ...SR_GOLD), 1.1);
        // sweeping moustache
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(0, -r * 0.61);
          c.quadraticCurveTo(sx * r * 0.14, -r * 0.64, sx * r * 0.21, -r * 0.48);
          c.quadraticCurveTo(sx * r * 0.12, -r * 0.57, 0, -r * 0.58); c.closePath(); fillInk(SR_BEARD[0], 1.1);
        }
      },

      /* Crescent Blade Reaper — spiky orange hair, black robes with a white collar and crimson shoulder strap,
         an oversized cloth-wrapped cleaver blade, and a pitch-black / blood-crimson crescent slash aura. */
      reaper(c, pal, r, ts, h) {
        const { fillInk, poly, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(170);
        // pitch-black crescent slash sweeping behind the figure (base silhouette)
        const cx = r * 0.18, cy = -r * 0.18, R = r * 0.98, a0 = -2.6, a1 = 0.7;
        srCrescent(c, cx, cy, R, a0, a1, r * (0.34 + 0.03 * p));
        const ag = c.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
        ag.addColorStop(0, pal.deep); ag.addColorStop(0.75, "#0d060c"); ag.addColorStop(1, "#030103");
        fillInk(ag, 2.2); c.shadowBlur = 0; // drop shadow only on the base silhouette
        // blood-crimson rim, inner crescent echo and streaks riding the slash
        c.save(); c.globalCompositeOperation = "lighter";
        c.beginPath(); c.arc(cx, cy, R * 0.97, a0 + 0.12, a1 - 0.12);
        c.strokeStyle = rgba(SR_CRIMSON, 0.5 + 0.3 * p); c.lineWidth = Math.max(1.5, r * 0.05); c.stroke();
        if (ts) {
          for (let i = 0; i < 6; i++) {
            const a = a0 + 0.2 + ((ts / 700 + i / 6) % 1) * (a1 - a0 - 0.6);
            c.beginPath(); c.arc(cx, cy, R * (0.86 - 0.05 * (i % 3)), a, a + 0.3);
            c.strokeStyle = rgba(i % 2 ? "#ffffff" : SR_CRIMSON, 0.55); c.lineWidth = Math.max(1, r * 0.018); c.stroke();
          }
        }
        c.restore();
        srCrescent(c, cx, cy, R * 0.8, a0 + 0.35, a1 - 0.25, r * 0.12); c.fillStyle = rgba(SR_CRIMSON, 0.7 + 0.2 * p); c.fill();
        // hakama, black robe and the crimson shoulder strap with a steel ring
        srHakama(c, h, r, srDark(c, r, pal));
        srKimono(c, h, r, pal);
        poly([0.3, -0.46, 0.42, -0.4, -0.24, 0.32, -0.36, 0.27]);
        fillInk(nbCloth(c, -r * 0.3, 0, r * 0.4, 0, ["#ff5a63", "#c3172b", "#5e0812"]), 1.4);
        c.beginPath(); c.arc(r * 0.03, -r * 0.05, r * 0.05, 0, TAU); c.strokeStyle = h.INK; c.lineWidth = r * 0.03 + 2; c.stroke();
        c.strokeStyle = h.metal(0, -r * 0.1, 0, 0, ...SR_STEEL); c.lineWidth = r * 0.03; c.stroke();
        // both arms swing toward the hilt
        const aw = Math.max(4, r * 0.2), sleeve = srDark(c, r, pal);
        heroLimb(c, h, -r * 0.44, -r * 0.36, -r * 0.24, r * 0.3, r * 0.4, r * 0.13, aw, sleeve);
        heroLimb(c, h, r * 0.44, -r * 0.36, r * 0.7, -r * 0.1, r * 0.48, r * 0.02, aw, sleeve);
        // oversized cleaver: dark steel body, bright edge band, angled tip, wrapped hilt
        const gx = r * 0.5, gy = -r * 0.04, ang = Math.atan2(-0.88, 0.48), L = r * 1.0, w = r * 0.3;
        c.save(); c.translate(gx, gy); c.rotate(ang);
        c.beginPath(); c.moveTo(0, -w * 0.5); c.lineTo(L * 0.84, -w * 0.5);
        c.quadraticCurveTo(L * 0.9, -w * 0.5, L * 0.92, -w * 0.36); c.lineTo(L, w * 0.5); c.lineTo(0, w * 0.5); c.closePath();
        const cg = c.createLinearGradient(0, -w * 0.5, 0, w * 0.5);
        cg.addColorStop(0, "#5a6070"); cg.addColorStop(0.55, "#1e2129"); cg.addColorStop(0.62, "#cdd4df"); cg.addColorStop(1, "#ffffff");
        fillInk(cg, 2);
        c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(r * 0.04, -w * 0.38); c.lineTo(L * 0.82, -w * 0.38); c.stroke();
        c.save(); c.globalCompositeOperation = "lighter";
        c.beginPath(); c.moveTo(r * 0.02, w * 0.5); c.lineTo(L, w * 0.5);
        c.strokeStyle = rgba(SR_CRIMSON, 0.35 + 0.35 * p); c.lineWidth = Math.max(1.5, r * 0.045); c.stroke();
        c.restore();
        rr(-r * 0.25, -r * 0.06, r * 0.25, r * 0.12, r * 0.04); fillInk(SR_HILT, 1.4);
        c.strokeStyle = SR_TABI; c.lineWidth = Math.max(0.6, r * 0.012);
        c.beginPath(); for (let i = 0; i < 4; i++) { const x0 = -r * (0.23 - i * 0.055); c.moveTo(x0, -r * 0.05); c.lineTo(x0 + r * 0.03, r * 0.05); } c.stroke();
        rr(-r * 0.02, -w * 0.52, r * 0.04, w * 1.04, r * 0.01); fillInk("#2b2733", 1.1);
        c.restore();
        // trailing hilt-wrap ribbon
        const fl = ts ? Math.sin(ts / 240) * r * 0.05 : 0, px = gx - Math.cos(ang) * r * 0.24, py = gy - Math.sin(ang) * r * 0.24;
        nbStrip(c, nbBezierPts(px, py, px - r * 0.1, py + r * 0.16, px - r * 0.1 + fl, py + r * 0.36, px - r * 0.24 + fl, py + r * 0.56, 8), r * 0.05, r * 0.03);
        fillInk(SR_TABI, 1.1);
        // gripping hands
        for (const k of [0.06, 0.18]) {
          c.beginPath(); c.arc(gx - Math.cos(ang) * r * k, gy - Math.sin(ang) * r * k, r * 0.075, 0, TAU); fillInk(SR_SKIN, 1.3);
        }
        // neck, spiky orange hair, face and jagged bangs
        rr(-r * 0.09, -r * 0.56, r * 0.18, r * 0.14, r * 0.04); fillInk(SR_SKIN, 1.5);
        const hair = nbCloth(c, -r * 0.3, -r * 1.15, r * 0.3, -r * 0.6, SR_HAIR_ORANGE);
        srSpikes(c, r, 0, -0.79, 0.27, 0.24, 9, Math.PI * 0.8, Math.PI * 2.2, 0.45, 11, 0.15); fillInk(hair, 1.8);
        nbFace(c, h, r, -0.68, 0.2, SR_SKIN);
        poly([-0.21, -0.82, -0.17, -0.98, -0.1, -0.88, -0.06, -1.0, 0.0, -0.87, 0.07, -0.99, 0.11, -0.87, 0.18, -0.97, 0.22, -0.8,
          0.2, -0.66, 0.15, -0.82, 0.08, -0.79, 0.02, -0.84, -0.05, -0.78, -0.12, -0.83, -0.19, -0.66]);
        fillInk(hair, 1.4);
        // scowling brown eyes, furrowed brows, set mouth
        for (const sx of [-1, 1]) {
          nbEye(c, h, r, sx * r * 0.09, -r * 0.71, sx, "#7a4520");
          c.beginPath(); c.moveTo(sx * r * 0.03, -r * 0.765); c.lineTo(sx * r * 0.16, -r * 0.8);
          c.strokeStyle = h.INK; c.lineWidth = Math.max(1.3, r * 0.028); c.stroke();
        }
        c.beginPath(); c.moveTo(-r * 0.01, -r * 0.77); c.lineTo(-r * 0.005, -r * 0.74); c.moveTo(r * 0.015, -r * 0.77); c.lineTo(r * 0.01, -r * 0.745);
        c.moveTo(-r * 0.05, -r * 0.56); c.quadraticCurveTo(0, -r * 0.575, r * 0.05, -r * 0.56);
        c.strokeStyle = "rgba(11,7,16,0.7)"; c.lineWidth = 1.1; c.stroke();
        if (ts) glowOrb(r * 0.8, -r * 0.55, r * 0.12 * p, SR_CRIMSON);
      },

      /* Savage Battle Warlord — bell-tipped spiky hair, spiked eye-patch and cheek scar, torn sleeveless captain
         coat over a scarred, muscular frame, a heavily notched battle katana, and an erupting golden
         spirit-pressure aura shaped like a looming skull. */
      juggernaut(c, pal, r, ts, h) {
        const { fillInk, poly, metal, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(200);
        // erupting golden spirit-pressure aura (base silhouette)
        const acy = -r * 0.2, N = 30;
        c.beginPath();
        for (let i = 0; i < N; i++) {
          const a = -Math.PI / 2 + i * TAU / N, fl = ts ? 0.94 + 0.06 * Math.sin(ts / 120 + i * 2.3) : 0.97, k = i % 2 ? 0.84 : fl;
          const x = Math.cos(a) * r * 1.08 * k, y = acy + Math.sin(a) * r * k;
          if (i) c.lineTo(x, y); else c.moveTo(x, y);
        }
        c.closePath();
        const ag = c.createRadialGradient(0, -r * 0.5, r * 0.1, 0, acy, r * 1.08);
        ag.addColorStop(0, "rgba(255,248,205,0.9)"); ag.addColorStop(0.5, rgba(SR_WARLORD, 0.75)); ag.addColorStop(0.8, "rgba(224,138,0,0.62)");
        ag.addColorStop(1, rgba(pal.bright, 0.82)); // outer rim takes the side colour
        fillInk(ag, 2); c.shadowBlur = 0; // drop shadow only on the base silhouette
        // side-coloured edge glow, clipped inside the aura so it never spills past the silhouette
        c.save(); c.clip();
        c.strokeStyle = rgba(pal.bright, 0.85); c.lineWidth = r * 0.16; c.stroke();
        c.strokeStyle = rgba(pal.rim, 0.95); c.lineWidth = Math.max(1, r * 0.05); c.stroke();
        c.restore();
        c.strokeStyle = h.INK; c.lineWidth = 2; c.stroke(); // re-ink the aura outline over the glow
        // flame tongues licking off the aura crown
        c.save(); c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 7; i++) {
          const a = -2.6 + i * 0.34, fl = ts ? Math.sin(ts / 130 + i * 1.3) : 0;
          srFlame(c, Math.cos(a) * r * 0.86, acy + Math.sin(a) * r * 0.8, r * (0.15 + 0.02 * fl), r * 0.12, a + Math.PI / 2, rgba("#fff1a0", 0.55));
        }
        c.restore();
        // the skull: slanted eye sockets with burning pupils, teeth beyond the shoulders, cranium crack
        for (const sx of [-1, 1]) {
          c.save(); c.translate(sx * r * 0.56, -r * 0.74); c.scale(sx, 1); c.rotate(0.35);
          c.beginPath(); c.moveTo(-r * 0.2, -r * 0.04); c.quadraticCurveTo(0, -r * 0.2, r * 0.2, -r * 0.02);
          c.quadraticCurveTo(r * 0.08, r * 0.16, -r * 0.14, r * 0.12); c.closePath();
          c.fillStyle = "rgba(70,34,0,0.72)"; c.fill();
          c.restore();
          glowOrb(sx * r * 0.56, -r * 0.72, r * 0.07 * (0.7 + 0.6 * p), "#fff3b0");
        }
        c.fillStyle = "rgba(255,250,225,0.85)"; c.strokeStyle = "rgba(90,45,0,0.75)"; c.lineWidth = 1;
        for (let i = -7; i <= 7; i++) {
          if (Math.abs(i) < 3) continue;
          rr(i * 0.12 * r - r * 0.05, -r * 0.3 + Math.abs(i) * 0.012 * r, r * 0.1, r * (0.16 - Math.abs(i) * 0.01), r * 0.03); c.fill(); c.stroke();
        }
        c.beginPath(); c.moveTo(r * 0.08, -r * 1.12); c.lineTo(r * 0.16, -r * 1.04); c.lineTo(r * 0.12, -r * 0.98); c.lineTo(r * 0.22, -r * 0.92);
        c.strokeStyle = "rgba(90,45,0,0.6)"; c.lineWidth = 1.2; c.stroke();
        // ragged hakama, robe open over a scarred chest, torn sleeveless coat
        srHakama(c, h, r, srDark(c, r, pal), { hw: 0.56, ragged: 7 });
        srKimono(c, h, r, pal, { sw: 0.5, ww: 0.36, open: SR_TAN });
        c.beginPath(); c.moveTo(-r * 0.1, -r * 0.42); c.lineTo(r * 0.06, -r * 0.2); c.moveTo(r * 0.08, -r * 0.44); c.lineTo(r * 0.02, -r * 0.3);
        c.strokeStyle = "#a5503e"; c.lineWidth = Math.max(1, r * 0.02); c.stroke();
        srHaori(c, h, r, pal, { hem: 0.86, rag: 0.12 });
        // muscular arms: torn sleeves over bare forearms
        const aw = Math.max(4, r * 0.23), sleeve = srDark(c, r, pal);
        heroLimb(c, h, -r * 0.5, -r * 0.34, -r * 0.62, -r * 0.24, -r * 0.7, -r * 0.08, aw, sleeve);
        heroLimb(c, h, -r * 0.7, -r * 0.08, -r * 0.7, r * 0.06, -r * 0.62, r * 0.18, aw * 0.9, SR_TAN);
        c.beginPath(); c.arc(-r * 0.62, r * 0.2, r * 0.09, 0, TAU); fillInk(SR_TAN, 1.4);
        heroLimb(c, h, r * 0.5, -r * 0.34, r * 0.66, -r * 0.26, r * 0.74, -r * 0.12, aw, sleeve);
        heroLimb(c, h, r * 0.74, -r * 0.12, r * 0.74, 0, r * 0.65, r * 0.09, aw * 0.9, SR_TAN);
        // heavily notched battle katana thrust down and out
        const ang = Math.atan2(0.77, 0.4);
        srKatana(c, h, r, r * 0.7, r * 0.18, ang, { blade: 0.86, hilt: 0.22, w: 0.1, bend: 0.04, notched: true });
        c.beginPath(); c.arc(r * 0.7 - Math.cos(ang) * r * 0.1, r * 0.18 - Math.sin(ang) * r * 0.1, r * 0.09, 0, TAU); fillInk(SR_TAN, 1.4);
        // thick neck, outward spikes tipped with little bells
        rr(-r * 0.11, -r * 0.56, r * 0.22, r * 0.15, r * 0.04); fillInk(SR_TAN, 1.5);
        const hair = nbCloth(c, -r * 0.3, -r * 1.2, r * 0.3, -r * 0.6, SR_HAIR_BLACK);
        const tips = srSpikes(c, r, 0, -0.76, 0.24, 0.22, 10, Math.PI * 0.75, Math.PI * 2.25, 0.75, 31); fillInk(hair, 1.8);
        tips.forEach(([tx, ty], i) => {
          const swing = ts ? Math.sin(ts / 150 + i) * r * 0.012 : 0, bx = tx * 0.9 + swing, by = (ty + r * 0.76) * 0.9 - r * 0.76;
          c.beginPath(); c.arc(bx, by, r * 0.035, 0, TAU); fillInk(metal(bx - r * 0.03, by - r * 0.03, bx + r * 0.03, by + r * 0.03, ...SR_GOLD), 1);
          c.beginPath(); c.moveTo(bx - r * 0.02, by + r * 0.01); c.lineTo(bx + r * 0.02, by + r * 0.01); c.strokeStyle = h.INK; c.lineWidth = 0.8; c.stroke();
        });
        nbFace(c, h, r, -0.66, 0.21, SR_TAN);
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.72); c.quadraticCurveTo(-r * 0.24, -r * 1.0, 0, -r * 1.0);
        c.quadraticCurveTo(r * 0.24, -r * 1.0, r * 0.22, -r * 0.72); c.lineTo(r * 0.14, -r * 0.84); c.lineTo(r * 0.05, -r * 0.8);
        c.lineTo(-r * 0.04, -r * 0.85); c.lineTo(-r * 0.13, -r * 0.8); c.closePath(); fillInk(hair, 1.6);
        // spiked eye-patch with its strap
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.77); c.lineTo(r * 0.21, -r * 0.86);
        c.strokeStyle = "#141018"; c.lineWidth = Math.max(1.2, r * 0.022); c.stroke();
        for (let i = 0; i < 7; i++) {
          const a = i * TAU / 7 + 0.2, cx = -r * 0.09, cy = -r * 0.7;
          c.beginPath(); c.moveTo(cx + Math.cos(a - 0.2) * r * 0.07, cy + Math.sin(a - 0.2) * r * 0.06);
          c.lineTo(cx + Math.cos(a) * r * 0.11, cy + Math.sin(a) * r * 0.095); c.lineTo(cx + Math.cos(a + 0.2) * r * 0.07, cy + Math.sin(a + 0.2) * r * 0.06);
          c.closePath(); fillInk(metal(cx, cy - r * 0.1, cx, cy + r * 0.1, ...SR_STEEL), 0.8);
        }
        c.beginPath(); c.ellipse(-r * 0.09, -r * 0.7, r * 0.075, r * 0.062, 0, 0, TAU); fillInk("#120e16", 1.2);
        // fierce open eye, heavy brow, long scar, wide toothy grin
        nbEye(c, h, r, r * 0.09, -r * 0.7, 1, "#e8c43a", (x, y, rad) => {
          c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fillStyle = "#e8c43a"; c.fill();
          c.beginPath(); c.arc(x, y, rad * 0.35, 0, TAU); c.fillStyle = "#120c14"; c.fill();
        });
        c.beginPath(); c.moveTo(r * 0.03, -r * 0.765); c.lineTo(r * 0.17, -r * 0.8);
        c.strokeStyle = h.INK; c.lineWidth = Math.max(1.4, r * 0.03); c.stroke();
        c.beginPath(); c.moveTo(r * 0.12, -r * 0.88); c.lineTo(r * 0.17, -r * 0.53);
        c.strokeStyle = "#a5503e"; c.lineWidth = Math.max(1, r * 0.018); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.11, -r * 0.58); c.quadraticCurveTo(0, -r * 0.52, r * 0.11, -r * 0.59);
        c.quadraticCurveTo(0, -r * 0.47, -r * 0.11, -r * 0.58); c.closePath(); fillInk("#fbf7ef", 1.3);
        c.strokeStyle = "rgba(11,7,16,0.6)"; c.lineWidth = 0.8;
        c.beginPath(); for (const x of [-0.06, -0.02, 0.02, 0.06]) { c.moveTo(x * r, -r * 0.555); c.lineTo(x * r, -r * 0.515); } c.stroke();
      },

      /* Blossom Blade Noble — sleek dark hair with silver tube clips, teal silk scarf, white captain coat, and a
         sword hilt whose blade dissolves into a swirling storm of glowing pink blossom-petal blades. */
      trickster(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, glowOrb, pulse, rgba, rr, metal } = h;
        const p = pulse(300), sway = ts ? Math.sin(ts / 600) * r * 0.02 : 0, flutter = ts ? Math.sin(ts / 260) * r * 0.04 : 0;
        // captain coat back panel showing the side-coloured lining (base silhouette)
        srCoatBack(c, r, 0.48, 0.7, 1.04, sway); fillInk(bodyGrad, 2.4); c.shadowBlur = 0; // drop shadow only on the base silhouette
        // long teal silk scarf streaming behind to the left
        const teal = nbCloth(c, -r, -r * 0.6, r * 0.2, r * 0.4, ["#c8fff4", "#6fd6c8", "#2d8a83"]);
        nbStrip(c, nbBezierPts(-r * 0.12, -r * 0.5, -r * 0.55, -r * 0.62, -r * 0.8, -r * 0.2 + flutter, -r * 1.06, r * 0.3 - flutter, 10), r * 0.2, r * 0.1);
        fillInk(teal, 1.6);
        // soft pink haze where the blossom storm swirls
        const vx = r * 0.62, vy = -r * 0.5, spin = ts ? ts / 650 : 0.9;
        c.save(); c.globalCompositeOperation = "lighter";
        const hz = c.createRadialGradient(vx, vy, 0, vx, vy, r * 0.52);
        hz.addColorStop(0, rgba(SR_SAKURA, 0.4 + 0.15 * p)); hz.addColorStop(1, rgba(SR_SAKURA, 0));
        c.fillStyle = hz; c.beginPath(); c.arc(vx, vy, r * 0.52, 0, TAU); c.fill();
        c.restore();
        // hakama, black robe, white coat, scarf wrap at the throat
        srHakama(c, h, r, srDark(c, r, pal), { sway: sway * 0.5 });
        srKimono(c, h, r, pal);
        srHaori(c, h, r, pal, { hem: 1.0, sway });
        // left arm resting at the side
        const aw = Math.max(4, r * 0.2), sleeve = srDark(c, r, pal);
        heroLimb(c, h, -r * 0.44, -r * 0.36, -r * 0.62, -r * 0.02, -r * 0.5, r * 0.3, aw, sleeve);
        c.beginPath(); c.ellipse(-r * 0.5, r * 0.33, r * 0.07, r * 0.08, 0, 0, TAU); fillInk(SR_SKIN, 1.2);
        // right arm presenting the hilt; the short blade stub dissolves into petals
        heroLimb(c, h, r * 0.44, -r * 0.36, r * 0.72, -r * 0.16, r * 0.52, -r * 0.04, aw, sleeve);
        const ga = -Math.PI / 2 + 0.3, gx = r * 0.56, gy = -r * 0.14;
        srKatana(c, h, r, gx, gy, ga, { blade: 0.2, hilt: 0.2, w: 0.075, bend: 0.02, guard: "blossom",
          guardFill: metal(gx - r * 0.06, gy - r * 0.06, gx + r * 0.06, gy + r * 0.06, ...SR_GOLD), hamon: false });
        c.beginPath(); c.ellipse(gx - Math.cos(ga) * r * 0.1, gy - Math.sin(ga) * r * 0.1, r * 0.075, r * 0.07, 0, 0, TAU); fillInk(SR_SKIN, 1.2);
        // petal blades swirling outward in three spiral arms
        const shades = ["#ffe3f1", "#ffa6d2", "#ff6fb3"];
        for (let k = 0; k < 3; k++) {
          for (let j = 0; j < 16; j++) {
            const t = j / 15, rad = r * (0.06 + 0.42 * t), a = spin + k * TAU / 3 + t * 3.4;
            const x = vx + Math.cos(a) * rad, y = vy + Math.sin(a) * rad * 0.92, s = r * (0.04 + 0.04 * t);
            if (j % 4 === 0) glowOrb(x, y, r * 0.05, SR_SAKURA);
            srPetal(c, x, y, s, a + Math.PI * 0.6, shades[(j + k) % 3], "rgba(120,20,70,0.55)");
          }
        }
        // stray petals drifting across the field
        for (let i = 0; i < 9; i++) {
          const fx = ((i * 0.37 + (ts ? ts / 5200 : 0)) % 1), fy = ((i * 0.61 + (ts ? ts / 3800 : 0)) % 1);
          srPetal(c, -r * 1.02 + fx * r * 2.0, -r * 0.98 + fy * r * 1.9 + Math.sin(i + (ts ? ts / 500 : 0)) * r * 0.04, r * 0.05,
            i * 1.7 + (ts ? ts / 700 : 0), shades[i % 3], "rgba(120,20,70,0.45)");
        }
        // scarf wrap at the throat, dropping over the left breast
        rr(-r * 0.24, -r * 0.52, r * 0.48, r * 0.12, r * 0.05); fillInk(teal, 1.4);
        poly([-0.2, -0.44, -0.08, -0.44, -0.12, 0.02, -0.24, 0.0]); fillInk(teal, 1.3);
        // long sleek dark hair falling behind the shoulders
        const hair = nbCloth(c, -r * 0.3, -r * 1.05, r * 0.3, -r * 0.3, SR_HAIR_BLACK);
        poly([-0.24, -0.86, -0.29, -0.5, -0.24, -0.4, 0.24, -0.4, 0.29, -0.5, 0.24, -0.86]); fillInk(hair, 1.6);
        nbFace(c, h, r, -0.68, 0.195, SR_SKIN);
        c.beginPath(); c.moveTo(-r * 0.23, -r * 0.62); c.quadraticCurveTo(-r * 0.27, -r * 1.02, 0, -r * 1.02);
        c.quadraticCurveTo(r * 0.27, -r * 1.02, r * 0.23, -r * 0.62); c.lineTo(r * 0.18, -r * 0.84); c.lineTo(r * 0.06, -r * 0.9);
        c.lineTo(0, -r * 0.82); c.lineTo(-r * 0.06, -r * 0.9); c.lineTo(-r * 0.18, -r * 0.84); c.closePath(); fillInk(hair, 1.6);
        nbStrip(c, nbBezierPts(-r * 0.01, -r * 0.9, -r * 0.02, -r * 0.8, r * 0.02, -r * 0.72, 0, -r * 0.62, 5), r * 0.035, r * 0.012); fillInk(hair, 0.9);
        // silver tube clips holding the hair
        for (let i = 0; i < 3; i++) {
          c.save(); c.translate(-r * (0.17 + i * 0.03), -r * (0.95 - i * 0.075)); c.rotate(-0.5 - i * 0.15);
          rr(-r * 0.05, -r * 0.018, r * 0.1, r * 0.036, r * 0.015); fillInk(metal(0, -r * 0.02, 0, r * 0.02, ...SR_STEEL), 1);
          c.strokeStyle = "rgba(11,7,16,0.5)"; c.lineWidth = 0.8;
          c.beginPath(); c.moveTo(-r * 0.015, -r * 0.018); c.lineTo(-r * 0.015, r * 0.018); c.moveTo(r * 0.02, -r * 0.018); c.lineTo(r * 0.02, r * 0.018); c.stroke();
          c.restore();
        }
        // calm half-lidded grey eyes, level brows, composed mouth
        for (const sx of [-1, 1]) {
          const ex = sx * r * 0.09, ey = -r * 0.71;
          nbEye(c, h, r, ex, ey, sx, "#6e7c9a");
          c.beginPath(); c.moveTo(ex - r * 0.07, ey - r * 0.012); c.lineTo(ex + r * 0.07, ey - r * 0.02);
          c.strokeStyle = h.INK; c.lineWidth = Math.max(1, r * 0.02); c.stroke();
          c.beginPath(); c.moveTo(sx * r * 0.04, -r * 0.785); c.lineTo(sx * r * 0.15, -r * 0.79); c.lineWidth = Math.max(1, r * 0.022); c.stroke();
        }
        c.beginPath(); c.moveTo(-r * 0.04, -r * 0.565); c.lineTo(r * 0.04, -r * 0.565);
        c.strokeStyle = "rgba(11,7,16,0.6)"; c.lineWidth = 1; c.stroke();
      },

      /* Flash-Step Goddess — violet ponytail, golden cat eyes, fitted backless stealth garb with gold arm
         bracers, a low lunging leap trailed by a flash-step afterimage, and crackling white-gold lightning
         wreathing her shoulders and fists. */
      wildrider(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, metal, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(120), bob = ts ? Math.sin(ts / 260) * r * 0.02 : 0;
        // flash-step afterimage trailing to the left (base silhouette)
        c.save(); c.globalAlpha *= 0.5;
        c.beginPath();
        c.ellipse(-r * 0.34, -r * 0.66, r * 0.17, r * 0.19, 0, 0, TAU);
        c.moveTo(-r * 0.6, -r * 0.42); c.lineTo(-r * 0.04, -r * 0.34); c.lineTo(-r * 0.16, r * 0.36); c.lineTo(-r * 0.56, r * 0.36); c.closePath();
        c.moveTo(-r * 0.5, r * 0.3); c.lineTo(-r * 0.98, r * 1.02); c.lineTo(-r * 0.8, r * 1.06); c.lineTo(-r * 0.3, r * 0.4); c.closePath();
        c.moveTo(-r * 0.28, r * 0.3); c.lineTo(-r * 0.02, r * 0.52); c.lineTo(-r * 0.06, r * 1.04); c.lineTo(-r * 0.2, r * 1.04); c.lineTo(-r * 0.2, r * 0.62); c.closePath();
        fillInk(bodyGrad, 2);
        c.restore(); c.shadowBlur = 0; // drop shadow only on the base silhouette
        // speed streaks
        c.save(); c.globalCompositeOperation = "lighter"; c.strokeStyle = rgba(SR_FLASH, 0.5); c.lineWidth = Math.max(1, r * 0.02);
        c.beginPath();
        for (let i = 0; i < 6; i++) {
          const ph = (ts ? (ts / 400 + i * 0.37) % 1 : i * 0.13) * r * 0.4, y = r * (-0.8 + i * 0.32), x0 = -r * 1.15 + ph;
          c.moveTo(x0, y); c.lineTo(x0 + r * 0.35, y);
        }
        c.stroke(); c.restore();
        // legs: back leg extended, front leg bent in a low lunge
        const leg = srDark(c, r, pal), lw = Math.max(4, r * 0.19);
        heroLimb(c, h, -r * 0.1, r * 0.36, -r * 0.45, r * 0.6, -r * 0.84, r * 0.96, lw, leg);
        heroLimb(c, h, r * 0.12, r * 0.36, r * 0.32, r * 0.36, r * 0.5, r * 0.52, lw, leg);
        heroLimb(c, h, r * 0.5, r * 0.52, r * 0.56, r * 0.75, r * 0.44, r * 0.98, lw * 0.9, leg);
        c.strokeStyle = SR_TABI; c.lineWidth = Math.max(0.8, r * 0.02);
        c.beginPath(); for (const t of [0.78, 0.86, 0.93]) { c.moveTo(r * (0.43 + 0.05 * t), t * r); c.lineTo(r * (0.55 - 0.02 * t), (t - 0.03) * r); } c.stroke();
        c.beginPath(); c.ellipse(-r * 0.9, r * 1.0, r * 0.1, r * 0.05, 0.6, 0, TAU); fillInk(SR_TABI, 1.2);
        c.beginPath(); c.ellipse(r * 0.52, r * 1.04, r * 0.11, r * 0.055, 0, 0, TAU); fillInk(SR_TABI, 1.2);
        c.beginPath(); c.ellipse(r * 0.01, r * 0.35, r * 0.24, r * 0.12, 0.1, 0, TAU); fillInk(leg, 1.8);
        // forward-leaning torso: bare shoulders, fitted halter, gold sash
        const T = [r * 0.02, r * 0.36 + bob], la = 0.22, ca = Math.cos(la), sa = Math.sin(la);
        const W = (lx, ly) => [T[0] + (lx * ca - ly * sa) * r, T[1] + (lx * sa + ly * ca) * r];
        c.save(); c.translate(T[0], T[1]); c.rotate(la);
        jlTorso(c, r, 0.36, 0.25, -0.78, 0.0); fillInk(SR_TAWNY, 2.2);
        const top = () => {
          c.beginPath(); c.moveTo(-r * 0.31, -r * 0.6); c.quadraticCurveTo(-r * 0.1, -r * 0.66, -r * 0.08, -r * 0.82);
          c.lineTo(r * 0.08, -r * 0.82); c.quadraticCurveTo(r * 0.1, -r * 0.66, r * 0.31, -r * 0.6);
          c.lineTo(r * 0.26, 0); c.lineTo(-r * 0.26, 0); c.closePath();
        };
        top(); fillInk(srDark(c, r, pal), 1.8);
        c.strokeStyle = rgba(pal.rim, 0.6); c.lineWidth = 1;
        c.beginPath(); c.moveTo(0, -r * 0.78); c.lineTo(0, -r * 0.08); c.stroke();
        rr(-r * 0.28, -r * 0.1, r * 0.56, r * 0.1, r * 0.03); fillInk(metal(0, -r * 0.1, 0, 0, ...SR_GOLD), 1.3);
        c.restore();
        const RS = W(0.36, -0.74), LS = W(-0.36, -0.74), back = W(0, -0.72);
        // white-gold lightning mantle bursting from the shoulders and back
        glowOrb(back[0], back[1], r * (0.32 + 0.06 * p), SR_FLASH);
        c.save(); c.globalCompositeOperation = "lighter";
        c.translate(back[0], back[1]); c.rotate(la);
        c.beginPath(); c.ellipse(0, 0, r * 0.62, r * 0.22, 0, 0, TAU);
        c.strokeStyle = rgba(SR_FLASH, 0.45 + 0.35 * p); c.lineWidth = Math.max(1.2, r * 0.03); c.stroke();
        c.restore();
        const bw = Math.max(1, r * 0.026);
        [[RS, 0.9, -0.72], [RS, 0.86, -0.04], [LS, -0.62, -0.86], [LS, -0.68, -0.32], [back, 0.12, -1.12], [W(0.1, -0.7), 0.55, -1.04], [W(-0.1, -0.7), -0.25, -1.12]]
          .forEach(([o, x, y], i) => heroBolt(c, h, ts, o[0], o[1], x * r, y * r, bw, i % 2 ? "#ffd75a" : SR_FLASH, i + 3, 5));
        // left arm cocked back, right fist driving forward, both in gold bracers
        const aw = Math.max(3, r * 0.16), LF = [-r * 0.44, r * 0.02], RF = [r * 0.96, -r * 0.26];
        heroLimb(c, h, LS[0], LS[1], -r * 0.4, -r * 0.34, -r * 0.46, -r * 0.16, aw, SR_TAWNY);
        heroLimb(c, h, -r * 0.46, -r * 0.16, -r * 0.47, -r * 0.08, LF[0], LF[1], aw, SR_TAWNY);
        heroLimb(c, h, RS[0], RS[1], r * 0.66, -r * 0.34, r * 0.76, -r * 0.32, aw, SR_TAWNY);
        heroLimb(c, h, r * 0.76, -r * 0.32, r * 0.84, -r * 0.3, RF[0], RF[1], aw, SR_TAWNY);
        const bracer = (x1, y1, x2, y2) => {
          c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
          c.strokeStyle = h.INK; c.lineWidth = aw * 1.25 + 2; c.stroke();
          c.strokeStyle = metal(x1, y1 - r * 0.05, x1, y1 + r * 0.05, ...SR_GOLD); c.lineWidth = aw * 1.25; c.stroke();
        };
        bracer(r * 0.8, -r * 0.31, r * 0.9, -r * 0.28); bracer(-r * 0.465, -r * 0.11, -r * 0.45, -r * 0.03);
        for (const [fx, fy] of [LF, RF]) {
          glowOrb(fx, fy, r * (0.15 + 0.04 * p), SR_FLASH);
          c.beginPath(); c.arc(fx, fy, r * 0.085, 0, TAU); fillInk(SR_TAWNY, 1.4);
          for (let i = 0; i < 3; i++) {
            const a = (fx > 0 ? -1.2 : 1.6) + i * 1.1 + (ts ? (heroHash(Math.floor(ts / 90) + i) - 0.5) * 0.4 : 0);
            heroBolt(c, h, ts, fx, fy, fx + Math.cos(a) * r * 0.19, fy + Math.sin(a) * r * 0.19, Math.max(0.8, r * 0.018), SR_FLASH, i + 11, 3);
          }
        }
        // violet ponytail streaming back
        const fl = ts ? Math.sin(ts / 200) * r * 0.05 : 0, hair = nbCloth(c, -r * 0.9, -r * 1.1, r * 0.4, -r * 0.5, SR_HAIR_VIOLET);
        nbStrip(c, nbBezierPts(r * 0.14, -r * 0.88, -r * 0.15, -r * 1.06, -r * 0.5, -r * 0.84 + fl, -r * 0.92, -r * 0.98 - fl * 0.5, 10), r * 0.18, r * 0.05);
        fillInk(hair, 1.6);
        // neck, face, sleek cap with bangs, gold hair tie
        const nk = W(0, -0.84);
        rr(nk[0] - r * 0.08, nk[1] - r * 0.12, r * 0.16, r * 0.16, r * 0.04); fillInk(SR_TAWNY, 1.4);
        c.save(); c.translate(r * 0.26, 0);
        nbFace(c, h, r, -0.7, 0.19, SR_TAWNY);
        c.beginPath(); c.moveTo(-r * 0.21, -r * 0.66); c.quadraticCurveTo(-r * 0.24, -r * 1.02, 0, -r * 1.02);
        c.quadraticCurveTo(r * 0.24, -r * 1.02, r * 0.21, -r * 0.7); c.lineTo(r * 0.15, -r * 0.86); c.lineTo(r * 0.06, -r * 0.83);
        c.lineTo(-r * 0.02, -r * 0.9); c.lineTo(-r * 0.1, -r * 0.84); c.lineTo(-r * 0.17, -r * 0.88); c.closePath(); fillInk(hair, 1.6);
        for (const sx of [-1, 1]) {
          nbEye(c, h, r, sx * r * 0.085, -r * 0.73, sx, "#ffc23a", (x, y, rad) => {
            c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fillStyle = "#ffc23a"; c.fill();
            c.beginPath(); c.ellipse(x, y, rad * 0.22, rad * 0.8, 0, 0, TAU); c.fillStyle = "#1a0c08"; c.fill();
          });
          c.beginPath(); c.moveTo(sx * r * 0.03, -r * 0.79); c.quadraticCurveTo(sx * r * 0.1, -r * 0.82, sx * r * 0.15, -r * 0.8);
          c.strokeStyle = h.INK; c.lineWidth = Math.max(1, r * 0.022); c.stroke();
        }
        c.beginPath(); c.moveTo(-r * 0.04, -r * 0.59); c.quadraticCurveTo(r * 0.01, -r * 0.57, r * 0.06, -r * 0.6);
        c.strokeStyle = "rgba(11,7,16,0.7)"; c.lineWidth = 1.1; c.stroke();
        c.restore();
        c.beginPath(); c.ellipse(r * 0.13, -r * 0.89, r * 0.04, r * 0.055, -0.5, 0, TAU); fillInk(metal(r * 0.1, -r * 0.94, r * 0.16, -r * 0.84, ...SR_GOLD), 1.1);
      },

      /* Silver Spirit Archer — marksman in a white high-collared uniform coat with silver cross and piping and
         a blue crest, rimless glasses, drawing an azure reishi arrow on a glowing crystalline spirit bow. */
      skirmisher(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, pulse, rgba, rr, energyBlade } = h;
        const p = pulse(200), sway = ts ? Math.sin(ts / 560) * r * 0.02 : 0;
        // uniform coat back panel showing the side-coloured lining (base silhouette)
        srCoatBack(c, r, 0.44, 0.62, 1.04, sway); fillInk(bodyGrad, 2.4); c.shadowBlur = 0; // drop shadow only on the base silhouette
        // white trousers, dark shoes, closed high-collared coat with a split flared skirt
        jlLegs(c, h, r, nbCloth(c, -r * 0.3, 0, r * 0.3, 0, SR_WHITE), "#23202c", 0.96);
        const coat = () => {
          c.beginPath(); c.moveTo(-r * 0.44, -r * 0.42); c.quadraticCurveTo(-r * 0.52, r * 0.1, -r * 0.58 + sway, r * 0.92);
          c.lineTo(-r * 0.1 + sway * 0.5, r * 0.92); c.lineTo(0, r * 0.42); c.lineTo(r * 0.1 + sway * 0.5, r * 0.92);
          c.lineTo(r * 0.58 + sway, r * 0.92); c.quadraticCurveTo(r * 0.52, r * 0.1, r * 0.44, -r * 0.42);
          c.quadraticCurveTo(0, -r * 0.54, -r * 0.44, -r * 0.42); c.closePath();
        };
        coat(); fillInk(srWhite(c, r), 2.4);
        c.save(); coat(); c.clip();
        c.strokeStyle = metal(0, -r * 0.4, 0, r * 0.9, ...SR_STEEL); c.lineWidth = Math.max(1.2, r * 0.03);
        c.beginPath(); c.moveTo(0, -r * 0.5); c.lineTo(0, r * 0.42); c.moveTo(-r * 0.7, r * 0.84); c.lineTo(r * 0.7, r * 0.84); c.stroke();
        c.strokeStyle = rgba(pal.rim, 0.8); c.lineWidth = Math.max(1, r * 0.018);
        c.beginPath(); c.moveTo(-r * 0.7, r * 0.79); c.lineTo(r * 0.7, r * 0.79);
        c.moveTo(-r * 0.36, -r * 0.4); c.quadraticCurveTo(-r * 0.42, r * 0.2, -r * 0.48, r * 0.8);
        c.moveTo(r * 0.36, -r * 0.4); c.quadraticCurveTo(r * 0.42, r * 0.2, r * 0.48, r * 0.8); c.stroke();
        c.restore();
        rr(-r * 0.38, r * 0.24, r * 0.76, r * 0.08, r * 0.03); fillInk(metal(0, r * 0.24, 0, r * 0.32, ...SR_STEEL), 1.3);
        // silver cross emblem and blue shoulder crest
        c.save(); c.translate(r * 0.2, -r * 0.14);
        c.beginPath();
        c.moveTo(-r * 0.025, -r * 0.1); c.lineTo(r * 0.025, -r * 0.1); c.lineTo(r * 0.02, -r * 0.03); c.lineTo(r * 0.07, -r * 0.035);
        c.lineTo(r * 0.07, r * 0.005); c.lineTo(r * 0.02, 0); c.lineTo(r * 0.03, r * 0.11); c.lineTo(-r * 0.03, r * 0.11);
        c.lineTo(-r * 0.02, 0); c.lineTo(-r * 0.07, r * 0.005); c.lineTo(-r * 0.07, -r * 0.035); c.lineTo(-r * 0.02, -r * 0.03); c.closePath();
        fillInk(metal(-r * 0.07, -r * 0.1, r * 0.07, r * 0.1, ...SR_STEEL), 1.1);
        c.restore();
        poly([-0.36, -0.36, -0.22, -0.36, -0.22, -0.22, -0.29, -0.15, -0.36, -0.22]); fillInk(nbCloth(c, -r * 0.36, -r * 0.36, -r * 0.22, -r * 0.15, ["#9be2ff", "#2f7fe0", "#123a7a"]), 1.2);
        c.strokeStyle = "#ffffff"; c.lineWidth = Math.max(0.8, r * 0.015);
        c.beginPath(); c.moveTo(-r * 0.29, -r * 0.33); c.lineTo(-r * 0.29, -r * 0.19); c.moveTo(-r * 0.33, -r * 0.28); c.lineTo(-r * 0.25, -r * 0.28); c.stroke();
        // left arm extended to the bow grip
        const aw = Math.max(4, r * 0.19), sleeve = srWhite(c, r);
        heroLimb(c, h, -r * 0.44, -r * 0.36, -r * 0.62, -r * 0.44, -r * 0.84, -r * 0.32, aw, sleeve);
        // glowing crystalline spirit bow: quadratic limb lined with faceted shards and a star crystal at the grip
        const T = [-r * 0.66, -r * 0.96], C = [-r * 1.14, -r * 0.3], B = [-r * 0.66, r * 0.36], G = [-r * 0.9, -r * 0.3];
        const q = (t) => {
          const u = 1 - t;
          return [u * u * T[0] + 2 * u * t * C[0] + t * t * B[0], u * u * T[1] + 2 * u * t * C[1] + t * t * B[1],
            2 * u * (C[0] - T[0]) + 2 * t * (B[0] - C[0]), 2 * u * (C[1] - T[1]) + 2 * t * (B[1] - C[1])];
        };
        c.save(); c.globalCompositeOperation = "lighter";
        c.beginPath(); c.moveTo(T[0], T[1]); c.quadraticCurveTo(C[0], C[1], B[0], B[1]);
        c.strokeStyle = rgba(SR_REISHI, 0.35 + 0.2 * p); c.lineWidth = Math.max(3, r * 0.1); c.stroke();
        c.restore();
        for (let i = 0; i <= 10; i++) {
          const [x, y, dx, dy] = q(i / 10), a = Math.atan2(dy, dx), s = r * (0.07 - 0.035 * Math.abs(i - 5) / 5);
          c.save(); c.translate(x, y); c.rotate(a);
          c.beginPath(); c.moveTo(-s, 0); c.lineTo(0, -s * 0.45); c.lineTo(s, 0); c.lineTo(0, s * 0.45); c.closePath();
          fillInk(nbCloth(c, -s, -s, s, s, ["#ffffff", "#8fe0ff", "#1f6fd0"]), 0.9);
          c.restore();
        }
        c.save(); c.translate(G[0], G[1]); c.rotate(ts ? ts / 1600 : 0.3);
        c.beginPath();
        for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, rad = i % 2 ? r * 0.05 : r * 0.12; if (i) c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); else c.moveTo(rad, 0); }
        c.closePath(); fillInk(nbCloth(c, -r * 0.12, -r * 0.12, r * 0.12, r * 0.12, ["#ffffff", "#8fe0ff", "#1f6fd0"]), 1);
        c.restore();
        // bowstring to the nock at the drawing hand
        const N = [r * 0.14, -r * 0.44];
        c.beginPath(); c.moveTo(T[0], T[1]); c.lineTo(N[0], N[1]); c.lineTo(B[0], B[1]);
        c.strokeStyle = rgba("#d8f4ff", 0.85); c.lineWidth = Math.max(0.8, r * 0.014); c.stroke();
        // neck, dark neat hair, face, rimless glasses, high collar
        rr(-r * 0.09, -r * 0.56, r * 0.18, r * 0.14, r * 0.04); fillInk(SR_SKIN, 1.5);
        const hair = nbCloth(c, -r * 0.3, -r * 1.05, r * 0.3, -r * 0.5, SR_HAIR_BLACK);
        c.beginPath(); c.arc(0, -r * 0.76, r * 0.24, Math.PI * 0.95, Math.PI * 2.05); c.closePath(); fillInk(hair, 1.6);
        nbFace(c, h, r, -0.68, 0.195, SR_SKIN);
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.66); c.quadraticCurveTo(-r * 0.25, -r * 1.0, 0, -r * 1.0);
        c.quadraticCurveTo(r * 0.25, -r * 1.0, r * 0.22, -r * 0.7); c.lineTo(r * 0.2, -r * 0.82); c.lineTo(r * 0.06, -r * 0.86);
        c.lineTo(-r * 0.08, -r * 0.8); c.lineTo(-r * 0.12, -r * 0.62); c.lineTo(-r * 0.16, -r * 0.8); c.closePath(); fillInk(hair, 1.6);
        for (const sx of [-1, 1]) {
          nbEye(c, h, r, sx * r * 0.09, -r * 0.71, sx, "#3d6fd0");
          c.beginPath(); c.moveTo(sx * r * 0.04, -r * 0.79); c.lineTo(sx * r * 0.15, -r * 0.8);
          c.strokeStyle = h.INK; c.lineWidth = Math.max(1, r * 0.022); c.stroke();
          rr(sx * r * 0.09 - r * 0.065, -r * 0.755, r * 0.13, r * 0.085, r * 0.02);
          c.fillStyle = "rgba(200,235,255,0.22)"; c.fill(); c.strokeStyle = "rgba(210,225,240,0.9)"; c.lineWidth = 0.8; c.stroke();
          c.beginPath(); c.moveTo(sx * r * 0.09 - r * 0.04, -r * 0.68); c.lineTo(sx * r * 0.09 + r * 0.01, -r * 0.745);
          c.strokeStyle = "rgba(255,255,255,0.85)"; c.lineWidth = 1; c.stroke();
        }
        c.beginPath(); c.moveTo(-r * 0.025, -r * 0.715); c.lineTo(r * 0.025, -r * 0.715);
        c.moveTo(-r * 0.155, -r * 0.72); c.lineTo(-r * 0.2, -r * 0.71); c.moveTo(r * 0.155, -r * 0.72); c.lineTo(r * 0.2, -r * 0.71);
        c.strokeStyle = "rgba(210,225,240,0.9)"; c.lineWidth = 0.8; c.stroke();
        c.beginPath(); c.moveTo(-r * 0.04, -r * 0.565); c.lineTo(r * 0.04, -r * 0.56); c.strokeStyle = "rgba(11,7,16,0.6)"; c.lineWidth = 1; c.stroke();
        c.beginPath(); c.moveTo(-r * 0.24, -r * 0.42); c.lineTo(-r * 0.22, -r * 0.62); c.quadraticCurveTo(0, -r * 0.53, r * 0.22, -r * 0.62);
        c.lineTo(r * 0.24, -r * 0.42); c.quadraticCurveTo(0, -r * 0.48, -r * 0.24, -r * 0.42); c.closePath(); fillInk(srWhite(c, r), 1.6);
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.62); c.quadraticCurveTo(0, -r * 0.53, r * 0.22, -r * 0.62);
        c.strokeStyle = metal(-r * 0.2, 0, r * 0.2, 0, ...SR_STEEL); c.lineWidth = Math.max(1, r * 0.025); c.stroke();
        // azure reishi arrow with light trails and an arrowhead past the grip
        const dx = G[0] - N[0], dy = G[1] - N[1], k = (-r * 1.17 - N[0]) / dx, tip = [N[0] + dx * k, N[1] + dy * k], aa = Math.atan2(dy, dx);
        energyBlade(N[0], N[1], tip[0], tip[1], Math.max(1.4, r * 0.032), SR_REISHI, "#eafaff");
        c.save(); c.globalCompositeOperation = "lighter"; c.strokeStyle = rgba(SR_REISHI, 0.6); c.lineWidth = Math.max(0.8, r * 0.014);
        c.beginPath();
        for (let i = 0; i < 3; i++) {
          const s = ts ? (ts / 350 + i * 0.33) % 1 : i * 0.3, off = (i - 1) * r * 0.05, L = Math.hypot(tip[0] - N[0], tip[1] - N[1]);
          const nx = -Math.sin(aa) * off, ny = Math.cos(aa) * off, d0 = s * L * 0.8, d1 = d0 + L * 0.2;
          c.moveTo(N[0] + Math.cos(aa) * d0 + nx, N[1] + Math.sin(aa) * d0 + ny); c.lineTo(N[0] + Math.cos(aa) * d1 + nx, N[1] + Math.sin(aa) * d1 + ny);
        }
        c.stroke(); c.restore();
        c.save(); c.translate(tip[0], tip[1]); c.rotate(aa);
        c.beginPath(); c.moveTo(0, 0); c.lineTo(-r * 0.11, -r * 0.045); c.lineTo(-r * 0.07, 0); c.lineTo(-r * 0.11, r * 0.045); c.closePath();
        fillInk("#eafaff", 1); c.restore();
        glowOrb(tip[0] + r * 0.03, tip[1], r * 0.08, SR_REISHI);
        // reishi motes spiralling into the grip
        for (let i = 0; i < 8; i++) {
          const t = ts ? (ts / 900 + i / 8) % 1 : i / 8, rad = (1 - t) * r * 0.26, a = i * TAU / 8 + t * 3;
          glowOrb(G[0] + Math.cos(a) * rad, G[1] + Math.sin(a) * rad, r * 0.025, SR_REISHI);
        }
        // hands: bow grip and the drawing hand at the cheek
        c.beginPath(); c.ellipse(G[0] + r * 0.02, G[1], r * 0.065, r * 0.08, 0, 0, TAU); fillInk(SR_SKIN, 1.3);
        heroLimb(c, h, r * 0.44, -r * 0.36, r * 0.66, -r * 0.54, r * 0.2, -r * 0.47, aw, sleeve);
        c.beginPath(); c.arc(N[0] + r * 0.03, N[1], r * 0.07, 0, TAU); fillInk(SR_SKIN, 1.3);
      },

      /* Glacial Dragon Prodigy — young captain with spiky silver-white hair and a green sash over his coat,
         raising an ice katana with a star guard from which a coiled, twin-winged crystalline frost dragon
         spirals around him amid drifting snowflakes. */
      harrower(c, pal, r, ts, h) {
        const { fillInk, poly, metal, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(260), flap = ts ? Math.sin(ts / 480) : 0;
        // twin crystalline frost wings (base silhouette)
        const WING = [[0.12, -0.56], [0.42, -0.96], [0.74, -1.1], [1.16, -1.02], [1.06, -0.66], [0.9, -0.76], [0.88, -0.42],
          [0.7, -0.58], [0.64, -0.24], [0.46, -0.44], [0.34, -0.14], [0.24, -0.36]];
        const wpt = (sx, [x, y]) => [sx * x * r, (y - flap * 0.05 * x / 1.16) * r];
        const wg = c.createLinearGradient(0, -r * 0.4, 0, -r * 1.1);
        wg.addColorStop(0, rgba("#2a7fd0", 0.6)); wg.addColorStop(0.5, rgba(SR_FROST, 0.72)); wg.addColorStop(1, "rgba(255,255,255,0.88)");
        c.beginPath();
        for (const sx of [-1, 1]) { WING.forEach((pt, i) => { const [x, y] = wpt(sx, pt); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath(); }
        fillInk(wg, 2); c.shadowBlur = 0; // drop shadow only on the base silhouette
        // side-coloured wing edges, clipped inside the wings so light vs dark reads against the cyan halo
        c.save(); c.clip();
        c.strokeStyle = rgba(pal.bright, 0.9); c.lineWidth = r * 0.11; c.stroke();
        c.strokeStyle = rgba(pal.rim, 0.95); c.lineWidth = Math.max(1, r * 0.035); c.stroke();
        c.restore();
        c.strokeStyle = h.INK; c.lineWidth = 2; c.stroke(); // re-ink the wing outline over the edge tint
        c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = Math.max(0.8, r * 0.016);
        c.beginPath();
        for (const sx of [-1, 1]) for (const i of [2, 3, 6, 8, 10]) { const [x0, y0] = wpt(sx, WING[0]), [x, y] = wpt(sx, WING[i]); c.moveTo(x0, y0); c.lineTo(x, y); }
        c.stroke();
        // coiled frost-dragon body spiralling out of the blade tip, behind the figure
        const pts = [].concat(
          nbBezierPts(r * 0.98, -r * 0.86, r * 1.18, -r * 0.4, r * 1.05, r * 0.35, r * 0.62, r * 0.62, 10),
          nbBezierPts(r * 0.62, r * 0.62, r * 0.1, r * 0.92, -r * 0.7, r * 0.85, -r * 0.95, r * 0.3, 10).slice(1),
          nbBezierPts(-r * 0.95, r * 0.3, -r * 1.18, -r * 0.1, -r * 1.05, -r * 0.7, -r * 0.62, -r * 0.98, 10).slice(1));
        const ice = nbCloth(c, -r, -r, r, r, ["#f4fdff", "#8fdcff", "#2c78c4"]);
        for (let i = 2; i < pts.length - 1; i += 3) {
          const [x, y] = pts[i], [ax, ay] = pts[i - 1], [bx, by] = pts[i + 1], len = Math.hypot(bx - ax, by - ay) || 1;
          const nx = (by - ay) / len, ny = -(bx - ax) / len, w = r * (0.02 + 0.1 * i / pts.length), tx = x + nx * (w + r * 0.08), ty = y + ny * (w + r * 0.08);
          if (Math.abs(tx) > r * 1.2 || Math.abs(ty) > r * 1.2) continue;
          c.beginPath(); c.moveTo(x + nx * w - (bx - ax) / len * r * 0.04, y + ny * w - (by - ay) / len * r * 0.04);
          c.lineTo(tx, ty); c.lineTo(x + nx * w + (bx - ax) / len * r * 0.04, y + ny * w + (by - ay) / len * r * 0.04); c.closePath();
          fillInk("rgba(220,248,255,0.95)", 1);
        }
        nbStrip(c, pts, r * 0.04, r * 0.22); fillInk(ice, 1.8);
        c.strokeStyle = "rgba(30,90,160,0.55)"; c.lineWidth = 1;
        c.beginPath();
        for (let i = 3; i < pts.length - 1; i += 2) {
          const [x, y] = pts[i], [ax, ay] = pts[i - 1], [bx, by] = pts[i + 1], len = Math.hypot(bx - ax, by - ay) || 1;
          const ux = (bx - ax) / len, uy = (by - ay) / len, w = r * (0.02 + 0.1 * i / pts.length) * 0.8;
          c.moveTo(x - uy * w, y + ux * w); c.lineTo(x + ux * w * 0.6, y + uy * w * 0.6); c.lineTo(x + uy * w, y - ux * w);
        }
        c.stroke();
        if (ts) {
          c.save(); c.globalCompositeOperation = "lighter";
          const k = Math.floor((ts / 60) % pts.length);
          glowOrb(pts[k][0], pts[k][1], r * 0.08, SR_FROST);
          c.restore();
        }
        // hakama, black robe, sleeveless coat, green sash with a star clasp
        srHakama(c, h, r, srDark(c, r, pal));
        srKimono(c, h, r, pal, { sw: 0.42, ww: 0.32 });
        srHaori(c, h, r, pal, { hem: 0.96 });
        poly([0.34, -0.46, 0.45, -0.39, -0.3, 0.36, -0.4, 0.29]); fillInk(nbCloth(c, -r * 0.4, 0, r * 0.45, 0, ["#9ff0a8", "#2fa45a", "#0f4f2a"]), 1.4);
        heroStar(c, r * 0.3, -r * 0.34, r * 0.06, 0.45); fillInk(metal(r * 0.24, -r * 0.4, r * 0.36, -r * 0.28, ...SR_STEEL), 1);
        // left arm forward, right arm raising the ice katana
        const aw = Math.max(4, r * 0.19), sleeve = srDark(c, r, pal);
        heroLimb(c, h, -r * 0.42, -r * 0.36, -r * 0.62, -r * 0.1, -r * 0.5, r * 0.2, aw, sleeve);
        c.beginPath(); c.ellipse(-r * 0.5, r * 0.23, r * 0.07, r * 0.08, 0, 0, TAU); fillInk(SR_SKIN, 1.2);
        heroLimb(c, h, r * 0.42, -r * 0.36, r * 0.74, -r * 0.3, r * 0.6, -r * 0.18, aw, sleeve);
        const gx = r * 0.64, gy = -r * 0.26, ang = Math.atan2(-0.6, 0.34);
        const blade = c.createLinearGradient(gx, gy, r * 0.98, -r * 0.86);
        blade.addColorStop(0, "rgba(235,252,255,0.95)"); blade.addColorStop(0.6, rgba(SR_FROST, 0.85)); blade.addColorStop(1, rgba("#4aa8ff", 0.8));
        glowOrb((gx + r * 0.98) / 2, (gy - r * 0.86) / 2, r * (0.22 + 0.05 * p), SR_FROST);
        srKatana(c, h, r, gx, gy, ang, { blade: 0.69, hilt: 0.2, w: 0.075, bend: 0.04, guard: "star", bladeFill: blade,
          guardFill: metal(gx - r * 0.08, gy - r * 0.08, gx + r * 0.08, gy + r * 0.08, ...SR_STEEL), hiltFill: "#1d4f63", wrap: "#bff3ff" });
        c.beginPath(); c.ellipse(gx - Math.cos(ang) * r * 0.1, gy - Math.sin(ang) * r * 0.1, r * 0.075, r * 0.07, 0, 0, TAU); fillInk(SR_SKIN, 1.2);
        // neck, spiky silver-white hair, youthful face, teal eyes, frown
        rr(-r * 0.085, -r * 0.56, r * 0.17, r * 0.14, r * 0.04); fillInk(SR_SKIN, 1.5);
        const hair = nbCloth(c, -r * 0.3, -r * 1.15, r * 0.3, -r * 0.6, SR_HAIR_SILVER);
        srSpikes(c, r, 0, -0.78, 0.25, 0.23, 9, Math.PI * 0.78, Math.PI * 2.22, 0.5, 47, -0.12); fillInk(hair, 1.8);
        nbFace(c, h, r, -0.68, 0.19, SR_SKIN);
        poly([-0.2, -0.8, -0.16, -0.96, -0.08, -0.86, -0.02, -0.99, 0.04, -0.86, 0.12, -0.97, 0.15, -0.84, 0.21, -0.9, 0.2, -0.7,
          0.15, -0.81, 0.07, -0.79, 0.01, -0.84, -0.06, -0.79, -0.13, -0.83, -0.19, -0.68]);
        fillInk(hair, 1.4);
        for (const sx of [-1, 1]) {
          nbEye(c, h, r, sx * r * 0.088, -r * 0.71, sx, "#3fd1c4");
          c.beginPath(); c.moveTo(sx * r * 0.035, -r * 0.77); c.lineTo(sx * r * 0.15, -r * 0.795);
          c.strokeStyle = h.INK; c.lineWidth = Math.max(1.2, r * 0.025); c.stroke();
        }
        c.beginPath(); c.moveTo(-r * 0.04, -r * 0.56); c.quadraticCurveTo(0, -r * 0.575, r * 0.04, -r * 0.56);
        c.strokeStyle = "rgba(11,7,16,0.65)"; c.lineWidth = 1.1; c.stroke();
        // the dragon's horned head roaring frost at the upper left
        c.save(); c.translate(-r * 0.62, -r * 0.98); c.rotate(-0.45);
        poly([-0.02, -0.08, -0.2, -0.2, -0.06, -0.03]); fillInk(SR_FROST, 1);
        poly([0.04, -0.1, -0.12, -0.24, 0.0, -0.06]); fillInk("#e6fbff", 1);
        poly([-0.02, 0.06, 0.12, 0.05, 0.25, 0.13, 0.06, 0.15]); fillInk(nbCloth(c, 0, 0, 0, r * 0.15, ["#e6fbff", "#8fdcff", "#2c78c4"]), 1.3);
        poly([-0.08, -0.1, 0.1, -0.12, 0.26, -0.05, 0.31, 0.0, 0.13, 0.04, -0.06, 0.09]); fillInk(nbCloth(c, 0, -r * 0.12, 0, r * 0.09, ["#ffffff", "#9fe4ff", "#3a8ad6"]), 1.5);
        c.beginPath(); c.ellipse(r * 0.08, -r * 0.05, r * 0.03, r * 0.018, -0.2, 0, TAU); c.fillStyle = "#ff3b5c"; c.fill();
        glowOrb(r * 0.08, -r * 0.05, r * 0.035 * (0.7 + 0.6 * p), "#ff6b84");
        glowOrb(r * 0.3, r * 0.08, r * (0.06 + 0.03 * p), SR_FROST);
        c.restore();
        // snowflakes drifting down
        for (let i = 0; i < 9; i++) {
          const x = -r * 1.08 + ((i * 0.23 + heroHash(i * 5.3)) % 1) * r * 2.16, y = -r * 1.08 + ((ts ? ts / 3000 : 0) + i / 9) % 1 * r * 2.08;
          srSnowflake(c, x + (ts ? Math.sin(ts / 700 + i) * r * 0.03 : 0), y, r * (0.035 + 0.02 * heroHash(i)), ts ? ts / 1500 + i : i, rgba("#ffffff", 0.85));
        }
      },

      /* Masked Berserker — wild spiky hair, a half-face white bone mask with red slash marks and a
         black-and-gold eclipse eye, shredded black robes, and a massive serrated release blade charging a
         radioactive jade sphere crackling with jade lightning. */
      fury(c, pal, r, ts, h) {
        const { fillInk, bodyGrad, poly, metal, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(140), sway = ts ? Math.sin(ts / 380) * r * 0.03 : 0;
        // shredded long coat tatters (base silhouette)
        srCoatBack(c, r, 0.48, 0.78, 1.08, sway, { n: 11, depth: 0.22, seed: 5 }); fillInk(bodyGrad, 2.4); c.shadowBlur = 0; // drop shadow only on the base silhouette
        // shredded hakama and torn black robe with skin showing through the rips
        srHakama(c, h, r, srDark(c, r, pal), { hw: 0.56, ragged: 13 });
        const torso = srKimono(c, h, r, pal, { sw: 0.46, ww: 0.34 });
        c.save(); torso(); c.clip();
        for (const [x, y, a] of [[-0.3, -0.12, 0.5], [0.26, 0.02, -0.4], [-0.18, 0.18, 0.3]]) {
          c.save(); c.translate(x * r, y * r); c.rotate(a);
          c.beginPath(); c.moveTo(-r * 0.1, 0); c.lineTo(-r * 0.03, -r * 0.025); c.lineTo(r * 0.02, -r * 0.01); c.lineTo(r * 0.1, 0);
          c.lineTo(r * 0.02, r * 0.02); c.lineTo(-r * 0.04, r * 0.015); c.closePath(); fillInk(SR_SKIN, 1);
          c.restore();
        }
        c.restore();
        // left fist clenched low, jade sparks at the knuckles
        const aw = Math.max(4, r * 0.2), sleeve = srDark(c, r, pal);
        heroLimb(c, h, -r * 0.44, -r * 0.36, -r * 0.66, -r * 0.14, -r * 0.62, r * 0.04, aw, sleeve);
        heroLimb(c, h, -r * 0.62, r * 0.04, -r * 0.6, r * 0.14, -r * 0.54, r * 0.24, aw * 0.85, SR_SKIN);
        c.beginPath(); c.arc(-r * 0.54, r * 0.26, r * 0.085, 0, TAU); fillInk(SR_SKIN, 1.3);
        heroBolt(c, h, ts, -r * 0.54, r * 0.26, -r * 0.78, r * 0.42, Math.max(0.8, r * 0.018), SR_JADE, 21, 3);
        // right arm brandishing the massive release blade
        heroLimb(c, h, r * 0.44, -r * 0.36, r * 0.74, -r * 0.2, r * 0.52, -r * 0.06, aw, sleeve);
        const gx = r * 0.56, gy = -r * 0.14, ang = Math.atan2(-0.64, 0.28), L = r * 0.68, w = r * 0.2;
        c.save(); c.translate(gx, gy); c.rotate(ang);
        c.beginPath(); c.moveTo(0, -w * 0.5);
        for (let i = 1; i <= 4; i++) { const x = i * L * 0.17; c.lineTo(x - L * 0.05, -w * 0.5); c.lineTo(x, -w * 0.78); c.lineTo(x + L * 0.02, -w * 0.5); }
        c.lineTo(L * 0.86, -w * 0.45); c.lineTo(L, -w * 0.1); c.quadraticCurveTo(L * 0.8, w * 0.62, L * 0.4, w * 0.56); c.lineTo(0, w * 0.5); c.closePath();
        const bg = c.createLinearGradient(0, -w * 0.5, 0, w * 0.6);
        bg.addColorStop(0, "#3a3446"); bg.addColorStop(0.55, "#120f18"); bg.addColorStop(0.7, "#d9dee8"); bg.addColorStop(1, "#ffffff");
        fillInk(bg, 2);
        c.save(); c.globalCompositeOperation = "lighter";
        c.beginPath(); c.moveTo(r * 0.04, w * 0.5); c.lineTo(L * 0.4, w * 0.56); c.quadraticCurveTo(L * 0.8, w * 0.62, L, -w * 0.1);
        c.strokeStyle = rgba(SR_JADE, 0.35 + 0.4 * p); c.lineWidth = Math.max(1.4, r * 0.04); c.stroke();
        c.restore();
        rr(-r * 0.22, -r * 0.05, r * 0.22, r * 0.1, r * 0.03); fillInk(SR_HILT, 1.3);
        c.strokeStyle = "#c8323c"; c.lineWidth = Math.max(0.6, r * 0.012);
        c.beginPath(); for (let i = 0; i < 4; i++) { const x0 = -r * (0.2 - i * 0.05); c.moveTo(x0, -r * 0.045); c.lineTo(x0 + r * 0.03, r * 0.045); } c.stroke();
        rr(-r * 0.03, -w * 0.62, r * 0.06, w * 1.24, r * 0.015); fillInk("#16131d", 1.2);
        c.restore();
        c.beginPath(); c.arc(gx - Math.cos(ang) * r * 0.1, gy - Math.sin(ang) * r * 0.1, r * 0.08, 0, TAU); fillInk(SR_SKIN, 1.3);
        // radioactive jade sphere charging at the blade tip
        const S = [r * 0.86, -r * 0.86], sR = r * (0.15 + 0.02 * p);
        glowOrb(S[0], S[1], r * (0.26 + 0.04 * p), SR_JADE);
        const sg = c.createRadialGradient(S[0] - sR * 0.3, S[1] - sR * 0.3, sR * 0.05, S[0], S[1], sR);
        sg.addColorStop(0, "#ffffff"); sg.addColorStop(0.4, "#b8ffd9"); sg.addColorStop(0.8, SR_JADE); sg.addColorStop(1, "#0b7a45");
        c.beginPath(); c.arc(S[0], S[1], sR, 0, TAU); c.fillStyle = sg; c.fill();
        c.strokeStyle = "#064a2a"; c.lineWidth = 1.2; c.stroke();
        c.save(); c.translate(S[0], S[1]); c.globalCompositeOperation = "lighter";
        c.strokeStyle = rgba("#eafff3", 0.8); c.lineWidth = Math.max(0.8, r * 0.016);
        for (let k = 0; k < 3; k++) { c.save(); c.rotate((ts ? ts / 200 : 0.4) * (k % 2 ? -1 : 1) + k); c.beginPath(); c.ellipse(0, 0, sR * 0.8, sR * 0.3, 0, 0, TAU); c.stroke(); c.restore(); }
        c.restore();
        for (let i = 0; i < 8; i++) {
          const t = ts ? (ts / 700 + i / 8) % 1 : i / 8, rad = (1 - t) * r * 0.28, a = i * TAU / 8 - t * 2.4;
          glowOrb(S[0] + Math.cos(a) * rad, S[1] + Math.sin(a) * rad, r * 0.022, SR_JADE);
        }
        for (let i = 0; i < 6; i++) {
          const a = i * TAU / 6 + (ts ? (heroHash(Math.floor(ts / 90) + i) - 0.5) * 0.6 : 0.3), L2 = r * (0.22 + 0.08 * heroHash(i * 2.7));
          heroBolt(c, h, ts, S[0], S[1], S[0] + Math.cos(a) * L2, S[1] + Math.sin(a) * L2, Math.max(0.9, r * 0.02), SR_JADE, i + 31, 4);
        }
        heroBolt(c, h, ts, gx, gy, S[0], S[1], Math.max(0.9, r * 0.02), SR_JADE, 41, 6);
        // neck, wild spiky hair, face
        rr(-r * 0.09, -r * 0.56, r * 0.18, r * 0.14, r * 0.04); fillInk(SR_SKIN, 1.5);
        const hair = nbCloth(c, -r * 0.3, -r * 1.15, r * 0.3, -r * 0.6, SR_HAIR_ASH);
        srSpikes(c, r, 0, -0.78, 0.27, 0.24, 11, Math.PI * 0.72, Math.PI * 2.28, 0.5, 73, 0.1); fillInk(hair, 1.8);
        nbFace(c, h, r, -0.68, 0.2, SR_SKIN);
        // human half: snarling eye and brow, bared teeth
        nbEye(c, h, r, r * 0.09, -r * 0.71, 1, "#8a5a2a");
        c.beginPath(); c.moveTo(r * 0.03, -r * 0.765); c.lineTo(r * 0.16, -r * 0.805);
        c.strokeStyle = h.INK; c.lineWidth = Math.max(1.3, r * 0.028); c.stroke();
        c.beginPath(); c.moveTo(0, -r * 0.575); c.lineTo(r * 0.08, -r * 0.585); c.lineTo(r * 0.06, -r * 0.55); c.lineTo(0, -r * 0.545); c.closePath(); fillInk("#fbf7ef", 1);
        // half-face bone mask with a cracked edge, red slash marks, teeth and a black-and-gold eclipse eye
        const mask = () => {
          c.beginPath(); c.moveTo(r * 0.02, -r * 0.98); c.quadraticCurveTo(-r * 0.2, -r * 0.98, -r * 0.215, -r * 0.74);
          c.quadraticCurveTo(-r * 0.21, -r * 0.55, -r * 0.1, -r * 0.5); c.lineTo(0, -r * 0.48);
          c.lineTo(r * 0.03, -r * 0.55); c.lineTo(-r * 0.02, -r * 0.62); c.lineTo(r * 0.04, -r * 0.7); c.lineTo(-r * 0.01, -r * 0.78);
          c.lineTo(r * 0.05, -r * 0.86); c.lineTo(0, -r * 0.92); c.closePath();
        };
        mask(); fillInk(nbCloth(c, -r * 0.22, -r * 0.98, r * 0.05, -r * 0.48, ["#ffffff", "#ece6dc", "#a79f93"]), 1.6);
        c.save(); mask(); c.clip();
        c.fillStyle = "#d4142e";
        for (const x of [-0.17, -0.11]) { poly([x, -1.0, x + 0.035, -1.0, x + 0.015, -0.48, x - 0.02, -0.48]); c.fill(); }
        c.restore();
        c.strokeStyle = "rgba(11,7,16,0.65)"; c.lineWidth = 0.9;
        c.beginPath(); c.moveTo(-r * 0.14, -r * 0.57); c.lineTo(0, -r * 0.565);
        for (const x of [-0.12, -0.08, -0.04]) { c.moveTo(x * r, -r * 0.59); c.lineTo(x * r, -r * 0.545); }
        c.stroke();
        nbEye(c, h, r, -r * 0.09, -r * 0.71, -1, "#ffd23a", (x, y, rad) => {
          c.fillStyle = "#0b0710"; c.fillRect(x - rad * 3, y - rad * 2, rad * 6, rad * 4);
          c.beginPath(); c.arc(x, y, rad * 0.9, 0, TAU); c.fillStyle = "#ffd23a"; c.fill();
          c.beginPath(); c.arc(x, y, rad * 0.35, 0, TAU); c.fillStyle = "#0b0710"; c.fill();
        });
        glowOrb(-r * 0.09, -r * 0.71, r * 0.05 * (0.7 + 0.6 * p), "#ffd23a");
        // ragged bangs over the mask's brow
        poly([-0.21, -0.86, -0.17, -1.0, -0.1, -0.9, -0.04, -1.02, 0.02, -0.9, 0.09, -1.0, 0.13, -0.88, 0.2, -0.96, 0.21, -0.78,
          0.15, -0.84, 0.08, -0.8, 0.02, -0.86, -0.06, -0.8, -0.13, -0.86, -0.2, -0.74]);
        fillInk(hair, 1.4);
      },
    },
  };

  /* ============================================================
   * THEME: HIGH-SEAS BUCCANEERS — an original high-seas pirate-crew homage
   * ============================================================ */
  const PC_SKIN = "#f3cba2";
  const PC_TAN = "#d9a274";
  const PC_WICKER = ["#fff3b8", "#e8c25a", "#94701f"];
  const PC_VEST = ["#ff6a5a", "#d01f2c", "#6a0a12"];       // open crimson vest
  const PC_DENIM = ["#8ab2ea", "#3c66ad", "#172a52"];
  const PC_FUR_WHITE = ["#ffffff", "#e9edf3", "#a9b2c2"];
  const PC_HAIR_BLACK = ["#50566e", "#1a1b26", "#07070b"];
  const PC_BANDANA = ["#6fd08a", "#23733e", "#0c3519"];
  const PC_COAT = ["#46524a", "#1b241e", "#070a08"];
  const PC_CYAN_HAIR = ["#d4f8ff", "#45c8f2", "#11689a"];
  const PC_SHIRT_RED = ["#ff7a5c", "#d8262f", "#6e0a14"];
  const PC_STEEL = ["#f6f8fc", "#aab4c3", "#434b5a"];
  const PC_SUIT = ["#4a4f63", "#1a1c26", "#06070b"];
  const PC_BLOND = ["#fff7c4", "#f4cc48", "#a9800d"];
  const PC_ORANGE_HAIR = ["#ffcb8e", "#ff8a26", "#b0440a"];
  const PC_SKY = ["#e6f7ff", "#7cc8f2", "#2a6f9e"];
  const PC_BIKINI = ["#7fb0ff", "#2f62d0", "#12286a"];
  const PC_OVERALL = ["#c58f5a", "#8a5a30", "#3d2410"];
  const PC_LEATHER = ["#b07a48", "#6e4524", "#2c180a"];
  const PC_OLIVE = ["#c8c27a", "#8a8236", "#3e3a12"];
  const PC_CRAVAT = ["#c79bff", "#7a3fc9", "#32135e"];
  const PC_BONE = ["#ffffff", "#ece6d6", "#a59c86"];
  const PC_FUR = ["#d9a46c", "#97602f", "#432610"];
  const PC_ANTLER = ["#ecd0a0", "#a5763f", "#553511"];
  const PC_WOOD = ["#f0a65a", "#a8501a", "#4a1d06"];
  const PC_EMBER = "#ff8a1c";     // ember / flame orange
  const PC_FIRE = "#ffd23a";      // white-hot flame core
  const PC_SPARK = "#9fe6ff";     // electric rivet sparks
  const PC_BOLT = "#fff6a8";      // yellow-white storm lightning
  const PC_SPIRIT = "#7ff7e0";    // spectral soul wisps
  const PC_SEED = "#4dff7a";      // exploding emerald seed
  const PC_BRASS = ["#fff0b0", "#d6a33c", "#6e4a10"];   // nautical brass fittings
  const PC_NOSE_BLUE = "#3b6cff";

  // Side energy colour (palettes may optionally provide a dedicated glow).
  function pcGlow(pal) { return pal.glow || pal.bright; }
  // Side-coloured cloth gradient (sashes, bands, skirts, waistcoats) — r-unit coordinates.
  function pcSide(c, r, pal, x0, y0, x1, y1) { return nbCloth(c, x0 * r, y0 * r, x1 * r, y1 * r, [pal.rim, pal.bright, pal.deep]); }
  // Rounded fist at (x, y) px facing +x after rotation by ang, with knuckle creases and a sheen.
  function pcFist(c, h, x, y, rad, fill, ang = 0) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.ellipse(0, 0, rad, rad * 0.86, 0, 0, TAU); h.fillInk(fill, 1.4);
    c.strokeStyle = "rgba(11,7,16,0.5)"; c.lineWidth = Math.max(0.8, rad * 0.08);
    c.beginPath();
    for (const k of [-0.45, 0, 0.45]) { c.moveTo(rad * 0.3, k * rad * 0.85); c.lineTo(rad * 0.82, k * rad * 0.72); }
    c.moveTo(-rad * 0.2, rad * 0.55); c.quadraticCurveTo(rad * 0.15, rad * 0.35, rad * 0.25, rad * 0.62);
    c.stroke();
    c.beginPath(); c.ellipse(-rad * 0.3, -rad * 0.38, rad * 0.34, rad * 0.16, -0.4, 0, TAU); c.fillStyle = "rgba(255,255,255,0.38)"; c.fill();
    c.restore();
  }
  // Lumpy cumulus cloud path centred at (cx, cy) px, half-width w, lump height hh.
  function pcCloud(c, cx, cy, w, hh, seed = 0) {
    const n = 5;
    c.beginPath(); c.moveTo(cx - w, cy + hh * 0.25);
    for (let i = 0; i < n; i++) {
      const x0 = cx - w + 2 * w * i / n, x1 = cx - w + 2 * w * (i + 1) / n;
      const lift = hh * (0.6 + 0.4 * Math.sin(Math.PI * (i + 0.5) / n)) * (0.85 + 0.3 * heroHash(seed + i));
      c.bezierCurveTo(x0 - w * 0.04, cy - lift, x1 + w * 0.04, cy - lift, x1, cy + (i === n - 1 ? hh * 0.25 : -hh * 0.05));
    }
    for (let i = 0; i < 3; i++) {
      const xa = cx + w - 2 * w * i / 3, xb = cx + w - 2 * w * (i + 1) / 3;
      c.quadraticCurveTo((xa + xb) / 2, cy + hh * 0.55, xb, cy + hh * 0.25);
    }
    c.closePath();
  }
  // Eighth note (head at x, y px; stem height ≈ 2.4s; flag width ≈ 1.25s).
  function pcNote(c, x, y, s, ang, color) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.fillStyle = color; c.strokeStyle = color;
    c.beginPath(); c.ellipse(0, 0, s * 0.62, s * 0.44, -0.45, 0, TAU); c.fill();
    c.lineWidth = Math.max(0.8, s * 0.2); c.lineCap = "round";
    c.beginPath(); c.moveTo(s * 0.55, -s * 0.1); c.lineTo(s * 0.55, -s * 2.3);
    c.quadraticCurveTo(s * 1.25, -s * 1.85, s * 1.05, -s * 1.15); c.stroke();
    c.restore();
  }
  // Treble-clef glyph (spans ±0.55s × ±1.6s).
  function pcClef(c, x, y, s, color) {
    c.save(); c.translate(x, y);
    c.strokeStyle = color; c.lineWidth = Math.max(0.8, s * 0.17); c.lineCap = "round";
    c.beginPath();
    c.moveTo(-s * 0.18, s * 1.15); c.quadraticCurveTo(-s * 0.2, s * 1.45, s * 0.06, s * 1.38);
    c.quadraticCurveTo(s * 0.22, s * 1.3, s * 0.12, s * 1.0);
    c.lineTo(-s * 0.08, -s * 1.0);
    c.quadraticCurveTo(-s * 0.1, -s * 1.55, s * 0.2, -s * 1.45);
    c.quadraticCurveTo(s * 0.4, -s * 1.2, s * 0.05, -s * 0.75);
    c.quadraticCurveTo(-s * 0.55, -s * 0.25, -s * 0.45, s * 0.35);
    c.quadraticCurveTo(-s * 0.35, s * 0.8, s * 0.1, s * 0.75);
    c.quadraticCurveTo(s * 0.52, s * 0.65, s * 0.4, s * 0.25);
    c.quadraticCurveTo(s * 0.3, -s * 0.1, -s * 0.05, 0);
    c.quadraticCurveTo(-s * 0.25, s * 0.15, -s * 0.05, s * 0.4);
    c.stroke();
    c.restore();
  }
  // Spectral soul wisp: round glowing head with a curling tail rising along ang (0 = up).
  function pcWisp(c, x, y, s, ang, color, alpha = 0.75) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.moveTo(-s * 0.5, 0);
    c.bezierCurveTo(-s * 0.5, s * 0.66, s * 0.5, s * 0.66, s * 0.5, 0);
    c.bezierCurveTo(s * 0.5, -s * 0.5, s * 0.1, -s * 0.8, s * 0.35, -s * 1.5);
    c.bezierCurveTo(-s * 0.25, -s * 1.0, -s * 0.5, -s * 0.5, -s * 0.5, 0); c.closePath();
    const g = c.createRadialGradient(0, s * 0.05, 0, 0, 0, s * 1.2);
    g.addColorStop(0, `rgba(255,255,255,${alpha})`); g.addColorStop(0.35, rgba(color, alpha * 0.85)); g.addColorStop(1, rgba(color, 0));
    c.globalCompositeOperation = "lighter";
    c.fillStyle = g; c.fill();
    c.strokeStyle = rgba(color, alpha * 0.6); c.lineWidth = Math.max(0.6, s * 0.08); c.stroke();
    c.fillStyle = rgba("#0b2a2a", alpha * 0.7);
    c.beginPath(); c.arc(-s * 0.17, s * 0.05, s * 0.08, 0, TAU); c.arc(s * 0.17, s * 0.05, s * 0.08, 0, TAU); c.fill();
    c.restore();
  }
  // Five-petal hibiscus print flower.
  function pcFlower(c, x, y, s, fill, centre) {
    c.fillStyle = fill;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * TAU / 5;
      c.beginPath(); c.ellipse(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.5, s * 0.32, a, 0, TAU); c.fill();
    }
    c.beginPath(); c.arc(x, y, s * 0.24, 0, TAU); c.fillStyle = centre; c.fill();
  }
  // Steel rivet dot.
  function pcRivet(c, x, y, rad) {
    c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fillStyle = "#3a404c"; c.fill();
    c.beginPath(); c.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.45, 0, TAU); c.fillStyle = "rgba(255,255,255,0.85)"; c.fill();
  }
  // Brass ship's anchor insignia centred at (x, y) px, height ≈ 2s, rotated by ang.
  function pcAnchor(c, h, x, y, s, fill, ang = 0) {
    c.save(); c.translate(x, y); c.rotate(ang);
    const path = () => {
      c.beginPath();
      c.moveTo(0, -s * 0.62); c.lineTo(0, s * 0.82);
      c.moveTo(-s * 0.36, -s * 0.42); c.lineTo(s * 0.36, -s * 0.42);
      c.moveTo(-s * 0.68, s * 0.22); c.quadraticCurveTo(-s * 0.55, s * 0.86, 0, s * 0.86); c.quadraticCurveTo(s * 0.55, s * 0.86, s * 0.68, s * 0.22);
    };
    c.lineCap = "round";
    path(); c.strokeStyle = h.INK; c.lineWidth = s * 0.26 + 1.6; c.stroke();
    path(); c.strokeStyle = fill; c.lineWidth = s * 0.26; c.stroke();
    c.beginPath(); c.arc(0, -s * 0.8, s * 0.2, 0, TAU); c.strokeStyle = h.INK; c.lineWidth = s * 0.16 + 1.6; c.stroke(); c.strokeStyle = fill; c.lineWidth = s * 0.16; c.stroke();
    for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * s * 0.82, s * 0.12); c.lineTo(sx * s * 0.56, s * 0.12); c.lineTo(sx * s * 0.7, s * 0.4); c.closePath(); h.fillInk(fill, 1); }
    c.restore();
  }
  // Brass compass-rose medallion (bezel radius s px) with a side-coloured north point.
  function pcCompass(c, h, x, y, s, brass, north) {
    c.beginPath(); c.arc(x, y, s, 0, TAU); h.fillInk(brass, 1.3);
    c.beginPath(); c.arc(x, y, s * 0.72, 0, TAU); h.fillInk("#f6ead0", 0.9);
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 2, b = a + Math.PI / 2;
      c.beginPath(); c.moveTo(x + Math.cos(a) * s * 0.68, y + Math.sin(a) * s * 0.68);
      c.lineTo(x + Math.cos(b) * s * 0.16, y + Math.sin(b) * s * 0.16); c.lineTo(x - Math.cos(b) * s * 0.16, y - Math.sin(b) * s * 0.16); c.closePath();
      c.fillStyle = i === 0 ? north : "#3a2a14"; c.fill();
    }
    c.beginPath(); c.arc(x, y, s * 0.12, 0, TAU); c.fillStyle = "#3a2a14"; c.fill();
  }
  // Branching antler: main beam through pts (px) plus tine segments [[x0,y0,x1,y1], …] (px).
  function pcAntler(c, h, pts, tines, w, fill) {
    const path = () => {
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
      for (const t of tines) { c.moveTo(t[0], t[1]); c.lineTo(t[2], t[3]); }
    };
    path(); c.strokeStyle = h.INK; c.lineWidth = w + 2.4; c.stroke();
    path(); c.strokeStyle = fill; c.lineWidth = w; c.stroke();
    path(); c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = Math.max(0.6, w * 0.25); c.stroke();
  }
  // Jagged furry blob around an ellipse (px), n tufts.
  function pcFurBlob(c, cx, cy, rx, ry, n, depth, seed) {
    c.beginPath();
    for (let i = 0; i <= n * 2; i++) {
      const a = i * Math.PI / n, k = i % 2 ? 1 : 1 - depth * (0.6 + 0.4 * heroHash(seed + i * 1.7));
      const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.closePath();
  }

  SG.THEMES.piratecrew = {
    id: "piratecrew",
    name: { en: "High-Seas Buccaneers", fr: "Bouccaniers de la Haute Mer", zh: "公海豪杰海盗团", ar: "قراصنة البحار المفتوحة" },
    description: {
      en: "Free-spirited buccaneer captains, triple-blade blademasters, blazing-kick cooks, tempest navigators and reindeer physicians with a monster form, sailing the open high seas.",
      fr: "Capitaines corsaires épris de liberté, maîtres aux trois lames, chefs aux jambes ardentes, navigatrices des tempêtes et médecins rennes à forme monstrueuse, voguant sur la haute mer.",
      zh: "豪气海盗船长、三绝刃剑豪、烈焰踢技厨师、风暴航海士与可化身巨兽的驯鹿萌医，扬帆驰骋于辽阔公海。",
      ar: "قباطنة قراصنة أحرار، وسيافو النصول الثلاثة، وطهاة الركلات الملتهبة، وملاحات العواصف، وأطباء الرنة بهيئتهم الوحشية، يبحرون في البحار المفتوحة.",
    },
    painters: {
      /* Buccaneer Captain — wide woven adventurer's sun hat with a side-coloured ribbon band and fluttering bow,
         tousled black hair, a clean confident face with a huge grin, open crimson vest with side-coloured piping
         and lining over a bare chest, a side-coloured waist sash, denim trousers with white fur cuffs; one arm
         cocked back while the other stretches into a giant rubber-coiled ember power fist ringed with side energy. */
      sovereign(c, pal, r, ts, h) {
        const { fillInk, poly, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(170), glow = pcGlow(pal);
        const wind = ts ? 0.5 + 0.5 * Math.sin(ts / 260) : 0.6;   // rubber wind-up / release
        const FX = r * (0.74 + 0.07 * wind), FY = -r * 0.34, FR = r * (0.26 + 0.02 * wind);
        // impact starburst behind the giant fist (base silhouette)
        const BX = r * 0.6, BY = -r * 0.32, spin = ts ? ts / 1400 : 0.2;
        c.beginPath();
        for (let i = 0; i < 18; i++) {
          const a = spin + i * TAU / 18, R = i % 2 ? r * 0.27 : r * (0.46 + 0.08 * heroHash(i * 3.3));
          const x = BX + Math.cos(a) * R, y = BY + Math.sin(a) * R;
          if (i) c.lineTo(x, y); else c.moveTo(x, y);
        }
        c.closePath();
        const bg = c.createRadialGradient(BX, BY, r * 0.05, BX, BY, r * 0.54);
        bg.addColorStop(0, "#fff6d0"); bg.addColorStop(0.35, rgba(PC_FIRE, 0.95)); bg.addColorStop(0.7, pal.bright); bg.addColorStop(1, pal.deep);
        fillInk(bg, 2); c.shadowBlur = 0; // drop shadow only on the base silhouette
        // back arm cocked at the hip
        heroLimb(c, h, -r * 0.42, -r * 0.36, -r * 0.8, -r * 0.18, -r * 0.56, r * 0.1, Math.max(4, r * 0.18), PC_SKIN);
        pcFist(c, h, -r * 0.52, r * 0.14, r * 0.12, PC_SKIN, Math.PI * 0.6);
        // bare shins, woven sandals, denim trousers and fluffy white fur cuffs
        const fur = nbCloth(c, 0, r * 0.76, 0, r * 0.94, PC_FUR_WHITE);
        for (const sx of [-1, 1]) {
          poly([sx * 0.1, 0.84, sx * 0.27, 0.84, sx * 0.26, 1.04, sx * 0.12, 1.04]); fillInk(PC_SKIN, 1.6);
          poly([sx * 0.05, 1.02, sx * 0.32, 1.02, sx * 0.34, 1.12, sx * 0.04, 1.12]); fillInk(nbCloth(c, 0, r, 0, r * 1.12, PC_WICKER), 1.4);
          c.beginPath(); c.moveTo(sx * r * 0.12, r * 1.03); c.lineTo(sx * r * 0.2, r * 0.95); c.lineTo(sx * r * 0.26, r * 1.03);
          c.strokeStyle = "#6e4524"; c.lineWidth = Math.max(1, r * 0.025); c.stroke();
          poly([sx * 0.04, 0.34, sx * 0.33, 0.34, sx * 0.37, 0.82, sx * 0.07, 0.82]); fillInk(nbCloth(c, sx * r * 0.05, 0, sx * r * 0.37, 0, PC_DENIM), 2.2);
          c.strokeStyle = "rgba(255,255,255,0.25)"; c.lineWidth = 1;
          c.beginPath(); c.moveTo(sx * r * 0.2, r * 0.4); c.lineTo(sx * r * 0.22, r * 0.78); c.stroke();
          const x0 = sx * 0.05 * r, x1 = sx * 0.39 * r;
          c.beginPath(); c.moveTo(x0, r * 0.77); c.lineTo(x1, r * 0.77);
          for (let i = 1; i <= 4; i++) { const xa = x1 + (x0 - x1) * (i - 0.5) / 4, xb = x1 + (x0 - x1) * i / 4; c.quadraticCurveTo(xa, r * 0.96, xb, r * 0.89); }
          c.closePath(); fillInk(fur, 1.4);
        }
        // bare chest
        const torso = () => jlTorso(c, r, 0.42, 0.32, -0.42, 0.38);
        torso(); fillInk(nbCloth(c, -r * 0.4, -r * 0.4, r * 0.4, r * 0.4, ["#ffe2c4", PC_SKIN, PC_TAN]), 2.4);
        jlTorsoDetail(c, h, r, torso);
        // side-coloured waist sash (main body with a bright woven stripe) with a knot and trailing tails
        const pm = pal.main || pal.mid;
        rr(-r * 0.36, r * 0.27, r * 0.72, r * 0.12, r * 0.04); fillInk(nbCloth(c, 0, r * 0.27, 0, r * 0.39, [pal.bright, pm, pal.deep]), 1.6);
        c.beginPath(); c.moveTo(-r * 0.34, r * 0.31); c.lineTo(r * 0.34, r * 0.31);
        c.strokeStyle = pal.bright; c.lineWidth = Math.max(1.2, r * 0.03); c.stroke();
        c.strokeStyle = rgba(pal.rim, 0.8); c.lineWidth = Math.max(0.6, r * 0.01); c.stroke();
        const sw = ts ? Math.sin(ts / 300) * r * 0.03 : 0;
        nbStrip(c, nbBezierPts(-r * 0.28, r * 0.34, -r * 0.34, r * 0.48, -r * 0.4 + sw, r * 0.58, -r * 0.46 + sw, r * 0.7, 8), r * 0.07, r * 0.04);
        fillInk(pcSide(c, r, pal, -0.3, 0.34, -0.46, 0.7), 1.2);
        c.beginPath(); c.ellipse(-r * 0.28, r * 0.33, r * 0.06, r * 0.05, 0, 0, TAU); fillInk(pal.bright, 1.2);
        // open crimson vest panels: side-coloured inner lining, bright edge piping and gold buttons
        for (const sx of [-1, 1]) {
          poly([sx * 0.45, -0.42, sx * 0.2, -0.45, sx * 0.22, -0.02, sx * 0.3, 0.29, sx * 0.39, 0.29, sx * 0.45, -0.1]);
          fillInk(nbCloth(c, sx * r * 0.2, -r * 0.4, sx * r * 0.45, r * 0.3, PC_VEST), 2);
          poly([sx * 0.2, -0.45, sx * 0.27, -0.44, sx * 0.285, -0.03, sx * 0.355, 0.29, sx * 0.3, 0.29, sx * 0.22, -0.02]);
          fillInk(nbCloth(c, 0, -r * 0.45, 0, r * 0.29, [pal.rim, pal.bright, pal.deep]), 1.1);
          c.beginPath(); c.moveTo(sx * r * 0.45, -r * 0.42); c.lineTo(sx * r * 0.45, -r * 0.1); c.lineTo(sx * r * 0.39, r * 0.29);
          c.strokeStyle = pal.bright; c.lineWidth = Math.max(1.2, r * 0.028); c.stroke();
          c.beginPath(); c.moveTo(sx * r * 0.2, -r * 0.45); c.lineTo(sx * r * 0.22, -r * 0.02); c.lineTo(sx * r * 0.3, r * 0.29);
          c.strokeStyle = rgba(pal.rim, 0.85); c.lineWidth = Math.max(1, r * 0.02); c.stroke();
          for (const y of [-0.3, -0.12]) { c.beginPath(); c.arc(sx * r * 0.34, y * r, r * 0.025, 0, TAU); fillInk(SR_GOLD[1], 0.8); }
        }
        // speed streaks behind the punching arm
        c.save(); c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 5; i++) {
          const y = FY + (i - 2) * r * 0.1, off = ts ? ((ts / 220 + i * 0.37) % 1) * r * 0.2 : i * r * 0.04;
          c.beginPath(); c.moveTo(FX - FR - r * 0.05 - off, y); c.lineTo(FX - FR - r * 0.35 - off, y + r * 0.02);
          c.strokeStyle = rgba(i % 2 ? glow : PC_FIRE, 0.55); c.lineWidth = Math.max(1, r * 0.025); c.stroke();
        }
        c.restore();
        // stretching arm twisted into rubber coils
        const ax0 = r * 0.42, ay0 = -r * 0.36, acx = r * 0.56, acy = -r * 0.62, ax1 = FX - FR * 0.8, ay1 = FY;
        heroLimb(c, h, ax0, ay0, acx, acy, ax1, ay1, Math.max(4, r * 0.17), PC_SKIN);
        c.strokeStyle = "rgba(11,7,16,0.55)"; c.lineWidth = Math.max(0.9, r * 0.018);
        c.beginPath();
        for (let i = 1; i <= 5; i++) {
          const t = i / 6, u = 1 - t;
          const x = u * u * ax0 + 2 * u * t * acx + t * t * ax1, y = u * u * ay0 + 2 * u * t * acy + t * t * ay1;
          const dx = 2 * u * (acx - ax0) + 2 * t * (ax1 - acx), dy = 2 * u * (acy - ay0) + 2 * t * (ay1 - acy), L = Math.hypot(dx, dy) || 1;
          const nx = -dy / L * r * 0.085, ny = dx / L * r * 0.085, tw = dx / L * r * 0.04, tv = dy / L * r * 0.04;
          c.moveTo(x - nx - tw, y - ny - tv); c.quadraticCurveTo(x + tw * 1.5, y + tv * 1.5, x + nx + tw, y + ny + tv);
        }
        c.stroke();
        // giant ember power fist with a golden glow, licking flames and a side-coloured rim
        glowOrb(FX, FY, FR * 1.3, glow);
        c.save(); c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 6; i++) {
          const fl = ts ? Math.sin(ts / 90 + i * 1.7) : 0, a = Math.PI * (0.62 + i * 0.15);
          srFlame(c, FX + Math.cos(a) * FR * 0.8, FY + Math.sin(a) * FR * 0.8, FR * (0.75 + 0.15 * fl), FR * 0.5, a - Math.PI * 1.5, rgba(i % 2 ? PC_EMBER : PC_FIRE, 0.7));
        }
        c.restore();
        const fg = c.createRadialGradient(FX - FR * 0.3, FY - FR * 0.35, FR * 0.1, FX, FY, FR);
        fg.addColorStop(0, "#fff6dc"); fg.addColorStop(0.45, "#ffd9a8"); fg.addColorStop(0.8, PC_SKIN); fg.addColorStop(1, "#e08a4a");
        pcFist(c, h, FX, FY, FR, fg, 0);
        c.save(); c.globalCompositeOperation = "lighter";
        c.beginPath(); c.ellipse(FX, FY, FR * 1.02, FR * 0.88, 0, -Math.PI * 0.6, Math.PI * 0.45);
        c.strokeStyle = rgba(pal.rim, 0.55 + 0.35 * p); c.lineWidth = Math.max(1.4, r * 0.035); c.stroke();
        // side-coloured energy rings rippling out from the punch
        for (let k = 0; k < 2; k++) {
          const t = ts ? (ts / 650 + k * 0.5) % 1 : 0.3 + k * 0.4, R = FR * (1.15 + 0.55 * t);
          c.beginPath(); c.ellipse(FX + FR * 0.15 * t, FY, R * 0.55, R, 0, 0, TAU);
          c.strokeStyle = rgba(k ? pal.bright : glow, 0.75 * (1 - t)); c.lineWidth = Math.max(1, r * 0.03 * (1 - t * 0.5)); c.stroke();
        }
        c.restore();
        for (let i = 0; i < 7; i++) {
          const t = ts ? (ts / 900 + i / 7) % 1 : i / 7, a = i * 2.4 + t * 2;
          glowOrb(FX + Math.cos(a) * FR * (1.05 + 0.2 * t), FY + Math.sin(a) * FR * (1.05 + 0.2 * t), r * 0.025 * (1 - t * 0.5), i % 2 ? PC_FIRE : glow);
        }
        // neck, tousled black hair, face
        rr(-r * 0.09, -r * 0.56, r * 0.18, r * 0.14, r * 0.04); fillInk(PC_SKIN, 1.5);
        const hair = nbCloth(c, -r * 0.3, -r * 1.0, r * 0.3, -r * 0.55, PC_HAIR_BLACK);
        srSpikes(c, r, 0, -0.76, 0.24, 0.22, 9, Math.PI * 0.72, Math.PI * 2.28, 0.32, 19, 0.1); fillInk(hair, 1.6);
        nbFace(c, h, r, -0.66, 0.21, PC_SKIN);
        poly([-0.21, -0.82, -0.16, -0.72, -0.12, -0.8, -0.06, -0.73, -0.01, -0.81, 0.05, -0.73, 0.1, -0.8, 0.15, -0.72, 0.21, -0.82, 0.18, -0.9, -0.18, -0.9]);
        fillInk(hair, 1.3);
        // big bright eyes under confident brows, huge open grin
        for (const sx of [-1, 1]) {
          nbEye(c, h, r, sx * r * 0.085, -r * 0.69, sx, "#3a2416");
          c.beginPath(); c.moveTo(sx * r * 0.035, -r * 0.765); c.quadraticCurveTo(sx * r * 0.09, -r * 0.795, sx * r * 0.145, -r * 0.775);
          c.strokeStyle = h.INK; c.lineWidth = Math.max(1.1, r * 0.022); c.stroke();
        }
        const grin = () => { c.beginPath(); c.moveTo(-r * 0.11, -r * 0.58); c.quadraticCurveTo(0, -r * 0.6, r * 0.11, -r * 0.58); c.quadraticCurveTo(r * 0.06, -r * 0.47, 0, -r * 0.47); c.quadraticCurveTo(-r * 0.06, -r * 0.47, -r * 0.11, -r * 0.58); c.closePath(); };
        grin(); fillInk("#5a0e18", 1.3);
        c.save(); grin(); c.clip();
        c.fillStyle = "#fbf7ef"; c.fillRect(-r * 0.12, -r * 0.61, r * 0.24, r * 0.05);
        c.beginPath(); c.ellipse(0, -r * 0.48, r * 0.05, r * 0.025, 0, 0, TAU); c.fillStyle = "#e0485a"; c.fill();
        c.restore();
        // wide woven sun hat with the side-coloured ribbon band
        c.save(); c.translate(0, -r * 0.9); c.rotate(-0.06);
        const weave = nbCloth(c, -r * 0.4, -r * 0.2, r * 0.4, r * 0.12, PC_WICKER);
        const brim = () => { c.beginPath(); c.ellipse(0, 0, r * 0.48, r * 0.11, 0, 0, TAU); };
        brim(); fillInk(weave, 2);
        c.save(); brim(); c.clip();
        c.strokeStyle = "rgba(122,86,20,0.45)"; c.lineWidth = 0.9;
        for (const k of [0.62, 0.78, 0.92]) { c.beginPath(); c.ellipse(0, 0, r * 0.48 * k, r * 0.11 * k, 0, 0, TAU); c.stroke(); }
        c.beginPath();
        for (let i = 0; i < 16; i++) { const a = i * TAU / 16; c.moveTo(Math.cos(a) * r * 0.26, Math.sin(a) * r * 0.06); c.lineTo(Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.11); }
        c.stroke();
        c.restore();
        const crown = () => { c.beginPath(); c.moveTo(-r * 0.27, 0); c.bezierCurveTo(-r * 0.29, -r * 0.3, r * 0.29, -r * 0.3, r * 0.27, 0); c.quadraticCurveTo(0, r * 0.06, -r * 0.27, 0); c.closePath(); };
        crown(); fillInk(weave, 2);
        c.save(); crown(); c.clip();
        c.fillStyle = pcSide(c, r, pal, 0, -0.1, 0, 0.04); c.fillRect(-r * 0.3, -r * 0.1, r * 0.6, r * 0.14);
        c.strokeStyle = "rgba(11,7,16,0.6)"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(-r * 0.3, -r * 0.1); c.lineTo(r * 0.3, -r * 0.1); c.stroke();
        c.strokeStyle = "rgba(122,86,20,0.45)";
        c.beginPath(); for (const y of [-0.14, -0.18]) { c.moveTo(-r * 0.27, y * r); c.quadraticCurveTo(0, (y - 0.03) * r, r * 0.27, y * r); } c.stroke();
        c.beginPath(); c.ellipse(-r * 0.1, -r * 0.18, r * 0.08, r * 0.03, -0.2, 0, TAU); c.fillStyle = "rgba(255,255,255,0.4)"; c.fill();
        c.restore();
        // side-coloured ribbon bow on the band with two fluttering tails
        const rf = ts ? Math.sin(ts / 240) * r * 0.025 : 0;
        for (const [x2, y2] of [[-0.46, 0.13], [-0.36, 0.2]]) {
          nbStrip(c, nbBezierPts(-r * 0.24, -r * 0.04, -r * 0.32, -r * 0.02, x2 * r + rf, (y2 - 0.07) * r, x2 * r + rf, y2 * r, 6), r * 0.05, r * 0.03);
          fillInk(pcSide(c, r, pal, -0.24, -0.04, x2, y2), 1.1);
        }
        c.beginPath(); c.ellipse(-r * 0.25, -r * 0.045, r * 0.05, r * 0.04, 0, 0, TAU); fillInk(pal.bright, 1.1);
        c.restore();
      },

      /* Triple-Blade Blademaster — tight forest-green bandana, stern focused eyes, dark long coat with a ribbed
         green stomach wrap and side-coloured sword sash; two blades wielded in a ready stance and a third,
         white-hilted blade sheathed at the hip, amid dual counter-spinning tempest slashes and side-coloured
         wind trails. */
      reaper(c, pal, r, ts, h) {
        const { fillInk, poly, glowOrb, pulse, rgba, rr, energyBlade } = h;
        const p = pulse(150), glow = pcGlow(pal), spin = ts ? ts / 650 : 0.5;
        // twin flying-slash crescents spinning behind (base silhouette)
        const vy = -r * 0.18, R = r * 1.0;
        const vg = c.createRadialGradient(0, vy, R * 0.5, 0, vy, R);
        vg.addColorStop(0, "#04130a"); vg.addColorStop(0.55, pal.deep); vg.addColorStop(1, pal.bright);
        for (let k = 0; k < 2; k++) { srCrescent(c, 0, vy, R, spin + k * Math.PI, spin + k * Math.PI + 2.3, r * 0.3); fillInk(vg, 2); }
        c.shadowBlur = 0; // drop shadow only on the base silhouette
        // dual counter-spinning tempest slashes with bright cores, plus swirling side-coloured wind trails
        c.save(); c.globalCompositeOperation = "lighter";
        for (let k = 0; k < 2; k++) {
          const a0 = -spin * 1.8 + k * Math.PI + 0.6;
          srCrescent(c, 0, vy, r * 0.9, a0, a0 + 1.9, r * 0.12);
          c.fillStyle = rgba(k ? pal.bright : glow, 0.4 + 0.25 * p); c.fill();
          c.beginPath(); c.arc(0, vy, r * 0.89, a0 + 0.15, a0 + 1.75);
          c.strokeStyle = rgba(pal.rim, 0.6 + 0.3 * p); c.lineWidth = Math.max(0.8, r * 0.016); c.stroke();
        }
        for (let i = 0; i < 6; i++) {
          const a = -spin * 1.4 + i * TAU / 6, rad = r * (0.62 + 0.12 * (i % 3));
          c.beginPath(); c.arc(0, vy, rad, a, a + 0.9);
          c.strokeStyle = rgba(i % 2 ? pal.bright : glow, 0.4 + 0.25 * p); c.lineWidth = Math.max(1, r * (0.02 + 0.01 * (i % 2))); c.stroke();
        }
        c.restore();
        // dark long coat back, trousers and boots
        srCoatBack(c, r, 0.46, 0.66, 1.0); fillInk(nbCloth(c, -r * 0.5, -r * 0.4, r * 0.5, r, PC_COAT), 2.2);
        jlLegs(c, h, r, nbCloth(c, -r * 0.3, 0, r * 0.3, 0, ["#4a5248", "#262c27", "#0d100e"]), nbCloth(c, 0, r * 0.8, 0, r * 1.13, ["#3a3640", "#16141b", "#050407"]), 0.82);
        // coat skirts, torso with an open V, ribbed green stomach wrap, side-coloured sword sash
        const coat = nbCloth(c, -r * 0.5, -r * 0.45, r * 0.5, r * 0.6, PC_COAT);
        for (const sx of [-1, 1]) { poly([sx * 0.28, 0.3, sx * 0.44, 0.3, sx * 0.6, 0.98, sx * 0.36, 0.98]); fillInk(coat, 1.8); }
        jlTorso(c, r, 0.44, 0.33, -0.42, 0.38); fillInk(coat, 2.4);
        poly([-0.15, -0.47, 0.15, -0.47, 0, -0.1]); fillInk(PC_TAN, 1.4);
        c.strokeStyle = "rgba(11,7,16,0.35)"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(-r * 0.06, -r * 0.3); c.quadraticCurveTo(0, -r * 0.26, r * 0.06, -r * 0.3); c.stroke();
        rr(-r * 0.36, r * 0.1, r * 0.72, r * 0.27, r * 0.05); fillInk(nbCloth(c, 0, r * 0.1, 0, r * 0.37, PC_BANDANA), 1.8);
        c.strokeStyle = "rgba(11,7,16,0.28)"; c.lineWidth = 1;
        c.beginPath(); for (let x = -0.3; x <= 0.31; x += 0.06) { c.moveTo(x * r, r * 0.13); c.lineTo(x * r, r * 0.34); } c.stroke();
        rr(-r * 0.38, r * 0.33, r * 0.76, r * 0.07, r * 0.025); fillInk(pcSide(c, r, pal, 0, 0.33, 0, 0.4), 1.3);
        const sway = ts ? Math.sin(ts / 280) * r * 0.03 : 0;
        for (const [x2, y2] of [[-0.44, 0.66], [-0.26, 0.72]]) {
          nbStrip(c, nbBezierPts(-r * 0.3, r * 0.37, -r * 0.33, r * 0.48, x2 * r + sway, (y2 - 0.12) * r, x2 * r + sway, y2 * r, 7), r * 0.06, r * 0.035);
          fillInk(pcSide(c, r, pal, -0.3, 0.37, x2, y2), 1.1);
        }
        c.beginPath(); c.ellipse(-r * 0.3, r * 0.37, r * 0.055, r * 0.045, 0, 0, TAU); fillInk(pal.bright, 1.1);
        // third, white-hilted blade sheathed at the hip in a lacquered scabbard tied with a side-coloured cord
        srKatana(c, h, r, r * 0.27, r * 0.33, 0.62, { blade: 0.62, hilt: 0.24, w: 0.075, bend: -0.04, hamon: false, bladeFill: nbCloth(c, 0, -r * 0.04, 0, r * 0.04, ["#5a4a52", "#221a20", "#07050a"]), hiltFill: "#f4f1ea", wrap: "#8a90a0", guard: "round", guardFill: h.metal(0, -r * 0.07, 0, r * 0.07, ...SR_GOLD) });
        c.save(); c.translate(r * 0.27, r * 0.33); c.rotate(0.62);
        c.beginPath(); c.moveTo(r * 0.08, -r * 0.04); c.lineTo(r * 0.08, r * 0.04); c.moveTo(r * 0.12, -r * 0.04); c.lineTo(r * 0.12, r * 0.04);
        c.strokeStyle = pal.bright; c.lineWidth = Math.max(1, r * 0.022); c.stroke();
        c.beginPath(); c.moveTo(r * 0.53, -r * 0.03); c.lineTo(r * 0.6, -r * 0.025); c.strokeStyle = rgba(pal.rim, 0.7); c.lineWidth = Math.max(0.8, r * 0.014); c.stroke();
        c.restore();
        // both arms holding a blade out to each side in a ready stance
        const aw = Math.max(4, r * 0.19);
        heroLimb(c, h, -r * 0.44, -r * 0.36, -r * 0.74, -r * 0.3, -r * 0.5, -r * 0.08, aw, coat);
        heroLimb(c, h, r * 0.44, -r * 0.36, r * 0.74, -r * 0.3, r * 0.5, -r * 0.08, aw, coat);
        const blades = [
          { sx: -1, fill: nbCloth(c, 0, -r * 0.05, 0, r * 0.05, ["#6a7080", "#1c1e26", "#000000"]), hilt: "#141218", guard: "square" },
          { sx: 1, fill: null, hilt: "#8a1420", guard: "round" },
        ];
        for (const b of blades) {
          const gx = b.sx * r * 0.54, gy = -r * 0.14, ang = Math.atan2(-0.62, b.sx * 0.55), ux = Math.cos(ang), uy = Math.sin(ang);
          srKatana(c, h, r, gx, gy, ang, { blade: 0.7, hilt: 0.2, w: 0.075, bend: b.sx * 0.05, bladeFill: b.fill || undefined, hamon: rgba(pal.rim, 0.85), hiltFill: b.hilt, guard: b.guard, guardFill: h.metal(0, -r * 0.08, 0, r * 0.08, ...SR_GOLD) });
          energyBlade(gx + ux * r * 0.08, gy + uy * r * 0.08, gx + ux * r * 0.6, gy + uy * r * 0.6, Math.max(1, r * 0.018), b.sx < 0 ? pal.bright : glow, "#ffffff");
          // flying slash shed from the blade tip
          c.save(); c.globalCompositeOperation = "lighter";
          const tx = gx + ux * r * 0.66, ty = gy + uy * r * 0.66, sa = ang + (ts ? Math.sin(ts / 200) * 0.2 : 0);
          srCrescent(c, tx - ux * r * 0.18, ty - uy * r * 0.18, r * 0.2, sa - 1.3, sa + 1.3, r * 0.06);
          c.fillStyle = rgba(b.sx < 0 ? pal.bright : glow, 0.55 + 0.3 * p); c.fill();
          c.restore();
          c.beginPath(); c.arc(gx - ux * r * 0.1, gy - uy * r * 0.1, r * 0.075, 0, TAU); fillInk(PC_TAN, 1.3);
        }
        // neck, face, bandana with fluttering knot tails
        rr(-r * 0.09, -r * 0.56, r * 0.18, r * 0.14, r * 0.04); fillInk(PC_TAN, 1.5);
        const band = nbCloth(c, -r * 0.25, -r * 1.0, r * 0.25, -r * 0.72, PC_BANDANA), fl = ts ? Math.sin(ts / 200) * r * 0.04 : 0;
        for (const [x2, y2] of [[-0.52, -0.84], [-0.48, -0.66]]) {
          nbStrip(c, nbBezierPts(-r * 0.2, -r * 0.84, -r * 0.3, -r * 0.84, (x2 + 0.1) * r, y2 * r + fl, x2 * r, y2 * r - fl, 7), r * 0.07, r * 0.04);
          fillInk(band, 1.2);
        }
        nbFace(c, h, r, -0.68, 0.2, PC_TAN);
        c.beginPath(); c.moveTo(-r * 0.215, -r * 0.74); c.bezierCurveTo(-r * 0.24, -r * 1.06, r * 0.24, -r * 1.06, r * 0.215, -r * 0.74);
        c.quadraticCurveTo(0, -r * 0.8, -r * 0.215, -r * 0.74); c.closePath(); fillInk(band, 1.8);
        c.strokeStyle = "rgba(11,7,16,0.3)"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(-r * 0.12, -r * 0.94); c.quadraticCurveTo(-r * 0.05, -r * 0.86, -r * 0.08, -r * 0.79); c.moveTo(r * 0.1, -r * 0.94); c.quadraticCurveTo(r * 0.14, -r * 0.86, r * 0.1, -r * 0.79); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.21, -r * 0.75); c.quadraticCurveTo(0, -r * 0.81, r * 0.21, -r * 0.75);
        c.strokeStyle = rgba(pal.rim, 0.7); c.lineWidth = Math.max(1, r * 0.018); c.stroke();
        // stern focused eyes under hard slanted brows, three gold earrings
        for (const sx of [-1, 1]) {
          nbEye(c, h, r, sx * r * 0.085, -r * 0.69, sx, "#1d2a1c");
          c.beginPath(); c.moveTo(sx * r * 0.16, -r * 0.775); c.lineTo(sx * r * 0.03, -r * 0.74);
          c.strokeStyle = h.INK; c.lineWidth = Math.max(1.3, r * 0.026); c.stroke();
        }
        for (const y of [-0.68, -0.64, -0.6]) { c.beginPath(); c.arc(-r * 0.21, y * r, r * 0.018, 0, TAU); fillInk(SR_GOLD[1], 0.8); }
        // set, determined mouth
        c.beginPath(); c.moveTo(-r * 0.065, -r * 0.575); c.quadraticCurveTo(0, -r * 0.565, r * 0.065, -r * 0.58);
        c.strokeStyle = "rgba(11,7,16,0.8)"; c.lineWidth = Math.max(1.1, r * 0.022); c.stroke();
        if (ts) for (const sx of [-1, 1]) glowOrb(sx * r * 0.98, -r * 0.63, r * 0.06 * p, sx < 0 ? pal.bright : glow);
      },

      /* Steel-Arm Shipwright — towering sky-blue pompadour, dark shades, red flower-print shirt over a riveted
         steel torso with side-coloured chest-plate trim and a brass steam-pressure dial hatch, giant square
         shoulder guards with side-coloured trim and brass compass-rose bosses, boxy forearms stamped with brass
         anchors and brass rivet plates on the shins, raised overhead in a triumphant triangle pose amid a
         starburst and crackling sparks. */
      juggernaut(c, pal, r, ts, h) {
        const { fillInk, poly, metal, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(200), glow = pcGlow(pal), spin = ts ? ts / 2200 : 0.15;
        // triumphant starburst (base silhouette)
        const cy0 = -r * 0.3;
        c.beginPath();
        for (let i = 0; i < 24; i++) {
          const a = spin - Math.PI / 2 + i * TAU / 24, R = i % 2 ? r * 0.58 : r * (0.84 + 0.04 * heroHash(i));
          const x = Math.cos(a) * R, y = cy0 + Math.sin(a) * R;
          if (i) c.lineTo(x, y); else c.moveTo(x, y);
        }
        c.closePath();
        const sg = c.createRadialGradient(0, cy0, r * 0.1, 0, cy0, r * 0.88);
        sg.addColorStop(0, rgba(pal.rim, 0.95)); sg.addColorStop(0.5, pal.bright); sg.addColorStop(1, pal.deep);
        fillInk(sg, 2); c.shadowBlur = 0; // drop shadow only on the base silhouette
        // navy trunks with a side stripe, bare thighs, giant steel shins
        const steel = (x0, y0, x1, y1) => metal(x0, y0, x1, y1, ...PC_STEEL);
        for (const sx of [-1, 1]) {
          poly([sx * 0.08, 0.5, sx * 0.3, 0.5, sx * 0.3, 0.68, sx * 0.09, 0.68]); fillInk(PC_TAN, 1.6);
          poly([sx * 0.04, 0.62, sx * 0.36, 0.62, sx * 0.4, 1.13, sx * 0.02, 1.13]); fillInk(steel(sx * r * 0.04, 0, sx * r * 0.4, 0), 2.2);
          c.strokeStyle = "rgba(11,7,16,0.4)"; c.lineWidth = 1;
          c.beginPath(); c.moveTo(sx * r * 0.04, r * 0.98); c.lineTo(sx * r * 0.39, r * 0.98); c.stroke();
          rr(sx * r * 0.21 - r * 0.09, r * 0.72, r * 0.18, r * 0.17, r * 0.03); fillInk(metal(0, r * 0.72, 0, r * 0.89, ...PC_BRASS), 1.2);
          for (const x of [-0.055, 0.055]) for (const y of [0.755, 0.855]) pcRivet(c, sx * r * 0.21 + x * r, y * r, Math.max(0.7, r * 0.015));
          for (const y of [0.68, 1.05]) for (const x of [0.09, 0.33]) pcRivet(c, sx * x * r, y * r, Math.max(0.8, r * 0.018));
        }
        poly([-0.42, 0.34, 0.42, 0.34, 0.38, 0.56, 0.03, 0.56, 0, 0.5, -0.03, 0.56, -0.38, 0.56]); fillInk(nbCloth(c, 0, r * 0.34, 0, r * 0.56, ["#3d55a8", "#1d2a57", "#0a1028"]), 2);
        for (const sx of [-1, 1]) { poly([sx * 0.36, 0.36, sx * 0.4, 0.36, sx * 0.36, 0.55, sx * 0.32, 0.55]); c.fillStyle = pal.bright; c.fill(); }
        // massive riveted steel torso
        const torso = () => jlTorso(c, r, 0.56, 0.4, -0.44, 0.4);
        torso(); fillInk(steel(-r * 0.5, -r * 0.4, r * 0.5, r * 0.4), 2.6);
        c.save(); torso(); c.clip();
        c.strokeStyle = "rgba(11,7,16,0.35)"; c.lineWidth = 1.1;
        c.beginPath(); c.moveTo(-r * 0.2, -r * 0.18); c.quadraticCurveTo(0, -r * 0.1, r * 0.2, -r * 0.18); c.moveTo(0, -r * 0.12); c.lineTo(0, r * 0.4); c.stroke();
        c.restore();
        // side-coloured trim along the chest-plate armour edges (neckline and pectoral seam)
        c.save(); torso(); c.clip();
        const trim = (path) => {
          path(); c.strokeStyle = h.INK; c.lineWidth = Math.max(2.4, r * 0.05); c.stroke();
          path(); c.strokeStyle = pal.bright; c.lineWidth = Math.max(1.6, r * 0.034); c.stroke();
          path(); c.strokeStyle = rgba(pal.rim, 0.9); c.lineWidth = Math.max(0.6, r * 0.011); c.stroke();
        };
        trim(() => { c.beginPath(); c.moveTo(-r * 0.26, -r * 0.44); c.quadraticCurveTo(0, -r * 0.3, r * 0.26, -r * 0.44); });
        trim(() => { c.beginPath(); c.moveTo(-r * 0.24, -r * 0.2); c.quadraticCurveTo(0, -r * 0.1, r * 0.24, -r * 0.2); });
        c.restore();
        // red flower-print shirt panels flapping open
        for (const sx of [-1, 1]) {
          const panel = () => poly([sx * 0.57, -0.44, sx * 0.21, -0.47, sx * 0.17, -0.3, sx * 0.24, 0.4, sx * 0.44, 0.4, sx * 0.62, -0.1]);
          panel(); fillInk(nbCloth(c, sx * r * 0.2, -r * 0.4, sx * r * 0.6, r * 0.4, PC_SHIRT_RED), 2);
          c.save(); panel(); c.clip();
          let k = 0;
          for (const [x, y] of [[0.3, -0.3], [0.48, -0.12], [0.33, 0.06], [0.5, 0.24], [0.3, 0.3]]) pcFlower(c, sx * x * r, y * r, r * 0.07, k++ % 2 ? pal.bright : "#ffd34a", "#7a1a08");
          c.restore();
          poly([sx * 0.21, -0.47, sx * 0.36, -0.46, sx * 0.24, -0.26]); fillInk(PC_SHIRT_RED[0], 1.2);
          // bright trim on the exposed steel chest-plate edge where the shirt falls open
          c.beginPath(); c.moveTo(sx * r * 0.19, -r * 0.38); c.lineTo(sx * r * 0.175, -r * 0.3); c.lineTo(sx * r * 0.235, r * 0.3);
          c.strokeStyle = pal.bright; c.lineWidth = Math.max(1.4, r * 0.03); c.stroke();
          c.strokeStyle = rgba(pal.rim, 0.9); c.lineWidth = Math.max(0.6, r * 0.01); c.stroke();
        }
        // brass steam-pressure dial set into a riveted chest hatch, needle trembling, steam venting
        rr(-r * 0.13, -r * 0.05, r * 0.26, r * 0.3, r * 0.05); fillInk(steel(0, -r * 0.05, 0, r * 0.25), 1.8);
        const DX = 0, DY = r * 0.1, DR = r * 0.105;
        c.beginPath(); c.arc(DX, DY, DR, 0, TAU); fillInk(metal(DX - DR, DY - DR, DX + DR, DY + DR, ...PC_BRASS), 1.4);
        c.beginPath(); c.arc(DX, DY, DR * 0.76, 0, TAU); fillInk(nbCloth(c, 0, DY - DR, 0, DY + DR, ["#fffaf0", "#f1e6cc", "#c9b48a"]), 0.9);
        c.beginPath(); c.arc(DX, DY, DR * 0.6, Math.PI * 1.85, Math.PI * 2.25);
        c.strokeStyle = rgba(pal.bright, 0.85); c.lineWidth = Math.max(0.8, r * 0.012); c.stroke();
        c.strokeStyle = "rgba(58,42,20,0.85)"; c.lineWidth = Math.max(0.6, r * 0.008);
        c.beginPath();
        for (let i = 0; i <= 8; i++) { const a = Math.PI * 0.75 + i * Math.PI * 1.5 / 8; c.moveTo(DX + Math.cos(a) * DR * 0.72, DY + Math.sin(a) * DR * 0.72); c.lineTo(DX + Math.cos(a) * DR * 0.58, DY + Math.sin(a) * DR * 0.58); }
        c.stroke();
        const na = Math.PI * (1.15 + 0.85 * p) + (ts ? Math.sin(ts / 45) * 0.05 : 0);
        c.beginPath(); c.moveTo(DX - Math.cos(na) * DR * 0.12, DY - Math.sin(na) * DR * 0.12); c.lineTo(DX + Math.cos(na) * DR * 0.62, DY + Math.sin(na) * DR * 0.62);
        c.strokeStyle = "#a8141e"; c.lineWidth = Math.max(0.9, r * 0.014); c.stroke();
        c.beginPath(); c.arc(DX, DY, DR * 0.12, 0, TAU); fillInk(PC_BRASS[1], 0.8);
        c.beginPath(); c.ellipse(DX - DR * 0.35, DY - DR * 0.4, DR * 0.3, DR * 0.12, -0.5, 0, TAU); c.fillStyle = "rgba(255,255,255,0.45)"; c.fill();
        rr(DX + DR * 0.62, DY - DR * 1.2, r * 0.035, r * 0.05, r * 0.01); fillInk(metal(0, 0, r * 0.035, 0, ...PC_BRASS), 0.9);
        c.save(); c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 3; i++) {
          const t = ts ? (ts / 1100 + i / 3) % 1 : i / 3;
          c.beginPath(); c.arc(DX + DR * 0.8 + t * r * 0.08, DY - DR * 1.3 - t * r * 0.16, r * (0.02 + 0.03 * t), 0, TAU);
          c.fillStyle = `rgba(235,240,248,${0.45 * (1 - t)})`; c.fill();
        }
        c.restore();
        glowOrb(0, r * 0.27, r * 0.05 * (0.6 + 0.6 * p), glow);
        for (const [x, y] of [[-0.1, -0.025], [0.1, -0.025], [-0.1, 0.225], [0.1, 0.225]]) pcRivet(c, x * r, y * r, Math.max(0.7, r * 0.014));
        rr(-r * 0.42, r * 0.3, r * 0.84, r * 0.08, r * 0.025); fillInk(nbCloth(c, 0, r * 0.3, 0, r * 0.38, PC_LEATHER), 1.4);
        // arms raised overhead: steel pauldrons, upper arms, boxy anchor-stamped forearms, fists
        for (const sx of [-1, 1]) {
          const ex = sx * r * 0.84, ey = -r * 0.6, wx = sx * r * 0.52, wy = -r * 0.96;
          heroLimb(c, h, sx * r * 0.58, -r * 0.38, sx * r * 0.88, -r * 0.42, ex, ey, Math.max(5, r * 0.2), steel(sx * r * 0.6, -r * 0.5, sx * r * 0.9, -r * 0.4));
          const ang = Math.atan2(wy - ey, wx - ex), L = Math.hypot(wx - ex, wy - ey), W = r * 0.28;
          c.save(); c.translate(ex, ey); c.rotate(ang);
          rr(-r * 0.04, -W / 2, L + r * 0.04, W, r * 0.05); fillInk(steel(0, -W / 2, 0, W / 2), 2.2);
          c.strokeStyle = "rgba(11,7,16,0.4)"; c.lineWidth = 1;
          c.beginPath(); c.moveTo(L * 0.2, -W / 2); c.lineTo(L * 0.2, W / 2); c.moveTo(L * 0.85, -W / 2); c.lineTo(L * 0.85, W / 2); c.stroke();
          pcAnchor(c, h, L * 0.52, 0, W * 0.3, metal(0, -W * 0.3, 0, W * 0.3, ...PC_BRASS), -Math.PI / 2);
          for (const x of [0.08, 0.95]) for (const y of [-0.36, 0.36]) pcRivet(c, x * L, y * W, Math.max(0.7, r * 0.016));
          c.restore();
          pcFist(c, h, sx * r * 0.45, -r * 1.04, r * 0.11, steel(sx * r * 0.35, -r * 1.15, sx * r * 0.55, -r * 0.95), -Math.PI / 2);
          rr(sx * r * 0.6 - r * 0.17, -r * 0.56, r * 0.34, r * 0.3, r * 0.07); fillInk(steel(sx * r * 0.43, -r * 0.56, sx * r * 0.77, -r * 0.26), 2.2);
          // side-coloured trim on the shoulder guard and a brass compass-rose boss
          rr(sx * r * 0.6 - r * 0.145, -r * 0.535, r * 0.29, r * 0.25, r * 0.055);
          c.strokeStyle = pal.bright; c.lineWidth = Math.max(1.4, r * 0.03); c.stroke();
          c.strokeStyle = rgba(pal.rim, 0.9); c.lineWidth = Math.max(0.6, r * 0.01); c.stroke();
          pcCompass(c, h, sx * r * 0.6, -r * 0.41, r * 0.085, metal(sx * r * 0.52, -r * 0.5, sx * r * 0.68, -r * 0.32, ...PC_BRASS), pal.bright);
          for (const x of [-0.12, 0.12]) for (const y of [-0.51, -0.31]) pcRivet(c, sx * r * 0.6 + x * r, y * r, Math.max(0.7, r * 0.015));
        }
        // crackling sparks off the fists and shoulders
        heroBolt(c, h, ts, -r * 0.54, -r * 1.06, -r * 0.98, -r * 1.0, Math.max(0.9, r * 0.02), glow, 3, 4);
        heroBolt(c, h, ts, r * 0.54, -r * 1.06, r * 0.98, -r * 1.0, Math.max(0.9, r * 0.02), glow, 5, 4);
        heroBolt(c, h, ts, r * 0.74, -r * 0.42, r * 1.1, -r * 0.2, Math.max(0.8, r * 0.017), PC_SPARK, 7, 4);
        heroBolt(c, h, ts, -r * 0.74, -r * 0.42, -r * 1.1, -r * 0.2, Math.max(0.8, r * 0.017), PC_SPARK, 9, 4);
        // neck, square jaw, sideburns, steel nose, shades, toothy grin
        rr(-r * 0.11, -r * 0.5, r * 0.22, r * 0.1, r * 0.03); fillInk(PC_TAN, 1.4);
        jlFace(c, h, r, -0.66, 0.22, PC_TAN);
        const hair = nbCloth(c, -r * 0.3, -r * 1.16, r * 0.3, -r * 0.7, PC_CYAN_HAIR);
        for (const sx of [-1, 1]) { poly([sx * 0.22, -0.78, sx * 0.17, -0.78, sx * 0.17, -0.58, sx * 0.21, -0.6]); fillInk(hair, 1.1); }
        const shades = () => { c.beginPath(); c.moveTo(-r * 0.21, -r * 0.76); c.lineTo(r * 0.21, -r * 0.76); c.lineTo(r * 0.18, -r * 0.66); c.lineTo(r * 0.03, -r * 0.67); c.lineTo(0, -r * 0.71); c.lineTo(-r * 0.03, -r * 0.67); c.lineTo(-r * 0.18, -r * 0.66); c.closePath(); };
        shades(); fillInk(nbCloth(c, 0, -r * 0.76, 0, -r * 0.66, ["#3a3f52", "#0b0c12", pal.deep]), 1.6);
        c.save(); shades(); c.clip();
        c.strokeStyle = rgba(pal.rim, 0.85); c.lineWidth = Math.max(1, r * 0.02);
        c.beginPath(); c.moveTo(-r * 0.16, -r * 0.68); c.lineTo(-r * 0.1, -r * 0.75); c.moveTo(r * 0.06, -r * 0.68); c.lineTo(r * 0.12, -r * 0.75); c.stroke();
        c.restore();
        rr(-r * 0.03, -r * 0.66, r * 0.06, r * 0.07, r * 0.015); fillInk(steel(-r * 0.03, 0, r * 0.03, 0), 1.1);
        rr(-r * 0.11, -r * 0.57, r * 0.22, r * 0.055, r * 0.02); fillInk("#fbf7ef", 1.3);
        c.strokeStyle = "rgba(11,7,16,0.5)"; c.lineWidth = 0.9;
        c.beginPath(); for (const x of [-0.055, 0, 0.055]) { c.moveTo(x * r, -r * 0.57); c.lineTo(x * r, -r * 0.515); } c.stroke();
        // towering sky-blue pompadour quiff
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.76);
        c.bezierCurveTo(-r * 0.3, -r * 0.96, -r * 0.24, -r * 1.13, -r * 0.02, -r * 1.15);
        c.bezierCurveTo(r * 0.2, -r * 1.17, r * 0.34, -r * 1.12, r * 0.33, -r * 1.0);
        c.bezierCurveTo(r * 0.32, -r * 0.9, r * 0.2, -r * 0.88, r * 0.13, -r * 0.94);
        c.quadraticCurveTo(r * 0.22, -r * 0.84, r * 0.22, -r * 0.76);
        c.quadraticCurveTo(0, -r * 0.84, -r * 0.22, -r * 0.76); c.closePath(); fillInk(hair, 2);
        c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = Math.max(1, r * 0.018);
        c.beginPath(); c.moveTo(-r * 0.18, -r * 0.86); c.quadraticCurveTo(-r * 0.12, -r * 1.08, r * 0.14, -r * 1.1);
        c.moveTo(-r * 0.08, -r * 0.84); c.quadraticCurveTo(0, -r * 1.0, r * 0.24, -r * 1.04); c.stroke();
        c.strokeStyle = "rgba(11,7,16,0.35)"; c.lineWidth = 1;
        c.beginPath(); c.arc(r * 0.24, -r * 1.0, r * 0.05, -Math.PI * 0.2, Math.PI * 1.1); c.stroke();
      },

      /* Blazing-Kick Cook — sharp black suit with gold buttons, side-coloured silk lapels, cuffs, waistcoat and
         tie over a crisp collar, sleek parted golden bangs hiding one eye, an unlit cigarillo trailing a smoke
         wisp, and a high spinning kick sweeping a fiery arc with a side-coloured blazing core, the leg wreathed
         in roaring flames and embers. */
      trickster(c, pal, r, ts, h) {
        const { fillInk, poly, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(120), glow = pcGlow(pal);
        // sweeping fiery kick arc (base silhouette)
        const kx = r * 0.08, ky = 0, KR = r * 0.98;
        srCrescent(c, kx, ky, KR, 1.25, -0.95, r * 0.32);
        const ag = c.createRadialGradient(kx, ky, KR * 0.6, kx, ky, KR);
        ag.addColorStop(0, pal.deep); ag.addColorStop(0.55, PC_EMBER); ag.addColorStop(1, pal.bright);
        fillInk(ag, 2); c.shadowBlur = 0; // drop shadow only on the base silhouette
        c.save(); c.globalCompositeOperation = "lighter";
        c.beginPath(); c.arc(kx, ky, KR * 0.95, -0.85, 1.15);
        c.strokeStyle = rgba(PC_FIRE, 0.45 + 0.3 * p); c.lineWidth = Math.max(1.2, r * 0.035); c.stroke();
        // intense side-coloured blazing edge core along the leading rim of the kick arc
        c.beginPath(); c.arc(kx, ky, KR * 0.985, -0.9, 1.2);
        c.strokeStyle = rgba(pal.bright, 0.75 + 0.2 * p); c.lineWidth = Math.max(1.6, r * 0.05); c.stroke();
        c.strokeStyle = rgba(pal.rim, 0.95); c.lineWidth = Math.max(0.8, r * 0.018); c.stroke();
        if (ts) for (let i = 0; i < 5; i++) {
          const a = 1.1 - ((ts / 500 + i / 5) % 1) * 1.9;
          c.beginPath(); c.arc(kx, ky, KR * (0.8 - 0.04 * (i % 3)), a, a + 0.25);
          c.strokeStyle = rgba(i % 2 ? "#ffffff" : glow, 0.6); c.lineWidth = Math.max(1, r * 0.018); c.stroke();
        }
        c.restore();
        const suit = nbCloth(c, -r * 0.4, -r * 0.4, r * 0.4, r * 0.8, PC_SUIT);
        // jacket tails flaring behind, planted leg and polished shoe
        poly([-0.34, 0.25, 0.3, 0.25, 0.4, 0.58, 0.12, 0.52, -0.08, 0.6, -0.42, 0.56]); fillInk(suit, 2);
        poly([-0.31, 0.34, -0.02, 0.34, -0.06, 1.0, -0.27, 1.0]); fillInk(suit, 2.2);
        c.strokeStyle = "rgba(255,255,255,0.15)"; c.lineWidth = 1;
        c.beginPath(); c.moveTo(-r * 0.16, r * 0.4); c.lineTo(-r * 0.16, r * 0.98); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.29, r * 1.12); c.lineTo(-r * 0.31, r * 1.02); c.quadraticCurveTo(-r * 0.16, r * 0.96, -r * 0.04, r * 1.0);
        c.quadraticCurveTo(r * 0.06, r * 1.04, r * 0.06, r * 1.12); c.closePath(); fillInk(nbCloth(c, 0, r * 0.96, 0, r * 1.12, ["#5a5f72", "#14151d", "#000000"]), 1.6);
        c.beginPath(); c.ellipse(-r * 0.12, r * 1.02, r * 0.06, r * 0.015, -0.2, 0, TAU); c.fillStyle = "rgba(255,255,255,0.5)"; c.fill();
        // jacket torso, hands-in-pockets arms
        const aw = Math.max(4, r * 0.18);
        heroLimb(c, h, -r * 0.4, -r * 0.36, -r * 0.56, -r * 0.02, -r * 0.34, r * 0.24, aw, suit);
        heroLimb(c, h, r * 0.4, -r * 0.36, r * 0.56, -r * 0.02, r * 0.34, r * 0.24, aw, suit);
        jlTorso(c, r, 0.4, 0.3, -0.42, 0.38); fillInk(suit, 2.4);
        const pm = pal.main || pal.mid, silk = (x0, y0, x1, y1) => nbCloth(c, x0 * r, y0 * r, x1 * r, y1 * r, [pal.bright, pm, pal.deep]);
        for (const sx of [-1, 1]) {
          // side-coloured silk sleeve cuffs with a crisp white shirt cuff peeking out
          c.beginPath(); c.moveTo(sx * r * 0.42, r * 0.15); c.lineTo(sx * r * 0.3, r * 0.22);
          c.strokeStyle = h.INK; c.lineWidth = Math.max(3.4, r * 0.085); c.stroke();
          c.strokeStyle = pal.bright; c.lineWidth = Math.max(2.2, r * 0.065); c.stroke();
          c.strokeStyle = rgba(pal.rim, 0.85); c.lineWidth = Math.max(0.6, r * 0.012); c.stroke();
          c.beginPath(); c.moveTo(sx * r * 0.38, r * 0.2); c.lineTo(sx * r * 0.28, r * 0.26);
          c.strokeStyle = "#f4f2ec"; c.lineWidth = Math.max(1.5, r * 0.04); c.stroke();
          c.beginPath(); c.moveTo(sx * r * 0.36, r * 0.27); c.lineTo(sx * r * 0.24, r * 0.27); c.strokeStyle = h.INK; c.lineWidth = 1.4; c.stroke();
        }
        // side-coloured waistcoat with a bright lining edge, crisp white collar, side-coloured silk tie
        poly([-0.15, -0.42, 0.15, -0.42, 0.13, 0.02, 0, 0.09, -0.13, 0.02]); fillInk(nbCloth(c, 0, -r * 0.42, 0, r * 0.09, [pm, pal.deep, "#07070b"]), 1.4);
        c.beginPath(); c.moveTo(-r * 0.13, -r * 0.3); c.lineTo(-r * 0.12, r * 0.0); c.lineTo(0, r * 0.07); c.lineTo(r * 0.12, r * 0.0); c.lineTo(r * 0.13, -r * 0.3);
        c.strokeStyle = pal.bright; c.lineWidth = Math.max(1.2, r * 0.026); c.stroke();
        c.strokeStyle = rgba(pal.rim, 0.9); c.lineWidth = Math.max(0.6, r * 0.01); c.stroke();
        for (const y of [-0.12, -0.03]) { c.beginPath(); c.arc(0, y * r, r * 0.016, 0, TAU); fillInk(SR_GOLD[1], 0.7); }
        poly([-0.11, -0.47, 0.11, -0.47, 0, -0.2]); fillInk("#f6f4ee", 1.4);
        poly([-0.03, -0.4, 0.03, -0.4, 0.045, -0.14, 0, -0.08, -0.045, -0.14]); fillInk(silk(-0.045, -0.4, 0.045, -0.08), 1.1);
        c.beginPath(); c.moveTo(0, -r * 0.38); c.lineTo(0, -r * 0.12); c.strokeStyle = rgba(pal.rim, 0.75); c.lineWidth = Math.max(0.6, r * 0.01); c.stroke();
        rr(-r * 0.035, -r * 0.43, r * 0.07, r * 0.045, r * 0.01); fillInk(pal.deep, 1);
        for (const sx of [-1, 1]) {
          poly([sx * 0.22, -0.46, sx * 0.14, -0.47, sx * 0.0, -0.06, sx * 0.05, 0.0, sx * 0.13, -0.18, sx * 0.24, -0.22, sx * 0.18, -0.3]); fillInk(silk(sx * 0.0, -0.47, sx * 0.24, 0.0), 1.4);
          c.beginPath(); c.moveTo(sx * r * 0.14, -r * 0.47); c.lineTo(0, -r * 0.06);
          c.strokeStyle = rgba(pal.rim, 0.9); c.lineWidth = Math.max(1, r * 0.02); c.stroke();
          poly([sx * 0.14, -0.47, sx * 0.08, -0.47, sx * 0.04, -0.38]); fillInk("#ffffff", 1);
          for (const y of [0.06, 0.2]) { c.beginPath(); c.arc(sx * r * 0.08, y * r, r * 0.026, 0, TAU); fillInk(SR_GOLD[1], 0.9); }
        }
        poly([-0.33, -0.2, -0.22, -0.2, -0.25, -0.12, -0.29, -0.16, -0.31, -0.11]); fillInk(pcSide(c, r, pal, -0.33, -0.2, -0.22, -0.1), 1.1);
        // roaring flames wreathing the kicking leg (trailing behind it, opposite the swing)
        const legPts = [[0.22, 0.3], [0.36, 0.2], [0.48, 0.08], [0.58, -0.03], [0.67, -0.15], [0.76, -0.28], [0.86, -0.42]];
        c.save(); c.globalCompositeOperation = "lighter";
        for (let i = 0; i < legPts.length; i++) {
          const [x, y] = legPts[i], fl = ts ? Math.sin(ts / 85 + i * 1.9) : 0, len = r * (0.26 + 0.06 * i / legPts.length + 0.04 * fl);
          srFlame(c, x * r, y * r, len, r * 0.18, -1.0 + 0.15 * fl, rgba(i % 2 ? PC_EMBER : PC_FIRE, 0.7));
          srFlame(c, x * r, y * r, len * 0.75, r * 0.12, -0.35 + 0.15 * fl, rgba(i % 2 ? PC_FIRE : PC_EMBER, 0.55));
        }
        c.restore();
        // high flaming kick: thigh, shin, polished shoe
        heroLimb(c, h, r * 0.12, r * 0.34, r * 0.32, r * 0.26, r * 0.52, r * 0.04, Math.max(5, r * 0.22), suit);
        heroLimb(c, h, r * 0.52, r * 0.04, r * 0.66, -r * 0.14, r * 0.8, -r * 0.36, Math.max(4, r * 0.19), suit);
        c.save(); c.translate(r * 0.84, -r * 0.42); c.rotate(-0.95);
        c.beginPath(); c.moveTo(-r * 0.06, -r * 0.08); c.quadraticCurveTo(r * 0.16, -r * 0.09, r * 0.2, -r * 0.01); c.quadraticCurveTo(r * 0.2, r * 0.06, r * 0.06, r * 0.07);
        c.lineTo(-r * 0.07, r * 0.07); c.closePath(); fillInk(nbCloth(c, 0, -r * 0.08, 0, r * 0.07, ["#5a5f72", "#14151d", "#000000"]), 1.6);
        c.beginPath(); c.ellipse(r * 0.08, -r * 0.045, r * 0.06, r * 0.015, 0, 0, TAU); c.fillStyle = "rgba(255,255,255,0.45)"; c.fill();
        c.restore();
        // heat-glow rim along the leading edge of the leg plus small flame licks over it
        c.save(); c.globalCompositeOperation = "lighter";
        c.beginPath(); c.moveTo(r * 0.2, r * 0.38); c.quadraticCurveTo(r * 0.62, r * 0.18, r * 0.9, -r * 0.3);
        c.strokeStyle = rgba(glow, 0.5 + 0.3 * p); c.lineWidth = Math.max(1.5, r * 0.045); c.stroke();
        c.strokeStyle = rgba(pal.rim, 0.8); c.lineWidth = Math.max(0.8, r * 0.016); c.stroke();
        for (let i = 1; i < legPts.length; i += 2) {
          const [x, y] = legPts[i], fl = ts ? Math.sin(ts / 70 + i * 2.3) : 0;
          srFlame(c, x * r - r * 0.03, y * r - r * 0.03, r * (0.12 + 0.03 * fl), r * 0.07, -0.7 + 0.2 * fl, rgba(PC_FIRE, 0.45));
        }
        c.restore();
        for (let i = 0; i < 9; i++) {
          const t = ts ? (ts / 800 + i / 9) % 1 : i / 9, base = legPts[i % legPts.length];
          glowOrb(base[0] * r - t * r * 0.35, base[1] * r - t * r * 0.3, r * 0.025 * (1 - t * 0.6), i % 2 ? PC_FIRE : glow);
        }
        // neck, blond back hair, face
        rr(-r * 0.08, -r * 0.56, r * 0.16, r * 0.12, r * 0.04); fillInk(PC_SKIN, 1.4);
        const hair = nbCloth(c, -r * 0.25, -r * 1.0, r * 0.25, -r * 0.55, PC_BLOND);
        c.beginPath(); c.ellipse(0, -r * 0.78, r * 0.25, r * 0.23, 0, 0, TAU); fillInk(hair, 1.6);
        nbFace(c, h, r, -0.68, 0.2, PC_SKIN);
        // visible eye under a sleek, cool brow, small chin tuft
        nbEye(c, h, r, -r * 0.085, -r * 0.7, -1, "#2a5fa8");
        c.beginPath(); c.moveTo(-r * 0.16, -r * 0.77); c.quadraticCurveTo(-r * 0.1, -r * 0.8, -r * 0.03, -r * 0.785);
        c.strokeStyle = h.INK; c.lineWidth = Math.max(1.1, r * 0.022); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.05, -r * 0.555); c.quadraticCurveTo(0, -r * 0.545, r * 0.04, -r * 0.565);
        c.strokeStyle = "rgba(11,7,16,0.7)"; c.lineWidth = 1.1; c.stroke();
        poly([-0.02, -0.5, 0.02, -0.5, 0, -0.47]); fillInk(PC_BLOND[1], 0.8);
        // unlit cigarillo and a curling smoke wisp
        c.beginPath(); c.moveTo(r * 0.03, -r * 0.56); c.lineTo(r * 0.18, -r * 0.6);
        c.strokeStyle = h.INK; c.lineWidth = r * 0.035 + 2; c.stroke(); c.strokeStyle = "#f2efe6"; c.lineWidth = r * 0.035; c.stroke();
        c.beginPath(); c.moveTo(r * 0.03, -r * 0.56); c.lineTo(r * 0.07, -r * 0.57); c.strokeStyle = "#c98a4a"; c.stroke();
        const sm = ts ? Math.sin(ts / 400) * r * 0.04 : 0;
        c.beginPath(); c.moveTo(r * 0.19, -r * 0.61);
        c.bezierCurveTo(r * 0.26 + sm, -r * 0.7, r * 0.16 - sm, -r * 0.8, r * 0.26 + sm, -r * 0.92);
        c.strokeStyle = "rgba(220,220,230,0.55)"; c.lineWidth = Math.max(1.2, r * 0.03); c.stroke();
        c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = Math.max(0.6, r * 0.012); c.stroke();
        // sleek parted golden bangs swept to hide one eye
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.78);
        c.quadraticCurveTo(-r * 0.2, -r * 0.98, -r * 0.06, -r * 0.99);
        c.quadraticCurveTo(r * 0.2, -r * 0.98, r * 0.24, -r * 0.8);
        c.quadraticCurveTo(r * 0.26, -r * 0.66, r * 0.19, -r * 0.57);
        c.quadraticCurveTo(r * 0.18, -r * 0.66, r * 0.12, -r * 0.64);
        c.quadraticCurveTo(r * 0.03, -r * 0.7, r * 0.0, -r * 0.8);
        c.quadraticCurveTo(-r * 0.04, -r * 0.88, -r * 0.08, -r * 0.84);
        c.quadraticCurveTo(-r * 0.16, -r * 0.84, -r * 0.22, -r * 0.78); c.closePath(); fillInk(hair, 1.6);
        c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = Math.max(0.8, r * 0.015);
        c.beginPath(); c.moveTo(-r * 0.04, -r * 0.94); c.quadraticCurveTo(r * 0.14, -r * 0.92, r * 0.18, -r * 0.7);
        c.moveTo(-r * 0.15, -r * 0.88); c.quadraticCurveTo(-r * 0.08, -r * 0.94, 0, -r * 0.93); c.stroke();
      },

      /* Tempest Navigator — long wavy orange hair, blue-and-gold patterned top, side-coloured skirt, belt and
         compass bracelet, a three-segment sky-blue climate staff summoning a dark thundercloud with forked
         lightning and slanting rain. */
      wildrider(c, pal, r, ts, h) {
        const { fillInk, poly, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(260), glow = pcGlow(pal);
        // brooding thundercloud (base silhouette)
        const CX = r * 0.42, CY = -r * 0.86, drift = ts ? Math.sin(ts / 900) * r * 0.02 : 0;
        const cloud = () => pcCloud(c, CX + drift, CY, r * 0.62, r * 0.3, 3);
        cloud();
        const cg = c.createLinearGradient(0, CY - r * 0.34, 0, CY + r * 0.17);
        cg.addColorStop(0, "#7a7f9a"); cg.addColorStop(0.5, "#2a2c3e"); cg.addColorStop(1, pal.deep);
        fillInk(cg, 2); c.shadowBlur = 0; // drop shadow only on the base silhouette
        c.save(); cloud(); c.clip();
        c.fillStyle = "rgba(255,255,255,0.14)";
        for (const [x, y, rx] of [[-0.06, -0.96, 0.14], [0.32, -1.04, 0.17], [0.72, -0.98, 0.14]]) { c.beginPath(); c.ellipse(x * r + drift, y * r, rx * r, rx * 0.5 * r, 0, 0, TAU); c.fill(); }
        const flash = ts ? Math.max(0, Math.sin(ts / 170) * Math.sin(ts / 530)) : 0.5;
        glowOrb(CX + drift + r * 0.1, CY + r * 0.06, r * 0.4 * (0.4 + 0.6 * flash), glow);
        c.restore();
        // slanting rain
        c.strokeStyle = rgba(pal.rim, 0.55); c.lineWidth = Math.max(0.7, r * 0.014);
        c.beginPath();
        for (let i = 0; i < 12; i++) {
          const x = r * (0.02 + 0.09 * i) + drift, t = ts ? (ts / 700 + heroHash(i * 3.1)) % 1 : heroHash(i * 3.1);
          const y = -r * 0.76 + t * r * 1.1;
          c.moveTo(x - t * r * 0.08, y); c.lineTo(x - t * r * 0.08 - r * 0.03, y + r * 0.09);
        }
        c.stroke();
        // forked lightning
        const bolts = heroBolt(c, h, ts, r * 0.66, -r * 0.8, r * 0.8, -r * 0.6, Math.max(1, r * 0.024), PC_BOLT, 11, 4);
        heroBolt(c, h, ts, r * 0.98, -r * 0.82, r * 1.06, -r * 0.24, Math.max(1, r * 0.022), glow, 13, 5);
        heroBolt(c, h, ts, bolts[2][0], bolts[2][1], r * 0.98, -r * 0.62, Math.max(0.8, r * 0.016), PC_BOLT, 17, 3);
        // long wavy orange hair cascading behind the shoulders
        const hair = nbCloth(c, -r * 0.4, -r * 1.0, r * 0.4, r * 0.1, PC_ORANGE_HAIR), hs = ts ? Math.sin(ts / 500) * r * 0.025 : 0;
        c.beginPath(); c.moveTo(-r * 0.2, -r * 0.95);
        c.bezierCurveTo(-r * 0.44, -r * 0.9, -r * 0.42, -r * 0.55, -r * 0.34, -r * 0.35);
        c.bezierCurveTo(-r * 0.28, -r * 0.2, -r * 0.46 + hs, -r * 0.05, -r * 0.38 + hs, r * 0.1);
        c.quadraticCurveTo(-r * 0.3, r * 0.18, -r * 0.2, r * 0.06); c.lineTo(r * 0.2, r * 0.06);
        c.quadraticCurveTo(r * 0.3, r * 0.18, r * 0.38 + hs, r * 0.1);
        c.bezierCurveTo(r * 0.46 + hs, -r * 0.05, r * 0.28, -r * 0.2, r * 0.34, -r * 0.35);
        c.bezierCurveTo(r * 0.42, -r * 0.55, r * 0.44, -r * 0.9, r * 0.2, -r * 0.95);
        c.quadraticCurveTo(0, -r * 1.04, -r * 0.2, -r * 0.95); c.closePath(); fillInk(hair, 2);
        c.strokeStyle = "rgba(122,40,6,0.45)"; c.lineWidth = 1;
        c.beginPath();
        for (const sx of [-1, 1]) { c.moveTo(sx * r * 0.3, -r * 0.6); c.bezierCurveTo(sx * r * 0.36, -r * 0.4, sx * r * 0.26, -r * 0.2, sx * r * 0.34 + hs, 0); }
        c.stroke();
        // slender legs and sandals
        const skin = nbCloth(c, -r * 0.35, -r * 0.4, r * 0.35, r * 0.4, ["#ffe2c4", PC_SKIN, PC_TAN]);
        for (const sx of [-1, 1]) {
          poly([sx * 0.04, 0.5, sx * 0.22, 0.5, sx * 0.2, 1.03, sx * 0.1, 1.03]); fillInk(skin, 1.8);
          poly([sx * 0.06, 1.02, sx * 0.24, 1.02, sx * 0.26, 1.12, sx * 0.05, 1.12]); fillInk(nbCloth(c, 0, r, 0, r * 1.12, PC_LEATHER), 1.3);
          c.beginPath(); c.moveTo(sx * r * 0.1, r * 1.02); c.lineTo(sx * r * 0.15, r * 0.95); c.lineTo(sx * r * 0.2, r * 1.02);
          c.strokeStyle = "#6e4524"; c.lineWidth = Math.max(1, r * 0.02); c.stroke();
        }
        // side-coloured pleated skirt and brown belt
        c.beginPath(); c.moveTo(-r * 0.29, r * 0.26); c.lineTo(r * 0.29, r * 0.26); c.lineTo(r * 0.42, r * 0.6);
        c.quadraticCurveTo(0, r * 0.66, -r * 0.42, r * 0.6); c.closePath(); fillInk(pcSide(c, r, pal, -0.3, 0.26, 0.3, 0.64), 2);
        c.strokeStyle = "rgba(11,7,16,0.3)"; c.lineWidth = 1;
        c.beginPath(); for (const x of [-0.2, -0.07, 0.07, 0.2]) { c.moveTo(x * r, r * 0.3); c.lineTo(x * 1.35 * r, r * 0.62); } c.stroke();
        // slim torso, patterned top
        jlTorso(c, r, 0.34, 0.27, -0.42, 0.3); fillInk(skin, 2.2);
        c.beginPath(); c.ellipse(0, r * 0.14, r * 0.012, r * 0.02, 0, 0, TAU); c.fillStyle = "rgba(11,7,16,0.5)"; c.fill();
        for (const sx of [-1, 1]) {
          const cup = () => { c.beginPath(); c.moveTo(sx * r * 0.02, -r * 0.13); c.quadraticCurveTo(sx * r * 0.05, -r * 0.33, sx * r * 0.2, -r * 0.31); c.quadraticCurveTo(sx * r * 0.3, -r * 0.2, sx * r * 0.27, -r * 0.1); c.quadraticCurveTo(sx * r * 0.14, -r * 0.06, sx * r * 0.02, -r * 0.13); c.closePath(); };
          c.beginPath(); c.moveTo(sx * r * 0.12, -r * 0.3); c.lineTo(sx * r * 0.06, -r * 0.47); c.moveTo(sx * r * 0.27, -r * 0.12); c.lineTo(sx * r * 0.33, -r * 0.1);
          c.strokeStyle = "#1a3a8a"; c.lineWidth = Math.max(1, r * 0.018); c.stroke();
          cup(); fillInk(nbCloth(c, sx * r * 0.02, -r * 0.32, sx * r * 0.28, -r * 0.06, PC_BIKINI), 1.5);
          c.save(); cup(); c.clip();
          c.strokeStyle = "#ffd34a"; c.lineWidth = Math.max(0.8, r * 0.014);
          c.beginPath(); for (const k of [-0.24, -0.18, -0.12]) { c.moveTo(sx * r * 0.0, k * r); c.lineTo(sx * r * 0.3, (k - 0.06) * r); } c.stroke();
          c.restore();
        }
        rr(-r * 0.3, r * 0.23, r * 0.6, r * 0.06, r * 0.02); fillInk(nbCloth(c, 0, r * 0.23, 0, r * 0.29, PC_LEATHER), 1.3);
        rr(-r * 0.04, r * 0.22, r * 0.08, r * 0.08, r * 0.015); fillInk(h.metal(0, r * 0.22, 0, r * 0.3, ...SR_GOLD), 1);
        // hand on hip with a compass bracelet
        heroLimb(c, h, -r * 0.34, -r * 0.36, -r * 0.62, -r * 0.08, -r * 0.34, r * 0.22, Math.max(3.5, r * 0.13), skin);
        c.beginPath(); c.ellipse(-r * 0.32, r * 0.23, r * 0.06, r * 0.05, 0.4, 0, TAU); fillInk(PC_SKIN, 1.2);
        c.beginPath(); c.moveTo(-r * 0.47, r * 0.08); c.lineTo(-r * 0.39, r * 0.13);
        c.strokeStyle = h.INK; c.lineWidth = r * 0.04 + 2; c.stroke(); c.strokeStyle = "#6e4524"; c.lineWidth = r * 0.04; c.stroke();
        const LX = -r * 0.5, LY = r * 0.12;
        c.beginPath(); c.arc(LX, LY, r * 0.055, 0, TAU);
        const lg = c.createRadialGradient(LX - r * 0.02, LY - r * 0.02, 0, LX, LY, r * 0.055);
        lg.addColorStop(0, "#ffffff"); lg.addColorStop(0.5, rgba(pal.rim, 0.85)); lg.addColorStop(1, rgba(pal.bright, 0.9));
        fillInk(lg, 1.2);
        const na = ts ? Math.sin(ts / 600) * 0.4 - 0.8 : -0.8;
        c.beginPath(); c.moveTo(LX - Math.cos(na) * r * 0.035, LY - Math.sin(na) * r * 0.035); c.lineTo(LX + Math.cos(na) * r * 0.035, LY + Math.sin(na) * r * 0.035);
        c.strokeStyle = pal.deep; c.lineWidth = Math.max(0.8, r * 0.014); c.stroke();
        // staff arm and the three-segment sky-blue climate staff
        heroLimb(c, h, r * 0.34, -r * 0.36, r * 0.6, -r * 0.26, r * 0.5, -r * 0.02, Math.max(3.5, r * 0.13), skin);
        const S0 = [r * 0.3, r * 0.34], S1 = [r * 0.78, -r * 0.56];
        c.beginPath(); c.moveTo(S0[0], S0[1]); c.lineTo(S1[0], S1[1]);
        c.strokeStyle = h.INK; c.lineWidth = r * 0.065 + 2.4; c.stroke();
        c.strokeStyle = nbCloth(c, S0[0] - r * 0.04, 0, S0[0] + r * 0.04, 0, PC_SKY); c.lineWidth = r * 0.065; c.stroke();
        c.strokeStyle = "rgba(255,255,255,0.6)"; c.lineWidth = Math.max(0.7, r * 0.014);
        c.beginPath(); c.moveTo(S0[0] - r * 0.015, S0[1]); c.lineTo(S1[0] - r * 0.015, S1[1]); c.stroke();
        for (const t of [1 / 3, 2 / 3]) {
          const x = S0[0] + (S1[0] - S0[0]) * t, y = S0[1] + (S1[1] - S0[1]) * t;
          c.beginPath(); c.arc(x, y, r * 0.045, 0, TAU); fillInk(nbCloth(c, x - r * 0.04, y, x + r * 0.04, y, ["#3a4a6a", "#1a2236", "#0a0e18"]), 1.1);
        }
        c.beginPath(); c.arc(S0[0], S0[1], r * 0.04, 0, TAU); fillInk(PC_SKY[1], 1.1);
        glowOrb(S1[0], S1[1], r * (0.13 + 0.04 * p), glow);
        c.beginPath(); c.arc(S1[0], S1[1], r * 0.045, 0, TAU); fillInk(pal.rim, 1.1);
        c.beginPath(); c.ellipse(r * 0.5, -r * 0.02, r * 0.065, r * 0.055, -1.1, 0, TAU); fillInk(PC_SKIN, 1.2);
        // neck, face, wavy bangs and front locks
        rr(-r * 0.07, -r * 0.55, r * 0.14, r * 0.12, r * 0.04); fillInk(PC_SKIN, 1.4);
        nbFace(c, h, r, -0.68, 0.2, PC_SKIN);
        for (const sx of [-1, 1]) {
          nbEye(c, h, r, sx * r * 0.085, -r * 0.7, sx, "#b0601a");
          c.beginPath(); c.moveTo(sx * r * 0.16, -r * 0.715); c.lineTo(sx * r * 0.18, -r * 0.735);
          c.strokeStyle = h.INK; c.lineWidth = Math.max(1, r * 0.018); c.stroke();
        }
        c.beginPath(); c.moveTo(-r * 0.05, -r * 0.57); c.quadraticCurveTo(0, -r * 0.535, r * 0.05, -r * 0.57);
        c.strokeStyle = "rgba(11,7,16,0.75)"; c.lineWidth = 1.2; c.stroke();
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.72); c.quadraticCurveTo(-r * 0.24, -r * 1.0, 0, -r * 1.0); c.quadraticCurveTo(r * 0.24, -r * 1.0, r * 0.22, -r * 0.72);
        c.quadraticCurveTo(r * 0.16, -r * 0.84, r * 0.08, -r * 0.8); c.quadraticCurveTo(0, -r * 0.87, -r * 0.06, -r * 0.79);
        c.quadraticCurveTo(-r * 0.14, -r * 0.86, -r * 0.22, -r * 0.72); c.closePath(); fillInk(hair, 1.6);
        for (const sx of [-1, 1]) {
          nbStrip(c, nbBezierPts(sx * r * 0.2, -r * 0.78, sx * r * 0.27, -r * 0.62, sx * r * 0.2 + hs, -r * 0.48, sx * r * 0.27 + hs, -r * 0.32, 8), r * 0.08, r * 0.03);
          fillInk(hair, 1.2);
        }
        c.strokeStyle = "rgba(255,255,255,0.45)"; c.lineWidth = Math.max(0.8, r * 0.015);
        c.beginPath(); c.moveTo(-r * 0.12, -r * 0.93); c.quadraticCurveTo(0, -r * 0.97, r * 0.12, -r * 0.92); c.stroke();
      },

      /* High-Seas Marksman — plaid pirate bandana with brown goggles, a small button nose and confident smirk,
         overalls with a tool belt of leather pouches, and a heavy twin-fork slingshot drawn back on a glowing
         emerald botanical seed before a giant blooming star-flower of vines. */
      skirmisher(c, pal, r, ts, h) {
        const { fillInk, poly, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(180), glow = pcGlow(pal);
        // giant botanical star-flower bursting behind (base silhouette)
        const SX = -r * 0.3, SY = -r * 0.25, SR = r * 0.84, rot = ts ? Math.sin(ts / 1100) * 0.08 : 0;
        const tipA = (i) => -Math.PI / 2 + rot + i * TAU / 5;
        const pt = (a, k) => [SX + Math.cos(a) * SR * k, SY + Math.sin(a) * SR * k];
        c.beginPath(); c.moveTo(...pt(tipA(0), 1));
        for (let i = 0; i < 5; i++) {
          const a = tipA(i), st = Math.PI / 5;
          c.quadraticCurveTo(...pt(a + st * 0.5, 0.62), ...pt(a + st, 0.36));
          c.quadraticCurveTo(...pt(a + st * 1.5, 0.62), ...pt(a + 2 * st, 1));
        }
        c.closePath();
        const fg = c.createRadialGradient(SX, SY, 0, SX, SY, SR);
        fg.addColorStop(0, "#f0ffd8"); fg.addColorStop(0.25, PC_SEED); fg.addColorStop(0.65, pal.mid); fg.addColorStop(1, pal.deep);
        fillInk(fg, 2); c.shadowBlur = 0; // drop shadow only on the base silhouette
        c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = Math.max(0.8, r * 0.016);
        c.beginPath(); for (let i = 0; i < 5; i++) { c.moveTo(SX, SY); c.lineTo(...pt(tipA(i), 0.9)); } c.stroke();
        // curling vine tendrils with leaves
        for (let k = 0; k < 3; k++) {
          const a = tipA(k * 2 + 1) + 0.2, [x0, y0] = pt(a, 0.5);
          c.beginPath(); c.moveTo(x0, y0);
          for (let i = 1; i <= 16; i++) { const t = i / 16, rad = r * 0.16 * (1 - t * 0.7), aa = a + t * 7; c.lineTo(x0 + Math.cos(a) * r * 0.2 * t + Math.cos(aa) * rad * t, y0 + Math.sin(a) * r * 0.2 * t + Math.sin(aa) * rad * t); }
          c.strokeStyle = h.INK; c.lineWidth = Math.max(2, r * 0.045); c.stroke();
          c.strokeStyle = "#3fbf5e"; c.lineWidth = Math.max(1, r * 0.025); c.stroke();
          srPetal(c, x0, y0, r * 0.12, a - 0.9, "#4fd06a", h.INK);
        }
        // trousers and boots
        jlLegs(c, h, r, nbCloth(c, -r * 0.3, 0, r * 0.3, 0, PC_OVERALL), nbCloth(c, 0, r * 0.8, 0, r * 1.13, PC_LEATHER), 0.84);
        // striped shirt torso, overall bib with straps, side-coloured satchel strap
        const shirt = nbCloth(c, -r * 0.4, -r * 0.4, r * 0.4, r * 0.4, PC_OLIVE);
        const torso = () => jlTorso(c, r, 0.4, 0.3, -0.42, 0.38);
        torso(); fillInk(shirt, 2.4);
        c.save(); torso(); c.clip();
        c.strokeStyle = "rgba(60,40,10,0.35)"; c.lineWidth = Math.max(1, r * 0.03);
        c.beginPath(); for (let y = -0.38; y < 0.4; y += 0.09) { c.moveTo(-r * 0.6, y * r); c.lineTo(r * 0.6, y * r); } c.stroke();
        c.restore();
        const bib = nbCloth(c, -r * 0.25, -r * 0.2, r * 0.25, r * 0.4, PC_OVERALL);
        for (const sx of [-1, 1]) { poly([sx * 0.13, -0.2, sx * 0.2, -0.2, sx * 0.34, -0.44, sx * 0.26, -0.45]); fillInk(bib, 1.3); }
        poly([-0.2, -0.2, 0.2, -0.2, 0.26, 0.4, -0.26, 0.4]); fillInk(bib, 2);
        rr(-r * 0.1, -r * 0.08, r * 0.2, r * 0.12, r * 0.02); fillInk(PC_OVERALL[0], 1.1);
        for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 0.16, -r * 0.16, r * 0.025, 0, TAU); fillInk(SR_GOLD[1], 0.9); }
        nbStrip(c, [[-r * 0.38, -r * 0.42], [-r * 0.02, -r * 0.06], [r * 0.34, r * 0.3]], r * 0.07, r * 0.07);
        fillInk(pcSide(c, r, pal, -0.38, -0.42, 0.34, 0.3), 1.3);
        // tool belt with leather pouches
        rr(-r * 0.37, r * 0.27, r * 0.74, r * 0.08, r * 0.025); fillInk(nbCloth(c, 0, r * 0.27, 0, r * 0.35, PC_LEATHER), 1.3);
        for (const x of [-0.32, -0.1, 0.16]) {
          rr(x * r, r * 0.3, r * 0.15, r * 0.16, r * 0.03); fillInk(nbCloth(c, 0, r * 0.3, 0, r * 0.46, PC_LEATHER), 1.3);
          poly([x, 0.3, x + 0.15, 0.3, x + 0.13, 0.37, x + 0.02, 0.37]); fillInk(PC_LEATHER[0], 1);
          c.beginPath(); c.arc((x + 0.075) * r, r * 0.37, r * 0.015, 0, TAU); c.fillStyle = SR_GOLD[1]; c.fill();
        }
        // drawing arm pulled back, aiming arm extended to the slingshot
        const aw = Math.max(4, r * 0.16);
        heroLimb(c, h, -r * 0.38, -r * 0.36, -r * 0.74, -r * 0.52, -r * 0.44, -r * 0.32, aw, shirt);
        pcFist(c, h, -r * 0.42, -r * 0.3, r * 0.08, PC_TAN, 0.2);
        heroLimb(c, h, r * 0.38, -r * 0.36, r * 0.5, -r * 0.32, r * 0.58, -r * 0.27, aw, shirt);
        heroLimb(c, h, r * 0.56, -r * 0.28, r * 0.66, -r * 0.24, r * 0.76, -r * 0.2, aw * 0.85, PC_TAN);
        // forked slingshot: wooden handle, twin prongs, steel collar
        const wood = nbCloth(c, r * 0.7, 0, r * 0.9, 0, PC_WOOD);
        const fork = () => { c.beginPath(); c.moveTo(r * 0.8, r * 0.02); c.lineTo(r * 0.8, -r * 0.3); c.moveTo(r * 0.8, -r * 0.3); c.quadraticCurveTo(r * 0.68, -r * 0.36, r * 0.68, -r * 0.52); c.moveTo(r * 0.8, -r * 0.3); c.quadraticCurveTo(r * 0.94, -r * 0.34, r * 0.94, -r * 0.5); };
        fork(); c.strokeStyle = h.INK; c.lineWidth = r * 0.06 + 2.4; c.stroke();
        fork(); c.strokeStyle = wood; c.lineWidth = r * 0.06; c.stroke();
        rr(r * 0.76, -r * 0.33, r * 0.08, r * 0.06, r * 0.015); fillInk(h.metal(0, -r * 0.33, 0, -r * 0.27, ...PC_STEEL), 1);
        for (const x of [0.68, 0.94]) { c.beginPath(); c.arc(x * r, -r * 0.52, r * 0.03, 0, TAU); fillInk(h.metal(0, -r * 0.55, 0, -r * 0.49, ...PC_STEEL), 1); }
        pcFist(c, h, r * 0.8, -r * 0.17, r * 0.08, PC_TAN, -Math.PI / 2);
        // neck, curly hair, face
        rr(-r * 0.08, -r * 0.55, r * 0.16, r * 0.12, r * 0.04); fillInk(PC_TAN, 1.4);
        const hair = nbCloth(c, -r * 0.3, -r * 1.0, r * 0.3, -r * 0.6, PC_HAIR_BLACK);
        for (let i = 0; i <= 8; i++) { const a = Math.PI * (0.8 + 1.4 * i / 8); c.beginPath(); c.arc(Math.cos(a) * r * 0.24, -r * 0.76 + Math.sin(a) * r * 0.22, r * 0.08, 0, TAU); fillInk(hair, 1.2); }
        nbFace(c, h, r, -0.68, 0.2, PC_TAN);
        // confident eyes and brows looking down the sights
        for (const [x, sx] of [[-0.07, -1], [0.09, 1]]) {
          nbEye(c, h, r, x * r, -r * 0.7, sx, "#2a1a10");
          c.beginPath(); c.moveTo((x - 0.06) * r, -r * (sx < 0 ? 0.79 : 0.775)); c.quadraticCurveTo(x * r, -r * 0.81, (x + 0.06) * r, -r * (sx < 0 ? 0.775 : 0.79));
          c.strokeStyle = h.INK; c.lineWidth = Math.max(1.2, r * 0.024); c.stroke();
        }
        // small stylised button nose and lopsided smirk
        c.beginPath(); c.moveTo(r * 0.005, -r * 0.675); c.quadraticCurveTo(r * 0.045, -r * 0.635, r * 0.035, -r * 0.615);
        c.quadraticCurveTo(r * 0.01, -r * 0.6, -r * 0.02, -r * 0.615);
        c.strokeStyle = "rgba(90,48,24,0.75)"; c.lineWidth = Math.max(0.9, r * 0.016); c.stroke();
        c.beginPath(); c.arc(r * 0.018, -r * 0.64, r * 0.01, 0, TAU); c.fillStyle = "rgba(255,255,255,0.5)"; c.fill();
        c.beginPath(); c.moveTo(-r * 0.05, -r * 0.555); c.quadraticCurveTo(r * 0.04, -r * 0.55, r * 0.1, -r * 0.59); c.moveTo(r * 0.09, -r * 0.6); c.lineTo(r * 0.11, -r * 0.58);
        c.strokeStyle = "rgba(11,7,16,0.75)"; c.lineWidth = 1.2; c.stroke();
        // plaid bandana with a knot and brown goggles pushed up
        const band = () => { c.beginPath(); c.moveTo(-r * 0.21, -r * 0.78); c.bezierCurveTo(-r * 0.24, -r * 1.04, r * 0.24, -r * 1.04, r * 0.21, -r * 0.78); c.quadraticCurveTo(0, -r * 0.84, -r * 0.21, -r * 0.78); c.closePath(); };
        nbStrip(c, nbBezierPts(-r * 0.2, -r * 0.86, -r * 0.3, -r * 0.88, -r * 0.36, -r * 0.78, -r * 0.42, -r * 0.72, 6), r * 0.07, r * 0.03); fillInk(PC_OLIVE[1], 1.1);
        band(); fillInk(nbCloth(c, -r * 0.2, -r * 1.0, r * 0.2, -r * 0.78, PC_OLIVE), 1.8);
        c.save(); band(); c.clip();
        c.strokeStyle = "rgba(40,30,8,0.45)"; c.lineWidth = Math.max(0.8, r * 0.016);
        c.beginPath(); for (let x = -0.2; x <= 0.21; x += 0.07) { c.moveTo(x * r, -r * 1.0); c.lineTo(x * r, -r * 0.76); } for (const y of [-0.94, -0.88]) { c.moveTo(-r * 0.3, y * r); c.lineTo(r * 0.3, y * r); } c.stroke();
        c.strokeStyle = rgba(pal.bright, 0.5); c.lineWidth = Math.max(0.6, r * 0.01);
        c.beginPath(); for (let x = -0.165; x <= 0.21; x += 0.07) { c.moveTo(x * r, -r * 1.0); c.lineTo(x * r, -r * 0.76); } c.stroke();
        c.restore();
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.82); c.quadraticCurveTo(0, -r * 0.88, r * 0.22, -r * 0.82);
        c.strokeStyle = h.INK; c.lineWidth = r * 0.035 + 2; c.stroke(); c.strokeStyle = "#5a3a1c"; c.lineWidth = r * 0.035; c.stroke();
        for (const sx of [-1, 1]) {
          const gx = sx * r * 0.085, gy = -r * 0.86;
          c.beginPath(); c.arc(gx, gy, r * 0.06, 0, TAU); fillInk(nbCloth(c, gx, gy - r * 0.06, gx, gy + r * 0.06, PC_LEATHER), 1.4);
          c.beginPath(); c.arc(gx, gy, r * 0.04, 0, TAU);
          const lg = c.createRadialGradient(gx - r * 0.015, gy - r * 0.015, 0, gx, gy, r * 0.04);
          lg.addColorStop(0, "#ffffff"); lg.addColorStop(0.4, rgba(pal.rim, 0.9)); lg.addColorStop(1, "#5a3a1c");
          c.fillStyle = lg; c.fill();
        }
        // taut bands, leather pouch and the glowing emerald exploding seed
        const pull = ts ? Math.sin(ts / 420) * r * 0.02 : 0, PX = -r * 0.33 + pull, PY = -r * 0.31;
        c.beginPath(); c.moveTo(r * 0.68, -r * 0.52); c.lineTo(PX, PY - r * 0.02); c.moveTo(r * 0.94, -r * 0.5); c.lineTo(PX, PY + r * 0.02);
        c.strokeStyle = h.INK; c.lineWidth = Math.max(1.8, r * 0.03); c.stroke();
        c.strokeStyle = "#c9a06a"; c.lineWidth = Math.max(0.8, r * 0.014); c.stroke();
        c.beginPath(); c.ellipse(PX - r * 0.02, PY, r * 0.05, r * 0.07, 0, 0, TAU); fillInk(PC_LEATHER[1], 1.2);
        glowOrb(PX + r * 0.03, PY, r * (0.16 + 0.05 * p), glow);
        c.save(); c.globalCompositeOperation = "lighter";
        c.strokeStyle = rgba(PC_SEED, 0.7); c.lineWidth = Math.max(0.8, r * 0.015);
        c.beginPath();
        for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + (ts ? ts / 500 : 0), R0 = r * 0.08, R1 = r * (0.14 + 0.04 * p + 0.03 * (i % 2)); c.moveTo(PX + r * 0.03 + Math.cos(a) * R0, PY + Math.sin(a) * R0); c.lineTo(PX + r * 0.03 + Math.cos(a) * R1, PY + Math.sin(a) * R1); }
        c.stroke();
        c.restore();
        const sg = c.createRadialGradient(PX + r * 0.015, PY - r * 0.02, 0, PX + r * 0.03, PY, r * 0.06);
        sg.addColorStop(0, "#ffffff"); sg.addColorStop(0.45, PC_SEED); sg.addColorStop(1, "#0b6a2a");
        c.beginPath(); c.arc(PX + r * 0.03, PY, r * 0.06, 0, TAU); fillInk(sg, 1.2);
        srPetal(c, PX + r * 0.05, PY - r * 0.05, r * 0.07, -1.2, "#4fd06a", h.INK);
      },

      /* Skeleton Minstrel — grinning cracked skull under a voluminous black afro, round dark shades, purple cravat,
         black swallow-tail coat over a side-coloured waistcoat, playing a violin amid drifting translucent
         spirit wisps and floating musical notes and clefs. */
      harrower(c, pal, r, ts, h) {
        const { fillInk, poly, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(300), glow = pcGlow(pal), sway = ts ? Math.sin(ts / 600) * r * 0.025 : 0;
        // swallow-tail coat back (base silhouette)
        srCoatBack(c, r, 0.4, 0.6, 1.08, sway, { n: 4, depth: 0.34, seed: 7 }); fillInk(srDark(c, r, pal), 2.4);
        c.shadowBlur = 0; // drop shadow only on the base silhouette
        // spectral soul wisps drifting behind
        const wisps = [[-0.82, -0.5], [0.86, -0.15], [-0.9, 0.35], [0.8, 0.58], [-0.55, -0.92]];
        for (let i = 0; i < wisps.length; i++) {
          const t = ts ? ts / 1300 + i * 1.3 : i, [x, y] = wisps[i];
          pcWisp(c, x * r + Math.sin(t) * r * 0.04, y * r + Math.cos(t * 0.8) * r * 0.05, r * 0.11, Math.sin(t) * 0.25, i % 2 ? glow : PC_SPIRIT, 0.55 + 0.25 * p);
        }
        // skinny trousers and pointed shoes
        for (const sx of [-1, 1]) {
          poly([sx * 0.05, 0.38, sx * 0.21, 0.38, sx * 0.19, 1.02, sx * 0.09, 1.02]); fillInk(nbCloth(c, 0, r * 0.4, 0, r, PC_SUIT), 1.8);
          poly([sx * 0.06, 1.02, sx * 0.21, 1.02, sx * 0.32, 1.1, sx * 0.05, 1.12]); fillInk(nbCloth(c, 0, r, 0, r * 1.12, ["#5a5f72", "#14151d", "#000000"]), 1.4);
        }
        // coat torso, side-coloured waistcoat, shirt front, silk-edged lapels
        const coat = srDark(c, r, pal);
        jlTorso(c, r, 0.36, 0.25, -0.42, 0.38); fillInk(coat, 2.4);
        poly([-0.13, -0.42, 0.13, -0.42, 0.16, 0.32, 0, 0.4, -0.16, 0.32]); fillInk(pcSide(c, r, pal, -0.15, -0.4, 0.15, 0.4), 1.6);
        for (const y of [-0.1, 0.04, 0.18]) { c.beginPath(); c.arc(0, y * r, r * 0.022, 0, TAU); fillInk(SR_GOLD[1], 0.8); }
        poly([-0.08, -0.47, 0.08, -0.47, 0, -0.24]); fillInk("#f6f4ee", 1.2);
        for (const sx of [-1, 1]) {
          poly([sx * 0.2, -0.45, sx * 0.1, -0.46, sx * 0.15, -0.05, sx * 0.24, -0.2]); fillInk("#0a0b10", 1.3);
          c.beginPath(); c.moveTo(sx * r * 0.1, -r * 0.46); c.lineTo(sx * r * 0.15, -r * 0.05);
          c.strokeStyle = rgba(pal.rim, 0.85); c.lineWidth = Math.max(1, r * 0.018); c.stroke();
        }
        // purple cravat
        const cv = nbCloth(c, -r * 0.1, -r * 0.5, r * 0.1, -r * 0.28, PC_CRAVAT);
        poly([0, -0.46, -0.1, -0.52, -0.11, -0.4]); fillInk(cv, 1.1);
        poly([0, -0.46, 0.1, -0.52, 0.11, -0.4]); fillInk(cv, 1.1);
        c.beginPath(); c.moveTo(-r * 0.04, -r * 0.45); c.quadraticCurveTo(-r * 0.08, -r * 0.34, -r * 0.03, -r * 0.27); c.lineTo(r * 0.03, -r * 0.27);
        c.quadraticCurveTo(r * 0.08, -r * 0.34, r * 0.04, -r * 0.45); c.closePath(); fillInk(cv, 1.1);
        c.beginPath(); c.arc(0, -r * 0.46, r * 0.03, 0, TAU); fillInk(PC_CRAVAT[1], 1);
        // bow arm and fretting arm (skinny coat sleeves)
        const aw = Math.max(3.5, r * 0.13);
        heroLimb(c, h, -r * 0.34, -r * 0.36, -r * 0.66, 0, -r * 0.26, r * 0.07, aw, coat);
        heroLimb(c, h, r * 0.34, -r * 0.36, r * 0.7, -r * 0.18, r * 0.8, -r * 0.5, aw, coat);
        // violin tucked under the jaw
        c.save(); c.translate(r * 0.36, -r * 0.36); c.rotate(-0.35);
        const body = () => {
          c.beginPath(); c.moveTo(-r * 0.19, 0);
          c.bezierCurveTo(-r * 0.19, -r * 0.13, -r * 0.06, -r * 0.12, -r * 0.03, -r * 0.07);
          c.bezierCurveTo(0, -r * 0.05, r * 0.03, -r * 0.05, r * 0.05, -r * 0.075);
          c.bezierCurveTo(r * 0.08, -r * 0.11, r * 0.17, -r * 0.1, r * 0.17, 0);
          c.bezierCurveTo(r * 0.17, r * 0.1, r * 0.08, r * 0.11, r * 0.05, r * 0.075);
          c.bezierCurveTo(r * 0.03, r * 0.05, 0, r * 0.05, -r * 0.03, r * 0.07);
          c.bezierCurveTo(-r * 0.06, r * 0.12, -r * 0.19, r * 0.13, -r * 0.19, 0); c.closePath();
        };
        body(); fillInk(nbCloth(c, 0, -r * 0.12, 0, r * 0.12, PC_WOOD), 1.8);
        c.strokeStyle = "rgba(11,7,16,0.7)"; c.lineWidth = Math.max(0.7, r * 0.012);
        for (const sy of [-1, 1]) { c.beginPath(); c.moveTo(-r * 0.04, sy * r * 0.05); c.bezierCurveTo(-r * 0.01, sy * r * 0.07, r * 0.0, sy * r * 0.03, r * 0.03, sy * r * 0.05); c.stroke(); }
        rr(-r * 0.04, -r * 0.018, r * 0.5, r * 0.036, r * 0.01); fillInk("#16131c", 1);
        rr(-r * 0.17, -r * 0.03, r * 0.07, r * 0.06, r * 0.015); fillInk("#16131c", 0.9);
        c.beginPath(); c.arc(r * 0.51, 0, r * 0.035, 0, TAU); fillInk(PC_WOOD[1], 1.1);
        c.beginPath(); c.arc(r * 0.51, 0, r * 0.016, 0, TAU * 0.8); c.strokeStyle = h.INK; c.lineWidth = 0.9; c.stroke();
        for (const x of [0.43, 0.47]) for (const sy of [-1, 1]) { c.beginPath(); c.moveTo(x * r, sy * r * 0.015); c.lineTo(x * r, sy * r * 0.045); c.strokeStyle = h.INK; c.lineWidth = Math.max(1.4, r * 0.02); c.stroke(); }
        rr(-r * 0.075, -r * 0.035, r * 0.015, r * 0.07, r * 0.004); fillInk("#f0d9a8", 0.7);
        c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = 0.6;
        c.beginPath(); for (const y of [-0.012, -0.004, 0.004, 0.012]) { c.moveTo(-r * 0.12, y * r); c.lineTo(r * 0.44, y * r); } c.stroke();
        c.beginPath(); c.ellipse(r * 0.08, -r * 0.05, r * 0.05, r * 0.015, 0, 0, TAU); c.fillStyle = "rgba(255,255,255,0.35)"; c.fill();
        c.restore();
        // gloved fretting fingers on the neck
        c.beginPath(); c.ellipse(r * 0.8, -r * 0.5, r * 0.055, r * 0.045, -0.35, 0, TAU); fillInk("#f4f2ec", 1.2);
        // bow sawing across the strings
        const bo = ts ? Math.sin(ts / 260) * r * 0.06 : 0, bdx = 0.817, bdy = -0.576;
        const B0 = [-r * 0.3 + bdx * bo, r * 0.1 + bdy * bo], B1 = [r * 0.76 + bdx * bo, -r * 0.65 + bdy * bo];
        c.beginPath(); c.moveTo(B0[0], B0[1]); c.lineTo(B1[0], B1[1]);
        c.strokeStyle = h.INK; c.lineWidth = Math.max(2.4, r * 0.025 + 2); c.stroke();
        c.strokeStyle = "#8a4a1a"; c.lineWidth = Math.max(1, r * 0.022); c.stroke();
        c.beginPath(); c.moveTo(B0[0] + r * 0.02, B0[1] + r * 0.028); c.lineTo(B1[0] + r * 0.006, B1[1] + r * 0.01);
        c.strokeStyle = "rgba(255,250,235,0.85)"; c.lineWidth = Math.max(0.7, r * 0.01); c.stroke();
        c.beginPath(); c.ellipse(-r * 0.26, r * 0.07, r * 0.06, r * 0.05, 0.3, 0, TAU); fillInk("#f4f2ec", 1.2);
        // voluminous afro
        const hair = c.createRadialGradient(-r * 0.1, -r * 0.95, r * 0.05, 0, -r * 0.84, r * 0.34);
        hair.addColorStop(0, PC_HAIR_BLACK[0]); hair.addColorStop(0.5, PC_HAIR_BLACK[1]); hair.addColorStop(1, PC_HAIR_BLACK[2]);
        const N = 18, AR = r * 0.31, ACY = -r * 0.84;
        c.beginPath(); c.moveTo(AR, ACY);
        for (let i = 0; i < N; i++) {
          const a0 = i * TAU / N, a1 = (i + 1) * TAU / N, am = (a0 + a1) / 2;
          c.quadraticCurveTo(Math.cos(am) * AR * 1.1, ACY + Math.sin(am) * AR * 1.1, Math.cos(a1) * AR, ACY + Math.sin(a1) * AR);
        }
        c.closePath(); fillInk(hair, 2);
        c.strokeStyle = "rgba(255,255,255,0.12)"; c.lineWidth = 1;
        for (const [x, y] of [[-0.14, -1.0], [0.08, -1.06], [0.18, -0.9], [-0.2, -0.82]]) { c.beginPath(); c.arc(x * r, y * r, r * 0.04, 0.5, 2.8); c.stroke(); }
        // grinning skull: cranium, jaw, cheekbones
        const bone = nbCloth(c, -r * 0.2, -r * 0.9, r * 0.2, -r * 0.48, PC_BONE);
        c.beginPath(); c.moveTo(-r * 0.19, -r * 0.7);
        c.bezierCurveTo(-r * 0.2, -r * 0.96, r * 0.2, -r * 0.96, r * 0.19, -r * 0.7);
        c.quadraticCurveTo(r * 0.18, -r * 0.6, r * 0.12, -r * 0.57); c.lineTo(r * 0.11, -r * 0.49);
        c.quadraticCurveTo(0, -r * 0.46, -r * 0.11, -r * 0.49); c.lineTo(-r * 0.12, -r * 0.57);
        c.quadraticCurveTo(-r * 0.18, -r * 0.6, -r * 0.19, -r * 0.7); c.closePath(); fillInk(bone, 2);
        c.beginPath(); c.moveTo(-r * 0.19, -r * 0.74); c.quadraticCurveTo(-r * 0.1, -r * 0.88, 0, -r * 0.88); c.quadraticCurveTo(r * 0.1, -r * 0.88, r * 0.19, -r * 0.74);
        c.lineTo(r * 0.22, -r * 0.94); c.lineTo(-r * 0.22, -r * 0.94); c.closePath(); c.fillStyle = hair; c.fill();
        c.beginPath(); c.moveTo(-r * 0.19, -r * 0.74); c.quadraticCurveTo(-r * 0.1, -r * 0.88, 0, -r * 0.88); c.quadraticCurveTo(r * 0.1, -r * 0.88, r * 0.19, -r * 0.74);
        c.strokeStyle = h.INK; c.lineWidth = 1.6; c.stroke();
        c.beginPath(); c.moveTo(r * 0.03, -r * 0.865); c.lineTo(r * 0.07, -r * 0.82); c.lineTo(r * 0.04, -r * 0.79); c.lineTo(r * 0.065, -r * 0.765);
        c.strokeStyle = "rgba(11,7,16,0.8)"; c.lineWidth = Math.max(0.9, r * 0.016); c.stroke();
        c.strokeStyle = "rgba(11,7,16,0.3)"; c.lineWidth = 1;
        for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * r * 0.17, -r * 0.62); c.quadraticCurveTo(sx * r * 0.13, -r * 0.6, sx * r * 0.11, -r * 0.55); c.stroke(); }
        // round dark shades with side-coloured glints
        for (const sx of [-1, 1]) {
          const gx = sx * r * 0.08, gy = -r * 0.71;
          c.beginPath(); c.arc(gx, gy, r * 0.065, 0, TAU); fillInk(nbCloth(c, gx, gy - r * 0.065, gx, gy + r * 0.065, ["#3a3f52", "#0b0c12", pal.deep]), 1.4);
          c.beginPath(); c.arc(gx, gy, r * 0.045, Math.PI * 1.1, Math.PI * 1.45); c.strokeStyle = rgba(pal.rim, 0.9); c.lineWidth = Math.max(1, r * 0.016); c.stroke();
        }
        c.beginPath(); c.moveTo(-r * 0.015, -r * 0.72); c.quadraticCurveTo(0, -r * 0.735, r * 0.015, -r * 0.72); c.strokeStyle = h.INK; c.lineWidth = 1.2; c.stroke();
        // nasal cavity and toothy grin
        poly([0, -0.66, 0.03, -0.6, 0, -0.615, -0.03, -0.6]); fillInk("#1a1420", 1);
        rr(-r * 0.1, -r * 0.585, r * 0.2, r * 0.06, r * 0.015); fillInk("#fbf7ef", 1.3);
        c.strokeStyle = "rgba(11,7,16,0.65)"; c.lineWidth = 0.9;
        c.beginPath(); c.moveTo(-r * 0.1, -r * 0.555); c.lineTo(r * 0.1, -r * 0.555);
        for (let x = -0.075; x <= 0.08; x += 0.025) { c.moveTo(x * r, -r * 0.585); c.lineTo(x * r, -r * 0.525); }
        c.stroke();
        // floating notes and a clef
        const notes = [[-0.84, -0.18], [0.94, -0.62], [-0.98, 0.72], [0.6, 0.86], [0.98, 0.26]];
        for (let i = 0; i < notes.length; i++) {
          const t = ts ? ts / 900 + i * 1.7 : i, [x, y] = notes[i], col = i % 2 ? PC_SPIRIT : glow;
          const nx = x * r + Math.sin(t) * r * 0.03, ny = y * r + Math.sin(t * 1.3) * r * 0.04;
          glowOrb(nx, ny - r * 0.06, r * 0.1, col);
          pcNote(c, nx, ny, r * 0.07, Math.sin(t) * 0.25, col);
        }
        const ct = ts ? ts / 1100 : 0;
        glowOrb(-r * 0.66, -r * 0.82 + Math.sin(ct) * r * 0.03, r * 0.13, glow);
        pcClef(c, -r * 0.66, -r * 0.82 + Math.sin(ct) * r * 0.03, r * 0.1, rgba(PC_SPIRIT, 0.95));
        pcWisp(c, r * 0.5, r * 0.98, r * 0.09, ts ? Math.sin(ts / 700) * 0.3 : 0.2, PC_SPIRIT, 0.6 + 0.2 * p);
      },

      /* Reindeer Physician — a cute antlered little reindeer physician with a blue nose, fluffy cheeks and a
         brown leather voyager's cap with ear flaps and a side-coloured crest, bursting into a hulking horned
         monster form with glowing eyes, fangs and giant claws above a rumbling shockwave crater. */
      fury(c, pal, r, ts, h) {
        const { fillInk, poly, glowOrb, pulse, rgba, rr } = h;
        const p = pulse(130), glow = pcGlow(pal), shake = ts ? Math.sin(ts / 45) * r * 0.008 : 0;
        // hulking monster-form silhouette (base silhouette)
        const furG = c.createRadialGradient(r * 0.15, -r * 0.35, r * 0.1, r * 0.05, 0, r * 0.9);
        furG.addColorStop(0, pal.mid); furG.addColorStop(0.5, "#4a2a16"); furG.addColorStop(1, pal.deep);
        const bodyPath = () => pcFurBlob(c, r * 0.05 + shake, r * 0.02, r * 0.8, r * 0.74, 16, 0.12, 5);
        bodyPath(); fillInk(furG, 2.4); c.shadowBlur = 0; // drop shadow only on the base silhouette
        c.save(); c.globalCompositeOperation = "lighter";
        bodyPath(); c.strokeStyle = rgba(pal.rim, 0.35 + 0.25 * p); c.lineWidth = Math.max(1.2, r * 0.03); c.stroke();
        c.restore();
        c.strokeStyle = "rgba(255,255,255,0.12)"; c.lineWidth = 1;
        c.beginPath();
        for (let i = 0; i < 12; i++) { const x = (-0.6 + heroHash(i * 2.1) * 1.3) * r, y = (-0.5 + heroHash(i * 5.7) * 1.0) * r; c.moveTo(x, y); c.quadraticCurveTo(x + r * 0.03, y + r * 0.05, x, y + r * 0.1); }
        c.stroke();
        // giant clawed arms
        for (const [sx, x0, cx, x1, y1] of [[-1, -0.55, -1.05, -0.95, 0.25], [1, 0.66, 1.1, 1.0, 0.15]]) {
          heroLimb(c, h, x0 * r, -r * 0.25, cx * r, -r * 0.28, x1 * r, y1 * r, Math.max(6, r * 0.24), furG);
          c.beginPath(); c.ellipse(x1 * r, (y1 + 0.04) * r, r * 0.13, r * 0.1, 0, 0, TAU); fillInk(furG, 1.6);
          for (let k = -1; k <= 1; k++) {
            const bx = (x1 + k * 0.07) * r, by = (y1 + 0.1) * r, tx = bx + (sx * 0.05 + k * 0.03) * r, ty = by + r * 0.14;
            c.beginPath(); c.moveTo(bx - r * 0.025, by); c.quadraticCurveTo(bx - r * 0.02, by + r * 0.1, tx, ty); c.quadraticCurveTo(bx + r * 0.03, by + r * 0.06, bx + r * 0.025, by); c.closePath();
            fillInk(nbCloth(c, bx, by, bx, ty, PC_BONE), 1.1);
          }
        }
        // branching monster antlers and the snarling head
        const aw = Math.max(3, r * 0.08), ant = nbCloth(c, 0, -r * 1.15, 0, -r * 0.75, PC_ANTLER);
        pcAntler(c, h, [[0.16 * r, -0.78 * r], [0.02 * r, -0.96 * r], [-0.26 * r, -1.1 * r]], [[0.02 * r, -0.96 * r, 0.0, -1.16 * r], [-0.12 * r, -1.03 * r, -0.3 * r, -0.94 * r]], aw, ant);
        pcAntler(c, h, [[0.46 * r, -0.78 * r], [0.62 * r, -0.96 * r], [0.9 * r, -1.08 * r]], [[0.62 * r, -0.96 * r, 0.66 * r, -1.16 * r], [0.76 * r, -1.02 * r, 0.96 * r, -0.92 * r]], aw, ant);
        pcFurBlob(c, r * 0.3 + shake, -r * 0.6, r * 0.3, r * 0.26, 12, 0.15, 9); fillInk(furG, 2);
        poly([0.12, -0.72, 0.28, -0.68, 0.32, -0.7, 0.48, -0.74, 0.44, -0.66, 0.16, -0.64]); fillInk("#2a170c", 1.1);
        for (const ex of [0.22, 0.4]) {
          const sx = ex < 0.3 ? -1 : 1;
          poly([ex - 0.05, -0.66 + (sx < 0 ? -0.01 : 0.01), ex + 0.05, -0.66 + (sx < 0 ? 0.01 : -0.01), ex + 0.03, -0.63, ex - 0.03, -0.63]);
          c.fillStyle = pal.bright; c.fill();
          glowOrb(ex * r, -r * 0.645, r * (0.06 + 0.03 * p), glow);
        }
        c.beginPath(); c.ellipse(r * 0.31, -r * 0.585, r * 0.045, r * 0.032, 0, 0, TAU); fillInk(PC_NOSE_BLUE, 1.1);
        const maw = () => { c.beginPath(); c.moveTo(r * 0.16, -r * 0.53); c.quadraticCurveTo(r * 0.31, -r * 0.57, r * 0.46, -r * 0.53); c.quadraticCurveTo(r * 0.44, -r * 0.38, r * 0.31, -r * 0.37); c.quadraticCurveTo(r * 0.18, -r * 0.38, r * 0.16, -r * 0.53); c.closePath(); };
        maw(); fillInk("#4a0812", 1.4);
        c.save(); maw(); c.clip();
        c.fillStyle = "#fbf7ef";
        for (let i = 0; i < 5; i++) { const x = 0.19 + i * 0.06; poly([x - 0.025, -0.56, x + 0.025, -0.56, x, -0.48]); c.fill(); poly([x + 0.005, -0.36, x + 0.045, -0.36, x + 0.025, -0.43]); c.fill(); }
        c.restore();
        // rumbling shockwave crater with flying debris
        c.beginPath(); c.ellipse(0, r * 1.02, r * 0.92, r * 0.13, 0, 0, TAU);
        fillInk(nbCloth(c, 0, r * 0.9, 0, r * 1.15, ["#6a5a4a", "#3a2e24", "#16100c"]), 1.8);
        c.beginPath(); c.ellipse(-r * 0.05, r * 1.03, r * 0.6, r * 0.07, 0, 0, TAU); c.fillStyle = "rgba(11,7,16,0.55)"; c.fill();
        c.strokeStyle = rgba(glow, 0.7); c.lineWidth = Math.max(0.8, r * 0.015);
        c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + 0.3; c.moveTo(-r * 0.05 + Math.cos(a) * r * 0.3, r * 1.03 + Math.sin(a) * r * 0.04); c.lineTo(-r * 0.05 + Math.cos(a) * r * 0.85, r * 1.03 + Math.sin(a) * r * 0.11); } c.stroke();
        c.save(); c.globalCompositeOperation = "lighter";
        for (let k = 0; k < 3; k++) {
          const t = ts ? (ts / 1100 + k / 3) % 1 : k / 3 + 0.15, rx = r * (0.35 + 0.75 * t);
          c.beginPath(); c.ellipse(-r * 0.12, r * 1.0, rx, rx * 0.15, 0, 0, TAU);
          c.strokeStyle = rgba(pal.bright, 0.7 * (1 - t)); c.lineWidth = Math.max(1, r * 0.03 * (1 - t * 0.5)); c.stroke();
        }
        c.restore();
        for (let i = 0; i < 6; i++) {
          const t = ts ? (ts / 900 + i / 6) % 1 : i / 6, x = (-0.8 + 1.5 * heroHash(i * 3.9)) * r, y = r * 1.0 - Math.sin(t * Math.PI) * r * 0.35, s = r * (0.03 + 0.02 * heroHash(i));
          poly([x / r - s / r, y / r, x / r, y / r - s / r, x / r + s / r, y / r - s * 0.2 / r, x / r + s * 0.4 / r, y / r + s * 0.8 / r]); fillInk("#6a5a4a", 0.8);
        }
        // transformation surge: glow, rays and rings bursting from the little doctor
        const MX = -r * 0.16, MY = r * 0.45;
        glowOrb(MX, MY, r * (0.5 + 0.08 * p), glow);
        c.save(); c.globalCompositeOperation = "lighter";
        c.strokeStyle = rgba(pal.rim, 0.55); c.lineWidth = Math.max(1, r * 0.02);
        c.beginPath();
        for (let i = 0; i < 10; i++) { const a = -Math.PI * 0.95 + i * Math.PI * 0.9 / 9 + (ts ? Math.sin(ts / 200 + i) * 0.05 : 0), R0 = r * 0.42, R1 = r * (0.62 + 0.1 * heroHash(i)); c.moveTo(MX + Math.cos(a) * R0, MY + Math.sin(a) * R0); c.lineTo(MX + Math.cos(a) * R1, MY + Math.sin(a) * R1); }
        c.stroke();
        const ring = ts ? (ts / 700) % 1 : 0.5;
        c.beginPath(); c.arc(MX, MY, r * (0.3 + 0.3 * ring), 0, TAU); c.strokeStyle = rgba(glow, 0.6 * (1 - ring)); c.lineWidth = Math.max(1, r * 0.03); c.stroke();
        c.restore();
        // the little doctor: hooves, shorts, round furry body, raised arms
        const fur = nbCloth(c, MX - r * 0.2, r * 0.2, MX + r * 0.2, r * 1.0, PC_FUR);
        for (const sx of [-1, 1]) {
          rr(MX + sx * r * 0.09 - r * 0.06, r * 0.84, r * 0.12, r * 0.18, r * 0.04); fillInk(fur, 1.4);
          rr(MX + sx * r * 0.09 - r * 0.07, r * 1.0, r * 0.14, r * 0.1, r * 0.03); fillInk("#2a1a10", 1.2);
          heroLimb(c, h, MX + sx * r * 0.16, r * 0.6, MX + sx * r * 0.3, r * 0.58, MX + sx * r * 0.33, r * 0.44, Math.max(3, r * 0.09), fur);
          c.beginPath(); c.ellipse(MX + sx * r * 0.33, r * 0.42, r * 0.045, r * 0.04, 0, 0, TAU); fillInk("#2a1a10", 1);
        }
        c.beginPath(); c.ellipse(MX, r * 0.66, r * 0.2, r * 0.17, 0, 0, TAU); fillInk(fur, 1.8);
        rr(MX - r * 0.2, r * 0.7, r * 0.4, r * 0.17, r * 0.05); fillInk(nbCloth(c, 0, r * 0.7, 0, r * 0.87, PC_DENIM), 1.5);
        // fluffy cheeks, face, big eyes, blue nose
        pcFurBlob(c, MX, r * 0.37, r * 0.25, r * 0.2, 10, 0.18, 3); fillInk(fur, 1.6);
        c.beginPath(); c.ellipse(MX, r * 0.38, r * 0.19, r * 0.15, 0, 0, TAU); fillInk(nbCloth(c, 0, r * 0.24, 0, r * 0.52, ["#fff0d8", "#f2d2a4", "#c8945a"]), 1.4);
        for (const sx of [-1, 1]) {
          c.beginPath(); c.ellipse(MX + sx * r * 0.075, r * 0.34, r * 0.035, r * 0.05, 0, 0, TAU); c.fillStyle = "#120c14"; c.fill();
          c.beginPath(); c.arc(MX + sx * r * 0.075 - r * 0.012, r * 0.325, r * 0.014, 0, TAU); c.fillStyle = "#ffffff"; c.fill();
          c.beginPath(); c.ellipse(MX + sx * r * 0.13, r * 0.41, r * 0.03, r * 0.015, 0, 0, TAU); c.fillStyle = "rgba(255,120,150,0.45)"; c.fill();
        }
        c.beginPath(); c.ellipse(MX, r * 0.41, r * 0.04, r * 0.03, 0, 0, TAU); fillInk(PC_NOSE_BLUE, 1.1);
        c.beginPath(); c.arc(MX - r * 0.012, r * 0.4, r * 0.01, 0, TAU); c.fillStyle = "#ffffff"; c.fill();
        c.beginPath(); c.moveTo(MX - r * 0.04, r * 0.46); c.quadraticCurveTo(MX - r * 0.02, r * 0.49, MX, r * 0.46); c.quadraticCurveTo(MX + r * 0.02, r * 0.49, MX + r * 0.04, r * 0.46);
        c.strokeStyle = h.INK; c.lineWidth = 1.1; c.stroke();
        // little antlers poking out of a brown leather voyager's cap with ear flaps and a side-coloured crest
        const lw = Math.max(2, r * 0.045);
        for (const sx of [-1, 1]) pcAntler(c, h, [[MX + sx * r * 0.2, r * 0.08], [MX + sx * r * 0.32, -r * 0.04], [MX + sx * r * 0.4, -r * 0.18]], [[MX + sx * r * 0.32, -r * 0.04, MX + sx * r * 0.45, -r * 0.03]], lw, ant);
        const cap = nbCloth(c, MX - r * 0.2, -r * 0.05, MX + r * 0.25, r * 0.3, PC_LEATHER);
        for (const sx of [-1, 1]) { rr(MX + sx * r * 0.21 - r * 0.05, r * 0.16, r * 0.1, r * 0.15, r * 0.045); fillInk(cap, 1.4); }
        const dome = () => { c.beginPath(); c.moveTo(MX - r * 0.26, r * 0.22); c.bezierCurveTo(MX - r * 0.28, -r * 0.08, MX + r * 0.28, -r * 0.08, MX + r * 0.26, r * 0.22); c.closePath(); };
        dome(); fillInk(cap, 1.8);
        c.save(); dome(); c.clip();
        c.strokeStyle = "rgba(40,22,8,0.55)"; c.lineWidth = Math.max(0.7, r * 0.012);
        if (c.setLineDash) c.setLineDash([r * 0.022, r * 0.018]);
        c.beginPath(); c.moveTo(MX, -r * 0.02); c.lineTo(MX, r * 0.2);
        c.moveTo(MX - r * 0.2, r * 0.17); c.quadraticCurveTo(MX - r * 0.18, r * 0.0, MX - r * 0.06, -r * 0.01);
        c.moveTo(MX + r * 0.2, r * 0.17); c.quadraticCurveTo(MX + r * 0.18, r * 0.0, MX + r * 0.06, -r * 0.01); c.stroke();
        if (c.setLineDash) c.setLineDash([]);
        c.restore();
        c.beginPath(); c.ellipse(MX - r * 0.1, r * 0.03, r * 0.07, r * 0.03, -0.5, 0, TAU); c.fillStyle = "rgba(255,255,255,0.3)"; c.fill();
        rr(MX - r * 0.28, r * 0.18, r * 0.56, r * 0.07, r * 0.03); fillInk(nbCloth(c, 0, r * 0.18, 0, r * 0.25, ["#8a5a30", "#4a2c12", "#1e1006"]), 1.4);
        for (const x of [-0.2, 0.2]) { c.beginPath(); c.arc(MX + x * r, r * 0.215, r * 0.016, 0, TAU); fillInk(PC_BRASS[1], 0.7); }
        // side-coloured shield crest on the cap front
        const m = MX / r;
        poly([m - 0.065, 0.02, m + 0.065, 0.02, m + 0.06, 0.1, m, 0.155, m - 0.06, 0.1]); fillInk(pcSide(c, r, pal, m, 0.02, m, 0.155), 1.2);
        poly([m, 0.045, m + 0.025, 0.085, m, 0.125, m - 0.025, 0.085]); c.fillStyle = rgba(pal.rim, 0.95); c.fill();
      },
    },
  };
  /* ============================================================
   * THEME 7: WONDER KINGDOM & STAR CHAMPIONS
   * An original homage to classic side-scrolling platformer and adventure archetypes. Every figure is
   * a generic archetype (plumber hero, ghost hunter, jungle primate, spark rodent, saurian steed,
   * forest swordsman, armoured bounty hunter, shell tyrant) — no franchise names, initials or logos;
   * side identity is carried by star badges, crescent crests, geometric crests and side-coloured trims.
   * ============================================================ */
  const WK_SKIN = "#fbcfa3";
  const WK_SKIN_SH = ["#ffe6cc", "#f6c08e", "#c47f4c"];
  const WK_NOSE = ["#ffd8b6", "#f4a87a", "#c46a3e"];
  const WK_RED = ["#ff7a68", "#e0232e", "#6e0a12"];        // felt cap / tunic crimson
  const WK_GREEN = ["#86f59a", "#1fa64a", "#0a4d22"];      // emerald cap / tunic
  const WK_DENIM = ["#8fb4ff", "#2f5fd8", "#12276a"];
  const WK_GLOVE = ["#ffffff", "#eef1f7", "#aab2c4"];
  const WK_BROWN = ["#8a5630", "#4e2a12", "#22100a"];      // boots
  const WK_STACHE = "#3e2210";
  const WK_PIPE = ["#c6ffae", "#2fbf45", "#0b4d1a"];
  const WK_BRICK = ["#ffa868", "#c4561e", "#5a1e06"];
  const WK_STONE = ["#c9c4d2", "#8a8496", "#3c3846"];
  const WK_GOLD = ["#fff6c0", "#f5c52a", "#7e5608"];
  const WK_BRASS = ["#fff0b0", "#d8a43a", "#6e4a10"];
  const WK_FUR = ["#b8763e", "#74401c", "#2c1508"];
  const WK_TANFUR = ["#ffe6b8", "#e6ae6e", "#9a6430"];
  const WK_WOOD = ["#f0b06a", "#a8622a", "#4a2208"];
  const WK_IRON = ["#e2e6ee", "#7c8494", "#2c3240"];
  const WK_YELLOW = ["#fff8a8", "#ffd21c", "#b88600"];
  const WK_SAURIAN = ["#a6ff8a", "#38c43c", "#0f5a18"];
  const WK_BOOTIE = ["#ffd08a", "#ff8a1e", "#a8420a"];
  const WK_TUNIC = ["#8aea7a", "#2c9a3a", "#0e4a18"];
  const WK_LINEN = ["#ffffff", "#ece6d6", "#aaa08a"];
  const WK_LEATHER = ["#c48a52", "#7a4a22", "#33190a"];
  const WK_HAIR = ["#fff2a0", "#f2c63a", "#a87a10"];
  const WK_ARMOR = ["#e4eaf2", "#7a8798", "#262d3a"];      // power-armour titanium / gunmetal shell
  const WK_ARMOR_RED = ["#8eb6ff", "#2c58c6", "#0c1c56"];  // power-armour cobalt under-plating
  const WK_SHELL = ["#9cf07a", "#2e9c34", "#0c4414"];
  const WK_IVORY = ["#ffffff", "#f3ead2", "#a8987a"];
  const WK_SCALE = ["#fff0a0", "#efc04a", "#8a5c10"];      // tyrant's golden belly scales
  const WK_HIDE = ["#b8e86a", "#5f9c2a", "#244a0c"];       // tyrant's olive hide
  const WK_MANE = ["#ffa060", "#e8261e", "#6a0a08"];
  const WK_STAR = ["#fffbe0", "#ffd83a", "#d88400"];
  const WK_GHOST = "#bafff0";
  const WK_SPARK = "#fff36a";
  const WK_PLASMA = "#66ff8e";
  const WK_VISOR = "#3ef2e2";                               // teal-cyan visor glow
  const WK_FIRE = "#ff7a18";
  const WK_FIRE_CORE = "#ffe86a";
  const WK_TONGUE = ["#ffc0d6", "#ff6fa0", "#b02a5a"];
  const WK_RAINBOW = ["#ff5a5a", "#ffb03a", "#ffe94a", "#5aff7a", "#4ac8ff", "#b07aff"];

  // Additive soft glow disc (white core → colour → clear).
  function wkGlow(c, x, y, rad, color, alpha = 1) {
    if (!(rad > 0)) return;
    c.save(); c.shadowBlur = 0; c.shadowColor = "transparent"; c.globalCompositeOperation = "lighter";
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(255,255,255,${0.9 * alpha})`); g.addColorStop(0.35, rgba(color, 0.7 * alpha)); g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill();
    c.restore();
  }
  // Four-point twinkle sparkle (spans ±s px), rotated by ang.
  function wkSparkle(c, x, y, s, color, ang = 0, alpha = 1) {
    if (!(s > 0)) return;
    c.save(); c.translate(x, y); c.rotate(ang); c.globalCompositeOperation = "lighter";
    c.beginPath(); c.moveTo(0, -s);
    c.quadraticCurveTo(s * 0.12, -s * 0.12, s, 0); c.quadraticCurveTo(s * 0.12, s * 0.12, 0, s);
    c.quadraticCurveTo(-s * 0.12, s * 0.12, -s, 0); c.quadraticCurveTo(-s * 0.12, -s * 0.12, 0, -s); c.closePath();
    c.fillStyle = rgba(color, alpha); c.fill();
    c.beginPath(); c.arc(0, 0, s * 0.22, 0, TAU); c.fillStyle = `rgba(255,255,255,${alpha})`; c.fill();
    c.restore();
  }
  // Chunky faceted five-point star (radius R px) with a bevel highlight.
  function wkStar(c, h, x, y, R, rot, cols = WK_STAR, inkW = 1.4) {
    c.save(); c.translate(x, y); c.rotate(rot);
    const g = c.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.05, 0, 0, R);
    g.addColorStop(0, cols[0]); g.addColorStop(0.55, cols[1]); g.addColorStop(1, cols[2]);
    heroStar(c, 0, 0, R, 0.5); h.fillInk(g, inkW);
    c.strokeStyle = "rgba(122,70,0,0.35)"; c.lineWidth = Math.max(0.6, R * 0.05);
    c.beginPath();
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU / 5; c.moveTo(0, 0); c.lineTo(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9); }
    c.stroke();
    heroStar(c, -R * 0.07, -R * 0.09, R * 0.45, 0.5); c.fillStyle = "rgba(255,255,255,0.5)"; c.fill();
    c.restore();
  }
  // Crescent-moon glyph (horns point to +x), radius R px.
  function wkCrescent(c, x, y, R) {
    c.beginPath(); c.moveTo(x + R * 0.35, y - R * 0.9);
    c.bezierCurveTo(x - R * 1.15, y - R * 0.85, x - R * 1.15, y + R * 0.85, x + R * 0.35, y + R * 0.9);
    c.bezierCurveTo(x - R * 0.42, y + R * 0.52, x - R * 0.42, y - R * 0.52, x + R * 0.35, y - R * 0.9);
    c.closePath();
  }
  // Conical spike from base centre (x, y) px pointing along ang, base half-width w.
  function wkSpike(c, h, x, y, len, w, ang, fill, inkW = 1.1) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    c.beginPath(); c.moveTo(x - sa * w, y + ca * w);
    c.quadraticCurveTo(x + ca * len * 0.45 - sa * w * 0.55, y + sa * len * 0.45 + ca * w * 0.55, x + ca * len, y + sa * len);
    c.quadraticCurveTo(x + ca * len * 0.45 + sa * w * 0.55, y + sa * len * 0.45 - ca * w * 0.55, x + sa * w, y - ca * w);
    c.closePath(); h.fillInk(fill, inkW);
  }
  // Horizontal warp-pipe gradient with a bright specular stripe.
  function wkPipeGrad(c, x0, x1) {
    const g = c.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, WK_PIPE[2]); g.addColorStop(0.2, WK_PIPE[1]); g.addColorStop(0.32, WK_PIPE[0]);
    g.addColorStop(0.38, "#f2ffe8"); g.addColorStop(0.46, WK_PIPE[0]); g.addColorStop(0.8, WK_PIPE[1]); g.addColorStop(1, WK_PIPE[2]);
    return g;
  }
  // Masonry strip (bricks or stones) in the px rectangle, staggered courses.
  function wkBricks(c, h, x0, y0, x1, y1, rows, cols, tone = WK_BRICK) {
    const rad = Math.min(3, (y1 - y0) * 0.15);
    h.rr(x0, y0, x1 - x0, y1 - y0, rad); h.fillInk(nbCloth(c, 0, y0, 0, y1, tone), 1.5);
    c.save(); h.rr(x0, y0, x1 - x0, y1 - y0, rad); c.clip();
    const bh = (y1 - y0) / rows, bw = (x1 - x0) / cols;
    c.strokeStyle = "rgba(255,235,210,0.4)"; c.lineWidth = Math.max(0.6, bh * 0.12);
    c.beginPath();
    for (let i = 0; i < rows; i++) { c.moveTo(x0, y0 + i * bh + bh * 0.2); c.lineTo(x1, y0 + i * bh + bh * 0.2); }
    c.stroke();
    c.strokeStyle = "rgba(30,10,4,0.72)"; c.lineWidth = Math.max(0.7, bh * 0.13);
    c.beginPath();
    for (let i = 1; i < rows; i++) { c.moveTo(x0, y0 + i * bh); c.lineTo(x1, y0 + i * bh); }
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j <= cols; j++) {
        const xx = x0 + (j + (i % 2) * 0.5) * bw;
        if (xx > x0 + 1 && xx < x1 - 1) { c.moveTo(xx, y0 + i * bh); c.lineTo(xx, y0 + (i + 1) * bh); }
      }
    }
    c.stroke();
    c.restore();
  }
  // Bushy two-lobed scalloped mustache centred at (x, y) px, half-width w.
  function wkMustache(c, h, x, y, w, fill) {
    c.beginPath(); c.moveTo(x, y - w * 0.2);
    c.bezierCurveTo(x + w * 0.45, y - w * 0.42, x + w * 0.95, y - w * 0.2, x + w, y + w * 0.18);
    c.quadraticCurveTo(x + w * 0.82, y + w * 0.1, x + w * 0.68, y + w * 0.32);
    c.quadraticCurveTo(x + w * 0.5, y + w * 0.16, x + w * 0.34, y + w * 0.36);
    c.quadraticCurveTo(x + w * 0.17, y + w * 0.18, x, y + w * 0.3);
    c.quadraticCurveTo(x - w * 0.17, y + w * 0.18, x - w * 0.34, y + w * 0.36);
    c.quadraticCurveTo(x - w * 0.5, y + w * 0.16, x - w * 0.68, y + w * 0.32);
    c.quadraticCurveTo(x - w * 0.82, y + w * 0.1, x - w, y + w * 0.18);
    c.bezierCurveTo(x - w * 0.95, y - w * 0.2, x - w * 0.45, y - w * 0.42, x, y - w * 0.2);
    c.closePath(); h.fillInk(fill, 1.1);
    c.strokeStyle = "rgba(255,220,180,0.3)"; c.lineWidth = Math.max(0.5, w * 0.05);
    c.beginPath();
    for (const sx of [-1, 1]) { c.moveTo(x + sx * w * 0.18, y - w * 0.08); c.quadraticCurveTo(x + sx * w * 0.5, y - w * 0.2, x + sx * w * 0.78, y + w * 0.05); }
    c.stroke();
  }
  // Round cheerful hero face centred at (x, y) px, radius s: ears, sideburns, oval eyes,
  // bulbous nose, bushy mustache and a grin (o.alert → wide startled eyes and an "o" mouth).
  function wkHeroFace(c, h, x, y, s, o = {}) {
    const alert = !!o.alert, look = o.look || 0, fw = s * (alert ? 0.86 : 0.92);
    for (const sx of [-1, 1]) {
      c.beginPath(); c.ellipse(x + sx * fw * 0.98, y + s * 0.08, s * 0.2, s * 0.27, sx * 0.15, 0, TAU); h.fillInk(WK_SKIN, 1.2);
      c.beginPath(); c.ellipse(x + sx * fw * 1.0, y + s * 0.08, s * 0.08, s * 0.14, 0, 0, TAU); c.fillStyle = "rgba(170,80,50,0.45)"; c.fill();
    }
    c.beginPath(); c.ellipse(x, y, fw, s, 0, 0, TAU); h.fillInk(nbCloth(c, x - s, y - s, x + s * 0.6, y + s, WK_SKIN_SH), 1.6);
    for (const sx of [-1, 1]) {
      c.beginPath(); c.moveTo(x + sx * fw * 0.97, y - s * 0.4);
      c.quadraticCurveTo(x + sx * fw * 0.72, y - s * 0.42, x + sx * fw * 0.74, y + s * 0.05);
      c.quadraticCurveTo(x + sx * fw * 0.88, y + s * 0.14, x + sx * fw * 0.99, y - s * 0.04); c.closePath();
      c.fillStyle = WK_STACHE; c.fill();
    }
    const ey = y - s * 0.12, ex = s * 0.3, ew = s * (alert ? 0.17 : 0.13), eh = s * (alert ? 0.29 : 0.24);
    for (const sx of [-1, 1]) {
      const cx = x + sx * ex;
      c.beginPath(); c.ellipse(cx, ey, ew, eh, 0, 0, TAU); h.fillInk("#ffffff", 1.1);
      c.beginPath(); c.ellipse(cx + look * ew * 0.35, ey + eh * 0.08, ew * 0.64, eh * 0.62, 0, 0, TAU); c.fillStyle = o.iris || "#2c68e6"; c.fill();
      c.beginPath(); c.ellipse(cx + look * ew * 0.42, ey + eh * 0.1, ew * 0.34, eh * 0.38, 0, 0, TAU); c.fillStyle = "#0b0710"; c.fill();
      c.beginPath(); c.arc(cx + look * ew * 0.42 - ew * 0.22, ey - eh * 0.22, ew * 0.22, 0, TAU); c.fillStyle = "#ffffff"; c.fill();
      c.beginPath();
      if (alert) { c.moveTo(x + sx * (ex - ew * 1.2), ey - eh * 1.25); c.quadraticCurveTo(cx, ey - eh * 1.75, x + sx * (ex + ew * 1.25), ey - eh * 1.35); }
      else { c.moveTo(x + sx * (ex - ew * 1.2), ey - eh * 1.2); c.quadraticCurveTo(cx, ey - eh * 1.5, x + sx * (ex + ew * 1.35), ey - eh * 1.15); }
      c.strokeStyle = WK_STACHE; c.lineWidth = Math.max(1.1, s * 0.09); c.stroke();
      c.beginPath(); c.ellipse(x + sx * s * 0.55, y + s * 0.3, s * 0.14, s * 0.08, 0, 0, TAU); c.fillStyle = "rgba(255,105,105,0.38)"; c.fill();
    }
    const my = y + s * 0.6;
    if (alert) {
      c.beginPath(); c.ellipse(x, my + s * 0.04, s * 0.11, s * 0.13, 0, 0, TAU); h.fillInk("#5a0e18", 1);
    } else {
      c.beginPath(); c.moveTo(x - s * 0.34, my - s * 0.06); c.quadraticCurveTo(x, my + s * 0.42, x + s * 0.34, my - s * 0.06); c.closePath();
      h.fillInk("#6a1018", 1);
      c.beginPath(); c.ellipse(x, my + s * 0.13, s * 0.12, s * 0.05, 0, 0, TAU); c.fillStyle = "#e0485a"; c.fill();
    }
    wkMustache(c, h, x, y + s * 0.42, s * 0.54, WK_STACHE);
    c.beginPath(); c.ellipse(x, y + s * 0.2, s * 0.21, s * 0.18, 0, 0, TAU); h.fillInk(nbCloth(c, x - s * 0.2, y, x + s * 0.2, y + s * 0.38, WK_NOSE), 1.2);
    c.beginPath(); c.ellipse(x - s * 0.07, y + s * 0.13, s * 0.07, s * 0.045, -0.4, 0, TAU); c.fillStyle = "rgba(255,255,255,0.6)"; c.fill();
  }
  // Felt work cap with a front badge plate and a curved brim. Default plate is a white disc with a
  // side-coloured ring; plate === "diamond" gives a gold-rimmed side-coloured diamond with a white keyline.
  // y = brim line (px), s = face radius, tallK lengthens the crown, badge(x, y, rad) draws the emblem.
  function wkCap(c, h, pal, x, y, s, cols, tallK, badge, plate) {
    const top = y - s * (0.92 + tallK);
    const dome = () => {
      c.beginPath(); c.moveTo(x - s * 1.06, y + s * 0.05);
      c.bezierCurveTo(x - s * 1.14, top + s * 0.25, x - s * 0.62, top, x, top);
      c.bezierCurveTo(x + s * 0.62, top, x + s * 1.14, top + s * 0.25, x + s * 1.06, y + s * 0.05);
      c.closePath();
    };
    dome(); h.fillInk(nbCloth(c, x - s, top, x + s * 0.8, y, cols), 1.8);
    c.save(); dome(); c.clip();
    c.strokeStyle = "rgba(11,7,16,0.28)"; c.lineWidth = Math.max(0.7, s * 0.05);
    c.beginPath();
    c.moveTo(x - s * 0.55, y); c.quadraticCurveTo(x - s * 0.58, top + s * 0.3, x, top);
    c.moveTo(x + s * 0.55, y); c.quadraticCurveTo(x + s * 0.58, top + s * 0.3, x, top);
    c.stroke();
    c.beginPath(); c.ellipse(x - s * 0.45, top + s * 0.4, s * 0.3, s * 0.14, -0.5, 0, TAU); c.fillStyle = "rgba(255,255,255,0.3)"; c.fill();
    c.restore();
    c.beginPath(); c.arc(x, top + s * 0.05, s * 0.09, 0, TAU); h.fillInk(cols[1], 0.9);
    const by = y - s * (0.44 + tallK * 0.5), br = s * 0.34;
    if (plate === "diamond") {
      const dia = (k) => { c.beginPath(); c.moveTo(x, by - br * 1.08 * k); c.lineTo(x + br * 0.96 * k, by); c.lineTo(x, by + br * 1.08 * k); c.lineTo(x - br * 0.96 * k, by); c.closePath(); };
      dia(1); h.fillInk(h.metal(x - br, by - br, x + br, by + br, WK_GOLD[0], pal.gold || WK_GOLD[1], WK_GOLD[2]), 1.2);
      dia(0.74); h.fillInk(nbCloth(c, x, by - br, x, by + br, [pal.rim, pal.bright, pal.deep]), 0.9);
      dia(0.86); c.strokeStyle = "rgba(255,255,255,0.75)"; c.lineWidth = Math.max(0.6, br * 0.07); c.stroke();
      badge(x, by, br * 0.6);
    } else {
      c.beginPath(); c.arc(x, by, br, 0, TAU); h.fillInk("#ffffff", 1.1);
      c.beginPath(); c.arc(x, by, br * 0.8, 0, TAU); c.strokeStyle = pal.bright; c.lineWidth = Math.max(1, br * 0.2); c.stroke();
      badge(x, by, br * 0.66);
    }
    const brim = () => {
      c.beginPath(); c.moveTo(x - s * 1.12, y + s * 0.04);
      c.quadraticCurveTo(x, y - s * 0.2, x + s * 1.12, y + s * 0.04);
      c.quadraticCurveTo(x + s * 0.7, y + s * 0.28, x, y + s * 0.26);
      c.quadraticCurveTo(x - s * 0.7, y + s * 0.28, x - s * 1.12, y + s * 0.04); c.closePath();
    };
    brim(); h.fillInk(nbCloth(c, x, y - s * 0.1, x, y + s * 0.28, [cols[1], cols[2], cols[2]]), 1.6);
    c.beginPath(); c.moveTo(x - s * 0.9, y + s * 0.0); c.quadraticCurveTo(x, y - s * 0.12, x + s * 0.9, y + s * 0.0);
    c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = Math.max(0.6, s * 0.05); c.stroke();
  }
  // White work glove fist at (x, y) px facing ang, with a side-coloured cuff on the wrist side.
  function wkGlove(c, h, x, y, rad, ang, cuff) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.ellipse(-rad * 0.8, 0, rad * 0.32, rad * 0.64, 0, 0, TAU); h.fillInk(cuff || "#ffffff", 1.1);
    c.restore();
    pcFist(c, h, x, y, rad, nbCloth(c, -rad, -rad, rad, rad, WK_GLOVE), ang);
  }
  // Front-facing work shirt + denim overalls torso centred at x = 0 (r units): side-piped collar,
  // bib with stitched pocket, shoulder straps and brass buckles.
  function wkOverallsTorso(c, h, r, pal, shirt) {
    const torso = () => jlTorso(c, r, 0.36, 0.3, -0.42, 0.3);
    torso(); h.fillInk(nbCloth(c, -r * 0.4, -r * 0.45, r * 0.4, r * 0.3, shirt), 2.2);
    // collar piping: ink edge → white keyline → side colour, so it never melts into a same-hue shirt
    c.beginPath(); c.moveTo(-r * 0.17, -r * 0.43); c.lineTo(0, -r * 0.29); c.lineTo(r * 0.17, -r * 0.43);
    c.strokeStyle = h.INK; c.lineWidth = Math.max(3, r * 0.085); c.stroke();
    c.strokeStyle = "#ffffff"; c.lineWidth = Math.max(2, r * 0.06); c.stroke();
    c.strokeStyle = pal.bright; c.lineWidth = Math.max(1.1, r * 0.034); c.stroke();
    h.rr(-r * 0.33, r * 0.12, r * 0.66, r * 0.28, r * 0.06); h.fillInk(nbCloth(c, -r * 0.33, 0, r * 0.33, 0, WK_DENIM), 2);
    h.poly([-0.2, -0.16, 0.2, -0.16, 0.24, 0.2, -0.24, 0.2]); h.fillInk(nbCloth(c, 0, -r * 0.16, 0, r * 0.2, WK_DENIM), 1.8);
    c.strokeStyle = "rgba(255,255,255,0.5)"; c.lineWidth = Math.max(0.6, r * 0.012);
    if (c.setLineDash) { c.setLineDash([r * 0.03, r * 0.025]); }
    c.beginPath(); c.rect(-r * 0.11, -r * 0.08, r * 0.22, r * 0.14); c.moveTo(0, r * 0.2); c.lineTo(0, r * 0.38); c.stroke();
    if (c.setLineDash) { c.setLineDash([]); }
    for (const sx of [-1, 1]) {
      h.poly([sx * 0.13, -0.16, sx * 0.21, -0.16, sx * 0.31, -0.42, sx * 0.22, -0.44]); h.fillInk(nbCloth(c, 0, -r * 0.44, 0, -r * 0.16, WK_DENIM), 1.4);
      c.beginPath(); c.arc(sx * r * 0.17, -r * 0.13, r * 0.048, 0, TAU); h.fillInk(h.metal(sx * r * 0.13, -r * 0.17, sx * r * 0.21, -r * 0.09, ...WK_BRASS), 1);
      c.beginPath(); c.arc(sx * r * 0.17, -r * 0.13, r * 0.018, 0, TAU); c.fillStyle = WK_BRASS[2]; c.fill();
    }
  }
  // Translucent little ghost (spans ±s × -s…1.05s px) with dark eyes — used for trapped spectral motes.
  function wkGhost(c, x, y, s, ang, color, alpha = 0.85) {
    if (!(s > 0)) return;
    c.save(); c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.moveTo(-s, s * 0.6); c.lineTo(-s, 0); c.arc(0, 0, s, Math.PI, TAU); c.lineTo(s, s * 0.6);
    for (let i = 0; i < 3; i++) { const xa = s - (i + 0.5) * 2 * s / 3, xb = s - (i + 1) * 2 * s / 3; c.quadraticCurveTo(xa, s * (i % 2 ? 0.3 : 1.05), xb, s * 0.6); }
    c.closePath();
    const g = c.createRadialGradient(0, 0, 0, 0, 0, s * 1.2);
    g.addColorStop(0, `rgba(255,255,255,${alpha})`); g.addColorStop(0.5, rgba(color, alpha * 0.8)); g.addColorStop(1, rgba(color, alpha * 0.15));
    c.globalCompositeOperation = "lighter"; c.fillStyle = g; c.fill();
    c.globalCompositeOperation = "source-over";
    c.fillStyle = rgba("#10303a", alpha * 0.85);
    c.beginPath(); c.ellipse(-s * 0.35, -s * 0.05, s * 0.14, s * 0.22, 0, 0, TAU); c.ellipse(s * 0.35, -s * 0.05, s * 0.14, s * 0.22, 0, 0, TAU); c.fill();
    c.restore();
  }
  // Pointed leaf-shaped ear from base (bx, by) to tip (tx, ty) px with a dark tip and side-coloured cuff.
  function wkEar(c, h, pal, bx, by, tx, ty, w, fill, tip = "#17121c") {
    const dx = tx - bx, dy = ty - by, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const path = () => {
      c.beginPath(); c.moveTo(bx + nx * w, by + ny * w);
      c.quadraticCurveTo(bx + dx * 0.55 + nx * w * 1.3, by + dy * 0.55 + ny * w * 1.3, tx, ty);
      c.quadraticCurveTo(bx + dx * 0.55 - nx * w * 1.3, by + dy * 0.55 - ny * w * 1.3, bx - nx * w, by - ny * w); c.closePath();
    };
    path(); h.fillInk(fill, 1.6);
    c.save(); path(); c.clip();
    const k = 0.66, cx = bx + dx * k, cy = by + dy * k;
    c.beginPath(); c.moveTo(cx + nx * w * 1.6, cy + ny * w * 1.6); c.lineTo(tx + nx * w * 0.6, ty + ny * w * 0.6);
    c.lineTo(tx - nx * w * 0.6, ty - ny * w * 0.6); c.lineTo(cx - nx * w * 1.6, cy - ny * w * 1.6); c.closePath();
    c.fillStyle = tip; c.fill();
    const ux = bx + dx * 0.58, uy = by + dy * 0.58;
    c.beginPath(); c.moveTo(ux + nx * w * 1.6, uy + ny * w * 1.6); c.lineTo(ux - nx * w * 1.6, uy - ny * w * 1.6);
    c.strokeStyle = pal.bright; c.lineWidth = Math.max(1.4, L * 0.1); c.stroke();
    c.restore();
    path(); h.ink(1.6);
  }
  // Polygon outline of a ribbon following a zig-zag centre line pts ([[x, y], …] px) with per-vertex widths.
  function wkBoltRibbon(c, pts, widths) {
    const L = [], R = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      const w = widths[i] / 2;
      L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]); R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
    }
    c.beginPath(); c.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n; i++) c.lineTo(L[i][0], L[i][1]);
    for (let i = n - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
    c.closePath();
  }
  // Radiant four-point golden compass star (long vertical points, diagonal rays, white jewel) over a side-coloured
  // roundel with a rim-coloured keyline — an original heraldic crest. Centred near (x, y + 0.2s) px, spans ±s.
  function wkStarCrest(c, h, pal, x, y, s) {
    const cy = y + s * 0.2;
    c.beginPath(); c.arc(x, cy, s * 0.64, 0, TAU);
    h.fillInk(nbCloth(c, x, cy - s * 0.64, x, cy + s * 0.64, [pal.bright, pal.mid, pal.deep]), 1);
    c.beginPath(); c.arc(x, cy, s * 0.53, 0, TAU); c.strokeStyle = pal.rim; c.lineWidth = Math.max(0.8, s * 0.08); c.stroke();
    c.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      c.moveTo(x + Math.cos(a) * s * 0.2, cy + Math.sin(a) * s * 0.2); c.lineTo(x + Math.cos(a) * s * 0.58, cy + Math.sin(a) * s * 0.58);
    }
    c.strokeStyle = h.INK; c.lineWidth = Math.max(1.6, s * 0.16); c.stroke();
    c.strokeStyle = WK_GOLD[0]; c.lineWidth = Math.max(0.8, s * 0.08); c.stroke();
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 4, R = i % 2 ? s * 0.19 : (i % 4 === 0 ? s : s * 0.74);
      const px = x + Math.cos(a) * R, py = cy + Math.sin(a) * R;
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.closePath(); h.fillInk(nbCloth(c, x, cy - s, x, cy + s, WK_GOLD), 1);
    c.strokeStyle = "rgba(122,70,0,0.45)"; c.lineWidth = Math.max(0.5, s * 0.04);
    c.beginPath(); c.moveTo(x, cy - s * 0.92); c.lineTo(x, cy + s * 0.92); c.moveTo(x - s * 0.68, cy); c.lineTo(x + s * 0.68, cy); c.stroke();
    c.beginPath(); c.arc(x, cy, s * 0.1, 0, TAU); h.fillInk("#ffffff", 0.8);
  }

  SG.THEMES.wonderkingdom = {
    id: "wonderkingdom",
    name: { en: "Wonder Kingdom & Star Champions", fr: "Royaume des Merveilles & Champions Étoilés", zh: "奇迹王国与群星勇士", ar: "مملكة العجائب ونجوم الأبطال" },
    description: {
      en: "Plumber heroes with invincibility stars, vacuum-wielding ghost hunters, jungle primates with barrel shields, electric spark rodents, and armored bounty hunters defending the kingdom.",
      fr: "Plombiers héroïques aux étoiles d'invincibilité, chasseurs de spectres à aspirateur, primates de la jungle aux boucliers tonneaux, rongeurs électriques et chasseurs de primes en armure défendant le royaume.",
      zh: "闪耀无敌星的工装水管英雄、持吸尘器的捉鬼猎人、擎木桶护盾的丛林巨猿、跃动电光的雷光灵鼠与战甲赏金猎人，共同守护奇迹王国。",
      ar: "أبطال السباكة بنجوم الحصانة، وصائدو الأشباح بالمكانس الكهربائية، وقردة الأدغال بدروع البراميل، وقوارض الصواعق الكهربائية، وصائدو الجوائز المدرعون للدفاع عن المملكة.",
    },
    painters: {
      /* Plumber Hero — leaping out of a green warp pipe set into a brick floor: red felt cap with an embossed gold
         star on a gold-rimmed side-coloured diamond badge, brown mustache, cheerful face, crimson shirt with
         white-keyed side piping, denim overalls with brass buckles, white gloves with side cuffs, holding aloft a
         pulsing golden Invincibility Star that streams a sparkling rainbow particle trail. */
      sovereign(c, pal, r, ts, h) {
        const { fillInk, rr, pulse } = h;
        const p = pulse(150);
        const hop = ts ? Math.sin(ts / 340) * r * 0.035 : 0;
        const denim = nbCloth(c, -r * 0.5, 0, r * 0.3, 0, WK_DENIM);
        const shirt = nbCloth(c, -r * 0.7, -r * 0.7, r * 0.7, r * 0.1, WK_RED);
        const boot = (x, y, rot) => {
          c.beginPath(); c.ellipse(x, y, r * 0.13, r * 0.085, rot, 0, TAU); fillInk(nbCloth(c, x, y - r * 0.09, x, y + r * 0.09, WK_BROWN), 1.5);
          c.beginPath(); c.ellipse(x - r * 0.03, y - r * 0.03, r * 0.05, r * 0.025, rot, 0, TAU); c.fillStyle = "rgba(255,255,255,0.28)"; c.fill();
        };
        // brick floor (base silhouette) and the warp pipe body, rim and dark mouth
        wkBricks(c, h, -r * 0.95, r * 0.95, r * 0.95, r * 1.13, 2, 7, WK_BRICK);
        c.shadowBlur = 0;
        rr(-r * 0.36, r * 0.7, r * 0.72, r * 0.36, r * 0.03); fillInk(wkPipeGrad(c, -r * 0.36, r * 0.36), 2);
        c.beginPath(); c.ellipse(0, r * 0.58, r * 0.47, r * 0.075, 0, 0, TAU); fillInk(wkPipeGrad(c, -r * 0.47, r * 0.47), 1.8);
        const mouthG = c.createRadialGradient(0, r * 0.59, r * 0.02, 0, r * 0.59, r * 0.39);
        mouthG.addColorStop(0, "#020a04"); mouthG.addColorStop(1, "#0b3a14");
        c.beginPath(); c.ellipse(0, r * 0.585, r * 0.39, r * 0.048, 0, 0, TAU); c.fillStyle = mouthG; c.fill();
        // trailing leg still dipping into the pipe mouth
        c.save(); c.translate(0, -hop);
        heroLimb(c, h, r * 0.1, r * 0.28, r * 0.22, r * 0.44, r * 0.14, r * 0.58, Math.max(4, r * 0.17), denim);
        boot(r * 0.15, r * 0.63, 0.1);
        c.restore();
        // pipe lip front face hides the dipping boot
        c.beginPath(); c.ellipse(0, r * 0.58, r * 0.47, r * 0.075, 0, Math.PI, 0, true);
        c.lineTo(r * 0.47, r * 0.79); c.lineTo(-r * 0.47, r * 0.79); c.closePath();
        fillInk(wkPipeGrad(c, -r * 0.47, r * 0.47), 2);
        c.beginPath(); c.moveTo(-r * 0.44, r * 0.77); c.lineTo(r * 0.44, r * 0.77);
        c.strokeStyle = "rgba(4,30,10,0.5)"; c.lineWidth = Math.max(1, r * 0.025); c.stroke();

        c.save(); c.translate(0, -hop);
        // rainbow ribbon + particle trail streaming from the star (behind the hero)
        const SX = r * 0.56, SY = -r * 0.88, CX = r * 1.08, CY = -r * 0.62, EX = r * 0.8, EY = r * 0.12;
        const at = (t) => { const u = 1 - t; return [u * u * SX + 2 * u * t * CX + t * t * EX, u * u * SY + 2 * u * t * CY + t * t * EY]; };
        c.save(); c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 6; i++) {
          const ox = (i - 2.5) * r * 0.024, col = WK_RAINBOW[i];
          const g = c.createLinearGradient(SX, SY, EX, EY);
          g.addColorStop(0, rgba(col, 0.85)); g.addColorStop(0.7, rgba(col, 0.3)); g.addColorStop(1, rgba(col, 0));
          c.beginPath(); c.moveTo(SX + ox * 0.3, SY); c.quadraticCurveTo(CX + ox, CY, EX + ox, EY);
          c.strokeStyle = g; c.lineWidth = Math.max(1, r * 0.026); c.stroke();
        }
        c.restore();
        const shift = ts ? Math.floor(ts / 110) : 0;
        for (let i = 0; i < 12; i++) {
          const t = ts ? (i / 12 + ts / 1800) % 1 : i / 12, pt = at(t);
          const wob = Math.sin(i * 2.3 + (ts ? ts / 150 : 0)) * r * 0.04, s = r * (0.05 * (1 - t) + 0.014);
          const col = WK_RAINBOW[(i + shift) % 6];
          if (i % 3 === 0) wkSparkle(c, pt[0] + wob, pt[1], s * 1.5, col, t * 3, 1 - t * 0.7);
          else wkGlow(c, pt[0] + wob, pt[1], s * 1.4, col, 1 - t * 0.6);
        }
        // raised knee leg and boot
        heroLimb(c, h, -r * 0.16, r * 0.3, -r * 0.5, r * 0.26, -r * 0.42, r * 0.5, Math.max(4, r * 0.17), denim);
        boot(-r * 0.45, r * 0.55, -0.25);
        // shirt + overalls
        c.save(); c.translate(-r * 0.04, 0); wkOverallsTorso(c, h, r, pal, WK_RED); c.restore();
        // cheering arm and the arm raising the star
        heroLimb(c, h, -r * 0.36, -r * 0.32, -r * 0.66, -r * 0.28, -r * 0.6, -r * 0.02, Math.max(3.5, r * 0.14), shirt);
        wkGlove(c, h, -r * 0.6, r * 0.03, r * 0.1, Math.PI * 0.5, pal.bright);
        heroLimb(c, h, r * 0.24, -r * 0.34, r * 0.54, -r * 0.38, r * 0.54, -r * 0.6, Math.max(3.5, r * 0.14), shirt);
        wkGlove(c, h, r * 0.55, -r * 0.66, r * 0.1, -Math.PI * 0.5, pal.bright);
        // cheerful face and the red cap with its embossed gold-star diamond badge
        const HX = -r * 0.04, HY = -r * 0.6, HS = r * 0.26;
        wkHeroFace(c, h, HX, HY, HS, { look: 0.3 });
        wkCap(c, h, pal, HX, HY - HS * 0.82, HS, WK_RED, 0, (bx, by, br) => {
          heroStar(c, bx, by + br * 0.06, br, 0.46); fillInk(h.metal(bx - br, by - br, bx + br, by + br, ...WK_GOLD), 0.9);
          heroStar(c, bx - br * 0.08, by - br * 0.04, br * 0.45, 0.46); c.fillStyle = "rgba(255,255,255,0.55)"; c.fill();
        }, "diamond");
        // the pulsing Invincibility Star: glow, rotating rays, side-coloured energy ring, orbiting twinkles
        const R = r * 0.2 * (1 + 0.06 * p), rot = ts ? Math.sin(ts / 400) * 0.25 : 0, spin = ts ? ts / 1100 : 0.3;
        wkGlow(c, SX, SY, r * 0.3, WK_STAR[1], 0.75 + 0.25 * p);
        c.save(); c.globalCompositeOperation = "lighter";
        c.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = spin + i * TAU / 10, R1 = R * (i % 2 ? 1.3 : 1.38);
          c.moveTo(SX + Math.cos(a) * R * 1.1, SY + Math.sin(a) * R * 1.1); c.lineTo(SX + Math.cos(a) * R1, SY + Math.sin(a) * R1);
        }
        c.strokeStyle = rgba("#fff3a0", 0.75); c.lineWidth = Math.max(1, r * 0.022); c.stroke();
        c.beginPath(); c.arc(SX, SY, R * 1.2, 0, TAU);
        c.strokeStyle = rgba(pal.rim, 0.45 + 0.4 * p); c.lineWidth = Math.max(1, r * 0.025); c.stroke();
        c.restore();
        wkStar(c, h, SX, SY, R, rot, WK_STAR, 1.5);
        for (let i = 0; i < 3; i++) {
          const a = -spin * 1.6 + i * TAU / 3;
          wkSparkle(c, SX + Math.cos(a) * R * 1.18, SY + Math.sin(a) * R * 1.18, r * 0.045, i % 2 ? pal.bright : "#ffffff", a, 0.9);
        }
        c.restore();
      },

      /* Poltergeist Hunter — tall green cap with a crescent-moon badge, mustache and wide alert eyes, emerald
         shirt under denim overalls, an industrial vacuum pack (pressure dial, side-coloured glowing battery
         gauge) feeding a ribbed suction hose whose nozzle projects a translucent ghost-light containment cone
         that swirls captured spectral motes inward. */
      reaper(c, pal, r, ts, h) {
        const { fillInk, rr, pulse, metal } = h;
        const p = pulse(130);
        const BX = -r * 0.08;
        // vacuum pack (base silhouette) with canister bands
        rr(-r * 0.74, -r * 0.6, r * 0.46, r * 0.84, r * 0.12);
        fillInk(nbCloth(c, -r * 0.74, 0, -r * 0.28, 0, ["#e2e7ef", "#7d8698", "#323846"]), 2.2);
        c.shadowBlur = 0;
        c.strokeStyle = "rgba(11,7,16,0.45)"; c.lineWidth = Math.max(0.8, r * 0.018);
        c.beginPath(); for (const y of [-0.44, 0.16]) { c.moveTo(-r * 0.74, y * r); c.lineTo(-r * 0.3, y * r); } c.stroke();
        // side-coloured battery gauge
        rr(-r * 0.69, -r * 0.37, r * 0.14, r * 0.45, r * 0.05); fillInk("#161a24", 1.3);
        const lit = ts ? 1 + Math.floor((ts / 240) % 4) : 4;
        for (let i = 0; i < 4; i++) {
          const y0 = r * (0.05 - (i + 1) * 0.1 + 0.02);
          rr(-r * 0.665, y0, r * 0.09, r * 0.075, r * 0.02);
          c.fillStyle = i < lit ? pal.bright : "#2c3242"; c.fill();
          if (i < lit) { c.fillStyle = "rgba(255,255,255,0.35)"; c.fillRect(-r * 0.655, y0 + r * 0.01, r * 0.07, r * 0.02); }
        }
        wkGlow(c, -r * 0.62, r * (0.05 - lit * 0.1 + 0.06), r * 0.13, pal.bright, 0.55 + 0.35 * p);
        // pressure dial with a twitching needle
        rr(-r * 0.56, -r * 0.66, r * 0.06, r * 0.1, r * 0.02); fillInk(metal(-r * 0.56, 0, -r * 0.5, 0, ...WK_IRON), 1);
        c.beginPath(); c.arc(-r * 0.53, -r * 0.7, r * 0.105, 0, TAU); fillInk(metal(-r * 0.63, -r * 0.8, -r * 0.43, -r * 0.6, ...WK_BRASS), 1.3);
        c.beginPath(); c.arc(-r * 0.53, -r * 0.7, r * 0.075, 0, TAU); fillInk("#fbf6e6", 0.9);
        c.strokeStyle = "#3a2a14"; c.lineWidth = Math.max(0.6, r * 0.01);
        c.beginPath();
        for (let i = 0; i < 5; i++) { const a = -Math.PI * 1.15 + i * Math.PI * 0.32; c.moveTo(-r * 0.53 + Math.cos(a) * r * 0.06, -r * 0.7 + Math.sin(a) * r * 0.06); c.lineTo(-r * 0.53 + Math.cos(a) * r * 0.072, -r * 0.7 + Math.sin(a) * r * 0.072); }
        c.stroke();
        const na = -Math.PI * 0.95 + Math.PI * (0.55 + 0.35 * p) + (ts ? Math.sin(ts / 45) * 0.06 : 0);
        c.beginPath(); c.moveTo(-r * 0.53, -r * 0.7); c.lineTo(-r * 0.53 + Math.cos(na) * r * 0.062, -r * 0.7 + Math.sin(na) * r * 0.062);
        c.strokeStyle = "#e0202c"; c.lineWidth = Math.max(0.9, r * 0.018); c.stroke();
        c.beginPath(); c.arc(-r * 0.53, -r * 0.7, r * 0.015, 0, TAU); c.fillStyle = "#3a2a14"; c.fill();
        // crouched stance legs and boots
        c.save(); c.translate(BX, 0);
        const denim = nbCloth(c, -r * 0.45, 0, r * 0.35, 0, WK_DENIM);
        for (const [sx, kx] of [[-1, -0.34], [1, 0.26]]) {
          heroLimb(c, h, sx * r * 0.15, r * 0.3, kx * r * 0.85, r * 0.62, kx * r, r * 0.9, Math.max(4, r * 0.19), denim);
          c.beginPath(); c.ellipse((kx + sx * 0.03) * r, r * 0.97, r * 0.15, r * 0.09, 0, 0, TAU); fillInk(nbCloth(c, 0, r * 0.88, 0, r * 1.06, WK_BROWN), 1.5);
        }
        wkOverallsTorso(c, h, r, pal, WK_GREEN);
        c.restore();
        // ribbed suction hose looping from the pack to the nozzle
        const hose = () => { c.beginPath(); c.moveTo(-r * 0.5, r * 0.22); c.bezierCurveTo(-r * 0.62, r * 0.72, 0, r * 0.76, r * 0.02, r * 0.16); };
        hose(); c.strokeStyle = h.INK; c.lineWidth = r * 0.12 + 2.6; c.stroke();
        hose(); c.strokeStyle = "#6f7888"; c.lineWidth = r * 0.12; c.stroke();
        if (c.setLineDash) { c.setLineDash([r * 0.025, r * 0.035]); }
        hose(); c.strokeStyle = "rgba(20,24,34,0.6)"; c.lineWidth = r * 0.12; c.stroke();
        if (c.setLineDash) { c.setLineDash([]); }
        hose(); c.strokeStyle = "rgba(255,255,255,0.3)"; c.lineWidth = Math.max(0.7, r * 0.025); c.stroke();
        // arms reaching forward to the nozzle
        const sleeve = nbCloth(c, -r * 0.5, -r * 0.5, r * 0.4, r * 0.2, WK_GREEN);
        heroLimb(c, h, BX - r * 0.32, -r * 0.32, BX - r * 0.2, r * 0.14, r * 0.0, r * 0.12, Math.max(3.5, r * 0.13), sleeve);
        heroLimb(c, h, BX + r * 0.24, -r * 0.34, BX + r * 0.46, -r * 0.12, r * 0.22, r * 0.03, Math.max(3.5, r * 0.13), sleeve);
        // nozzle: steel tube, side-coloured collar ring, flared mouth
        const TX0 = 0, TY0 = r * 0.12, ang = -0.373, L0 = r * 0.49;
        c.save(); c.translate(TX0, TY0); c.rotate(ang);
        rr(-r * 0.04, -r * 0.05, r * 0.44, r * 0.1, r * 0.03); fillInk(metal(0, -r * 0.05, 0, r * 0.05, ...WK_IRON), 1.4);
        rr(r * 0.32, -r * 0.065, r * 0.05, r * 0.13, r * 0.02); fillInk(pal.bright, 1.1);
        c.beginPath(); c.moveTo(r * 0.38, -r * 0.055); c.lineTo(L0, -r * 0.085); c.lineTo(L0, r * 0.085); c.lineTo(r * 0.38, r * 0.055); c.closePath();
        fillInk(metal(0, -r * 0.085, 0, r * 0.085, ...WK_IRON), 1.3);
        c.restore();
        wkGlove(c, h, r * 0.0, r * 0.12, r * 0.09, ang, pal.bright);
        wkGlove(c, h, r * 0.22, r * 0.03, r * 0.09, ang, pal.bright);
        // ghost-light containment cone with suction rings and swirling captured motes
        const TX = TX0 + Math.cos(ang) * L0, TY = TY0 + Math.sin(ang) * L0, CL = r * 0.56, w0 = r * 0.05, w1 = r * 0.31;
        const wAt = (t) => w0 + (w1 - w0) * t;
        c.save(); c.translate(TX, TY); c.rotate(ang);
        c.save(); c.globalCompositeOperation = "lighter";
        c.beginPath(); c.moveTo(0, -w0); c.lineTo(CL, -w1); c.ellipse(CL, 0, r * 0.06, w1, 0, -Math.PI / 2, Math.PI / 2); c.lineTo(0, w0); c.closePath();
        const cg = c.createLinearGradient(0, 0, CL, 0);
        cg.addColorStop(0, rgba(WK_GHOST, 0.75)); cg.addColorStop(0.5, rgba(pal.rim, 0.32)); cg.addColorStop(1, rgba(pal.bright, 0.12));
        c.fillStyle = cg; c.fill();
        c.strokeStyle = rgba(WK_GHOST, 0.55); c.lineWidth = Math.max(0.8, r * 0.015); c.stroke();
        for (let k = 0; k < 4; k++) {
          const t = ts ? 1 - ((ts / 700 + k / 4) % 1) : k / 4 + 0.12, w = wAt(t);
          c.beginPath(); c.ellipse(t * CL, 0, r * (0.02 + 0.035 * t), w * 0.95, 0, 0, TAU);
          c.strokeStyle = rgba(pal.rim, 0.65 * (1 - t * 0.4)); c.lineWidth = Math.max(0.8, r * 0.018); c.stroke();
        }
        for (const sg of [-1, 1]) {
          c.beginPath();
          for (let i = 0; i <= 14; i++) {
            const t = i / 14, y = sg * wAt(t) * 0.7 * Math.sin(t * 9 + (ts ? -ts / 120 : 0) + (sg > 0 ? 0 : Math.PI));
            if (i) c.lineTo(t * CL, y); else c.moveTo(0, y);
          }
          c.strokeStyle = rgba(WK_GHOST, 0.45); c.lineWidth = Math.max(0.7, r * 0.014); c.stroke();
        }
        c.restore();
        for (let i = 0; i < 4; i++) {
          const t = ts ? 1 - ((ts / 1500 + i / 4) % 1) : 0.25 + i * 0.2, w = wAt(t);
          const y = w * 0.5 * Math.sin((ts ? ts / 180 : 0) + i * 1.9), s = r * 0.065 * (0.55 + 0.45 * t);
          wkGhost(c, t * CL * 0.9, y, s, -ang + (ts ? Math.sin(ts / 150 + i) * 0.5 : 0), WK_GHOST, 0.85);
        }
        wkGlow(c, 0, 0, r * 0.12, WK_GHOST, 0.8 + 0.2 * p);
        c.restore();
        // alert face under the tall crescent-badge cap
        const HX = BX, HY = -r * 0.6, HS = r * 0.25;
        wkHeroFace(c, h, HX, HY, HS, { alert: true, look: 0.55 });
        wkCap(c, h, pal, HX, HY - HS * 0.82, HS, WK_GREEN, 0.38, (bx, by, br) => {
          wkCrescent(c, bx + br * 0.05, by, br); fillInk(nbCloth(c, bx, by - br, bx, by + br, WK_GOLD), 0.9);
        });
      },

      /* Jungle Titan — a massive chestnut jungle gorilla with a peaked head tuft, tan face and chest plate and a
         diagonal leather bandolier (white-keyed side-coloured centre stripe, side-coloured cartridge loops and a gold
         buckle), drumming both fists on a banded wooden powder-barrel shield (side-coloured metal hoops, blast
         emblem, sparking fuse) while ground shockwave rings ripple out. */
      juggernaut(c, pal, r, ts, h) {
        const { fillInk, rr, pulse, metal } = h;
        const p = pulse(120);
        const beat = (ph) => ts ? Math.max(0, Math.sin(ts / 115 + ph)) : (ph ? 0.7 : 0);
        const lifts = [beat(0), beat(Math.PI)];
        const fur = nbCloth(c, -r * 0.7, -r * 0.6, r * 0.7, r * 0.8, WK_FUR);
        const tan = nbCloth(c, -r * 0.3, -r * 0.5, r * 0.3, r * 0.3, WK_TANFUR);
        const ell = (x, y, rx, ry, rot) => { c.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); c.ellipse(x, y, rx, ry, rot, 0, TAU); };
        // massive body (base silhouette) with fur tufts
        const body = () => {
          c.beginPath(); c.moveTo(-r * 0.6, -r * 0.44);
          c.quadraticCurveTo(-r * 0.86, -r * 0.1, -r * 0.62, r * 0.42); c.quadraticCurveTo(-r * 0.42, r * 0.82, 0, r * 0.82);
          c.quadraticCurveTo(r * 0.42, r * 0.82, r * 0.62, r * 0.42); c.quadraticCurveTo(r * 0.86, -r * 0.1, r * 0.6, -r * 0.44);
          c.quadraticCurveTo(0, -r * 0.66, -r * 0.6, -r * 0.44); c.closePath();
        };
        body(); fillInk(fur, 2.6); c.shadowBlur = 0;
        c.save(); body(); c.clip();
        c.strokeStyle = "rgba(255,200,150,0.28)"; c.lineWidth = Math.max(0.7, r * 0.016);
        c.beginPath();
        for (let i = 0; i < 18; i++) {
          const x = (-0.6 + 1.2 * heroHash(i * 2.1)) * r, y = (-0.4 + 1.1 * heroHash(i * 3.7 + 1)) * r;
          c.moveTo(x, y); c.quadraticCurveTo(x + r * 0.03, y + r * 0.04, x + r * 0.01, y + r * 0.08);
        }
        c.stroke(); c.restore();
        // ground shockwave rings
        c.save(); c.globalCompositeOperation = "lighter";
        for (let k = 0; k < 3; k++) {
          const t = ts ? (ts / 900 + k / 3) % 1 : k / 3 + 0.2, rx = r * (0.45 + 0.68 * t);
          c.beginPath(); c.ellipse(0, r * 1.03, rx, rx * 0.13, 0, 0, TAU);
          c.strokeStyle = rgba(k % 2 ? pal.rim : pal.bright, 0.75 * (1 - t)); c.lineWidth = Math.max(1, r * 0.035 * (1 - t * 0.5)); c.stroke();
        }
        c.restore();
        // big padded feet
        for (const sx of [-1, 1]) {
          c.beginPath(); c.ellipse(sx * r * 0.52, r * 0.98, r * 0.2, r * 0.1, sx * 0.15, 0, TAU); fillInk(tan, 1.6);
          c.strokeStyle = "rgba(90,50,20,0.6)"; c.lineWidth = Math.max(0.7, r * 0.014);
          c.beginPath(); for (const k of [0.32, 0.46, 0.6]) { c.moveTo(sx * r * (0.32 + k * 0.5), r * 0.94); c.lineTo(sx * r * (0.32 + k * 0.5), r * 1.03); } c.stroke();
        }
        // tan chest plate (ink drawn first so only the outer outline survives the fill)
        const chest = () => { c.beginPath(); ell(-r * 0.17, -r * 0.18, r * 0.21, r * 0.16, 0.2); ell(r * 0.17, -r * 0.18, r * 0.21, r * 0.16, -0.2); ell(0, r * 0.1, r * 0.27, r * 0.22, 0); };
        chest(); c.strokeStyle = h.INK; c.lineWidth = 4; c.stroke();
        chest(); c.fillStyle = tan; c.fill();
        c.strokeStyle = "rgba(110,60,24,0.5)"; c.lineWidth = Math.max(0.8, r * 0.016);
        c.beginPath(); c.moveTo(-r * 0.3, -r * 0.06); c.quadraticCurveTo(0, r * 0.02, r * 0.3, -r * 0.06); c.moveTo(0, -r * 0.3); c.lineTo(0, -r * 0.05); c.stroke();
        // diagonal leather bandolier from the left shoulder to the right hip with a gold buckle
        c.save(); c.translate(-r * 0.015, -r * 0.0625); c.rotate(0.697);
        const SL = r * 0.54, SW = r * 0.065;
        rr(-SL, -SW, SL * 2, SW * 2, r * 0.02); fillInk(nbCloth(c, 0, -SW, 0, SW, WK_LEATHER), 1.6);
        c.beginPath(); c.moveTo(-SL + r * 0.02, 0); c.lineTo(SL - r * 0.02, 0);
        c.strokeStyle = "#ffffff"; c.lineWidth = Math.max(1.6, r * 0.04); c.stroke();
        c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.9, r * 0.022); c.stroke();
        for (const k of [-0.62, -0.38, 0.38, 0.62]) {
          rr(k * SL - r * 0.025, -SW * 1.15, r * 0.05, SW * 2.3, r * 0.012);
          fillInk(nbCloth(c, 0, -SW, 0, SW, [pal.rim, pal.bright, pal.deep]), 1.1);
        }
        rr(-r * 0.075, -SW * 1.35, r * 0.15, SW * 2.7, r * 0.02);
        fillInk(metal(-r * 0.075, -SW, r * 0.075, SW, WK_GOLD[0], pal.gold || WK_GOLD[1], WK_GOLD[2]), 1.3);
        rr(-r * 0.042, -SW * 0.8, r * 0.084, SW * 1.6, r * 0.012); fillInk(nbCloth(c, 0, -SW, 0, SW, WK_LEATHER), 0.9);
        c.beginPath(); c.moveTo(-r * 0.042, 0); c.lineTo(r * 0.03, 0); c.strokeStyle = WK_GOLD[2]; c.lineWidth = Math.max(1, r * 0.018); c.stroke();
        c.restore();
        // banded wooden powder-barrel shield
        const BY = r * 0.68, bw = r * 0.44, bh = r * 0.34;
        const barrel = () => {
          c.beginPath(); c.moveTo(-bw * 0.86, BY - bh); c.quadraticCurveTo(-bw * 1.1, BY, -bw * 0.86, BY + bh);
          c.lineTo(bw * 0.86, BY + bh); c.quadraticCurveTo(bw * 1.1, BY, bw * 0.86, BY - bh); c.closePath();
        };
        const wg = c.createLinearGradient(-bw, 0, bw, 0);
        wg.addColorStop(0, WK_WOOD[2]); wg.addColorStop(0.3, WK_WOOD[1]); wg.addColorStop(0.45, WK_WOOD[0]); wg.addColorStop(0.75, WK_WOOD[1]); wg.addColorStop(1, WK_WOOD[2]);
        barrel(); fillInk(wg, 2.2);
        c.save(); barrel(); c.clip();
        c.strokeStyle = "rgba(50,20,4,0.55)"; c.lineWidth = Math.max(0.8, r * 0.016);
        c.beginPath();
        for (const k of [-2, -1, 1, 2]) { const x = k * bw * 0.32; c.moveTo(x * 0.9, BY - bh); c.quadraticCurveTo(x * 1.08, BY, x * 0.9, BY + bh); }
        c.stroke();
        c.strokeStyle = "rgba(255,220,170,0.25)"; c.beginPath();
        for (let i = 0; i < 8; i++) { const x = (-0.36 + 0.72 * heroHash(i * 5.1)) * r, y = BY + (-0.25 + 0.5 * heroHash(i * 1.3)) * r; c.moveTo(x, y); c.lineTo(x + r * 0.01, y + r * 0.07); }
        c.stroke(); c.restore();
        for (const hy of [-0.7, 0.7]) {
          const y = BY + hy * bh, hx = bw * 0.93, bt = r * 0.035;
          c.beginPath(); c.moveTo(-hx, y - bt); c.quadraticCurveTo(0, y - bt + r * 0.06, hx, y - bt);
          c.lineTo(hx, y + bt); c.quadraticCurveTo(0, y + bt + r * 0.06, -hx, y + bt); c.closePath();
          fillInk(nbCloth(c, 0, y - bt, 0, y + bt + r * 0.06, [pal.rim, pal.bright, pal.deep]), 1.3);
          for (const k of [-0.6, 0, 0.6]) { c.beginPath(); c.arc(k * hx, y + r * (k ? 0.016 : 0.03), r * 0.013, 0, TAU); c.fillStyle = "rgba(255,255,255,0.8)"; c.fill(); }
        }
        c.beginPath(); c.ellipse(0, BY - bh, bw * 0.86, r * 0.07, 0, 0, TAU); fillInk(nbCloth(c, -bw, 0, bw, 0, [WK_WOOD[0], WK_WOOD[1], WK_WOOD[0]]), 1.5);
        c.beginPath(); c.ellipse(0, BY - bh, bw * 0.66, r * 0.045, 0, 0, TAU); c.strokeStyle = "rgba(60,26,6,0.5)"; c.lineWidth = 1; c.stroke();
        // blast emblem: jagged starburst with a hot core
        c.beginPath();
        for (let i = 0; i < 24; i++) {
          const a = -Math.PI / 2 + i * TAU / 24, R = r * (i % 2 ? 0.1 : 0.17);
          const x = Math.cos(a) * R, y = BY + r * 0.02 + Math.sin(a) * R * 0.9;
          if (i) c.lineTo(x, y); else c.moveTo(x, y);
        }
        c.closePath();
        const eg = c.createRadialGradient(0, BY, r * 0.02, 0, BY, r * 0.17);
        eg.addColorStop(0, "#fff6b0"); eg.addColorStop(0.45, "#ffb02a"); eg.addColorStop(1, "#d8261a");
        fillInk(eg, 1.2);
        heroStar(c, 0, BY + r * 0.02, r * 0.06, 0.45); c.fillStyle = h.INK; c.fill();
        // sparking fuse on the lid
        c.beginPath(); c.moveTo(r * 0.18, BY - bh); c.quadraticCurveTo(r * 0.24, BY - bh - r * 0.1, r * 0.3, BY - bh - r * 0.08);
        c.strokeStyle = h.INK; c.lineWidth = Math.max(1.6, r * 0.035); c.stroke();
        wkSparkle(c, r * 0.31, BY - bh - r * 0.09, r * (0.05 + 0.025 * p), WK_SPARK, ts ? ts / 90 : 0);
        // drumming arms and fists, with impact bursts on each hit
        for (let i = 0; i < 2; i++) {
          const sx = i ? 1 : -1, lift = lifts[i] * r * 0.14, fx = sx * r * 0.33, fy = r * 0.21 - lift;
          heroLimb(c, h, sx * r * 0.56, -r * 0.34, sx * r * 0.92, r * 0.02, fx, fy, Math.max(6, r * 0.27), fur);
          c.beginPath(); c.ellipse(sx * r * 0.62, -r * 0.2, r * 0.1, r * 0.05, sx * 0.9, 0, TAU); c.fillStyle = "rgba(255,210,170,0.25)"; c.fill();
          pcFist(c, h, fx, fy, r * 0.15, nbCloth(c, -r * 0.15, -r * 0.15, r * 0.15, r * 0.15, WK_TANFUR), Math.PI / 2);
          if (lifts[i] < 0.3) {
            const a = 1 - lifts[i] / 0.3;
            c.save(); c.globalCompositeOperation = "lighter";
            c.strokeStyle = rgba(WK_SPARK, 0.8 * a); c.lineWidth = Math.max(1, r * 0.025);
            c.beginPath();
            for (let k = 0; k < 5; k++) { const ang = -Math.PI * (0.15 + k * 0.175); c.moveTo(fx + Math.cos(ang) * r * 0.17, r * 0.34 + Math.sin(ang) * r * 0.05); c.lineTo(fx + Math.cos(ang) * r * 0.27, r * 0.34 + Math.sin(ang) * r * 0.12); }
            c.stroke(); c.restore();
            wkSparkle(c, fx + sx * r * 0.12, r * 0.33, r * 0.05 * a, pal.rim, 0.4, a);
          }
        }
        // head: ears, peaked fur crown, tan face mask, heavy brow, grin
        const fd = nbCloth(c, -r * 0.35, -r * 1.05, r * 0.35, -r * 0.35, WK_FUR);
        for (const sx of [-1, 1]) {
          c.beginPath(); c.arc(sx * r * 0.33, -r * 0.62, r * 0.08, 0, TAU); fillInk(fd, 1.4);
          c.beginPath(); c.arc(sx * r * 0.33, -r * 0.62, r * 0.045, 0, TAU); c.fillStyle = WK_TANFUR[1]; c.fill();
        }
        c.beginPath(); c.moveTo(-r * 0.32, -r * 0.5);
        c.bezierCurveTo(-r * 0.38, -r * 0.86, -r * 0.16, -r * 0.96, -r * 0.08, -r * 0.95);
        c.lineTo(-r * 0.07, -r * 1.03); c.lineTo(-r * 0.01, -r * 0.96); c.lineTo(r * 0.03, -r * 1.1); c.lineTo(r * 0.08, -r * 0.95);
        c.bezierCurveTo(r * 0.18, -r * 0.96, r * 0.38, -r * 0.86, r * 0.32, -r * 0.5);
        c.quadraticCurveTo(0, -r * 0.3, -r * 0.32, -r * 0.5); c.closePath();
        fillInk(fd, 2);
        const face = () => { c.beginPath(); ell(-r * 0.1, -r * 0.66, r * 0.12, r * 0.1, 0); ell(r * 0.1, -r * 0.66, r * 0.12, r * 0.1, 0); ell(0, -r * 0.49, r * 0.2, r * 0.13, 0); };
        face(); c.strokeStyle = h.INK; c.lineWidth = 3.4; c.stroke();
        face(); c.fillStyle = nbCloth(c, 0, -r * 0.78, 0, -r * 0.36, WK_TANFUR); c.fill();
        c.beginPath(); c.moveTo(-r * 0.25, -r * 0.71); c.quadraticCurveTo(-r * 0.1, -r * 0.83, 0, -r * 0.72); c.quadraticCurveTo(r * 0.1, -r * 0.83, r * 0.25, -r * 0.71);
        c.lineTo(r * 0.22, -r * 0.67); c.quadraticCurveTo(r * 0.1, -r * 0.75, 0, -r * 0.67); c.quadraticCurveTo(-r * 0.1, -r * 0.75, -r * 0.22, -r * 0.67); c.closePath();
        fillInk(WK_FUR[2], 1);
        for (const sx of [-1, 1]) {
          c.beginPath(); c.ellipse(sx * r * 0.09, -r * 0.635, r * 0.045, r * 0.05, 0, 0, TAU); fillInk("#ffffff", 1);
          c.beginPath(); c.arc(sx * r * 0.09 + r * 0.008, -r * 0.63, r * 0.028, 0, TAU); c.fillStyle = "#2a1408"; c.fill();
          c.beginPath(); c.arc(sx * r * 0.09 - r * 0.004, -r * 0.642, r * 0.01, 0, TAU); c.fillStyle = "#ffffff"; c.fill();
          c.beginPath(); c.ellipse(sx * r * 0.045, -r * 0.535, r * 0.022, r * 0.014, sx * 0.4, 0, TAU); c.fillStyle = "#3a1c0a"; c.fill();
        }
        const grin = () => { c.beginPath(); c.moveTo(-r * 0.13, -r * 0.46); c.quadraticCurveTo(0, -r * 0.43, r * 0.13, -r * 0.46); c.quadraticCurveTo(0, -r * 0.33, -r * 0.13, -r * 0.46); c.closePath(); };
        grin(); fillInk("#4a0e12", 1.2);
        c.save(); grin(); c.clip(); c.fillStyle = "#fbf7ef"; c.fillRect(-r * 0.13, -r * 0.47, r * 0.26, r * 0.035); c.restore();
      },

      /* Spark Rodent — a chubby golden-yellow elemental electric summon in a high-speed dash: black-tipped pointed
         ears with side-coloured cuffs, side-coloured energy cheek nodes crackling with lightning arcs, a clean
         unmarked back and an angular zig-zag lightning-bolt tail with a glowing side-coloured tip, leaving
         thunderbolt trails behind. */
      trickster(c, pal, r, ts, h) {
        const { fillInk, pulse } = h;
        const p = pulse(90);
        const run = ts ? Math.sin(ts / 75) : 0;
        const yellow = nbCloth(c, -r * 0.5, -r * 0.7, r * 0.6, r * 0.7, WK_YELLOW);
        // tail: zig-zag bolt with a glowing side-coloured tip (base silhouette)
        c.save(); c.translate(-r * 0.3, r * 0.3); c.rotate(ts ? Math.sin(ts / 120) * 0.06 : 0); c.translate(r * 0.3, -r * 0.3);
        const tailPts = [[-0.3, 0.3], [-0.56, 0.2], [-0.46, 0.02], [-0.8, -0.12], [-0.68, -0.32], [-1.0, -0.6]].map(q => [q[0] * r, q[1] * r]);
        const tailW = [0.08, 0.12, 0.15, 0.22, 0.24, 0.04].map(w => w * r);
        wkBoltRibbon(c, tailPts, tailW); fillInk(yellow, 2); c.shadowBlur = 0;
        c.save(); wkBoltRibbon(c, tailPts, tailW); c.clip();
        const tg = c.createRadialGradient(-r * 0.94, -r * 0.55, 0, -r * 0.94, -r * 0.55, r * 0.2);
        tg.addColorStop(0, "#ffffff"); tg.addColorStop(0.35, pal.rim); tg.addColorStop(0.75, rgba(pal.bright, 0.8)); tg.addColorStop(1, rgba(pal.bright, 0));
        c.beginPath(); c.arc(-r * 0.92, -r * 0.52, r * 0.2, 0, TAU); c.fillStyle = tg; c.fill();
        c.restore();
        wkBoltRibbon(c, tailPts, tailW); h.ink(2);
        wkGlow(c, -r * 0.95, -r * 0.56, r * 0.19, pal.bright, 0.55 + 0.4 * p);
        c.restore();
        // dash trail: speed streaks and trailing thunderbolts
        c.save(); c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 5; i++) {
          const y = r * (0.05 + i * 0.13), off = ts ? ((ts / 180 + i * 0.31) % 1) * r * 0.2 : i * r * 0.04;
          c.beginPath(); c.moveTo(-r * 0.42 - off, y); c.lineTo(-r * (0.82 + 0.12 * heroHash(i)) - off * 0.6, y);
          c.strokeStyle = rgba(i % 2 ? pal.bright : WK_SPARK, 0.6); c.lineWidth = Math.max(1, r * 0.03); c.stroke();
        }
        c.restore();
        heroBolt(c, h, ts, -r * 0.42, r * 0.62, -r * 1.08, r * 0.52, Math.max(1, r * 0.03), WK_SPARK, 3, 5);
        heroBolt(c, h, ts, -r * 0.5, r * 0.28, -r * 1.02, r * 0.4, Math.max(0.9, r * 0.025), pal.bright, 7, 4);
        // hind leg pushing off
        const hfx = -r * (0.44 + run * 0.06);
        heroLimb(c, h, -r * 0.14, r * 0.5, -r * 0.3, r * 0.66, hfx + r * 0.06, r * 0.7, Math.max(3, r * 0.12), yellow);
        c.beginPath(); c.ellipse(hfx, r * 0.72, r * 0.13, r * 0.065, -0.4, 0, TAU); fillInk(yellow, 1.4);
        // chubby body with a soft sheen (no back markings)
        c.save(); c.translate(-r * 0.04, r * 0.3); c.rotate(0.25);
        c.beginPath(); c.ellipse(0, 0, r * 0.4, r * 0.36, 0, 0, TAU); fillInk(nbCloth(c, -r * 0.4, -r * 0.36, r * 0.4, r * 0.36, WK_YELLOW), 2.2);
        c.beginPath(); c.ellipse(r * 0.1, -r * 0.16, r * 0.16, r * 0.07, -0.3, 0, TAU); c.fillStyle = "rgba(255,255,255,0.32)"; c.fill();
        c.restore();
        // front leg striding and tiny forepaws
        const ffx = r * (0.34 + run * 0.06);
        heroLimb(c, h, r * 0.14, r * 0.5, r * 0.3, r * 0.58, ffx - r * 0.04, r * 0.72, Math.max(3, r * 0.12), yellow);
        c.beginPath(); c.ellipse(ffx, r * 0.75, r * 0.12, r * 0.06, 0.3, 0, TAU); fillInk(yellow, 1.4);
        for (const [ax, ay, bx, by] of [[0.2, 0.1, 0.44, 0.04], [0.12, 0.2, 0.38, 0.24]]) {
          heroLimb(c, h, ax * r, ay * r, (ax + bx) * 0.55 * r, (ay + by) * 0.5 * r - r * 0.02, bx * r, by * r, Math.max(2.5, r * 0.08), yellow);
          c.beginPath(); c.arc(bx * r, by * r, r * 0.045, 0, TAU); fillInk(yellow, 1.1);
        }
        // swept-back ears, head, eyes, cheeks and mouth
        const flop = run * r * 0.02;
        wkEar(c, h, pal, 0, -r * 0.5, -r * 0.42, -r * 1.0 + flop, r * 0.09, yellow);
        wkEar(c, h, pal, r * 0.3, -r * 0.56, r * 0.06, -r * 1.1 - flop, r * 0.09, yellow);
        c.beginPath(); c.ellipse(r * 0.2, -r * 0.3, r * 0.38, r * 0.32, -0.08, 0, TAU); fillInk(nbCloth(c, -r * 0.18, -r * 0.62, r * 0.58, 0, WK_YELLOW), 2.2);
        c.beginPath(); c.ellipse(r * 0.08, -r * 0.48, r * 0.14, r * 0.06, -0.3, 0, TAU); c.fillStyle = "rgba(255,255,255,0.35)"; c.fill();
        for (const [ex, ey, k] of [[0.1, -0.36, 1], [0.38, -0.38, 0.9]]) {
          c.beginPath(); c.ellipse(ex * r, ey * r, r * 0.055 * k, r * 0.07 * k, 0, 0, TAU); c.fillStyle = "#17121c"; c.fill();
          c.beginPath(); c.arc(ex * r - r * 0.015, ey * r - r * 0.025, r * 0.022 * k, 0, TAU); c.fillStyle = "#ffffff"; c.fill();
        }
        c.beginPath(); c.ellipse(r * 0.53, -r * 0.3, r * 0.02, r * 0.013, 0, 0, TAU); c.fillStyle = "#17121c"; c.fill();
        c.beginPath(); c.moveTo(r * 0.36, -r * 0.23); c.quadraticCurveTo(r * 0.39, -r * 0.19, r * 0.42, -r * 0.23); c.quadraticCurveTo(r * 0.45, -r * 0.19, r * 0.48, -r * 0.23);
        c.strokeStyle = h.INK; c.lineWidth = Math.max(0.9, r * 0.018); c.stroke();
        c.beginPath(); c.ellipse(r * 0.42, -r * 0.17, r * 0.035, r * 0.028, 0, 0, TAU); fillInk("#a0202c", 0.9);
        const cheeks = [[0.0, -0.18, 0.08, [[-1, -0.3], [-0.75, 0.55]]], [0.5, -0.2, 0.065, [[1, 0.1], [0.75, -0.6]]]];
        cheeks.forEach(([cx, cy, cr, dirs], ci) => {
          wkGlow(c, cx * r, cy * r, cr * r * 1.7, pal.bright, 0.35 + 0.35 * p);
          const cg = c.createRadialGradient(cx * r - cr * r * 0.3, cy * r - cr * r * 0.3, 0, cx * r, cy * r, cr * r);
          cg.addColorStop(0, "#ffffff"); cg.addColorStop(0.35, pal.rim); cg.addColorStop(1, pal.bright);
          c.beginPath(); c.arc(cx * r, cy * r, cr * r, 0, TAU); fillInk(cg, 1);
          c.save(); c.globalCompositeOperation = "lighter";
          c.beginPath(); c.arc(cx * r, cy * r, cr * r * 1.3, 0, TAU); c.strokeStyle = rgba(pal.rim, 0.35 + 0.4 * p); c.lineWidth = Math.max(0.8, r * 0.015); c.stroke();
          c.restore();
          const live = ts ? Math.floor(ts / 90 + ci) % 3 !== 0 : true;
          if (live) for (const [dx, dy] of dirs) {
            const L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
            heroBolt(c, h, ts, (cx + ux * cr) * r, (cy + uy * cr) * r, (cx + ux * (cr + 0.17)) * r, (cy + uy * (cr + 0.17)) * r, Math.max(0.8, r * 0.018), WK_SPARK, ci * 5 + dx * 3, 3);
          }
        });
        for (let i = 0; i < 4; i++) {
          const a = i * 1.7 + (ts ? ts / 300 : 0), R = r * (0.62 + 0.1 * heroHash(i));
          wkSparkle(c, r * 0.05 + Math.cos(a) * R * 0.8, r * 0.05 + Math.sin(a) * R * 0.7, r * 0.035, i % 2 ? WK_SPARK : pal.bright, a, 0.7 + 0.3 * p);
        }
      },

      /* Crested Steed — an emerald saurian steed in a mid-air flutter-jump: rounded snout, big expressive eyes, red
         head crest, a side-coloured saddle shell set in an ink-and-white rim band with a gold inner trim, orange
         booties with white-keyed side-coloured soles paddling over side-coloured flutter swirls, flicking a long
         pink sticky tongue out in an arc to catch a golden star mote. */
      wildrider(c, pal, r, ts, h) {
        const { fillInk, pulse } = h;
        const p = pulse(110);
        const flap = ts ? Math.sin(ts / 60) : 0.6;
        const bob = ts ? Math.sin(ts / 260) * r * 0.03 : 0;
        const green = nbCloth(c, -r * 0.5, -r * 0.9, r * 0.8, r * 0.7, WK_SAURIAN);
        const cream = nbCloth(c, 0, -r * 0.4, 0, r * 0.6, ["#ffffff", "#fff2d0", "#d8c08a"]);
        const red = (x0, y0, x1, y1) => nbCloth(c, x0, y0, x1, y1, WK_RED);
        // tail (base silhouette)
        c.save(); c.translate(0, bob);
        const sway = ts ? Math.sin(ts / 180) * r * 0.04 : 0;
        nbStrip(c, nbBezierPts(-r * 0.28, r * 0.36, -r * 0.5, r * 0.5, -r * 0.7, r * 0.56, -r * 0.9, r * 0.62 + sway, 10), r * 0.24, r * 0.04);
        fillInk(green, 2); c.shadowBlur = 0;
        c.restore();
        // side-coloured flutter swirls beneath the paddling feet
        c.save(); c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 3; i++) {
          const t = ts ? (ts / 500 + i / 3) % 1 : i / 3 + 0.15, x = r * (-0.3 + i * 0.22), y = r * (0.98 + 0.06 * t);
          c.beginPath(); c.arc(x, y, r * (0.05 + 0.08 * t), Math.PI * 0.1, Math.PI * 1.6);
          c.strokeStyle = rgba(i % 2 ? pal.rim : pal.bright, 0.85 * (1 - t)); c.lineWidth = Math.max(1, r * 0.03); c.stroke();
        }
        c.restore();
        c.save(); c.translate(0, bob);
        // flutter-kicking legs with orange booties and side-coloured soles
        const leg = (bx, ph) => {
          const fx = bx + ph * r * 0.12, fy = r * 0.86 - Math.max(0, ph) * r * 0.06;
          heroLimb(c, h, bx + r * 0.06, r * 0.48, bx + r * 0.12 + ph * r * 0.05, r * 0.68, fx, fy - r * 0.04, Math.max(3.5, r * 0.14), green);
          c.beginPath(); c.ellipse(fx + r * 0.04, fy, r * 0.13, r * 0.08, 0.1, 0, TAU); fillInk(nbCloth(c, fx, fy - r * 0.08, fx, fy + r * 0.08, WK_BOOTIE), 1.5);
          c.beginPath(); c.ellipse(fx + r * 0.04, fy, r * 0.13, r * 0.08, 0.1, Math.PI * 0.12, Math.PI * 0.88);
          c.strokeStyle = "#ffffff"; c.lineWidth = Math.max(2.2, r * 0.06); c.stroke();
          c.strokeStyle = pal.bright; c.lineWidth = Math.max(1.2, r * 0.035); c.stroke();
          c.beginPath(); c.ellipse(fx, fy - r * 0.035, r * 0.05, r * 0.022, 0.1, 0, TAU); c.fillStyle = "rgba(255,255,255,0.45)"; c.fill();
        };
        leg(-r * 0.24, -flap);
        // round body, cream belly and the side-coloured saddle shell in a white rim band with gold inner trim
        c.beginPath(); c.ellipse(-r * 0.06, r * 0.2, r * 0.34, r * 0.4, -0.25, 0, TAU); fillInk(green, 2.2);
        c.beginPath(); c.ellipse(r * 0.06, r * 0.28, r * 0.18, r * 0.3, -0.25, 0, TAU); fillInk(cream, 1.4);
        c.beginPath(); c.ellipse(-r * 0.26, r * 0.02, r * 0.275, r * 0.185, -0.7, 0, TAU); fillInk("#ffffff", 1.8);
        c.beginPath(); c.ellipse(-r * 0.26, r * 0.02, r * 0.235, r * 0.145, -0.7, 0, TAU);
        fillInk(nbCloth(c, -r * 0.45, -r * 0.15, -r * 0.1, r * 0.2, [pal.rim, pal.bright, pal.deep]), 1.3);
        c.beginPath(); c.ellipse(-r * 0.26, r * 0.02, r * 0.175, r * 0.1, -0.7, 0, TAU);
        c.strokeStyle = h.INK; c.lineWidth = Math.max(1.8, r * 0.04); c.stroke();
        c.strokeStyle = WK_GOLD[1]; c.lineWidth = Math.max(1, r * 0.022); c.stroke();
        c.beginPath(); c.ellipse(-r * 0.3, -r * 0.04, r * 0.08, r * 0.035, -0.7, 0, TAU); c.fillStyle = "rgba(255,255,255,0.45)"; c.fill();
        leg(r * 0.06, flap);
        // little forearm
        heroLimb(c, h, r * 0.16, r * 0.12, r * 0.3, r * 0.22, r * 0.36, r * 0.1, Math.max(2.5, r * 0.08), green);
        c.beginPath(); c.arc(r * 0.37, r * 0.09, r * 0.045, 0, TAU); fillInk(green, 1.1);
        // neck, red head crest, cranium, cream jaw, big rounded snout
        heroLimb(c, h, r * 0.04, r * 0.0, r * 0.08, -r * 0.2, r * 0.2, -r * 0.36, Math.max(5, r * 0.22), green);
        [[0.02, -0.68, 0.07], [-0.05, -0.54, 0.065], [-0.05, -0.4, 0.055]].forEach(([x, y, s]) => {
          c.beginPath(); c.arc(x * r, y * r, s * r, 0, TAU); fillInk(red(x * r - s * r, y * r - s * r, x * r + s * r, y * r + s * r), 1.3);
        });
        c.beginPath(); c.ellipse(r * 0.24, -r * 0.52, r * 0.24, r * 0.22, 0, 0, TAU); fillInk(green, 2);
        c.beginPath(); c.ellipse(r * 0.48, -r * 0.32, r * 0.22, r * 0.08, -0.05, 0, TAU); fillInk(cream, 1.4);
        c.beginPath(); c.ellipse(r * 0.56, -r * 0.46, r * 0.25, r * 0.19, -0.1, 0, TAU); fillInk(green, 2);
        c.beginPath(); c.ellipse(r * 0.5, -r * 0.56, r * 0.12, r * 0.05, -0.2, 0, TAU); c.fillStyle = "rgba(255,255,255,0.4)"; c.fill();
        for (const [nx, ny] of [[0.68, -0.56], [0.76, -0.52]]) { c.beginPath(); c.ellipse(nx * r, ny * r, r * 0.02, r * 0.03, 0.3, 0, TAU); c.fillStyle = "#0e2a10"; c.fill(); }
        c.beginPath(); c.ellipse(r * 0.4, -r * 0.4, r * 0.05, r * 0.03, 0, 0, TAU); c.fillStyle = "rgba(255,110,130,0.45)"; c.fill();
        // big expressive eyes glancing at the star
        for (const [ex, ey] of [[0.18, -0.76], [0.34, -0.78]]) {
          c.beginPath(); c.ellipse(ex * r, ey * r, r * 0.085, r * 0.12, 0, 0, TAU); fillInk("#ffffff", 1.4);
          c.beginPath(); c.ellipse(ex * r + r * 0.028, ey * r - r * 0.02, r * 0.04, r * 0.06, 0, 0, TAU); c.fillStyle = "#120c14"; c.fill();
          c.beginPath(); c.arc(ex * r + r * 0.016, ey * r - r * 0.045, r * 0.016, 0, TAU); c.fillStyle = "#ffffff"; c.fill();
        }
        // long pink sticky tongue arcing out to the star mote
        const MX = r * 0.74, MY = -r * 0.36, TX = r * 0.98, TY = -r * 0.86 - bob, QX = r * 1.12, QY = -r * 0.36;
        const e = ts ? 0.55 + 0.45 * Math.sin(ts / 230) : 1;
        const tipX = MX + (TX - MX) * e, tipY = MY + (TY - MY) * e, qx = MX + (QX - MX) * e, qy = MY + (QY - MY) * e;
        const tongue = () => { c.beginPath(); c.moveTo(MX, MY); c.quadraticCurveTo(qx, qy, tipX, tipY); };
        tongue(); c.strokeStyle = h.INK; c.lineWidth = r * 0.07 + 2.4; c.stroke();
        tongue(); c.strokeStyle = WK_TONGUE[1]; c.lineWidth = r * 0.07; c.stroke();
        tongue(); c.strokeStyle = rgba(WK_TONGUE[0], 0.7); c.lineWidth = Math.max(0.7, r * 0.02); c.stroke();
        c.beginPath(); c.ellipse(tipX, tipY, r * 0.06, r * 0.05, 0, 0, TAU); fillInk(nbCloth(c, tipX, tipY - r * 0.05, tipX, tipY + r * 0.05, WK_TONGUE), 1.3);
        c.restore();
        // golden star mote with a side-coloured halo
        const SX = r * 0.98, SY = -r * 0.86;
        wkGlow(c, SX, SY, r * 0.18, WK_STAR[1], 0.7 + 0.3 * p);
        c.save(); c.globalCompositeOperation = "lighter";
        c.beginPath(); c.arc(SX, SY, r * 0.135, 0, TAU); c.strokeStyle = rgba(pal.bright, 0.5 + 0.4 * p); c.lineWidth = Math.max(1, r * 0.025); c.stroke();
        c.restore();
        wkStar(c, h, SX, SY, r * 0.1, ts ? ts / 500 : 0.2, WK_STAR, 1.1);
      },

      /* Forest Swordsman — a trailing emerald pointed cap over golden hair and elf ears, green tunic over white
         linen with a leather chest baldric and side-coloured buckle, a gleaming triangular-tipped sword with wing
         quillons raised high, a wood-and-iron kite shield with white-keyed side-coloured trim and a radiant
         four-point golden compass-star crest, and a glowing winged fairy wisp orbiting around him. */
      skirmisher(c, pal, r, ts, h) {
        const { fillInk, poly, rr, pulse, metal } = h;
        const p = pulse(140);
        const orb = ts ? ts / 700 : 0.9;
        const tunic = nbCloth(c, -r * 0.4, -r * 0.45, r * 0.4, r * 0.5, WK_TUNIC);
        const linen = nbCloth(c, -r * 0.3, 0, r * 0.3, 0, WK_LINEN);
        const fairy = () => {
          const fx = Math.cos(orb) * r * 0.82, fy = -r * 0.5 + Math.sin(orb) * r * 0.24;
          for (let i = 1; i <= 3; i++) {
            const a = orb - i * 0.22;
            wkSparkle(c, Math.cos(a) * r * 0.82, -r * 0.5 + Math.sin(a) * r * 0.24, r * 0.03 * (1 - i * 0.22), pal.rim, a, 0.7 - i * 0.15);
          }
          wkGlow(c, fx, fy, r * 0.16, pal.rim, 0.75 + 0.25 * p);
          const wf = ts ? Math.abs(Math.sin(ts / 40)) : 0.7;
          c.save(); c.globalCompositeOperation = "lighter";
          for (const sx of [-1, 1]) {
            c.beginPath(); c.ellipse(fx + sx * r * 0.06, fy - r * 0.035, r * 0.07, r * 0.032, sx * (0.5 + 0.35 * wf), 0, TAU);
            c.fillStyle = "rgba(255,255,255,0.45)"; c.fill(); c.strokeStyle = rgba(pal.bright, 0.8); c.lineWidth = Math.max(0.6, r * 0.012); c.stroke();
            c.beginPath(); c.ellipse(fx + sx * r * 0.05, fy + r * 0.03, r * 0.045, r * 0.022, -sx * (0.4 + 0.25 * wf), 0, TAU);
            c.fillStyle = "rgba(255,255,255,0.35)"; c.fill();
          }
          c.restore();
          c.beginPath(); c.arc(fx, fy, r * 0.035, 0, TAU); c.fillStyle = "#ffffff"; c.fill();
        };
        if (Math.sin(orb) < 0) fairy();
        // trailing tip of the pointed cap (behind the head)
        const sway = ts ? Math.sin(ts / 380) * r * 0.05 : 0;
        c.beginPath(); c.moveTo(-r * 0.12, -r * 1.0);
        c.quadraticCurveTo(-r * 0.46, -r * 0.98 + sway, -r * 0.7, -r * 0.58 + sway);
        c.quadraticCurveTo(-r * 0.42, -r * 0.76, -r * 0.2, -r * 0.8); c.closePath();
        fillInk(nbCloth(c, -r * 0.7, -r * 1.0, -r * 0.1, -r * 0.6, WK_TUNIC), 1.8); c.shadowBlur = 0;
        // white linen tights and leather boots
        jlLegs(c, h, r, linen, nbCloth(c, 0, r * 0.78, 0, r * 1.13, WK_LEATHER), 0.78);
        // green tunic with a notched hem, linen collar, belt, chest baldric with side-coloured buckle
        c.beginPath(); c.moveTo(-r * 0.32, -r * 0.42); c.quadraticCurveTo(-r * 0.4, -r * 0.1, -r * 0.36, r * 0.2);
        c.lineTo(-r * 0.42, r * 0.5); c.lineTo(-r * 0.2, r * 0.44); c.lineTo(0, r * 0.52); c.lineTo(r * 0.2, r * 0.44); c.lineTo(r * 0.42, r * 0.5);
        c.lineTo(r * 0.36, r * 0.2); c.quadraticCurveTo(r * 0.4, -r * 0.1, r * 0.32, -r * 0.42); c.quadraticCurveTo(0, -r * 0.5, -r * 0.32, -r * 0.42); c.closePath();
        fillInk(tunic, 2.4);
        poly([-0.14, -0.46, 0.14, -0.46, 0, -0.3]); fillInk(linen, 1.3);
        rr(-r * 0.37, r * 0.12, r * 0.74, r * 0.08, r * 0.02); fillInk(nbCloth(c, 0, r * 0.12, 0, r * 0.2, WK_LEATHER), 1.4);
        rr(-r * 0.05, r * 0.11, r * 0.1, r * 0.1, r * 0.02); fillInk(pal.bright, 1.1);
        poly([0.2, -0.45, 0.31, -0.39, -0.32, 0.17, -0.4, 0.1]); fillInk(nbCloth(c, r * 0.3, -r * 0.4, -r * 0.4, r * 0.15, WK_LEATHER), 1.5);
        rr(-r * 0.07, -r * 0.2, r * 0.13, r * 0.11, r * 0.02); fillInk(metal(-r * 0.07, -r * 0.2, r * 0.06, -r * 0.09, ...WK_BRASS), 1.2);
        rr(-r * 0.04, -r * 0.17, r * 0.07, r * 0.05, r * 0.01); c.fillStyle = pal.bright; c.fill();
        // shield arm (mostly hidden) and the raised sword arm
        heroLimb(c, h, -r * 0.3, -r * 0.34, -r * 0.5, -r * 0.12, -r * 0.38, r * 0.02, Math.max(3.5, r * 0.12), linen);
        heroLimb(c, h, r * 0.3, -r * 0.34, r * 0.56, -r * 0.18, r * 0.46, r * 0.0, Math.max(3.5, r * 0.12), linen);
        for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(sx * r * 0.31, -r * 0.36, r * 0.1, r * 0.08, sx * 0.4, 0, TAU); fillInk(tunic, 1.4); }
        // gleaming sword with wing quillons (local frame: blade points to -y)
        const HX = r * 0.46, HY = 0, dx = 0.4085, dy = -0.9128;
        c.save(); c.translate(HX + dx * r * 0.08, HY + dy * r * 0.08); c.rotate(0.4206);
        const hilt = ["#b8c4ff", "#3a48c8", "#141c5a"];
        rr(-r * 0.025, 0, r * 0.05, r * 0.12, r * 0.015); fillInk(nbCloth(c, -r * 0.03, 0, r * 0.03, 0, hilt), 1.1);
        c.beginPath(); c.arc(0, r * 0.13, r * 0.035, 0, TAU); fillInk(metal(-r * 0.03, r * 0.1, r * 0.03, r * 0.16, ...WK_GOLD), 1);
        poly([-0.05, 0, -0.05, -0.7, 0, -0.86, 0.05, -0.7, 0.05, 0]);
        const bg = c.createLinearGradient(-r * 0.05, 0, r * 0.05, 0);
        bg.addColorStop(0, "#8e98ac"); bg.addColorStop(0.45, "#ffffff"); bg.addColorStop(0.55, "#c8d2e4"); bg.addColorStop(1, "#5c6478");
        fillInk(bg, 1.4);
        c.beginPath(); c.moveTo(0, -r * 0.06); c.lineTo(0, -r * 0.62); c.strokeStyle = "rgba(60,80,150,0.55)"; c.lineWidth = Math.max(0.8, r * 0.018); c.stroke();
        const gt = ts ? (ts / 900) % 1 : 0.45;
        wkSparkle(c, 0, -r * (0.1 + 0.66 * gt), r * 0.07, "#ffffff", 0, 0.9);
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(sx * r * 0.04, r * 0.01);
          c.quadraticCurveTo(sx * r * 0.17, r * 0.02, sx * r * 0.21, -r * 0.12);
          c.quadraticCurveTo(sx * r * 0.13, -r * 0.05, sx * r * 0.04, -r * 0.04); c.closePath();
          fillInk(nbCloth(c, 0, -r * 0.12, 0, r * 0.02, hilt), 1.2);
        }
        rr(-r * 0.06, -r * 0.035, r * 0.12, r * 0.06, r * 0.02); fillInk(nbCloth(c, -r * 0.06, 0, r * 0.06, 0, hilt), 1.1);
        poly([0, -0.03, 0.025, 0, 0, 0.03, -0.025, 0]); c.fillStyle = pal.bright; c.fill();
        c.restore();
        pcFist(c, h, HX, HY, r * 0.07, nbCloth(c, -r * 0.07, -r * 0.07, r * 0.07, r * 0.07, WK_SKIN_SH), -1.15);
        // wood-and-iron kite shield with white-keyed side trim and the radiant compass-star crest
        const SC = -r * 0.36, SCY = r * 0.14;
        const kite = (k) => {
          c.save(); c.translate(SC, SCY); c.scale(k, k); c.translate(-SC, -SCY);
          c.beginPath(); c.moveTo(-r * 0.6, -r * 0.28); c.quadraticCurveTo(-r * 0.36, -r * 0.36, -r * 0.12, -r * 0.28);
          c.quadraticCurveTo(-r * 0.1, r * 0.2, -r * 0.36, r * 0.66); c.quadraticCurveTo(-r * 0.62, r * 0.2, -r * 0.6, -r * 0.28); c.closePath();
          c.restore();
        };
        kite(1); fillInk(nbCloth(c, -r * 0.6, 0, -r * 0.12, 0, WK_WOOD), 2.2);
        c.save(); kite(1); c.clip();
        c.strokeStyle = "rgba(50,20,4,0.5)"; c.lineWidth = Math.max(0.8, r * 0.015);
        c.beginPath(); for (const x of [-0.52, -0.44, -0.28, -0.2]) { c.moveTo(x * r, -r * 0.36); c.lineTo(x * r, r * 0.66); } c.stroke();
        c.restore();
        kite(1); c.strokeStyle = metal(-r * 0.6, -r * 0.3, -r * 0.12, r * 0.6, ...WK_IRON); c.lineWidth = Math.max(1.6, r * 0.05); c.stroke();
        kite(0.8); c.strokeStyle = "#ffffff"; c.lineWidth = Math.max(1.8, r * 0.046); c.stroke();
        c.strokeStyle = pal.bright; c.lineWidth = Math.max(1, r * 0.026); c.stroke();
        for (const [x, y] of [[-0.56, -0.25], [-0.16, -0.25], [-0.5, 0.3], [-0.22, 0.3]]) pcRivet(c, x * r, y * r, r * 0.02);
        wkStarCrest(c, h, pal, SC, r * 0.02, r * 0.14);
        // head: elf ears, golden hair, youthful face, bangs and the pointed cap crown
        const skin = nbCloth(c, -r * 0.2, -r * 0.9, r * 0.2, -r * 0.45, WK_SKIN_SH);
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(sx * r * 0.16, -r * 0.72); c.quadraticCurveTo(sx * r * 0.32, -r * 0.8, sx * r * 0.42, -r * 0.84);
          c.quadraticCurveTo(sx * r * 0.32, -r * 0.66, sx * r * 0.16, -r * 0.6); c.closePath(); fillInk(skin, 1.3);
        }
        const hair = nbCloth(c, 0, -r * 0.95, 0, -r * 0.55, WK_HAIR);
        c.beginPath(); c.ellipse(0, -r * 0.8, r * 0.22, r * 0.16, 0, 0, TAU); fillInk(hair, 1.5);
        for (const sx of [-1, 1]) { poly([sx * 0.2, -0.8, sx * 0.23, -0.58, sx * 0.17, -0.62]); fillInk(hair, 1.1); }
        nbFace(c, h, r, -0.64, 0.19, WK_SKIN);
        poly([-0.2, -0.78, -0.15, -0.66, -0.1, -0.76, -0.03, -0.64, 0.02, -0.76, 0.09, -0.65, 0.12, -0.77, 0.19, -0.68, 0.21, -0.82, 0, -0.88]);
        fillInk(hair, 1.2);
        for (const sx of [-1, 1]) {
          nbEye(c, h, r, sx * r * 0.075, -r * 0.62, sx, "#2a7ae8");
          c.beginPath(); c.moveTo(sx * r * 0.03, -r * 0.685); c.lineTo(sx * r * 0.13, -r * 0.705);
          c.strokeStyle = WK_HAIR[2]; c.lineWidth = Math.max(1, r * 0.022); c.stroke();
        }
        c.beginPath(); c.moveTo(-r * 0.04, -r * 0.5); c.quadraticCurveTo(0, -r * 0.48, r * 0.04, -r * 0.5);
        c.strokeStyle = h.INK; c.lineWidth = Math.max(0.9, r * 0.018); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.8); c.quadraticCurveTo(-r * 0.22, -r * 1.06, r * 0.02, -r * 1.06);
        c.quadraticCurveTo(r * 0.24, -r * 1.04, r * 0.22, -r * 0.8); c.quadraticCurveTo(0, -r * 0.88, -r * 0.22, -r * 0.8); c.closePath();
        fillInk(tunic, 1.8);
        c.beginPath(); c.ellipse(-r * 0.06, -r * 0.98, r * 0.09, r * 0.03, -0.2, 0, TAU); c.fillStyle = "rgba(255,255,255,0.3)"; c.fill();
        if (Math.sin(orb) >= 0) fairy();
      },

      /* Armored Bounty Hunter — futuristic titanium-gunmetal power armour over cobalt under-plating with gold trim
         accents, a rounded helmet with a gold crest fin and a glowing teal-cyan visor slit with a sweeping scan grid,
         massive spherical pauldrons with cobalt bands and white-ringed side-coloured luminous cores, and a heavy
         cylindrical arm cannon with heat vents charging a pulsing emerald plasma sphere ringed with crackling sparks. */
      harrower(c, pal, r, ts, h) {
        const { fillInk, poly, rr, pulse, metal } = h;
        const p = pulse(100);
        const shell = nbCloth(c, -r * 0.5, -r * 0.7, r * 0.5, r * 0.7, WK_ARMOR);
        const cobalt = nbCloth(c, -r * 0.5, -r * 0.7, r * 0.5, r * 0.7, WK_ARMOR_RED);
        const gold = (x0, y0, x1, y1) => metal(x0, y0, x1, y1, WK_GOLD[0], pal.gold || WK_GOLD[1], WK_GOLD[2]);
        // armoured legs: thighs, knee pads, shins, boots
        for (const sx of [-1, 1]) {
          poly([sx * 0.06, 0.34, sx * 0.32, 0.34, sx * 0.3, 0.66, sx * 0.08, 0.66]); fillInk(shell, 2);
          c.shadowBlur = 0;
          poly([sx * 0.08, 0.7, sx * 0.3, 0.7, sx * 0.28, 0.96, sx * 0.1, 0.96]); fillInk(shell, 1.8);
          poly([sx * 0.05, 0.93, sx * 0.32, 0.93, sx * 0.36, 1.12, sx * 0.03, 1.12]); fillInk(cobalt, 1.8);
          c.beginPath(); c.ellipse(sx * r * 0.19, r * 0.68, r * 0.1, r * 0.07, 0, 0, TAU); fillInk(cobalt, 1.5);
          c.strokeStyle = "rgba(8,14,30,0.55)"; c.lineWidth = Math.max(0.7, r * 0.014);
          c.beginPath(); c.moveTo(sx * r * 0.08, r * 0.5); c.lineTo(sx * r * 0.31, r * 0.5); c.moveTo(sx * r * 0.09, r * 0.83); c.lineTo(sx * r * 0.29, r * 0.83); c.stroke();
          c.beginPath(); c.ellipse(sx * r * 0.16, r * 0.66, r * 0.04, r * 0.02, 0, 0, TAU); c.fillStyle = "rgba(255,255,255,0.45)"; c.fill();
        }
        // cobalt torso with a titanium chest plate (gold trim), ab segments and a white-ringed side-coloured belt core
        jlTorso(c, r, 0.34, 0.26, -0.44, 0.38); fillInk(cobalt, 2.4);
        poly([-0.3, -0.42, 0.3, -0.42, 0.25, -0.12, 0, -0.03, -0.25, -0.12]); fillInk(shell, 1.8);
        c.beginPath(); c.moveTo(-r * 0.27, -r * 0.15); c.lineTo(0, -r * 0.065); c.lineTo(r * 0.27, -r * 0.15);
        c.strokeStyle = h.INK; c.lineWidth = Math.max(2, r * 0.045); c.stroke();
        c.strokeStyle = gold(-r * 0.27, -r * 0.15, r * 0.27, -r * 0.06); c.lineWidth = Math.max(1, r * 0.026); c.stroke();
        c.beginPath(); c.moveTo(0, -r * 0.4); c.lineTo(0, -r * 0.06); c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = Math.max(0.8, r * 0.018); c.stroke();
        for (const y of [0.0, 0.09, 0.18]) { rr(-r * 0.15, y * r, r * 0.3, r * 0.07, r * 0.025); fillInk(nbCloth(c, 0, y * r, 0, (y + 0.07) * r, WK_ARMOR_RED), 1.1); }
        rr(-r * 0.28, r * 0.27, r * 0.56, r * 0.08, r * 0.03); fillInk(metal(0, r * 0.27, 0, r * 0.35, ...WK_IRON), 1.4);
        c.beginPath(); c.arc(0, r * 0.31, r * 0.058, 0, TAU); fillInk("#ffffff", 1.1);
        c.beginPath(); c.arc(0, r * 0.31, r * 0.042, 0, TAU); fillInk(pal.bright, 0.9);
        wkGlow(c, 0, r * 0.31, r * 0.11, pal.bright, 0.6 + 0.4 * p);
        // left arm hanging with a cobalt gauntlet
        heroLimb(c, h, -r * 0.42, -r * 0.3, -r * 0.58, -r * 0.05, -r * 0.48, r * 0.15, Math.max(4, r * 0.15), shell);
        pcFist(c, h, -r * 0.48, r * 0.2, r * 0.09, nbCloth(c, -r * 0.09, -r * 0.09, r * 0.09, r * 0.09, WK_ARMOR_RED), Math.PI / 2);
        // right arm and the heavy cylindrical arm cannon
        heroLimb(c, h, r * 0.42, -r * 0.3, r * 0.52, -r * 0.12, r * 0.44, r * 0.02, Math.max(4, r * 0.15), shell);
        const ang = -0.16, CX0 = r * 0.38, CY0 = r * 0.04, CL = r * 0.52;
        c.save(); c.translate(CX0, CY0); c.rotate(ang);
        rr(0, -r * 0.14, CL, r * 0.28, r * 0.12); fillInk(nbCloth(c, 0, -r * 0.14, 0, r * 0.14, WK_ARMOR), 2.2);
        rr(-r * 0.03, -r * 0.155, r * 0.13, r * 0.31, r * 0.05); fillInk(nbCloth(c, 0, -r * 0.155, 0, r * 0.155, WK_ARMOR_RED), 1.6);
        for (let k = 0; k < 3; k++) {
          rr(r * (0.16 + k * 0.07), -r * 0.125, r * 0.035, r * 0.1, r * 0.012); c.fillStyle = "#0c1220"; c.fill();
          rr(r * (0.165 + k * 0.07), -r * 0.11, r * 0.025, r * 0.07, r * 0.01); c.fillStyle = rgba("#ff9a3a", 0.4 + 0.5 * p); c.fill();
        }
        c.beginPath(); c.moveTo(r * 0.06, -r * 0.08); c.lineTo(CL - r * 0.08, -r * 0.08); c.strokeStyle = "rgba(255,255,255,0.4)"; c.lineWidth = Math.max(0.8, r * 0.02); c.stroke();
        rr(CL - r * 0.08, -r * 0.15, r * 0.06, r * 0.3, r * 0.02); fillInk(pal.bright, 1.3);
        c.beginPath(); c.ellipse(CL, 0, r * 0.03, r * 0.1, 0, 0, TAU); fillInk("#0a1a10", 1.1);
        c.beginPath(); c.ellipse(CL, 0, r * 0.018, r * 0.065, 0, 0, TAU); c.fillStyle = rgba(WK_PLASMA, 0.6 + 0.4 * p); c.fill();
        c.restore();
        // heat shimmer rising from the vents
        c.save(); c.globalCompositeOperation = "lighter";
        c.strokeStyle = rgba("#ffbe72", 0.45); c.lineWidth = Math.max(0.7, r * 0.014);
        for (let k = 0; k < 3; k++) {
          const bx = CX0 + Math.cos(ang) * r * (0.18 + k * 0.07), by = CY0 + Math.sin(ang) * r * (0.18 + k * 0.07) - r * 0.13;
          c.beginPath();
          for (let i = 0; i <= 8; i++) {
            const y = by - i * r * 0.025, x = bx + Math.sin(i * 1.2 + (ts ? ts / 90 : 0) + k) * r * 0.015;
            if (i) c.lineTo(x, y); else c.moveTo(x, y);
          }
          c.stroke();
        }
        c.restore();
        // charging emerald plasma sphere with converging motes, spark ring and crackling arcs
        const PX = CX0 + Math.cos(ang) * (CL + r * 0.1), PY = CY0 + Math.sin(ang) * (CL + r * 0.1), PR = r * (0.085 + 0.035 * p);
        wkGlow(c, PX, PY, r * 0.2, WK_PLASMA, 0.75 + 0.25 * p);
        for (let i = 0; i < 6; i++) {
          const t = ts ? 1 - ((ts / 500 + i / 6) % 1) : (i + 0.5) / 6, a = i * TAU / 6 + 0.4, d = PR + (r * 0.18 - PR) * t;
          wkSparkle(c, PX + Math.cos(a) * d, PY + Math.sin(a) * d, r * 0.022 * (0.5 + t), i % 2 ? pal.bright : WK_PLASMA, a, 0.9 - t * 0.4);
        }
        const sg = c.createRadialGradient(PX - PR * 0.3, PY - PR * 0.3, 0, PX, PY, PR);
        sg.addColorStop(0, "#ffffff"); sg.addColorStop(0.4, "#c8ffd8"); sg.addColorStop(0.8, WK_PLASMA); sg.addColorStop(1, "#1a9a48");
        c.beginPath(); c.arc(PX, PY, PR, 0, TAU); c.fillStyle = sg; c.fill();
        c.save(); c.globalCompositeOperation = "lighter";
        c.beginPath(); c.arc(PX, PY, PR * 1.35, 0, TAU); c.strokeStyle = rgba(pal.bright, 0.5 + 0.4 * p); c.lineWidth = Math.max(1, r * 0.022); c.stroke();
        c.restore();
        for (let i = 0; i < 3; i++) {
          const a = i * TAU / 3 + (ts ? ts / 160 : 0.5);
          heroBolt(c, h, ts, PX + Math.cos(a) * r * 0.12, PY + Math.sin(a) * r * 0.12, PX + Math.cos(a + 0.9) * r * 0.15, PY + Math.sin(a + 0.9) * r * 0.15, Math.max(0.7, r * 0.014), WK_PLASMA, 11 + i * 4, 3, r * 0.02);
        }
        // massive spherical pauldrons with cobalt bands and white-ringed side-coloured luminous cores
        for (const sx of [-1, 1]) {
          const px = sx * r * 0.44, py = -r * 0.4;
          const pg = c.createRadialGradient(px - sx * r * 0.06, py - r * 0.08, r * 0.02, px, py, r * 0.22);
          pg.addColorStop(0, WK_ARMOR[0]); pg.addColorStop(0.6, WK_ARMOR[1]); pg.addColorStop(1, WK_ARMOR[2]);
          c.beginPath(); c.arc(px, py, r * 0.22, 0, TAU); fillInk(pg, 2);
          c.beginPath(); c.ellipse(px, py + r * 0.04, r * 0.215, r * 0.08, 0, 0.1, Math.PI - 0.1);
          c.strokeStyle = h.INK; c.lineWidth = r * 0.06 + 2; c.stroke();
          c.strokeStyle = WK_ARMOR_RED[1]; c.lineWidth = r * 0.06; c.stroke();
          const kx = px + sx * r * 0.02, ky = py - r * 0.06;
          wkGlow(c, kx, ky, r * 0.12, pal.bright, 0.55 + 0.45 * p);
          c.beginPath(); c.arc(kx, ky, r * 0.07, 0, TAU); fillInk("#ffffff", 1.2);
          c.beginPath(); c.arc(kx, ky, r * 0.053, 0, TAU); fillInk(pal.bright, 1);
          c.beginPath(); c.arc(kx - r * 0.015, ky - r * 0.018, r * 0.018, 0, TAU); c.fillStyle = "#ffffff"; c.fill();
        }
        // helmet with gold crest fin, gold ear pieces, cobalt chin plate and the teal-cyan visor slit with a sweeping scan grid
        for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 0.22, -r * 0.66, r * 0.06, 0, TAU); fillInk(gold(sx * r * 0.16, -r * 0.72, sx * r * 0.28, -r * 0.6), 1.4); }
        c.beginPath(); c.ellipse(0, -r * 0.7, r * 0.24, r * 0.26, 0, 0, TAU); fillInk(nbCloth(c, -r * 0.24, -r * 0.96, r * 0.24, -r * 0.44, WK_ARMOR), 2.2);
        poly([-0.035, -0.97, 0.035, -0.97, 0.03, -0.8, -0.03, -0.8]); fillInk(gold(-r * 0.035, -r * 0.97, r * 0.035, -r * 0.8), 1.2);
        poly([-0.15, -0.53, 0.15, -0.53, 0.1, -0.46, -0.1, -0.46]); fillInk(cobalt, 1.3);
        c.beginPath(); c.ellipse(-r * 0.1, -r * 0.86, r * 0.07, r * 0.035, -0.5, 0, TAU); c.fillStyle = "rgba(255,255,255,0.45)"; c.fill();
        const visor = () => {
          c.beginPath(); c.moveTo(-r * 0.18, -r * 0.76); c.quadraticCurveTo(0, -r * 0.82, r * 0.18, -r * 0.76);
          c.lineTo(r * 0.14, -r * 0.6); c.quadraticCurveTo(0, -r * 0.56, -r * 0.14, -r * 0.6); c.closePath();
        };
        const vg = c.createLinearGradient(0, -r * 0.8, 0, -r * 0.58);
        vg.addColorStop(0, "#04303a"); vg.addColorStop(0.5, WK_VISOR); vg.addColorStop(1, "#0b5f66");
        visor(); c.fillStyle = vg; c.fill();
        c.save(); visor(); c.clip();
        c.strokeStyle = "rgba(2,34,40,0.45)"; c.lineWidth = Math.max(0.5, r * 0.008);
        c.beginPath();
        for (let x = -0.16; x <= 0.161; x += 0.04) { c.moveTo(x * r, -r * 0.82); c.lineTo(x * r, -r * 0.56); }
        for (let y = -0.78; y <= -0.57; y += 0.04) { c.moveTo(-r * 0.18, y * r); c.lineTo(r * 0.18, y * r); }
        c.stroke();
        const sy = -r * (0.8 - 0.22 * (ts ? (ts / 700) % 1 : 0.4));
        c.beginPath(); c.moveTo(-r * 0.18, sy); c.lineTo(r * 0.18, sy); c.strokeStyle = "rgba(220,255,252,0.9)"; c.lineWidth = Math.max(0.8, r * 0.018); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.12, -r * 0.62); c.lineTo(-r * 0.02, -r * 0.8); c.lineTo(r * 0.03, -r * 0.8); c.lineTo(-r * 0.07, -r * 0.62); c.closePath();
        c.fillStyle = "rgba(255,255,255,0.28)"; c.fill();
        c.restore();
        visor(); h.ink(1.6);
        wkGlow(c, 0, -r * 0.68, r * 0.14, WK_VISOR, 0.35 + 0.2 * p);
      },

      /* Horned Shell Tyrant — a colossal reptilian warlord with a fanged roaring snout, flame-red spiked mane, curved
         ivory horns with side-coloured brass bands, a heavy spiked green carapace rimmed with a side-coloured spiked
         border and white conical spikes, spiked iron collar and wristbands, breathing a roaring torrent of orange and
         yellow fire that splashes across the stone floor. */
      fury(c, pal, r, ts, h) {
        const { fillInk, poly, rr, pulse, metal } = h;
        const p = pulse(110);
        const hide = nbCloth(c, -r * 0.4, -r * 0.9, r * 0.8, r * 0.9, WK_HIDE);
        const scale = nbCloth(c, -r * 0.2, -r * 0.6, r * 0.5, r * 0.7, WK_SCALE);
        const ivory = (x, y, s) => nbCloth(c, x - s, y - s, x + s, y + s, WK_IVORY);
        const sideRim = nbCloth(c, -r * 0.9, -r * 0.6, r * 0.2, r * 0.6, [pal.rim, pal.bright, pal.deep]);
        // stone floor (base silhouette)
        wkBricks(c, h, -r * 1.0, r * 0.98, r * 1.12, r * 1.14, 1, 6, WK_STONE); c.shadowBlur = 0;
        // carapace: side-coloured border spikes, green plated shell, side rim, white conical spikes
        const SX = -r * 0.34, SY = r * 0.02, SRX = r * 0.56, SRY = r * 0.62;
        for (let i = 0; i < 9; i++) {
          const a = Math.PI * (0.58 + i * 0.105);
          wkSpike(c, h, SX + Math.cos(a) * SRX * 0.98, SY + Math.sin(a) * SRY * 0.98, r * 0.12, r * 0.05, a, sideRim, 1);
        }
        const shell = () => { c.beginPath(); c.ellipse(SX, SY, SRX, SRY, 0, 0, TAU); };
        const shg = c.createRadialGradient(SX + r * 0.1, SY - r * 0.2, r * 0.05, SX, SY, SRX * 1.1);
        shg.addColorStop(0, WK_SHELL[0]); shg.addColorStop(0.55, WK_SHELL[1]); shg.addColorStop(1, WK_SHELL[2]);
        shell(); fillInk(shg, 2.4);
        c.save(); shell(); c.clip();
        c.strokeStyle = "rgba(8,40,12,0.55)"; c.lineWidth = Math.max(0.8, r * 0.018);
        c.beginPath();
        for (const [hx, hy] of [[-0.56, -0.3], [-0.74, 0.02], [-0.58, 0.34], [-0.32, -0.12], [-0.38, 0.18], [-0.2, -0.42], [-0.2, 0.44]]) {
          for (let k = 0; k <= 6; k++) { const a = k * Math.PI / 3, x = hx * r + Math.cos(a) * r * 0.13, y = hy * r + Math.sin(a) * r * 0.13; if (k) c.lineTo(x, y); else c.moveTo(x, y); }
        }
        c.stroke(); c.restore();
        c.beginPath(); c.ellipse(SX, SY, SRX * 0.95, SRY * 0.95, 0, 0, TAU); c.strokeStyle = sideRim; c.lineWidth = Math.max(2, r * 0.065); c.stroke();
        for (const [x, y, a] of [[-0.56, -0.3, -2.4], [-0.74, 0.02, Math.PI], [-0.58, 0.34, 2.4], [-0.32, -0.12, -2.0], [-0.38, 0.18, 2.8]]) {
          c.beginPath(); c.ellipse(x * r, y * r, r * 0.075, r * 0.07, 0, 0, TAU); fillInk(ivory(x * r, y * r, r * 0.08), 1.1);
          wkSpike(c, h, x * r, y * r, r * 0.2, r * 0.06, a, ivory(x * r, y * r, r * 0.2), 1.2);
        }
        // short spiked tail
        nbStrip(c, nbBezierPts(-r * 0.24, r * 0.64, -r * 0.44, r * 0.74, -r * 0.62, r * 0.82, -r * 0.82, r * 0.86, 8), r * 0.16, r * 0.03); fillInk(hide, 1.8);
        for (const [x, y] of [[-0.46, 0.7], [-0.64, 0.77]]) wkSpike(c, h, x * r, y * r, r * 0.07, r * 0.03, -1.9, ivory(x * r, y * r, r * 0.07), 1);
        // thick legs with clawed feet on the stone
        for (const lx of [-0.1, 0.3]) {
          rr((lx - 0.13) * r, r * 0.55, r * 0.26, r * 0.4, r * 0.1); fillInk(hide, 2);
          c.beginPath(); c.ellipse((lx + 0.04) * r, r * 0.95, r * 0.18, r * 0.075, 0, 0, TAU); fillInk(scale, 1.6);
          for (const k of [-0.04, 0, 0.04]) wkSpike(c, h, (lx + 0.17) * r, (0.95 + k) * r, r * 0.07, r * 0.022, 0.2 + k * 4, ivory((lx + 0.2) * r, 0.95 * r, r * 0.07), 0.9);
        }
        // massive body with a plated golden belly
        c.beginPath(); c.ellipse(r * 0.08, r * 0.18, r * 0.4, r * 0.5, 0, 0, TAU); fillInk(hide, 2.4);
        const belly = () => { c.beginPath(); c.ellipse(r * 0.16, r * 0.26, r * 0.26, r * 0.42, 0.05, 0, TAU); };
        belly(); fillInk(scale, 1.8);
        c.save(); belly(); c.clip();
        c.strokeStyle = "rgba(120,72,10,0.6)"; c.lineWidth = Math.max(0.8, r * 0.018);
        c.beginPath(); for (const y of [-0.04, 0.1, 0.24, 0.38, 0.52]) { c.moveTo(-r * 0.12, y * r); c.quadraticCurveTo(r * 0.16, (y + 0.05) * r, r * 0.44, y * r); } c.stroke();
        c.restore();
        // arms with spiked iron wristbands and ivory claws
        const band = (x, y, rot) => {
          c.beginPath(); c.ellipse(x, y, r * 0.1, r * 0.05, rot, 0, TAU); fillInk(metal(x - r * 0.1, y - r * 0.05, x + r * 0.1, y + r * 0.05, ...WK_IRON), 1.3);
          for (const k of [-0.6, 0, 0.6]) wkSpike(c, h, x + Math.cos(rot) * k * r * 0.1, y + Math.sin(rot) * k * r * 0.1 - r * 0.03, r * 0.06, r * 0.02, rot - Math.PI / 2, ivory(x, y, r * 0.06), 0.9);
        };
        heroLimb(c, h, -r * 0.16, -r * 0.12, -r * 0.34, r * 0.06, -r * 0.26, r * 0.3, Math.max(4, r * 0.15), hide);
        band(-r * 0.28, r * 0.22, 0.2);
        c.beginPath(); c.ellipse(-r * 0.26, r * 0.33, r * 0.07, r * 0.06, 0, 0, TAU); fillInk(hide, 1.3);
        heroLimb(c, h, r * 0.3, -r * 0.12, r * 0.6, -r * 0.02, r * 0.56, r * 0.24, Math.max(4, r * 0.16), hide);
        band(r * 0.57, r * 0.17, -0.1);
        c.beginPath(); c.ellipse(r * 0.58, r * 0.3, r * 0.08, r * 0.07, 0, 0, TAU); fillInk(hide, 1.3);
        for (const a of [1.2, 1.6, 2.0]) wkSpike(c, h, r * 0.58 + Math.cos(a) * r * 0.06, r * 0.3 + Math.sin(a) * r * 0.05, r * 0.07, r * 0.02, a, ivory(r * 0.58, r * 0.38, r * 0.07), 0.9);
        // spiked iron collar
        c.beginPath(); c.ellipse(r * 0.22, -r * 0.27, r * 0.3, r * 0.085, -0.1, 0, TAU); fillInk(metal(-r * 0.08, -r * 0.36, r * 0.52, -r * 0.18, ...WK_IRON), 1.8);
        for (let i = 0; i < 5; i++) {
          const a = Math.PI * (0.18 + i * 0.16), bx = r * 0.22 + Math.cos(a) * r * 0.29, by = -r * 0.27 + Math.sin(a) * r * 0.08;
          wkSpike(c, h, bx, by, r * 0.08, r * 0.028, a, ivory(bx, by, r * 0.08), 1);
        }
        // flame-red spiked mane flickering behind the head
        const fl = (i) => ts ? Math.sin(ts / 110 + i * 1.3) * r * 0.015 : 0;
        c.beginPath();
        [[0.08, -0.86], [-0.08, -0.98], [-0.02, -0.82], [-0.22, -0.86], [-0.1, -0.72], [-0.28, -0.66], [-0.12, -0.6], [-0.26, -0.44], [-0.06, -0.48], [0.06, -0.5]]
          .forEach(([x, y], i) => { const X = x * r + (i % 2 ? fl(i) : 0), Y = y * r + (i % 2 ? fl(i + 3) : 0); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); });
        c.closePath(); fillInk(nbCloth(c, -r * 0.28, -r * 0.98, r * 0.08, -r * 0.44, WK_MANE), 1.6);
        // curved ivory horns with side-coloured brass bands
        for (const pts of [nbBezierPts(r * 0.12, -r * 0.74, r * 0.1, -r * 0.94, r * 0.02, -r * 1.06, -r * 0.06, -r * 1.14, 10),
          nbBezierPts(r * 0.34, -r * 0.76, r * 0.36, -r * 0.96, r * 0.36, -r * 1.08, r * 0.28, -r * 1.16, 10)]) {
          nbStrip(c, pts, r * 0.11, r * 0.012); fillInk(ivory(pts[5][0], pts[5][1], r * 0.25), 1.5);
          nbStrip(c, pts.slice(2, 4), r * 0.1, r * 0.088); fillInk(nbCloth(c, pts[2][0] - r * 0.05, pts[2][1], pts[3][0] + r * 0.05, pts[3][1], [WK_BRASS[0], pal.bright, pal.deep]), 1.1);
        }
        // head: cranium, mouth interior, lower jaw, upper snout, fangs, nostrils, angry eye and brow
        c.beginPath(); c.ellipse(r * 0.24, -r * 0.56, r * 0.27, r * 0.24, 0, 0, TAU); fillInk(hide, 2.2);
        poly([0.4, -0.44, 0.84, -0.44, 0.8, -0.3, 0.42, -0.32]); fillInk("#5a0a0a", 1.4);
        c.beginPath(); c.ellipse(r * 0.6, -r * 0.4, r * 0.16, r * 0.03, 0, 0, TAU); c.fillStyle = "rgba(255,140,40,0.7)"; c.fill();
        c.beginPath(); c.ellipse(r * 0.56, -r * 0.26, r * 0.22, r * 0.07, 0, 0, TAU); fillInk(scale, 1.5);
        for (const x of [0.56, 0.7]) { c.beginPath(); c.moveTo((x - 0.025) * r, -r * 0.31); c.lineTo(x * r, -r * 0.38); c.lineTo((x + 0.025) * r, -r * 0.31); c.closePath(); fillInk("#ffffff", 0.9); }
        c.beginPath(); c.ellipse(r * 0.56, -r * 0.52, r * 0.24, r * 0.12, 0.1, 0, TAU); fillInk(scale, 1.8);
        for (const x of [0.48, 0.62, 0.76]) { c.beginPath(); c.moveTo((x - 0.028) * r, -r * 0.42); c.lineTo(x * r, -r * 0.33); c.lineTo((x + 0.028) * r, -r * 0.42); c.closePath(); fillInk("#ffffff", 0.9); }
        for (const [nx, ny] of [[0.7, -0.58], [0.77, -0.55]]) { c.beginPath(); c.ellipse(nx * r, ny * r, r * 0.022, r * 0.014, 0.4, 0, TAU); c.fillStyle = "#3a1a08"; c.fill(); }
        c.beginPath(); c.ellipse(r * 0.34, -r * 0.65, r * 0.075, r * 0.05, -0.2, 0, TAU); fillInk("#fff8e0", 1.2);
        c.beginPath(); c.arc(r * 0.36, -r * 0.65, r * 0.035, 0, TAU); c.fillStyle = "#e8261e"; c.fill();
        c.beginPath(); c.ellipse(r * 0.36, -r * 0.65, r * 0.01, r * 0.03, 0, 0, TAU); c.fillStyle = "#120808"; c.fill();
        poly([0.22, -0.76, 0.48, -0.7, 0.46, -0.66, 0.24, -0.7]); fillInk(nbCloth(c, r * 0.22, -r * 0.76, r * 0.48, -r * 0.66, WK_MANE), 1.1);
        // roaring fire torrent arcing from the jaws and splashing across the stone floor
        const B = (t) => { const u = 1 - t; return [
          (u * u * u * 0.84 + 3 * u * u * t * 1.04 + 3 * u * t * t * 1.02 + t * t * t * 0.82) * r,
          (u * u * u * -0.38 + 3 * u * u * t * -0.26 + 3 * u * t * t * 0.32 + t * t * t * 0.86) * r]; };
        c.save(); c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 7; i++) {
          const x = r * (0.42 + i * 0.11), len = r * (ts ? 0.17 + 0.08 * Math.sin(ts / 80 + i * 1.7) : 0.2);
          srFlame(c, x, r * 0.98, len, r * 0.12, ts ? Math.sin(ts / 140 + i) * 0.12 : 0, rgba(i % 2 ? WK_FIRE : WK_FIRE_CORE, 0.75));
        }
        for (let i = 13; i >= 0; i--) {
          const t = ts ? (i / 14 + ts / 700) % 1 : i / 14, pt = B(t);
          const jit = (heroHash(i * 3.1) - 0.5) * r * 0.08 * t + (ts ? Math.sin(ts / 60 + i) * r * 0.02 : 0);
          const rad = r * (0.05 + 0.11 * t), x = pt[0] + jit, y = pt[1];
          const g = c.createRadialGradient(x, y, 0, x, y, rad);
          g.addColorStop(0, rgba("#fffbe0", 0.95 - t * 0.5)); g.addColorStop(0.35, rgba(WK_FIRE_CORE, 0.85 - t * 0.3)); g.addColorStop(0.7, rgba(WK_FIRE, 0.7)); g.addColorStop(1, rgba("#c8200a", 0));
          c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill();
        }
        c.restore();
        wkGlow(c, r * 0.8, r * 0.94, r * 0.24, WK_FIRE, 0.55 + 0.35 * p);
        wkGlow(c, r * 0.84, -r * 0.38, r * 0.12, WK_FIRE_CORE, 0.8);
        for (let i = 0; i < 5; i++) {
          const t = ts ? (ts / 900 + i / 5) % 1 : i / 5, x = r * (0.5 + 0.55 * heroHash(i * 2.7)), y = r * (0.9 - 0.5 * t);
          wkSparkle(c, x, y, r * 0.025 * (1 - t * 0.5), i % 2 ? WK_FIRE_CORE : pal.rim, t * 4, 0.8 * (1 - t));
        }
      },
    },
  };

  /* ============================================================
   * THEME: OLYMPIAN PANTHEON
   * An homage to classical Greek mythology (public-domain myth): Zeus, Hades, Heracles, Hermes,
   * Poseidon astride a hippocampus, Athena, Apollo and Ares, painted as original vector art. Side
   * identity rides on the palette at every focal point — laurel berries, bolt blooms, trident glints,
   * shield rims, helm crests, rune light and the meander borders of the garments.
   * ============================================================ */
  const OL_SKIN = ["#ffe8d0", "#f0c49c", "#a87450"];
  const OL_TAN = ["#f8c690", "#c88450", "#6a3a18"];        // sun-bronzed heroes
  const OL_ASH = ["#e8ecf6", "#a6adc2", "#4a5068"];        // underworld pallor
  const OL_GOLD = ["#fff6c8", "#f2c23c", "#865608"];
  const OL_OLIVE = ["#e4ecd6", "#9aaa7a", "#46532e"];      // silvery-olive leaves (Zeus's kotinos)
  const OL_BRONZE = ["#ffdca8", "#c8843c", "#5a2e0c"];
  const OL_BLOODBRONZE = ["#ffb48c", "#b44a2a", "#481206"];
  const OL_LINEN = ["#ffffff", "#efe9dc", "#a8a08e"];
  const OL_SILVER = ["#ffffff", "#e0e2ec", "#8a8ea4"];      // silver-white beard & hair
  const OL_OBSIDIAN = ["#6a6584", "#25222f", "#06050a"];
  const OL_CHARCOAL = ["#56526a", "#2a2734", "#0c0b12"];
  const OL_LION = ["#ffdc94", "#d49636", "#6a400c"];
  const OL_MANE = ["#eeaa4c", "#9c5a1a", "#3a1e06"];
  const OL_WOOD = ["#d8ae7c", "#84592e", "#33200c"];
  const OL_LEATHER = ["#cc965c", "#7e4c24", "#33190a"];
  const OL_FELT = ["#f0d29c", "#b98a4a", "#5e3e18"];
  const OL_SCARLET = ["#ffa080", "#e2262e", "#640810"];
  const OL_SEA = ["#c0fff4", "#2abcb2", "#0a4656"];
  const OL_COAT = ["#f2fffc", "#86dcd4", "#2a7680"];        // hippocampus forebody
  const OL_CORAL = ["#ffc4ac", "#ff6a58", "#a42828"];
  const OL_DARKHAIR = ["#6a5444", "#2e231a", "#0e0a08"];
  const OL_NIGHTHAIR = ["#4a4560", "#18151f", "#050408"];   // Hades' night-black locks
  const OL_GOLDHAIR = ["#fff2a8", "#f0bc3a", "#946410"];
  const OL_SEAHAIR = ["#d6eef4", "#6f94a8", "#24384a"];
  const OL_STEEL = ["#f6f8fc", "#a0a8b8", "#3a404e"];
  const OL_OWL = ["#efe2c8", "#9c8668", "#3e3020"];
  const OL_STYX = "#5cd4ff";
  const OL_SUN = "#ffd23c";
  const OL_EMBER = "#ff5a14";
  const OL_FOAM = "#eafffb";

  // Clamp a coordinate to ±lim (keeps animated extensions inside the figure bounds).
  function olClamp(v, lim) { return v < -lim ? -lim : v > lim ? lim : v; }
  // Closed ribbon around a centre line whose full width is wf(t), t = 0…1 (px).
  function olStrip(c, pts, wf) {
    const L = [], R = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      const w = wf(n > 1 ? i / (n - 1) : 0) / 2;
      L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]); R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
    }
    c.beginPath(); c.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n; i++) c.lineTo(L[i][0], L[i][1]);
    for (let i = n - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
    c.closePath();
  }
  // Open polyline path through pts.
  function olLine(c, pts) {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  }
  // Pointed leaf / feather outline from base (x, y) along ang; w = full width (px).
  function olLeaf(c, x, y, len, w, ang) {
    const ca = Math.cos(ang), sa = Math.sin(ang), mx = x + ca * len * 0.45, my = y + sa * len * 0.45;
    c.beginPath(); c.moveTo(x, y);
    c.quadraticCurveTo(mx - sa * w, my + ca * w, x + ca * len, y + sa * len);
    c.quadraticCurveTo(mx + sa * w, my - ca * w, x, y); c.closePath();
  }
  // Inked rounded hand / fist.
  function olHand(c, h, x, y, rad, skin) {
    c.beginPath(); c.arc(x, y, rad, 0, TAU); h.fillInk(nbCloth(c, x - rad, y - rad, x + rad, y + rad, skin), 1.3);
    c.beginPath(); c.moveTo(x - rad * 0.5, y - rad * 0.1); c.lineTo(x + rad * 0.5, y - rad * 0.1);
    c.strokeStyle = rgba(skin[2], 0.7); c.lineWidth = Math.max(0.6, rad * 0.14); c.stroke();
  }
  // Greek-key (meander) band from (x0, y0) to (x1, y1); w = band height px. Tiny bands collapse to a line.
  function olMeander(c, x0, y0, x1, y1, w, color) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (!(len > 0) || !(w > 0)) return;
    c.save(); c.translate(x0, y0); c.rotate(Math.atan2(y1 - y0, x1 - x0));
    c.strokeStyle = color; c.lineCap = "butt"; c.lineJoin = "miter";
    c.beginPath();
    if (w < 2.4) { c.moveTo(0, 0); c.lineTo(len, 0); c.lineWidth = Math.max(0.6, w * 0.4); c.stroke(); c.restore(); return; }
    const n = Math.max(1, Math.floor(len / w)), k = len / n;
    c.moveTo(0, w * 0.4); c.lineTo(len, w * 0.4);
    for (let i = 0; i < n; i++) {
      const X = i * k;
      c.moveTo(X + k * 0.15, w * 0.4); c.lineTo(X + k * 0.15, -w * 0.4); c.lineTo(X + k * 0.9, -w * 0.4);
      c.lineTo(X + k * 0.9, w * 0.12); c.lineTo(X + k * 0.48, w * 0.12); c.lineTo(X + k * 0.48, -w * 0.12);
    }
    c.lineWidth = Math.max(0.6, w * 0.15); c.stroke();
    c.restore();
  }
  // Almond eye outline centred (cx, ey), half-width ew, half-height eh.
  function olAlmond(c, cx, ey, ew, eh) {
    c.beginPath(); c.moveTo(cx - ew, ey); c.quadraticCurveTo(cx, ey - eh * 1.6, cx + ew, ey);
    c.quadraticCurveTo(cx, ey + eh * 1.2, cx - ew, ey); c.closePath();
  }
  // Classical face: head centre (x, y), radius s px. o: skin, iris, look, glow (eye colour), stern (0…1),
  // brow colour, mouth ("calm" | "smile" | "stern" | "roar"), beard (skip the mouth), noEars.
  function olFace(c, h, x, y, s, o = {}) {
    const skin = o.skin || OL_SKIN, fw = s * 0.82, st = o.stern || 0;
    if (!o.noEars) for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(x + sx * fw * 0.98, y + s * 0.02, s * 0.14, s * 0.22, sx * 0.12, 0, TAU); h.fillInk(skin[1], 1); }
    c.beginPath(); c.moveTo(x - fw, y - s * 0.2);
    c.bezierCurveTo(x - fw, y - s * 1.08, x + fw, y - s * 1.08, x + fw, y - s * 0.2);
    c.bezierCurveTo(x + fw, y + s * 0.5, x + s * 0.42, y + s * 0.98, x, y + s);
    c.bezierCurveTo(x - s * 0.42, y + s * 0.98, x - fw, y + s * 0.5, x - fw, y - s * 0.2);
    c.closePath(); h.fillInk(nbCloth(c, x - s * 0.9, y - s, x + s * 0.8, y + s, skin), 1.4);
    c.beginPath(); c.ellipse(x + fw * 0.52, y + s * 0.24, s * 0.2, s * 0.4, 0, 0, TAU); c.fillStyle = "rgba(90,40,20,0.12)"; c.fill();
    const ey = y - s * 0.06, ex = s * 0.33, ew = s * 0.19, eh = s * 0.1, look = o.look || 0;
    for (const sx of [-1, 1]) {
      const cx = x + sx * ex;
      olAlmond(c, cx, ey, ew, eh);
      if (o.glow) { c.fillStyle = o.glow; c.fill(); }
      else {
        c.fillStyle = "#ffffff"; c.fill();
        c.save(); c.clip();
        c.beginPath(); c.arc(cx + look * ew * 0.45, ey - eh * 0.05, eh * 1.0, 0, TAU); c.fillStyle = o.iris || "#3c6aa8"; c.fill();
        c.beginPath(); c.arc(cx + look * ew * 0.45, ey - eh * 0.05, eh * 0.48, 0, TAU); c.fillStyle = "#0b0710"; c.fill();
        c.restore();
      }
      olAlmond(c, cx, ey, ew, eh); c.strokeStyle = h.INK; c.lineWidth = Math.max(0.7, s * 0.06); c.stroke();
      if (o.glow) { wkGlow(c, cx, ey, s * 0.32, o.glow, 0.85); c.beginPath(); c.arc(cx, ey, eh * 0.45, 0, TAU); c.fillStyle = "#ffffff"; c.fill(); }
      c.beginPath(); c.moveTo(x + sx * s * 0.1, ey - eh * (1.9 - st * 0.8));
      c.quadraticCurveTo(cx, ey - eh * (2.9 + st * 0.2), x + sx * s * 0.6, ey - eh * (2.1 + st * 0.7));
      c.strokeStyle = o.brow || "#3a2a1e"; c.lineWidth = Math.max(1, s * 0.1); c.stroke();
    }
    c.beginPath(); c.moveTo(x - s * 0.03, ey + eh * 0.3); c.lineTo(x - s * 0.08, y + s * 0.36);
    c.quadraticCurveTo(x, y + s * 0.44, x + s * 0.09, y + s * 0.38);
    c.strokeStyle = rgba(skin[2], 0.9); c.lineWidth = Math.max(0.7, s * 0.06); c.stroke();
    if (o.beard) return;
    const my = y + s * 0.64, mood = o.mouth || "calm";
    if (mood === "roar") { c.beginPath(); c.ellipse(x, my, s * 0.2, s * 0.13, 0, 0, TAU); h.fillInk("#4a0a0a", 0.9); return; }
    c.beginPath(); c.moveTo(x - s * 0.22, my);
    c.quadraticCurveTo(x, my + (mood === "smile" ? s * 0.16 : mood === "stern" ? -s * 0.05 : s * 0.05), x + s * 0.22, my);
    c.strokeStyle = "#7a3424"; c.lineWidth = Math.max(0.8, s * 0.07); c.stroke();
  }
  // Flowing lobed beard + mustache under a face (centre x, y, radius s); len = length below the chin.
  function olBeard(c, h, x, y, s, len, cols, sway = 0) {
    const bot = y + s + len, ch = y - s * 0.05;
    c.beginPath(); c.moveTo(x - s * 0.84, ch);
    c.bezierCurveTo(x - s * 0.92, y + s * 0.6, x - s * 0.7 + sway * 0.3, bot - len * 0.3, x - s * 0.38 + sway * 0.6, bot - len * 0.12);
    c.quadraticCurveTo(x - s * 0.24 + sway, bot + s * 0.06, x - s * 0.09 + sway, bot - len * 0.08);
    c.quadraticCurveTo(x + sway, bot + s * 0.18, x + s * 0.09 + sway, bot - len * 0.08);
    c.quadraticCurveTo(x + s * 0.24 + sway, bot + s * 0.06, x + s * 0.38 + sway * 0.6, bot - len * 0.12);
    c.bezierCurveTo(x + s * 0.7 + sway * 0.3, bot - len * 0.3, x + s * 0.92, y + s * 0.6, x + s * 0.84, ch);
    c.quadraticCurveTo(x + s * 0.62, y + s * 0.3, x + s * 0.3, y + s * 0.42);
    c.quadraticCurveTo(x, y + s * 0.32, x - s * 0.3, y + s * 0.42);
    c.quadraticCurveTo(x - s * 0.62, y + s * 0.3, x - s * 0.84, ch);
    c.closePath(); h.fillInk(nbCloth(c, x - s, y, x + s, bot, cols), 1.3);
    c.beginPath();
    for (let i = -2; i <= 2; i++) {
      c.moveTo(x + i * s * 0.24, y + s * 0.62);
      c.quadraticCurveTo(x + i * s * 0.26 + sway * 0.4, y + s + len * 0.3, x + i * s * 0.15 + sway, bot - len * 0.12);
    }
    c.strokeStyle = rgba(cols[2], 0.6); c.lineWidth = Math.max(0.6, s * 0.045); c.stroke();
    for (const sx of [-1, 1]) {
      c.beginPath(); c.moveTo(x, y + s * 0.44);
      c.quadraticCurveTo(x + sx * s * 0.32, y + s * 0.36, x + sx * s * 0.5, y + s * 0.72);
      c.quadraticCurveTo(x + sx * s * 0.26, y + s * 0.58, x, y + s * 0.58); c.closePath();
      h.fillInk(nbCloth(c, x - s * 0.5, y + s * 0.3, x + s * 0.5, y + s * 0.8, cols), 0.9);
    }
    c.beginPath(); c.ellipse(x, y + s * 0.7, s * 0.13, s * 0.05, 0, 0, TAU); c.fillStyle = "#5a2418"; c.fill();
  }
  // Sacred wreath on an ellipse (cx, cy, rx, ry): two leafy branches from the temples meeting at the brow,
  // with side-coloured berries at the front. Default kind is Apollo's slender golden laurel; o.kind = "olive"
  // gives Zeus's sacred olive wreath (kotinos) with broader, rounder silvery-olive leaves and a pale
  // silver underside sheen. o.n = leaves per branch, o.leaf = leaf length px, o.leafW = width / length ratio.
  function olLaurel(c, h, pal, cx, cy, rx, ry, o = {}) {
    if (!(rx > 0) || !(ry > 0)) return;
    const olive = o.kind === "olive";
    const n = o.n || 6, L = o.leaf || rx * (olive ? 0.38 : 0.42), W = L * (o.leafW || (olive ? 0.6 : 0.42));
    const stem = olive ? OL_OLIVE[2] : OL_GOLD[2], spread = olive ? 0.72 : 0.62;
    const g = nbCloth(c, cx - rx, cy - ry - L, cx + rx, cy + ry + L, olive ? OL_OLIVE : [OL_GOLD[0], pal.gold, OL_GOLD[2]]);
    c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, -0.25, Math.PI + 0.25);
    c.strokeStyle = stem; c.lineWidth = Math.max(0.8, rx * 0.07); c.stroke();
    c.lineWidth = Math.max(0.5, L * 0.07);
    for (const sx of [-1, 1]) for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1), a = Math.PI / 2 - sx * (Math.PI / 2 + 0.25) * (1 - t * 0.84);
      const px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry;
      const ta = Math.atan2(sx * Math.cos(a) * ry, -sx * Math.sin(a) * rx), ll = L * (0.78 + 0.22 * t);
      for (const k of [-1, 1]) {
        const la = ta + k * spread;
        olLeaf(c, px, py, ll, W, la); h.fillInk(g, 0.7);
        if (olive) { // silvery underside sheen along one half of the rounded leaf
          olLeaf(c, px, py, ll * 0.86, W * 0.45, la + k * 0.08); c.fillStyle = "rgba(232,240,236,0.38)"; c.fill();
        }
        c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(la) * ll * 0.8, py + Math.sin(la) * ll * 0.8);
        c.strokeStyle = rgba(stem, 0.55); c.stroke();
      }
    }
    for (const k of [-1, 1]) {
      const bx = cx + k * rx * 0.13, by = cy + ry * 0.98, br = Math.max(0.9, rx * 0.075);
      c.beginPath(); c.arc(bx, by, br, 0, TAU); h.fillInk(pal.bright, 0.7);
      c.beginPath(); c.arc(bx - br * 0.3, by - br * 0.3, br * 0.35, 0, TAU); c.fillStyle = "rgba(255,255,255,0.8)"; c.fill();
    }
  }
  // Master thunderbolt between (x1, y1) and (x2, y2): angular zig-zag gold body with a white-hot core, a
  // side-coloured electric bloom, crackling branch arcs and spark motes. w = body width px; lim clamps arcs.
  function olBolt(c, h, pal, ts, x1, y1, x2, y2, w, seed = 1, lim = Infinity) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const zig = [0, 0.95, -0.55, 0.9, -0.85, 0.6, -0.5, 0];
    const flick = ts ? 0.7 + 0.3 * heroHash(Math.floor(ts / 60) + seed * 13) : 1;
    const pts = zig.map((o, i) => { const t = i / (zig.length - 1); return [x1 + dx * t + nx * o * w, y1 + dy * t + ny * o * w]; });
    c.save();
    c.shadowBlur = 0; c.shadowColor = "transparent"; c.lineJoin = "round"; c.lineCap = "round";
    c.globalCompositeOperation = "lighter";
    olLine(c, pts); c.strokeStyle = rgba(pal.bright, 0.22 * flick); c.lineWidth = w * 2.4; c.stroke();
    olLine(c, pts); c.strokeStyle = rgba(pal.bright, 0.45 * flick); c.lineWidth = w * 1.5; c.stroke();
    c.globalCompositeOperation = "source-over";
    olStrip(c, pts, (t) => w * Math.max(0.16, Math.sin(Math.PI * t)));
    const g = c.createLinearGradient(x1 + nx * w, y1 + ny * w, x1 - nx * w, y1 - ny * w);
    g.addColorStop(0, OL_GOLD[1]); g.addColorStop(0.45, "#ffffff"); g.addColorStop(1, pal.gold);
    h.fillInk(g, 1.2);
    c.globalCompositeOperation = "lighter";
    olLine(c, pts); c.strokeStyle = rgba(pal.rim, 0.7 * flick); c.lineWidth = Math.max(0.8, w * 0.36); c.stroke();
    olLine(c, pts); c.strokeStyle = "#ffffff"; c.lineWidth = Math.max(0.6, w * 0.14); c.stroke();
    c.restore();
    // crackling branch arcs from both tips and the waist
    const frame = ts ? Math.floor(ts / 90) : 0;
    [[x1, y1, -1], [x2, y2, 1], [pts[3][0], pts[3][1], 0]].forEach(([bx, by, dir], k) => {
      const s0 = seed * 7.1 + k * 3.3 + frame * 1.7, side = heroHash(s0) > 0.5 ? 1 : -1;
      const reach = len * (0.18 + 0.12 * heroHash(s0 + 2));
      const ex = olClamp(bx + (ux * dir * 0.7 + nx * side * (dir ? 0.6 : 1)) * reach, lim);
      const ey = olClamp(by + (uy * dir * 0.7 + ny * side * (dir ? 0.6 : 1)) * reach, lim);
      heroBolt(c, h, ts, bx, by, ex, ey, Math.max(0.6, w * 0.16), pal.bright, seed + k, 4);
    });
    // spark motes dancing along the bolt
    for (let i = 0; i < 5; i++) {
      const t = ts ? (i / 5 + ts / 1400) % 1 : (i + 0.5) / 5, bx = x1 + dx * t, by = y1 + dy * t;
      const off = w * (1.1 + 0.4 * Math.sin(i * 2.1 + (ts ? ts / 110 : 0))) * (i % 2 ? 1 : -1);
      wkSparkle(c, olClamp(bx + nx * off, lim), olClamp(by + ny * off, lim), w * 0.38, i % 2 ? pal.rim : "#ffffff", t * 6, 0.9);
    }
  }
  // Small feathered wing rooted at (x, y) spreading along +x (dir = -1 mirrors); s = span px, ang tilts it,
  // flap adds a beat. Four primaries fan upward beneath a rounded covert lobe.
  function olWing(c, h, x, y, s, ang, dir, flap, cols = OL_LINEN) {
    if (!(s > 0)) return;
    c.save(); c.translate(x, y); c.scale(dir, 1); c.rotate(ang - flap);
    const g = nbCloth(c, 0, s * 0.1, s * 0.9, -s * 0.6, cols);
    for (let i = 3; i >= 0; i--) { olLeaf(c, s * 0.04, 0, s * (1 - i * 0.15), s * 0.3, -0.1 - i * 0.3); h.fillInk(g, 0.8); }
    c.beginPath(); c.ellipse(s * 0.22, -s * 0.1, s * 0.26, s * 0.13, -0.35, 0, TAU); h.fillInk(g, 0.8);
    c.beginPath(); c.moveTo(s * 0.06, -s * 0.06); c.quadraticCurveTo(s * 0.22, -s * 0.2, s * 0.42, -s * 0.18);
    c.strokeStyle = rgba(cols[2], 0.6); c.lineWidth = Math.max(0.5, s * 0.03); c.stroke();
    c.restore();
  }
  // Herald's caduceus from butt (x1, y1) to top (x2, y2): golden rod, two entwined golden serpents facing
  // each other under small wings, crowned by a side-glowing solar finial orb.
  function olCaduceus(c, h, pal, ts, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
    if (!(L > 0)) return;
    const p = ts ? 0.5 + 0.5 * Math.sin(ts / 180) : 0.5, flap = ts ? Math.sin(ts / 110) * 0.25 : 0;
    c.save(); c.translate(x1, y1); c.rotate(Math.atan2(dy, dx) + Math.PI / 2);
    const A = L * 0.075, sw = Math.max(1.2, L * 0.032);
    const gold = nbCloth(c, -A * 1.3, 0, A * 1.3, 0, OL_GOLD);
    const rod = () => { c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -L * 0.84); };
    const snake = (k) => {
      const pts = [];
      for (let i = 0; i <= 28; i++) {
        const t = i / 28, ph = t * Math.PI * 4.5 + k * Math.PI;
        pts.push([Math.sin(ph) * A * (0.55 + 0.45 * t), -L * (0.12 + 0.6 * t), Math.cos(ph)]);
      }
      return pts;
    };
    const runs = (front) => {
      const out = [];
      for (const k of [0, 1]) {
        const s = snake(k); let cur = null;
        for (let i = 0; i < s.length - 1; i++) {
          const f = (s[i][2] + s[i + 1][2]) / 2 >= 0;
          if (f === front) { if (!cur) { cur = [s[i]]; out.push(cur); } cur.push(s[i + 1]); } else cur = null;
        }
      }
      return out;
    };
    const drawRuns = (list) => list.forEach(run => {
      olLine(c, run); c.strokeStyle = h.INK; c.lineWidth = sw + 2; c.stroke();
      olLine(c, run); c.strokeStyle = gold; c.lineWidth = sw; c.stroke();
      olLine(c, run); c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = Math.max(0.5, sw * 0.3); c.stroke();
    });
    drawRuns(runs(false));
    rod(); c.strokeStyle = h.INK; c.lineWidth = L * 0.045 + 2.2; c.stroke();
    rod(); c.strokeStyle = nbCloth(c, -L * 0.03, 0, L * 0.03, 0, OL_GOLD); c.lineWidth = L * 0.045; c.stroke();
    drawRuns(runs(true));
    // serpent heads facing each other
    for (const k of [-1, 1]) {
      const hx = k * A * 0.95, hy = -L * 0.74;
      c.beginPath(); c.ellipse(hx, hy, A * 0.5, A * 0.32, k * -0.5, 0, TAU); h.fillInk(gold, 1);
      c.beginPath(); c.arc(hx - k * A * 0.12, hy - A * 0.08, Math.max(0.6, A * 0.1), 0, TAU); c.fillStyle = pal.bright; c.fill();
    }
    olWing(c, h, -L * 0.03, -L * 0.8, L * 0.17, -0.3, -1, flap, OL_GOLD);
    olWing(c, h, L * 0.03, -L * 0.8, L * 0.17, -0.3, 1, flap, OL_GOLD);
    // solar finial
    const fy = -L * 0.89, fr = L * 0.05;
    wkGlow(c, 0, fy, L * 0.11 * (1 + 0.15 * p), pal.bright, 0.7 + 0.3 * p);
    c.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + (ts ? ts / 900 : 0); c.moveTo(Math.cos(a) * fr * 1.2, fy + Math.sin(a) * fr * 1.2); c.lineTo(Math.cos(a) * fr * 1.75, fy + Math.sin(a) * fr * 1.75); }
    c.strokeStyle = OL_GOLD[1]; c.lineWidth = Math.max(0.7, fr * 0.3); c.stroke();
    c.beginPath(); c.arc(0, fy, fr, 0, TAU); h.fillInk(nbCloth(c, -fr, fy - fr, fr, fy + fr, [OL_GOLD[0], OL_GOLD[1], pal.gold]), 1.1);
    c.restore();
  }
  // Golden trident: shaft from butt (x, y) along ang (0 = straight up), total length len. Barbed prong heads
  // carry side-coloured glints.
  function olTrident(c, h, pal, ts, x, y, ang, len) {
    if (!(len > 0)) return;
    const p = ts ? 0.5 + 0.5 * Math.sin(ts / 150) : 0.5;
    c.save(); c.translate(x, y); c.rotate(ang);
    const gold = nbCloth(c, -len * 0.14, 0, len * 0.14, 0, OL_GOLD), sw = Math.max(1.6, len * 0.032);
    const shaft = () => { c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -len * 0.8); };
    shaft(); c.strokeStyle = h.INK; c.lineWidth = sw + 2.4; c.stroke();
    shaft(); c.strokeStyle = nbCloth(c, -sw, 0, sw, 0, OL_GOLD); c.lineWidth = sw; c.stroke();
    for (const yy of [0.38, 0.46]) { c.beginPath(); c.moveTo(-sw * 0.6, -len * yy); c.lineTo(sw * 0.6, -len * yy); c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.8, len * 0.014); c.stroke(); }
    const cw = len * 0.11, top = -len * 0.985, hh = len * 0.1;
    // crossbar and side prongs as one curved fork
    c.beginPath(); c.moveTo(-cw, -len * 0.86);
    c.quadraticCurveTo(-cw * 1.05, -len * 0.74, 0, -len * 0.72); c.quadraticCurveTo(cw * 1.05, -len * 0.74, cw, -len * 0.86);
    c.strokeStyle = h.INK; c.lineWidth = sw * 1.15 + 2.4; c.stroke(); c.strokeStyle = gold; c.lineWidth = sw * 1.15; c.stroke();
    c.beginPath(); c.moveTo(0, -len * 0.74); c.lineTo(0, -len * 0.88); c.strokeStyle = h.INK; c.lineWidth = sw + 2.4; c.stroke(); c.strokeStyle = gold; c.lineWidth = sw; c.stroke();
    for (const px of [-cw, 0, cw]) {
      const ty = px ? top + len * 0.04 : top, bw = len * 0.045;
      c.beginPath(); c.moveTo(px, ty); c.lineTo(px + bw, ty + hh); c.lineTo(px + bw * 0.3, ty + hh * 0.78);
      c.lineTo(px + bw * 0.3, ty + hh * 1.15); c.lineTo(px - bw * 0.3, ty + hh * 1.15); c.lineTo(px - bw * 0.3, ty + hh * 0.78);
      c.lineTo(px - bw, ty + hh); c.closePath();
      h.fillInk(nbCloth(c, px - bw, ty, px + bw, ty, [OL_GOLD[0], pal.gold, OL_GOLD[2]]), 1.1);
      c.beginPath(); c.moveTo(px, ty + hh * 0.15); c.lineTo(px, ty + hh * 0.85); c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = Math.max(0.5, len * 0.008); c.stroke();
      wkGlow(c, px, ty + hh * 0.2, len * 0.05 * (0.8 + 0.4 * p), pal.rim, 0.75);
    }
    wkSparkle(c, 0, top + hh * 0.15, len * 0.04 * (0.7 + 0.5 * p), "#ffffff", ts ? ts / 300 : 0.4, 0.95);
    c.restore();
  }
  // Bronze Aegis shield centred (cx, cy), radius R: side-gold rim with studs, embossed sunburst, a
  // side-coloured inner band and the snake-haired Gorgoneion whose eyes glow with the side colour.
  function olGorgoneion(c, h, pal, ts, cx, cy, R) {
    if (!(R > 0)) return;
    const p = ts ? 0.5 + 0.5 * Math.sin(ts / 170) : 0.5;
    c.beginPath(); c.arc(cx, cy, R, 0, TAU); h.fillInk(h.metal(cx - R, cy - R, cx + R, cy + R, OL_GOLD[0], pal.gold, OL_GOLD[2]), 2);
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12, sx = cx + Math.cos(a) * R * 0.92, sy = cy + Math.sin(a) * R * 0.92;
      c.beginPath(); c.arc(sx, sy, Math.max(0.6, R * 0.035), 0, TAU); c.fillStyle = i % 2 ? "#fff8dc" : pal.bright; c.fill();
    }
    const field = c.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.05, cx, cy, R * 0.85);
    field.addColorStop(0, OL_BRONZE[0]); field.addColorStop(0.6, OL_BRONZE[1]); field.addColorStop(1, OL_BRONZE[2]);
    c.beginPath(); c.arc(cx, cy, R * 0.84, 0, TAU); h.fillInk(field, 1.2);
    for (let i = 0; i < 16; i++) {
      const a = i * TAU / 16, a0 = a - TAU / 40, a1 = a + TAU / 40;
      c.beginPath(); c.moveTo(cx + Math.cos(a0) * R * 0.52, cy + Math.sin(a0) * R * 0.52);
      c.lineTo(cx + Math.cos(a) * R * (i % 2 ? 0.72 : 0.81), cy + Math.sin(a) * R * (i % 2 ? 0.72 : 0.81));
      c.lineTo(cx + Math.cos(a1) * R * 0.52, cy + Math.sin(a1) * R * 0.52); c.closePath();
      c.fillStyle = i % 2 ? rgba(OL_GOLD[1], 0.85) : rgba(OL_GOLD[0], 0.9); c.fill();
      c.strokeStyle = rgba(OL_BRONZE[2], 0.6); c.lineWidth = Math.max(0.5, R * 0.012); c.stroke();
    }
    c.beginPath(); c.arc(cx, cy, R * 0.5, 0, TAU); c.strokeStyle = h.INK; c.lineWidth = R * 0.07 + 1.6; c.stroke();
    c.strokeStyle = pal.bright; c.lineWidth = R * 0.07; c.stroke();
    // snake locks writhing around the face
    const wig = ts ? ts / 160 : 0;
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i - 4.5) * 0.52, pts = [];
      for (let j = 0; j <= 6; j++) {
        const t = j / 6, rr = R * (0.24 + 0.2 * t), aa = a + Math.sin(t * 5 + i + wig) * 0.16 * t;
        pts.push([cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr * 0.95]);
      }
      olLine(c, pts); c.strokeStyle = h.INK; c.lineWidth = R * 0.07 + 1.2; c.stroke();
      olLine(c, pts); c.strokeStyle = i % 2 ? "#7cc46a" : "#4f9a48"; c.lineWidth = R * 0.07; c.stroke();
      const e = pts[6]; c.beginPath(); c.arc(e[0], e[1], R * 0.045, 0, TAU); h.fillInk("#4f9a48", 0.7);
    }
    const fr = R * 0.27;
    c.beginPath(); c.arc(cx, cy + fr * 0.05, fr, 0, TAU); h.fillInk(nbCloth(c, cx - fr, cy - fr, cx + fr, cy + fr, [OL_GOLD[0], "#e0a050", "#7a4414"]), 1.2);
    for (const sx of [-1, 1]) {
      olAlmond(c, cx + sx * fr * 0.38, cy - fr * 0.12, fr * 0.24, fr * 0.13); c.fillStyle = pal.bright; c.fill();
      c.strokeStyle = h.INK; c.lineWidth = Math.max(0.5, fr * 0.06); c.stroke();
      wkGlow(c, cx + sx * fr * 0.38, cy - fr * 0.12, fr * 0.34, pal.bright, 0.5 + 0.4 * p);
      c.beginPath(); c.moveTo(cx + sx * fr * 0.1, cy - fr * 0.36); c.lineTo(cx + sx * fr * 0.62, cy - fr * 0.42);
      c.strokeStyle = "#5a2a10"; c.lineWidth = Math.max(0.6, fr * 0.1); c.stroke();
    }
    c.beginPath(); c.ellipse(cx, cy + fr * 0.48, fr * 0.36, fr * 0.2, 0, 0, TAU); h.fillInk("#4a0a0a", 0.8);
    c.beginPath(); c.moveTo(cx - fr * 0.1, cy + fr * 0.5); c.quadraticCurveTo(cx, cy + fr * 0.9, cx + fr * 0.1, cy + fr * 0.5); c.closePath(); c.fillStyle = "#e0485a"; c.fill();
    c.fillStyle = "#ffffff";
    for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(cx + sx * fr * 0.28, cy + fr * 0.36); c.lineTo(cx + sx * fr * 0.2, cy + fr * 0.56); c.lineTo(cx + sx * fr * 0.13, cy + fr * 0.36); c.closePath(); c.fill(); }
    c.beginPath(); c.ellipse(cx - R * 0.35, cy - R * 0.45, R * 0.26, R * 0.1, -0.7, 0, TAU); c.fillStyle = "rgba(255,255,255,0.25)"; c.fill();
  }
  // Nemean lion hood worn over a head (centre cx, cy, radius s). layer "back" = mane behind the head;
  // "front" = the lion's brow, ears, side-glowing eyes, muzzle and fangs hanging over the forehead.
  function olLionHood(c, h, pal, ts, cx, cy, s, layer) {
    if (layer === "back") {
      pcFurBlob(c, cx, cy - s * 0.3, s * 1.5, s * 1.3, 14, 0.2, 7);
      h.fillInk(nbCloth(c, cx - s * 1.5, cy - s * 1.6, cx + s * 1.5, cy + s, OL_MANE), 1.6);
      return;
    }
    const lion = nbCloth(c, cx - s, cy - s * 1.9, cx + s * 0.8, cy - s * 0.4, OL_LION);
    for (const sx of [-1, 1]) {
      c.beginPath(); c.ellipse(cx + sx * s * 0.74, cy - s * 1.38, s * 0.24, s * 0.22, 0, 0, TAU); h.fillInk(lion, 1.2);
      c.beginPath(); c.ellipse(cx + sx * s * 0.74, cy - s * 1.36, s * 0.12, s * 0.11, 0, 0, TAU); c.fillStyle = "#5a3010"; c.fill();
    }
    c.beginPath(); c.moveTo(cx - s * 0.98, cy - s * 0.48);
    c.bezierCurveTo(cx - s * 1.06, cy - s * 1.78, cx + s * 1.06, cy - s * 1.78, cx + s * 0.98, cy - s * 0.48);
    c.quadraticCurveTo(cx + s * 0.7, cy - s * 0.4, cx + s * 0.36, cy - s * 0.5);
    c.quadraticCurveTo(cx + s * 0.16, cy - s * 0.62, cx, cy - s * 0.55);
    c.quadraticCurveTo(cx - s * 0.16, cy - s * 0.62, cx - s * 0.36, cy - s * 0.5);
    c.quadraticCurveTo(cx - s * 0.7, cy - s * 0.4, cx - s * 0.98, cy - s * 0.48);
    c.closePath(); h.fillInk(lion, 1.6);
    c.beginPath(); c.ellipse(cx, cy - s * 0.74, s * 0.46, s * 0.2, 0, 0, TAU); c.fillStyle = "rgba(255,240,200,0.55)"; c.fill();
    const p = ts ? 0.5 + 0.5 * Math.sin(ts / 210) : 0.5;
    for (const sx of [-1, 1]) {
      const ex = cx + sx * s * 0.38, ey = cy - s * 1.06;
      c.beginPath(); c.moveTo(ex - s * 0.2, ey + sx * 0); c.quadraticCurveTo(ex, ey - s * 0.16, ex + s * 0.2, ey);
      c.quadraticCurveTo(ex, ey + s * 0.1, ex - s * 0.2, ey); c.closePath(); h.fillInk(pal.gold, 0.9);
      wkGlow(c, ex, ey, s * 0.22, pal.bright, 0.5 + 0.4 * p);
      c.beginPath(); c.ellipse(ex, ey, s * 0.035, s * 0.07, 0, 0, TAU); c.fillStyle = "#1a0e04"; c.fill();
      c.beginPath(); c.moveTo(cx + sx * s * 0.12, ey - s * 0.12); c.quadraticCurveTo(ex, ey - s * 0.28, cx + sx * s * 0.62, ey - s * 0.08);
      c.strokeStyle = "#5a3010"; c.lineWidth = Math.max(0.8, s * 0.07); c.stroke();
    }
    c.beginPath(); c.moveTo(cx - s * 0.16, cy - s * 0.9); c.lineTo(cx + s * 0.16, cy - s * 0.9); c.lineTo(cx, cy - s * 0.74); c.closePath(); h.fillInk("#4a2410", 0.9);
    c.beginPath(); c.moveTo(cx, cy - s * 0.74); c.lineTo(cx, cy - s * 0.6); c.strokeStyle = "#4a2410"; c.lineWidth = Math.max(0.6, s * 0.05); c.stroke();
    for (const sx of [-1, 1]) {
      c.beginPath(); c.moveTo(cx + sx * s * 0.28, cy - s * 0.53); c.lineTo(cx + sx * s * 0.21, cy - s * 0.3); c.lineTo(cx + sx * s * 0.14, cy - s * 0.57); c.closePath();
      h.fillInk("#fffbea", 0.8);
      for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(cx + sx * s * (0.3 + i * 0.1), cy - s * (0.68 - i * 0.03), Math.max(0.4, s * 0.025), 0, TAU); c.fillStyle = "#5a3010"; c.fill(); }
    }
  }
  // Puffy cloud bank centred (cx, cy): ink stroked under the union of lobes so only the outline shows.
  function olCloud(c, h, cx, cy, w, hh, ts, seed, cols) {
    const n = 6, path = () => {
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), x = cx + (t - 0.5) * w * 1.6;
        const rad = hh * (0.85 + 0.45 * Math.sin(t * Math.PI)) * (0.85 + 0.3 * heroHash(seed + i));
        const y = cy - Math.sin(t * Math.PI) * hh * 0.3 + (ts ? Math.sin(ts / 600 + i) * hh * 0.06 : 0);
        c.moveTo(x + rad, y); c.arc(x, y, rad, 0, TAU);
      }
    };
    path(); c.strokeStyle = h.INK; c.lineWidth = 2.6; c.stroke();
    path(); c.fillStyle = nbCloth(c, cx, cy - hh * 1.4, cx, cy + hh * 1.2, cols); c.fill();
  }
  // Golden eagle centred (x, y), scale s px; part "wings" (behind) or "body" (perched on a fist).
  function olEagle(c, h, pal, ts, x, y, s, flap, part) {
    const gold = nbCloth(c, x - s, y - s, x + s * 0.6, y + s * 0.6, [OL_GOLD[0], "#eab448", "#7a4a0c"]);
    if (part === "wings") {
      for (const sx of [-1, 1]) {
        c.save(); c.translate(x + sx * s * 0.1, y - s * 0.28); c.scale(sx, 1); c.rotate(-flap * 0.14);
        c.beginPath(); c.moveTo(0, 0);
        c.quadraticCurveTo(s * 0.32, -s * 0.66, s * 0.86, -s * 0.68);
        let prev = [0.86, -0.68];
        for (const [tx, ty] of [[0.92, -0.5], [0.82, -0.34], [0.68, -0.2], [0.52, -0.08], [0.34, 0.02]]) {
          c.lineTo((prev[0] + tx) / 2 * s * 0.9, (prev[1] + ty) / 2 * s * 0.9); c.lineTo(tx * s, ty * s); prev = [tx, ty];
        }
        c.lineTo(s * 0.04, s * 0.2); c.closePath(); h.fillInk(gold, 1.3);
        c.beginPath();
        for (const [tx, ty] of [[0.92, -0.5], [0.82, -0.34], [0.68, -0.2], [0.52, -0.08]]) { c.moveTo(s * 0.2, -s * 0.24); c.lineTo(tx * s * 0.86, ty * s * 0.9); }
        c.strokeStyle = "rgba(94,54,8,0.6)"; c.lineWidth = Math.max(0.5, s * 0.025); c.stroke();
        c.beginPath(); c.moveTo(s * 0.06, -s * 0.12); c.quadraticCurveTo(s * 0.34, -s * 0.5, s * 0.7, -s * 0.56);
        c.strokeStyle = rgba(pal.bright, 0.8); c.lineWidth = Math.max(0.7, s * 0.04); c.stroke();
        c.restore();
      }
      return;
    }
    c.save(); c.translate(x, y);
    c.beginPath(); c.moveTo(-s * 0.1, s * 0.22); c.lineTo(-s * 0.22, s * 0.56); c.lineTo(0, s * 0.64); c.lineTo(s * 0.22, s * 0.56); c.lineTo(s * 0.1, s * 0.22); c.closePath();
    h.fillInk(nbCloth(c, 0, s * 0.2, 0, s * 0.64, ["#fff0c0", "#c88a2c", "#5e3608"]), 1.1);
    c.beginPath(); c.ellipse(0, 0, s * 0.17, s * 0.33, 0, 0, TAU); h.fillInk(gold, 1.3);
    c.strokeStyle = "rgba(94,54,8,0.55)"; c.lineWidth = Math.max(0.5, s * 0.02); c.beginPath();
    for (let i = 0; i < 3; i++) for (const k of [-1, 0, 1]) { const yy = -s * 0.08 + i * s * 0.1; c.moveTo(k * s * 0.08 - s * 0.04, yy); c.quadraticCurveTo(k * s * 0.08, yy + s * 0.05, k * s * 0.08 + s * 0.04, yy); }
    c.stroke();
    for (const k of [-1, 1]) { c.beginPath(); c.moveTo(k * s * 0.08, s * 0.28); c.lineTo(k * s * 0.12, s * 0.38); c.lineTo(k * s * 0.04, s * 0.36); c.strokeStyle = "#2a1a08"; c.lineWidth = Math.max(0.7, s * 0.04); c.stroke(); }
    c.beginPath(); c.arc(-s * 0.03, -s * 0.4, s * 0.14, 0, TAU); h.fillInk(nbCloth(c, -s * 0.15, -s * 0.54, s * 0.12, -s * 0.26, ["#fffbe8", "#f0d290", "#a07020"]), 1.2);
    c.beginPath(); c.moveTo(-s * 0.13, -s * 0.45); c.quadraticCurveTo(-s * 0.3, -s * 0.47, -s * 0.33, -s * 0.36);
    c.lineTo(-s * 0.27, -s * 0.38); c.quadraticCurveTo(-s * 0.22, -s * 0.34, -s * 0.13, -s * 0.35); c.closePath(); h.fillInk("#ffb02a", 0.9);
    c.beginPath(); c.arc(-s * 0.07, -s * 0.44, Math.max(0.8, s * 0.035), 0, TAU); c.fillStyle = pal.bright; c.fill();
    c.beginPath(); c.moveTo(-s * 0.12, -s * 0.5); c.lineTo(-s * 0.01, -s * 0.48); c.strokeStyle = "#5e3608"; c.lineWidth = Math.max(0.6, s * 0.03); c.stroke();
    c.restore();
  }
  // Leaf-bladed xiphos: grip at (x, y), blade along ang (0 = up), blade length len px.
  function olXiphos(c, h, pal, ts, x, y, ang, len) {
    if (!(len > 0)) return;
    c.save(); c.translate(x, y); c.rotate(ang);
    const wd = (t) => len * (t < 0.35 ? 0.065 - 0.02 * t / 0.35 : t < 0.72 ? 0.045 + 0.04 * (t - 0.35) / 0.37 : 0.085 * (1 - (t - 0.72) / 0.28));
    const Lp = [], Rp = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, w = wd(t), yy = -len * (0.08 + 0.92 * t);
      Lp.push([-w, yy]); Rp.push([w, yy]);
    }
    c.beginPath(); c.moveTo(Lp[0][0], Lp[0][1]);
    for (const q of Lp) c.lineTo(q[0], q[1]);
    for (let i = Rp.length - 1; i >= 0; i--) c.lineTo(Rp[i][0], Rp[i][1]);
    c.closePath(); h.fillInk(nbCloth(c, -len * 0.09, 0, len * 0.09, 0, OL_STEEL), 1.3);
    c.beginPath(); c.moveTo(0, -len * 0.12); c.lineTo(0, -len * 0.84); c.strokeStyle = "rgba(120,16,12,0.85)"; c.lineWidth = Math.max(0.8, len * 0.025); c.stroke();
    const blood = c.createLinearGradient(0, -len * 0.5, 0, -len);
    blood.addColorStop(0, "rgba(180,30,20,0)"); blood.addColorStop(1, "rgba(190,30,20,0.55)");
    c.beginPath(); c.moveTo(-len * 0.05, -len * 0.6); c.lineTo(0, -len); c.lineTo(len * 0.07, -len * 0.62); c.closePath(); c.fillStyle = blood; c.fill();
    c.beginPath(); c.ellipse(0, -len * 0.06, len * 0.13, len * 0.035, 0, 0, TAU); h.fillInk(nbCloth(c, -len * 0.13, 0, len * 0.13, 0, OL_GOLD), 1.1);
    c.beginPath(); c.moveTo(0, -len * 0.03); c.lineTo(0, len * 0.14); c.strokeStyle = h.INK; c.lineWidth = len * 0.06 + 2; c.stroke();
    c.strokeStyle = OL_LEATHER[1]; c.lineWidth = len * 0.06; c.stroke();
    c.beginPath(); c.arc(0, len * 0.17, len * 0.045, 0, TAU); h.fillInk(nbCloth(c, -len * 0.05, 0, len * 0.05, 0, OL_GOLD), 1);
    c.beginPath(); c.arc(0, len * 0.17, Math.max(0.6, len * 0.02), 0, TAU); c.fillStyle = pal.bright; c.fill();
    c.restore();
  }
  // Glowing Greek-letter rune (0 Ψ, 1 Ω, 2 Φ, 3 Δ) of half-size s, stroked additively.
  function olRune(c, x, y, s, kind, color, alpha) {
    c.save(); c.translate(x, y); c.globalCompositeOperation = "lighter";
    c.beginPath();
    if (kind === 0) { c.moveTo(-s, -s); c.quadraticCurveTo(-s, s * 0.3, 0, s * 0.3); c.quadraticCurveTo(s, s * 0.3, s, -s); c.moveTo(0, -s * 1.1); c.lineTo(0, s); }
    else if (kind === 1) { c.moveTo(-s, s); c.lineTo(-s * 0.4, s); c.bezierCurveTo(-s * 1.2, 0, -s * 0.8, -s, 0, -s); c.bezierCurveTo(s * 0.8, -s, s * 1.2, 0, s * 0.4, s); c.lineTo(s, s); }
    else if (kind === 2) { c.ellipse(0, 0, s * 0.75, s * 0.5, 0, 0, TAU); c.moveTo(0, -s * 1.1); c.lineTo(0, s * 1.1); }
    else { c.moveTo(0, -s); c.lineTo(s, s); c.lineTo(-s, s); c.closePath(); }
    c.strokeStyle = rgba(color, 0.35 * alpha); c.lineWidth = Math.max(1, s * 0.6); c.stroke();
    c.strokeStyle = rgba(color, alpha); c.lineWidth = Math.max(0.6, s * 0.22); c.stroke();
    c.restore();
  }

  SG.THEMES.olympian = {
    id: "olympian",
    name: { en: "Olympian Pantheon", fr: "Panthéon Olympien", zh: "奥林匹斯诸神", ar: "مجمع آلهة الأولمب" },
    description: {
      en: "Thunder-wielding Zeus, shadow-crowned Hades, lion-hooded Heracles, winged Hermes, Poseidon astride his hippocampus, Aegis-bearing Athena, sun-bright Apollo and blood-bronze Ares — the gods of Olympus descend upon the board.",
      fr: "Zeus maître de la foudre, Hadès couronné d'ombre, Héraclès coiffé du lion de Némée, Hermès aux sandales ailées, Poséidon chevauchant son hippocampe, Athéna porteuse de l'Égide, Apollon solaire et Arès au bronze ensanglanté — les dieux de l'Olympe descendent sur l'échiquier.",
      zh: "执掌雷霆的宙斯、冥影加冕的哈迪斯、披戴涅墨亚雄狮的赫拉克勒斯、足踏飞翼的赫尔墨斯、驾驭海马的波塞冬、手持神盾的雅典娜、光耀如日的阿波罗与血铜战甲的阿瑞斯——奥林匹斯众神降临棋盘。",
      ar: "زيوس سيد الصواعق، وهاديس المتوّج بالظلال، وهرقل المتدثر بجلد أسد نيميا، وهيرميس ذو الصنادل المجنحة، وبوسيدون ممتطياً حصان البحر، وأثينا حاملة درع الإيجيس، وأبولو المشرق كالشمس، وآريس ذو البرونز الدامي — آلهة الأولمب تنزل إلى رقعة الشطرنج.",
    },
    painters: {
      /* Zeus, Master of Lightning — noble Olympian king on a storm-cloud dais: flowing silver-white hair and
         beard, sacred silvery-olive wreath with side-coloured berries, white himation with a gold-and-side meander
         border over a bare sculpted chest, one fist raising a crackling master thunderbolt (side-coloured
         electric bloom, branch arcs, spark motes) while a spread-winged golden eagle perches on the other. */
      sovereign(c, pal, r, ts, h) {
        const { fillInk, pulse, poly } = h;
        const p = pulse(160), flap = ts ? Math.sin(ts / 240) : 0, sway = ts ? Math.sin(ts / 700) * r * 0.012 : 0;
        const skin = nbCloth(c, -r * 0.5, -r * 0.7, r * 0.6, r * 0.2, OL_SKIN);
        const linen = nbCloth(c, -r * 0.55, -r * 0.4, r * 0.55, r * 0.9, OL_LINEN);
        wkGlow(c, r * 0.62, -r * 0.78, r * 0.42, pal.bright, 0.3 + 0.3 * p);
        olEagle(c, h, pal, ts, -r * 0.66, -r * 0.36, r * 0.46, flap, "wings");
        olCloud(c, h, 0, r * 0.95, r * 0.66, r * 0.13, ts, 3, ["#ffffff", pal.rim, "#7c84a0"]);
        // flowing robe column, folds and a gold hem band with a side-coloured meander
        c.beginPath(); c.moveTo(-r * 0.34, -r * 0.05); c.quadraticCurveTo(-r * 0.46, r * 0.45, -r * 0.5, r * 0.86);
        c.lineTo(r * 0.5, r * 0.86); c.quadraticCurveTo(r * 0.46, r * 0.45, r * 0.34, -r * 0.05); c.closePath();
        fillInk(linen, 2.2);
        c.beginPath();
        for (const fx of [-0.3, -0.12, 0.06, 0.24]) { c.moveTo(fx * r, r * 0.12); c.quadraticCurveTo((fx - 0.04) * r, r * 0.5, fx * 1.3 * r, r * 0.76); }
        c.strokeStyle = "rgba(120,110,90,0.45)"; c.lineWidth = Math.max(0.7, r * 0.018); c.stroke();
        h.rr(-r * 0.49, r * 0.76, r * 0.98, r * 0.1, r * 0.02); fillInk(h.metal(0, r * 0.76, 0, r * 0.86, OL_GOLD[0], pal.gold, OL_GOLD[2]), 1.2);
        olMeander(c, -r * 0.45, r * 0.81, r * 0.45, r * 0.81, r * 0.065, pal.deep);
        // bare sculpted chest
        poly([-0.38, -0.34, 0.38, -0.34, 0.3, 0.06, -0.3, 0.06]); fillInk(skin, 2);
        c.beginPath(); c.moveTo(r * 0.02, -r * 0.18); c.quadraticCurveTo(r * 0.16, -r * 0.08, r * 0.3, -r * 0.18);
        c.moveTo(r * 0.12, -r * 0.02); c.lineTo(r * 0.12, r * 0.04);
        c.strokeStyle = "rgba(140,80,50,0.55)"; c.lineWidth = Math.max(0.7, r * 0.02); c.stroke();
        // himation over the left shoulder, crossing the chest to the right hip
        c.beginPath(); c.moveTo(-r * 0.42, -r * 0.36); c.lineTo(-r * 0.16, -r * 0.38); c.quadraticCurveTo(r * 0.1, -r * 0.12, r * 0.38, r * 0.04);
        c.quadraticCurveTo(r * 0.46, r * 0.2, r * 0.42, r * 0.36); c.quadraticCurveTo(0, r * 0.22, -r * 0.44, r * 0.3); c.closePath();
        fillInk(linen, 1.8);
        c.beginPath(); c.moveTo(-r * 0.3, -r * 0.2); c.quadraticCurveTo(-r * 0.1, r * 0.05, r * 0.3, r * 0.2);
        c.moveTo(-r * 0.36, 0); c.quadraticCurveTo(-r * 0.1, r * 0.16, r * 0.2, r * 0.28);
        c.strokeStyle = "rgba(120,110,90,0.45)"; c.lineWidth = Math.max(0.7, r * 0.018); c.stroke();
        const edge = () => { c.beginPath(); c.moveTo(-r * 0.16, -r * 0.38); c.quadraticCurveTo(r * 0.1, -r * 0.12, r * 0.38, r * 0.04); };
        edge(); c.strokeStyle = h.INK; c.lineWidth = r * 0.07 + 2; c.stroke();
        edge(); c.strokeStyle = pal.gold; c.lineWidth = r * 0.07; c.stroke();
        if (c.setLineDash) c.setLineDash([r * 0.035, r * 0.025]);
        edge(); c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.8, r * 0.026); c.stroke();
        if (c.setLineDash) c.setLineDash([]);
        // lowered arm bearing the eagle
        heroLimb(c, h, -r * 0.36, -r * 0.3, -r * 0.58, r * 0.04, -r * 0.66, -r * 0.13, Math.max(3.5, r * 0.13), skin);
        olHand(c, h, -r * 0.66, -r * 0.14, r * 0.065, OL_SKIN);
        olEagle(c, h, pal, ts, -r * 0.66, -r * 0.36, r * 0.46, flap, "body");
        // raised arm hurling the master thunderbolt
        heroLimb(c, h, r * 0.34, -r * 0.3, r * 0.68, -r * 0.42, r * 0.61, -r * 0.74, Math.max(3.5, r * 0.13), skin);
        olBolt(c, h, pal, ts, r * 0.44, -r * 1.06, r * 0.8, -r * 0.46, r * 0.11, 1, r * 1.12);
        olHand(c, h, r * 0.62, -r * 0.77, r * 0.075, OL_SKIN);
        // head: silver mane, stern face, flowing beard, crown of hair and the sacred olive wreath
        const HX = 0, HY = -r * 0.6, HS = r * 0.2;
        pcFurBlob(c, HX, HY + HS * 0.1, HS * 1.22, HS * 1.32, 9, 0.12, 5); fillInk(nbCloth(c, HX - HS, HY - HS, HX + HS, HY + HS, OL_SILVER), 1.4);
        olFace(c, h, HX, HY, HS, { stern: 0.8, beard: true, iris: "#4a76c0", brow: "#a8acbc" });
        olBeard(c, h, HX, HY, HS, r * 0.26, OL_SILVER, sway);
        c.beginPath(); c.moveTo(HX - HS * 0.86, HY - HS * 0.08);
        c.bezierCurveTo(HX - HS * 0.96, HY - HS * 1.22, HX + HS * 0.96, HY - HS * 1.22, HX + HS * 0.86, HY - HS * 0.08);
        c.quadraticCurveTo(HX + HS * 0.66, HY - HS * 0.62, HX + HS * 0.12, HY - HS * 0.58);
        c.quadraticCurveTo(HX - HS * 0.5, HY - HS * 0.66, HX - HS * 0.86, HY - HS * 0.08); c.closePath();
        fillInk(nbCloth(c, HX - HS, HY - HS, HX + HS, HY, OL_SILVER), 1.3);
        olLaurel(c, h, pal, HX, HY - HS * 0.6, HS * 0.94, HS * 0.32, { n: 5, kind: "olive" });
      },

      /* Hades, Lord of the Underworld — ashen ruler in a spired obsidian helm of darkness with a glowing
         side-coloured brow gem, dark charcoal chiton glowing with spectral Greek runes, spiked pauldrons and a
         tattered mantle; his shadow bident is crowned with circling souls, a Styx flame burns in his palm,
         cerulean flames rise all around and a spectral hound's twin eyes glare from the shadows. */
      reaper(c, pal, r, ts, h) {
        const { fillInk, pulse } = h;
        const p = pulse(150), q = pulse(95, 1.3), sway = ts ? Math.sin(ts / 500) * r * 0.02 : 0;
        // rising Styx flames
        c.save(); c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 9; i++) {
          const x = (-0.9 + i * 0.225) * r, side = Math.abs(x / r) / 0.9;
          const len = r * (0.28 + 0.4 * side + 0.08 * (ts ? Math.sin(ts / 130 + i * 1.9) : heroHash(i) - 0.5));
          const wob = ts ? Math.sin(ts / 210 + i) * 0.12 : 0;
          srFlame(c, x, r * 1.06, len, r * 0.22, wob, rgba(i % 2 ? OL_STYX : pal.bright, 0.5));
          srFlame(c, x, r * 1.06, len * 0.55, r * 0.11, wob, rgba("#e8fbff", 0.45));
        }
        c.restore();
        // tattered mantle
        c.beginPath(); c.moveTo(-r * 0.42, -r * 0.38); c.quadraticCurveTo(-r * 0.72, r * 0.2, -r * 0.84, r * 0.98);
        for (let i = 1; i <= 10; i++) { const x = (-0.84 + i * 0.168) * r; c.lineTo(x - r * 0.084 + sway, r * (i % 2 ? 0.86 : 0.96)); c.lineTo(x, r * 0.98); }
        c.quadraticCurveTo(r * 0.72, r * 0.2, r * 0.42, -r * 0.38); c.closePath();
        fillInk(nbCloth(c, -r * 0.8, -r * 0.4, r * 0.8, r, [pal.deep, OL_CHARCOAL[1], OL_CHARCOAL[2]]), 2);
        c.beginPath(); c.moveTo(-r * 0.46, -r * 0.3); c.quadraticCurveTo(-r * 0.7, r * 0.2, -r * 0.8, r * 0.9);
        c.moveTo(r * 0.46, -r * 0.3); c.quadraticCurveTo(r * 0.7, r * 0.2, r * 0.8, r * 0.9);
        c.strokeStyle = rgba(pal.bright, 0.45); c.lineWidth = Math.max(0.7, r * 0.02); c.stroke();
        // spectral hound emerging from the mantle's shadow, twin eyes ablaze
        const DX = -r * 0.64, DY = r * 0.44;
        c.beginPath(); c.moveTo(DX + r * 0.22, DY + r * 0.16);
        c.quadraticCurveTo(DX + r * 0.22, DY - r * 0.12, DX + r * 0.1, DY - r * 0.16);
        c.lineTo(DX + r * 0.16, DY - r * 0.36); c.lineTo(DX + r * 0.02, DY - r * 0.2); c.lineTo(DX - r * 0.06, DY - r * 0.38); c.lineTo(DX - r * 0.1, DY - r * 0.16);
        c.quadraticCurveTo(DX - r * 0.2, DY - r * 0.1, DX - r * 0.3, DY - r * 0.02); c.lineTo(DX - r * 0.4, DY + r * 0.04);
        c.quadraticCurveTo(DX - r * 0.38, DY + r * 0.12, DX - r * 0.26, DY + r * 0.12);
        c.quadraticCurveTo(DX - r * 0.06, DY + r * 0.2, DX - r * 0.08, DY + r * 0.34); c.closePath();
        const hg = c.createLinearGradient(DX, DY - r * 0.4, DX, DY + r * 0.34);
        hg.addColorStop(0, "rgba(30,34,52,0.92)"); hg.addColorStop(1, rgba(OL_STYX, 0.12));
        c.fillStyle = hg; c.fill(); c.strokeStyle = rgba(OL_STYX, 0.5); c.lineWidth = Math.max(0.7, r * 0.018); c.stroke();
        for (const ex of [-0.13, 0.02]) {
          const x = DX + ex * r, y = DY - r * 0.07;
          wkGlow(c, x, y, r * 0.1, pal.bright, 0.55 + 0.45 * q);
          olAlmond(c, x, y, r * 0.045, r * 0.022); c.fillStyle = pal.bright; c.fill();
          c.beginPath(); c.arc(x, y, Math.max(0.5, r * 0.012), 0, TAU); c.fillStyle = "#ffffff"; c.fill();
        }
        // bident shaft (behind the hand)
        const BX = r * 0.64;
        c.beginPath(); c.moveTo(BX, r * 0.98); c.lineTo(BX, -r * 0.78);
        c.strokeStyle = h.INK; c.lineWidth = r * 0.05 + 2.4; c.stroke();
        c.strokeStyle = nbCloth(c, BX - r * 0.03, 0, BX + r * 0.03, 0, OL_OBSIDIAN); c.lineWidth = r * 0.05; c.stroke();
        c.beginPath(); c.moveTo(BX + r * 0.01, r * 0.9); c.lineTo(BX + r * 0.01, -r * 0.76); c.strokeStyle = rgba(pal.bright, 0.55); c.lineWidth = Math.max(0.5, r * 0.012); c.stroke();
        for (const sx of [-1, 1]) {
          const pts = nbBezierPts(BX, -r * 0.72, BX + sx * r * 0.16, -r * 0.74, BX + sx * r * 0.15, -r * 0.86, BX + sx * r * 0.13, -r * 0.98, 8);
          olStrip(c, pts, (t) => r * (0.06 - 0.025 * t)); fillInk(nbCloth(c, BX - r * 0.2, 0, BX + r * 0.2, 0, OL_OBSIDIAN), 1.2);
          const tx = BX + sx * r * 0.13;
          c.beginPath(); c.moveTo(tx, -r * 1.12); c.lineTo(tx + r * 0.045, -r * 0.97); c.lineTo(tx, -r * 1.0); c.lineTo(tx - r * 0.045, -r * 0.97); c.closePath();
          fillInk(nbCloth(c, tx - r * 0.05, 0, tx + r * 0.05, 0, OL_OBSIDIAN), 1.1);
          c.beginPath(); c.moveTo(tx, -r * 1.09); c.lineTo(tx, -r * 1.0); c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.6, r * 0.014); c.stroke();
          wkGlow(c, tx, -r * 1.04, r * 0.08, pal.bright, 0.5 + 0.4 * p);
        }
        // robe with a side-hued rune panel
        c.beginPath(); c.moveTo(-r * 0.32, -r * 0.34); c.quadraticCurveTo(-r * 0.42, r * 0.4, -r * 0.5, r * 0.96);
        for (let i = 1; i <= 6; i++) { const x = (-0.5 + i * 0.1667) * r; c.lineTo(x - r * 0.083, r * (i % 2 ? 0.88 : 1.0)); c.lineTo(x, r * 0.96); }
        c.quadraticCurveTo(r * 0.42, r * 0.4, r * 0.32, -r * 0.34); c.closePath();
        fillInk(nbCloth(c, -r * 0.5, -r * 0.3, r * 0.5, r, OL_CHARCOAL), 2.2);
        h.poly([-0.09, 0.14, 0.09, 0.14, 0.13, 0.92, -0.13, 0.92]); c.fillStyle = rgba(pal.deep, 0.75); c.fill();
        for (let i = 0; i < 4; i++) olRune(c, 0, r * (0.28 + i * 0.18), r * 0.05, i, pal.bright, 0.45 + 0.45 * (ts ? 0.5 + 0.5 * Math.sin(ts / 220 + i * 1.4) : 0.6));
        h.rr(-r * 0.34, r * 0.06, r * 0.68, r * 0.08, r * 0.02); fillInk(h.metal(0, r * 0.06, 0, r * 0.14, ...OL_STEEL), 1.2);
        c.beginPath(); c.moveTo(0, r * 0.05); c.lineTo(r * 0.05, r * 0.1); c.lineTo(0, r * 0.15); c.lineTo(-r * 0.05, r * 0.1); c.closePath(); fillInk(pal.bright, 0.9);
        // chest folds
        c.beginPath(); c.moveTo(-r * 0.18, -r * 0.3); c.quadraticCurveTo(0, -r * 0.1, r * 0.18, -r * 0.3);
        c.moveTo(-r * 0.22, -r * 0.18); c.quadraticCurveTo(0, r * 0.02, r * 0.22, -r * 0.18);
        c.strokeStyle = rgba(pal.bright, 0.3); c.lineWidth = Math.max(0.6, r * 0.016); c.stroke();
        // arms: one cradling a Styx flame, one gripping the bident
        const sleeve = nbCloth(c, -r * 0.6, -r * 0.3, r * 0.6, r * 0.1, OL_CHARCOAL);
        heroLimb(c, h, -r * 0.36, -r * 0.28, -r * 0.6, -r * 0.02, -r * 0.5, r * 0.1, Math.max(3.5, r * 0.14), sleeve);
        heroLimb(c, h, r * 0.36, -r * 0.28, r * 0.56, -r * 0.02, BX, -r * 0.1, Math.max(3.5, r * 0.14), sleeve);
        olHand(c, h, -r * 0.5, r * 0.11, r * 0.065, OL_ASH);
        olHand(c, h, BX, -r * 0.1, r * 0.07, OL_ASH);
        c.save(); c.globalCompositeOperation = "lighter";
        const fl = ts ? Math.sin(ts / 90) * 0.15 : 0;
        srFlame(c, -r * 0.5, r * 0.06, r * (0.3 + 0.05 * q), r * 0.18, fl, rgba(OL_STYX, 0.75));
        srFlame(c, -r * 0.5, r * 0.06, r * 0.17, r * 0.09, fl, rgba("#ffffff", 0.7));
        c.restore();
        wkGlow(c, -r * 0.5, -r * 0.08, r * 0.2, OL_STYX, 0.5 + 0.3 * q);
        // spiked obsidian pauldrons
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(sx * r * 0.22, -r * 0.4);
          c.lineTo(sx * r * 0.36, -r * 0.56); c.lineTo(sx * r * 0.38, -r * 0.44); c.lineTo(sx * r * 0.52, -r * 0.5);
          c.lineTo(sx * r * 0.48, -r * 0.36); c.lineTo(sx * r * 0.58, -r * 0.3);
          c.quadraticCurveTo(sx * r * 0.5, -r * 0.16, sx * r * 0.28, -r * 0.2); c.closePath();
          fillInk(nbCloth(c, sx * r * 0.2, -r * 0.56, sx * r * 0.58, -r * 0.16, OL_OBSIDIAN), 1.5);
          c.beginPath(); c.moveTo(sx * r * 0.3, -r * 0.24); c.quadraticCurveTo(sx * r * 0.46, -r * 0.24, sx * r * 0.54, -r * 0.31);
          c.strokeStyle = rgba(pal.bright, 0.65); c.lineWidth = Math.max(0.6, r * 0.015); c.stroke();
        }
        // head: dark locks, ashen face with glowing eyes, short dark beard
        const HX = 0, HY = -r * 0.56, HS = r * 0.2;
        c.beginPath(); c.moveTo(HX - HS * 1.0, HY - HS * 0.4); c.quadraticCurveTo(HX - HS * 1.25, HY + HS * 0.8, HX - HS * 0.9, HY + HS * 1.4);
        c.lineTo(HX + HS * 0.9, HY + HS * 1.4); c.quadraticCurveTo(HX + HS * 1.25, HY + HS * 0.8, HX + HS * 1.0, HY - HS * 0.4); c.closePath();
        fillInk(nbCloth(c, 0, HY - HS, 0, HY + HS * 1.4, OL_NIGHTHAIR), 1.3);
        olFace(c, h, HX, HY, HS, { skin: OL_ASH, glow: pal.bright, stern: 1, beard: true, brow: "#14101c" });
        olBeard(c, h, HX, HY, HS, r * 0.1, OL_NIGHTHAIR, sway * 0.3);
        // helm of darkness: obsidian spires, cheek guards, glowing brow band and gem
        const sp = [[-0.19, -0.95, 0.05], [0.19, -0.95, 0.05], [-0.1, -1.05, 0.055], [0.1, -1.05, 0.055], [0, -1.17, 0.07]];
        for (const [sxp, ty, bw] of sp) {
          c.beginPath(); c.moveTo((sxp - bw) * r, -r * 0.74); c.lineTo(sxp * r, ty * r); c.lineTo((sxp + bw) * r, -r * 0.74); c.closePath();
          fillInk(nbCloth(c, (sxp - bw) * r, 0, (sxp + bw) * r, 0, OL_OBSIDIAN), 1.2);
          c.beginPath(); c.moveTo((sxp + bw * 0.25) * r, ty * r + r * 0.04); c.lineTo((sxp + bw * 0.6) * r, -r * 0.76);
          c.strokeStyle = rgba(pal.bright, 0.7); c.lineWidth = Math.max(0.5, r * 0.012); c.stroke();
        }
        c.beginPath(); c.moveTo(HX - HS * 0.98, HY + HS * 0.3); c.lineTo(HX - HS * 0.98, HY - HS * 0.4);
        c.bezierCurveTo(HX - HS * 1.0, HY - HS * 1.45, HX + HS * 1.0, HY - HS * 1.45, HX + HS * 0.98, HY - HS * 0.4);
        c.lineTo(HX + HS * 0.98, HY + HS * 0.3); c.lineTo(HX + HS * 0.78, HY + HS * 0.2); c.lineTo(HX + HS * 0.72, HY - HS * 0.3);
        c.quadraticCurveTo(HX + HS * 0.4, HY - HS * 0.42, HX + HS * 0.12, HY - HS * 0.34); c.lineTo(HX, HY - HS * 0.1);
        c.lineTo(HX - HS * 0.12, HY - HS * 0.34); c.quadraticCurveTo(HX - HS * 0.4, HY - HS * 0.42, HX - HS * 0.72, HY - HS * 0.3);
        c.lineTo(HX - HS * 0.78, HY + HS * 0.2); c.closePath();
        fillInk(nbCloth(c, HX - HS, HY - HS * 1.2, HX + HS, HY + HS * 0.3, OL_OBSIDIAN), 1.6);
        c.beginPath(); c.moveTo(HX - HS * 0.72, HY - HS * 0.36); c.quadraticCurveTo(HX - HS * 0.4, HY - HS * 0.48, HX - HS * 0.12, HY - HS * 0.4);
        c.moveTo(HX + HS * 0.72, HY - HS * 0.36); c.quadraticCurveTo(HX + HS * 0.4, HY - HS * 0.48, HX + HS * 0.12, HY - HS * 0.4);
        c.strokeStyle = rgba(pal.bright, 0.5 + 0.4 * p); c.lineWidth = Math.max(0.7, r * 0.018); c.stroke();
        const gy = HY - HS * 0.72;
        wkGlow(c, HX, gy, r * 0.11, pal.bright, 0.6 + 0.4 * p);
        c.beginPath(); c.moveTo(HX, gy - HS * 0.2); c.lineTo(HX + HS * 0.13, gy); c.lineTo(HX, gy + HS * 0.2); c.lineTo(HX - HS * 0.13, gy); c.closePath(); fillInk(pal.bright, 0.9);
        c.beginPath(); c.arc(HX - HS * 0.03, gy - HS * 0.05, HS * 0.04, 0, TAU); c.fillStyle = "#ffffff"; c.fill();
        // souls circling the bident's prongs
        for (let i = 0; i < 3; i++) {
          const a = (ts ? ts / 700 : 0.6) + i * TAU / 3, sx = BX + Math.cos(a) * r * 0.2, sy = -r * 0.92 + Math.sin(a) * r * 0.07;
          pcWisp(c, sx, sy, r * 0.065, Math.cos(a) * 0.5, OL_STYX, Math.sin(a) > 0 ? 0.85 : 0.5);
        }
      },

      /* Heracles, Hero of the Labors — colossal sun-bronzed warrior before a rotating golden hero's aura,
         wearing the Nemean lion's fanged maw as a battle hood (feline ears, side-glowing eyes, mane) with
         the pelt's paws knotted across his chest, a bronze belt with a side-coloured boss, spartan pteruges
         with side-coloured edging, and a massive knotted olive club bound in bronze and side-gold rivets. */
      juggernaut(c, pal, r, ts, h) {
        const { fillInk, pulse } = h;
        const p = pulse(200);
        const skin = nbCloth(c, -r * 0.6, -r * 0.5, r * 0.6, r * 0.4, OL_TAN);
        const pelt = nbCloth(c, -r * 0.7, -r * 0.4, r * 0.7, r * 0.8, OL_LION);
        // heroic golden aura
        wkGlow(c, 0, -r * 0.25, r * 0.88, OL_SUN, 0.25 + 0.2 * p);
        c.save(); c.globalCompositeOperation = "lighter";
        const rot = ts ? ts / 3000 : 0;
        for (let i = 0; i < 12; i++) {
          const a = rot + i * TAU / 12, R0 = r * 0.42, R1 = r * (i % 2 ? 0.74 : 0.88);
          c.beginPath(); c.moveTo(Math.cos(a - 0.09) * R0, -r * 0.25 + Math.sin(a - 0.09) * R0);
          c.lineTo(Math.cos(a) * R1, -r * 0.25 + Math.sin(a) * R1); c.lineTo(Math.cos(a + 0.09) * R0, -r * 0.25 + Math.sin(a + 0.09) * R0); c.closePath();
          c.fillStyle = rgba(i % 2 ? pal.bright : OL_SUN, 0.18 + 0.12 * p); c.fill();
        }
        c.restore();
        // lion pelt cape with dangling hind paws
        c.beginPath(); c.moveTo(-r * 0.52, -r * 0.34); c.quadraticCurveTo(-r * 0.74, r * 0.2, -r * 0.68, r * 0.8);
        for (let i = 1; i <= 8; i++) { const x = (-0.68 + i * 0.17) * r; c.lineTo(x - r * 0.085, r * (i % 2 ? 0.86 : 0.74)); c.lineTo(x, r * 0.8); }
        c.quadraticCurveTo(r * 0.74, r * 0.2, r * 0.52, -r * 0.34); c.closePath(); fillInk(pelt, 2);
        for (const sx of [-1, 1]) {
          c.beginPath(); c.ellipse(sx * r * 0.62, r * 0.86, r * 0.09, r * 0.07, 0, 0, TAU); fillInk(pelt, 1.2);
          c.beginPath(); for (let k = -1; k <= 1; k++) { c.moveTo(sx * r * 0.62 + k * r * 0.035, r * 0.9); c.lineTo(sx * r * 0.62 + k * r * 0.04, r * 0.95); }
          c.strokeStyle = "#fffbea"; c.lineWidth = Math.max(0.6, r * 0.016); c.stroke();
        }
        olLionHood(c, h, pal, ts, 0, -r * 0.6, r * 0.23, "back");
        // legs and laced sandals
        for (const sx of [-1, 1]) {
          heroLimb(c, h, sx * r * 0.18, r * 0.48, sx * r * 0.32, r * 0.74, sx * r * 0.26, r * 0.98, Math.max(4, r * 0.2), skin);
          c.beginPath(); c.ellipse(sx * r * 0.27, r * 1.03, r * 0.13, r * 0.055, 0, 0, TAU); fillInk(nbCloth(c, 0, r * 0.98, 0, r * 1.08, OL_LEATHER), 1.3);
          c.beginPath(); for (const y of [0.82, 0.9]) { c.moveTo(sx * r * 0.18, y * r); c.lineTo(sx * r * 0.36, (y + 0.04) * r); }
          c.strokeStyle = OL_LEATHER[2]; c.lineWidth = Math.max(0.7, r * 0.022); c.stroke();
        }
        // pteruges skirt
        const leather = nbCloth(c, 0, r * 0.3, 0, r * 0.66, OL_LEATHER), sideStrip = nbCloth(c, 0, r * 0.3, 0, r * 0.66, [pal.rim, pal.bright, pal.deep]);
        for (let i = 0; i < 8; i++) {
          const x0 = (-0.44 + i * 0.11) * r, hh = r * (0.32 + (i % 2 ? 0.04 : 0));
          h.rr(x0, r * 0.3, r * 0.1, hh, r * 0.02); fillInk(i % 2 ? leather : sideStrip, 1.2);
          c.fillStyle = i % 2 ? pal.bright : pal.gold; c.fillRect(x0 + r * 0.015, r * 0.3 + hh - r * 0.05, r * 0.07, r * 0.025);
          c.beginPath(); c.arc(x0 + r * 0.05, r * 0.35, Math.max(0.6, r * 0.018), 0, TAU); c.fillStyle = pal.gold; c.fill();
        }
        // colossal bronzed torso
        c.beginPath(); c.moveTo(-r * 0.6, -r * 0.3); c.quadraticCurveTo(0, -r * 0.4, r * 0.6, -r * 0.3);
        c.quadraticCurveTo(r * 0.52, r * 0.02, r * 0.36, r * 0.3); c.lineTo(-r * 0.36, r * 0.3);
        c.quadraticCurveTo(-r * 0.52, r * 0.02, -r * 0.6, -r * 0.3); c.closePath(); fillInk(skin, 2.4);
        c.beginPath();
        c.moveTo(-r * 0.38, -r * 0.08); c.quadraticCurveTo(-r * 0.18, r * 0.02, 0, -r * 0.08); c.quadraticCurveTo(r * 0.18, r * 0.02, r * 0.38, -r * 0.08);
        c.moveTo(0, -r * 0.06); c.lineTo(0, r * 0.24);
        for (const y of [0.04, 0.12, 0.2]) { c.moveTo(-r * 0.14, y * r); c.quadraticCurveTo(-r * 0.07, (y + 0.02) * r, 0, y * r); c.quadraticCurveTo(r * 0.07, (y + 0.02) * r, r * 0.14, y * r); }
        c.strokeStyle = "rgba(110,50,20,0.55)"; c.lineWidth = Math.max(0.7, r * 0.022); c.stroke();
        // bronze belt and side-coloured boss
        h.rr(-r * 0.38, r * 0.23, r * 0.76, r * 0.09, r * 0.025); fillInk(h.metal(0, r * 0.23, 0, r * 0.32, ...OL_BRONZE), 1.3);
        c.beginPath(); c.arc(0, r * 0.275, r * 0.06, 0, TAU); fillInk(h.metal(-r * 0.06, r * 0.2, r * 0.06, r * 0.34, OL_GOLD[0], pal.gold, OL_GOLD[2]), 1.1);
        c.beginPath(); c.arc(0, r * 0.275, r * 0.03, 0, TAU); c.fillStyle = pal.bright; c.fill();
        // thick neck
        h.rr(-r * 0.13, -r * 0.5, r * 0.26, r * 0.2, r * 0.05); fillInk(skin, 1.6);
        // lion forepaws knotted at the chest
        for (const sx of [-1, 1]) {
          const pts = nbBezierPts(sx * r * 0.4, -r * 0.34, sx * r * 0.3, -r * 0.24, sx * r * 0.12, -r * 0.2, 0, -r * 0.14, 8);
          olStrip(c, pts, (t) => r * (0.13 - 0.04 * t)); fillInk(pelt, 1.4);
          const dpts = nbBezierPts(sx * r * 0.02, -r * 0.12, sx * r * 0.06, -r * 0.02, sx * r * 0.1, r * 0.04, sx * r * 0.12, r * 0.1, 6);
          olStrip(c, dpts, (t) => r * (0.08 + 0.03 * t)); fillInk(pelt, 1.2);
          c.beginPath(); for (let k = -1; k <= 1; k++) { c.moveTo(sx * r * 0.12 + k * r * 0.025, r * 0.12); c.lineTo(sx * r * 0.12 + k * r * 0.03, r * 0.17); }
          c.strokeStyle = "#fffbea"; c.lineWidth = Math.max(0.6, r * 0.016); c.stroke();
        }
        c.beginPath(); c.ellipse(0, -r * 0.13, r * 0.07, r * 0.055, 0, 0, TAU); fillInk(pelt, 1.2);
        // left arm: fist planted on the hip
        heroLimb(c, h, -r * 0.54, -r * 0.24, -r * 0.88, r * 0.02, -r * 0.48, r * 0.22, Math.max(4.5, r * 0.21), skin);
        c.beginPath(); c.ellipse(-r * 0.56, -r * 0.24, r * 0.15, r * 0.12, 0.3, 0, TAU); fillInk(skin, 1.6);
        olHand(c, h, -r * 0.46, r * 0.22, r * 0.085, OL_TAN);
        // right arm and the bronze-banded olive club
        heroLimb(c, h, r * 0.54, -r * 0.24, r * 0.88, r * 0.04, r * 0.66, -r * 0.12, Math.max(4.5, r * 0.21), skin);
        c.beginPath(); c.ellipse(r * 0.56, -r * 0.24, r * 0.15, r * 0.12, -0.3, 0, TAU); fillInk(skin, 1.6);
        const CB = [r * 0.6, r * 0.1], CT = [r * 0.94, -r * 0.92];
        const cpts = nbBezierPts(CB[0], CB[1], r * 0.68, -r * 0.2, r * 0.82, -r * 0.6, CT[0], CT[1], 12);
        olStrip(c, cpts, (t) => r * (0.07 + 0.15 * t * t)); fillInk(nbCloth(c, r * 0.6, 0, r * 1.05, 0, OL_WOOD), 2);
        c.beginPath(); c.arc(CT[0], CT[1], r * 0.11, 0, TAU); fillInk(nbCloth(c, CT[0] - r * 0.1, CT[1] - r * 0.1, CT[0] + r * 0.1, CT[1] + r * 0.1, OL_WOOD), 1.6);
        for (const [i, s] of [[5, 0.03], [8, 0.04], [10, 0.035]]) {
          const [kx, ky] = cpts[i]; c.beginPath(); c.ellipse(kx + r * 0.05, ky, r * s, r * s * 0.7, 0.4, 0, TAU); fillInk(OL_WOOD[1], 1);
        }
        for (const i of [4, 7, 10]) {
          const [bx, by] = cpts[i], wv = r * (0.07 + 0.15 * (i / 12) * (i / 12));
          c.save(); c.translate(bx, by); c.rotate(Math.atan2(cpts[i + 1][1] - by, cpts[i + 1][0] - bx));
          h.rr(-r * 0.025, -wv * 0.58, r * 0.05, wv * 1.16, r * 0.01); fillInk(h.metal(0, -wv, 0, wv, ...OL_BRONZE), 1);
          for (const k of [-0.32, 0.32]) { c.beginPath(); c.arc(0, wv * k, Math.max(0.6, r * 0.015), 0, TAU); c.fillStyle = pal.gold; c.fill(); }
          c.restore();
        }
        olHand(c, h, r * 0.66, -r * 0.12, r * 0.09, OL_TAN);
        // head: bearded hero under the lion's maw
        const HX = 0, HY = -r * 0.6, HS = r * 0.21;
        olFace(c, h, HX, HY, HS, { skin: OL_TAN, stern: 0.9, beard: true, iris: "#6a4a20", brow: "#2e1c10" });
        olBeard(c, h, HX, HY, HS, r * 0.07, OL_DARKHAIR);
        olLionHood(c, h, pal, ts, HX, HY + HS * 0.06, HS * 1.12, "front");
      },

      /* Hermes, the Winged Herald — youthful messenger mid-dash amid rushing golden wind ribbons: winged
         petasos with a side-coloured hatband, side-coloured chlamys with a gold fringe, short belted chiton,
         winged golden talaria sandals, holding the golden caduceus with entwined serpents and a side-glowing
         solar finial. */
      trickster(c, pal, r, ts, h) {
        const { fillInk, pulse } = h;
        const p = pulse(120), run = ts ? Math.sin(ts / 160) : 0, flap = ts ? Math.sin(ts / 90) * 0.35 : 0;
        const skin = nbCloth(c, -r * 0.5, -r * 0.6, r * 0.6, r * 0.9, OL_SKIN);
        // rushing golden wind ribbons and speed motes
        c.save(); c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 5; i++) {
          const y0 = r * (-0.72 + i * 0.32), ph = ts ? ts / 220 + i * 1.3 : i, wv = Math.sin(ph) * r * 0.08;
          const g = c.createLinearGradient(r * 0.1, 0, -r * 1.12, 0);
          g.addColorStop(0, rgba(OL_SUN, 0)); g.addColorStop(0.3, rgba(OL_SUN, 0.75)); g.addColorStop(0.75, rgba(i % 2 ? pal.bright : OL_GOLD[0], 0.5)); g.addColorStop(1, rgba(OL_SUN, 0));
          c.beginPath(); c.moveTo(r * 0.05, y0); c.bezierCurveTo(-r * 0.35, y0 + wv, -r * 0.7, y0 - wv, -r * 1.1, y0 + wv * 0.5);
          c.strokeStyle = g; c.lineWidth = Math.max(1, r * (0.05 - i * 0.005)); c.stroke();
        }
        c.restore();
        for (let i = 0; i < 6; i++) {
          const t = ts ? (ts / 650 + i / 6) % 1 : (i + 0.5) / 6;
          wkSparkle(c, r * (0.0 - t * 1.05), r * (-0.6 + heroHash(i * 3.3) * 1.2), r * 0.035 * (1 - t * 0.5), i % 2 ? pal.rim : OL_SUN, t * 5, 0.9 * (1 - t));
        }
        // fluttering chlamys with gold fringe
        const w1 = ts ? Math.sin(ts / 140) * r * 0.05 : 0, w2 = ts ? Math.sin(ts / 140 + 1.6) * r * 0.05 : 0;
        const cloakPath = () => {
          c.beginPath(); c.moveTo(r * 0.2, -r * 0.36);
          c.quadraticCurveTo(-r * 0.3, -r * 0.52, -r * 0.84, -r * 0.3 + w1);
          c.quadraticCurveTo(-r * 0.74, -r * 0.12, -r * 0.96, r * 0.02 + w2);
          c.quadraticCurveTo(-r * 0.7, r * 0.12, -r * 0.8, r * 0.3 + w1);
          c.quadraticCurveTo(-r * 0.4, r * 0.18, -r * 0.14, r * 0.1); c.closePath();
        };
        cloakPath(); fillInk(nbCloth(c, r * 0.3, -r * 0.4, -r * 0.9, r * 0.4, [pal.rim, pal.bright, pal.deep]), 1.8);
        c.beginPath(); c.moveTo(-r * 0.84, -r * 0.3 + w1); c.quadraticCurveTo(-r * 0.74, -r * 0.12, -r * 0.96, r * 0.02 + w2);
        c.quadraticCurveTo(-r * 0.7, r * 0.12, -r * 0.8, r * 0.3 + w1);
        c.strokeStyle = pal.gold; c.lineWidth = Math.max(1, r * 0.03); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.1, -r * 0.3); c.quadraticCurveTo(-r * 0.4, -r * 0.2, -r * 0.7, -r * 0.1);
        c.moveTo(-r * 0.1, -r * 0.1); c.quadraticCurveTo(-r * 0.4, 0, -r * 0.66, r * 0.16);
        c.strokeStyle = rgba(pal.deep, 0.5); c.lineWidth = Math.max(0.6, r * 0.016); c.stroke();
        // running legs with winged talaria
        const kick = run * r * 0.04;
        const legs = [[-0.06, -0.2, 0.66 + run * 0.03, -0.56 - run * 0.04, 0.5], [0.08, 0.36, 0.58, 0.26 + run * 0.03, 0.92]];
        legs.forEach(([hx, kx, ky, fx, fy], i) => {
          const sh = i ? skin : nbCloth(c, -r * 0.6, 0, r * 0.1, r * 0.7, [OL_SKIN[0], OL_SKIN[1], OL_SKIN[2]]);
          const KX = kx * r + (i ? kick : -kick), KY = ky * r;
          heroLimb(c, h, hx * r, r * 0.38, (hx * r + KX) / 2, (r * 0.38 + KY) / 2, KX, KY, Math.max(3.5, r * 0.15), sh);
          heroLimb(c, h, KX, KY, (KX + fx * r) / 2, (KY + fy * r) / 2, fx * r, fy * r, Math.max(3, r * 0.12), sh);
          c.beginPath(); c.arc(KX, KY, Math.max(1.5, r * 0.07), 0, TAU); c.fillStyle = sh; c.fill();
          c.beginPath(); c.ellipse(fx * r + (i ? r * 0.04 : -r * 0.03), fy * r + r * 0.03, r * 0.09, r * 0.045, i ? 0 : -0.4, 0, TAU);
          fillInk(nbCloth(c, 0, fy * r - r * 0.04, 0, fy * r + r * 0.08, OL_GOLD), 1.1);
          olWing(c, h, fx * r - r * 0.02, fy * r - r * 0.03, r * 0.22, -0.6, -1, flap, OL_GOLD);
        });
        // short belted chiton
        c.beginPath(); c.moveTo(-r * 0.26, -r * 0.34); c.lineTo(r * 0.28, -r * 0.34);
        c.quadraticCurveTo(r * 0.32, r * 0.1, r * 0.36, r * 0.44);
        c.lineTo(r * 0.2, r * 0.4); c.lineTo(r * 0.06, r * 0.47); c.lineTo(-r * 0.1, r * 0.4); c.lineTo(-r * 0.24, r * 0.47); c.lineTo(-r * 0.34, r * 0.42);
        c.quadraticCurveTo(-r * 0.3, r * 0.1, -r * 0.26, -r * 0.34); c.closePath();
        fillInk(nbCloth(c, -r * 0.4, -r * 0.3, r * 0.4, r * 0.5, OL_LINEN), 2);
        c.beginPath(); c.moveTo(-r * 0.31, r * 0.38); c.lineTo(-r * 0.24, r * 0.42); c.lineTo(-r * 0.1, r * 0.35); c.lineTo(r * 0.06, r * 0.42); c.lineTo(r * 0.2, r * 0.35); c.lineTo(r * 0.33, r * 0.39);
        c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.8, r * 0.025); c.stroke();
        c.beginPath(); for (const fx of [-0.16, 0.0, 0.16]) { c.moveTo(fx * r, r * 0.16); c.lineTo((fx + 0.02) * r, r * 0.36); }
        c.strokeStyle = "rgba(120,110,90,0.45)"; c.lineWidth = Math.max(0.6, r * 0.016); c.stroke();
        h.rr(-r * 0.3, r * 0.06, r * 0.62, r * 0.07, r * 0.02); fillInk(h.metal(0, r * 0.06, 0, r * 0.13, OL_GOLD[0], pal.gold, OL_GOLD[2]), 1.1);
        // arms: one swinging back, one thrusting the caduceus forward
        heroLimb(c, h, -r * 0.24, -r * 0.28, -r * 0.46, -r * 0.08, -r * 0.46, r * 0.1, Math.max(3, r * 0.12), skin);
        olHand(c, h, -r * 0.46, r * 0.11, r * 0.06, OL_SKIN);
        c.beginPath(); c.arc(r * 0.22, -r * 0.33, r * 0.05, 0, TAU); fillInk(h.metal(r * 0.17, -r * 0.38, r * 0.27, -r * 0.28, OL_GOLD[0], pal.gold, OL_GOLD[2]), 1);
        heroLimb(c, h, r * 0.24, -r * 0.28, r * 0.5, -r * 0.1, r * 0.61, -r * 0.3, Math.max(3, r * 0.12), skin);
        olCaduceus(c, h, pal, ts, r * 0.52, r * 0.44, r * 0.72, -r * 1.08);
        olHand(c, h, r * 0.62, -r * 0.3, r * 0.065, OL_SKIN);
        // head: curls, youthful face, winged petasos
        const HX = r * 0.04, HY = -r * 0.58, HS = r * 0.19;
        pcFurBlob(c, HX, HY - HS * 0.05, HS * 1.08, HS * 1.06, 10, 0.16, 11); fillInk(nbCloth(c, HX - HS, HY - HS, HX + HS, HY + HS, OL_DARKHAIR), 1.2);
        olFace(c, h, HX, HY, HS, { mouth: "smile", look: 0.6, iris: "#5a8a3c", brow: "#3a2414" });
        const PY = HY - HS * 0.72, wf = flap * 0.6;
        olWing(c, h, HX - HS * 0.7, PY - HS * 0.3, HS * 1.3, -0.45, -1, wf, OL_LINEN);
        olWing(c, h, HX + HS * 0.7, PY - HS * 0.3, HS * 1.3, -0.45, 1, wf, OL_LINEN);
        const felt = nbCloth(c, HX - HS * 1.5, PY - HS * 0.8, HX + HS * 1.5, PY + HS * 0.4, OL_FELT);
        c.beginPath(); c.ellipse(HX, PY + HS * 0.1, HS * 1.55, HS * 0.32, -0.06, 0, TAU); fillInk(felt, 1.5);
        c.beginPath(); c.ellipse(HX, PY - HS * 0.22, HS * 0.78, HS * 0.55, 0, Math.PI, 0); c.closePath(); fillInk(felt, 1.4);
        c.beginPath(); c.ellipse(HX, PY - HS * 0.24, HS * 0.78, HS * 0.15, 0, 0.1, Math.PI - 0.1);
        c.strokeStyle = pal.bright; c.lineWidth = Math.max(1, HS * 0.16); c.stroke();
        c.beginPath(); c.arc(HX + HS * 0.5, PY - HS * 0.12, Math.max(0.7, HS * 0.08), 0, TAU); c.fillStyle = pal.gold; c.fill();
      },

      /* Poseidon on his Hippocampus, Earthshaker of the Deep — the sea king rides a mythic aquatic steed
         (equine forebody with turquoise fin-ears and a frilled finned mane, gold bridle with a side-coloured
         rosette, webbed fin-hooves, an iridescent scaled serpentine fish tail ending in a fan fluke) over
         surging foam-crested waves; crowned with coral and aquamarine, a side-coloured sash across his chest,
         he raises a golden trident whose side-glinting prongs surge with a spiralling seafoam swell. */
      wildrider(c, pal, r, ts, h) {
        const { fillInk, pulse } = h;
        const p = pulse(140), tt = ts ? ts / 1000 : 0, sw = ts ? Math.sin(ts / 380) : 0;
        const coat = nbCloth(c, -r * 0.1, -r * 0.6, r * 0.9, r * 0.5, OL_COAT);
        const skin = nbCloth(c, -r * 0.3, -r * 0.5, r * 0.3, r * 0.3, OL_TAN);
        const waves = (y0, amp, seed, cols, inkW) => {
          c.beginPath(); c.moveTo(-r * 1.1, r * 1.12); c.lineTo(-r * 1.1, y0);
          for (let i = 0; i < 8; i++) {
            const x0 = (-1.1 + i * 0.275) * r, x1 = x0 + r * 0.275, yy = y0 + Math.sin(i * 1.7 + seed + tt * 2.2) * amp;
            c.quadraticCurveTo(x0 + r * 0.06, yy - amp * 2.2, x1, yy);
          }
          c.lineTo(r * 1.1, r * 1.12); c.closePath(); fillInk(nbCloth(c, 0, y0 - amp * 2, 0, r * 1.12, cols), inkW);
          c.beginPath();
          for (let i = 0; i < 8; i++) {
            const x0 = (-1.1 + i * 0.275) * r, x1 = x0 + r * 0.275, yy = y0 + Math.sin(i * 1.7 + seed + tt * 2.2) * amp;
            c.moveTo(x0 + r * 0.02, yy - amp * 0.6); c.quadraticCurveTo(x0 + r * 0.07, yy - amp * 1.9, x1 - r * 0.05, yy - amp * 0.4);
          }
          c.strokeStyle = rgba(OL_FOAM, 0.9); c.lineWidth = Math.max(0.8, r * 0.025); c.stroke();
        };
        // back swell
        waves(r * 0.86, r * 0.04, 0, [OL_SEA[1], "#178a92", OL_SEA[2]], 1.6);
        // iridescent serpentine fish tail, scales and fan fluke
        const tx3 = -r * 0.84 + sw * r * 0.05, ty3 = r * 0.36;
        const tail = nbBezierPts(r * 0.05, r * 0.25, -r * 0.2, r * 0.95, -r * 0.85 + sw * r * 0.03, r * 0.95, tx3, ty3, 18);
        const tw = (t) => r * (0.36 * (1 - t) + 0.07 * t);
        const ig = c.createLinearGradient(-r * 0.9, r * 0.3, r * 0.1, r * 0.9);
        ig.addColorStop(0, OL_SEA[0]); ig.addColorStop(0.35, OL_SEA[1]); ig.addColorStop(0.65, "#6a5ae0"); ig.addColorStop(1, pal.mid);
        const fin = nbCloth(c, tx3 - r * 0.3, ty3 - r * 0.3, tx3 + r * 0.3, ty3, [OL_SEA[0], pal.rim, OL_SEA[1]]);
        for (const a of [-Math.PI / 2 - 0.72, -Math.PI / 2 + 0.72]) {
          const fa = a + sw * 0.12;
          olLeaf(c, tx3, ty3, r * 0.32, r * 0.26, fa); fillInk(fin, 1.3);
          c.beginPath(); for (const k of [-0.25, 0, 0.25]) { c.moveTo(tx3, ty3); c.lineTo(tx3 + Math.cos(fa + k) * r * 0.26, ty3 + Math.sin(fa + k) * r * 0.26); }
          c.strokeStyle = rgba(OL_SEA[2], 0.5); c.lineWidth = Math.max(0.5, r * 0.012); c.stroke();
        }
        olStrip(c, tail, tw); fillInk(ig, 2);
        c.save(); olStrip(c, tail, tw); c.clip();
        c.strokeStyle = "rgba(255,255,255,0.38)"; c.lineWidth = Math.max(0.5, r * 0.012);
        for (let i = 1; i < tail.length - 1; i++) {
          const [x, y] = tail[i], a = Math.atan2(tail[i + 1][1] - tail[i - 1][1], tail[i + 1][0] - tail[i - 1][0]), w = tw(i / (tail.length - 1));
          for (const k of [-0.6, -0.2, 0.2, 0.6]) {
            const sx = x - Math.sin(a) * w * k * 0.5, sy = y + Math.cos(a) * w * k * 0.5;
            c.beginPath(); c.arc(sx, sy, w * 0.14, a + Math.PI * 0.5, a + Math.PI * 1.5); c.stroke();
          }
        }
        olLine(c, tail); c.strokeStyle = rgba(pal.rim, 0.35 + 0.25 * p); c.lineWidth = r * 0.05; c.stroke();
        c.restore();
        // far foreleg
        const leg = (x1, y1, kx, ky, fx, fy, col, k) => {
          heroLimb(c, h, x1, y1, kx, ky, fx, fy, Math.max(3, r * 0.1), col);
          for (const a of [0.4, 1.0, 1.6]) { olLeaf(c, fx, fy, r * 0.13, r * 0.08, a + (ts ? Math.sin(ts / 120 + k) * 0.15 : 0)); fillInk(fin, 0.8); }
        };
        leg(r * 0.24, r * 0.34, r * 0.46, r * 0.52, r * 0.58, r * 0.7, nbCloth(c, 0, 0, r, r, [OL_COAT[1], OL_COAT[2], "#173e48"]), 1);
        // equine body
        c.beginPath(); c.ellipse(r * 0.2, r * 0.22, r * 0.34, r * 0.21, -0.2, 0, TAU); fillInk(coat, 2);
        c.beginPath(); for (let i = 0; i < 4; i++) { const x = r * (0.02 + i * 0.09); c.moveTo(x, r * 0.32); c.quadraticCurveTo(x + r * 0.04, r * 0.37, x + r * 0.08, r * 0.32); }
        c.strokeStyle = rgba(OL_SEA[2], 0.45); c.lineWidth = Math.max(0.5, r * 0.014); c.stroke();
        // Poseidon's draped leg and torso
        heroLimb(c, h, r * 0.0, r * 0.1, r * 0.22, r * 0.26, r * 0.12, r * 0.48, Math.max(3.5, r * 0.13), skin);
        c.beginPath(); c.ellipse(r * 0.12, r * 0.5, r * 0.07, r * 0.035, 0.3, 0, TAU); fillInk(nbCloth(c, 0, r * 0.46, 0, r * 0.54, OL_GOLD), 1);
        h.poly([-0.23, -0.4, 0.23, -0.4, 0.16, 0.12, -0.16, 0.12]); fillInk(skin, 2);
        c.beginPath(); c.moveTo(-r * 0.12, -r * 0.2); c.quadraticCurveTo(0, -r * 0.13, r * 0.12, -r * 0.2); c.moveTo(0, -r * 0.14); c.lineTo(0, r * 0.06);
        c.strokeStyle = "rgba(110,50,20,0.5)"; c.lineWidth = Math.max(0.6, r * 0.018); c.stroke();
        const sash = [[-r * 0.2, -r * 0.4], [r * 0.18, r * 0.1]];
        c.beginPath(); c.moveTo(sash[0][0], sash[0][1]); c.lineTo(sash[1][0], sash[1][1]);
        c.strokeStyle = h.INK; c.lineWidth = r * 0.09 + 2; c.stroke();
        c.strokeStyle = nbCloth(c, -r * 0.2, 0, r * 0.2, 0, [pal.rim, pal.bright, pal.deep]); c.lineWidth = r * 0.09; c.stroke();
        olMeander(c, sash[0][0] + r * 0.02, sash[0][1] + r * 0.03, sash[1][0] - r * 0.02, sash[1][1] - r * 0.03, r * 0.05, pal.gold);
        h.rr(-r * 0.18, r * 0.06, r * 0.36, r * 0.07, r * 0.02); fillInk(h.metal(0, r * 0.06, 0, r * 0.13, OL_GOLD[0], pal.gold, OL_GOLD[2]), 1.1);
        // finned mane frill, fin-ears, neck and head of the steed
        const crest = (t) => { const u = 1 - t; return [u * u * r * 0.06 + 2 * u * t * r * 0.2 + t * t * r * 0.5, u * u * r * 0.12 + 2 * u * t * -r * 0.3 + t * t * -r * 0.56]; };
        c.beginPath(); c.moveTo(...crest(0));
        const N = 6;
        for (let i = 1; i <= N; i++) {
          const tm = (i - 0.5) / N, [mx, my] = crest(tm), [ax, ay] = crest(Math.min(1, tm + 0.02)), [bx, by] = crest(Math.max(0, tm - 0.02));
          let tx = ax - bx, ty = ay - by; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
          const L = r * (0.2 + 0.05 * (ts ? Math.sin(ts / 160 + i) : 0));
          c.quadraticCurveTo(mx + ty * L, my - tx * L, ...crest(i / N));
        }
        c.lineTo(r * 0.4, -r * 0.3); c.closePath();
        fillInk(nbCloth(c, -r * 0.2, -r * 0.7, r * 0.5, r * 0.1, [pal.rim, OL_SEA[1], OL_SEA[2]]), 1.4);
        for (const [ex, ey, a] of [[0.53, -0.58, -1.9], [0.6, -0.6, -1.35]]) { olLeaf(c, ex * r, ey * r, r * 0.17, r * 0.1, a); fillInk(fin, 1); }
        c.beginPath(); c.moveTo(r * 0.06, r * 0.12);
        c.quadraticCurveTo(r * 0.2, -r * 0.3, r * 0.5, -r * 0.56); c.quadraticCurveTo(r * 0.6, -r * 0.62, r * 0.7, -r * 0.56);
        c.quadraticCurveTo(r * 0.86, -r * 0.42, r * 0.96, -r * 0.28); c.quadraticCurveTo(r * 1.0, -r * 0.2, r * 0.94, -r * 0.14);
        c.quadraticCurveTo(r * 0.84, -r * 0.1, r * 0.76, -r * 0.16); c.quadraticCurveTo(r * 0.66, -r * 0.2, r * 0.6, -r * 0.06);
        c.quadraticCurveTo(r * 0.52, r * 0.1, r * 0.46, r * 0.24); c.lineTo(r * 0.1, r * 0.3); c.closePath(); fillInk(coat, 2);
        c.beginPath(); c.moveTo(r * 0.36, -r * 0.18); c.quadraticCurveTo(r * 0.42, -r * 0.08, r * 0.38, 0); c.moveTo(r * 0.3, -r * 0.1); c.quadraticCurveTo(r * 0.36, 0, r * 0.32, r * 0.08);
        c.strokeStyle = rgba(OL_SEA[2], 0.5); c.lineWidth = Math.max(0.6, r * 0.016); c.stroke();
        c.beginPath(); c.ellipse(r * 0.74, -r * 0.44, r * 0.05, r * 0.04, -0.3, 0, TAU); fillInk("#0e2a34", 1);
        c.beginPath(); c.arc(r * 0.725, -r * 0.455, Math.max(0.5, r * 0.015), 0, TAU); c.fillStyle = "#ffffff"; c.fill();
        c.beginPath(); c.ellipse(r * 0.92, -r * 0.23, r * 0.022, r * 0.014, 0.5, 0, TAU); c.fillStyle = "#173e48"; c.fill();
        // gold bridle with a side-coloured rosette
        c.beginPath(); c.moveTo(r * 0.64, -r * 0.54); c.lineTo(r * 0.76, -r * 0.24); c.moveTo(r * 0.82, -r * 0.34); c.lineTo(r * 0.8, -r * 0.14);
        c.strokeStyle = h.INK; c.lineWidth = r * 0.035 + 1.6; c.stroke(); c.strokeStyle = OL_GOLD[1]; c.lineWidth = r * 0.035; c.stroke();
        c.beginPath(); c.arc(r * 0.72, -r * 0.33, r * 0.04, 0, TAU); fillInk(pal.bright, 1);
        // near foreleg pawing forward
        leg(r * 0.4, r * 0.24, r * 0.68, r * 0.24, r * 0.74, r * 0.5, coat, 2);
        // rider's arm on the reins
        heroLimb(c, h, r * 0.2, -r * 0.34, r * 0.38, -r * 0.1, r * 0.5, -r * 0.2, Math.max(3, r * 0.12), skin);
        c.beginPath(); c.moveTo(r * 0.5, -r * 0.2); c.quadraticCurveTo(r * 0.64, -r * 0.12, r * 0.76, -r * 0.24);
        c.strokeStyle = OL_GOLD[2]; c.lineWidth = Math.max(0.8, r * 0.018); c.stroke();
        olHand(c, h, r * 0.5, -r * 0.2, r * 0.055, OL_TAN);
        // raised arm, golden trident and its seafoam swell
        const TX = -r * 0.5;
        heroLimb(c, h, -r * 0.2, -r * 0.34, -r * 0.44, -r * 0.36, TX, -r * 0.6, Math.max(3, r * 0.12), skin);
        olTrident(c, h, pal, ts, TX, r * 0.32, 0, r * 1.42);
        c.save(); c.globalCompositeOperation = "lighter";
        const spiral = (front) => {
          let open = false;
          for (let i = 0; i <= 24; i++) {
            const t = i / 24, ph = t * Math.PI * 3.2 + tt * 5, y = r * (-0.42 - 0.5 * t), x = TX + Math.sin(ph) * r * (0.06 + 0.1 * t);
            if ((Math.cos(ph) >= 0) === front) { if (!open) { c.beginPath(); c.moveTo(x, y); open = true; } else c.lineTo(x, y); }
            else if (open) { c.stroke(); open = false; }
          }
          if (open) c.stroke();
        };
        c.strokeStyle = rgba(OL_FOAM, 0.55); c.lineWidth = Math.max(1, r * 0.03); spiral(true);
        c.strokeStyle = rgba(pal.rim, 0.5); c.lineWidth = Math.max(0.6, r * 0.014); spiral(false);
        c.restore();
        for (let i = 0; i < 7; i++) {
          const t = ts ? (ts / 900 + i / 7) % 1 : (i + 0.5) / 7, a = i * 2.4 + 0.3;
          const x = TX + Math.cos(a) * r * (0.06 + 0.22 * t), y = -r * (0.98 - 0.25 * t * t) - Math.sin(a) * r * 0.04 * t;
          c.beginPath(); c.arc(x, y, r * 0.022 * (1 - 0.5 * t), 0, TAU); c.fillStyle = rgba(i % 2 ? OL_FOAM : pal.rim, 0.9 * (1 - t)); c.fill();
        }
        olHand(c, h, TX, -r * 0.6, r * 0.06, OL_TAN);
        // head: sea-grey locks and beard, coral-and-aquamarine crown
        const HX = -r * 0.02, HY = -r * 0.62, HS = r * 0.17;
        c.beginPath(); c.moveTo(HX - HS * 1.0, HY - HS * 0.5); c.quadraticCurveTo(HX - HS * 1.35, HY + HS * 0.6, HX - HS * 1.0 - sw * r * 0.02, HY + HS * 1.5);
        c.lineTo(HX + HS * 1.0, HY + HS * 1.3); c.quadraticCurveTo(HX + HS * 1.3, HY + HS * 0.5, HX + HS * 1.0, HY - HS * 0.5); c.closePath();
        fillInk(nbCloth(c, 0, HY - HS, 0, HY + HS * 1.5, OL_SEAHAIR), 1.3);
        olFace(c, h, HX, HY, HS, { skin: OL_TAN, stern: 0.7, beard: true, iris: "#1fa8a0", brow: "#3e5466" });
        olBeard(c, h, HX, HY, HS, r * 0.18, OL_SEAHAIR, sw * r * 0.015);
        c.beginPath(); c.ellipse(HX, HY - HS * 0.62, HS * 0.92, HS * 0.4, 0, Math.PI, 0); c.closePath(); fillInk(nbCloth(c, 0, HY - HS, 0, HY - HS * 0.6, OL_SEAHAIR), 1.2);
        const cy0 = HY - HS * 0.66;
        for (const [dx, hgt] of [[-0.62, 0.55], [-0.3, 0.8], [0, 1.0], [0.3, 0.8], [0.62, 0.55]]) {
          const bx = HX + dx * HS, top = cy0 - hgt * HS;
          c.beginPath(); c.moveTo(bx, cy0); c.lineTo(bx, top); c.moveTo(bx, cy0 - hgt * HS * 0.5); c.lineTo(bx + HS * 0.16 * Math.sign(dx || 1), cy0 - hgt * HS * 0.78);
          c.strokeStyle = h.INK; c.lineWidth = HS * 0.16 + 1.6; c.stroke(); c.strokeStyle = OL_CORAL[1]; c.lineWidth = HS * 0.16; c.stroke();
          c.beginPath(); c.arc(bx, top, HS * 0.07, 0, TAU); c.fillStyle = OL_CORAL[0]; c.fill();
        }
        h.rr(HX - HS * 0.9, cy0 - HS * 0.08, HS * 1.8, HS * 0.2, HS * 0.06); fillInk(h.metal(0, cy0 - HS * 0.1, 0, cy0 + HS * 0.12, OL_GOLD[0], pal.gold, OL_GOLD[2]), 1.1);
        for (const dx of [-0.5, 0, 0.5]) {
          c.beginPath(); c.ellipse(HX + dx * HS, cy0 + HS * 0.02, HS * 0.1, HS * 0.08, 0, 0, TAU); fillInk(dx ? "#7fffd4" : pal.bright, 0.8);
        }
        wkGlow(c, HX, cy0, HS * 0.4, pal.bright, 0.5 + 0.4 * p);
        // front swell with flying spray
        waves(r * 0.98, r * 0.035, 2.1, [OL_SEA[0], OL_SEA[1], "#0e5a66"], 1.4);
        for (let i = 0; i < 6; i++) {
          const t = ts ? (ts / 800 + i / 6) % 1 : (i + 0.5) / 6, x0 = (-0.8 + i * 0.32) * r;
          c.beginPath(); c.arc(x0 + t * r * 0.08, r * (0.9 - 0.3 * t * (1 - t) * 4 * 0.5), r * 0.02 * (1 - t * 0.6), 0, TAU);
          c.fillStyle = rgba(OL_FOAM, 0.85 * (1 - t)); c.fill();
        }
      },

      /* Athena, Goddess of Wisdom & Warfare — grey-eyed warrior goddess with a high-crested Corinthian hoplite
         helmet pushed up on her brow (scarlet horsehair crest with side-coloured strands on a gold holder), a
         gold-scaled aegis mantle fringed with serpents, a peplos with a side-coloured overfold and meander
         border, a long bronze-headed spear, and the bronze Aegis shield bearing the Gorgoneion inside a sunburst
         and a side-gold rim — while her owl hovers on beating wings. */
      skirmisher(c, pal, r, ts, h) {
        const { fillInk, pulse } = h;
        const p = pulse(170), flap = ts ? Math.sin(ts / 150) : 0, sway = ts ? Math.sin(ts / 420) * r * 0.02 : 0;
        const skin = nbCloth(c, -r * 0.4, -r * 0.6, r * 0.6, r * 0.2, OL_SKIN);
        // hovering owl
        const OX = -r * 0.7, OY = -r * 0.8 + (ts ? Math.sin(ts / 300) * r * 0.025 : 0), OS = r * 0.25;
        const owl = OL_OWL;
        olWing(c, h, OX - OS * 0.3, OY + OS * 0.05, OS * 1.15, -0.35, -1, flap * 0.35, owl);
        olWing(c, h, OX + OS * 0.3, OY + OS * 0.05, OS * 1.15, -0.35, 1, flap * 0.35, owl);
        c.beginPath(); c.ellipse(OX, OY + OS * 0.12, OS * 0.42, OS * 0.55, 0, 0, TAU); fillInk(nbCloth(c, OX - OS, OY - OS, OX + OS, OY + OS, owl), 1.3);
        c.beginPath(); for (let i = 0; i < 3; i++) { const yy = OY + OS * (0.18 + i * 0.14); c.moveTo(OX - OS * 0.18, yy); c.quadraticCurveTo(OX, yy + OS * 0.08, OX + OS * 0.18, yy); }
        c.strokeStyle = rgba(owl[2], 0.6); c.lineWidth = Math.max(0.5, OS * 0.05); c.stroke();
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(OX + sx * OS * 0.22, OY - OS * 0.42); c.lineTo(OX + sx * OS * 0.34, OY - OS * 0.66); c.lineTo(OX + sx * OS * 0.38, OY - OS * 0.36); c.closePath(); fillInk(owl[1], 0.9);
          c.beginPath(); c.arc(OX + sx * OS * 0.18, OY - OS * 0.22, OS * 0.18, 0, TAU); fillInk("#fbf4e2", 0.9);
          c.beginPath(); c.arc(OX + sx * OS * 0.18, OY - OS * 0.22, OS * 0.11, 0, TAU); c.fillStyle = pal.gold; c.fill();
          c.beginPath(); c.arc(OX + sx * OS * 0.18, OY - OS * 0.22, OS * 0.11, 0, TAU); c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.5, OS * 0.04); c.stroke();
          c.beginPath(); c.arc(OX + sx * OS * 0.18, OY - OS * 0.22, OS * 0.055, 0, TAU); c.fillStyle = "#0b0710"; c.fill();
        }
        c.beginPath(); c.moveTo(OX - OS * 0.06, OY - OS * 0.12); c.lineTo(OX + OS * 0.06, OY - OS * 0.12); c.lineTo(OX, OY + OS * 0.04); c.closePath(); fillInk("#e8a830", 0.7);
        // long hair behind
        c.beginPath(); c.moveTo(-r * 0.2, -r * 0.7); c.quadraticCurveTo(-r * 0.34, -r * 0.3, -r * 0.3 + sway, -r * 0.02);
        c.lineTo(r * 0.3 + sway, -r * 0.02); c.quadraticCurveTo(r * 0.34, -r * 0.3, r * 0.2, -r * 0.7); c.closePath();
        fillInk(nbCloth(c, 0, -r * 0.7, 0, 0, OL_DARKHAIR), 1.3);
        // spear shaft
        const SB = [r * 0.62, r * 1.02], ST = [r * 0.7, -r * 0.92];
        c.beginPath(); c.moveTo(SB[0], SB[1]); c.lineTo(ST[0], ST[1]); c.strokeStyle = h.INK; c.lineWidth = r * 0.04 + 2.2; c.stroke();
        c.strokeStyle = nbCloth(c, r * 0.6, 0, r * 0.72, 0, OL_WOOD); c.lineWidth = r * 0.04; c.stroke();
        const sa = Math.atan2(ST[1] - SB[1], ST[0] - SB[0]);
        olLeaf(c, ST[0] + Math.cos(sa) * r * 0.02, ST[1] + Math.sin(sa) * r * 0.02, r * 0.2, r * 0.14, sa);
        fillInk(nbCloth(c, ST[0] - r * 0.06, 0, ST[0] + r * 0.06, 0, [OL_BRONZE[0], pal.gold, OL_BRONZE[2]]), 1.3);
        c.beginPath(); c.moveTo(ST[0], ST[1]); c.lineTo(ST[0] + Math.cos(sa) * r * 0.17, ST[1] + Math.sin(sa) * r * 0.17);
        c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = Math.max(0.5, r * 0.012); c.stroke();
        wkSparkle(c, ST[0] + Math.cos(sa) * r * 0.14, ST[1] + Math.sin(sa) * r * 0.14, r * 0.06 * (0.6 + 0.6 * p), pal.rim, ts ? ts / 400 : 0.3, 0.95);
        // peplos with side-coloured overfold and meander border
        c.beginPath(); c.moveTo(-r * 0.26, -r * 0.34); c.lineTo(r * 0.26, -r * 0.34);
        c.quadraticCurveTo(r * 0.4, r * 0.4, r * 0.5, r * 1.0); c.lineTo(-r * 0.5, r * 1.0); c.quadraticCurveTo(-r * 0.4, r * 0.4, -r * 0.26, -r * 0.34); c.closePath();
        fillInk(nbCloth(c, -r * 0.5, 0, r * 0.5, r, OL_LINEN), 2.2);
        c.beginPath(); for (const fx of [-0.2, 0, 0.2]) { c.moveTo(fx * r, r * 0.42); c.quadraticCurveTo((fx + 0.03) * r, r * 0.7, fx * 1.4 * r, r * 0.96); }
        c.strokeStyle = "rgba(120,110,90,0.45)"; c.lineWidth = Math.max(0.6, r * 0.018); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.3, -r * 0.08); c.lineTo(r * 0.3, -r * 0.08); c.quadraticCurveTo(r * 0.38, r * 0.16, r * 0.4, r * 0.38);
        c.lineTo(-r * 0.4, r * 0.38); c.quadraticCurveTo(-r * 0.38, r * 0.16, -r * 0.3, -r * 0.08); c.closePath();
        fillInk(nbCloth(c, -r * 0.4, -r * 0.1, r * 0.4, r * 0.4, [pal.rim, pal.bright, pal.deep]), 1.6);
        h.rr(-r * 0.4, r * 0.32, r * 0.8, r * 0.07, r * 0.015); fillInk(h.metal(0, r * 0.32, 0, r * 0.39, OL_GOLD[0], pal.gold, OL_GOLD[2]), 1);
        olMeander(c, -r * 0.37, r * 0.355, r * 0.37, r * 0.355, r * 0.05, pal.deep);
        h.rr(-r * 0.28, r * 0.02, r * 0.56, r * 0.05, r * 0.015); fillInk(OL_GOLD[1], 1);
        // gold-scaled aegis mantle fringed with serpents
        c.beginPath(); c.moveTo(-r * 0.32, -r * 0.36); c.quadraticCurveTo(0, -r * 0.42, r * 0.32, -r * 0.36);
        c.quadraticCurveTo(r * 0.3, -r * 0.14, 0, -r * 0.08); c.quadraticCurveTo(-r * 0.3, -r * 0.14, -r * 0.32, -r * 0.36); c.closePath();
        fillInk(h.metal(-r * 0.3, -r * 0.4, r * 0.3, -r * 0.1, OL_GOLD[0], pal.gold, OL_GOLD[2]), 1.4);
        c.beginPath(); for (let i = 0; i < 3; i++) for (let j = -2; j <= 2; j++) { const x = j * r * 0.1 + (i % 2) * r * 0.05, y = -r * (0.32 - i * 0.06); c.moveTo(x - r * 0.04, y); c.quadraticCurveTo(x, y + r * 0.04, x + r * 0.04, y); }
        c.strokeStyle = rgba(OL_GOLD[2], 0.6); c.lineWidth = Math.max(0.5, r * 0.012); c.stroke();
        c.beginPath();
        for (let i = 0; i < 7; i++) {
          const t = i / 6, x = -r * 0.28 + t * r * 0.56, y = -r * 0.14 - Math.sin(t * Math.PI) * -r * 0.05 + r * 0.01, w = ts ? Math.sin(ts / 140 + i) * r * 0.012 : 0;
          c.moveTo(x, y); c.quadraticCurveTo(x - r * 0.02 + w, y + r * 0.04, x + w, y + r * 0.07);
        }
        c.strokeStyle = "#4f9a48"; c.lineWidth = Math.max(0.7, r * 0.018); c.stroke();
        c.beginPath(); c.arc(0, -r * 0.24, r * 0.04, 0, TAU); fillInk(pal.bright, 0.8);
        // arm raised to the spear
        heroLimb(c, h, r * 0.26, -r * 0.3, r * 0.5, -r * 0.28, r * 0.67, -r * 0.46, Math.max(3, r * 0.12), skin);
        olHand(c, h, r * 0.67, -r * 0.46, r * 0.06, OL_SKIN);
        // head: grey-eyed goddess and her raised Corinthian helmet
        const HX = 0, HY = -r * 0.56, HS = r * 0.18;
        olFace(c, h, HX, HY, HS, { stern: 0.3, iris: "#8a9cb4", brow: "#3a2414" });
        c.beginPath(); c.moveTo(HX - HS * 0.86, HY - HS * 0.1); c.quadraticCurveTo(HX - HS * 0.6, HY - HS * 0.6, HX, HY - HS * 0.66);
        c.quadraticCurveTo(HX + HS * 0.6, HY - HS * 0.6, HX + HS * 0.86, HY - HS * 0.1); c.lineTo(HX + HS * 0.9, HY - HS * 0.8); c.lineTo(HX - HS * 0.9, HY - HS * 0.8); c.closePath();
        fillInk(nbCloth(c, 0, HY - HS, 0, HY, OL_DARKHAIR), 1.1);
        // crest (behind the bowl)
        const cs = sway * 0.8;
        c.beginPath(); c.moveTo(-r * 0.08, -r * 0.86);
        c.bezierCurveTo(-r * 0.16, -r * 1.12, r * 0.2, -r * 1.22, r * 0.38, -r * 1.0);
        c.quadraticCurveTo(r * 0.5, -r * 0.84, r * 0.46 + cs, -r * 0.56);
        c.quadraticCurveTo(r * 0.36, -r * 0.78, r * 0.22, -r * 0.86); c.closePath();
        fillInk(nbCloth(c, -r * 0.1, -r * 1.2, r * 0.5, -r * 0.6, OL_SCARLET), 1.5);
        c.beginPath();
        for (const k of [0.25, 0.5, 0.75]) { c.moveTo(-r * 0.04 + k * r * 0.1, -r * 0.9); c.bezierCurveTo(-r * 0.08 + k * r * 0.1, -r * (1.08 - k * 0.08), r * 0.2, -r * (1.16 - k * 0.12), r * (0.36 - k * 0.04), -r * (0.98 - k * 0.04)); c.quadraticCurveTo(r * (0.44 - k * 0.04), -r * 0.82, r * (0.42 - k * 0.04) + cs, -r * (0.62 + k * 0.06)); }
        c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.7, r * 0.018); c.stroke();
        // helmet bowl with pushed-up face-plate
        const bronze = h.metal(HX - HS, HY - HS * 2, HX + HS, HY - HS * 0.5, OL_BRONZE[0], OL_BRONZE[1], OL_BRONZE[2]);
        c.beginPath(); c.moveTo(HX - HS * 1.12, HY - HS * 0.5);
        c.bezierCurveTo(HX - HS * 1.2, HY - HS * 2.0, HX + HS * 1.2, HY - HS * 2.0, HX + HS * 1.12, HY - HS * 0.5);
        c.quadraticCurveTo(HX, HY - HS * 0.78, HX - HS * 1.12, HY - HS * 0.5); c.closePath(); fillInk(bronze, 1.6);
        for (const sx of [-1, 1]) { olAlmond(c, HX + sx * HS * 0.42, HY - HS * 1.12, HS * 0.3, HS * 0.13); fillInk("#2a160a", 0.9); }
        c.beginPath(); c.moveTo(HX, HY - HS * 1.26); c.lineTo(HX, HY - HS * 0.76); c.strokeStyle = h.INK; c.lineWidth = HS * 0.16 + 1.4; c.stroke(); c.strokeStyle = OL_BRONZE[1]; c.lineWidth = HS * 0.16; c.stroke();
        c.beginPath(); c.moveTo(HX - HS * 1.08, HY - HS * 0.56); c.quadraticCurveTo(HX, HY - HS * 0.82, HX + HS * 1.08, HY - HS * 0.56);
        c.strokeStyle = pal.gold; c.lineWidth = Math.max(0.8, HS * 0.12); c.stroke();
        h.rr(HX - HS * 0.12, HY - HS * 1.86, HS * 0.24, HS * 0.32, HS * 0.06); fillInk(h.metal(0, HY - HS * 1.9, 0, HY - HS * 1.5, OL_GOLD[0], pal.gold, OL_GOLD[2]), 1);
        // Aegis shield with the Gorgoneion
        olGorgoneion(c, h, pal, ts, -r * 0.44, r * 0.3, r * 0.42);
      },

      /* Apollo, the Solar Far-Shooter — god of light within a rotating radiant 12-point solar corona with a
         side-coloured ring, golden curls and sacred golden laurel, side-coloured chlamys over a white chiton, drawing an
         ornate gold recurve bow with side-coloured inlays that looses a blazing arrow of pure sunlight trailed
         by flame tongues, lens flares and shimmering motes. */
      harrower(c, pal, r, ts, h) {
        const { fillInk, pulse } = h;
        const p = pulse(130), spin = ts ? ts / 2600 : 0;
        const skin = nbCloth(c, -r * 0.5, -r * 0.6, r * 0.5, r * 0.9, OL_SKIN);
        const HX = r * 0.04, HY = -r * 0.62, HS = r * 0.18;
        // radiant 12-point corona
        wkGlow(c, HX, HY, r * 0.5, OL_SUN, 0.45 + 0.3 * p);
        c.beginPath();
        for (let i = 0; i < 24; i++) {
          const a = spin + i * Math.PI / 12, R = i % 2 ? r * 0.27 : r * (i % 4 ? 0.42 : 0.5);
          const x = HX + Math.cos(a) * R, y = HY + Math.sin(a) * R; if (i) c.lineTo(x, y); else c.moveTo(x, y);
        }
        c.closePath();
        const cg = c.createRadialGradient(HX, HY, r * 0.1, HX, HY, r * 0.5);
        cg.addColorStop(0, "#fffbe0"); cg.addColorStop(0.5, OL_SUN); cg.addColorStop(1, "#e88a10");
        fillInk(cg, 1.3);
        c.beginPath(); c.arc(HX, HY, r * 0.29, 0, TAU); c.strokeStyle = h.INK; c.lineWidth = r * 0.035 + 1.6; c.stroke();
        c.strokeStyle = pal.bright; c.lineWidth = r * 0.035; c.stroke();
        // side-coloured chlamys behind
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.36); c.quadraticCurveTo(r * 0.5, -r * 0.4, r * 0.56, r * 0.1);
        c.quadraticCurveTo(r * 0.62, r * 0.4, r * 0.48 + (ts ? Math.sin(ts / 300) * r * 0.03 : 0), r * 0.7); c.lineTo(r * 0.2, r * 0.5); c.lineTo(-r * 0.2, -r * 0.1); c.closePath();
        fillInk(nbCloth(c, -r * 0.2, -r * 0.4, r * 0.6, r * 0.7, [pal.rim, pal.bright, pal.deep]), 1.8);
        c.beginPath(); c.moveTo(r * 0.5, 0); c.quadraticCurveTo(r * 0.58, r * 0.4, r * 0.48, r * 0.68); c.strokeStyle = pal.gold; c.lineWidth = Math.max(0.8, r * 0.025); c.stroke();
        // legs and sandals
        for (const sx of [-1, 1]) {
          heroLimb(c, h, sx * r * 0.12, r * 0.4, sx * r * 0.2, r * 0.7, sx * r * 0.2 + (sx < 0 ? -r * 0.04 : 0), r * 0.98, Math.max(3.5, r * 0.14), skin);
          c.beginPath(); c.ellipse(sx * r * 0.2 + (sx < 0 ? -r * 0.06 : r * 0.02), r * 1.02, r * 0.1, r * 0.045, 0, 0, TAU); fillInk(nbCloth(c, 0, r * 0.98, 0, r * 1.07, OL_GOLD), 1.1);
          c.beginPath(); c.moveTo(sx * r * 0.13, r * 0.88); c.lineTo(sx * r * 0.27, r * 0.92); c.strokeStyle = OL_GOLD[2]; c.lineWidth = Math.max(0.7, r * 0.02); c.stroke();
        }
        // chiton
        c.beginPath(); c.moveTo(-r * 0.24, -r * 0.34); c.lineTo(r * 0.24, -r * 0.34); c.quadraticCurveTo(r * 0.32, r * 0.1, r * 0.34, r * 0.52);
        c.lineTo(-r * 0.34, r * 0.52); c.quadraticCurveTo(-r * 0.32, r * 0.1, -r * 0.24, -r * 0.34); c.closePath();
        fillInk(nbCloth(c, -r * 0.35, -r * 0.3, r * 0.35, r * 0.5, OL_LINEN), 2);
        c.beginPath(); for (const fx of [-0.18, -0.04, 0.1, 0.22]) { c.moveTo(fx * r, r * 0.14); c.lineTo(fx * 1.1 * r, r * 0.48); }
        c.strokeStyle = "rgba(120,110,90,0.45)"; c.lineWidth = Math.max(0.6, r * 0.016); c.stroke();
        h.rr(-r * 0.34, r * 0.45, r * 0.68, r * 0.07, r * 0.015); fillInk(h.metal(0, r * 0.45, 0, r * 0.52, OL_GOLD[0], pal.gold, OL_GOLD[2]), 1);
        olMeander(c, -r * 0.31, r * 0.485, r * 0.31, r * 0.485, r * 0.05, pal.deep);
        h.rr(-r * 0.28, r * 0.06, r * 0.56, r * 0.06, r * 0.015); fillInk(OL_GOLD[1], 1);
        // ornate recurve bow
        const GX = -r * 0.68, GY = -r * 0.36;
        const upper = nbBezierPts(GX, GY, -r * 0.66, -r * 0.72, -r * 0.48, -r * 0.98, -r * 0.62, -r * 1.1, 12);
        const lower = nbBezierPts(GX, GY, -r * 0.66, r * 0.0, -r * 0.48, r * 0.26, -r * 0.62, r * 0.38, 12);
        const sp = upper[9], spl = lower[9], drawX = r * 0.14;
        c.beginPath(); c.moveTo(sp[0], sp[1]); c.lineTo(drawX, GY); c.lineTo(spl[0], spl[1]);
        c.strokeStyle = rgba("#fff6d0", 0.9); c.lineWidth = Math.max(0.6, r * 0.012); c.stroke();
        const bowG = nbCloth(c, -r * 0.75, 0, -r * 0.45, 0, [OL_GOLD[0], OL_GOLD[1], OL_GOLD[2]]);
        for (const limb of [upper, lower]) {
          olStrip(c, limb, (t) => r * (0.075 - 0.05 * t)); fillInk(bowG, 1.4);
          olLine(c, limb.slice(1, 9)); c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.6, r * 0.016); c.stroke();
          const tip = limb[12]; c.beginPath(); c.arc(tip[0], tip[1], r * 0.025, 0, TAU); fillInk(pal.gold, 0.8);
        }
        h.rr(GX - r * 0.04, GY - r * 0.08, r * 0.08, r * 0.16, r * 0.02); fillInk(nbCloth(c, GX - r * 0.04, 0, GX + r * 0.04, 0, OL_LEATHER), 1.1);
        // arms: one extended to the bow, one drawing the string to the jaw
        heroLimb(c, h, -r * 0.2, -r * 0.3, -r * 0.44, -r * 0.34, GX, GY, Math.max(3, r * 0.12), skin);
        olHand(c, h, GX, GY, r * 0.065, OL_SKIN);
        heroLimb(c, h, r * 0.22, -r * 0.3, r * 0.56, -r * 0.42, drawX + r * 0.02, GY - r * 0.01, Math.max(3, r * 0.12), skin);
        olHand(c, h, drawX + r * 0.02, GY - r * 0.01, r * 0.06, OL_SKIN);
        c.beginPath(); c.arc(r * 0.2, -r * 0.33, r * 0.045, 0, TAU); fillInk(h.metal(r * 0.15, -r * 0.38, r * 0.25, -r * 0.28, OL_GOLD[0], pal.gold, OL_GOLD[2]), 1);
        // blazing arrow of sunlight
        const AX = -r * 1.0;
        c.save(); c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 6; i++) {
          const x = drawX - r * 0.06 - i * r * 0.17, fl = ts ? Math.sin(ts / 70 + i * 1.7) : 0;
          srFlame(c, x, GY, r * (0.1 + 0.04 * fl), r * 0.07, Math.PI / 2 + fl * 0.2, rgba(i % 2 ? OL_SUN : "#ff9a2a", 0.55));
        }
        c.beginPath(); c.moveTo(drawX, GY); c.lineTo(AX + r * 0.08, GY);
        c.strokeStyle = rgba(OL_SUN, 0.35 + 0.2 * p); c.lineWidth = r * 0.1; c.stroke();
        c.strokeStyle = rgba(OL_SUN, 0.8); c.lineWidth = r * 0.04; c.stroke();
        c.strokeStyle = "#ffffff"; c.lineWidth = Math.max(0.7, r * 0.016); c.stroke();
        c.restore();
        c.beginPath(); c.moveTo(AX, GY); c.lineTo(AX + r * 0.13, GY - r * 0.055); c.lineTo(AX + r * 0.1, GY); c.lineTo(AX + r * 0.13, GY + r * 0.055); c.closePath();
        fillInk(nbCloth(c, AX, GY - r * 0.05, AX + r * 0.13, GY + r * 0.05, ["#ffffff", pal.gold, OL_GOLD[2]]), 1.1);
        for (const k of [-1, 1]) { olLeaf(c, drawX + r * 0.02, GY, r * 0.12, r * 0.05, Math.PI + k * 0.35); fillInk(pal.bright, 0.8); }
        // lens flare at the arrowhead
        wkGlow(c, AX + r * 0.04, GY, r * 0.18 * (0.8 + 0.4 * p), OL_SUN, 0.95);
        c.save(); c.globalCompositeOperation = "lighter";
        c.beginPath(); c.moveTo(AX - r * 0.14, GY); c.lineTo(AX + r * 0.26, GY); c.moveTo(AX + r * 0.04, GY - r * 0.14); c.lineTo(AX + r * 0.04, GY + r * 0.14);
        c.strokeStyle = rgba("#fff6d0", 0.6 + 0.3 * p); c.lineWidth = Math.max(0.6, r * 0.012); c.stroke();
        for (const [t, rad, col] of [[0.3, 0.05, pal.bright], [0.55, 0.03, OL_SUN], [0.8, 0.07, pal.rim]]) {
          c.beginPath(); c.arc(AX + (r * 0.3) * t, GY + r * 0.35 * t, r * rad, 0, TAU);
          c.strokeStyle = rgba(col, 0.45); c.lineWidth = Math.max(0.6, r * 0.012); c.stroke();
        }
        c.restore();
        // head: golden curls, serene face, sacred golden laurel wreath
        pcFurBlob(c, HX, HY + HS * 0.1, HS * 1.15, HS * 1.2, 11, 0.18, 4); fillInk(nbCloth(c, HX - HS, HY - HS, HX + HS, HY + HS, OL_GOLDHAIR), 1.3);
        olFace(c, h, HX, HY, HS, { look: -0.8, stern: 0.4, iris: "#c88a1a", brow: "#a8761a" });
        c.beginPath(); c.ellipse(HX, HY - HS * 0.7, HS * 0.9, HS * 0.4, 0, Math.PI, 0); c.closePath();
        fillInk(nbCloth(c, HX - HS, HY - HS * 1.1, HX + HS, HY - HS * 0.5, OL_GOLDHAIR), 1.1);
        for (const sx of [-1, 1]) { c.beginPath(); c.arc(HX + sx * HS * 0.82, HY - HS * 0.42, HS * 0.2, 0, TAU); fillInk(OL_GOLDHAIR[1], 1); }
        olLaurel(c, h, pal, HX, HY - HS * 0.62, HS * 0.92, HS * 0.3, { n: 5 });
        // shimmering solar motes
        for (let i = 0; i < 6; i++) {
          const a = (ts ? -ts / 1500 : 0) + i * TAU / 6, R = r * (0.56 + 0.04 * Math.sin(i * 3 + (ts ? ts / 200 : 0)));
          wkSparkle(c, HX + Math.cos(a) * R, HY + Math.sin(a) * R * 0.9, r * 0.035, i % 2 ? pal.rim : "#fff6c0", a, 0.85);
        }
      },

      /* Ares, God of Savage War — brutal Spartan warlord wreathed in a boiling red/bronze fury aura with
         smoking embers: crested closed Corinthian war helmet with a sweeping, flickering scarlet horsehair crest
         and ember-bright eyes behind the T-slit, a battle-scarred blood-bronze muscled cuirass with side-coloured
         trim, bronze greaves, a torn scarlet cloak, and twin leaf-bladed xiphos raised high with side-gem pommels. */
      fury(c, pal, r, ts, h) {
        const { fillInk, pulse } = h;
        const p = pulse(110), q = pulse(70, 2.1), sway = ts ? Math.sin(ts / 260) * r * 0.03 : 0;
        const skin = nbCloth(c, -r * 0.6, -r * 0.5, r * 0.6, r * 0.9, OL_TAN);
        const bb = nbCloth(c, -r * 0.45, -r * 0.4, r * 0.45, r * 0.35, OL_BLOODBRONZE);
        // boiling fury aura
        wkGlow(c, 0, -r * 0.05, r * 0.95, OL_EMBER, 0.32 + 0.22 * p);
        c.save(); c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 11; i++) {
          const t = i / 10, a = -Math.PI * 1.05 + t * Math.PI * 1.1 + (ts ? Math.sin(ts / 200 + i) * 0.04 : 0);
          const bx = Math.cos(a) * r * 0.48, by = r * 0.15 + Math.sin(a) * r * 0.62;
          const len = r * (0.26 + 0.1 * (ts ? Math.sin(ts / 90 + i * 2.3) : heroHash(i) - 0.5));
          srFlame(c, bx, by, len, r * 0.18, a + Math.PI / 2, rgba(i % 3 === 0 ? pal.bright : i % 2 ? OL_EMBER : "#ffb03a", 0.42));
        }
        for (let i = 0; i < 7; i++) {
          const x = (-0.75 + i * 0.25) * r, len = r * (0.3 + 0.12 * (ts ? Math.sin(ts / 110 + i * 1.3) : 0));
          srFlame(c, x, r * 1.08, len, r * 0.24, ts ? Math.sin(ts / 170 + i) * 0.1 : 0, rgba(i % 2 ? OL_EMBER : "#c8501a", 0.5));
        }
        c.restore();
        // drifting smoke
        for (let i = 0; i < 4; i++) {
          const t = ts ? (ts / 2600 + i / 4) % 1 : (i + 0.5) / 4, x = (i % 2 ? 1 : -1) * r * (0.5 + 0.2 * t), y = r * (-0.2 - 0.8 * t), rad = r * (0.08 + 0.1 * t);
          c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fillStyle = rgba("#2a1410", 0.35 * (1 - t)); c.fill();
        }
        // torn scarlet cloak
        c.beginPath(); c.moveTo(-r * 0.4, -r * 0.34); c.quadraticCurveTo(-r * 0.78, r * 0.2, -r * 0.82 + sway, r * 0.92);
        for (let i = 1; i <= 8; i++) { const x = (-0.82 + i * 0.205) * r + sway * (1 - i / 8); c.lineTo(x - r * 0.1, r * (i % 2 ? 0.8 : 0.96)); c.lineTo(x, r * 0.9); }
        c.quadraticCurveTo(r * 0.78, r * 0.2, r * 0.4, -r * 0.34); c.closePath();
        fillInk(nbCloth(c, -r * 0.8, -r * 0.3, r * 0.8, r * 0.9, OL_SCARLET), 2);
        // legs with bronze greaves
        for (const sx of [-1, 1]) {
          heroLimb(c, h, sx * r * 0.16, r * 0.48, sx * r * 0.32, r * 0.72, sx * r * 0.3, r * 0.98, Math.max(4, r * 0.18), skin);
          c.beginPath(); c.moveTo(sx * r * 0.2, r * 0.7); c.quadraticCurveTo(sx * r * 0.42, r * 0.74, sx * r * 0.4, r * 0.96); c.lineTo(sx * r * 0.22, r * 0.98); c.quadraticCurveTo(sx * r * 0.2, r * 0.82, sx * r * 0.2, r * 0.7); c.closePath();
          fillInk(h.metal(sx * r * 0.2, 0, sx * r * 0.42, 0, ...OL_BRONZE), 1.3);
          c.beginPath(); c.ellipse(sx * r * 0.31, r * 1.03, r * 0.12, r * 0.05, 0, 0, TAU); fillInk(nbCloth(c, 0, r * 0.98, 0, r * 1.08, OL_LEATHER), 1.2);
        }
        // pteruges
        for (let i = 0; i < 7; i++) {
          const x0 = (-0.39 + i * 0.112) * r;
          h.rr(x0, r * 0.28, r * 0.1, r * (0.3 + (i % 2 ? 0.04 : 0)), r * 0.02); fillInk(nbCloth(c, 0, r * 0.28, 0, r * 0.64, [OL_SCARLET[1], "#7a1a12", "#2a0806"]), 1.1);
          c.beginPath(); c.arc(x0 + r * 0.05, r * 0.33, Math.max(0.6, r * 0.018), 0, TAU); c.fillStyle = OL_GOLD[1]; c.fill();
        }
        // battle-scarred muscled cuirass
        c.beginPath(); c.moveTo(-r * 0.44, -r * 0.32); c.quadraticCurveTo(0, -r * 0.42, r * 0.44, -r * 0.32);
        c.quadraticCurveTo(r * 0.42, 0, r * 0.36, r * 0.3); c.quadraticCurveTo(0, r * 0.36, -r * 0.36, r * 0.3);
        c.quadraticCurveTo(-r * 0.42, 0, -r * 0.44, -r * 0.32); c.closePath(); fillInk(bb, 2.4);
        c.beginPath();
        c.moveTo(-r * 0.32, -r * 0.08); c.quadraticCurveTo(-r * 0.16, r * 0.02, 0, -r * 0.1); c.quadraticCurveTo(r * 0.16, r * 0.02, r * 0.32, -r * 0.08);
        c.moveTo(0, -r * 0.08); c.lineTo(0, r * 0.26);
        for (const y of [0.04, 0.13, 0.21]) { c.moveTo(-r * 0.15, y * r); c.quadraticCurveTo(-r * 0.07, (y + 0.025) * r, 0, y * r); c.quadraticCurveTo(r * 0.07, (y + 0.025) * r, r * 0.15, y * r); }
        c.strokeStyle = "rgba(60,10,4,0.6)"; c.lineWidth = Math.max(0.7, r * 0.022); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.28, -r * 0.24); c.lineTo(-r * 0.08, -r * 0.12); c.moveTo(r * 0.06, r * 0.0); c.lineTo(r * 0.28, r * 0.16); c.moveTo(r * 0.18, -r * 0.26); c.lineTo(r * 0.3, -r * 0.18);
        c.strokeStyle = "rgba(255,220,190,0.6)"; c.lineWidth = Math.max(0.6, r * 0.014); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.2, -r * 0.37); c.quadraticCurveTo(0, -r * 0.3, r * 0.2, -r * 0.37);
        c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.8, r * 0.028); c.stroke();
        h.rr(-r * 0.38, r * 0.24, r * 0.76, r * 0.07, r * 0.02); fillInk(h.metal(0, r * 0.24, 0, r * 0.31, ...OL_BRONZE), 1.2);
        // twin xiphos raised in a V
        for (const sx of [-1, 1]) {
          const gx = sx * r * 0.72, gy = -r * 0.36;
          olXiphos(c, h, pal, ts, gx, gy, sx * 0.42, r * 0.66);
          heroLimb(c, h, sx * r * 0.4, -r * 0.26, sx * r * 0.7, -r * 0.08, gx, gy, Math.max(4, r * 0.16), skin);
          c.beginPath(); c.ellipse(sx * r * 0.44, -r * 0.27, r * 0.14, r * 0.1, sx * 0.3, 0, TAU); fillInk(h.metal(sx * r * 0.3, -r * 0.37, sx * r * 0.58, -r * 0.17, ...OL_BRONZE), 1.4);
          olHand(c, h, gx, gy, r * 0.075, OL_TAN);
        }
        // head: crested closed Corinthian war helmet, ember eyes, sweeping scarlet horsehair crest
        const HX = 0, HY = -r * 0.6, HS = r * 0.2;
        const crestPath = (k) => {
          c.beginPath(); c.moveTo(-r * 0.17, HY - HS * 0.7);
          for (let i = 0; i <= 12; i++) {
            const t = i / 12, a = Math.PI * (1.12 + 0.76 * t), fl = ts ? Math.sin(ts / 75 + i * 1.9) * r * 0.035 : 0;
            const R = (i % 2 ? r * 0.29 : r * (0.46 - 0.1 * Math.abs(t - 0.5)) + fl) * k;
            c.lineTo(HX + Math.cos(a) * R * 0.95, -r * 0.68 + Math.sin(a) * R);
          }
          c.lineTo(r * 0.17, HY - HS * 0.7); c.closePath();
        };
        crestPath(1); fillInk(nbCloth(c, 0, -r * 1.14, 0, -r * 0.72, [OL_SCARLET[0], OL_SCARLET[1], OL_SCARLET[2]]), 1.4);
        crestPath(0.72); c.fillStyle = rgba(pal.bright, 0.55); c.fill();
        c.save(); c.globalCompositeOperation = "lighter"; crestPath(0.5); c.fillStyle = rgba("#ffb03a", 0.45 + 0.3 * q); c.fill(); c.restore();
        c.beginPath(); c.moveTo(HX - HS * 0.95, HY + HS * 0.95); c.lineTo(HX - HS * 1.0, HY - HS * 0.4);
        c.bezierCurveTo(HX - HS * 1.05, HY - HS * 1.5, HX + HS * 1.05, HY - HS * 1.5, HX + HS * 1.0, HY - HS * 0.4);
        c.lineTo(HX + HS * 0.95, HY + HS * 0.95); c.quadraticCurveTo(HX + HS * 0.5, HY + HS * 1.15, HX + HS * 0.22, HY + HS * 0.95);
        c.lineTo(HX + HS * 0.18, HY + HS * 0.1); c.lineTo(HX - HS * 0.18, HY + HS * 0.1); c.lineTo(HX - HS * 0.22, HY + HS * 0.95);
        c.quadraticCurveTo(HX - HS * 0.5, HY + HS * 1.15, HX - HS * 0.95, HY + HS * 0.95); c.closePath();
        fillInk(h.metal(HX - HS, HY - HS, HX + HS, HY + HS, ...OL_BLOODBRONZE), 1.8);
        c.beginPath(); c.moveTo(HX - HS * 0.8, HY - HS * 0.1); c.lineTo(HX - HS * 0.12, HY - HS * 0.05); c.lineTo(HX - HS * 0.1, HY + HS * 0.95); c.lineTo(HX + HS * 0.1, HY + HS * 0.95);
        c.lineTo(HX + HS * 0.12, HY - HS * 0.05); c.lineTo(HX + HS * 0.8, HY - HS * 0.1); c.lineTo(HX + HS * 0.8, HY + HS * 0.12); c.lineTo(HX - HS * 0.8, HY + HS * 0.12); c.closePath();
        c.fillStyle = "#120604"; c.fill();
        for (const sx of [-1, 1]) {
          const ex = HX + sx * HS * 0.45, ey = HY + HS * 0.01;
          wkGlow(c, ex, ey, HS * 0.42, OL_EMBER, 0.6 + 0.4 * q);
          olAlmond(c, ex, ey, HS * 0.2, HS * 0.06); c.fillStyle = "#ffd06a"; c.fill();
        }
        c.beginPath(); c.moveTo(HX - HS * 0.95, HY - HS * 0.42); c.quadraticCurveTo(HX, HY - HS * 0.62, HX + HS * 0.95, HY - HS * 0.42);
        c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.8, HS * 0.1); c.stroke();
        c.beginPath(); c.moveTo(HX - HS * 0.5, HY - HS * 0.9); c.lineTo(HX - HS * 0.2, HY - HS * 0.6); c.moveTo(HX + HS * 0.6, HY + HS * 0.5); c.lineTo(HX + HS * 0.8, HY + HS * 0.8);
        c.strokeStyle = "rgba(255,220,190,0.55)"; c.lineWidth = Math.max(0.5, HS * 0.05); c.stroke();
        // rising embers
        for (let i = 0; i < 8; i++) {
          const t = ts ? (ts / 1300 + i / 8) % 1 : (i + 0.5) / 8, x = r * ((heroHash(i * 4.1) - 0.5) * 1.6 + Math.sin(i + t * 6) * 0.05), y = r * (0.9 - 1.9 * t);
          wkSparkle(c, x, y, r * 0.03 * (1 - t * 0.5), i % 3 === 0 ? pal.bright : "#ffb03a", t * 5, 0.9 * (1 - t));
        }
      },
    },
  };

  /* ============================================================
   * THEME: PHARAONIC PANTHEON — original vector art depicting twelve Egyptian deities in eight roles:
   * Amun-Ra, Isis, Osiris and Ptah, Thoth, Horus, Anubis and Geb, Sekhmet and Hathor, and Seth. Solar
   * barques, winged crowns, the Djed pillar, hieroglyphs, fertile Nile earth and desert storms carry side identity.
   * ============================================================ */
  // Bare inked torso from shoulders (top, half-width sw) to waist (bot, half-width ww) with muscle hints.
  function egTorso(c, h, x, top, bot, sw, ww, cols) {
    const H = bot - top;
    c.beginPath(); c.moveTo(x - sw, top + H * 0.14);
    c.quadraticCurveTo(x - sw, top, x - sw * 0.6, top); c.lineTo(x + sw * 0.6, top);
    c.quadraticCurveTo(x + sw, top, x + sw, top + H * 0.14);
    c.quadraticCurveTo(x + sw * 0.92, top + H * 0.55, x + ww, bot); c.lineTo(x - ww, bot);
    c.quadraticCurveTo(x - sw * 0.92, top + H * 0.55, x - sw, top + H * 0.14); c.closePath();
    h.fillInk(nbCloth(c, x - sw, top, x + sw, bot, cols), 1.8);
    c.beginPath();
    c.moveTo(x - sw * 0.6, top + H * 0.42); c.quadraticCurveTo(x - sw * 0.28, top + H * 0.54, x - sw * 0.04, top + H * 0.42);
    c.moveTo(x + sw * 0.6, top + H * 0.42); c.quadraticCurveTo(x + sw * 0.28, top + H * 0.54, x + sw * 0.04, top + H * 0.42);
    c.moveTo(x, top + H * 0.56); c.lineTo(x, top + H * 0.9);
    c.strokeStyle = rgba(cols[2], 0.5); c.lineWidth = Math.max(0.6, sw * 0.04); c.stroke();
  }

  // Compact, tile-safe redraws for the Egyptian and yokai rosters. Coordinates in this kit are in
  // figure-radius units; decorative marks deliberately stay inside the 1.2r canvas envelope.
  function rosterKit(c, pal, r, h) {
    const ink = h.INK || INK, sw = Math.max(1.1, r * 0.032);
    function path(draw, fill, stroke = ink, width = sw) {
      c.beginPath();
      draw({
        M: (x, y) => c.moveTo(x * r, y * r),
        L: (x, y) => c.lineTo(x * r, y * r),
        Q: (cx, cy, x, y) => c.quadraticCurveTo(cx * r, cy * r, x * r, y * r),
        C: (x1, y1, x2, y2, x, y) => c.bezierCurveTo(x1 * r, y1 * r, x2 * r, y2 * r, x * r, y * r),
        Z: () => c.closePath(),
      });
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
    }
    function poly(points, fill, stroke = ink, width = sw) {
      path((p) => { points.forEach(([x, y], i) => i ? p.L(x, y) : p.M(x, y)); p.Z(); }, fill, stroke, width);
    }
    function line(points, color = ink, width = sw) {
      path((p) => points.forEach(([x, y], i) => i ? p.L(x, y) : p.M(x, y)), null, color, width);
    }
    function ellipse(x, y, rx, ry, fill, stroke = ink, width = sw) {
      c.beginPath(); c.ellipse(x * r, y * r, rx * r, ry * r, 0, 0, TAU);
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
    }
    function ring(x, y, radius, color = pal.gold, width = sw) { ellipse(x, y, radius, radius, null, color, width); }
    function disc(x, y, radius, color = pal.gold) {
      ellipse(x, y, radius, radius, color);
      ellipse(x - radius * 0.2, y - radius * 0.24, radius * 0.2, radius * 0.2, "#fff5c5", null);
    }
    function sun(x, y, radius, color = pal.gold) {
      for (let i = 0; i < 12; i++) {
        const a = i * TAU / 12, ca = Math.cos(a), sa = Math.sin(a);
        line([[x + ca * radius * 1.18, y + sa * radius * 1.18], [x + ca * radius * 1.52, y + sa * radius * 1.52]], color, Math.max(1, r * 0.018));
      }
      disc(x, y, radius, color);
    }
    function ankh(x, y, s, color = pal.gold) {
      ring(x, y - s * 0.48, s * 0.3, color, Math.max(1, r * 0.04));
      line([[x, y - s * 0.2], [x, y + s * 0.52]], color, Math.max(1.2, r * 0.05));
      line([[x - s * 0.4, y + s * 0.05], [x + s * 0.4, y + s * 0.05]], color, Math.max(1.2, r * 0.05));
      ellipse(x, y - s * 0.48, s * 0.08, s * 0.08, "#fff6c8", null);
    }
    function wasScepter(x, yTop, yBottom, color = pal.gold) {
      line([[x, yBottom], [x, yTop + 0.13]], color, Math.max(1.5, r * 0.055));
      poly([[x - 0.055, yTop + 0.15], [x - 0.075, yTop + 0.04], [x - 0.02, yTop], [x + 0.03, yTop + 0.04], [x + 0.08, yTop + 0.01], [x + 0.11, yTop + 0.07], [x + 0.04, yTop + 0.15]], color);
      ellipse(x, yBottom, 0.045, 0.045, color, null);
    }
    function eye(x, y, color = pal.bright) {
      ellipse(x, y, 0.085, 0.045, "#fff3cb", ink, Math.max(0.8, r * 0.02));
      ellipse(x, y, 0.024, 0.04, color, null);
    }
    function glyph(x, y, color = pal.gold, s = 0.06) {
      poly([[x - s * 0.55, y - s], [x + s * 0.45, y - s], [x + s * 0.55, y - s * 0.55], [x - s * 0.25, y - s * 0.55]], color, null);
      line([[x, y - s * 0.48], [x, y + s], [x - s * 0.42, y + s * 0.58], [x + s * 0.42, y + s * 0.58]], color, Math.max(0.8, r * 0.018));
    }
    return { path, poly, line, ellipse, ring, disc, sun, ankh, wasScepter, eye, glyph, ink, sw };
  }

  SG.THEMES.pharaonic = {
    id: "pharaonic",
    name: { en: "Pharaonic Pantheon", fr: "Panthéon Pharaonique", zh: "法老诸神", ar: "مجمع الآلهة الفرعونية" },
    description: {
      en: "Twelve iconic deities appear across eight roles: Ra and Amun are syncretized as Amun-Ra; Osiris and Ptah stand united on a stepped plinth; Sekhmet and Hathor share a solar crown; and Anubis stands above Geb's earth mound, alongside Isis, Thoth, Horus, and Seth.",
      fr: "Douze divinités emblématiques prennent place en huit rôles : Rê et Amon sont réunis en Amon-Rê ; Osiris et Ptah se tiennent ensemble sur un socle à degrés ; Sekhmet et Hathor partagent une couronne solaire ; Anubis se tient au-dessus du tertre terrestre de Geb, aux côtés d'Isis, Thot, Horus et Seth.",
      zh: "十二位标志性神祇化身八种棋位：拉与阿蒙融合为阿蒙·拉；奥西里斯与卜塔并立于阶梯石座；塞赫麦特与哈索尔共戴太阳冠；阿努比斯立于盖布的大地丘之上，另有伊西斯、托特、荷鲁斯与塞特。",
      ar: "تضمّ الأدوار الثمانية اثني عشر إلهاً بارزاً: اندمج رع وآمون في آمون-رع؛ واتحد أوزيريس وبتاح على قاعدة مدرّجة؛ وتشترك سخمت وحتحور في تاج شمسي؛ ويقف أنوبيس فوق تلّ جب الترابي، إلى جانب إيزيس وتحوت وحورس وست.",
    },
    painters: {
      sovereign(c, pal, r, ts, h) {
        const k = rosterKit(c, pal, r, h), gold = "#e7b94e", skin = "#b98336";
        // Solar barque and lotus bow; Amun-Ra stands on deck.
        k.poly([[-0.96, 0.78], [-0.78, 0.91], [0.72, 0.91], [0.96, 0.78], [0.72, 1.04], [-0.68, 1.04]], gold);
        k.line([[-0.8, 0.94], [0.72, 0.94]], pal.bright, Math.max(1, r * 0.025));
        k.path((p) => { p.M(-0.78, 0.81); p.Q(-0.98, 0.55, -0.83, 0.43); p.Q(-0.65, 0.58, -0.78, 0.81); p.Z(); }, "#58bda8");
        k.ellipse(-0.82, 0.48, 0.045, 0.08, pal.bright, null);
        k.ellipse(0, 0.31, 0.37, 0.46, skin);
        k.poly([[-0.3, 0.45], [-0.25, 0.73], [-0.16, 0.85], [0.2, 0.85], [0.28, 0.47]], "#b8872f");
        k.line([[-0.12, 0.5], [-0.12, 0.82], [-0.2, 0.88], [0, 0.82], [0.12, 0.88], [0.12, 0.5]], pal.bright, Math.max(1, r * 0.022));
        k.wasScepter(-0.58, -0.45, 0.78, gold);
        k.ankh(0.53, 0.27, 0.45, "#fff0a1");
        // Falcon head with curved beak and Wedjat marking.
        k.ellipse(0, -0.35, 0.27, 0.25, "#252532");
        k.poly([[0.18, -0.38], [0.47, -0.3], [0.2, -0.23]], gold);
        k.eye(0.11, -0.39, "#e9a73f");
        k.line([[-0.18, -0.2], [0, -0.12], [0.16, -0.2]], "#53d5d0", Math.max(1, r * 0.028));
        // Double-banded Amun plumes, solar disc and rearing uraeus.
        k.poly([[-0.22, -0.52], [-0.28, -0.95], [-0.17, -1.12], [-0.08, -0.56]], gold);
        k.poly([[0.04, -0.55], [0.12, -1.12], [0.25, -0.96], [0.21, -0.5]], gold);
        [-1.02, -0.94, -0.86].forEach((y) => k.line([[-0.23, y], [-0.13, y]], pal.bright, Math.max(1, r * 0.022)));
        [ -1.0, -0.92, -0.84 ].forEach((y) => k.line([[0.12, y], [0.23, y]], pal.bright, Math.max(1, r * 0.022)));
        k.sun(0, -0.77, 0.14, gold);
        k.path((p) => { p.M(-0.04, -0.52); p.Q(-0.13, -0.66, 0, -0.68); p.Q(0.16, -0.69, 0.1, -0.55); p.Q(0.08, -0.46, 0.02, -0.49); }, "#e5b542");
        k.ellipse(0.035, -0.54, 0.035, 0.045, "#e64832");
      },
      reaper(c, pal, r, ts, h) {
        const k = rosterKit(c, pal, r, h), gold = "#e8bf62";
        // Wide Isis wings remain inside the board silhouette.
        k.path((p) => { p.M(-0.14, -0.12); p.C(-0.55, -0.56, -0.83, -0.71, -1.08, -0.44); p.Q(-1.0, 0.02, -0.55, 0.43); p.L(-0.22, 0.22); p.Z(); }, "#b99b4f");
        k.path((p) => { p.M(0.14, -0.12); p.C(0.55, -0.56, 0.83, -0.71, 1.08, -0.44); p.Q(1.0, 0.02, 0.55, 0.43); p.L(0.22, 0.22); p.Z(); }, "#26a99d");
        for (let i = 0; i < 5; i++) {
          const y = -0.38 + i * 0.14;
          k.line([[-0.2, y], [-0.52 - i * 0.09, y - 0.18], [-0.82 - i * 0.045, y - 0.12]], i % 2 ? "#40c1af" : gold, Math.max(1, r * 0.025));
          k.line([[0.2, y], [0.52 + i * 0.09, y - 0.18], [0.82 + i * 0.045, y - 0.12]], i % 2 ? gold : "#40c1af", Math.max(1, r * 0.025));
        }
        k.poly([[-0.25, -0.08], [-0.3, 0.68], [0, 0.82], [0.3, 0.68], [0.25, -0.08]], "#f1e3c2");
        for (let x = -0.17; x <= 0.18; x += 0.11) k.line([[x, 0.24], [x, 0.68]], "#d0b87c", Math.max(0.7, r * 0.015));
        k.ellipse(0, -0.31, 0.2, 0.24, "#d5a77a");
        k.path((p) => { p.M(-0.33, -0.43); p.Q(-0.24, -0.7, 0, -0.56); p.Q(0.24, -0.7, 0.33, -0.43); }, null, gold, Math.max(1.2, r * 0.05));
        k.sun(0, -0.83, 0.13, gold);
        // Isis throne glyph sits above the disc between the cow horns.
        k.poly([[-0.095, -1.02], [0.095, -1.02], [0.095, -0.98], [0.045, -0.98], [0.045, -0.91], [-0.045, -0.91], [-0.045, -0.98], [-0.095, -0.98]], "#f6e9c5");
        k.ring(-0.36, 0.24, 0.11, "#ed4c76", Math.max(1.2, r * 0.05));
        k.line([[-0.44, 0.19], [-0.36, 0.32], [-0.28, 0.19]], "#ed4c76", Math.max(1.3, r * 0.045));
        k.ankh(0.36, 0.29, 0.37, "#fff1a4");
      },
      juggernaut(c, pal, r, ts, h) {
        const k = rosterKit(c, pal, r, h), stone = "#c9bda4", gold = "#d9b34e";
        // Ptah's Djed pillar and stepped limestone plinth behind Osiris.
        k.poly([[0.48, -0.62], [0.79, -0.62], [0.79, 0.75], [0.48, 0.75]], stone);
        for (let i = 0; i < 4; i++) k.line([[0.5, -0.54 + i * 0.12], [0.77, -0.54 + i * 0.12]], "#867960", Math.max(1, r * 0.024));
        k.poly([[-0.82, 0.79], [0.82, 0.79], [0.82, 0.9], [0.98, 0.9], [0.98, 1.04], [-0.98, 1.04], [-0.98, 0.9], [-0.82, 0.9]], "#d8cdb6");
        // Mummiform green king with Atef crown.
        k.poly([[-0.28, -0.1], [-0.3, 0.66], [-0.2, 0.81], [0.22, 0.81], [0.3, 0.66], [0.25, -0.1]], "#338d69");
        k.ellipse(0, -0.37, 0.23, 0.25, "#338d69");
        k.poly([[-0.18, -0.56], [-0.12, -0.91], [0, -1.02], [0.12, -0.91], [0.18, -0.56]], "#e1bd55");
        for (const x of [-0.26, 0.26]) k.path((p) => { p.M(x, -0.55); p.C(x * 1.35, -0.82, x * 1.25, -1.02, x * 0.9, -1.08); }, null, "#f6f0dc", Math.max(1.5, r * 0.065));
        k.eye(-0.09, -0.38, "#ffd95c"); k.eye(0.09, -0.38, "#ffd95c");
        // Crossed crook and flail.
        k.line([[-0.48, -0.18], [-0.1, 0.49], [0.04, 0.63]], gold, Math.max(1.8, r * 0.065));
        k.path((p) => { p.M(-0.48, -0.18); p.Q(-0.72, -0.31, -0.63, -0.05); p.Q(-0.56, 0.08, -0.47, 0.02); }, null, gold, Math.max(1.8, r * 0.065));
        k.line([[0.48, -0.18], [0.1, 0.49]], "#c99d44", Math.max(1.8, r * 0.065));
        for (let i = 0; i < 3; i++) k.ellipse(0.48 - i * 0.08, -0.18 + i * 0.08, 0.035, 0.035, pal.bright, null);
      },
      trickster(c, pal, r, ts, h) {
        const k = rosterKit(c, pal, r, h), silver = "#dbe4ef", dark = "#282630";
        // Orbit of sacred glyphs around the lunar scribe.
        k.ring(0, -0.16, 0.77, "rgba(201,219,239,0.8)", Math.max(1, r * 0.022));
        for (let i = 0; i < 8; i++) {
          const a = i * TAU / 8, x = Math.cos(a) * 0.77, y = -0.16 + Math.sin(a) * 0.77;
          k.glyph(x, y, i % 2 ? pal.bright : "#e4c36e", 0.035);
        }
        // Curved crescent cradling the full moon.
        k.path((p) => { p.M(0.1, -1.01); p.C(0.39, -0.98, 0.42, -0.64, 0.16, -0.59); p.C(0.31, -0.76, 0.28, -0.91, 0.1, -1.01); p.Z(); }, silver);
        k.disc(0.17, -0.81, 0.105, "#e7ecf4");
        // Ibis head and fine down-curved beak.
        k.ellipse(-0.1, -0.43, 0.2, 0.22, dark);
        k.path((p) => { p.M(0.02, -0.37); p.C(0.23, -0.35, 0.42, -0.4, 0.37, -0.23); p.Q(0.31, -0.18, 0.25, -0.28); }, "#272833");
        k.eye(-0.02, -0.45, "#d9e8ff");
        k.poly([[-0.31, -0.29], [-0.29, 0.62], [-0.12, 0.82], [0.26, 0.82], [0.32, 0.58], [0.2, -0.29]], "#ebe5d8");
        k.line([[-0.2, -0.17], [0.17, 0.23]], pal.gold, Math.max(1.5, r * 0.05));
        // Papyrus, reed stylus and luminous written marks.
        k.poly([[-0.55, 0.35], [-0.05, 0.35], [-0.05, 0.72], [-0.55, 0.72]], "#e8d7ad");
        for (let i = 0; i < 3; i++) k.glyph(-0.46 + i * 0.14, 0.49, i % 2 ? "#36b6ae" : "#c9953f", 0.045);
        k.line([[0.5, 0.35], [0.29, -0.04], [0.22, -0.14]], "#d8c58a", Math.max(1.4, r * 0.04));
        k.ellipse(0.22, -0.14, 0.025, 0.025, "#fff4ad", null);
      },
      wildrider(c, pal, r, ts, h) {
        const k = rosterKit(c, pal, r, h), gold = "#d9b04d", skin = "#b98336", plumage = "#242631";
        const limb = Math.max(2.2, r * 0.085);
        // Horus's body stands in the chariot: drawn first so the chariot front only hides his waist,
        // while the neck, usekh collar and broad shoulders tie the falcon head to the torso.
        k.path((p) => { p.M(-0.38, 0.1); p.Q(-0.36, 0.0, -0.14, -0.01); p.L(0.14, -0.01); p.Q(0.36, 0.0, 0.38, 0.1); p.L(0.27, 0.3); p.L(0.23, 0.54); p.L(-0.23, 0.54); p.L(-0.27, 0.3); p.Z(); }, skin);
        // Feathered falcon corselet in the side colour, hung from gold shoulder straps.
        k.poly([[-0.27, 0.2], [0.27, 0.2], [0.23, 0.54], [-0.23, 0.54]], pal.mid);
        for (const y of [0.29, 0.38]) for (let i = 0; i < 4; i++) {
          const x = -0.18 + i * 0.12;
          k.path((p) => { p.M(x - 0.06, y); p.Q(x, y + 0.08, x + 0.06, y); }, null, pal.bright, Math.max(0.8, r * 0.02));
        }
        k.line([[-0.22, 0.04], [-0.13, 0.2]], gold, Math.max(1, r * 0.03));
        k.line([[0.22, 0.04], [0.13, 0.2]], gold, Math.max(1, r * 0.03));
        // Feathered falcon neck rising from the shoulders into the head.
        k.poly([[-0.12, -0.1], [-0.15, 0.06], [0.15, 0.06], [0.12, -0.1]], plumage);
        // Broad usekh collar over the neck join.
        k.path((p) => { p.M(-0.31, 0.05); p.Q(0, 0.34, 0.31, 0.05); p.L(0.17, -0.01); p.Q(0, 0.13, -0.17, -0.01); p.Z(); }, gold);
        k.path((p) => { p.M(-0.24, 0.07); p.Q(0, 0.25, 0.24, 0.07); }, null, pal.bright, Math.max(1, r * 0.03));
        // Horus falcon warrior and Wedjat eye.
        k.ellipse(0, -0.24, 0.24, 0.22, plumage);
        k.poly([[0.14, -0.27], [0.42, -0.2], [0.15, -0.13]], gold);
        k.eye(0.07, -0.3, pal.bright);
        k.path((p) => { p.M(-0.2, -0.15); p.Q(-0.05, -0.04, 0.12, -0.15); p.Q(0.0, 0.02, -0.1, 0.05); }, null, "#f1d46f", Math.max(1, r * 0.03));
        // Pschent double crown and golden spiral.
        k.poly([[-0.22, -0.4], [-0.19, -0.79], [0, -0.88], [0.19, -0.79], [0.22, -0.4]], "#d94737");
        k.poly([[-0.17, -0.76], [-0.15, -1.03], [0, -1.09], [0.15, -1.03], [0.17, -0.76]], "#f0d169");
        k.path((p) => { p.M(0.02, -0.73); p.C(0.25, -0.83, 0.22, -0.61, 0.08, -0.65); p.C(-0.01, -0.68, 0.11, -0.78, 0.15, -0.7); }, null, gold, Math.max(1, r * 0.035));
        // Gold-plated war chariot with wheel spokes; its front rail sits at the waist.
        k.poly([[-0.81, 0.42], [0.65, 0.42], [0.83, 0.7], [0.69, 0.9], [-0.69, 0.9], [-0.85, 0.69]], gold);
        k.line([[-0.78, 0.5], [0.66, 0.5]], pal.bright, Math.max(1, r * 0.028));
        k.ring(-0.53, 0.82, 0.13, "#473d2d", Math.max(1.5, r * 0.045));
        k.ring(0.53, 0.82, 0.13, "#473d2d", Math.max(1.5, r * 0.045));
        for (const x of [-0.53, 0.53]) for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 4; k.line([[x, 0.82], [x + Math.cos(a) * 0.11, 0.82 + Math.sin(a) * 0.11]], gold, Math.max(0.8, r * 0.02));
        }
        // Arms from the shoulders: left hand grips the chariot rail, right hand raises the khopesh.
        const arm = (pts) => { k.line(pts, k.ink, limb + Math.max(1, r * 0.04)); k.line(pts, skin, limb); };
        arm([[-0.33, 0.1], [-0.47, 0.27], [-0.42, 0.42]]);
        arm([[0.33, 0.1], [0.5, 0.2], [0.55, 0.02]]);
        k.line([[-0.44, 0.24], [-0.49, 0.3]], gold, Math.max(1, r * 0.035));
        k.line([[0.47, 0.17], [0.53, 0.23]], gold, Math.max(1, r * 0.035));
        k.ellipse(-0.42, 0.42, 0.055, 0.05, skin);
        // Raised khopesh.
        k.line([[0.52, 0.07], [0.62, -0.1]], gold, Math.max(2, r * 0.07));
        k.ellipse(0.55, 0.02, 0.055, 0.055, skin);
        k.path((p) => { p.M(0.61, -0.09); p.Q(0.87, -0.29, 0.76, -0.5); p.Q(0.72, -0.33, 0.56, -0.24); }, null, "#e9d49a", Math.max(1.5, r * 0.05));
      },
      skirmisher(c, pal, r, ts, h) {
        const k = rosterKit(c, pal, r, h), gold = "#d6ac54";
        // Geb's fertile mound, reeds, goose emblem and distant pyramid.
        k.poly([[-0.9, 0.78], [-0.65, 0.6], [-0.25, 0.68], [0.18, 0.55], [0.65, 0.67], [0.9, 0.8], [0.78, 0.96], [-0.82, 0.96]], "#537e42");
        k.poly([[0.48, 0.57], [0.78, 0.18], [1.08, 0.57]], "#d0c3a5");
        k.line([[0.61, 0.42], [0.75, 0.25], [0.91, 0.42]], "#ae9f80", Math.max(1, r * 0.02));
        for (let i = 0; i < 4; i++) {
          const x = -0.7 + i * 0.18;
          k.path((p) => { p.M(x, 0.72); p.Q(x - 0.05, 0.48, x, 0.32); p.Q(x + 0.1, 0.48, x, 0.72); }, i % 2 ? "#46a46b" : "#7cba63");
        }
        k.ellipse(-0.07, 0.71, 0.1, 0.055, "#efe0ad");
        k.path((p) => { p.M(-0.16, 0.7); p.Q(-0.3, 0.57, -0.2, 0.56); p.Q(-0.07, 0.56, -0.03, 0.65); p.L(0.02, 0.62); }, null, "#e8d9ad", Math.max(1, r * 0.024));
        // Anubis, sleek black jackal with gold-tipped ears.
        k.poly([[-0.2, -0.08], [-0.27, 0.57], [0.22, 0.57], [0.18, -0.08]], "#24232b");
        k.ellipse(-0.02, -0.39, 0.2, 0.22, "#111117");
        k.poly([[-0.18, -0.49], [-0.22, -0.99], [-0.04, -0.59]], "#16151c");
        k.poly([[0.04, -0.59], [0.21, -0.99], [0.18, -0.47]], "#17161d");
        k.poly([[-0.21, -0.99], [-0.16, -0.79], [-0.13, -0.85]], gold, null);
        k.poly([[0.21, -0.99], [0.16, -0.79], [0.12, -0.85]], gold, null);
        k.poly([[0.05, -0.39], [0.42, -0.33], [0.08, -0.24]], "#15151b");
        k.eye(0.02, -0.43, "#f2c553");
        k.line([[-0.19, -0.11], [0.18, -0.11]], gold, Math.max(1.5, r * 0.05));
        k.wasScepter(0.62, -0.62, 0.65, gold);
        k.ankh(0.37, 0.21, 0.32, "#f5d777");
      },
      harrower(c, pal, r, ts, h) {
        const k = rosterKit(c, pal, r, h), gold = "#e9b94f";
        // Lioness mane, face and Hathor's horned solar crown.
        k.ellipse(-0.02, -0.42, 0.36, 0.36, "#b37a2c");
        k.ellipse(-0.02, -0.39, 0.23, 0.23, "#d9a84f");
        k.ellipse(0.01, -0.31, 0.14, 0.09, "#f1d28b");
        k.poly([[-0.06, -0.32], [0.1, -0.32], [0.02, -0.23]], "#41251a");
        k.eye(-0.11, -0.43, "#ffef88"); k.eye(0.09, -0.43, "#ffef88");
        for (const side of [-1, 1]) k.path((p) => { p.M(side * 0.12, -0.61); p.Q(side * 0.22, -0.96, side * 0.42, -0.83); p.Q(side * 0.31, -0.7, side * 0.17, -0.57); }, null, gold, Math.max(1.7, r * 0.06));
        k.sun(0, -0.85, 0.13, gold);
        k.path((p) => { p.M(-0.035, -0.68); p.Q(-0.11, -0.77, 0, -0.78); p.Q(0.11, -0.78, 0.06, -0.67); }, "#cf4438");
        // Menat collar and red linen dress.
        k.poly([[-0.26, -0.1], [-0.32, 0.65], [0.32, 0.65], [0.26, -0.1]], "#a74538");
        k.line([[-0.22, 0.12], [0.22, 0.12]], "#42b8ac", Math.max(2, r * 0.06));
        for (let i = 0; i < 5; i++) k.ellipse(-0.2 + i * 0.1, 0.13, 0.024, 0.035, gold, null);
        // Recurve bow, flaming arrow.
        k.path((p) => { p.M(0.7, 0.48); p.Q(1.03, 0.08, 0.72, -0.36); }, null, gold, Math.max(1.8, r * 0.06));
        k.line([[0.7, 0.48], [0.72, -0.36]], "#fff1cc", Math.max(1, r * 0.022));
        k.line([[0.26, -0.02], [0.88, -0.02]], "#e7bc58", Math.max(1.5, r * 0.045));
        k.poly([[0.88, -0.02], [0.75, -0.08], [0.75, 0.04]], "#ff762f");
        k.ellipse(0.9, -0.02, 0.08, 0.055, "rgba(255,105,32,0.65)", null);
      },
      fury(c, pal, r, ts, h) {
        const k = rosterKit(c, pal, r, h), red = "#a84d3e";
        // Sandstorm ring and crackling lightning around Seth.
        k.ellipse(0, 0.03, 1.0, 0.92, null, "rgba(210,169,94,0.72)", Math.max(1, r * 0.025));
        k.ellipse(0, 0.03, 0.82, 0.73, null, "rgba(224,189,116,0.5)", Math.max(1, r * 0.02));
        k.poly([[-0.21, -0.08], [-0.27, 0.65], [0.22, 0.65], [0.19, -0.08]], red);
        k.ellipse(-0.02, -0.42, 0.21, 0.2, "#9f493d");
        // Sha-beast elongated muzzle, squared ears.
        k.poly([[-0.18, -0.52], [-0.25, -1.07], [-0.06, -0.61]], "#742f2b");
        k.poly([[0.05, -0.58], [0.3, -1.06], [0.2, -0.46]], "#742f2b");
        k.path((p) => { p.M(0.1, -0.44); p.C(0.37, -0.45, 0.46, -0.33, 0.43, -0.22); p.Q(0.26, -0.26, 0.11, -0.3); p.Z(); }, "#923f35");
        k.eye(-0.08, -0.45, "#ffcb52");
        k.wasScepter(-0.63, -0.58, 0.58, "#d6aa4a");
        // Forked tail, angular bolt and desert spiral.
        k.path((p) => { p.M(0.2, 0.48); p.C(0.63, 0.67, 0.92, 0.62, 0.94, 0.35); p.L(0.86, 0.26); p.M(0.94, 0.35); p.L(1.04, 0.29); }, null, "#742f2b", Math.max(1.7, r * 0.05));
        k.poly([[0.67, -0.55], [0.57, -0.26], [0.7, -0.23], [0.59, 0.05], [0.85, -0.3], [0.72, -0.34], [0.82, -0.55]], "#fff29c", null);
        for (let i = 0; i < 4; i++) {
          const y = -0.13 + i * 0.11;
          k.path((p) => { p.M(-0.8, y); p.Q(-0.55, y - 0.13, -0.28, y); }, null, i % 2 ? "#dfbf7b" : "#b58a51", Math.max(1, r * 0.022));
        }
      },
    },
  };

  /* ============================================================
   * THEME: CELESTIAL REALM — an homage to the bodhisattvas, immortals and demon kings of ancient Chinese myth
   * (Journey to the West, Investiture of the Gods and older legend — public-domain myth, painted as original
   * vector art). Ksitigarbha (Dizang) stands upon a thousand-petal lotus with his nine-ring staff and
   * wish-fulfilling jewel, the Monkey King swings his golden-hooped staff on a somersault cloud, the Bull Demon
   * King stamps the earth with twin crescent axes, three-eyed Erlang Shen levels his three-pointed blade beside
   * his spirit hound, Nezha rides the Wind-Fire Wheels inside the Red Armillary Sash, a Heavenly Halberdier stands
   * guard in mountain-pattern armour, Hou Yi draws a solar arrow before the suns he shot down, and Princess Iron
   * Fan raises a cyclone with her giant plantain fan. Side identity rides on every kasaya panel, lapel, sash,
   * ribbon, tassel, armour trim, cloud underbelly and weapon aura.
   * ============================================================ */
  const CL_SKIN = ["#fff0de", "#f4cba4", "#a8714c"];
  const CL_GOLD = ["#fff6c4", "#f0bf3a", "#80540a"];
  const CL_SAFFRON = ["#fff6e2", "#f2cc8a", "#9a6a2a"];    // monk's under-robe
  const CL_JADE = ["#e2fff0", "#62d6a0", "#13684a"];
  const CL_RED = ["#ff9078", "#d82430", "#5c0610"];
  const CL_IRON = ["#7a7a8a", "#2c2c38", "#09090e"];
  const CL_SILVER = ["#ffffff", "#d4dae6", "#68728a"];
  const CL_HAIR = ["#5a546a", "#1c1a26", "#050408"];
  const CL_FUR = ["#ffd690", "#cf8a34", "#5e3608"];
  const CL_MONKEY = ["#ffe6d2", "#f2ae8c", "#a85a3e"];
  const CL_HIDE = ["#6e5e64", "#30262a", "#0a0608"];
  const CL_MUZZLE = ["#d0b4a6", "#8a6a5e", "#3a2822"];
  const CL_HORN = ["#fff6e0", "#dcc89c", "#6e5a32"];
  const CL_CLOUD = ["#ffffff", "#eaf2ff", "#a2b6da"];
  const CL_LOTUS = ["#fff4f8", "#ff9ec6", "#b4306a"];
  const CL_LEAF = ["#e6ffb8", "#68bc3e", "#1c5a12"];
  const CL_LEATHER = ["#d09a60", "#845028", "#33190a"];
  const CL_PHEASANT = ["#fff4d8", "#d8a860", "#6a4210"];
  const CL_FIRE = "#ff6a1a";
  const CL_FIRE_CORE = "#ffe46a";
  const CL_SUN = "#ffcf3a";
  const CL_WIND = "#c4f6ff";
  const CL_PEARL = "#fffaf0";

  function clCloth(pal) { return pal.cloth || pal.mid; }
  function clSide(c, pal, x0, y0, x1, y1) { return nbCloth(c, x0, y0, x1, y1, [pal.rim, pal.bright, pal.deep]); }
  function clRobeGrad(c, pal, x0, y0, x1, y1) { return nbCloth(c, x0, y0, x1, y1, [pal.rim, clCloth(pal), pal.deep]); }
  // Point on a quadratic curve at t.
  function clQuad(x1, y1, cx, cy, x2, y2, t) {
    const u = 1 - t;
    return [u * u * x1 + 2 * u * t * cx + t * t * x2, u * u * y1 + 2 * u * t * cy + t * t * y2];
  }
  // Inward scroll curl (cloud / ruyi motif) starting at (x + R, y); dir ±1 sets the winding.
  function clCurl(c, x, y, R, dir, color, w, turns = 1.15) {
    if (!(R > 0)) return;
    c.beginPath();
    for (let i = 0; i <= 18; i++) {
      const t = i / 18, a = dir * t * TAU * turns, rad = R * (1 - 0.82 * t);
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.strokeStyle = color; c.lineWidth = w; c.stroke();
  }
  // Auspicious cloud (xiangyun) centred (x, y), scale s: inked lobes, side-tinted underbelly and scroll curls.
  // Spans about x ±0.95s, y −0.66s … +0.62s.
  function clXiangyun(c, h, pal, x, y, s) {
    if (!(s > 0)) return;
    const L = [[-0.56, 0.08, 0.36], [-0.12, -0.16, 0.5], [0.42, -0.02, 0.42], [-0.3, 0.3, 0.3], [0.2, 0.3, 0.32]];
    const path = () => { c.beginPath(); for (const [lx, ly, lr] of L) { c.moveTo(x + (lx + lr) * s, y + ly * s); c.arc(x + lx * s, y + ly * s, lr * s, 0, TAU); } };
    path(); c.strokeStyle = h.INK; c.lineWidth = Math.max(1.6, s * 0.14); c.stroke();
    path(); c.fillStyle = nbCloth(c, x, y - s * 0.66, x, y + s * 0.62, CL_CLOUD); c.fill();
    c.save(); path(); c.clip();
    c.fillStyle = rgba(pal.bright, 0.34); c.fillRect(x - s * 0.95, y + s * 0.22, s * 1.9, s * 0.42);
    c.restore();
    const lw = Math.max(0.7, s * 0.07);
    clCurl(c, x - s * 0.56, y + s * 0.08, s * 0.2, 1, pal.bright, lw);
    clCurl(c, x - s * 0.12, y - s * 0.14, s * 0.28, -1, pal.bright, lw);
    clCurl(c, x + s * 0.42, y, s * 0.22, 1, rgba(pal.deep, 0.8), lw);
  }
  // Floating cloud bank (platform) across x ±w around (x, y); lobes reach about ±1.4·hh vertically.
  function clCloudBank(c, h, pal, ts, x, y, w, hh, seed = 0) {
    if (!(w > 0) || !(hh > 0)) return;
    const n = 6, lobes = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), rad = hh * (0.7 + 0.42 * Math.sin(t * Math.PI)) * (0.88 + 0.2 * heroHash(seed + i));
      lobes.push([x + (t - 0.5) * 2 * (w - rad), y - Math.sin(t * Math.PI) * hh * 0.3 + (ts ? Math.sin(ts / 520 + i * 1.3) * hh * 0.08 : 0), rad]);
    }
    const path = () => { c.beginPath(); for (const [lx, ly, lr] of lobes) { c.moveTo(lx + lr, ly); c.arc(lx, ly, lr, 0, TAU); } };
    path(); c.strokeStyle = h.INK; c.lineWidth = Math.max(1.6, hh * 0.16); c.stroke();
    path(); c.fillStyle = nbCloth(c, x, y - hh * 1.4, x, y + hh * 1.2, CL_CLOUD); c.fill();
    c.save(); path(); c.clip();
    c.fillStyle = nbCloth(c, x, y + hh * 0.1, x, y + hh * 1.3, [rgba(pal.rim, 0.25), rgba(pal.bright, 0.45), rgba(pal.deep, 0.65)]);
    c.fillRect(x - w, y + hh * 0.1, w * 2, hh * 1.25);
    c.restore();
    lobes.forEach(([lx, ly, lr], i) => clCurl(c, lx + lr * 0.45, ly - lr * 0.1, lr * 0.45, i % 2 ? 1 : -1, i % 2 ? pal.bright : rgba(pal.deep, 0.75), Math.max(0.7, hh * 0.08)));
  }
  // Inked ribbon along pts with full width wf(t); cols = gradient triple (first → last point) or a fill style.
  function clRibbon(c, h, pts, wf, cols, inkW = 1.2) {
    if (pts.length < 2) return;
    olStrip(c, pts, wf);
    const a = pts[0], b = pts[pts.length - 1];
    c.fillStyle = Array.isArray(cols) ? nbCloth(c, a[0], a[1], b[0], b[1], cols) : cols; c.fill();
    c.strokeStyle = h.INK; c.lineWidth = inkW; c.stroke();
  }
  // Inked straight pole / shaft.
  function clPole(c, h, x1, y1, x2, y2, w, fill) {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    c.strokeStyle = h.INK; c.lineWidth = w + 2.2; c.stroke();
    c.strokeStyle = fill; c.lineWidth = w; c.stroke();
  }
  // Swaying side-coloured silk tassel hanging from (x, y), length len, base angle ang (0 = straight down).
  function clTassel(c, h, pal, ts, x, y, len, ang = 0, seed = 0) {
    if (!(len > 0)) return;
    const sway = ts ? Math.sin(ts / 260 + seed) * 0.22 : 0.08;
    c.save(); c.translate(x, y); c.rotate(ang + sway);
    c.beginPath(); c.moveTo(-len * 0.1, 0);
    c.quadraticCurveTo(-len * 0.4, len * 0.6, -len * 0.22, len); c.lineTo(len * 0.22, len);
    c.quadraticCurveTo(len * 0.4, len * 0.6, len * 0.1, 0); c.closePath();
    h.fillInk(clSide(c, pal, 0, 0, 0, len), Math.max(0.6, len * 0.06));
    c.beginPath();
    for (let k = -2; k <= 2; k++) { c.moveTo(k * len * 0.03, len * 0.2); c.lineTo(k * len * 0.08, len * 0.94); }
    c.strokeStyle = rgba(pal.deep, 0.55); c.lineWidth = Math.max(0.5, len * 0.03); c.stroke();
    h.rr(-len * 0.14, -len * 0.04, len * 0.28, len * 0.16, len * 0.04); h.fillInk(pal.gold, Math.max(0.5, len * 0.04));
    c.restore();
  }
  // Two-tone additive flame from base (x, y) pointing along ang (0 = up), flickering with ts.
  function clFlame(c, x, y, len, w, ang, ts, seed = 0, outer = CL_FIRE) {
    if (!(len > 0)) return;
    const f = ts ? 0.82 + 0.18 * Math.sin(ts / 70 + seed * 2.3) : 0.9;
    c.save(); c.globalCompositeOperation = "lighter";
    srFlame(c, x, y, len * f, w, ang, rgba(outer, 0.85));
    srFlame(c, x, y, len * f * 0.62, w * 0.55, ang, rgba(CL_FIRE_CORE, 0.95));
    c.restore();
  }
  // Frontal face (centre x, y, radius s): phoenix eyes with upswept corners, sword brows, fine nose and lips.
  // o: skin, glow (eye light colour), iris, serene (lowered contemplative lids), brow, mouth
  // ("calm" | "smile" | "stern" | "none"), lips, shadow (eye-shadow colour), mark (forehead jewel colour), lobes.
  function clFace(c, h, x, y, s, o = {}) {
    if (!(s > 0)) return;
    const skin = o.skin || CL_SKIN, lw = Math.max(0.7, s * 0.08);
    if (o.lobes) {   // long, auspicious earlobes
      for (const sx of [-1, 1]) {
        c.beginPath(); c.ellipse(x + sx * s * 0.74, y + s * 0.12, s * 0.13, s * 0.38, sx * 0.12, 0, TAU);
        h.fillInk(nbCloth(c, x - s, y, x + s, y + s, skin), lw);
      }
    }
    c.beginPath(); c.moveTo(x - s * 0.72, y - s * 0.25);
    c.bezierCurveTo(x - s * 0.74, y - s * 1.0, x + s * 0.74, y - s * 1.0, x + s * 0.72, y - s * 0.25);
    c.bezierCurveTo(x + s * 0.7, y + s * 0.5, x + s * 0.34, y + s * 0.96, x, y + s);
    c.bezierCurveTo(x - s * 0.34, y + s * 0.96, x - s * 0.7, y + s * 0.5, x - s * 0.72, y - s * 0.25);
    c.closePath(); h.fillInk(nbCloth(c, x - s, y - s, x + s, y + s, skin), lw);
    c.fillStyle = "rgba(255,120,120,0.2)";
    for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(x + sx * s * 0.4, y + s * 0.3, s * 0.15, s * 0.09, 0, 0, TAU); c.fill(); }
    const ey = y - s * 0.06, ew = s * 0.17, eh = s * 0.075;
    for (const sx of [-1, 1]) {
      const cx = x + sx * s * 0.3;
      if (o.shadow) { c.beginPath(); c.ellipse(cx + sx * ew * 0.2, ey - eh * 0.6, ew * 1.2, eh * 1.6, -sx * 0.2, 0, TAU); c.fillStyle = rgba(o.shadow, 0.35); c.fill(); }
      if (o.serene) {
        c.beginPath(); c.moveTo(cx - sx * ew, ey - eh * 0.2); c.quadraticCurveTo(cx, ey + eh * 1.3, cx + sx * ew * 1.1, ey - eh * 0.9);
        c.strokeStyle = h.INK; c.lineWidth = lw; c.stroke();
      } else {
        olAlmond(c, cx, ey, ew, eh); c.fillStyle = o.glow || "#fffaf0"; c.fill();
        if (o.glow) wkGlow(c, cx, ey, s * 0.32, o.glow, 0.8);
        else {
          c.save(); olAlmond(c, cx, ey, ew, eh); c.clip();
          c.beginPath(); c.arc(cx, ey, eh * 1.05, 0, TAU); c.fillStyle = o.iris || "#2a1a12"; c.fill();
          c.restore();
        }
        olAlmond(c, cx, ey, ew, eh); c.strokeStyle = h.INK; c.lineWidth = lw; c.stroke();
        c.beginPath(); c.moveTo(cx + sx * ew * 0.8, ey - eh * 0.2); c.lineTo(cx + sx * ew * 1.45, ey - eh * 1.3); c.stroke();
      }
      c.beginPath(); c.moveTo(x + sx * s * 0.1, ey - eh * 2.4); c.quadraticCurveTo(cx, ey - eh * 3.2, cx + sx * ew * 1.35, ey - eh * 4.2);
      c.strokeStyle = o.brow || h.INK; c.lineWidth = Math.max(0.8, s * 0.1); c.stroke();
    }
    c.beginPath(); c.moveTo(x - s * 0.02, ey + eh * 1.5); c.lineTo(x - s * 0.06, y + s * 0.34); c.quadraticCurveTo(x, y + s * 0.4, x + s * 0.07, y + s * 0.35);
    c.strokeStyle = rgba(skin[2], 0.9); c.lineWidth = Math.max(0.5, s * 0.055); c.stroke();
    const my = y + s * 0.6, mouth = o.mouth || "calm";
    if (mouth === "calm") {
      c.beginPath(); c.moveTo(x - s * 0.15, my); c.quadraticCurveTo(x, my - s * 0.06, x + s * 0.15, my);
      c.quadraticCurveTo(x, my + s * 0.1, x - s * 0.15, my); c.fillStyle = o.lips || "#c4505a"; c.fill();
    } else if (mouth !== "none") {
      c.beginPath();
      if (mouth === "smile") { c.moveTo(x - s * 0.2, my - s * 0.03); c.quadraticCurveTo(x, my + s * 0.12, x + s * 0.2, my - s * 0.03); }
      else { c.moveTo(x - s * 0.18, my + s * 0.02); c.quadraticCurveTo(x, my - s * 0.05, x + s * 0.18, my + s * 0.02); }
      c.strokeStyle = o.lips || "#8a3030"; c.lineWidth = Math.max(0.7, s * 0.08); c.stroke();
    }
    if (o.mark) {
      const my2 = y - s * 0.5;
      c.beginPath(); c.moveTo(x, my2 - s * 0.1); c.lineTo(x + s * 0.06, my2); c.lineTo(x, my2 + s * 0.1); c.lineTo(x - s * 0.06, my2); c.closePath();
      c.fillStyle = o.mark; c.fill();
    }
  }
  // Cross-collar (jiaoling) lapels: white inner collar plus side-coloured bands crossing right over left.
  function clLapels(c, h, pal, x, top, depth, nw, w) {
    c.beginPath(); c.moveTo(x - nw, top); c.lineTo(x, top + depth * 0.55); c.lineTo(x + nw, top);
    c.strokeStyle = h.INK; c.lineWidth = w * 0.7 + 2; c.stroke(); c.strokeStyle = "#fbf6ea"; c.lineWidth = w * 0.7; c.stroke();
    const band = (x1, y1, x2, y2) => {
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
      c.strokeStyle = h.INK; c.lineWidth = w + 2.2; c.stroke();
      c.strokeStyle = clSide(c, pal, x1, y1, x2, y2); c.lineWidth = w; c.stroke();
      c.strokeStyle = rgba(pal.gold, 0.9); c.lineWidth = Math.max(0.5, w * 0.18); c.stroke();
    };
    band(x - nw * 1.3, top, x + depth * 0.4, top + depth * 0.62);
    band(x + nw * 1.3, top, x - depth * 0.45, top + depth);
  }
  // Long robe / skirt from shoulders (half-width sw at top) to hem (half-width hw at bot); returns its path fn.
  // o.hem (default true) adds a side-coloured hem band edged in gold.
  function clRobe(c, h, pal, x, top, bot, sw, hw, fill, o = {}) {
    const H = bot - top;
    const path = () => {
      c.beginPath(); c.moveTo(x - sw * 0.55, top);
      c.quadraticCurveTo(x - sw, top, x - sw, top + H * 0.12);
      c.quadraticCurveTo(x - hw * 0.92, top + H * 0.6, x - hw, bot);
      c.quadraticCurveTo(x, bot + H * 0.05, x + hw, bot);
      c.quadraticCurveTo(x + hw * 0.92, top + H * 0.6, x + sw, top + H * 0.12);
      c.quadraticCurveTo(x + sw, top, x + sw * 0.55, top); c.closePath();
    };
    path(); h.fillInk(fill, 2);
    if (o.hem !== false) {
      const hb = H * (o.hemK || 0.1);
      c.save(); path(); c.clip();
      c.fillStyle = clSide(c, pal, x, bot - hb, x, bot + H * 0.03); c.fillRect(x - hw, bot - hb, hw * 2, hb + H * 0.03);
      c.beginPath(); c.moveTo(x - hw, bot - hb); c.lineTo(x + hw, bot - hb);
      c.strokeStyle = pal.gold; c.lineWidth = Math.max(0.6, hb * 0.2); c.stroke();
      c.restore();
    }
    return path;
  }
  // Sleeved arm (shoulder → control → wrist) with a side-coloured cuff and a hand.
  function clArm(c, h, pal, x1, y1, cx, cy, x2, y2, w, sleeve, skin = CL_SKIN, cuff = null) {
    heroLimb(c, h, x1, y1, cx, cy, x2, y2, w, Array.isArray(sleeve) ? nbCloth(c, x1, y1, x2, y2, sleeve) : sleeve);
    const t = 0.84, [px, py] = clQuad(x1, y1, cx, cy, x2, y2, t), u = 1 - t;
    const tx = 2 * u * (cx - x1) + 2 * t * (x2 - cx), ty = 2 * u * (cy - y1) + 2 * t * (y2 - cy), tl = Math.hypot(tx, ty) || 1;
    const nx = -ty / tl * w * 0.6, ny = tx / tl * w * 0.6;
    c.beginPath(); c.moveTo(px - nx, py - ny); c.lineTo(px + nx, py + ny);
    c.strokeStyle = h.INK; c.lineWidth = w * 0.42 + 1.6; c.stroke();
    c.strokeStyle = cuff || pal.bright; c.lineWidth = w * 0.42; c.stroke();
    if (skin) olHand(c, h, x2, y2, w * 0.52, skin);
  }
  // Pair of legs from hips (±hipX, top) to boots at (±footX, foot): trousers, cloud-toe boots, side cuffs.
  function clLegs(c, h, pal, top, foot, hipX, footX, w, trou, boot = CL_IRON) {
    for (const sx of [-1, 1]) {
      const x1 = sx * hipX, x2 = sx * footX;
      heroLimb(c, h, x1, top, (x1 + x2) / 2 + sx * w * 0.2, (top + foot) / 2, x2, foot - w * 0.6, w, Array.isArray(trou) ? nbCloth(c, x1 - w, top, x1 + w, foot, trou) : trou);
      h.rr(x2 - w * 0.55, foot - w * 1.3, w * 1.1, w * 1.15, w * 0.2); h.fillInk(nbCloth(c, x2 - w, foot, x2 + w, foot, boot), 1.2);
      c.beginPath(); c.ellipse(x2 + sx * w * 0.25, foot - w * 0.16, w * 0.85, w * 0.3, 0, 0, TAU); h.fillInk(boot[1], 1.2);
      clCurl(c, x2 + sx * w * 0.95, foot - w * 0.32, w * 0.26, sx, pal.bright, Math.max(0.7, w * 0.16));
      c.beginPath(); c.moveTo(x2 - w * 0.6, foot - w * 1.25); c.lineTo(x2 + w * 0.6, foot - w * 1.25);
      c.strokeStyle = h.INK; c.lineWidth = w * 0.3 + 1.6; c.stroke(); c.strokeStyle = pal.bright; c.lineWidth = w * 0.3; c.stroke();
    }
  }
  // Holy nimbus centred (x, y), radius R: radiant core, wheeling side-coloured rays and gold rings.
  function clHalo(c, pal, ts, x, y, R, alpha = 1) {
    if (!(R > 0)) return;
    const p = ts ? 0.5 + 0.5 * Math.sin(ts / 420) : 0.5, spin = ts ? ts / 5200 : 0;
    c.save(); c.shadowBlur = 0; c.shadowColor = "transparent"; c.globalCompositeOperation = "lighter";
    const g = c.createRadialGradient(x, y, R * 0.1, x, y, R);
    g.addColorStop(0, rgba(CL_SUN, 0.5 * alpha)); g.addColorStop(0.6, rgba(pal.bright, 0.3 * alpha)); g.addColorStop(1, rgba(pal.bright, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, R, 0, TAU); c.fill();
    c.beginPath();
    for (let i = 0; i < 18; i++) {
      const a = spin + i * TAU / 18, r0 = R * 0.6, r1 = R * (i % 2 ? 0.86 : 0.96) * (0.92 + 0.08 * p);
      c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    }
    c.strokeStyle = rgba(pal.bright, 0.42 * alpha); c.lineWidth = Math.max(0.7, R * 0.035); c.stroke();
    c.restore();
    c.beginPath(); c.arc(x, y, R * 0.62, 0, TAU); c.strokeStyle = rgba(pal.gold, 0.85 * alpha); c.lineWidth = Math.max(0.8, R * 0.045); c.stroke();
    c.beginPath(); c.arc(x, y, R * 0.55, 0, TAU); c.strokeStyle = rgba(pal.bright, 0.6 * alpha); c.lineWidth = Math.max(0.6, R * 0.025); c.stroke();
  }
  // Gold-rimmed chest-protector mirror (huxinjing) with a side-coloured boss.
  function clMirror(c, h, pal, x, y, R) {
    if (!(R > 0)) return;
    c.beginPath(); c.arc(x, y, R, 0, TAU); h.fillInk(nbCloth(c, x - R, y - R, x + R, y + R, CL_GOLD), Math.max(0.7, R * 0.12));
    c.beginPath(); c.arc(x, y, R * 0.72, 0, TAU); c.fillStyle = nbCloth(c, x - R, y - R, x + R, y + R, CL_SILVER); c.fill();
    c.beginPath(); c.arc(x, y, R * 0.34, 0, TAU); c.fillStyle = pal.bright; c.fill();
    c.beginPath(); c.arc(x - R * 0.26, y - R * 0.28, R * 0.16, 0, TAU); c.fillStyle = "rgba(255,255,255,0.8)"; c.fill();
  }
  // Layered, domed shoulder plate centred (x, y) with side-coloured lame edges and a gold stud.
  function clPauldron(c, h, pal, x, y, rx, ry, cols) {
    if (!(rx > 0) || !(ry > 0)) return;
    for (let i = 2; i >= 0; i--) {
      const yy = y + ry * 0.42 * i, k = 1 - i * 0.12;
      c.beginPath(); c.ellipse(x, yy, rx * k, ry, 0, Math.PI, TAU); c.quadraticCurveTo(x, yy + ry * 0.7, x - rx * k, yy); c.closePath();
      h.fillInk(nbCloth(c, x - rx, yy - ry, x + rx, yy + ry, cols), 1.3);
      c.beginPath(); c.moveTo(x + rx * k, yy); c.quadraticCurveTo(x, yy + ry * 0.7, x - rx * k, yy);
      c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.8, ry * 0.16); c.stroke();
    }
    c.beginPath(); c.arc(x, y - ry * 0.42, Math.max(1, ry * 0.16), 0, TAU); h.fillInk(pal.gold, 1);
  }
  // Fish-scale armour rows (call inside a clip).
  function clScales(c, x0, y0, x1, y1, s, color, lw) {
    if (!(s > 0)) return;
    c.beginPath();
    let row = 0;
    for (let y = y0; y <= y1; y += s * 0.6, row++) {
      for (let x = x0 + (row % 2 ? s * 0.5 : 0); x <= x1 - s * 0.5; x += s) { c.moveTo(x + s * 0.5, y); c.arc(x, y, s * 0.5, 0, Math.PI); }
    }
    c.strokeStyle = color; c.lineWidth = lw; c.stroke();
  }
  // Interlocking "mountain" (shanwen) Y-lattice of armour plates (call inside a clip).
  function clMountainMail(c, x0, y0, x1, y1, s, color, lw) {
    if (!(s > 0)) return;
    c.beginPath();
    let row = 0;
    for (let y = y0 + s * 0.4; y <= y1 - s * 0.25; y += s * 0.72, row++) {
      for (let x = x0 + s * 0.4 + (row % 2 ? s * 0.5 : 0); x <= x1 - s * 0.4; x += s) {
        c.moveTo(x, y - s * 0.38); c.lineTo(x, y); c.lineTo(x - s * 0.36, y + s * 0.22);
        c.moveTo(x, y); c.lineTo(x + s * 0.36, y + s * 0.22);
      }
    }
    c.strokeStyle = color; c.lineWidth = lw; c.stroke();
  }
  // Small solar disc (radius R) with corona glow; heat 0…1 dims a conquered sun to a smouldering ember.
  function clSun(c, h, pal, ts, x, y, R, heat = 1, seed = 0) {
    if (!(R > 0)) return;
    const f = ts ? 0.85 + 0.15 * Math.sin(ts / 160 + seed * 1.7) : 0.9, hot = heat > 0.6;
    wkGlow(c, x, y, R * 2.1 * f, hot ? CL_SUN : pal.bright, 0.55 * heat + 0.15);
    c.save(); c.globalCompositeOperation = "lighter";
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + (ts ? ts / 900 : 0) + seed;
      c.moveTo(x + Math.cos(a) * R * 1.1, y + Math.sin(a) * R * 1.1); c.lineTo(x + Math.cos(a) * R * (1.5 + 0.25 * f), y + Math.sin(a) * R * (1.5 + 0.25 * f));
    }
    c.strokeStyle = rgba(hot ? CL_SUN : "#ff9a40", 0.35 + 0.4 * heat); c.lineWidth = Math.max(0.6, R * 0.22); c.stroke();
    c.restore();
    const g = c.createRadialGradient(x - R * 0.3, y - R * 0.3, R * 0.05, x, y, R);
    g.addColorStop(0, "#fffbe0"); g.addColorStop(0.4, hot ? CL_SUN : "#ffb050"); g.addColorStop(1, hot ? "#e4501e" : "#8a2a10");
    c.beginPath(); c.arc(x, y, R, 0, TAU); h.fillInk(g, Math.max(0.6, R * 0.14));
    c.beginPath(); c.arc(x, y, R * 0.66, 0, TAU); c.strokeStyle = rgba(pal.bright, 0.9); c.lineWidth = Math.max(0.5, R * 0.14); c.stroke();
  }
  // Spinning Wind-Fire Wheel centred (x, y), radius R: ring of trailing flames, gold rim,
  // side-coloured inner ring, turning spokes and wind arcs (reach ≈ 1.65R). dir = ±1 spin direction.
  function clWheel(c, h, pal, ts, x, y, R, dir = 1, seed = 0) {
    if (!(R > 0)) return;
    const spin = ts ? dir * ts / 140 : seed;
    for (let i = 0; i < 10; i++) {
      const a = spin * 0.35 + i * TAU / 10, fl = R * (0.62 + 0.14 * Math.sin((ts || 0) / 80 + i * 2.1 + seed));
      clFlame(c, x + Math.cos(a) * R * 0.88, y + Math.sin(a) * R * 0.88, fl, R * 0.36, a + Math.PI / 2 - dir * 0.35, ts, i + seed);
    }
    wkGlow(c, x, y, R * 1.4, pal.bright, 0.4);
    c.beginPath(); c.arc(x, y, R, 0, TAU); c.strokeStyle = h.INK; c.lineWidth = R * 0.3 + 2; c.stroke();
    c.strokeStyle = nbCloth(c, x - R, y - R, x + R, y + R, CL_GOLD); c.lineWidth = R * 0.3; c.stroke();
    c.beginPath(); c.arc(x, y, R * 0.8, 0, TAU); c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.7, R * 0.09); c.stroke();
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = spin + i * TAU / 8;
      c.moveTo(x + Math.cos(a) * R * 0.2, y + Math.sin(a) * R * 0.2); c.lineTo(x + Math.cos(a) * R * 0.78, y + Math.sin(a) * R * 0.78);
    }
    c.strokeStyle = h.INK; c.lineWidth = R * 0.12 + 1.6; c.stroke(); c.strokeStyle = CL_GOLD[1]; c.lineWidth = R * 0.12; c.stroke();
    c.beginPath(); c.arc(x, y, R * 0.26, 0, TAU); h.fillInk(nbCloth(c, x - R * 0.3, y - R * 0.3, x + R * 0.3, y + R * 0.3, CL_GOLD), 1);
    c.beginPath(); c.arc(x, y, R * 0.12, 0, TAU); c.fillStyle = pal.deep; c.fill();
    c.save(); c.globalCompositeOperation = "lighter";
    for (let k = 0; k < 2; k++) {
      const a0 = spin * 0.5 + k * Math.PI;
      c.beginPath(); c.arc(x, y, R * (1.1 + k * 0.12), a0, a0 + 1.5);
      c.strokeStyle = rgba(k ? pal.rim : CL_WIND, 0.6); c.lineWidth = Math.max(0.6, R * 0.07); c.stroke();
    }
    c.restore();
  }
  // Rotating spiral cyclone centred (x, y), radius R (vertical squash sq), drawn with additive wind light.
  function clVortex(c, pal, ts, x, y, R, sq = 0.62, arms = 4, dir = 1) {
    if (!(R > 0)) return;
    const spin = ts ? dir * ts / 380 : 0;
    c.save(); c.globalCompositeOperation = "lighter";
    for (let k = 0; k < arms; k++) {
      c.beginPath();
      for (let i = 0; i <= 26; i++) {
        const t = i / 26, a = spin + k * TAU / arms + dir * t * TAU * 0.9, rad = R * (0.1 + 0.9 * t);
        const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad * sq;
        if (i) c.lineTo(px, py); else c.moveTo(px, py);
      }
      const col = k % 2 ? pal.bright : CL_WIND;
      c.strokeStyle = rgba(col, 0.22); c.lineWidth = Math.max(1.6, R * 0.12); c.stroke();
      c.strokeStyle = rgba(col, 0.7); c.lineWidth = Math.max(0.7, R * 0.035); c.stroke();
    }
    c.restore();
  }
  // Single lotus petal from base (x, y) along ang (0 = up), length len, half-width w.
  function clPetal(c, h, x, y, len, w, ang, fill, inkW = 1.2) {
    if (!(len > 0)) return;
    c.save(); c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.moveTo(0, 0);
    c.bezierCurveTo(-w * 1.25, -len * 0.35, -w * 0.55, -len * 0.85, 0, -len);
    c.bezierCurveTo(w * 0.55, -len * 0.85, w * 1.25, -len * 0.35, 0, 0); c.closePath();
    h.fillInk(fill, inkW);
    c.beginPath(); c.moveTo(0, -len * 0.12); c.lineTo(0, -len * 0.8);
    c.strokeStyle = "rgba(255,255,255,0.5)"; c.lineWidth = Math.max(0.5, w * 0.12); c.stroke();
    c.restore();
  }

  SG.THEMES.celestial = {
    id: "celestial",
    name: { en: "Celestial Realm", fr: "Royaume Céleste", zh: "天界仙魔", ar: "المملكة السماوية والأساطير" },
    description: {
      en: "Pantheon of ancient Chinese myth: Ksitigarbha Bodhisattva upon his thousand-petal lotus with nine-ring staff and wish-fulfilling jewel, the Monkey King on his somersault cloud, the horned Bull Demon King, three-eyed Erlang Shen, Nezha on Wind-Fire Wheels, heavenly halberdiers, Hou Yi the sun-shooting archer and Princess Iron Fan's cyclone.",
      fr: "Panthéon des mythes célestes de la Chine antique : le bodhisattva Ksitigarbha sur son lotus aux mille pétales, armé du bâton aux neuf anneaux et du joyau qui exauce les vœux, le Roi Singe sur son nuage-culbute, le Roi Démon Taureau cornu, Erlang Shen aux trois yeux, Nezha sur ses roues de vent et de feu, les hallebardiers célestes, Hou Yi l'archer qui abattit les soleils et le cyclone de la Princesse à l'Éventail de Fer.",
      zh: "取材自古代中国神话与西游封神：千叶宝莲上手持九环锡杖与如意宝珠的地藏菩萨、驾筋斗云的齐天大圣、牛角魔盔的牛魔王、三目神光的二郎神、脚踏风火轮的哪吒、天兵天将、射日神弓后羿，以及挥动芭蕉扇卷起狂风的铁扇公主。",
      ar: "مجمع أساطير الصين السماوية القديمة: البوديساتفا كشيتيغاربها (ديزانغ) فوق عرش اللوتس ذي الألف بتلة بعصاه ذات الحلقات التسع وجوهرة تحقيق الأماني، والملك القرد على سحابته الشقلبية، وملك الشياطين الثور ذو القرون، وإرلانغ شين ذو العيون الثلاث، ونيجا على عجلتي الريح والنار، وحملة الرماح السماويون، وهو يي رامي الشموس، وإعصار الأميرة ذات المروحة الحديدية.",
    },
    painters: {
      /* Ksitigarbha Bodhisattva (Dizang Pusa), Lord of the Six Realms & Saviour of the Underworld — serene face with
         long earlobes and a glowing urna beneath the five-Buddha Vairocana crown and its fluttering silk ribbons,
         ringed by a radiant nimbus; a saffron under-robe and a patchwork kasaya in the side's colours fastened with a
         golden ruyi ring-clasp; the golden nine-ring khakkhara in his right hand, the luminous wish-fulfilling jewel
         blazing in his left palm, standing on a thousand-petal lotus throne amid drifting mist. */
      sovereign(c, pal, r, ts, h) {
        const { fillInk, pulse } = h;
        const q = pulse(360, 0.4), bob = ts ? Math.sin(ts / 1000) * r * 0.012 : 0;
        // radiant nimbus (head halo) and body aureole
        c.save(); c.globalCompositeOperation = "lighter";
        const aur = c.createRadialGradient(0, -r * 0.1, r * 0.2, 0, -r * 0.1, r * 0.95);
        aur.addColorStop(0, rgba(pal.bright, 0.22)); aur.addColorStop(1, rgba(pal.bright, 0));
        c.fillStyle = aur; c.beginPath(); c.ellipse(0, -r * 0.1, r * 0.78, r * 0.95, 0, 0, TAU); c.fill();
        c.restore();
        clHalo(c, pal, ts, 0, -r * 0.6, r * 0.5);
        // drifting mist behind the throne
        c.save(); c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 4; i++) {
          const t = ts ? (ts / 5200 + i / 4) % 1 : (i + 0.5) / 4, mx = r * (-0.7 + 1.4 * t), my = r * (0.78 + 0.06 * Math.sin(i * 2.3));
          c.fillStyle = rgba(i % 2 ? pal.rim : "#ffffff", 0.18 * Math.sin(Math.PI * t));
          c.beginPath(); c.ellipse(mx, my, r * 0.3, r * 0.07, 0, 0, TAU); c.fill();
        }
        c.restore();
        c.save(); c.translate(0, bob);
        // ---- thousand-petal lotus throne ----
        const LY = r * 0.86;
        for (let i = 0; i < 9; i++) {   // back row, side colours
          const a = -1.25 + i * (2.5 / 8);
          clPetal(c, h, Math.sin(a) * r * 0.46, LY + r * 0.02, r * 0.3, r * 0.1, a * 1.05, clSide(c, pal, 0, LY - r * 0.3, 0, LY), 1.1);
        }
        for (let i = 0; i < 7; i++) {   // middle row, pink lotus
          const a = -1.1 + i * (2.2 / 6);
          clPetal(c, h, Math.sin(a) * r * 0.5, LY + r * 0.07, r * 0.24, r * 0.09, a * 1.15, nbCloth(c, 0, LY - r * 0.18, 0, LY + r * 0.07, CL_LOTUS), 1.1);
        }
        // seed-pod dais
        c.beginPath(); c.ellipse(0, LY + r * 0.07, r * 0.62, r * 0.1, 0, 0, TAU); fillInk(nbCloth(c, 0, LY - r * 0.03, 0, LY + r * 0.17, CL_GOLD), 1.6);
        c.beginPath(); c.ellipse(0, LY + r * 0.07, r * 0.62, r * 0.1, 0, 0, TAU); c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.8, r * 0.025); c.stroke();
        for (let i = 0; i < 5; i++) {   // front petals curling down over the base
          const a = Math.PI - 0.9 + i * 0.45;
          clPetal(c, h, Math.sin(a - Math.PI) * -r * 0.5, LY + r * 0.1, r * 0.17, r * 0.09, a, nbCloth(c, 0, LY + r * 0.1, 0, LY + r * 0.28, [pal.rim, CL_LOTUS[1], pal.deep]), 1);
        }
        // ---- robes ----
        const top = -r * 0.38, bot = r * 0.84;
        clRobe(c, h, pal, 0, top, bot, r * 0.32, r * 0.44, nbCloth(c, -r * 0.4, top, r * 0.4, bot, CL_SAFFRON), { hemK: 0.08 });
        // patchwork kasaya draped from the left shoulder across the body (field-pattern panels in side colours)
        const kasaya = () => {
          c.beginPath(); c.moveTo(r * 0.3, top + r * 0.02); c.lineTo(r * 0.36, r * 0.1);
          c.quadraticCurveTo(r * 0.4, r * 0.5, r * 0.36, r * 0.66);
          c.quadraticCurveTo(0, r * 0.72, -r * 0.38, r * 0.6);
          c.quadraticCurveTo(-r * 0.4, r * 0.2, -r * 0.3, -r * 0.02);
          c.quadraticCurveTo(-r * 0.12, -r * 0.08, r * 0.02, top + r * 0.04); c.closePath();
        };
        kasaya(); fillInk(clRobeGrad(c, pal, -r * 0.4, top, r * 0.4, r * 0.7), 1.8);
        c.save(); kasaya(); c.clip();
        for (let i = 0; i < 6; i++) for (let j = 0; j < 7; j++) {
          if ((i + j) % 3) continue;
          c.fillStyle = rgba((i + j) % 2 ? pal.deep : pal.bright, 0.35);
          c.fillRect(-r * 0.42 + i * r * 0.14, -r * 0.36 + j * r * 0.15, r * 0.14, r * 0.15);
        }
        c.beginPath();
        for (let i = 1; i < 6; i++) { const x = -r * 0.42 + i * r * 0.14; c.moveTo(x, -r * 0.36); c.lineTo(x + r * 0.04, r * 0.72); }
        for (let j = 1; j < 7; j++) { const y = -r * 0.36 + j * r * 0.15; c.moveTo(-r * 0.42, y + r * 0.05); c.lineTo(r * 0.42, y - r * 0.03); }
        c.strokeStyle = rgba(pal.deep, 0.7); c.lineWidth = Math.max(1, r * 0.016) + 1; c.stroke();
        c.strokeStyle = pal.gold; c.lineWidth = Math.max(0.7, r * 0.012); c.stroke();
        c.restore();
        kasaya(); h.ink(1.8);
        // bare right shoulder of the under-robe & cross collar
        clLapels(c, h, pal, 0, top + r * 0.01, r * 0.22, r * 0.08, Math.max(2, r * 0.05));
        // golden ruyi ring-clasp on the kasaya cord
        c.beginPath(); c.moveTo(-r * 0.18, -r * 0.22); c.quadraticCurveTo(-r * 0.05, -r * 0.3, r * 0.28, -r * 0.34);
        c.strokeStyle = h.INK; c.lineWidth = r * 0.025 + 1.6; c.stroke(); c.strokeStyle = pal.bright; c.lineWidth = r * 0.025; c.stroke();
        c.beginPath(); c.arc(-r * 0.2, -r * 0.18, r * 0.055, 0, TAU);
        c.strokeStyle = h.INK; c.lineWidth = r * 0.03 + 1.8; c.stroke();
        c.strokeStyle = nbCloth(c, -r * 0.26, -r * 0.24, -r * 0.14, -r * 0.12, CL_GOLD); c.lineWidth = r * 0.03; c.stroke();
        clCurl(c, -r * 0.2, -r * 0.1, r * 0.03, 1, pal.gold, Math.max(0.6, r * 0.015));
        // ---- right hand (viewer's left): golden nine-ring khakkhara ----
        const SX = -r * 0.54, sTop = -r * 0.74, sBot = r * 0.82;
        clPole(c, h, SX, sBot, SX, sTop, Math.max(2, r * 0.045), nbCloth(c, SX - r * 0.03, 0, SX + r * 0.03, 0, CL_GOLD));
        c.beginPath();
        for (let k = 1; k < 7; k++) { const yy = sBot + (sTop - sBot) * k / 7; c.moveTo(SX - r * 0.025, yy); c.lineTo(SX + r * 0.025, yy); }
        c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.8, r * 0.018); c.stroke();
        // ornate stupa-shaped finial frame
        const FX = SX, FY = -r * 0.94, FW = r * 0.18, FH = r * 0.2;
        const frame = () => {
          c.beginPath(); c.moveTo(FX, sTop);
          c.bezierCurveTo(FX - FW * 1.3, sTop - FH * 0.1, FX - FW * 1.1, FY - FH * 0.9, FX, FY - FH);
          c.bezierCurveTo(FX + FW * 1.1, FY - FH * 0.9, FX + FW * 1.3, sTop - FH * 0.1, FX, sTop);
        };
        frame(); c.strokeStyle = h.INK; c.lineWidth = r * 0.04 + 2; c.stroke();
        frame(); c.strokeStyle = nbCloth(c, FX - FW, FY, FX + FW, FY, CL_GOLD); c.lineWidth = r * 0.04; c.stroke();
        clPole(c, h, FX, sTop, FX, FY - FH * 0.55, Math.max(1.4, r * 0.025), CL_GOLD[1]);
        c.beginPath(); c.moveTo(FX, FY - FH * 1.12); c.lineTo(FX - r * 0.035, FY - FH * 0.94); c.lineTo(FX + r * 0.035, FY - FH * 0.94); c.closePath(); fillInk(CL_GOLD[1], 1);
        wkGlow(c, FX, FY - FH * 0.55, r * 0.09, pal.bright, 0.5 + 0.4 * q);
        c.beginPath(); c.arc(FX, FY - FH * 0.55, r * 0.03, 0, TAU); fillInk(pal.bright, 1);
        // the nine jingling rings — four threaded on each arch, one on the central rod
        const arch = (sx, t) => {
          const u = 1 - t, P = [[FX, sTop], [FX + sx * FW * 1.3, sTop - FH * 0.1], [FX + sx * FW * 1.1, FY - FH * 0.9], [FX, FY - FH]];
          return [u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0],
                  u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1]];
        };
        const rings = [];
        for (const sx of [-1, 1]) for (const t of [0.2, 0.38, 0.56, 0.74]) { const [ax, ay] = arch(sx, t); rings.push([ax + sx * r * 0.025, ay + r * 0.03]); }
        rings.push([FX, sTop - FH * 0.25]);
        rings.forEach(([ax, ay], k) => {
          const jig = ts ? Math.sin(ts / 120 + k * 1.9) * r * 0.008 : 0, rr = r * 0.036;
          c.beginPath(); c.arc(ax + jig, ay, rr, 0, TAU);
          c.strokeStyle = h.INK; c.lineWidth = r * 0.014 + 1.4; c.stroke();
          c.strokeStyle = k % 2 ? CL_GOLD[1] : CL_GOLD[0]; c.lineWidth = r * 0.014; c.stroke();
          if (!ts || Math.sin(ts / 200 + k) > 0.6) wkSparkle(c, ax + jig + rr * 0.6, ay - rr * 0.6, r * 0.026, pal.bright, 0, 0.8);
        });
        // arms in wide sleeves
        clArm(c, h, pal, -r * 0.28, -r * 0.3, -r * 0.5, -r * 0.1, SX + r * 0.02, r * 0.02, Math.max(3, r * 0.13), CL_SAFFRON, CL_SKIN);
        c.beginPath(); c.moveTo(SX - r * 0.05, -r * 0.02); c.lineTo(SX + r * 0.07, -r * 0.02); c.strokeStyle = rgba(CL_SKIN[2], 0.6); c.lineWidth = 1; c.stroke();
        clArm(c, h, pal, r * 0.28, -r * 0.3, r * 0.52, -r * 0.06, r * 0.38, r * 0.06, Math.max(3, r * 0.13), clRobeGrad(c, pal, r * 0.2, -r * 0.3, r * 0.5, r * 0.1), CL_SKIN);
        // ---- left palm: the luminous wish-fulfilling jewel ----
        const JX = r * 0.38, JY = -r * 0.04, JR = r * 0.075;
        c.save(); c.globalCompositeOperation = "lighter";
        const spin = ts ? ts / 1600 : 0;
        c.beginPath();
        for (let i = 0; i < 12; i++) {
          const a = spin + i * TAU / 12, r1 = JR * (i % 2 ? 2.6 : 3.6) * (0.85 + 0.15 * q);
          c.moveTo(JX + Math.cos(a) * JR * 1.3, JY + Math.sin(a) * JR * 1.3); c.lineTo(JX + Math.cos(a) * r1, JY + Math.sin(a) * r1);
        }
        c.strokeStyle = rgba(pal.bright, 0.5); c.lineWidth = Math.max(0.8, r * 0.02); c.stroke();
        c.restore();
        wkGlow(c, JX, JY, JR * 3.2, pal.bright, 0.55 + 0.35 * q);
        for (let i = 0; i < 5; i++) clFlame(c, JX + Math.cos(-Math.PI / 2 + (i - 2) * 0.5) * JR * 0.9, JY + Math.sin(-Math.PI / 2 + (i - 2) * 0.5) * JR * 0.9, JR * (1.2 + 0.2 * (i % 2)), JR * 0.6, (i - 2) * 0.45, ts, i, pal.bright);
        const jg = c.createRadialGradient(JX - JR * 0.35, JY - JR * 0.35, JR * 0.05, JX, JY, JR);
        jg.addColorStop(0, "#ffffff"); jg.addColorStop(0.45, pal.rim); jg.addColorStop(1, pal.bright);
        c.beginPath(); c.arc(JX, JY, JR, 0, TAU); fillInk(jg, 1.2);
        c.beginPath(); c.arc(JX - JR * 0.32, JY - JR * 0.34, JR * 0.25, 0, TAU); c.fillStyle = "rgba(255,255,255,0.9)"; c.fill();
        olHand(c, h, r * 0.38, r * 0.06, Math.max(2, r * 0.07), CL_SKIN);
        // ---- head ----
        const HX = 0, HY = -r * 0.56, HS = r * 0.15;
        // crown ribbons (guan zeng) fluttering down past the shoulders
        for (const sx of [-1, 1]) {
          const pts = [];
          for (let i = 0; i <= 10; i++) {
            const t = i / 10, w = ts ? Math.sin(ts / 300 + t * 5 + sx) * r * 0.04 * t : 0;
            pts.push([sx * (r * 0.16 + t * r * 0.26) + w, -r * 0.66 + t * r * 0.58 + w * 0.3]);
          }
          clRibbon(c, h, pts, t => Math.max(1.5, r * (0.05 - t * 0.02)), [pal.rim, pal.bright, pal.deep], 1);
        }
        c.beginPath(); c.rect(HX - r * 0.06, HY + HS * 0.6, r * 0.12, r * 0.1); fillInk(CL_SKIN[1], 1.2);
        clFace(c, h, HX, HY, HS, { serene: true, lobes: true, mouth: "calm", lips: "#b8505a", brow: "#3a2a24" });
        wkGlow(c, HX, HY - HS * 0.42, HS * 0.4, pal.bright, 0.5 + 0.3 * q);
        c.beginPath(); c.arc(HX, HY - HS * 0.42, HS * 0.08, 0, TAU); c.fillStyle = "#ffffff"; c.fill();   // urna
        // five-Buddha (Vairocana) crown
        const CB = HY - HS * 0.68;
        h.rr(HX - HS * 0.86, CB - HS * 0.16, HS * 1.72, HS * 0.26, HS * 0.08); fillInk(nbCloth(c, 0, CB - HS * 0.16, 0, CB + HS * 0.1, CL_GOLD), 1.2);
        c.beginPath(); c.moveTo(HX - HS * 0.8, CB - HS * 0.03); c.lineTo(HX + HS * 0.8, CB - HS * 0.03); c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.8, HS * 0.08); c.stroke();
        for (let i = -2; i <= 2; i++) {
          const px = HX + i * HS * 0.36, ph = HS * (0.68 - Math.abs(i) * 0.12), pw = HS * 0.2, pb = CB - HS * 0.12;
          c.beginPath(); c.moveTo(px - pw, pb);
          c.quadraticCurveTo(px - pw * 1.2, pb - ph * 0.6, px, pb - ph);
          c.quadraticCurveTo(px + pw * 1.2, pb - ph * 0.6, px + pw, pb); c.closePath();
          fillInk(nbCloth(c, px, pb - ph, px, pb, CL_GOLD), 1);
          // tiny seated Buddha on a side-coloured halo
          const bx = px, by = pb - ph * 0.45;
          c.beginPath(); c.arc(bx, by - ph * 0.08, pw * 0.5, 0, TAU); c.fillStyle = rgba(pal.bright, 0.85); c.fill();
          c.beginPath(); c.arc(bx, by - ph * 0.1, pw * 0.2, 0, TAU); c.fillStyle = pal.deep; c.fill();
          c.beginPath(); c.ellipse(bx, by + ph * 0.12, pw * 0.38, pw * 0.22, 0, 0, TAU); c.fill();
        }
        for (const sx of [-1, 1]) { c.beginPath(); c.arc(HX + sx * HS * 0.9, CB - HS * 0.03, HS * 0.13, 0, TAU); fillInk(pal.bright, 1); }
        c.restore();
        // compassionate light motes rising
        for (let i = 0; i < 6; i++) {
          const t = ts ? (ts / 2600 + i / 6) % 1 : (i + 0.5) / 6, a = i * 2.3;
          wkSparkle(c, r * 0.8 * Math.cos(a) * (0.6 + 0.3 * t), r * (0.7 - 1.5 * t), r * 0.03, i % 2 ? pal.bright : CL_SUN, t * 5, 0.8 * Math.sin(Math.PI * t));
        }
      },

      /* Sun Wukong, the Monkey King, Great Sage Equal to Heaven — golden-furred face with blazing fiery golden eyes
         (huoyan jinjing) under the golden fillet and a phoenix-feather cap whose twin pheasant plumes arch high, gold
         chain-scale armour over red silk with a side-coloured sash and streaming scarf; one hand shades his eyes to
         scan the heavens while the other whirls the gilded Ruyi Jingu Bang in a kinetic arc above his somersault cloud. */
      reaper(c, pal, r, ts, h) {
        const { fillInk, pulse } = h;
        const p = pulse(140), bob = ts ? Math.sin(ts / 520) * r * 0.025 : 0, sw = ts ? Math.sin(ts / 380) : 0.3, vel = ts ? Math.cos(ts / 380) : 1;
        // speed streaks
        c.save(); c.globalCompositeOperation = "lighter";
        for (let i = 0; i < 5; i++) {
          const t = ts ? (ts / 600 + i / 5) % 1 : (i + 0.5) / 5, y = r * (0.72 + i * 0.07), x0 = r * (0.6 - 1.7 * t);
          c.beginPath(); c.moveTo(Math.max(-r * 1.15, x0), y); c.lineTo(Math.max(-r * 1.15, x0 - r * 0.4), y);
          c.strokeStyle = rgba(i % 2 ? pal.bright : CL_WIND, 0.5 * Math.sin(Math.PI * t)); c.lineWidth = Math.max(0.8, r * 0.02); c.stroke();
        }
        c.restore();
        // somersault cloud with its curling tail
        const tail = [];
        for (let i = 0; i <= 10; i++) { const t = i / 10; tail.push([-r * 0.3 - t * r * 0.78, r * 0.94 - Math.sin(t * Math.PI * 0.9) * r * 0.22 + (ts ? Math.sin(ts / 260 + t * 6) * r * 0.025 * t : 0)]); }
        clRibbon(c, h, tail, t => r * 0.2 * (1 - t * 0.85), CL_CLOUD, 1.4);
        clCurl(c, -r * 0.95, r * 0.78, r * 0.06, -1, pal.bright, Math.max(0.8, r * 0.02));
        clCloudBank(c, h, pal, ts, r * 0.04, r * 0.95, r * 0.64, r * 0.14, 7);
        c.save(); c.translate(0, bob);
        // streaming side-coloured scarf
        const scarf = [];
        for (let i = 0; i <= 12; i++) { const t = i / 12; scarf.push([-r * 0.12 - t * r * 0.92, -r * 0.32 - t * r * 0.22 + (ts ? Math.sin(ts / 180 - t * 6) * r * 0.06 * t : r * 0.03 * t)]); }
        clRibbon(c, h, scarf, t => r * 0.11 * (1 - t * 0.55), [pal.rim, pal.bright, pal.deep], 1.2);
        // curling tail
        c.beginPath(); c.moveTo(r * 0.12, r * 0.3); c.bezierCurveTo(r * 0.5, r * 0.5, r * 0.78, r * 0.2, r * 0.66, -r * 0.08);
        c.strokeStyle = h.INK; c.lineWidth = r * 0.06 + 2.4; c.stroke(); c.strokeStyle = nbCloth(c, r * 0.1, r * 0.3, r * 0.7, -r * 0.1, CL_FUR); c.lineWidth = r * 0.06; c.stroke();
        clCurl(c, r * 0.66, -r * 0.08, r * 0.05, -1, CL_FUR[1], Math.max(1, r * 0.04));
        // legs: red silk trousers, black cloud boots
        clLegs(c, h, pal, r * 0.32, r * 0.86, r * 0.12, r * 0.26, Math.max(3, r * 0.11), CL_RED, CL_IRON);
        // gold scale tassets over a red silk skirt
        c.beginPath(); c.moveTo(-r * 0.3, r * 0.1); c.lineTo(r * 0.3, r * 0.1); c.lineTo(r * 0.36, r * 0.46); c.lineTo(-r * 0.36, r * 0.46); c.closePath();
        fillInk(nbCloth(c, 0, r * 0.1, 0, r * 0.46, CL_RED), 1.6);
        for (const sx of [-1, 1]) {
          const tas = () => { c.beginPath(); c.moveTo(sx * r * 0.02, r * 0.1); c.lineTo(sx * r * 0.32, r * 0.1); c.lineTo(sx * r * 0.36, r * 0.42); c.quadraticCurveTo(sx * r * 0.2, r * 0.46, sx * r * 0.04, r * 0.4); c.closePath(); };
          tas(); fillInk(nbCloth(c, 0, r * 0.1, 0, r * 0.44, CL_GOLD), 1.4);
          c.save(); tas(); c.clip(); clScales(c, -r * 0.4, r * 0.12, r * 0.4, r * 0.44, r * 0.07, rgba(CL_GOLD[2], 0.8), Math.max(0.6, r * 0.012)); c.restore();
          c.beginPath(); c.moveTo(sx * r * 0.36, r * 0.42); c.quadraticCurveTo(sx * r * 0.2, r * 0.46, sx * r * 0.04, r * 0.4);
          c.strokeStyle = pal.bright; c.lineWidth = Math.max(1, r * 0.03); c.stroke();
        }
        // torso: red silk under golden breastplate
        egTorso(c, h, 0, -r * 0.36, r * 0.14, r * 0.3, r * 0.22, CL_RED);
        const plate = () => { c.beginPath(); c.moveTo(-r * 0.24, -r * 0.3); c.quadraticCurveTo(0, -r * 0.22, r * 0.24, -r * 0.3); c.lineTo(r * 0.2, r * 0.08); c.lineTo(-r * 0.2, r * 0.08); c.closePath(); };
        plate(); fillInk(nbCloth(c, -r * 0.24, -r * 0.3, r * 0.24, r * 0.08, CL_GOLD), 1.6);
        c.save(); plate(); c.clip(); clScales(c, -r * 0.26, -r * 0.26, r * 0.26, r * 0.08, r * 0.075, rgba(CL_GOLD[2], 0.75), Math.max(0.6, r * 0.012)); c.restore();
        plate(); c.strokeStyle = pal.bright; c.lineWidth = Math.max(1, r * 0.025); c.stroke();
        clMirror(c, h, pal, 0, -r * 0.12, r * 0.08);
        // side-coloured sash with knot
        h.rr(-r * 0.25, r * 0.04, r * 0.5, r * 0.09, r * 0.03); fillInk(clRobeGrad(c, pal, 0, r * 0.04, 0, r * 0.13), 1.4);
        c.beginPath(); c.ellipse(r * 0.1, r * 0.085, r * 0.05, r * 0.035, 0, 0, TAU); fillInk(pal.bright, 1);
        for (const k of [0, 1]) clPole(c, h, r * (0.1 + k * 0.04), r * 0.11, r * (0.12 + k * 0.08) + (ts ? Math.sin(ts / 200 + k) * r * 0.02 : 0), r * 0.3, Math.max(1.4, r * 0.03), pal.bright);
        // pauldrons
        for (const sx of [-1, 1]) clPauldron(c, h, pal, sx * r * 0.29, -r * 0.3, r * 0.12, r * 0.08, CL_GOLD);
        // left arm shading the eyes (scanning the heavens)
        clArm(c, h, pal, -r * 0.3, -r * 0.28, -r * 0.56, -r * 0.42, -r * 0.24, -r * 0.66, Math.max(3, r * 0.1), CL_RED, CL_FUR);
        // head
        const HX = 0, HY = -r * 0.54, HS = r * 0.16;
        for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(HX + sx * HS * 1.05, HY + HS * 0.05, HS * 0.24, HS * 0.32, 0, 0, TAU); fillInk(nbCloth(c, HX - HS, HY, HX + HS, HY, CL_MONKEY), 1.2); }
        c.beginPath();
        for (let i = 0; i <= 18; i++) {   // shaggy fur head
          const a = i / 18 * TAU, rad = HS * (i % 2 ? 0.98 : 1.1);
          if (i) c.lineTo(HX + Math.cos(a) * rad, HY + Math.sin(a) * rad * 0.98); else c.moveTo(HX + rad, HY);
        }
        c.closePath(); fillInk(nbCloth(c, HX - HS, HY - HS, HX + HS, HY + HS, CL_FUR), 1.6);
        const mask = () => {
          c.beginPath();
          for (const sx of [-1, 1]) { c.moveTo(HX + sx * HS * 0.36 + HS * 0.36, HY - HS * 0.08); c.arc(HX + sx * HS * 0.36, HY - HS * 0.08, HS * 0.36, 0, TAU); }
          c.moveTo(HX + HS * 0.5, HY + HS * 0.42); c.ellipse(HX, HY + HS * 0.42, HS * 0.5, HS * 0.42, 0, 0, TAU);
        };
        mask(); c.strokeStyle = h.INK; c.lineWidth = 2.2; c.stroke();
        mask(); c.fillStyle = nbCloth(c, HX, HY - HS * 0.4, HX, HY + HS * 0.8, CL_MONKEY); c.fill();
        // fiery golden eyes
        for (const sx of [-1, 1]) {
          const ex = HX + sx * HS * 0.34, ey = HY - HS * 0.08;
          wkGlow(c, ex, ey, HS * (0.42 + 0.12 * p), CL_FIRE, 0.75);
          olAlmond(c, ex, ey, HS * 0.2, HS * 0.1); c.fillStyle = CL_FIRE_CORE; c.fill();
          c.beginPath(); c.arc(ex, ey, HS * 0.06, 0, TAU); c.fillStyle = pal.deep; c.fill();
          olAlmond(c, ex, ey, HS * 0.2, HS * 0.1); c.strokeStyle = "#c2200a"; c.lineWidth = Math.max(0.8, HS * 0.08); c.stroke();
          c.beginPath(); c.moveTo(ex - sx * HS * 0.2, ey - HS * 0.2); c.lineTo(ex + sx * HS * 0.22, ey - HS * 0.3); c.strokeStyle = CL_FUR[2]; c.lineWidth = Math.max(0.8, HS * 0.1); c.stroke();
        }
        c.fillStyle = "#5a2a1a";
        for (const sx of [-1, 1]) { c.beginPath(); c.arc(HX + sx * HS * 0.07, HY + HS * 0.28, HS * 0.04, 0, TAU); c.fill(); }
        c.beginPath(); c.moveTo(HX - HS * 0.28, HY + HS * 0.5); c.quadraticCurveTo(HX, HY + HS * 0.78, HX + HS * 0.28, HY + HS * 0.5); c.closePath();
        fillInk("#ffffff", Math.max(0.8, HS * 0.08));
        // golden fillet & phoenix-wing purple-gold cap
        c.beginPath(); c.moveTo(HX - HS * 0.95, HY - HS * 0.5); c.quadraticCurveTo(HX, HY - HS * 0.72, HX + HS * 0.95, HY - HS * 0.5);
        c.strokeStyle = h.INK; c.lineWidth = HS * 0.16 + 1.8; c.stroke(); c.strokeStyle = CL_GOLD[1]; c.lineWidth = HS * 0.16; c.stroke();
        // twin pheasant plumes arching high
        for (const sx of [-1, 1]) {
          const sway = ts ? Math.sin(ts / 320 + sx) * r * 0.04 : 0, pts = [];
          for (let i = 0; i <= 16; i++) {
            const t = i / 16, u = 1 - t;
            const bx = u * u * u * (sx * r * 0.05) + 3 * u * u * t * (sx * r * 0.08) + 3 * u * t * t * (sx * r * 0.42) + t * t * t * (sx * r * 0.7 + sway);
            const by = u * u * u * (-r * 0.76) + 3 * u * u * t * (-r * 1.1) + 3 * u * t * t * (-r * 1.18) + t * t * t * (-r * 0.98 + sway * 0.5);
            pts.push([bx, by]);
          }
          clRibbon(c, h, pts, t => Math.max(1.2, r * 0.045 * (1 - t * 0.75)), CL_PHEASANT, 1);
          c.beginPath();
          for (let i = 2; i < 16; i += 2) {
            const a = pts[i - 1], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, w = r * 0.02 * (1 - i / 22);
            c.moveTo(pts[i][0] - dy / l * w, pts[i][1] + dx / l * w); c.lineTo(pts[i][0] + dy / l * w, pts[i][1] - dx / l * w);
          }
          c.strokeStyle = rgba(CL_PHEASANT[2], 0.9); c.lineWidth = Math.max(0.7, r * 0.012); c.stroke();
          const tip = pts[pts.length - 1];
          wkSparkle(c, tip[0], tip[1], r * 0.035, pal.bright, 0, 0.9);
        }
        const CY = HY - HS * 0.9;
        c.beginPath(); c.moveTo(HX - HS * 0.5, CY + HS * 0.25); c.lineTo(HX - HS * 0.36, CY - HS * 0.25); c.quadraticCurveTo(HX, CY - HS * 0.75, HX + HS * 0.36, CY - HS * 0.25); c.lineTo(HX + HS * 0.5, CY + HS * 0.25); c.closePath();
        fillInk(nbCloth(c, HX, CY - HS * 0.7, HX, CY + HS * 0.25, CL_GOLD), 1.3);
        for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(HX + sx * HS * 0.45, CY + HS * 0.1); c.quadraticCurveTo(HX + sx * HS * 0.9, CY - HS * 0.05, HX + sx * HS * 1.0, CY - HS * 0.45); c.quadraticCurveTo(HX + sx * HS * 0.75, CY + HS * 0.1, HX + sx * HS * 0.45, CY + HS * 0.24); c.closePath(); fillInk(CL_GOLD[1], 1); }
        c.beginPath(); c.arc(HX, CY - HS * 0.1, HS * 0.14, 0, TAU); fillInk(pal.bright, 1);
        // right arm and the whirling Golden-Hooped Staff
        const GX = r * 0.36, GY = -r * 0.02, L = r * 0.8, A = -1.05 + sw * 0.6, wS = Math.max(2.5, r * 0.06), dir = vel >= 0 ? 1 : -1;
        clArm(c, h, pal, r * 0.3, -r * 0.28, r * 0.5, -r * 0.18, GX, GY, Math.max(3, r * 0.1), CL_RED, null);
        c.save(); c.globalCompositeOperation = "lighter";
        for (const e of [0, Math.PI]) {
          c.beginPath(); c.arc(GX, GY, L * 0.96, A + e - dir * 0.75, A + e, dir < 0);
          c.strokeStyle = rgba(pal.bright, 0.45); c.lineWidth = Math.max(1.2, r * 0.05); c.stroke();
          c.strokeStyle = rgba(CL_SUN, 0.5); c.lineWidth = Math.max(0.6, r * 0.015); c.stroke();
        }
        for (const k of [1, 2]) {
          const a = A - dir * 0.22 * k, ca = Math.cos(a) * L, sa = Math.sin(a) * L;
          c.beginPath(); c.moveTo(GX - ca, GY - sa); c.lineTo(GX + ca, GY + sa);
          c.strokeStyle = rgba(pal.bright, 0.28 / k); c.lineWidth = wS * 1.4; c.stroke();
        }
        c.restore();
        c.save(); c.translate(GX, GY); c.rotate(A);
        c.beginPath(); c.moveTo(-L, 0); c.lineTo(L, 0); c.strokeStyle = rgba(pal.bright, 0.35); c.lineWidth = wS * 2.6; c.stroke();
        clPole(c, h, -L, 0, L, 0, wS, nbCloth(c, 0, -wS, 0, wS, CL_IRON));
        c.beginPath(); c.moveTo(-L * 0.16, 0); c.lineTo(L * 0.16, 0); c.strokeStyle = pal.bright; c.lineWidth = wS * 0.5; c.stroke();
        for (const e of [-1, 1]) {
          h.rr(e > 0 ? L * 0.82 : -L, -wS * 0.75, L * 0.18, wS * 1.5, wS * 0.3); fillInk(nbCloth(c, 0, -wS, 0, wS, CL_GOLD), 1.4);
          c.beginPath(); c.moveTo(e * L * 0.86, -wS * 0.75); c.lineTo(e * L * 0.86, wS * 0.75); c.moveTo(e * L * 0.95, -wS * 0.75); c.lineTo(e * L * 0.95, wS * 0.75);
          c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.8, wS * 0.22); c.stroke();
          wkGlow(c, e * L * 0.91, 0, wS * 1.6, CL_SUN, 0.5 + 0.3 * p);
        }
        c.restore();
        olHand(c, h, GX, GY, Math.max(2, r * 0.055), CL_FUR);
        c.restore();
      },

      /* The Bull Demon King (Niu Mowang), Great Sage Who Pacifies Heaven — a black-hided bull head with burning eyes
         and a gold nose ring snorting jets of fire, under a black iron helm crowned by massive sweeping ox horns;
         broad layered pauldrons, iron lamellar armour with side-coloured lacing and a side-lined war cloak; he plants a
         mountain-crushing stance on cracking, ember-lit ground and raises twin crescent battle axes. */
      juggernaut(c, pal, r, ts, h) {
        const { fillInk, pulse } = h;
        const p = pulse(170), lift = ts ? Math.sin(ts / 600) * r * 0.035 : 0, snort = ts ? Math.pow(Math.max(0, Math.sin(ts / 450)), 2) : 0.6;
        // cracked, ember-lit earth
        c.beginPath(); c.ellipse(0, r * 0.94, r * 0.95, r * 0.13, 0, 0, TAU); c.fillStyle = rgba(pal.deep, 0.55); c.fill();
        c.save(); c.globalCompositeOperation = "lighter";
        c.beginPath();
        for (let i = 0; i < 7; i++) {
          const a = Math.PI * (0.05 + 0.9 * i / 6), sx = i < 3.5 ? -1 : 1, x0 = sx * r * 0.36;
          let x = x0, y = r * 0.92; c.moveTo(x, y);
          for (let k = 1; k <= 3; k++) { x = x0 + Math.cos(a) * r * 0.2 * k * (0.9 + 0.2 * heroHash(i * 3 + k)); y = r * 0.92 + Math.sin(a) * r * 0.045 * k * (heroHash(i + k) - 0.3); c.lineTo(Math.max(-r * 1.0, Math.min(r * 1.0, x)), y); }
        }
        c.strokeStyle = rgba(pal.bright, 0.55 + 0.3 * p); c.lineWidth = Math.max(0.8, r * 0.025); c.stroke();
        c.restore();
        for (let i = 0; i < 5; i++) {   // kicked-up rubble & dust
          const t = ts ? (ts / 1100 + i / 5) % 1 : (i + 0.5) / 5, sx = i % 2 ? 1 : -1;
          const x = sx * r * (0.42 + 0.4 * t), y = r * (0.92 - 0.3 * Math.sin(Math.PI * t));
          c.beginPath(); c.arc(x, y, r * 0.03 * (1 - t * 0.5), 0, TAU); c.fillStyle = rgba("#8a7a70", 0.9 * (1 - t)); c.fill();
          c.beginPath(); c.arc(x * 0.9, r * 0.9, r * 0.08 * t + 1, 0, TAU); c.fillStyle = rgba("#c8b8a8", 0.25 * (1 - t)); c.fill();
        }
        // war cloak, lined in the side colour
        c.beginPath(); c.moveTo(-r * 0.36, -r * 0.34); c.quadraticCurveTo(-r * 0.8, r * 0.2, -r * 0.72, r * 0.82);
        c.lineTo(r * 0.72, r * 0.82); c.quadraticCurveTo(r * 0.8, r * 0.2, r * 0.36, -r * 0.34); c.closePath();
        fillInk(nbCloth(c, -r * 0.7, 0, r * 0.7, 0, [pal.bright, pal.deep, pal.bright]), 2);
        c.beginPath(); c.moveTo(-r * 0.6, r * 0.82); c.quadraticCurveTo(-r * 0.66, r * 0.3, -r * 0.4, -r * 0.2); c.lineTo(r * 0.4, -r * 0.2); c.quadraticCurveTo(r * 0.66, r * 0.3, r * 0.6, r * 0.82); c.closePath();
        c.fillStyle = nbCloth(c, 0, -r * 0.2, 0, r * 0.82, [CL_IRON[1], "#1a1418", "#050305"]); c.fill();
        // legs in a wide horse stance
        clLegs(c, h, pal, r * 0.3, r * 0.9, r * 0.18, r * 0.44, Math.max(4, r * 0.15), CL_IRON, CL_IRON);
        // lamellar tassets
        for (const sx of [-1, 1]) {
          const tas = () => { c.beginPath(); c.moveTo(sx * r * 0.04, r * 0.12); c.lineTo(sx * r * 0.42, r * 0.12); c.lineTo(sx * r * 0.5, r * 0.5); c.lineTo(sx * r * 0.08, r * 0.48); c.closePath(); };
          tas(); fillInk(nbCloth(c, 0, r * 0.12, 0, r * 0.5, CL_IRON), 1.6);
          c.save(); tas(); c.clip();
          c.beginPath(); for (let k = 1; k < 5; k++) { const y = r * (0.12 + 0.076 * k); c.moveTo(-r * 0.52, y); c.lineTo(r * 0.52, y); }
          c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.7, r * 0.015); c.stroke();
          c.restore();
          c.beginPath(); c.moveTo(sx * r * 0.5, r * 0.5); c.lineTo(sx * r * 0.08, r * 0.48); c.strokeStyle = pal.gold; c.lineWidth = Math.max(1, r * 0.025); c.stroke();
        }
        h.rr(-r * 0.09, r * 0.12, r * 0.18, r * 0.4, r * 0.03); fillInk(clRobeGrad(c, pal, 0, r * 0.12, 0, r * 0.52), 1.4);
        // massive iron torso
        egTorso(c, h, 0, -r * 0.36, r * 0.16, r * 0.44, r * 0.32, CL_IRON);
        c.save(); c.beginPath(); c.moveTo(-r * 0.44, -r * 0.3); c.lineTo(r * 0.44, -r * 0.3); c.lineTo(r * 0.32, r * 0.16); c.lineTo(-r * 0.32, r * 0.16); c.closePath(); c.clip();
        c.beginPath();
        for (let k = 0; k < 7; k++) { const y = -r * 0.26 + k * r * 0.06; c.moveTo(-r * 0.44, y); c.lineTo(r * 0.44, y); }
        c.strokeStyle = rgba(pal.bright, 0.6); c.lineWidth = Math.max(0.6, r * 0.012); c.stroke();
        c.restore();
        for (const sx of [-1, 1]) clMirror(c, h, pal, sx * r * 0.16, -r * 0.16, r * 0.085);
        // belt with a gold beast-head buckle
        h.rr(-r * 0.36, r * 0.06, r * 0.72, r * 0.1, r * 0.03); fillInk(clRobeGrad(c, pal, 0, r * 0.06, 0, r * 0.16), 1.6);
        c.beginPath(); c.arc(0, r * 0.11, r * 0.08, 0, TAU); fillInk(nbCloth(c, 0, r * 0.03, 0, r * 0.19, CL_GOLD), 1.4);
        c.fillStyle = CL_GOLD[2];
        for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 0.03, r * 0.09, r * 0.014, 0, TAU); c.fill(); }
        c.beginPath(); c.moveTo(-r * 0.04, r * 0.14); c.lineTo(r * 0.04, r * 0.14); c.strokeStyle = CL_GOLD[2]; c.lineWidth = Math.max(0.7, r * 0.015); c.stroke();
        // arms raising the twin crescent axes
        for (const sx of [-1, 1]) {
          const fx = sx * r * 0.68, fy = -r * 0.16 - lift * (sx > 0 ? 1 : -1), ex = sx * r * 0.66, ey = r * 0.04;
          heroLimb(c, h, sx * r * 0.42, -r * 0.24, sx * r * 0.6, -r * 0.12, ex, ey, Math.max(4, r * 0.14), nbCloth(c, sx * r * 0.4, 0, sx * r * 0.7, 0, CL_HIDE));
          heroLimb(c, h, ex, ey, ex + sx * r * 0.04, ey - r * 0.08, fx, fy, Math.max(4, r * 0.13), nbCloth(c, sx * r * 0.6, 0, sx * r * 0.75, 0, CL_HIDE));
          c.beginPath(); c.moveTo(ex - r * 0.07, ey - r * 0.06); c.lineTo(ex + r * 0.07, ey - r * 0.06); c.strokeStyle = h.INK; c.lineWidth = r * 0.05 + 1.8; c.stroke(); c.strokeStyle = pal.bright; c.lineWidth = r * 0.05; c.stroke();
          // axe: haft, crescent blade, back spike
          const hx0 = sx * r * 0.64, hy0 = fy + r * 0.32, hx1 = sx * r * 0.74, hy1 = fy - r * 0.46;
          clPole(c, h, hx0, hy0, hx1, hy1, Math.max(2.4, r * 0.05), nbCloth(c, hx0, 0, hx0 + r * 0.04, 0, CL_IRON));
          const bx = sx * r * 0.74, by = fy - r * 0.36, a0 = sx > 0 ? -1.1 : Math.PI - 1.1, a1 = sx > 0 ? 1.1 : Math.PI + 1.1;
          const blade = () => {
            c.beginPath(); c.arc(bx, by, r * 0.28, a0, a1);
            c.arc(bx - sx * r * 0.06, by, r * 0.18, a1 - sx * 0.05, a0 + sx * 0.05, true); c.closePath();
          };
          c.save(); c.globalCompositeOperation = "lighter";
          c.beginPath(); c.arc(bx, by, r * 0.27, a0 + 0.1, a1 - 0.1); c.strokeStyle = rgba(pal.bright, 0.35 + 0.35 * p); c.lineWidth = Math.max(2, r * 0.07); c.stroke();
          c.restore();
          blade(); fillInk(nbCloth(c, bx - r * 0.25, by - r * 0.25, bx + r * 0.25, by + r * 0.25, CL_SILVER), 1.8);
          c.beginPath(); c.arc(bx, by, r * 0.26, a0 + 0.08, a1 - 0.08); c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.8, r * 0.02); c.stroke();
          c.beginPath(); c.moveTo(bx, by - r * 0.06); c.lineTo(bx - sx * r * 0.16, by - r * 0.02); c.lineTo(bx, by + r * 0.06); c.closePath(); fillInk(CL_SILVER[1], 1.2);
          c.beginPath(); c.arc(hx1, hy1, r * 0.035, 0, TAU); fillInk(pal.gold, 1);
          clTassel(c, h, pal, ts, sx * r * 0.705, fy - r * 0.08, r * 0.14, sx * 0.3, sx);
          olHand(c, h, fx, fy, Math.max(3, r * 0.075), CL_HIDE);
        }
        // broad shoulder plates
        for (const sx of [-1, 1]) clPauldron(c, h, pal, sx * r * 0.42, -r * 0.3, r * 0.2, r * 0.12, CL_IRON);
        // ---- head ----
        const HX = 0, HY = -r * 0.5;
        // horns sweeping out and up from the iron helm
        for (const sx of [-1, 1]) {
          const pts = [];
          for (let i = 0; i <= 14; i++) {
            const t = i / 14, u = 1 - t;
            pts.push([u * u * u * (sx * r * 0.16) + 3 * u * u * t * (sx * r * 0.5) + 3 * u * t * t * (sx * r * 0.72) + t * t * t * (sx * r * 0.6),
                      u * u * u * (-r * 0.66) + 3 * u * u * t * (-r * 0.66) + 3 * u * t * t * (-r * 0.86) + t * t * t * (-r * 1.12)]);
          }
          clRibbon(c, h, pts, t => Math.max(1.5, r * 0.13 * (1 - t * 0.9)), CL_HORN, 1.8);
          c.beginPath();
          for (const i of [3, 4]) { const a = pts[i - 1], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, w = r * 0.06; c.moveTo(pts[i][0] - dy / l * w, pts[i][1] + dx / l * w); c.lineTo(pts[i][0] + dy / l * w, pts[i][1] - dx / l * w); }
          c.strokeStyle = h.INK; c.lineWidth = r * 0.03 + 1.6; c.stroke(); c.strokeStyle = pal.gold; c.lineWidth = r * 0.03; c.stroke();
          const tip = pts[pts.length - 1];
          wkGlow(c, tip[0], tip[1], r * 0.08, pal.bright, 0.45 + 0.35 * p);
        }
        // shaggy mane behind the head
        c.beginPath();
        for (let i = 0; i <= 14; i++) {
          const a = Math.PI * 0.85 + i / 14 * Math.PI * 1.3, rad = r * (i % 2 ? 0.22 : 0.3);
          const x = HX + Math.cos(a) * rad, y = HY + r * 0.04 + Math.sin(a) * rad * 0.8;
          if (i) c.lineTo(x, y); else c.moveTo(x, y);
        }
        c.closePath(); fillInk(nbCloth(c, 0, HY - r * 0.3, 0, HY + r * 0.2, CL_HAIR), 1.4);
        // ears
        for (const sx of [-1, 1]) { olLeaf(c, HX + sx * r * 0.14, HY - r * 0.06, r * 0.18, r * 0.06, sx > 0 ? 0.25 : Math.PI - 0.25); fillInk(nbCloth(c, HX, HY, HX + sx * r * 0.3, HY, CL_HIDE), 1.3); }
        // bull face
        const face = () => {
          c.beginPath(); c.moveTo(HX - r * 0.17, HY - r * 0.1);
          c.quadraticCurveTo(HX - r * 0.19, HY + r * 0.08, HX - r * 0.13, HY + r * 0.16);
          c.quadraticCurveTo(HX, HY + r * 0.24, HX + r * 0.13, HY + r * 0.16);
          c.quadraticCurveTo(HX + r * 0.19, HY + r * 0.08, HX + r * 0.17, HY - r * 0.1); c.closePath();
        };
        face(); fillInk(nbCloth(c, HX - r * 0.2, HY - r * 0.1, HX + r * 0.2, HY + r * 0.2, CL_HIDE), 1.8);
        c.beginPath(); c.ellipse(HX, HY + r * 0.14, r * 0.12, r * 0.075, 0, 0, TAU); fillInk(nbCloth(c, HX, HY + r * 0.07, HX, HY + r * 0.21, CL_MUZZLE), 1.4);
        c.fillStyle = "#1a0e0c";
        for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(HX + sx * r * 0.05, HY + r * 0.13, r * 0.022, r * 0.032, sx * 0.4, 0, TAU); c.fill(); }
        // fiery snort
        for (const sx of [-1, 1]) {
          clFlame(c, HX + sx * r * 0.06, HY + r * 0.16, r * (0.08 + 0.16 * snort), r * 0.06, sx * 2.5, ts, sx + 3);
          c.beginPath(); c.arc(HX + sx * r * (0.18 + 0.1 * snort), HY + r * (0.24 + 0.06 * snort), r * 0.04 * (0.5 + snort), 0, TAU);
          c.fillStyle = rgba("#d8d0d0", 0.35 * snort); c.fill();
        }
        // gold nose ring with a side jewel
        c.beginPath(); c.arc(HX, HY + r * 0.2, r * 0.045, 0.2, Math.PI - 0.2); c.strokeStyle = h.INK; c.lineWidth = r * 0.02 + 1.6; c.stroke(); c.strokeStyle = CL_GOLD[1]; c.lineWidth = r * 0.02; c.stroke();
        c.beginPath(); c.arc(HX, HY + r * 0.245, r * 0.016, 0, TAU); c.fillStyle = pal.bright; c.fill();
        // burning eyes
        for (const sx of [-1, 1]) {
          const ex = HX + sx * r * 0.085, ey = HY - r * 0.02;
          wkGlow(c, ex, ey, r * 0.08, pal.bright, 0.7 + 0.25 * p);
          c.beginPath(); c.moveTo(ex - sx * r * 0.05, ey - r * 0.015); c.lineTo(ex + sx * r * 0.045, ey - r * 0.035); c.lineTo(ex + sx * r * 0.02, ey + r * 0.015); c.closePath();
          c.fillStyle = CL_FIRE_CORE; c.fill(); c.strokeStyle = h.INK; c.lineWidth = 1.2; c.stroke();
        }
        // black iron ox-horned helm
        const helm = () => {
          c.beginPath(); c.moveTo(HX - r * 0.21, HY - r * 0.06);
          c.quadraticCurveTo(HX - r * 0.22, HY - r * 0.28, HX, HY - r * 0.3);
          c.quadraticCurveTo(HX + r * 0.22, HY - r * 0.28, HX + r * 0.21, HY - r * 0.06);
          c.quadraticCurveTo(HX, HY - r * 0.12, HX - r * 0.21, HY - r * 0.06); c.closePath();
        };
        helm(); fillInk(nbCloth(c, HX - r * 0.2, HY - r * 0.3, HX + r * 0.2, HY, CL_IRON), 1.8);
        c.beginPath(); c.moveTo(HX - r * 0.2, HY - r * 0.07); c.quadraticCurveTo(HX, HY - r * 0.13, HX + r * 0.2, HY - r * 0.07);
        c.strokeStyle = pal.bright; c.lineWidth = Math.max(1, r * 0.03); c.stroke();
        c.beginPath(); c.moveTo(HX, HY - r * 0.3); c.lineTo(HX, HY - r * 0.12); c.strokeStyle = pal.gold; c.lineWidth = Math.max(1, r * 0.025); c.stroke();
        c.beginPath(); c.arc(HX, HY - r * 0.16, r * 0.035, 0, TAU); fillInk(pal.bright, 1);
      },

      /* Erlang Shen (Yang Jian), Illustrious Sage & True Lord of the Three-Eyed Insight — silver-and-gold armour over
         side-coloured silk with a billowing war cape, a three-peaked phoenix-winged cap and a vertical divine third
         eye that blazes with searching light; he grips the three-pointed, double-edged blade (sanjian liangren dao)
         with its silk tassel while Xiaotian, his celestial hound, bounds as a spirit along a glowing crescent moon. */
      trickster(c, pal, r, ts, h) {
        const { fillInk, pulse } = h;
        const p = pulse(220), q = pulse(130, 1.2), run = ts ? ts / 140 : 0;
        // Xiaotian spirit-hound crescent
        const MX = -r * 0.6, MY = r * 0.42, MR = r * 0.4;
        c.save(); c.globalCompositeOperation = "lighter";
        c.beginPath(); c.arc(MX, MY, MR, 0, TAU); c.arc(MX + MR * 0.36, MY - MR * 0.28, MR * 0.86, 0, TAU, true);
        const mg = c.createRadialGradient(MX - MR * 0.3, MY + MR * 0.3, MR * 0.1, MX, MY, MR);
        mg.addColorStop(0, rgba("#ffffff", 0.7)); mg.addColorStop(0.5, rgba(pal.rim, 0.55)); mg.addColorStop(1, rgba(pal.bright, 0.2));
        c.fillStyle = mg; c.fill("evenodd");
        c.restore();
        c.save(); c.translate(MX - MR * 0.1, MY + MR * 0.32 + (ts ? Math.sin(run) * r * 0.02 : 0)); c.rotate(-0.35);
        c.globalAlpha = 0.85;
        const hs = r * 0.11, legs = ts ? Math.sin(run) * 0.6 : 0.3;
        c.beginPath(); c.ellipse(0, 0, hs * 1.3, hs * 0.5, 0, 0, TAU);
        c.moveTo(hs * 1.9, -hs * 0.55); c.ellipse(hs * 1.4, -hs * 0.55, hs * 0.5, hs * 0.38, -0.2, 0, TAU);
        c.fillStyle = nbCloth(c, -hs * 1.4, 0, hs * 1.9, 0, [rgba(pal.bright, 0.3), rgba(pal.rim, 0.75), "rgba(255,255,255,0.9)"]); c.fill();
        c.beginPath(); c.moveTo(hs * 1.75, -hs * 0.62); c.lineTo(hs * 2.2, -hs * 0.45); c.lineTo(hs * 1.8, -hs * 0.35);
        c.moveTo(hs * 1.2, -hs * 0.85); c.lineTo(hs * 1.05, -hs * 1.35); c.lineTo(hs * 1.4, -hs * 0.9);
        c.fillStyle = "rgba(255,255,255,0.85)"; c.fill();
        c.beginPath();
        for (const [lx, ph] of [[-hs * 0.9, 0], [-hs * 0.6, 1], [hs * 0.6, 1], [hs * 0.9, 0]]) {
          const a = (ph ? 1 : -1) * legs; c.moveTo(lx, hs * 0.2); c.lineTo(lx + Math.sin(a) * hs * 0.8, hs * 0.2 + Math.cos(a) * hs * 0.8);
        }
        c.moveTo(-hs * 1.2, -hs * 0.1); c.quadraticCurveTo(-hs * 2.0, -hs * 0.6, -hs * 2.2, -hs * 1.1 + (ts ? Math.sin(run * 0.7) * hs * 0.2 : 0));
        c.strokeStyle = rgba(pal.rim, 0.85); c.lineWidth = Math.max(1, hs * 0.22); c.stroke();
        c.globalAlpha = 1;
        wkGlow(c, hs * 1.55, -hs * 0.62, hs * 0.35, pal.bright, 0.9);
        c.restore();
        // billowing war cape
        const cape = [];
        for (let i = 0; i <= 10; i++) { const t = i / 10; cape.push([r * 0.05 + t * r * 0.5 + (ts ? Math.sin(ts / 260 - t * 4) * r * 0.05 * t : 0), -r * 0.32 + t * r * 1.12]); }
        clRibbon(c, h, cape, t => r * (0.5 + t * 0.2), [pal.rim, clCloth(pal), pal.deep], 1.8);
        // legs and silver greaves
        clLegs(c, h, pal, r * 0.32, r * 0.92, r * 0.12, r * 0.2, Math.max(3, r * 0.11), clRobeGrad(c, pal, -r * 0.2, r * 0.3, r * 0.2, r * 0.9), CL_SILVER);
        // silk underskirt and silver scale tassets
        c.beginPath(); c.moveTo(-r * 0.28, r * 0.1); c.lineTo(r * 0.28, r * 0.1); c.lineTo(r * 0.34, r * 0.52); c.lineTo(-r * 0.34, r * 0.52); c.closePath();
        fillInk(clRobeGrad(c, pal, 0, r * 0.1, 0, r * 0.52), 1.6);
        for (const sx of [-1, 1]) {
          const tas = () => { c.beginPath(); c.moveTo(sx * r * 0.02, r * 0.1); c.lineTo(sx * r * 0.3, r * 0.1); c.lineTo(sx * r * 0.34, r * 0.44); c.quadraticCurveTo(sx * r * 0.2, r * 0.48, sx * r * 0.04, r * 0.42); c.closePath(); };
          tas(); fillInk(nbCloth(c, 0, r * 0.1, 0, r * 0.46, CL_SILVER), 1.4);
          c.save(); tas(); c.clip(); clScales(c, -r * 0.36, r * 0.12, r * 0.36, r * 0.46, r * 0.07, rgba(CL_SILVER[2], 0.8), Math.max(0.6, r * 0.012)); c.restore();
          c.beginPath(); c.moveTo(sx * r * 0.34, r * 0.44); c.quadraticCurveTo(sx * r * 0.2, r * 0.48, sx * r * 0.04, r * 0.42); c.strokeStyle = CL_GOLD[1]; c.lineWidth = Math.max(1, r * 0.03); c.stroke();
        }
        // silver breastplate with gold trim
        egTorso(c, h, 0, -r * 0.36, r * 0.14, r * 0.3, r * 0.22, CL_SILVER);
        c.save(); c.beginPath(); c.rect(-r * 0.3, -r * 0.3, r * 0.6, r * 0.42); c.clip();
        clScales(c, -r * 0.3, -r * 0.08, r * 0.3, r * 0.12, r * 0.07, rgba(CL_GOLD[2], 0.6), Math.max(0.6, r * 0.012));
        c.restore();
        clMirror(c, h, pal, 0, -r * 0.18, r * 0.085);
        h.rr(-r * 0.24, r * 0.04, r * 0.48, r * 0.09, r * 0.03); fillInk(nbCloth(c, 0, r * 0.04, 0, r * 0.13, CL_JADE), 1.4);
        for (let k = -2; k <= 2; k++) { c.beginPath(); c.arc(k * r * 0.09, r * 0.085, r * 0.022, 0, TAU); c.fillStyle = k ? pal.bright : pal.gold; c.fill(); }
        for (const sx of [-1, 1]) clPauldron(c, h, pal, sx * r * 0.29, -r * 0.3, r * 0.12, r * 0.08, CL_GOLD);
        // left arm: sword-finger gesture toward the hound
        clArm(c, h, pal, -r * 0.3, -r * 0.26, -r * 0.48, -r * 0.18, -r * 0.5, r * 0.04, Math.max(3, r * 0.1), CL_SILVER, CL_SKIN);
        c.beginPath(); c.moveTo(-r * 0.52, r * 0.07); c.lineTo(-r * 0.6, r * 0.16); c.strokeStyle = h.INK; c.lineWidth = Math.max(2, r * 0.03) + 1.4; c.stroke(); c.strokeStyle = CL_SKIN[1]; c.lineWidth = Math.max(2, r * 0.03); c.stroke();
        wkGlow(c, -r * 0.6, r * 0.16, r * 0.07, pal.bright, 0.5 + 0.4 * q);
        // three-pointed double-edged blade
        const PX = r * 0.54, pTop = -r * 0.8, pBot = r * 0.92;
        clPole(c, h, PX - r * 0.02, pBot, PX, pTop, Math.max(2.2, r * 0.045), nbCloth(c, PX - r * 0.03, 0, PX + r * 0.03, 0, [pal.rim, pal.deep, pal.deep]));
        c.beginPath(); for (let k = 1; k < 6; k++) { const y = pBot + (pTop - pBot) * k / 6; c.moveTo(PX - r * 0.03, y); c.lineTo(PX + r * 0.03, y); }
        c.strokeStyle = pal.gold; c.lineWidth = Math.max(0.8, r * 0.018); c.stroke();
        c.save(); c.globalCompositeOperation = "lighter";
        c.beginPath(); c.moveTo(PX, pTop); c.lineTo(PX, -r * 1.12); c.strokeStyle = rgba(pal.bright, 0.3 + 0.25 * p); c.lineWidth = r * 0.2; c.stroke();
        c.restore();
        const blade = () => {
          c.beginPath(); c.moveTo(PX - r * 0.05, pTop - r * 0.02); c.lineTo(PX - r * 0.085, -r * 0.98);
          c.lineTo(PX - r * 0.12, -r * 1.08); c.lineTo(PX - r * 0.04, -r * 1.02); c.lineTo(PX, -r * 1.17);
          c.lineTo(PX + r * 0.04, -r * 1.02); c.lineTo(PX + r * 0.12, -r * 1.08); c.lineTo(PX + r * 0.085, -r * 0.98);
          c.lineTo(PX + r * 0.05, pTop - r * 0.02); c.closePath();
        };
        blade(); fillInk(nbCloth(c, PX - r * 0.1, 0, PX + r * 0.1, 0, CL_SILVER), 1.5);
        c.beginPath(); c.moveTo(PX, pTop - r * 0.04); c.lineTo(PX, -r * 1.08); c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.8, r * 0.02); c.stroke();
        const gl = ts ? (ts / 900) % 1 : 0.5;
        wkSparkle(c, PX, pTop - r * 0.04 - gl * r * 0.3, r * 0.04, "#ffffff", 0, 0.9);
        h.rr(PX - r * 0.08, pTop - r * 0.03, r * 0.16, r * 0.06, r * 0.02); fillInk(nbCloth(c, PX, pTop - r * 0.03, PX, pTop + r * 0.03, CL_GOLD), 1.2);
        c.beginPath(); c.arc(PX, pTop, r * 0.022, 0, TAU); c.fillStyle = pal.bright; c.fill();
        clTassel(c, h, pal, ts, PX, pTop + r * 0.03, r * 0.16, -0.2, 2);
        clArm(c, h, pal, r * 0.3, -r * 0.26, r * 0.5, -r * 0.2, PX, -r * 0.08, Math.max(3, r * 0.1), CL_SILVER, CL_SKIN);
        // head
        const HX = 0, HY = -r * 0.55, HS = r * 0.15;
        c.beginPath(); c.ellipse(HX, HY + HS * 0.1, HS * 0.95, HS * 1.12, 0, 0, TAU); fillInk(nbCloth(c, HX, HY - HS, HX, HY + HS, CL_HAIR), 1.4);
        clFace(c, h, HX, HY, HS, { mouth: "stern", iris: "#1a1410", brow: "#14101a" });
        // three-peaked phoenix-winged cap
        const CB = HY - HS * 0.72;
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(HX + sx * HS * 0.7, CB); c.quadraticCurveTo(HX + sx * HS * 1.5, CB - HS * 0.1, HX + sx * HS * 2.1, CB - HS * 1.0);
          c.quadraticCurveTo(HX + sx * HS * 1.4, CB - HS * 0.45, HX + sx * HS * 0.7, CB - HS * 0.4); c.closePath();
          fillInk(nbCloth(c, HX, CB - HS, HX + sx * HS * 2, CB, CL_GOLD), 1.2);
          c.beginPath(); c.moveTo(HX + sx * HS * 0.9, CB - HS * 0.2); c.quadraticCurveTo(HX + sx * HS * 1.5, CB - HS * 0.25, HX + sx * HS * 1.9, CB - HS * 0.8);
          c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.8, HS * 0.1); c.stroke();
        }
        c.beginPath(); c.moveTo(HX - HS * 0.82, CB + HS * 0.1);
        c.lineTo(HX - HS * 0.7, CB - HS * 0.8); c.lineTo(HX - HS * 0.4, CB - HS * 0.45); c.lineTo(HX, CB - HS * 1.3);
        c.lineTo(HX + HS * 0.4, CB - HS * 0.45); c.lineTo(HX + HS * 0.7, CB - HS * 0.8); c.lineTo(HX + HS * 0.82, CB + HS * 0.1); c.closePath();
        fillInk(nbCloth(c, HX, CB - HS * 1.3, HX, CB, CL_SILVER), 1.4);
        h.rr(HX - HS * 0.86, CB - HS * 0.08, HS * 1.72, HS * 0.22, HS * 0.06); fillInk(nbCloth(c, 0, CB - HS * 0.08, 0, CB + HS * 0.14, CL_GOLD), 1.2);
        c.beginPath(); c.arc(HX, CB - HS * 0.6, HS * 0.13, 0, TAU); fillInk(pal.bright, 1);
        // vertical third eye of divine insight — drawn after the cap at open-forehead height so the eye and its
        // radiance stay fully visible over the crown
        const TX = HX, TY = HY - HS * 0.4;
        c.save(); c.globalCompositeOperation = "lighter";
        c.beginPath();
        for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.2; c.moveTo(TX, TY); c.lineTo(TX + Math.cos(a) * r * (0.32 + 0.08 * p), TY + Math.sin(a) * r * (0.32 + 0.08 * p)); }
        c.strokeStyle = rgba(pal.bright, 0.25 + 0.2 * q); c.lineWidth = Math.max(0.8, r * 0.02); c.stroke();
        c.restore();
        wkGlow(c, TX, TY, HS * 0.6, pal.bright, 0.65 + 0.3 * q);
        c.save(); c.translate(TX, TY); c.rotate(Math.PI / 2);
        olAlmond(c, 0, 0, HS * 0.2, HS * 0.07); c.fillStyle = pal.rim; c.fill(); c.strokeStyle = h.INK; c.lineWidth = Math.max(0.7, HS * 0.07); c.stroke();
        c.beginPath(); c.arc(0, 0, HS * 0.05, 0, TAU); c.fillStyle = "#ffffff"; c.fill();
        c.restore();
      },

      /* Nezha, the Third Lotus Prince — a fierce child reborn of lotus, twin topknots bound with side-coloured ribbons,
         a cinnabar brow mark, red silk bib and lotus-petal skirt; he rides twin spinning Wind-Fire Wheels wreathed in
         flame rings, hurls the golden Universe Ring (qiankun quan) and levels the Fire-Tipped Spear, while the
         Red Armillary Sash (huntian ling) loops and billows around him. */
      wildrider(c, pal, r, ts, h) {
        const { fillInk, pulse } = h;
        const p = pulse(150), bob = ts ? Math.sin(ts / 300) * r * 0.02 : 0;
        const SASH = ["#ff8a7a", "#e3243a", "#6a0818"];
        // armillary sash loop: build the full loop, draw the far half behind the body
        const loop = (from, to) => {
          const pts = [];
          for (let i = 0; i <= 20; i++) {
            const th = from + (to - from) * i / 20, wob = 1 + (ts ? 0.05 * Math.sin(2 * th + ts / 400) : 0);
            const lx = Math.cos(th) * r * 0.8 * wob, ly = Math.sin(th) * r * 0.28 * wob, rot = -0.32;
            pts.push([lx * Math.cos(rot) - ly * Math.sin(rot), -r * 0.08 + lx * Math.sin(rot) + ly * Math.cos(rot) + bob]);
          }
          return pts;
        };
        const sashW = t => Math.max(2, r * (0.07 + 0.025 * Math.sin(t * 9 + (ts || 0) / 200)));
        const glowSash = pts => {
          c.save(); c.globalCompositeOperation = "lighter";
          c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const q of pts) c.lineTo(q[0], q[1]);
          c.strokeStyle = rgba(pal.bright, 0.3); c.lineWidth = r * 0.16; c.stroke();
          c.restore();
        };
        const back = loop(Math.PI, TAU);
        glowSash(back); clRibbon(c, h, back, sashW, SASH, 1.2);
        // trailing sash ends
        const tail = [];
        for (let i = 0; i <= 12; i++) { const t = i / 12; tail.push([-r * 0.74 - t * r * 0.36, r * 0.12 + t * r * 0.5 + (ts ? Math.sin(ts / 170 - t * 7) * r * 0.06 * t : r * 0.03) + bob]); }
        glowSash(tail); clRibbon(c, h, tail, t => Math.max(1.5, r * 0.07 * (1 - t * 0.5)), SASH, 1.2);
        // twin Wind-Fire Wheels
        clWheel(c, h, pal, ts, -r * 0.3, r * 0.86, r * 0.18, 1, 0.3);
        clWheel(c, h, pal, ts, r * 0.3, r * 0.86, r * 0.18, 1, 1.7);
        c.save(); c.translate(0, bob);
        // bare child legs with gold anklets
        for (const sx of [-1, 1]) {
          heroLimb(c, h, sx * r * 0.12, r * 0.34, sx * r * 0.26, r * 0.5, sx * r * 0.3, r * 0.64, Math.max(3, r * 0.1), nbCloth(c, -r * 0.3, 0, r * 0.3, 0, CL_SKIN));
          c.beginPath(); c.moveTo(sx * r * 0.25, r * 0.6); c.lineTo(sx * r * 0.35, r * 0.6); c.strokeStyle = h.INK; c.lineWidth = r * 0.035 + 1.6; c.stroke(); c.strokeStyle = CL_GOLD[1]; c.lineWidth = r * 0.035; c.stroke();
          c.beginPath(); c.ellipse(sx * r * 0.31, r * 0.67, r * 0.07, r * 0.035, 0, 0, TAU); fillInk(CL_SKIN[1], 1.1);
        }
        // lotus-leaf and lotus-petal skirt
        c.beginPath(); c.moveTo(-r * 0.22, r * 0.06); c.quadraticCurveTo(-r * 0.4, r * 0.3, -r * 0.3, r * 0.4); c.quadraticCurveTo(0, r * 0.48, r * 0.3, r * 0.4); c.quadraticCurveTo(r * 0.4, r * 0.3, r * 0.22, r * 0.06); c.closePath();
        fillInk(nbCloth(c, 0, r * 0.06, 0, r * 0.46, CL_LEAF), 1.6);
        for (let i = 0; i < 5; i++) {
          const a = Math.PI + (i - 2) * 0.36;
          clPetal(c, h, (i - 2) * r * 0.1, r * 0.1, r * 0.26, r * 0.08, a + (i - 2) * -0.14, nbCloth(c, 0, r * 0.1, 0, r * 0.36, [CL_LOTUS[0], CL_LOTUS[1], pal.bright]), 1);
        }
        // torso: red silk bib (dudou) trimmed in the side colour, gold necklace ring
        egTorso(c, h, 0, -r * 0.3, r * 0.12, r * 0.24, r * 0.2, CL_SKIN);
        c.beginPath(); c.moveTo(-r * 0.12, -r * 0.26); c.lineTo(r * 0.12, -r * 0.26); c.lineTo(r * 0.2, -r * 0.04); c.lineTo(0, r * 0.14); c.lineTo(-r * 0.2, -r * 0.04); c.closePath();
        fillInk(nbCloth(c, 0, -r * 0.26, 0, r * 0.14, CL_RED), 1.4);
        c.beginPath(); c.moveTo(-r * 0.2, -r * 0.04); c.lineTo(0, r * 0.14); c.lineTo(r * 0.2, -r * 0.04); c.strokeStyle = pal.bright; c.lineWidth = Math.max(1, r * 0.025); c.stroke();
        clCurl(c, 0, -r * 0.06, r * 0.05, 1, CL_GOLD[1], Math.max(0.7, r * 0.015));
        c.beginPath(); c.ellipse(0, -r * 0.27, r * 0.13, r * 0.06, 0, 0, Math.PI); c.strokeStyle = h.INK; c.lineWidth = r * 0.035 + 1.6; c.stroke(); c.strokeStyle = CL_GOLD[1]; c.lineWidth = r * 0.035; c.stroke();
        c.beginPath(); c.arc(0, -r * 0.2, r * 0.025, 0, TAU); fillInk(pal.bright, 1);
        // left arm brandishing the Universe Ring
        const RX = -r * 0.56, RY = -r * 0.36, RR = r * 0.13;
        clArm(c, h, pal, -r * 0.22, -r * 0.24, -r * 0.42, -r * 0.12, RX + RR * 0.7, RY + RR * 0.7, Math.max(3, r * 0.085), CL_SKIN, CL_SKIN, CL_GOLD[1]);
        wkGlow(c, RX, RY, RR * 1.7, pal.bright, 0.45 + 0.35 * p);
        c.beginPath(); c.arc(RX, RY, RR, 0, TAU); c.strokeStyle = h.INK; c.lineWidth = RR * 0.32 + 2.2; c.stroke();
        c.strokeStyle = nbCloth(c, RX - RR, RY - RR, RX + RR, RY + RR, CL_GOLD); c.lineWidth = RR * 0.32; c.stroke();
        c.beginPath(); c.arc(RX, RY, RR, (ts ? ts / 200 : 0), (ts ? ts / 200 : 0) + 1.2); c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.8, RR * 0.12); c.stroke();
        // Fire-Tipped Spear
        const S0 = [r * 0.12, r * 0.58], S1 = [r * 0.72, -r * 0.86], dx = S1[0] - S0[0], dy = S1[1] - S0[1], sl = Math.hypot(dx, dy), ux = dx / sl, uy = dy / sl;
        clPole(c, h, S0[0], S0[1], S1[0], S1[1], Math.max(2.2, r * 0.042), nbCloth(c, S0[0], S0[1], S1[0], S1[1], [pal.rim, pal.bright, pal.deep]));
        const TX = S1[0], TY = S1[1], ang = Math.atan2(uy, ux) + Math.PI / 2;
        for (let i = 0; i < 5; i++) clFlame(c, TX - ux * r * 0.04 + (i - 2) * -uy * r * 0.03, TY - uy * r * 0.04 + (i - 2) * ux * r * 0.03, r * (0.2 + 0.06 * (i % 2)), r * 0.09, ang + (i - 2) * 0.25, ts, i + 7);
        c.save(); c.translate(TX, TY); c.rotate(ang);
        c.beginPath(); c.moveTo(0, r * 0.04); c.quadraticCurveTo(-r * 0.06, -r * 0.06, 0, -r * 0.2); c.quadraticCurveTo(r * 0.06, -r * 0.06, 0, r * 0.04); c.closePath();
        fillInk(nbCloth(c, -r * 0.06, 0, r * 0.06, 0, CL_SILVER), 1.3);
        c.restore();
        clTassel(c, h, pal, ts, TX - ux * r * 0.06, TY - uy * r * 0.06, r * 0.13, 0.2, 5);
        clArm(c, h, pal, r * 0.22, -r * 0.24, r * 0.42, -r * 0.08, r * 0.4, r * 0.04, Math.max(3, r * 0.085), CL_SKIN, CL_SKIN, CL_GOLD[1]);
        // head: twin topknots, cinnabar mark
        const HX = 0, HY = -r * 0.5, HS = r * 0.19;
        for (const sx of [-1, 1]) {
          const kx = HX + sx * HS * 0.68, ky = HY - HS * 1.08;
          for (const k of [0, 1]) {
            const pts = [];
            for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([kx + sx * t * r * 0.16, ky + t * r * 0.14 + k * r * 0.04 + (ts ? Math.sin(ts / 150 + t * 5 + k) * r * 0.025 * t : 0)]); }
            clRibbon(c, h, pts, t => Math.max(1.2, r * 0.035 * (1 - t * 0.4)), [pal.rim, pal.bright, pal.deep], 1);
          }
          c.beginPath(); c.arc(kx, ky, HS * 0.38, 0, TAU); fillInk(nbCloth(c, kx - HS * 0.4, ky - HS * 0.4, kx + HS * 0.4, ky + HS * 0.4, CL_HAIR), 1.3);
          c.beginPath(); c.arc(kx, ky + HS * 0.3, HS * 0.12, 0, TAU); fillInk(CL_GOLD[1], 1);
        }
        clFace(c, h, HX, HY, HS, { mouth: "stern", mark: pal.bright, iris: "#1a1010", brow: "#1a1218" });
        c.beginPath(); c.moveTo(HX - HS * 0.76, HY - HS * 0.2); c.quadraticCurveTo(HX - HS * 0.7, HY - HS * 0.96, HX, HY - HS * 0.92);
        c.quadraticCurveTo(HX + HS * 0.7, HY - HS * 0.96, HX + HS * 0.76, HY - HS * 0.2); c.quadraticCurveTo(HX + HS * 0.4, HY - HS * 0.66, HX, HY - HS * 0.62);
        c.quadraticCurveTo(HX - HS * 0.4, HY - HS * 0.66, HX - HS * 0.76, HY - HS * 0.2); c.closePath();
        fillInk(nbCloth(c, HX, HY - HS, HX, HY - HS * 0.2, CL_HAIR), 1.3);
        wkGlow(c, HX, HY - HS * 0.48, HS * 0.25, pal.bright, 0.6);
        c.restore();
        // front half of the sash, crossing in front of the body
        const front = loop(0, Math.PI);
        glowSash(front); clRibbon(c, h, front, sashW, SASH, 1.2);
        for (let i = 0; i < 6; i++) {   // flying embers
          const t = ts ? (ts / 900 + i / 6) % 1 : (i + 0.5) / 6, x = r * (-0.55 + (i % 3) * 0.5 + Math.sin(i * 2 + t * 6) * 0.05);
          wkSparkle(c, x, r * (0.98 - 1.6 * t), r * 0.028, i % 2 ? pal.bright : CL_FIRE, t * 5, 0.85 * (1 - t));
        }
      },

      /* Heavenly Halberdier (Tianbing Tianjiang), soldier of the celestial host — mountain-pattern (shanwen) scale
         armour edged in the side colour, layered pauldrons and a chest mirror, a phoenix-winged helm with a swaying silk
         plume and a side-coloured war cape; he stands guard on an auspicious cloud dais, gripping a crescent-bladed ji
         halberd hung with a dragon-whisker tassel. */
      skirmisher(c, pal, r, ts, h) {
        const { fillInk, pulse } = h;
        const p = pulse(260), bob = ts ? Math.sin(ts / 800) * r * 0.012 : 0;
        clCloudBank(c, h, pal, ts, 0, r * 0.96, r * 0.8, r * 0.14, 11);
        c.save(); c.translate(0, bob);
        // war cape
        c.beginPath(); c.moveTo(-r * 0.3, -r * 0.32);
        c.quadraticCurveTo(-r * 0.62, r * 0.2, -r * 0.56 + (ts ? Math.sin(ts / 400) * r * 0.03 : 0), r * 0.78);
        c.lineTo(r * 0.4, r * 0.78); c.quadraticCurveTo(r * 0.5, r * 0.2, r * 0.3, -r * 0.32); c.closePath();
        fillInk(clRobeGrad(c, pal, -r * 0.6, 0, r * 0.4, 0), 1.8);
        clLegs(c, h, pal, r * 0.32, r * 0.88, r * 0.12, r * 0.18, Math.max(3, r * 0.11), clRobeGrad(c, pal, -r * 0.2, r * 0.3, r * 0.2, r * 0.9), CL_GOLD);
        // silk underskirt + front armour flaps
        c.beginPath(); c.moveTo(-r * 0.28, r * 0.1); c.lineTo(r * 0.28, r * 0.1); c.lineTo(r * 0.32, r * 0.5); c.lineTo(-r * 0.32, r * 0.5); c.closePath();
        fillInk(nbCloth(c, 0, r * 0.1, 0, r * 0.5, CL_RED), 1.4);
        for (const sx of [-1, 1]) {
          const flap = () => { c.beginPath(); c.moveTo(sx * r * 0.02, r * 0.1); c.lineTo(sx * r * 0.3, r * 0.1); c.lineTo(sx * r * 0.33, r * 0.48); c.lineTo(sx * r * 0.05, r * 0.46); c.closePath(); };
          flap(); fillInk(nbCloth(c, 0, r * 0.1, 0, r * 0.48, CL_GOLD), 1.4);
          c.save(); flap(); c.clip(); clMountainMail(c, -r * 0.34, r * 0.1, r * 0.34, r * 0.48, r * 0.09, rgba(CL_GOLD[2], 0.9), Math.max(0.6, r * 0.014)); c.restore();
          flap(); c.strokeStyle = pal.bright; c.lineWidth = Math.max(1, r * 0.025); c.stroke();
        }
        // mountain-pattern breastplate
        const chest = () => { c.beginPath(); c.moveTo(-r * 0.3, -r * 0.3); c.quadraticCurveTo(0, -r * 0.36, r * 0.3, -r * 0.3); c.lineTo(r * 0.24, r * 0.12); c.lineTo(-r * 0.24, r * 0.12); c.closePath(); };
        chest(); fillInk(nbCloth(c, -r * 0.3, -r * 0.3, r * 0.3, r * 0.12, CL_SILVER), 1.8);
        c.save(); chest(); c.clip(); clMountainMail(c, -r * 0.3, -r * 0.34, r * 0.3, r * 0.12, r * 0.09, rgba(CL_SILVER[2], 0.95), Math.max(0.6, r * 0.014)); c.restore();
        chest(); c.strokeStyle = pal.bright; c.lineWidth = Math.max(1, r * 0.03); c.stroke();
        clMirror(c, h, pal, 0, -r * 0.12, r * 0.09);
        h.rr(-r * 0.26, r * 0.05, r * 0.52, r * 0.09, r * 0.03); fillInk(clRobeGrad(c, pal, 0, r * 0.05, 0, r * 0.14), 1.4);
        c.beginPath(); c.arc(0, r * 0.095, r * 0.05, 0, TAU); fillInk(nbCloth(c, 0, r * 0.05, 0, r * 0.14, CL_GOLD), 1.2);
        for (const sx of [-1, 1]) clPauldron(c, h, pal, sx * r * 0.3, -r * 0.3, r * 0.13, r * 0.085, CL_GOLD);
        // left fist on the hip
        clArm(c, h, pal, -r * 0.32, -r * 0.24, -r * 0.5, -r * 0.04, -r * 0.27, r * 0.08, Math.max(3, r * 0.1), CL_SILVER, CL_SKIN);
        // crescent-bladed ji halberd
        const PX = r * 0.5, pTop = -r * 0.76, pBot = r * 0.9;
        clPole(c, h, PX, pBot, PX, pTop, Math.max(2.2, r * 0.045), nbCloth(c, PX - r * 0.03, 0, PX + r * 0.03, 0, [pal.bright, pal.deep, pal.deep]));
        c.beginPath();
        for (let k = 0; k < 8; k++) { const y = pBot + (pTop - pBot) * k / 8; c.moveTo(PX - r * 0.025, y); c.lineTo(PX + r * 0.025, y - r * 0.05); }
        c.strokeStyle = pal.gold; c.lineWidth = Math.max(0.8, r * 0.015); c.stroke();
        c.save(); c.globalCompositeOperation = "lighter";
        c.beginPath(); c.arc(PX + r * 0.06, -r * 0.88, r * 0.17, -1.2, 1.2); c.strokeStyle = rgba(pal.bright, 0.3 + 0.3 * p); c.lineWidth = r * 0.07; c.stroke();
        c.restore();
        c.beginPath(); c.moveTo(PX - r * 0.04, pTop); c.lineTo(PX - r * 0.04, -r * 1.0); c.lineTo(PX, -r * 1.16); c.lineTo(PX + r * 0.04, -r * 1.0); c.lineTo(PX + r * 0.04, pTop); c.closePath();
        fillInk(nbCloth(c, PX - r * 0.04, 0, PX + r * 0.04, 0, CL_SILVER), 1.3);
        c.beginPath(); c.arc(PX + r * 0.06, -r * 0.88, r * 0.17, -1.15, 1.15); c.arc(PX + r * 0.02, -r * 0.88, r * 0.11, 1.1, -1.1, true); c.closePath();
        fillInk(nbCloth(c, PX, -r * 1.04, PX + r * 0.22, -r * 0.72, CL_SILVER), 1.4);
        c.beginPath(); c.arc(PX + r * 0.06, -r * 0.88, r * 0.155, -1.05, 1.05); c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.8, r * 0.018); c.stroke();
        c.beginPath(); c.moveTo(PX - r * 0.04, -r * 0.9); c.quadraticCurveTo(PX - r * 0.14, -r * 0.92, PX - r * 0.15, -r * 1.02); c.quadraticCurveTo(PX - r * 0.1, -r * 0.88, PX - r * 0.04, -r * 0.84); c.closePath();
        fillInk(CL_SILVER[1], 1.1);
        h.rr(PX - r * 0.06, pTop - r * 0.02, r * 0.12, r * 0.05, r * 0.015); fillInk(CL_GOLD[1], 1.1);
        clTassel(c, h, pal, ts, PX, pTop + r * 0.03, r * 0.18, -0.15, 4);
        clArm(c, h, pal, r * 0.32, -r * 0.24, r * 0.5, -r * 0.2, PX, -r * 0.04, Math.max(3, r * 0.1), CL_SILVER, CL_SKIN);
        // head & phoenix-winged helm with silk plume
        const HX = 0, HY = -r * 0.52, HS = r * 0.145;
        clFace(c, h, HX, HY, HS, { mouth: "stern", iris: "#1a1410" });
        const CB = HY - HS * 0.45;
        const dome = () => { c.beginPath(); c.moveTo(HX - HS * 0.95, CB); c.quadraticCurveTo(HX - HS, CB - HS * 0.95, HX, CB - HS * 1.0); c.quadraticCurveTo(HX + HS, CB - HS * 0.95, HX + HS * 0.95, CB); c.closePath(); };
        for (const sx of [-1, 1]) {
          const flap = ts ? Math.sin(ts / 500 + sx) * HS * 0.06 : 0;
          c.beginPath(); c.moveTo(HX + sx * HS * 0.85, CB - HS * 0.2);
          c.quadraticCurveTo(HX + sx * HS * 1.7, CB - HS * 0.3, HX + sx * HS * 2.2, CB - HS * 1.5 + flap);
          c.quadraticCurveTo(HX + sx * HS * 1.55, CB - HS * 0.75, HX + sx * HS * 0.85, CB - HS * 0.6); c.closePath();
          fillInk(nbCloth(c, HX, CB, HX + sx * HS * 2.2, CB - HS * 1.5, CL_GOLD), 1.2);
          c.beginPath(); c.moveTo(HX + sx * HS * 1.0, CB - HS * 0.38); c.quadraticCurveTo(HX + sx * HS * 1.6, CB - HS * 0.48, HX + sx * HS * 2.0, CB - HS * 1.3 + flap);
          c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.8, HS * 0.1); c.stroke();
        }
        dome(); fillInk(nbCloth(c, HX - HS, CB - HS, HX + HS, CB, CL_SILVER), 1.5);
        h.rr(HX - HS * 1.0, CB - HS * 0.12, HS * 2.0, HS * 0.24, HS * 0.08); fillInk(nbCloth(c, 0, CB - HS * 0.12, 0, CB + HS * 0.12, CL_GOLD), 1.2);
        c.beginPath(); c.arc(HX, CB - HS * 0.5, HS * 0.15, 0, TAU); fillInk(pal.bright, 1);
        clPole(c, h, HX, CB - HS, HX, CB - HS * 1.55, Math.max(1.4, HS * 0.12), CL_GOLD[1]);
        const plume = [], sway = ts ? Math.sin(ts / 280) * r * 0.05 : r * 0.02;
        for (let i = 0; i <= 10; i++) { const t = i / 10; plume.push([HX + t * r * 0.2 + sway * t * t, CB - HS * 1.55 - Math.sin(t * Math.PI * 0.7) * r * 0.07 + t * r * 0.16]); }
        clRibbon(c, h, plume, t => Math.max(1.5, r * 0.07 * (1 - t * 0.6)), [pal.rim, pal.bright, pal.deep], 1.1);
        c.restore();
      },

      /* Hou Yi, the Divine Archer who shot down the suns — headband and topknot, archer's tunic in the side colour
         with leather bracers and a quiver of side-fletched arrows; he draws a great recurve bow loaded with an
         incandescent solar arrow whose blazing tip burns like a newborn sun, while eight conquered sun-embers
         smoulder in a slow orbit behind him. */
      harrower(c, pal, r, ts, h) {
        const { fillInk, pulse } = h;
        const p = pulse(120), spin = ts ? ts / 3800 : 0.4;
        // eight conquered suns orbiting behind
        for (let i = 0; i < 8; i++) {
          const a = spin + i * TAU / 8, x = r * 0.08 + Math.cos(a) * r * 0.92, y = -r * 0.36 + Math.sin(a) * r * 0.34, depth = 0.5 + 0.5 * Math.sin(a);
          clSun(c, h, pal, ts, x, y, r * (0.045 + 0.02 * depth), 0.25 + 0.25 * depth, i);
        }
        // quiver on the back with side-fletched arrows
        c.save(); c.translate(r * 0.2, -r * 0.12); c.rotate(0.38);
        for (let k = -1; k <= 1; k++) {
          clPole(c, h, k * r * 0.035, -r * 0.2, k * r * 0.045, -r * 0.4, Math.max(1, r * 0.015), CL_LEATHER[0]);
          olLeaf(c, k * r * 0.045, -r * 0.34, r * 0.1, r * 0.035, -Math.PI / 2); fillInk(pal.bright, 1);
        }
        h.rr(-r * 0.08, -r * 0.24, r * 0.16, r * 0.52, r * 0.05); fillInk(nbCloth(c, -r * 0.08, 0, r * 0.08, 0, CL_LEATHER), 1.5);
        c.beginPath(); c.moveTo(-r * 0.08, -r * 0.14); c.lineTo(r * 0.08, -r * 0.14); c.moveTo(-r * 0.08, r * 0.16); c.lineTo(r * 0.08, r * 0.16);
        c.strokeStyle = pal.bright; c.lineWidth = Math.max(1, r * 0.025); c.stroke();
        c.restore();
        // archer's stance
        for (const [x1, cx, x2, y2] of [[-r * 0.1, -r * 0.3, -r * 0.36, r * 0.88], [r * 0.1, r * 0.22, r * 0.3, r * 0.88]]) {
          heroLimb(c, h, x1, r * 0.34, cx, r * 0.6, x2, y2 - r * 0.08, Math.max(3, r * 0.1), nbCloth(c, -r * 0.3, 0, r * 0.3, 0, CL_LEATHER));
          h.rr(x2 - r * 0.07, y2 - r * 0.2, r * 0.14, r * 0.14, r * 0.03); fillInk(CL_LEATHER[2], 1.2);
          c.beginPath(); c.ellipse(x2 + Math.sign(x2) * r * 0.03, y2 - r * 0.04, r * 0.1, r * 0.04, 0, 0, TAU); fillInk(CL_LEATHER[2], 1.2);
          c.beginPath(); c.moveTo(x2 - r * 0.075, y2 - r * 0.19); c.lineTo(x2 + r * 0.075, y2 - r * 0.19); c.strokeStyle = pal.bright; c.lineWidth = Math.max(1, r * 0.025); c.stroke();
        }
        // knee-length archer's tunic
        clRobe(c, h, pal, 0, -r * 0.36, r * 0.46, r * 0.28, r * 0.36, clRobeGrad(c, pal, -r * 0.36, -r * 0.36, r * 0.36, r * 0.46), { hemK: 0.12 });
        clLapels(c, h, pal, 0, -r * 0.35, r * 0.26, r * 0.07, Math.max(2, r * 0.045));
        h.rr(-r * 0.27, r * 0.02, r * 0.54, r * 0.08, r * 0.03); fillInk(nbCloth(c, 0, r * 0.02, 0, r * 0.1, CL_LEATHER), 1.4);
        c.beginPath(); c.arc(0, r * 0.06, r * 0.04, 0, TAU); fillInk(pal.gold, 1);
        // aim geometry: nock N, bow grip B along the aim direction A
        const A = -2.75 + (ts ? Math.sin(ts / 1300) * 0.04 : 0), cA = Math.cos(A), sA = Math.sin(A);
        const NX = r * 0.16, NY = -r * 0.2, draw = r * (0.8 + (ts ? 0.02 * Math.sin(ts / 260) : 0));
        const BX = NX + cA * draw, BY = NY + sA * draw;
        // drawing (right) arm
        clArm(c, h, pal, r * 0.24, -r * 0.28, r * 0.44, -r * 0.3, NX, NY, Math.max(3, r * 0.095), CL_LEATHER, CL_SKIN, pal.bright);
        // bowstring (bow-local frame: +x toward the target) — drawn before the head so it passes cleanly behind the face
        const tipA = [-r * 0.16, -r * 0.52], tipB = [-r * 0.16, r * 0.52], nk = -draw;
        c.save(); c.translate(BX, BY); c.rotate(A);
        c.beginPath(); c.moveTo(tipA[0], tipA[1]); c.lineTo(nk, 0); c.lineTo(tipB[0], tipB[1]);
        c.strokeStyle = rgba(pal.rim, 0.95); c.lineWidth = Math.max(0.8, r * 0.012); c.stroke();
        c.restore();
        // head
        const HX = r * 0.02, HY = -r * 0.55, HS = r * 0.15;
        c.beginPath(); c.arc(HX, HY - HS * 1.05, HS * 0.38, 0, TAU); fillInk(nbCloth(c, HX, HY - HS * 1.4, HX, HY - HS * 0.7, CL_HAIR), 1.3);
        c.beginPath(); c.moveTo(HX, HY - HS * 1.5); c.lineTo(HX, HY - HS * 0.75); c.strokeStyle = h.INK; c.lineWidth = HS * 0.12 + 1.4; c.stroke(); c.strokeStyle = pal.gold; c.lineWidth = HS * 0.12; c.stroke();
        c.beginPath(); c.ellipse(HX, HY - HS * 0.1, HS * 0.92, HS * 1.06, 0, Math.PI, TAU); fillInk(nbCloth(c, HX, HY - HS, HX, HY, CL_HAIR), 1.3);
        clFace(c, h, HX, HY, HS, { mouth: "stern", iris: "#1a1410" });
        c.beginPath(); c.moveTo(HX - HS * 0.78, HY - HS * 0.42); c.quadraticCurveTo(HX, HY - HS * 0.62, HX + HS * 0.78, HY - HS * 0.42);
        c.strokeStyle = h.INK; c.lineWidth = HS * 0.18 + 1.6; c.stroke(); c.strokeStyle = pal.bright; c.lineWidth = HS * 0.18; c.stroke();
        for (const k of [0, 1]) {
          const pts = [];
          for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([HX + HS * 0.75 + t * r * 0.3, HY - HS * 0.45 + t * r * (0.1 + k * 0.06) + (ts ? Math.sin(ts / 160 + t * 6 + k) * r * 0.025 * t : 0)]); }
          clRibbon(c, h, pts, t => Math.max(1.2, r * 0.035 * (1 - t * 0.4)), [pal.rim, pal.bright, pal.deep], 1);
        }
        // bow arm
        clArm(c, h, pal, -r * 0.22, -r * 0.28, (BX - r * 0.22) / 2, (BY - r * 0.28) / 2 - r * 0.02, BX, BY, Math.max(3, r * 0.095), CL_LEATHER, CL_SKIN, pal.bright);
        // recurve bow and solar arrow (local frame: +x toward the target)
        c.save(); c.translate(BX, BY); c.rotate(A);
        const limb = sy => { c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-r * 0.02, sy * r * 0.2, -r * 0.2, sy * r * 0.38, -r * 0.16, sy * r * 0.52); c.quadraticCurveTo(-r * 0.12, sy * r * 0.58, -r * 0.04, sy * r * 0.6); };
        for (const sy of [-1, 1]) {
          limb(sy); c.strokeStyle = h.INK; c.lineWidth = r * 0.05 + 2.2; c.stroke();
          limb(sy); c.strokeStyle = nbCloth(c, 0, -r * 0.5, 0, r * 0.5, [pal.bright, CL_LEATHER[1], pal.bright]); c.lineWidth = r * 0.05; c.stroke();
          c.beginPath(); c.arc(-r * 0.04, sy * r * 0.6, r * 0.02, 0, TAU); fillInk(pal.gold, 1);
        }
        h.rr(-r * 0.04, -r * 0.07, r * 0.08, r * 0.14, r * 0.02); fillInk(pal.gold, 1);
        // arrow
        clPole(c, h, nk - r * 0.04, 0, r * 0.28, 0, Math.max(1.2, r * 0.018), "#d0a060");
        for (const sy of [-1, 1]) { olLeaf(c, nk + r * 0.02, 0, r * 0.12, r * 0.03, sy * 0.35 + Math.PI); fillInk(pal.bright, 0.8); }
        for (let i = 0; i < 4; i++) clFlame(c, r * 0.24 - i * r * 0.07, 0, r * (0.14 - i * 0.025), r * 0.07, -Math.PI / 2, ts, i + 3);
        c.beginPath(); c.moveTo(r * 0.24, -r * 0.045); c.lineTo(r * 0.38, 0); c.lineTo(r * 0.24, r * 0.045); c.closePath(); fillInk(CL_FIRE_CORE, 1.2);
        clSun(c, h, pal, ts, r * 0.34, 0, r * (0.06 + 0.012 * p), 1, 9);
        c.restore();
        olHand(c, h, BX, BY, Math.max(2, r * 0.055), CL_SKIN);
      },

      /* Princess Iron Fan (Tieshan Gongzhu), Rakshasi of the Flaming Mountains — flowing Tang-style celestial robes with
         a high-waisted skirt and wide sleeves in the side colours, a floating pibo shawl, a lofty double-loop chignon
         crowned by a golden phoenix diadem with dangling buyao jewels; she sweeps the Giant Plantain Fan (bajiao shan)
         and unleashes a howling cyclone of spiralling whirlwinds and torn leaves. */
      fury(c, pal, r, ts, h) {
        const { fillInk, pulse } = h;
        const p = pulse(200), sweep = ts ? Math.sin(ts / 520) : 0.3;
        // the cyclone she has raised
        clVortex(c, pal, ts, -r * 0.5, r * 0.02, r * 0.58, 0.6, 4, -1);
        clVortex(c, pal, ts, -r * 0.62, r * 0.55, r * 0.34, 0.5, 3, -1);
        for (let i = 0; i < 6; i++) {   // torn leaves caught in the wind
          const t = ts ? (ts / 1500 + i / 6) % 1 : (i + 0.5) / 6, a = -t * TAU * 1.5 + i, rad = r * (0.15 + 0.4 * t);
          olLeaf(c, -r * 0.5 + Math.cos(a) * rad, Math.sin(a) * rad * 0.6, r * 0.07, r * 0.025, a * 2); c.fillStyle = rgba(i % 2 ? CL_LEAF[1] : pal.bright, 0.85 * Math.sin(Math.PI * t)); c.fill();
        }
        // pibo shawl behind (arching over the shoulders, ends fluttering)
        const shawl = [];
        for (let i = 0; i <= 16; i++) {
          const t = i / 16, a = Math.PI * (1 - t);
          shawl.push([Math.cos(a) * r * 0.46, -r * 0.18 - Math.sin(a) * r * 0.24 + (ts ? Math.sin(ts / 300 + t * 5) * r * 0.02 : 0)]);
        }
        clRibbon(c, h, shawl, () => Math.max(2, r * 0.06), [pal.rim, pal.bright, pal.rim], 1.1);
        for (const sx of [-1, 1]) {
          const end = [];
          for (let i = 0; i <= 10; i++) { const t = i / 10; end.push([sx * (r * 0.46 + t * r * 0.3), -r * 0.18 + t * r * 0.9 + (ts ? Math.sin(ts / 220 - t * 6 + sx) * r * 0.06 * t : 0)]); }
          clRibbon(c, h, end, t => Math.max(1.5, r * 0.06 * (1 - t * 0.4)), [pal.rim, pal.bright, pal.deep], 1.1);
        }
        // high-waisted flowing skirt
        const skirt = clRobe(c, h, pal, 0, -r * 0.24, r * 0.92, r * 0.24, r * 0.5, clRobeGrad(c, pal, -r * 0.5, -r * 0.24, r * 0.5, r * 0.92), { hemK: 0.09 });
        c.save(); skirt(); c.clip();
        c.beginPath(); for (let k = -4; k <= 4; k++) { c.moveTo(k * r * 0.05, -r * 0.2); c.lineTo(k * r * 0.11 + (ts ? Math.sin(ts / 400 + k) * r * 0.015 : 0), r * 0.92); }
        c.strokeStyle = rgba(pal.deep, 0.4); c.lineWidth = Math.max(0.6, r * 0.012); c.stroke();
        c.restore();
        // short jacket and chest ribbon
        c.beginPath(); c.moveTo(-r * 0.24, -r * 0.36); c.quadraticCurveTo(0, -r * 0.4, r * 0.24, -r * 0.36); c.lineTo(r * 0.24, -r * 0.2); c.lineTo(-r * 0.24, -r * 0.2); c.closePath();
        fillInk(nbCloth(c, 0, -r * 0.4, 0, -r * 0.2, CL_SAFFRON), 1.4);
        clLapels(c, h, pal, 0, -r * 0.38, r * 0.16, r * 0.06, Math.max(1.6, r * 0.035));
        h.rr(-r * 0.25, -r * 0.24, r * 0.5, r * 0.06, r * 0.02); fillInk(pal.gold, 1.2);
        c.beginPath(); c.ellipse(0, -r * 0.21, r * 0.05, r * 0.035, 0, 0, TAU); fillInk(pal.bright, 1);
        for (const sx of [-1, 1]) clPole(c, h, sx * r * 0.02, -r * 0.18, sx * r * 0.06 + (ts ? Math.sin(ts / 260 + sx) * r * 0.02 : 0), r * 0.3, Math.max(1.4, r * 0.025), pal.bright);
        c.beginPath(); c.arc(0, r * 0.36, r * 0.04, 0, TAU); fillInk(nbCloth(c, 0, r * 0.32, 0, r * 0.4, CL_JADE), 1);
        // left arm in a wide sleeve, lowered
        c.beginPath(); c.moveTo(-r * 0.22, -r * 0.32); c.quadraticCurveTo(-r * 0.5, -r * 0.2, -r * 0.52, r * 0.18);
        c.quadraticCurveTo(-r * 0.42, r * 0.28, -r * 0.3, r * 0.2); c.lineTo(-r * 0.24, -r * 0.1); c.closePath();
        fillInk(nbCloth(c, -r * 0.5, -r * 0.3, -r * 0.2, r * 0.2, CL_SAFFRON), 1.6);
        c.beginPath(); c.moveTo(-r * 0.52, r * 0.18); c.quadraticCurveTo(-r * 0.42, r * 0.28, -r * 0.3, r * 0.2); c.strokeStyle = h.INK; c.lineWidth = r * 0.05 + 2; c.stroke(); c.strokeStyle = pal.bright; c.lineWidth = r * 0.05; c.stroke();
        // the Giant Plantain Fan, sweeping
        const GX = r * 0.42, GY = -r * 0.16, FA = 0.42 + sweep * 0.34;
        c.save(); c.globalCompositeOperation = "lighter";
        for (let k = 0; k < 3; k++) {   // whoosh arcs flung from the fan
          const ph = ts ? (ts / 500 + k / 3) % 1 : (k + 0.5) / 3, rad = r * (0.25 + 0.5 * ph);
          c.beginPath(); c.arc(GX - r * 0.2, GY - r * 0.3, rad, Math.PI * 0.8, Math.PI * 1.25);
          c.strokeStyle = rgba(k % 2 ? pal.bright : CL_WIND, 0.6 * (1 - ph)); c.lineWidth = Math.max(1, r * 0.03); c.stroke();
        }
        c.restore();
        c.save(); c.translate(GX, GY); c.rotate(FA);
        clPole(c, h, 0, r * 0.06, 0, -r * 0.2, Math.max(2, r * 0.04), nbCloth(c, 0, -r * 0.2, 0, r * 0.06, [pal.rim, pal.deep, pal.deep]));
        clTassel(c, h, pal, ts, 0, r * 0.06, r * 0.12, 0, 3);
        const leaf = () => {
          c.beginPath(); c.moveTo(0, -r * 0.18);
          c.bezierCurveTo(-r * 0.34, -r * 0.24, -r * 0.34, -r * 0.66, 0, -r * 0.8);
          c.bezierCurveTo(r * 0.34, -r * 0.66, r * 0.34, -r * 0.24, 0, -r * 0.18); c.closePath();
        };
        c.save(); c.globalCompositeOperation = "lighter"; leaf(); c.strokeStyle = rgba(pal.bright, 0.35 + 0.3 * p); c.lineWidth = r * 0.08; c.stroke(); c.restore();
        leaf(); fillInk(nbCloth(c, -r * 0.3, -r * 0.2, r * 0.3, -r * 0.8, CL_LEAF), 1.8);
        c.save(); leaf(); c.clip();
        c.beginPath(); c.moveTo(0, -r * 0.18); c.lineTo(0, -r * 0.78);
        for (let k = 1; k < 8; k++) { const y = -r * 0.18 - k * r * 0.075; c.moveTo(0, y); c.lineTo(-r * 0.3, y - r * 0.1); c.moveTo(0, y); c.lineTo(r * 0.3, y - r * 0.1); }
        c.strokeStyle = rgba(CL_LEAF[2], 0.7); c.lineWidth = Math.max(0.6, r * 0.012); c.stroke();
        c.restore();
        leaf(); c.strokeStyle = pal.bright; c.lineWidth = Math.max(1, r * 0.022); c.stroke();
        c.beginPath(); c.arc(0, -r * 0.2, r * 0.035, 0, TAU); fillInk(pal.gold, 1);
        c.restore();
        // raised fan arm
        c.beginPath(); c.moveTo(r * 0.22, -r * 0.32); c.quadraticCurveTo(r * 0.5, -r * 0.36, r * 0.58, -r * 0.08);
        c.quadraticCurveTo(r * 0.48, r * 0.02, r * 0.36, -r * 0.06); c.lineTo(r * 0.24, -r * 0.14); c.closePath();
        fillInk(nbCloth(c, r * 0.2, -r * 0.3, r * 0.56, 0, CL_SAFFRON), 1.6);
        c.beginPath(); c.moveTo(r * 0.58, -r * 0.08); c.quadraticCurveTo(r * 0.48, r * 0.02, r * 0.36, -r * 0.06); c.strokeStyle = h.INK; c.lineWidth = r * 0.05 + 2; c.stroke(); c.strokeStyle = pal.bright; c.lineWidth = r * 0.05; c.stroke();
        olHand(c, h, GX, GY, Math.max(2, r * 0.05), CL_SKIN);
        // head, lofty chignon, phoenix diadem
        const HX = 0, HY = -r * 0.56, HS = r * 0.14;
        for (const sx of [-1, 1]) {
          c.beginPath(); c.ellipse(HX + sx * HS * 0.55, HY - HS * 1.75, HS * 0.42, HS * 0.62, sx * 0.4, 0, TAU);
          c.moveTo(HX + sx * HS * 0.55 + HS * 0.2, HY - HS * 1.75); c.ellipse(HX + sx * HS * 0.55, HY - HS * 1.75, HS * 0.2, HS * 0.34, sx * 0.4, 0, TAU, true);
          fillInk(nbCloth(c, HX, HY - HS * 2.4, HX, HY - HS, CL_HAIR), 1.3);
        }
        c.beginPath(); c.ellipse(HX, HY - HS * 0.3, HS * 1.0, HS * 0.95, 0, Math.PI, TAU); c.quadraticCurveTo(HX, HY - HS * 1.6, HX - HS, HY - HS * 0.3); fillInk(nbCloth(c, HX, HY - HS * 1.3, HX, HY, CL_HAIR), 1.3);
        clFace(c, h, HX, HY, HS, { mouth: "calm", lips: "#d0303a", shadow: "#ff4a6a", mark: pal.bright, iris: "#1a1010" });
        c.beginPath(); c.moveTo(HX - HS * 0.86, HY - HS * 0.3); c.quadraticCurveTo(HX - HS * 0.6, HY - HS * 1.0, HX, HY - HS * 0.9);
        c.quadraticCurveTo(HX + HS * 0.6, HY - HS * 1.0, HX + HS * 0.86, HY - HS * 0.3); c.quadraticCurveTo(HX + HS * 0.5, HY - HS * 0.75, HX, HY - HS * 0.7);
        c.quadraticCurveTo(HX - HS * 0.5, HY - HS * 0.75, HX - HS * 0.86, HY - HS * 0.3); c.closePath();
        fillInk(nbCloth(c, HX, HY - HS, HX, HY - HS * 0.3, CL_HAIR), 1.2);
        // golden phoenix with spread wings and dangling buyao beads
        const PY = HY - HS * 1.12;
        for (const sx of [-1, 1]) {
          c.beginPath(); c.moveTo(HX, PY); c.quadraticCurveTo(HX + sx * HS * 0.7, PY - HS * 0.6, HX + sx * HS * 1.25, PY - HS * 0.3);
          c.quadraticCurveTo(HX + sx * HS * 0.8, PY - HS * 0.05, HX + sx * HS * 1.05, PY + HS * 0.15); c.quadraticCurveTo(HX + sx * HS * 0.5, PY + HS * 0.1, HX, PY + HS * 0.1); c.closePath();
          fillInk(nbCloth(c, HX, PY - HS * 0.5, HX + sx * HS * 1.2, PY, CL_GOLD), 1.2);
          c.beginPath(); c.moveTo(HX + sx * HS * 0.2, PY - HS * 0.05); c.quadraticCurveTo(HX + sx * HS * 0.7, PY - HS * 0.4, HX + sx * HS * 1.1, PY - HS * 0.25);
          c.strokeStyle = pal.bright; c.lineWidth = Math.max(0.7, HS * 0.1); c.stroke();
          for (let k = 0; k < 2; k++) {
            const bx = HX + sx * HS * (0.85 + k * 0.3), by = PY + HS * 0.1, sw = ts ? Math.sin(ts / 240 + k + sx) * HS * 0.08 : 0;
            c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + sw, by + HS * 0.55); c.strokeStyle = CL_GOLD[1]; c.lineWidth = Math.max(0.6, HS * 0.05); c.stroke();
            c.beginPath(); c.arc(bx + sw * 0.5, by + HS * 0.28, HS * 0.07, 0, TAU); c.fillStyle = CL_PEARL; c.fill();
            c.beginPath(); c.arc(bx + sw, by + HS * 0.58, HS * 0.09, 0, TAU); fillInk(pal.bright, 0.8);
          }
        }
        c.beginPath(); c.moveTo(HX, PY - HS * 0.5); c.quadraticCurveTo(HX + HS * 0.18, PY - HS * 0.2, HX, PY + HS * 0.12); c.quadraticCurveTo(HX - HS * 0.18, PY - HS * 0.2, HX, PY - HS * 0.5); c.closePath();
        fillInk(CL_GOLD[1], 1);
        c.beginPath(); c.arc(HX, PY - HS * 0.6, HS * 0.12, 0, TAU); fillInk(pal.bright, 1);
        wkGlow(c, HX, PY - HS * 0.6, HS * 0.35, pal.bright, 0.5 + 0.3 * p);
      },
    },
  };

  /* ============================================================
   * THEME: YOKAI WAR — static vector portraits of figures from Japanese and East Asian folklore. The
   * Sovereign and Reaper are side-specific: light fields Nurarihyon and the Nine-Tailed Fox, dark fields
   * Shuten-Doji and the Slaughter Oni (杀戮鬼, an original oni design). Both sides share Gashadokuro,
   * Yuki-Onna, Daitengu and San-me Karasu Tengu, Nekomata, Shuten-Doji and Hone-Onna, and Zhong Kui.
   * ============================================================ */
  SG.THEMES.hyakki = {
    id: "hyakki",
    name: { en: "Yokai War", fr: "Guerre des Yokai", zh: "妖族大战", ar: "حرب اليوكاي" },
    description: {
      en: "The Sovereign and Reaper change with each side: the light side fields 滑头鬼 (Nurarihyon) with a kiseru and onibi rings and the fox-faced 九尾妖狐 (Nine-Tailed Fox) with nine tails, a spirit fan, and 狐火 (Kitsunebi); the dark side fields 酒吞童子 (Shuten-Doji), the oni king enthroned with a sake dish and war fan, and 杀戮鬼 (Slaughter Oni), a horned, oni-masked reaper in dark armor with a great scythe. Both sides share 饿者骷髅 (Gashadokuro) amid nether mist; 雪女 (Yuki-Onna) with snow crystals; 大天狗 and 三眼乌天狗 (Daitengu and San-me Karasu Tengu) with raven wings and a feather fan; 猫又 (Nekomata) with forked ghost-fire tails; 酒吞童子 (Shuten-Doji) beside 骨女 (Hone-Onna) and a bone lantern; and 钟馗 (Zhong Kui) in magistrate robes with a demon-slaying sword.",
      fr: "Le Souverain et la Faucheuse changent selon le camp : le camp clair aligne 滑头鬼 (Nurarihyon), son kiseru et ses anneaux d'onibi, et 九尾妖狐 (renard à neuf queues), à tête de renard, avec son éventail spirituel et 狐火 (kitsunebi) ; le camp sombre aligne 酒吞童子 (Shuten-Doji), roi des oni trônant avec sa coupe de saké et son éventail de guerre, et 杀戮鬼 (Oni du carnage), faucheur cornu au masque d'oni, en armure sombre et armé d'une grande faux. Les deux camps partagent 饿者骷髅 (Gashadokuro), dans les brumes infernales ; 雪女 (Yuki-Onna), avec ses cristaux de neige ; 大天狗 et 三眼乌天狗 (Daitengu et San-me Karasu Tengu), aux ailes de corbeau et à l'éventail de plumes ; 猫又 (Nekomata), aux queues fourchues de feu spectral ; 酒吞童子 (Shuten-Doji), auprès de 骨女 (Hone-Onna) et de sa lanterne d'os ; et 钟馗 (Zhong Kui), en robe de magistrat et armé de l'épée tueuse de démons.",
      zh: "君主与死神因阵营而异：光明方为手持烟管、伴有鬼火烟环的滑头鬼，以及狐面九尾、手持灵扇并有狐火的九尾妖狐；黑暗方为端坐王座、手持酒盏与军配团扇的鬼王酒吞童子，以及头生鬼角、戴鬼面、身披黑甲、手持巨镰的杀戮鬼。双方共有：饿者骷髅现身冥雾；雪女与雪晶相伴；大天狗与三眼乌天狗展开鸦羽之翼并持羽扇；猫又拖着分叉鬼火尾；酒吞童子与骨女的白骨灯笼同框；钟馗身着判官官袍、持斩妖剑。",
      ar: "يتغيّر السيّد والحاصد بحسب الجانب: يقدّم الجانب المضيء 滑头鬼 (نوراريهيون) مع غليون كيسيرو وحلقات أونيبي، و九尾妖狐 (الثعلب ذو الذيول التسعة) بوجه ثعلب وذيوله التسعة ومروحة روحية ونيران 狐火 (كيتسونِبي)؛ ويقدّم الجانب المظلم 酒吞童子 (شوتن-دوجي) ملك الأوني جالساً على عرشه بكأس ساكي ومروحة حرب، و杀戮鬼 (أوني المذبحة) حاصداً بقرنين وقناع أوني ودرع داكن ومنجل عظيم. ويتشارك الجانبان 饿者骷髅 (غاشادوكورو) وسط الضباب؛ و雪女 (يوكي-أونا) مع بلورات الثلج؛ و大天狗 و三眼乌天狗 (دايتينغو وسان-مي كاراسو تينغو) بأجنحة الغراب ومروحة الريش؛ و猫又 (نيكوماتا) بذيول متشعبة من نار الأشباح؛ و酒吞童子 (شوتن-دوجي) إلى جانب 骨女 (هوني-أونا) وفانوس عظمي؛ و钟馗 (زونغ كوي) بثياب قاضٍ وسيف قاتل للشياطين.",
    },
    painters: {
      sovereign(c, pal, r, ts, h) {
        const k = rosterKit(c, pal, r, h);
        // Nurarihyon's unmistakably long bald cranium, wispy side locks and embroidered haori.
        k.poly([[-0.28, -0.12], [-0.38, 0.62], [-0.25, 0.79], [0.27, 0.79], [0.34, 0.25], [0.4, -0.08]], pal.mid);
        k.path((p) => { p.M(0.24, -0.62); p.C(0.46, -0.77, 0.68, -0.66, 0.76, -0.51); p.C(0.85, -0.32, 0.55, -0.24, 0.28, -0.26); p.C(0.03, -0.3, -0.13, -0.38, -0.15, -0.5); p.C(-0.12, -0.72, 0.06, -0.78, 0.24, -0.62); p.Z(); }, "#c5a987");
        k.line([[-0.18, -0.46], [-0.28, -0.27], [-0.22, -0.39], [-0.34, -0.2]], "#eee0c7", Math.max(1.2, r * 0.04));
        k.line([[0.2, -0.35], [0.32, -0.17], [0.39, -0.38]], "#eee0c7", Math.max(1.2, r * 0.04));
        k.eye(0.22, -0.48, "#5a3328");
        // Embroidered mantle and folding fan.
        k.line([[-0.31, -0.02], [0, 0.22], [0.3, -0.02]], "#d9b351", Math.max(1.4, r * 0.04));
        for (let i = 0; i < 4; i++) k.glyph(-0.21 + i * 0.14, 0.45, i % 2 ? pal.bright : "#e4c979", 0.035);
        k.path((p) => { p.M(-0.76, 0.16); p.L(-0.35, 0.05); p.L(-0.4, 0.41); p.Z(); }, "#eee0c7");
        for (let i = 0; i < 4; i++) k.line([[-0.73 + i * 0.09, 0.17], [-0.39, 0.38]], "#b88d46", Math.max(0.8, r * 0.018));
        // Slender brass kiseru and violet onibi smoke rings.
        k.line([[0.12, -0.12], [0.64, -0.27]], "#bb8644", Math.max(1.8, r * 0.055));
        k.ellipse(0.64, -0.27, 0.07, 0.045, "#c6a253");
        k.ring(0.71, -0.46, 0.075, "#a66bd2", Math.max(1, r * 0.03));
        k.ring(0.84, -0.58, 0.06, "#bc81e9", Math.max(1, r * 0.028));
        k.ring(0.96, -0.71, 0.045, "#9b62ca", Math.max(1, r * 0.025));
      },
      reaper(c, pal, r, ts, h) {
        const k = rosterKit(c, pal, r, h), gold = "#edba48";
        // Nine flaming tails fan behind Tamamo-no-Mae.
        for (let i = 0; i < 9; i++) {
          const x = -0.22 + i * 0.055, tx = -0.98 + i * 0.245, ty = -0.76 + Math.abs(4 - i) * 0.105;
          k.path((p) => { p.M(x, 0.28); p.Q((x + tx) / 2 - 0.07, -0.22, tx, ty); p.Q(tx - 0.16, ty + 0.16, tx - 0.02, ty + 0.28); }, null, i % 3 === 0 ? gold : i % 3 === 1 ? pal.bright : "#ef7a35", Math.max(1.7, r * 0.055));
          k.path((p) => { p.M(x, 0.28); p.Q((x + tx) / 2 - 0.07, -0.22, tx, ty); }, null, "#fff0a0", Math.max(0.8, r * 0.02));
        }
        k.poly([[-0.25, -0.13], [-0.34, 0.68], [0.34, 0.68], [0.25, -0.13]], "#d55255");
        k.line([[-0.28, 0.2], [0.28, 0.2]], pal.bright, Math.max(1.5, r * 0.05));
        k.poly([[-0.14, -0.13], [0, 0.08], [0.14, -0.13]], "#fff4e2");
        // Unmistakable fox head: tall dark-tipped ears, orange mask, white cheek ruff and pointed muzzle.
        const fox = "#e2792f", cream = "#fff4e2", tipInk = "#2a1b1d";
        for (const s of [-1, 1]) {
          k.poly([[s * 0.06, -0.58], [s * 0.3, -0.95], [s * 0.3, -0.47]], fox);
          k.poly([[s * 0.11, -0.6], [s * 0.27, -0.84], [s * 0.27, -0.55]], cream, null);
          k.poly([[s * 0.255, -0.87], [s * 0.3, -0.95], [s * 0.3, -0.83]], tipInk, null);
        }
        k.path((p) => { p.M(-0.3, -0.5); p.Q(0, -0.68, 0.3, -0.5); p.L(0.33, -0.3); p.L(0.09, -0.12); p.L(0, -0.06); p.L(-0.09, -0.12); p.L(-0.33, -0.3); p.Z(); }, fox);
        for (const s of [-1, 1]) k.poly([[s * 0.33, -0.3], [s * 0.42, -0.19], [s * 0.2, -0.17], [s * 0.1, -0.27]], cream);
        k.poly([[-0.1, -0.33], [0.1, -0.33], [0.07, -0.13], [0, -0.07], [-0.07, -0.13]], cream);
        k.ellipse(0, -0.09, 0.045, 0.032, tipInk, null);
        // Slanted gold eyes under red kitsune markings, a flame jewel and whiskers.
        for (const s of [-1, 1]) {
          k.path((p) => { p.M(s * 0.05, -0.38); p.Q(s * 0.13, -0.45, s * 0.22, -0.43); p.Q(s * 0.15, -0.36, s * 0.05, -0.38); p.Z(); }, "#ffd34a", tipInk, Math.max(0.8, r * 0.02));
          k.line([[s * 0.13, -0.39], [s * 0.15, -0.42]], tipInk, Math.max(1, r * 0.03));
          k.line([[s * 0.07, -0.47], [s * 0.21, -0.52]], "#d32f36", Math.max(1.1, r * 0.035));
          k.line([[s * 0.06, -0.15], [s * 0.3, -0.16]], tipInk, Math.max(0.6, r * 0.014));
          k.line([[s * 0.06, -0.12], [s * 0.28, -0.08]], tipInk, Math.max(0.6, r * 0.014));
        }
        k.path((p) => { p.M(0, -0.62); p.Q(0.05, -0.55, 0, -0.5); p.Q(-0.05, -0.55, 0, -0.62); p.Z(); }, gold, null);
        k.ring(0.29, 0.02, 0.085, gold, Math.max(1.2, r * 0.04));
        k.line([[0.29, 0.1], [0.29, 0.19]], gold, Math.max(1, r * 0.03));
        // Golden spirit fan and dancing foxfire.
        k.path((p) => { p.M(-0.62, 0.04); p.L(-0.28, 0.13); p.L(-0.52, 0.39); p.Z(); }, gold);
        for (let i = 0; i < 4; i++) k.line([[-0.6 + i * 0.07, 0.08], [-0.5, 0.34]], "#fff0b1", Math.max(0.7, r * 0.018));
        for (const [x, y] of [[-0.83, 0.14], [0.78, -0.04], [0.72, 0.49]]) {
          k.ellipse(x, y, 0.07, 0.11, "#51c7e5", null);
          k.ellipse(x, y + 0.035, 0.03, 0.055, "#fff4ae", null);
        }
      },
      juggernaut(c, pal, r, ts, h) {
        const k = rosterKit(c, pal, r, h), bone = "#d9d0c5";
        // Nether mist behind a colossal skeletal phantom.
        k.ellipse(0, 0.24, 1.02, 0.75, "rgba(102,73,142,0.23)", null);
        k.ellipse(0, 0.31, 0.82, 0.59, null, "rgba(156,116,197,0.7)", Math.max(1.2, r * 0.035));
        k.ellipse(0, -0.55, 0.29, 0.28, bone);
        k.poly([[-0.23, -0.66], [-0.16, -0.83], [-0.08, -0.67], [0, -0.86], [0.08, -0.67], [0.17, -0.82], [0.24, -0.62], [0.2, -0.42], [-0.22, -0.42]], bone);
        k.ellipse(-0.1, -0.55, 0.07, 0.075, "#a33dba", null); k.ellipse(0.1, -0.55, 0.07, 0.075, "#a33dba", null);
        k.ellipse(-0.1, -0.55, 0.027, 0.04, "#fff1d1", null); k.ellipse(0.1, -0.55, 0.027, 0.04, "#fff1d1", null);
        // Massive exposed ribcage.
        k.line([[-0.15, -0.29], [-0.2, 0.42]], bone, Math.max(2, r * 0.07));
        k.line([[0.15, -0.29], [0.2, 0.42]], bone, Math.max(2, r * 0.07));
        for (let i = 0; i < 5; i++) {
          const y = -0.22 + i * 0.13;
          k.path((p) => { p.M(-0.18, y); p.Q(0, y - 0.16, 0.18, y); }, null, bone, Math.max(1.7, r * 0.055));
        }
        k.line([[0, -0.28], [0, 0.49]], bone, Math.max(2, r * 0.065));
        // Long arms and giant grasping hands.
        for (const side of [-1, 1]) {
          k.line([[side * 0.2, -0.18], [side * 0.56, 0.0], [side * 0.78, 0.2]], bone, Math.max(2, r * 0.07));
          k.ellipse(side * 0.82, 0.25, 0.15, 0.17, bone);
          for (let i = 0; i < 3; i++) k.path((p) => { p.M(side * (0.76 + i * 0.06), 0.34); p.Q(side * (0.84 + i * 0.05), 0.55, side * (0.94 + i * 0.025), 0.46); }, null, bone, Math.max(1.4, r * 0.045));
        }
      },
      trickster(c, pal, r, ts, h) {
        const k = rosterKit(c, pal, r, h), ice = "#c9efff";
        // Blizzard ring and six-pointed snow crystals.
        k.ellipse(0, -0.06, 1.02, 0.94, null, "rgba(198,232,255,0.72)", Math.max(1.1, r * 0.028));
        k.poly([[-0.26, -0.04], [-0.4, 0.68], [0.4, 0.68], [0.26, -0.04]], "#e8f5fb");
        for (let i = 0; i < 5; i++) k.line([[-0.3 + i * 0.15, 0.1], [-0.25 + i * 0.12, 0.61]], "#8cc6e4", Math.max(0.8, r * 0.02));
        k.ellipse(0, -0.4, 0.21, 0.25, "#f1dfd8");
        // Cascading raven hair and icicle ornaments.
        k.path((p) => { p.M(-0.2, -0.48); p.Q(0, -0.8, 0.21, -0.49); p.L(0.34, 0.38); p.L(0.19, 0.23); p.L(0.05, 0.62); p.L(-0.14, 0.22); p.L(-0.33, 0.48); p.L(-0.25, -0.25); p.Z(); }, "#171d2b");
        k.poly([[-0.2, -0.62], [0, -1.04], [0.18, -0.62]], "#edf7ff");
        k.line([[-0.11, -0.52], [0, -0.56], [0.12, -0.52]], "#26303d", Math.max(1, r * 0.025));
        for (const x of [-0.13, 0.14]) k.path((p) => { p.M(x, -0.7); p.L(x + 0.04, -0.82); p.L(x + 0.06, -0.67); }, null, ice, Math.max(1.1, r * 0.035));
        for (const [x, y, s] of [[-0.7, -0.25, 0.12], [0.68, -0.39, 0.1], [0.72, 0.4, 0.08]]) {
          for (const a of [0, Math.PI / 3, Math.PI * 2 / 3]) {
            const dx = Math.cos(a) * s, dy = Math.sin(a) * s;
            k.line([[x - dx, y - dy], [x + dx, y + dy]], ice, Math.max(1.1, r * 0.03));
          }
        }
      },
      wildrider(c, pal, r, ts, h) {
        const k = rosterKit(c, pal, r, h), feather = "#171922";
        // Massive layered raven wings and gale strokes.
        k.path((p) => { p.M(-0.18, 0.18); p.C(-0.58, -0.12, -0.78, -0.62, -1.1, -0.74); p.L(-0.99, -0.25); p.L(-0.88, 0.13); p.L(-0.66, 0.4); p.Z(); }, feather);
        k.path((p) => { p.M(0.18, 0.18); p.C(0.58, -0.12, 0.78, -0.62, 1.1, -0.74); p.L(0.99, -0.25); p.L(0.88, 0.13); p.L(0.66, 0.4); p.Z(); }, "#292b36");
        for (let i = 0; i < 4; i++) {
          const y = -0.54 + i * 0.15;
          k.line([[-0.18, y], [-0.52 - i * 0.12, y - 0.12], [-0.91 - i * 0.045, y - 0.13]], "#697080", Math.max(1, r * 0.026));
          k.line([[0.18, y], [0.52 + i * 0.12, y - 0.12], [0.91 + i * 0.045, y - 0.13]], "#697080", Math.max(1, r * 0.026));
        }
        k.poly([[-0.2, -0.05], [-0.3, 0.58], [0.3, 0.58], [0.2, -0.05]], "#d6d1c2");
        k.ellipse(0, -0.43, 0.2, 0.22, "#14151b");
        k.poly([[-0.2, -0.56], [0, -0.8], [0.2, -0.56]], "#493e35");
        k.line([[-0.12, -0.84], [0.12, -0.84]], pal.bright, Math.max(1.2, r * 0.04));
        // Tokin cap, Yamabushi pom-poms, triple-eyed raven mask.
        k.poly([[-0.21, -0.58], [-0.18, -0.76], [0.18, -0.76], [0.21, -0.58]], "#171922");
        k.ellipse(-0.29, -0.69, 0.055, 0.075, "#f1ead7"); k.ellipse(0.29, -0.69, 0.055, 0.075, "#f1ead7");
        k.poly([[-0.14, -0.46], [0, -0.28], [0.15, -0.46], [0.08, -0.52]], "#171922");
        for (const x of [-0.08, 0, 0.08]) k.ellipse(x, -0.44, 0.025, 0.025, x ? "#e74c47" : "#eac35d", null);
        // Three-feather gale fan (ha-uchiwa).
        k.line([[0.42, -0.04], [0.8, 0.17]], "#c6a15b", Math.max(1.7, r * 0.05));
        for (let i = 0; i < 3; i++) k.path((p) => { p.M(0.68, 0.11); p.Q(0.75 + i * 0.05, -0.03 - i * 0.03, 0.85 + i * 0.07, 0.09); }, null, "#d8c58a", Math.max(1.5, r * 0.05));
        k.line([[-0.66, 0.02], [-0.88, -0.06], [-0.99, 0.02]], "#afdcf0", Math.max(1, r * 0.025));
      },
      skirmisher(c, pal, r, ts, h) {
        const k = rosterKit(c, pal, r, h), fur = "#35313d";
        // Acrobatic cat body, split tails and forked ghost flames.
        k.path((p) => { p.M(-0.3, 0.44); p.Q(-0.06, 0.08, 0.35, 0.06); p.Q(0.63, 0.11, 0.45, 0.33); p.Q(0.11, 0.52, -0.3, 0.44); p.Z(); }, fur);
        k.path((p) => { p.M(0.34, 0.15); p.C(0.63, -0.12, 0.72, -0.56, 0.8, -0.91); p.Q(0.98, -0.64, 0.87, -0.38); }, null, "#fa7943", Math.max(2, r * 0.06));
        k.path((p) => { p.M(0.38, 0.16); p.C(0.75, -0.02, 0.96, -0.34, 1.04, -0.62); p.Q(1.1, -0.34, 0.95, -0.17); }, null, "#ffc34e", Math.max(1.8, r * 0.05));
        k.line([[0.8, -0.91], [0.73, -1.08], [0.84, -0.99]], "#ffc34e", Math.max(1.2, r * 0.035));
        k.line([[0.8, -0.91], [0.91, -1.07], [0.84, -0.99]], "#fa7943", Math.max(1.2, r * 0.035));
        k.line([[1.04, -0.62], [1.0, -0.79], [1.1, -0.7]], "#fa7943", Math.max(1.2, r * 0.035));
        k.line([[1.04, -0.62], [1.13, -0.76], [1.1, -0.7]], "#ffc34e", Math.max(1.2, r * 0.035));
        k.ellipse(-0.02, -0.25, 0.2, 0.19, fur);
        k.poly([[-0.17, -0.33], [-0.22, -0.68], [-0.01, -0.43]], fur);
        k.poly([[0.04, -0.43], [0.25, -0.68], [0.18, -0.3]], fur);
        k.poly([[-0.18, -0.65], [-0.14, -0.48], [-0.1, -0.55]], "#ef8c74", null);
        k.poly([[0.24, -0.65], [0.17, -0.48], [0.12, -0.55]], "#ef8c74", null);
        k.eye(-0.09, -0.27, "#e8d875"); k.eye(0.1, -0.27, "#e8d875");
        // Braided red collar, gold bell, four claws in a leaping pounce.
        k.line([[-0.17, -0.04], [0.21, 0.0]], "#ba3e4a", Math.max(2, r * 0.065));
        k.ellipse(0.03, 0.02, 0.055, 0.06, "#e7bd58");
        for (let i = 0; i < 4; i++) k.line([[-0.37 + i * 0.06, 0.43], [-0.52 + i * 0.07, 0.58]], "#e5ded0", Math.max(1.1, r * 0.03));
        k.path((p) => { p.M(-0.72, 0.42); p.Q(-0.86, 0.25, -0.76, 0.13); }, null, fur, Math.max(2, r * 0.055));
      },
      harrower(c, pal, r, ts, h) {
        const k = rosterKit(c, pal, r, h), gold = "#d7ae56";
        // Shuten-Doji, horned and wild-maned.
        k.ellipse(-0.05, -0.39, 0.34, 0.31, "#3f2531");
        k.poly([[-0.35, -0.5], [-0.41, -0.72], [-0.25, -0.61], [-0.2, -0.82], [-0.05, -0.63], [0.05, -0.83], [0.18, -0.61], [0.34, -0.74], [0.28, -0.48]], "#4a2632");
        k.ellipse(0, -0.37, 0.22, 0.24, "#aa5a49");
        k.path((p) => { p.M(-0.14, -0.54); p.Q(-0.54, -0.82, -0.39, -0.43); p.L(-0.19, -0.35); p.Z(); }, "#e0c891");
        k.path((p) => { p.M(0.1, -0.54); p.Q(0.49, -0.84, 0.38, -0.43); p.L(0.17, -0.34); p.Z(); }, "#e0c891");
        k.eye(-0.09, -0.4, "#ffe074"); k.eye(0.1, -0.4, "#ffe074");
        // Kimono, spiked kanabo and demonic sake gourd.
        k.poly([[-0.29, -0.12], [-0.39, 0.72], [0.37, 0.72], [0.28, -0.12]], pal.mid);
        k.line([[-0.28, 0.05], [0.28, 0.05]], gold, Math.max(1.5, r * 0.05));
        k.line([[0.45, -0.25], [0.77, 0.62]], "#8e6840", Math.max(2.5, r * 0.075));
        for (let i = 0; i < 4; i++) {
          const y = -0.16 + i * 0.17; k.poly([[0.45, y], [0.35, y - 0.08], [0.47, y - 0.1]], "#bba17b");
        }
        k.ellipse(-0.68, 0.37, 0.2, 0.28, "#9a3e44");
        k.ellipse(-0.68, 0.35, 0.12, 0.14, "#411725");
        k.line([[-0.82, 0.29], [-0.74, 0.36], [-0.66, 0.29], [-0.58, 0.36]], "#f3c762", Math.max(1, r * 0.03));
        k.ellipse(-0.68, 0.67, 0.05, 0.07, "#f0d177");
        k.path((p) => { p.M(-0.77, 0.57); p.Q(-0.84, 0.71, -0.71, 0.8); p.Q(-0.64, 0.69, -0.68, 0.6); }, null, "#6bd3ed", Math.max(1.5, r * 0.045));
        k.path((p) => { p.M(-0.68, 0.57); p.Q(-0.59, 0.71, -0.67, 0.84); }, null, "#be75e6", Math.max(1.4, r * 0.04));
        // Hone-Onna's spectral bone lantern and skeletal-beauty charm.
        k.ring(0.68, -0.63, 0.15, "#e8dcae", Math.max(1.4, r * 0.045));
        k.line([[0.68, -0.48], [0.68, -0.31]], "#eee5cf", Math.max(1.1, r * 0.03));
        k.ellipse(0.68, -0.63, 0.035, 0.035, "#a9e8ef", null);
        k.line([[0.53, 0.16], [0.7, 0.07], [0.85, 0.16]], "#eee5cf", Math.max(1, r * 0.025));
      },
      fury(c, pal, r, ts, h) {
        const k = rosterKit(c, pal, r, h), red = "#a33a3c";
        // Zhong Kui in crimson magistrate robes, winged cap and red ribbons.
        k.poly([[-0.38, -0.12], [-0.57, 0.78], [0.53, 0.78], [0.34, -0.12]], red);
        k.line([[-0.44, 0.54], [0.44, 0.54]], "#e7bf59", Math.max(1.5, r * 0.05));
        k.poly([[-0.28, -0.66], [-0.42, -0.77], [-0.19, -0.84], [0, -0.72], [0.19, -0.84], [0.42, -0.77], [0.28, -0.66]], "#171720");
        k.path((p) => { p.M(-0.34, -0.75); p.L(-0.62, -0.47); p.L(-0.53, -0.41); p.L(-0.3, -0.62); }, "#bd303b");
        k.path((p) => { p.M(0.34, -0.75); p.L(0.62, -0.47); p.L(0.53, -0.41); p.L(0.3, -0.62); }, "#bd303b");
        k.ellipse(0, -0.42, 0.25, 0.26, "#d6a47c");
        k.eye(-0.11, -0.44, "#e6493d"); k.eye(0.11, -0.44, "#e6493d");
        // Bristling black beard.
        k.path((p) => { p.M(-0.21, -0.3); p.Q(0, -0.2, 0.21, -0.3); p.L(0.19, -0.12); p.L(0.1, 0.05); p.L(0.05, -0.05); p.L(0, 0.12); p.L(-0.06, -0.04); p.L(-0.16, 0.04); p.Z(); }, "#17151a");
        // Demon-slaying sword crackling with talismanic energy.
        k.line([[0.28, 0.28], [0.88, -0.55]], "#ddd9cf", Math.max(2, r * 0.06));
        k.line([[0.22, 0.29], [0.4, 0.38]], "#d7a644", Math.max(2.4, r * 0.075));
        k.poly([[0.88, -0.55], [0.77, -0.48], [0.84, -0.65]], "#fff0a0", null);
        k.path((p) => { p.M(0.38, 0.12); p.L(0.52, -0.02); p.L(0.47, -0.08); p.L(0.63, -0.25); }, null, "#f5d875", Math.max(1.2, r * 0.035));
        // Gold lion-mask embroidery marks his magistrate robe.
        k.ellipse(0, 0.31, 0.18, 0.12, null, "#e7bf59", Math.max(1, r * 0.024));
        k.ellipse(-0.02, 0.31, 0.12, 0.08, null, "#e7bf59", Math.max(1, r * 0.026));
        k.ellipse(-0.07, 0.29, 0.025, 0.025, "#e7bf59", null);
        k.ellipse(0.03, 0.29, 0.025, 0.025, "#e7bf59", null);
        k.path((p) => { p.M(-0.09, 0.34); p.Q(-0.02, 0.4, 0.08, 0.34); }, null, "#e7bf59", Math.max(0.8, r * 0.02));
        for (const [x, y] of [[-0.72, -0.23], [0.64, 0.05], [-0.72, 0.1]]) {
          k.poly([[x - 0.09, y - 0.13], [x + 0.09, y - 0.13], [x + 0.08, y + 0.08], [x - 0.08, y + 0.08]], "#f5e4b9", "#bd303b", Math.max(0.8, r * 0.02));
          k.glyph(x, y - 0.015, "#bd303b", 0.028);
        }
        // Stomped ghost spirits under his robes.
        for (const x of [-0.4, 0.0, 0.4]) {
          k.ellipse(x, 0.96, 0.1, 0.09, "#9f73c6", null);
          k.ellipse(x - 0.035, 0.94, 0.018, 0.023, "#fff3be", null);
          k.ellipse(x + 0.035, 0.94, 0.018, 0.023, "#fff3be", null);
        }
      },
    },
    // The dark side fields its own Sovereign and Reaper (chosen by piece ownership, not board position);
    // the light side, and every other role on both sides, use the shared painters above.
    sidePainters: {
      dark: {
        sovereign(c, pal, r, ts, h) {
          const k = rosterKit(c, pal, r, h), gold = "#e2b64f", skin = "#c4503f", mane = "#e0662c", horn = "#efe2c0", brow = "#3a1418";
          // 酒吞童子 (Shuten-Doji), king of the oni, enthroned before a gold-trimmed lacquer back.
          k.poly([[-0.66, -0.5], [0, -0.68], [0.66, -0.5], [0.72, 0.86], [-0.72, 0.86]], "#2a1519");
          k.poly([[-0.56, -0.44], [0, -0.58], [0.56, -0.44], [0.6, 0.78], [-0.6, 0.78]], null, gold, Math.max(1, r * 0.03));
          // Wild flame-red mane.
          k.poly([[-0.36, -0.2], [-0.48, -0.42], [-0.36, -0.46], [-0.42, -0.66], [-0.24, -0.6], [-0.18, -0.78], [-0.06, -0.62], [0, -0.8], [0.06, -0.62], [0.18, -0.78], [0.24, -0.6], [0.42, -0.66], [0.36, -0.46], [0.48, -0.42], [0.36, -0.2], [0.2, -0.12], [-0.2, -0.12]], mane);
          // Regal layered robes, broad shoulder mantle, gold obi and crests.
          k.poly([[-0.32, -0.12], [-0.6, 0.82], [0.6, 0.82], [0.32, -0.12]], pal.mid);
          for (const s of [-1, 1]) k.poly([[s * 0.3, -0.13], [s * 0.64, -0.02], [s * 0.58, 0.16], [s * 0.3, 0.1]], pal.deep, gold, Math.max(1, r * 0.03));
          k.poly([[-0.16, -0.12], [0, 0.18], [0.16, -0.12]], "#f2e4c4");
          k.line([[-0.16, -0.12], [0, 0.18], [0.16, -0.12]], gold, Math.max(1.2, r * 0.035));
          k.poly([[-0.42, 0.3], [0.42, 0.3], [0.45, 0.42], [-0.45, 0.42]], gold);
          k.line([[-0.43, 0.36], [0.43, 0.36]], pal.bright, Math.max(1, r * 0.03));
          for (let i = 0; i < 3; i++) k.glyph(-0.3 + i * 0.3, 0.62, i % 2 ? pal.bright : gold, 0.04);
          // Red oni face, great curved horns and a jewelled gold crown band.
          k.ellipse(0, -0.35, 0.2, 0.22, skin);
          for (const s of [-1, 1]) k.path((p) => { p.M(s * 0.1, -0.52); p.Q(s * 0.3, -0.62, s * 0.36, -0.94); p.Q(s * 0.4, -0.66, s * 0.19, -0.46); p.Z(); }, horn);
          k.poly([[-0.19, -0.5], [-0.12, -0.6], [0, -0.52], [0.12, -0.6], [0.19, -0.5], [0.17, -0.44], [-0.17, -0.44]], gold);
          k.ellipse(0, -0.5, 0.035, 0.035, pal.bright, null);
          k.eye(-0.09, -0.34, "#ffd84a"); k.eye(0.09, -0.34, "#ffd84a");
          for (const s of [-1, 1]) {
            k.line([[s * 0.17, -0.43], [s * 0.03, -0.39]], brow, Math.max(1.2, r * 0.035));
            k.poly([[s * 0.07, -0.215], [s * 0.05, -0.16], [s * 0.03, -0.205]], "#fff6e0", null);
          }
          k.path((p) => { p.M(-0.09, -0.22); p.Q(0, -0.17, 0.09, -0.22); }, null, brow, Math.max(1, r * 0.03));
          // Right hand lifts a vast vermilion sakazuki of sake; left hand holds a gold gunbai war fan.
          k.line([[0.56, 0.12], [0.62, -0.04]], skin, Math.max(2.2, r * 0.08));
          k.poly([[0.58, -0.1], [0.7, -0.1], [0.68, -0.05], [0.6, -0.05]], "#a91f27");
          k.ellipse(0.64, -0.16, 0.24, 0.075, "#c8282f");
          k.ellipse(0.64, -0.18, 0.17, 0.04, "#f6eccd", null);
          k.ellipse(0.64, -0.16, 0.24, 0.075, null, gold, Math.max(1, r * 0.028));
          k.line([[-0.66, 0.08], [-0.6, 0.38]], "#6b4a2c", Math.max(1.8, r * 0.055));
          k.ellipse(-0.68, -0.12, 0.17, 0.2, gold);
          k.ellipse(-0.68, -0.12, 0.1, 0.12, pal.deep, null);
          k.ring(-0.68, -0.12, 0.06, pal.bright, Math.max(1, r * 0.03));
          k.ellipse(-0.61, 0.24, 0.06, 0.06, skin);
        },
        reaper(c, pal, r, ts, h) {
          const k = rosterKit(c, pal, r, h), steel = "#d3d7de", armor = "#2b2a33", plate = "#3a3844", horn = "#ece0c2", mask = "#c3262d", glare = "#ffd84a", dark = "#1a0a0c", gold = "#d9b04d";
          // 杀戮鬼 (Slaughter Oni): a tattered war cloak lined in the side colour.
          k.path((p) => { p.M(-0.3, -0.1); p.L(-0.7, 0.86); p.L(-0.5, 0.74); p.L(-0.36, 0.9); p.L(-0.18, 0.76); p.L(0, 0.92); p.L(0.18, 0.76); p.L(0.36, 0.9); p.L(0.5, 0.74); p.L(0.7, 0.86); p.L(0.3, -0.1); p.Z(); }, pal.deep);
          // Great reaping scythe: shaft in the right fist, crescent blade sweeping out past the shoulder.
          k.line([[0.66, 0.9], [0.56, -0.84]], "#3b2a22", Math.max(2.2, r * 0.07));
          k.path((p) => { p.M(0.55, -0.82); p.Q(0.98, -0.86, 1.12, -0.42); p.Q(0.92, -0.64, 0.57, -0.64); p.Z(); }, steel);
          k.path((p) => { p.M(0.6, -0.66); p.Q(0.9, -0.64, 1.08, -0.46); }, null, pal.bright, Math.max(1, r * 0.03));
          // Dark lamellar cuirass laced in the side colour, with hanging kusazuri plates.
          k.poly([[-0.3, -0.12], [-0.34, 0.48], [0.34, 0.48], [0.3, -0.12]], armor);
          for (let i = 0; i < 4; i++) { const y = 0.0 + i * 0.12; k.line([[-0.31 - i * 0.008, y], [0.31 + i * 0.008, y]], pal.bright, Math.max(0.9, r * 0.025)); }
          for (let i = 0; i < 3; i++) {
            const x = -0.3 + i * 0.2;
            k.poly([[x, 0.48], [x + 0.2, 0.48], [x + 0.22, 0.78], [x - 0.02, 0.78]], plate);
            k.line([[x + 0.01, 0.63], [x + 0.19, 0.63]], pal.mid, Math.max(0.9, r * 0.025));
          }
          // Broad sode shoulder plates.
          for (const s of [-1, 1]) {
            k.poly([[s * 0.26, -0.14], [s * 0.56, -0.06], [s * 0.52, 0.3], [s * 0.24, 0.2]], plate);
            for (let i = 0; i < 3; i++) k.line([[s * 0.26, -0.04 + i * 0.1], [s * 0.52, 0.04 + i * 0.1]], pal.bright, Math.max(0.9, r * 0.025));
          }
          // Gauntlets: right fist grips the shaft, left fist clenched for the kill.
          k.line([[0.48, 0.22], [0.6, 0.12]], armor, Math.max(2.4, r * 0.09));
          k.ellipse(0.61, 0.09, 0.075, 0.07, armor);
          k.line([[-0.48, 0.26], [-0.56, 0.4]], armor, Math.max(2.4, r * 0.09));
          k.ellipse(-0.57, 0.42, 0.075, 0.07, armor);
          // Kabuto helmet, neck guard and towering demon horns.
          k.poly([[-0.3, -0.36], [0.3, -0.36], [0.34, -0.14], [-0.34, -0.14]], plate);
          for (const y of [-0.29, -0.21]) k.line([[-0.3, y], [0.3, y]], pal.bright, Math.max(0.9, r * 0.025));
          for (const s of [-1, 1]) k.path((p) => { p.M(s * 0.1, -0.58); p.Q(s * 0.44, -0.6, s * 0.5, -0.98); p.Q(s * 0.32, -0.74, s * 0.18, -0.5); p.Z(); }, horn);
          k.path((p) => { p.M(-0.24, -0.42); p.Q(-0.26, -0.72, 0, -0.72); p.Q(0.26, -0.72, 0.24, -0.42); p.Z(); }, armor);
          for (const s of [-1, 1]) k.poly([[s * 0.22, -0.55], [s * 0.36, -0.5], [s * 0.3, -0.38], [s * 0.2, -0.42]], plate);
          k.line([[-0.22, -0.5], [0.22, -0.5]], gold, Math.max(1, r * 0.03));
          // Snarling crimson oni mask with glaring eyes and fangs.
          k.path((p) => { p.M(-0.2, -0.49); p.L(0.2, -0.49); p.Q(0.24, -0.3, 0.13, -0.17); p.L(0, -0.13); p.L(-0.13, -0.17); p.Q(-0.24, -0.3, -0.2, -0.49); p.Z(); }, mask);
          for (const s of [-1, 1]) {
            k.poly([[s * 0.04, -0.4], [s * 0.17, -0.44], [s * 0.14, -0.36]], glare, dark, Math.max(0.8, r * 0.02));
            k.line([[s * 0.03, -0.44], [s * 0.19, -0.49]], dark, Math.max(1.2, r * 0.035));
          }
          k.poly([[-0.03, -0.35], [0.03, -0.35], [0.05, -0.28], [-0.05, -0.28]], "#8f1b22", null);
          k.path((p) => { p.M(-0.12, -0.25); p.Q(0, -0.2, 0.12, -0.25); p.L(0.09, -0.19); p.Q(0, -0.16, -0.09, -0.19); p.Z(); }, dark, null);
          for (const s of [-1, 1]) {
            k.poly([[s * 0.08, -0.245], [s * 0.065, -0.185], [s * 0.04, -0.235]], "#fff6e0", null);
            k.poly([[s * 0.03, -0.17], [s * 0.015, -0.225], [s * 0.0, -0.18]], "#fff6e0", null);
          }
        },
      },
    },
  };
})();
