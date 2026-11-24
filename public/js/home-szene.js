'use strict';
/* =============================================================
   Freistunden.exe – Homebildschirm
   Animiertes Pixel-Zimmer mit Blick auf eine Neon-Stadt.

   Die Szene wird live gezeichnet (Raster 640 × 360) und scharf
   hochskaliert. Dadurch ist sie auf jedem Bildschirm gestochen
   scharf (auch 4K) und braucht keine Videodatei.
   ============================================================= */
const HomeSzene = (() => {
  const W = 640;
  const H = 360;
  const FX0 = 150, FY0 = 44, FX1 = 500, FY1 = 250; // Fensterausschnitt
  const SCHEIBEN = [[150, 44, 108, 206], [262, 44, 124, 206], [390, 44, 110, 206]];

  // ---------- Hilfsfunktionen ----------
  function zufall(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function leinwand(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return [c, g];
  }
  function rect(g, x, y, w, h, f) {
    g.fillStyle = f;
    g.fillRect(Math.round(x), Math.round(y), w, h);
  }
  function linie(g, x0, y0, x1, y1, f) {
    g.fillStyle = f;
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      g.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function ellipse(g, cx, cy, rx, ry, f) {
    g.fillStyle = f;
    cx = Math.round(cx); cy = Math.round(cy);
    for (let y = -ry; y <= ry; y++) {
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
      g.fillRect(cx - w, cy + y, w * 2 + 1, 1);
    }
  }
  function licht(g, x, y, r, rgb, a) {
    if (a <= 0) return;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${rgb},${a})`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Konvexes Vieleck pixelgenau füllen (für perspektivische Flächen)
  function poly(g, pkt, f) {
    g.fillStyle = f;
    const ys = pkt.map((p) => p[1]);
    const y0 = Math.floor(Math.min(...ys));
    const y1 = Math.ceil(Math.max(...ys));
    for (let y = y0; y < y1; y++) {
      const yc = y + 0.5;
      let a = Infinity;
      let b = -Infinity;
      for (let i = 0; i < pkt.length; i++) {
        const [ax, ay] = pkt[i];
        const [bx, by] = pkt[(i + 1) % pkt.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
          const x = ax + ((yc - ay) * (bx - ax)) / (by - ay);
          a = Math.min(a, x);
          b = Math.max(b, x);
        }
      }
      if (a <= b) g.fillRect(Math.round(a), y, Math.max(1, Math.round(b) - Math.round(a)), 1);
    }
  }
  // Punkt auf einer viereckigen Fläche (Ecken: oben links, oben rechts, unten rechts, unten links)
  function aufFlaeche(Q, u, v) {
    const [a, b, c, d] = Q;
    const ox = a[0] + (b[0] - a[0]) * u, oy = a[1] + (b[1] - a[1]) * u;
    const ux = d[0] + (c[0] - d[0]) * u, uy = d[1] + (c[1] - d[1]) * u;
    return [ox + (ux - ox) * v, oy + (uy - oy) * v];
  }
  const teilFlaeche = (Q, u0, v0, u1, v1) => [aufFlaeche(Q, u0, v0), aufFlaeche(Q, u1, v0), aufFlaeche(Q, u1, v1), aufFlaeche(Q, u0, v1)];

  // Fernseher und Schrank in Schrägansicht (Fluchtpunkte rechts und links auf Augenhöhe y≈190)
  const SCHRANK = {
    vorne: [[26, 216], [142, 211], [142, 302], [26, 312]],
    oben: [[6, 212], [122, 208], [142, 211], [26, 216]],
    seite: [[6, 212], [26, 216], [26, 312], [6, 304]],
  };
  const TV = {
    vorne: [[40, 124], [124, 132], [124, 211], [40, 214]],
    seite: [[28, 128], [40, 124], [40, 214], [28, 212]],
    heck: [[18, 134], [28, 128], [28, 212], [18, 206]],
  };
  const BILD = teilFlaeche(TV.vorne, 0.09, 0.08, 0.91, 0.86);

  // Wandregal: zwei Böden mit je 5 Plätzen für Spielhüllen
  const REGAL_BOEDEN = [164, 197];
  const REGAL_PLAETZE = 10;

  // ---------- Pixel-Schrift 3 × 5 ----------
  const FONT = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
    E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
    I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
    // M, N und W sind 4 Pixel breit, damit sie eindeutig lesbar sind
    M: '10011111111110011001', N: '10011101101110011001', O: '010101101101010', P: '110101110100100',
    Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '10011001111111111001', X: '101101010101101',
    Y: '101101010010010', Z: '111001010100111',
    0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
    4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010',
    8: '111101111101111', 9: '111101111001110',
    '.': '000000000000010', ':': '000010000010000', '!': '010010010000010', '-': '000000111000000',
    '+': '000010111010000', '?': '110001010000010', '/': '001001010100100', ' ': '000000000000000',
  };
  function schrift(g, text, x, y, f, s = 1) {
    g.fillStyle = f;
    let cx = Math.round(x);
    y = Math.round(y);
    for (const ch of String(text).toUpperCase()) {
      const basis = UMLAUTE[ch] || ch;
      const z = FONT[basis];
      const b = zeichenBreite(ch);
      if (z) for (let i = 0; i < z.length; i++) if (z[i] === '1') g.fillRect(cx + (i % b) * s, y + Math.floor(i / b) * s, s, s);
      if (UMLAUTE[ch]) {
        // Umlaut-Punkte mit einer Zeile Abstand über dem Buchstaben
        g.fillRect(cx, y - 2 * s, s, s);
        g.fillRect(cx + (b - 1) * s, y - 2 * s, s, s);
      }
      cx += (b + 1) * s;
    }
  }
  const UMLAUTE = { Ä: 'A', Ö: 'O', Ü: 'U' };
  function zeichenBreite(ch) {
    const z = FONT[UMLAUTE[ch] || ch];
    return z ? z.length / 5 : 3;
  }
  const textBreite = (t, s = 1) => [...String(t).toUpperCase()].reduce((n, ch) => n + (zeichenBreite(ch) + 1) * s, 0) - s;

  // =============================================================
  //  Statische Ebenen (einmal vorgezeichnet)
  // =============================================================
  const HIMMEL = [[0, [18, 6, 46]], [0.42, [58, 18, 108]], [0.78, [132, 42, 150]], [1, [196, 72, 152]]];
  function himmelFarbe(y) {
    const t = Math.min(1, Math.max(0, (y - (FY0 - 10)) / (FY1 - FY0 + 10)));
    let i = 0;
    while (i < HIMMEL.length - 2 && t > HIMMEL[i + 1][0]) i++;
    const [t0, c0] = HIMMEL[i];
    const [t1, c1] = HIMMEL[i + 1];
    const k = (t - t0) / (t1 - t0);
    return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
  }

  function himmelBauen() {
    const [c, g] = leinwand(W, H);
    for (let y = FY0 - 12; y <= FY1 + 4; y++) rect(g, FX0 - 30, y, FX1 - FX0 + 60, 1, `rgb(${himmelFarbe(y)})`);
    // Mond mit Schein
    g.globalCompositeOperation = 'lighter';
    licht(g, 456, 74, 40, '255,120,220', 0.22);
    g.globalCompositeOperation = 'source-over';
    ellipse(g, 456, 74, 9, 9, '#ffe2f6');
    ellipse(g, 461, 70, 8, 8, `rgb(${himmelFarbe(70)})`);
    rect(g, 451, 76, 2, 2, '#f2c4e6');
    rect(g, 454, 80, 1, 1, '#f2c4e6');
    return c;
  }

  function wolkeBauen(rnd, w, h, farben = ['#8c40c0', '#5c2392', '#44187a']) {
    const [c, g] = leinwand(w, h + 4);
    const basis = h;
    const puffs = [];
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const r = Math.max(3, Math.round(h * (0.3 + rnd() * 0.35)));
      puffs.push([Math.round(r + rnd() * (w - 2 * r)), basis - r, r]);
    }
    for (const [x, y, r] of puffs) ellipse(g, x, y, r, r, farben[0]);
    for (const [x, y, r] of puffs) ellipse(g, x, y + 2, r, r, farben[1]);
    for (const [x, , r] of puffs) rect(g, x - r + 1, basis - 2, 2 * r - 1, 2, farben[2]);
    g.clearRect(0, basis, w, 8);
    return c;
  }

  function fernBauen(rnd) {
    const [c, g] = leinwand(W, H);
    const funkeln = [];
    let x = FX0 - 26;
    while (x < FX1 + 26) {
      const w = 10 + Math.floor(rnd() * 20);
      const top = 138 + Math.floor(rnd() * 60);
      rect(g, x, top, w, FY1 - top + 6, '#341a68');
      rect(g, x, top, 1, FY1 - top + 6, '#48288c');
      if (rnd() < 0.35) rect(g, x + Math.floor(w / 2), top - 4 - Math.floor(rnd() * 6), 1, 8, '#341a68');
      for (let yy = top + 3; yy < FY1; yy += 3) {
        for (let xx = x + 2; xx < x + w - 1; xx += 3) {
          if (rnd() < 0.22) {
            const f = ['#ff7ad9', '#7af3ff', '#ffd36b', '#b98cff'][Math.floor(rnd() * 4)];
            g.globalAlpha = 0.4 + rnd() * 0.35;
            rect(g, xx, yy, 1, 1, f);
            g.globalAlpha = 1;
            if (rnd() < 0.14) funkeln.push({ x: xx, y: yy, f, aus: '#341a68', p: rnd() * 10, s: 0.4 + rnd() * 1.6 });
          }
        }
      }
      x += w + (rnd() < 0.3 ? 2 : 0);
    }
    return { c, funkeln };
  }

  const MITTE = [
    { x: 144, w: 30, top: 150 },
    { x: 176, w: 22, top: 120, play: true },
    { x: 201, w: 40, top: 168, tank: true },
    { x: 242, w: 16, top: 138 },
    { x: 262, w: 50, top: 150, billboard: true },
    { x: 314, w: 24, top: 162 },
    { x: 350, w: 36, top: 104, highlight: true },
    { x: 388, w: 26, top: 158 },
    { x: 416, w: 30, top: 128, logo: true },
    { x: 448, w: 24, top: 152 },
    { x: 474, w: 34, top: 140, tank: true },
  ];

  function mitteBauen(rnd) {
    const [c, g] = leinwand(W, H);
    const funkeln = [];
    for (const b of MITTE) {
      const hoch = FY1 - b.top + 6;
      rect(g, b.x, b.top, b.w, hoch, '#1f0d46');
      rect(g, b.x + b.w - 3, b.top, 3, hoch, '#170937');
      rect(g, b.x, b.top, b.w, 1, '#2e1762');
      const rand = b.highlight ? '#2ff3ff' : rnd() < 0.5 ? '#ff4fc0' : '#3fd6ff';
      if (b.highlight || rnd() < 0.45) {
        g.globalAlpha = b.highlight ? 0.9 : 0.55;
        rect(g, b.x, b.top, 1, hoch, rand);
        g.globalAlpha = 1;
      }
      if (b.highlight) {
        // markantes Hochhaus: dichtes Fensterraster + leuchtende Etagen
        for (let yy = b.top + 4; yy < FY1; yy += 4) {
          for (let xx = b.x + 3; xx < b.x + b.w - 4; xx += 3) {
            if (rnd() < 0.55) {
              const f = rnd() < 0.7 ? '#5ee9ff' : '#ff6fd0';
              g.globalAlpha = 0.55 + rnd() * 0.4;
              rect(g, xx, yy, 2, 2, f);
              g.globalAlpha = 1;
              if (rnd() < 0.1) funkeln.push({ x: xx, y: yy, w: 2, h: 2, f, aus: '#1f0d46', p: rnd() * 10, s: 0.3 + rnd() });
            }
          }
        }
        rect(g, b.x + 1, b.top - 2, b.w - 2, 2, '#2a1458');
      } else {
        for (let yy = b.top + 5; yy < FY1; yy += 5) {
          const etage = rnd() < 0.08;
          if (etage) {
            g.globalAlpha = 0.45;
            rect(g, b.x + 2, yy, b.w - 5, 1, rnd() < 0.5 ? '#ff5fc8' : '#5ee9ff');
            g.globalAlpha = 1;
            continue;
          }
          for (let xx = b.x + 3; xx < b.x + b.w - 4; xx += 5) {
            if (rnd() < 0.2) {
              const f = ['#ff8ad8', '#8af6ff', '#ffd47a', '#c9a0ff'][Math.floor(rnd() * 4)];
              g.globalAlpha = 0.5 + rnd() * 0.4;
              rect(g, xx, yy, 2, 1, f);
              g.globalAlpha = 1;
              if (rnd() < 0.12) funkeln.push({ x: xx, y: yy, w: 2, h: 1, f, aus: '#1f0d46', p: rnd() * 10, s: 0.3 + rnd() });
            }
          }
        }
      }
      if (b.tank) {
        rect(g, b.x + 6, b.top - 7, 9, 5, '#2a1458');
        rect(g, b.x + 6, b.top - 7, 9, 1, '#3a1f72');
        rect(g, b.x + 7, b.top - 2, 1, 2, '#1f0d46');
        rect(g, b.x + 13, b.top - 2, 1, 2, '#1f0d46');
      }
    }
    // Antenne auf dem Hochhaus
    rect(g, 366, 90, 1, 14, '#2a1458');
    // Fernsehturm in der Mitte
    rect(g, 340, 62, 6, FY1 - 56, '#1b0b3e');
    rect(g, 340, 62, 1, FY1 - 56, '#3a2a80');
    for (let y = 72; y < FY1; y += 16) {
      rect(g, 338, y, 10, 2, '#24105a');
      g.globalAlpha = 0.8;
      rect(g, 338, y, 10, 1, '#4fe0ff');
      g.globalAlpha = 1;
    }
    rect(g, 336, 96, 14, 6, '#24105a');
    g.globalAlpha = 0.7;
    rect(g, 337, 98, 12, 1, '#ff6fd0');
    g.globalAlpha = 1;
    rect(g, 342, 50, 2, 12, '#24105a');
    // Billboard-Gestell
    rect(g, 272, 142, 2, 8, '#2a1458');
    rect(g, 322, 142, 2, 8, '#2a1458');
    return { c, funkeln };
  }

  const NAH = [
    { x: 126, w: 38, top: 216 },
    { x: 166, w: 26, top: 228 },
    { x: 194, w: 44, top: 210 },
    { x: 240, w: 30, top: 232 },
    { x: 272, w: 40, top: 220 },
    { x: 314, w: 26, top: 236 },
    { x: 342, w: 44, top: 214 },
    { x: 388, w: 40, top: 226 },
    { x: 430, w: 84, top: 176, leiter: true },
  ];

  function nahBauen(rnd) {
    const [c, g] = leinwand(W, H);
    for (const b of NAH) {
      rect(g, b.x, b.top, b.w, FY1 - b.top + 8, '#120828');
      rect(g, b.x, b.top, b.w, 1, '#28144e');
      for (let yy = b.top + 5; yy < FY1 - 2; yy += 6) {
        for (let xx = b.x + 4; xx < b.x + b.w - 4; xx += 6) {
          if (rnd() < 0.18) {
            g.globalAlpha = 0.65;
            rect(g, xx, yy, 3, 2, rnd() < 0.7 ? '#ffb46b' : '#ff7ab6');
            g.globalAlpha = 1;
          }
        }
      }
      if (b.leiter) {
        for (let y = 190; y < FY1; y += 14) {
          rect(g, 436, y, 40, 1, '#3c2766');
          rect(g, 436, y - 4, 40, 1, '#2a1a4c');
          for (let x = 436; x <= 476; x += 5) rect(g, x, y - 4, 1, 4, '#2a1a4c');
          if (y + 14 < FY1) linie(g, 442, y + 1, 468, y + 13, '#2f1e56');
        }
      }
    }
    // Dachkanten, Antennen
    rect(g, 210, 202, 1, 8, '#120828');
    rect(g, 360, 206, 1, 8, '#120828');
    rect(g, 359, 205, 3, 1, '#120828');
    return c;
  }

  function spiegelungBauen() {
    const [c, g] = leinwand(W, H);
    g.fillStyle = 'rgba(255,255,255,0.035)';
    for (const [x, y, w, h] of SCHEIBEN) {
      g.save();
      g.beginPath();
      g.rect(x, y, w, h);
      g.clip();
      g.beginPath();
      g.moveTo(x + w * 0.15, y);
      g.lineTo(x + w * 0.38, y);
      g.lineTo(x + w * 0.02, y + h);
      g.lineTo(x - w * 0.21, y + h);
      g.fill();
      g.beginPath();
      g.moveTo(x + w * 0.5, y);
      g.lineTo(x + w * 0.56, y);
      g.lineTo(x + w * 0.2, y + h);
      g.lineTo(x + w * 0.14, y + h);
      g.fill();
      g.restore();
    }
    return c;
  }

  // ---------- Zimmer ----------
  function raumBauen() {
    const [c, g] = leinwand(W, H);
    const rnd = zufall(77);
    // Wand
    rect(g, 0, 0, W, H, '#1b1034');
    for (let x = 6; x < W; x += 34) rect(g, x, 36, 1, 262, '#22143e');
    for (let i = 0; i < 1100; i++) rect(g, Math.floor(rnd() * W), 36 + Math.floor(rnd() * 262), 1, 1, rnd() < 0.5 ? '#21133c' : '#160b2c');
    // Decke, Träger, Rohre
    rect(g, 0, 0, W, 36, '#0f0820');
    rect(g, 0, 34, W, 2, '#0a0616');
    rect(g, 110, 6, 420, 22, '#1d1234');
    rect(g, 110, 6, 420, 2, '#2e1e4c');
    rect(g, 110, 26, 420, 2, '#0b0718');
    for (let x = 118; x < 528; x += 16) rect(g, x, 16, 2, 2, '#35245a');
    rect(g, 0, 3, 110, 3, '#1a1030');
    rect(g, 530, 3, 110, 3, '#1a1030');
    rect(g, 44, 3, 3, 33, '#1a1030');
    rect(g, 596, 3, 3, 33, '#1a1030');
    // Neonröhren-Halterung
    rect(g, 156, 28, 338, 2, '#120a24');

    // Fensterrahmen
    rect(g, 142, 36, 366, 222, '#0d0718');
    rect(g, 144, 38, 362, 218, '#1a0f30');
    rect(g, 142, 36, 366, 1, '#3b2460');
    for (const [x, y, w, h] of SCHEIBEN) g.clearRect(x, y, w, h);
    rect(g, 258, 44, 4, 206, '#120a24');
    rect(g, 259, 44, 1, 206, '#2c1b4a');
    rect(g, 386, 44, 4, 206, '#120a24');
    rect(g, 387, 44, 1, 206, '#2c1b4a');
    rect(g, 150, 44, 350, 1, '#0a0614');

    // Boden und Teppich zuerst, damit Möbel (z. B. der TV-Schrank) vollständig darauf stehen
    rect(g, 0, 298, W, 3, '#24153c');
    rect(g, 0, 301, W, 59, '#130a24');
    for (const y of [306, 314, 325, 340]) rect(g, 0, y, W, 1, '#1a0f30');
    for (let i = 0; i < 26; i++) rect(g, Math.floor(rnd() * W), [302, 307, 315, 326, 341][Math.floor(rnd() * 5)], 1, 4 + Math.floor(rnd() * 8), '#1a0f30');
    ellipse(g, 322, 332, 150, 18, '#3c1a5e');
    ellipse(g, 322, 332, 146, 16, '#2a1242');
    ellipse(g, 322, 332, 120, 12, '#341656');
    ellipse(g, 322, 332, 116, 10, '#2a1242');
    for (let x = 190; x < 460; x += 10) rect(g, x, 331, 4, 2, '#3c1a5e');
    // Controller auf dem Boden (gut sichtbares Gamepad)
    g.globalAlpha = 0.45;
    ellipse(g, 164, 328, 17, 2, '#07040e');
    g.globalAlpha = 1;
    rect(g, 151, 315, 26, 9, '#261c3e');
    rect(g, 147, 319, 9, 8, '#261c3e');
    rect(g, 172, 319, 9, 8, '#261c3e');
    rect(g, 147, 326, 1, 1, '#130a24');
    rect(g, 180, 326, 1, 1, '#130a24');
    rect(g, 151, 315, 26, 1, '#43356a');
    rect(g, 148, 319, 1, 6, '#3a2d5c');
    rect(g, 151, 323, 26, 1, '#1a1230');
    // Steuerkreuz
    rect(g, 152, 319, 7, 2, '#9a90c0');
    rect(g, 154, 317, 3, 6, '#9a90c0');
    rect(g, 155, 319, 1, 2, '#5a5080');
    // Tasten
    rect(g, 173, 316, 2, 2, '#ff3fb4');
    rect(g, 176, 318, 2, 2, '#2ff3ff');
    rect(g, 170, 318, 2, 2, '#ffd84a');
    rect(g, 173, 320, 2, 2, '#7dff6a');
    // Start/Select und Neon-LED
    rect(g, 161, 319, 2, 1, '#5a5080');
    rect(g, 165, 319, 2, 1, '#5a5080');
    rect(g, 162, 316, 4, 1, '#2ff3ff');

    // Fensterbank / Schreibtisch
    rect(g, 120, 250, 420, 6, '#3b2455');
    rect(g, 120, 250, 420, 1, '#5a3a80');
    rect(g, 120, 256, 420, 12, '#24153c');
    rect(g, 120, 268, 420, 2, '#120a22');
    rect(g, 130, 270, 400, 30, '#160c2a');
    rect(g, 136, 270, 6, 30, '#1d1132');
    rect(g, 518, 270, 6, 30, '#1d1132');

    // Lautsprecher
    rect(g, 194, 230, 16, 20, '#0f0a1c');
    rect(g, 194, 230, 16, 1, '#2c2046');
    ellipse(g, 202, 238, 4, 4, '#1f1632');
    rect(g, 201, 237, 2, 2, '#3c2e58');
    ellipse(g, 202, 246, 2, 2, '#1f1632');
    // Router
    rect(g, 226, 245, 20, 5, '#140d24');
    rect(g, 226, 245, 20, 1, '#2a1f42');
    rect(g, 228, 237, 1, 8, '#140d24');
    rect(g, 243, 237, 1, 8, '#140d24');
    // Tastatur & Maus
    rect(g, 288, 246, 48, 4, '#1a1229');
    for (let x = 290; x < 334; x += 3) {
      rect(g, x, 247, 2, 1, '#30244a');
      rect(g, x + 1, 248, 2, 1, '#2a1f42');
    }
    rect(g, 342, 247, 5, 3, '#1a1229');
    rect(g, 344, 247, 1, 1, '#3a2c56');
    // Tasse
    rect(g, 362, 242, 7, 8, '#5c2f7c');
    rect(g, 362, 242, 7, 1, '#7c48a2');
    rect(g, 363, 242, 5, 1, '#2a1430');
    rect(g, 369, 244, 2, 1, '#5c2f7c');
    rect(g, 370, 244, 1, 4, '#5c2f7c');
    rect(g, 369, 247, 2, 1, '#5c2f7c');
    // Bücherstapel
    rect(g, 448, 240, 22, 3, '#7a2b4c');
    rect(g, 450, 243, 20, 3, '#2b5a7c');
    rect(g, 447, 246, 24, 4, '#6a5a2c');
    rect(g, 448, 240, 22, 1, '#9a3b64');

    // ----- TV-Schrank in Schrägansicht -----
    const SV = SCHRANK.vorne;
    // Schatten auf dem Boden
    g.globalAlpha = 0.5;
    poly(g, [[4, 304], [26, 312], [150, 304], [146, 300], [26, 306]], '#07040e');
    g.globalAlpha = 1;
    poly(g, SCHRANK.seite, '#150b27');
    poly(g, SV, '#26153f');
    poly(g, SCHRANK.oben, '#40275e');
    linie(g, 26, 216, 142, 211, '#6a4a92');
    linie(g, 6, 212, 26, 216, '#4e3472');
    linie(g, 26, 216, 26, 311, '#33204f');
    // offenes Fach oben mit Rekorder und Spielkonsole
    poly(g, teilFlaeche(SV, 0.05, 0.07, 0.95, 0.32), '#0f0820');
    poly(g, teilFlaeche(SV, 0.05, 0.07, 0.95, 0.11), '#080412');
    poly(g, teilFlaeche(SV, 0.09, 0.15, 0.48, 0.29), '#1c1432');
    poly(g, teilFlaeche(SV, 0.09, 0.15, 0.48, 0.17), '#2e2450');
    for (let u = 0.13; u < 0.3; u += 0.04) poly(g, teilFlaeche(SV, u, 0.22, u + 0.02, 0.24), '#33285a');
    poly(g, teilFlaeche(SV, 0.55, 0.13, 0.91, 0.29), '#120c22');
    poly(g, teilFlaeche(SV, 0.55, 0.13, 0.91, 0.15), '#2e2248');
    poly(g, teilFlaeche(SV, 0.6, 0.21, 0.78, 0.22), '#05030a');
    // Türen mit Griffen
    poly(g, teilFlaeche(SV, 0.05, 0.37, 0.48, 0.93), '#1e1036');
    poly(g, teilFlaeche(SV, 0.52, 0.37, 0.95, 0.93), '#1e1036');
    poly(g, teilFlaeche(SV, 0.05, 0.37, 0.48, 0.385), '#2e1b4c');
    poly(g, teilFlaeche(SV, 0.52, 0.37, 0.95, 0.385), '#2e1b4c');
    poly(g, teilFlaeche(SV, 0.4, 0.6, 0.44, 0.7), '#5a4080');
    poly(g, teilFlaeche(SV, 0.56, 0.6, 0.6, 0.7), '#5a4080');
    // Füße
    rect(g, 28, 311, 4, 4, '#0c0716');
    rect(g, 136, 301, 4, 4, '#0c0716');
    rect(g, 8, 303, 3, 3, '#0c0716');

    // ----- Röhrenfernseher in Schrägansicht -----
    const TF = TV.vorne;
    g.globalAlpha = 0.55;
    poly(g, [[22, 213], [40, 215], [124, 212], [128, 209], [30, 210]], '#07040e');
    g.globalAlpha = 1;
    poly(g, TV.heck, '#0a0615');
    poly(g, TV.seite, '#130c25');
    for (const v of [0.22, 0.3, 0.38, 0.46]) linie(g, ...aufFlaeche(TV.heck, 0.25, v), ...aufFlaeche(TV.seite, 0.7, v), '#06030c');
    linie(g, 18, 134, 28, 128, '#2a1f44');
    linie(g, 28, 128, 40, 124, '#3a2c5c');
    poly(g, TF, '#1c1434');
    poly(g, teilFlaeche(TF, 0.05, 0.05, 0.95, 0.89), '#0b0717');
    poly(g, teilFlaeche(TF, 0.05, 0.05, 0.95, 0.065), '#06030d');
    linie(g, 40, 124, 124, 132, '#40336a');
    linie(g, 40, 124, 40, 213, '#3a2c5c');
    linie(g, 28, 128, 28, 211, '#1d1434');
    // Bedienleiste unter dem Bild
    for (let u = 0.12; u < 0.42; u += 0.045) {
      const [x, y] = aufFlaeche(TF, u, 0.94);
      rect(g, x, y, 1, 1, '#2c2246');
    }
    for (const u of [0.78, 0.86]) {
      const [x, y] = aufFlaeche(TF, u, 0.935);
      rect(g, x - 1, y - 1, 3, 3, '#3a2e5a');
      rect(g, x, y - 1, 1, 1, '#5a4a80');
    }
    // Füße
    rect(g, 44, 213, 5, 2, '#0a0614');
    rect(g, 114, 210, 5, 2, '#0a0614');
    // Zimmerantenne
    ellipse(g, 66, 124, 4, 2, '#241a3c');
    rect(g, 63, 123, 6, 1, '#3a2e5a');
    linie(g, 65, 122, 46, 92, '#3e3360');
    linie(g, 67, 122, 92, 88, '#3e3360');
    rect(g, 45, 91, 2, 2, '#6a5a94');
    rect(g, 91, 87, 2, 2, '#6a5a94');

    // Kabel von der Konsole zum Controller
    const [kx, ky] = aufFlaeche(SV, 0.9, 0.29);
    linie(g, kx, ky, kx + 3, ky + 8, '#0b0716');
    linie(g, kx + 3, ky + 8, 146, 300, '#0b0716');
    linie(g, 146, 300, 158, 312, '#0b0716');
    linie(g, 158, 312, 164, 315, '#0b0716');

    // Wandregal links mit Büchern und Hängepflanze
    rect(g, 6, 82, 120, 4, '#2c1a44');
    rect(g, 6, 82, 120, 1, '#45296a');
    rect(g, 16, 86, 2, 8, '#1a1030');
    rect(g, 112, 86, 2, 8, '#1a1030');
    const farben = ['#6b2a5e', '#2b4d7c', '#7a5a2c', '#3e2a70', '#2a6a5c', '#8a2f40', '#4a3a8a'];
    let bx = 10;
    while (bx < 84) {
      const bw = 3 + Math.floor(rnd() * 3);
      const bh = 10 + Math.floor(rnd() * 7);
      const f = farben[Math.floor(rnd() * farben.length)];
      rect(g, bx, 82 - bh, bw, bh, f);
      rect(g, bx, 82 - bh, 1, bh, 'rgba(255,255,255,0.12)');
      rect(g, bx, 82 - bh + 3, bw, 1, 'rgba(0,0,0,0.25)');
      bx += bw + (rnd() < 0.2 ? 2 : 0);
    }
    rect(g, 90, 72, 14, 10, '#6a2c44');
    rect(g, 90, 72, 14, 2, '#8a3c5c');
    for (let ranke = 0; ranke < 5; ranke++) {
      let x = 92 + ranke * 2.5;
      let y = 72;
      const laenge = 14 + Math.floor(rnd() * 28);
      for (let i = 0; i < laenge; i++) {
        y += i < 4 ? -0.5 : 1;
        x += (rnd() - 0.5) * 1.6 + (i < 6 ? (ranke - 2) * 0.4 : 0);
        rect(g, x, y, 1, 1, '#2f7a4c');
        if (i % 3 === 0) rect(g, x + (rnd() < 0.5 ? -1 : 1), y, 2, 2, rnd() < 0.5 ? '#3f9a5c' : '#2a6a42');
      }
    }

    // Poster rechts (leicht nach rechts gerückt, damit das Regal Platz hat)
    g.save();
    g.translate(6, 0);
    rect(g, 544, 60, 62, 80, '#0b0614');
    rect(g, 546, 62, 58, 76, '#0e2232');
    for (let y = 64; y < 136; y += 3) rect(g, 546, y, 58, 1, 'rgba(47,243,255,0.05)');
    schrift(g, 'LVL UP', 553, 68, '#7dff6a', 2);
    rect(g, 560, 94, 30, 12, '#ff3fb4');
    rect(g, 557, 100, 7, 10, '#ff3fb4');
    rect(g, 586, 100, 7, 10, '#ff3fb4');
    rect(g, 560, 104, 30, 2, '#c22a88');
    rect(g, 565, 98, 5, 1, '#ffffff');
    rect(g, 567, 96, 1, 5, '#ffffff');
    rect(g, 581, 97, 2, 2, '#2ff3ff');
    rect(g, 585, 100, 2, 2, '#ffd84a');
    schrift(g, 'PRESS START', 553, 124, '#2ff3ff');
    g.restore();
    // Wandregal für die zuletzt gespielten Spiele (links neben der Uhr)
    for (const boden of REGAL_BOEDEN) {
      g.globalAlpha = 0.18;
      rect(g, 509, boden - 18, 46, 18, '#000000');
      g.globalAlpha = 1;
      rect(g, 507, boden, 50, 3, '#2e1b48');
      rect(g, 507, boden, 50, 1, '#563782');
      rect(g, 507, boden + 3, 50, 1, '#120a22');
      rect(g, 512, boden + 3, 1, 5, '#1a1030');
      rect(g, 511, boden + 7, 3, 1, '#1a1030');
      rect(g, 551, boden + 3, 1, 5, '#1a1030');
      rect(g, 550, boden + 7, 3, 1, '#1a1030');
    }
    // Deko: Kabel der Lichterketten unter der Decke
    for (const [x0, x1] of [[0, 108], [532, 640]]) {
      for (let x = x0; x < x1; x++) {
        const q = (x - x0) / (x1 - x0);
        rect(g, x, 30 + Math.round(Math.sin(q * Math.PI) * 8), 1, 1, '#120a22');
      }
    }
    // Aufhängungen der Neon-Schilder
    rect(g, 34, 36, 1, 7, '#120a22');
    rect(g, 84, 36, 1, 7, '#120a22');
    // Mini-Kaktus auf der Fensterbank
    rect(g, 478, 244, 9, 6, '#a8485c');
    rect(g, 478, 244, 9, 1, '#c8607a');
    rect(g, 481, 234, 3, 10, '#2f8a5a');
    rect(g, 481, 234, 1, 10, '#47a86a');
    rect(g, 478, 237, 2, 4, '#2f8a5a');
    rect(g, 478, 237, 1, 2, '#2f8a5a');
    rect(g, 485, 238, 2, 3, '#2f8a5a');
    rect(g, 486, 236, 1, 2, '#2f8a5a');
    rect(g, 482, 233, 1, 1, '#ff6fd0');
    // Hängelampe
    rect(g, 612, 0, 1, 46, '#0d0717');
    rect(g, 606, 44, 13, 2, '#4a1a2c');
    rect(g, 603, 46, 19, 6, '#3a1222');
    rect(g, 603, 46, 19, 1, '#5a2238');
    // Beistelltisch mit Uhr (leicht nach rechts gerückt)
    g.save();
    g.translate(4, 0);
    rect(g, 552, 212, 72, 4, '#3b2455');
    rect(g, 552, 212, 72, 1, '#5a3a80');
    rect(g, 556, 216, 64, 40, '#24153c');
    rect(g, 560, 222, 56, 1, '#2f1d4c');
    rect(g, 558, 256, 4, 44, '#1d1132');
    rect(g, 614, 256, 4, 44, '#1d1132');
    // große Digitaluhr (mit sichtbarer Oberseite)
    poly(g, [[558, 177], [624, 177], [622, 182], [554, 182]], '#2a1f44');
    rect(g, 554, 182, 68, 30, '#0e0818');
    rect(g, 554, 182, 68, 1, '#3a2c58');
    rect(g, 621, 182, 1, 30, '#07040e');
    rect(g, 557, 185, 62, 24, '#1a0508');
    rect(g, 557, 185, 62, 1, '#0a0204');
    g.restore();

    // Zimmerpflanze rechts
    const blaetter = ['#1f6a46', '#2f8a5a', '#47a86a', '#1a5a3c'];
    for (let i = 0; i < 9; i++) {
      const winkel = -Math.PI / 2 + (i - 4) * 0.28 + (rnd() - 0.5) * 0.2;
      const laenge = 30 + rnd() * 38;
      const f = blaetter[i % blaetter.length];
      for (let s = 0; s < laenge; s++) {
        const k = s / laenge;
        const x = 528 + Math.cos(winkel) * s + Math.sin(k * 3) * 2;
        const y = 284 + Math.sin(winkel) * s + k * k * 18;
        const dicke = Math.max(1, Math.round(Math.sin(k * Math.PI) * 4));
        rect(g, x - dicke / 2, y, dicke, 1, f);
      }
    }
    rect(g, 516, 282, 24, 20, '#4a2238');
    rect(g, 516, 282, 24, 2, '#6a3352');
    rect(g, 518, 284, 20, 1, '#2a1020');

    // Sitzsack rechts unten
    ellipse(g, 594, 328, 46, 26, '#3a0f2c');
    ellipse(g, 590, 324, 42, 22, '#5a1a42');
    ellipse(g, 582, 316, 24, 10, '#7a2a5a');
    rect(g, 548, 340, 92, 20, '#130a24');
    rect(g, 552, 336, 84, 4, '#2a0a20');
    return c;
  }

  function vignetteBauen() {
    const [c, g] = leinwand(W, H);
    const grad = g.createRadialGradient(W / 2, H * 0.52, 120, W / 2, H * 0.52, 400);
    grad.addColorStop(0, 'rgba(4,2,10,0)');
    grad.addColorStop(1, 'rgba(4,2,10,0.72)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    return c;
  }

  function fensterlichtBauen(rgb = '170,70,220') {
    const [c, g] = leinwand(W, H);
    // weicher, ovaler Lichtschein vom Fenster auf Bank und Boden
    g.save();
    g.scale(1, 0.4);
    const grad = g.createRadialGradient(325, 262 / 0.4, 10, 325, 262 / 0.4, 300);
    grad.addColorStop(0, `rgba(${rgb},0.2)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 250 / 0.4, W, (H - 250) / 0.4);
    g.restore();
    return c;
  }

  // =============================================================
  //  Szene
  // =============================================================
  // =============================================================
  //  Strand-Hintergrund (Sonnenuntergang im gleichen Pixel-Neon-Stil)
  // =============================================================
  const HORIZONT = 168;
  const UFER = 214;

  function verlauf(stops, t) {
    t = Math.min(1, Math.max(0, t));
    let i = 0;
    while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    const k = (t - t0) / (t1 - t0);
    return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
  }

  function strandHimmelBauen() {
    const [c, g] = leinwand(W, H);
    const stops = [[0, [28, 9, 66]], [0.42, [104, 30, 140]], [0.78, [226, 78, 142]], [1, [255, 150, 92]]];
    for (let y = FY0 - 12; y <= HORIZONT; y++) {
      rect(g, FX0 - 30, y, FX1 - FX0 + 60, 1, `rgb(${verlauf(stops, (y - FY0 + 12) / (HORIZONT - FY0 + 12))})`);
    }
    // Insel mit kleiner Palme am Horizont (Silhouette)
    const insel = '#3c1650';
    for (let x = 150; x < 238; x++) {
      const h = Math.max(0, Math.round(Math.sin(((x - 150) / 88) * Math.PI) * 9 + Math.sin(x * 0.31) * 1.2));
      rect(g, x, HORIZONT - h, 1, h, insel);
    }
    linie(g, 196, HORIZONT - 8, 199, HORIZONT - 20, insel);
    for (const [dx, dy] of [[-7, 4], [7, 4], [-5, -2], [6, -2], [0, -5]]) linie(g, 199, HORIZONT - 20, 199 + dx, HORIZONT - 20 + dy, insel);
    return c;
  }

  function meerBauen(rnd) {
    const [c, g] = leinwand(W, H);
    const stops = [[0, [58, 22, 100]], [0.45, [42, 52, 128]], [1, [28, 132, 160]]];
    for (let y = HORIZONT; y <= UFER + 2; y++) {
      rect(g, FX0 - 30, y, FX1 - FX0 + 60, 1, `rgb(${verlauf(stops, (y - HORIZONT) / (UFER - HORIZONT))})`);
    }
    // feine Wellenstruktur
    for (let i = 0; i < 260; i++) {
      const y = HORIZONT + 2 + Math.floor(rnd() * (UFER - HORIZONT - 4));
      const nah = (y - HORIZONT) / (UFER - HORIZONT);
      g.globalAlpha = 0.25 + nah * 0.25;
      rect(g, FX0 + rnd() * (FX1 - FX0), y, 2 + Math.floor(nah * 6), 1, rnd() < 0.5 ? '#6a3aa8' : '#1a1a5a');
    }
    g.globalAlpha = 1;
    return c;
  }

  function sandBauen(rnd) {
    const [c, g] = leinwand(W, H);
    const stops = [[0, [196, 128, 118]], [1, [222, 160, 128]]];
    for (let y = UFER - 6; y <= FY1 + 4; y++) rect(g, FX0 - 30, y, FX1 - FX0 + 60, 1, `rgb(${verlauf(stops, (y - UFER) / (FY1 - UFER))})`);
    for (let i = 0; i < 520; i++) {
      rect(g, FX0 + rnd() * (FX1 - FX0), UFER + rnd() * (FY1 - UFER), 1, 1, ['#b5756e', '#e8b494', '#c98a7c'][Math.floor(rnd() * 3)]);
    }
    // Muscheln und Fußspuren
    for (const [x, y] of [[240, 238], [372, 244], [430, 232], [176, 242]]) {
      rect(g, x, y, 2, 1, '#ffe2ec');
      rect(g, x, y + 1, 1, 1, '#d6a0b4');
    }
    for (let i = 0; i < 6; i++) {
      rect(g, 360 + i * 9, 228 + i * 3 + (i % 2) * 2, 2, 1, '#a8686a');
    }
    return c;
  }

  function erstellen(haupt, glanz) {
    // g zeigt auf die Leinwand, auf die gerade gezeichnet wird (Hauptbild oder eine der Außenszenen)
    let g = haupt.getContext('2d');
    const hauptG = g;
    g.imageSmoothingEnabled = false;
    const gg = glanz ? glanz.getContext('2d') : null;
    const rnd = zufall(2026);

    const himmel = himmelBauen();
    const fern = fernBauen(rnd);
    const mitte = mitteBauen(rnd);
    const nah = nahBauen(rnd);
    const raum = raumBauen();
    const spiegelung = spiegelungBauen();
    const vignette = vignetteBauen();
    const fensterlicht = fensterlichtBauen();

    const sterne = Array.from({ length: 55 }, () => ({
      x: FX0 + rnd() * (FX1 - FX0), y: FY0 + 2 + rnd() * 80, p: rnd() * 10, s: 0.6 + rnd() * 2.4, gross: rnd() < 0.12,
    }));
    const wolken = Array.from({ length: 7 }, (_, i) => {
      const w = 36 + Math.floor(rnd() * 50);
      const h = 9 + Math.floor(rnd() * 9);
      return { img: wolkeBauen(rnd, w, h), x: FX0 - 40 + rnd() * (FX1 - FX0 + 80), y: 50 + i * 10 + rnd() * 8, v: 2 + rnd() * 5, a: 0.55 + rnd() * 0.35 };
    });

    function autoNeu(isNah, verteilt) {
      const dir = rnd() < 0.5 ? 1 : -1;
      const y = isNah ? 92 + Math.floor(rnd() * 104) : 112 + Math.floor(rnd() * 48);
      const v = (isNah ? 24 + rnd() * 34 : 8 + rnd() * 12) * dir;
      const x = verteilt ? FX0 + rnd() * (FX1 - FX0) : dir > 0 ? FX0 - 20 - rnd() * 120 : FX1 + 20 + rnd() * 120;
      return { x, y, v, nah: isNah, p: rnd() * 6, glow: ['#ff4fc0', '#2ff3ff', '#b46bff'][Math.floor(rnd() * 3)] };
    }
    const autos = [...Array.from({ length: 6 }, () => autoNeu(true, true)), ...Array.from({ length: 7 }, () => autoNeu(false, true))];
    const luftschiff = { x: FX1 + 40, y: 82, v: -9, pause: 6 };
    const regen = Array.from({ length: 170 }, () => ({
      x: FX0 + rnd() * (FX1 - FX0 + 60), y: FY0 + rnd() * (FY1 - FY0), v: 150 + rnd() * 90, l: 3 + Math.floor(rnd() * 3), vorne: rnd() < 0.3,
    }));
    // ---------- Strand ----------
    const rs = zufall(31);
    const [stadtC, stadtG] = leinwand(W, H);
    const [strandC, strandG] = leinwand(W, H);
    stadtG.imageSmoothingEnabled = strandG.imageSmoothingEnabled = false;
    const strandHimmel = strandHimmelBauen();
    const meer = meerBauen(rs);
    const sand = sandBauen(rs);
    const fensterlichtStrand = fensterlichtBauen('255,140,110');
    const strandWolken = Array.from({ length: 5 }, (_, i) => {
      const w = 40 + Math.floor(rs() * 50);
      return { img: wolkeBauen(rs, w, 6 + Math.floor(rs() * 6), ['#ffa6d6', '#d0609e', '#9a3c8a']), x: FX0 - 40 + rs() * (FX1 - FX0 + 80), y: 56 + i * 13 + rs() * 6, v: 1.5 + rs() * 3, a: 0.5 + rs() * 0.35 };
    });
    const moewen = Array.from({ length: 5 }, (_, i) => ({
      x: FX0 + rs() * (FX1 - FX0), y0: 64 + rs() * 60, v: (rs() < 0.5 ? -1 : 1) * (10 + rs() * 12), p: rs() * 10, gross: i === 0,
    }));
    const glitzer = Array.from({ length: 70 }, () => {
      const y = HORIZONT + 3 + Math.floor(rs() * (UFER - HORIZONT - 8));
      const nah = (y - HORIZONT) / (UFER - HORIZONT);
      return { x: FX0 + rs() * (FX1 - FX0), y, l: 1 + Math.round(nah * 4), p: rs() * 10, s: 1 + rs() * 3, v: 1 + nah * 3 };
    });
    const segelboot = { x: 380, v: 2.5 };
    const jetski = { x: FX1 + 30, y: 194, v: -46, pause: 3, spur: [], gischt: [], spurTimer: 0 };
    const hintergrund = { ziel: 0, blend: 0, timer: 0 }; // 0 = Stadt, 1 = Strand
    const knopf = { druck: 0 };
    const WECHSEL_SEKUNDEN = 60;

    const dampf = [];
    let dampfTimer = 0;
    const router = [0, 0, 0, 0].map(() => ({ an: true, t: rnd() }));
    let lampe = 1;
    let lampeFlackern = 0;
    let neonAus = 0;
    let billboardAus = 0;

    // ---------- Fernseher ----------
    // Das Fernsehbild wird flach gezeichnet und dann perspektivisch auf den Bildschirm gelegt.
    const S = { x: 0, y: 0, w: 94, h: 68 };
    const [tvBild, tvG] = leinwand(S.w, S.h);
    const tv = { modus: 'pong', zeit: 0, naechster: 'titel', bx: 47, by: 34, vx: 52, vy: 28, l: 28, r: 28, pl: 3, pr: 2, fehlerL: 0, fehlerR: 0 };
    const tvSterne = Array.from({ length: 18 }, () => ({ x: rnd() * S.w, y: rnd() * S.h, v: 6 + rnd() * 14 }));
    const rauschenBild = g.createImageData(S.w, S.h);

    function tvUpdate(dt) {
      tv.zeit += dt;
      const dauer = { pong: 24, rauschen: 0.5, titel: 8 }[tv.modus];
      if (tv.zeit > dauer) {
        tv.zeit = 0;
        if (tv.modus === 'rauschen') tv.modus = tv.naechster;
        else {
          tv.naechster = tv.modus === 'pong' ? 'titel' : 'pong';
          tv.modus = 'rauschen';
        }
      }
      if (tv.modus === 'titel') for (const s of tvSterne) s.x = (s.x - s.v * dt + S.w) % S.w;
      if (tv.modus !== 'pong') return;
      tv.bx += tv.vx * dt;
      tv.by += tv.vy * dt;
      if (tv.by < 1) { tv.by = 1; tv.vy = Math.abs(tv.vy); }
      if (tv.by > S.h - 3) { tv.by = S.h - 3; tv.vy = -Math.abs(tv.vy); }
      const folgen = (pos, fehler, aktiv) => {
        const ziel = aktiv ? tv.by - 5 + fehler : S.h / 2 - 6;
        const schritt = 40 * dt;
        return Math.max(0, Math.min(S.h - 12, pos + Math.max(-schritt, Math.min(schritt, ziel - pos))));
      };
      tv.l = folgen(tv.l, tv.fehlerL, tv.vx < 0);
      tv.r = folgen(tv.r, tv.fehlerR, tv.vx > 0);
      if (tv.vx < 0 && tv.bx <= 6 && tv.bx >= 3 && tv.by + 2 >= tv.l && tv.by <= tv.l + 12) {
        tv.vx = Math.min(95, Math.abs(tv.vx) * 1.05);
        tv.vy += (tv.by - (tv.l + 6)) * 3;
        tv.fehlerR = (rnd() - 0.5) * 18;
      }
      if (tv.vx > 0 && tv.bx + 2 >= S.w - 6 && tv.bx <= S.w - 3 && tv.by + 2 >= tv.r && tv.by <= tv.r + 12) {
        tv.vx = -Math.min(95, Math.abs(tv.vx) * 1.05);
        tv.vy += (tv.by - (tv.r + 6)) * 3;
        tv.fehlerL = (rnd() - 0.5) * 18;
      }
      tv.vy = Math.max(-60, Math.min(60, tv.vy));
      if (tv.bx < -4 || tv.bx > S.w + 2) {
        if (tv.bx < 0) tv.pr = (tv.pr + 1) % 10;
        else tv.pl = (tv.pl + 1) % 10;
        tv.bx = S.w / 2;
        tv.by = S.h / 2;
        tv.vx = tv.bx < 0 ? 50 : (rnd() < 0.5 ? 50 : -50);
        tv.vy = (rnd() - 0.5) * 50;
      }
    }

    // Flaches Bild spaltenweise auf die schräge Bildfläche übertragen (rechts weiter weg = kleiner)
    function tvAbbilden() {
      const xl = Math.round(BILD[0][0]);
      const xr = Math.round(BILD[1][0]);
      const breite = xr - xl;
      for (let x = 0; x < breite; x++) {
        const u = (x + 0.5) / breite;
        const oben = Math.round(BILD[0][1] + (BILD[1][1] - BILD[0][1]) * u);
        const unten = Math.round(BILD[3][1] + (BILD[2][1] - BILD[3][1]) * u);
        const sx = Math.min(S.w - 1, Math.floor(u * S.w));
        g.drawImage(tvBild, sx, 0, 1, S.h, xl + x, oben, 1, unten - oben);
      }
      // gewölbtes Röhrenglas: Ränder etwas dunkler, oben links ein Lichtreflex
      g.globalAlpha = 0.35;
      linie(g, ...BILD[0], ...BILD[1], '#000000');
      linie(g, ...BILD[3], ...BILD[2], '#000000');
      linie(g, ...BILD[0], ...BILD[3], '#000000');
      linie(g, ...BILD[1], ...BILD[2], '#000000');
      g.globalAlpha = 0.06;
      poly(g, [aufFlaeche(BILD, 0.04, 0.05), aufFlaeche(BILD, 0.3, 0.05), aufFlaeche(BILD, 0.1, 0.45), aufFlaeche(BILD, 0.04, 0.45)], '#ffffff');
      g.globalAlpha = 1;
    }

    function tvZeichnen(t) {
      const g = tvG;
      if (tv.modus === 'rauschen') {
        const d = rauschenBild.data;
        for (let i = 0; i < d.length; i += 4) {
          const v = Math.random() * 200 + 30;
          d[i] = v; d[i + 1] = v; d[i + 2] = v + 20; d[i + 3] = 255;
        }
        g.putImageData(rauschenBild, S.x, S.y);
      } else if (tv.modus === 'pong') {
        rect(g, S.x, S.y, S.w, S.h, '#061019');
        for (let y = 2; y < S.h; y += 5) rect(g, S.x + S.w / 2, S.y + y, 1, 3, '#1b3a4c');
        schrift(g, tv.pl, S.x + S.w / 2 - 8, S.y + 4, '#7af3ff');
        schrift(g, tv.pr, S.x + S.w / 2 + 6, S.y + 4, '#7af3ff');
        rect(g, S.x + 4, S.y + tv.l, 2, 12, '#2ff3ff');
        rect(g, S.x + S.w - 6, S.y + tv.r, 2, 12, '#2ff3ff');
        rect(g, S.x + tv.bx, S.y + tv.by, 2, 2, '#ff5fc8');
      } else {
        rect(g, S.x, S.y, S.w, S.h, '#14062c');
        for (const s of tvSterne) rect(g, S.x + s.x, S.y + s.y, 1, 1, s.v > 14 ? '#c9a0ff' : '#5a3a8a');
        const tx = S.x + Math.round((S.w - textBreite('FREISTUNDEN')) / 2);
        schrift(g, 'FREISTUNDEN', tx + 1, S.y + 17, '#5a1a6a');
        schrift(g, 'FREISTUNDEN', tx, S.y + 16, '#ff5fc8');
        const ex = S.x + Math.round((S.w - textBreite('.EXE', 2)) / 2);
        schrift(g, '.EXE', ex + 1, S.y + 25, '#3a4a10');
        schrift(g, '.EXE', ex, S.y + 24, '#d4f53c', 2);
        if (Math.floor(t * 1.8) % 2 === 0) schrift(g, 'PRESS START', S.x + Math.round((S.w - textBreite('PRESS START')) / 2), S.y + 50, '#2ff3ff');
      }
      // Röhrenbild: Zeilen, Ecken, Spiegelung
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 1; y < S.h; y += 2) g.fillRect(S.x, S.y + y, S.w, 1);
      const rollen = Math.floor((t * 22) % (S.h + 20)) - 10;
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(S.x, S.y + Math.max(0, rollen), S.w, 3);
      g.fillStyle = 'rgba(255,255,255,0.025)';
      g.beginPath();
      g.moveTo(S.x + 6, S.y);
      g.lineTo(S.x + 34, S.y);
      g.lineTo(S.x + 14, S.y + S.h);
      g.lineTo(S.x - 6, S.y + S.h);
      g.fill();
      for (const [cx, cy] of [[0, 0], [S.w - 1, 0], [0, S.h - 1], [S.w - 1, S.h - 1]]) rect(g, S.x + cx, S.y + cy, 1, 1, '#141026');
    }

    // ---------- Neonschilder draußen ----------
    function schilderZeichnen(t, o) {
      // Billboard mit Namen
      const bAn = billboardAus <= 0;
      rect(g, 260 + o, 128, 74, 14, '#12052a');
      g.globalAlpha = bAn ? 1 : 0.25;
      rect(g, 260 + o, 128, 74, 1, '#2ff3ff');
      rect(g, 260 + o, 141, 74, 1, '#2ff3ff');
      rect(g, 260 + o, 128, 1, 14, '#2ff3ff');
      rect(g, 333 + o, 128, 1, 14, '#2ff3ff');
      const bx = 260 + o + Math.round((74 - textBreite('FREISTUNDEN.EXE')) / 2);
      schrift(g, 'FREISTUNDEN', bx, 133, '#ff5fc8');
      schrift(g, '.EXE', bx + textBreite('FREISTUNDEN') + 1, 133, '#d4f53c');
      g.globalAlpha = 1;
      // Senkrechtes PLAY-Schild mit Lauflicht
      rect(g, 199 + o, 124, 7, 27, '#0e0420');
      'PLAY'.split('').forEach((b, i) => {
        const aktiv = Math.floor(t * 2.5) % 5;
        schrift(g, b, 201 + o, 126 + i * 6, i < aktiv ? '#2ff3ff' : '#164a5a');
      });
      // Neon-Dreieck auf dem Hochhaus
      const puls = 0.65 + 0.35 * Math.sin(t * 2.1);
      g.globalAlpha = puls;
      linie(g, 368 + o, 116, 359 + o, 132, '#ff6fa8');
      linie(g, 368 + o, 116, 377 + o, 132, '#ff6fa8');
      linie(g, 359 + o, 132, 377 + o, 132, '#ff6fa8');
      g.globalAlpha = 1;
      // Rundes Logo mit Play-Symbol
      const logoAn = Math.sin(t * 0.7) > -0.92 || Math.floor(t * 20) % 2 === 0;
      if (logoAn) {
        for (let a = 0; a < Math.PI * 2; a += 0.18) rect(g, 431 + o + Math.round(Math.cos(a) * 7), 140 + Math.round(Math.sin(a) * 7), 1, 1, '#ffd84a');
        for (let i = 0; i < 4; i++) rect(g, 429 + o + i, 137 + i, 1, 7 - i * 2, '#ffd84a');
      }
      // Leuchtfeuer
      if (Math.sin(t * 3) > 0.3) {
        rect(g, 342 + o, 48, 2, 2, '#ff3b3b');
        g.globalCompositeOperation = 'lighter';
        licht(g, 343 + o, 49, 8, '255,60,60', 0.6);
        g.globalCompositeOperation = 'source-over';
      }
      if (Math.sin(t * 2.2 + 1.5) > 0.4) rect(g, 366 + o, 89, 1, 1, '#ff3b3b');
    }

    function hologrammZeichnen(t, o) {
      const flackern = 0.75 + 0.15 * Math.sin(t * 9) + (Math.random() < 0.03 ? -0.4 : 0);
      g.globalAlpha = Math.max(0.2, flackern);
      g.fillStyle = 'rgba(150,70,230,0.28)';
      g.fillRect(160 + o, 64, 78, 36);
      g.fillStyle = 'rgba(210,150,255,0.7)';
      g.fillRect(160 + o, 64, 78, 1);
      g.fillRect(160 + o, 99, 78, 1);
      // Sechseck
      const cx = 199 + o, cy = 78;
      const pkt = Array.from({ length: 6 }, (_, i) => [cx + Math.cos(Math.PI / 6 + (i * Math.PI) / 3) * 9, cy + Math.sin(Math.PI / 6 + (i * Math.PI) / 3) * 9]);
      for (let i = 0; i < 6; i++) linie(g, pkt[i][0], pkt[i][1], pkt[(i + 1) % 6][0], pkt[(i + 1) % 6][1], '#ffd84a');
      rect(g, cx - 3, cy - 1, 2, 2, '#ffd84a');
      rect(g, cx + 1, cy - 1, 2, 2, '#ffd84a');
      rect(g, cx - 1, cy + 2, 2, 2, '#ffd84a');
      schrift(g, 'ARCADE', 199 + o - Math.round(textBreite('ARCADE') / 2), 91, '#ffd84a');
      const scan = 64 + Math.floor((t * 18) % 36);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(160 + o, scan, 78, 1);
      g.globalAlpha = 1;
      // Laufschrift
      g.fillStyle = 'rgba(40,220,255,0.22)';
      g.fillRect(160 + o, 104, 78, 9);
      g.save();
      g.beginPath();
      g.rect(161 + o, 104, 76, 9);
      g.clip();
      const lauf = 'WILLKOMMEN IN DER FREISTUNDE +++ WER KNACKT DEN REKORD? +++ ';
      const lw = textBreite(lauf) + 4;
      const lx = 161 + o - ((t * 16) % lw);
      schrift(g, lauf, lx, 106, '#c8fbff');
      schrift(g, lauf, lx + lw, 106, '#c8fbff');
      g.restore();
    }

    function autoZeichnen(a, t) {
      const y = Math.round(a.y + Math.sin(t * 2 + a.p) * 0.6);
      const x = Math.round(a.x);
      const vorne = a.v > 0;
      if (a.nah) {
        rect(g, x + 1, y - 1, 7, 1, '#2c1c50');
        rect(g, x, y, 9, 2, '#1a0f30');
        rect(g, x + (vorne ? 5 : 2), y - 1, 2, 1, '#7af3ff');
        g.globalAlpha = 0.7;
        rect(g, x + 1, y + 2, 7, 1, a.glow);
        g.globalAlpha = 1;
        const fx = vorne ? x + 9 : x - 1;
        rect(g, fx, y, 1, 1, '#fff6c8');
        rect(g, vorne ? x - 1 : x + 9, y, 1, 1, '#ff3b5c');
        for (let i = 1; i <= 7; i++) {
          g.globalAlpha = 0.28 * (1 - i / 8);
          rect(g, fx + (vorne ? i : -i), y, 1, 1, '#fff1b0');
        }
        g.globalAlpha = 1;
      } else {
        rect(g, x, y, 4, 1, '#1a0f30');
        rect(g, vorne ? x + 4 : x - 1, y, 1, 1, '#fff6c8');
        rect(g, vorne ? x - 1 : x + 4, y, 1, 1, '#ff3b5c');
      }
    }

    function luftschiffZeichnen(t, o) {
      const x = Math.round(luftschiff.x + o);
      const y = luftschiff.y + Math.round(Math.sin(t * 0.8) * 1);
      ellipse(g, x, y, 18, 6, '#241640');
      ellipse(g, x, y - 2, 16, 3, '#33225c');
      rect(g, x + 15, y - 7, 4, 4, '#1c1034');
      rect(g, x + 15, y + 4, 4, 3, '#1c1034');
      rect(g, x - 4, y + 6, 9, 3, '#1a0f30');
      rect(g, x - 13, y - 2, 24, 6, '#04020a');
      g.save();
      g.beginPath();
      g.rect(x - 13, y - 2, 24, 6);
      g.clip();
      const text = 'FREISTUNDEN.EXE +++ JETZT SPIELEN +++ ';
      const tw = textBreite(text) + 4;
      const lx = x - 13 - ((t * 12) % tw);
      schrift(g, text, lx, y - 1, '#2ff3ff');
      schrift(g, text, lx + tw, y - 1, '#2ff3ff');
      g.restore();
      if (Math.floor(t * 2) % 2 === 0) rect(g, x - 18, y, 1, 1, '#ff3b3b');
      else rect(g, x + 18, y, 1, 1, '#7dff6a');
    }

    function scheinwerfer(bx, by, winkel, laenge, breite, staerke) {
      const ex = bx + Math.cos(winkel) * laenge;
      const ey = by + Math.sin(winkel) * laenge;
      const nx = -Math.sin(winkel);
      const ny = Math.cos(winkel);
      const grad = g.createLinearGradient(bx, by, ex, ey);
      grad.addColorStop(0, `rgba(140,240,255,${staerke})`);
      grad.addColorStop(1, 'rgba(140,240,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(bx - nx * 1.5, by - ny * 1.5);
      g.lineTo(bx + nx * 1.5, by + ny * 1.5);
      g.lineTo(ex + nx * breite, ey + ny * breite);
      g.lineTo(ex - nx * breite, ey - ny * breite);
      g.closePath();
      g.fill();
    }

    // ---------- Katze auf der Fensterbank ----------
    function katzeZeichnen(t) {
      const atmen = Math.sin(t * 1.6) > 0 ? 0 : 1;
      const k = '#0b0615';
      rect(g, 407, 243 + atmen, 18, 7 - atmen, k);
      rect(g, 408, 242 + atmen, 15, 1, k);
      rect(g, 400, 242, 9, 8, k);
      rect(g, 400, 240, 2, 2, k);
      rect(g, 406, 240, 2, 2, k);
      // Randlicht vom Fenster
      g.globalAlpha = 0.9;
      rect(g, 408, 242 + atmen, 15, 1, '#e05ac0');
      rect(g, 400, 240, 2, 1, '#e05ac0');
      rect(g, 406, 240, 2, 1, '#e05ac0');
      rect(g, 402, 242, 4, 1, '#e05ac0');
      rect(g, 424, 243 + atmen, 1, 6 - atmen, '#9a3a8a');
      g.globalAlpha = 1;
      // Augen: meist zu, ab und zu offen und leuchtend
      if (t % 11 > 8.8) {
        rect(g, 401, 245, 2, 1, '#d4f53c');
        rect(g, 405, 245, 2, 1, '#d4f53c');
      } else {
        rect(g, 401, 245, 2, 1, '#3a2a54');
        rect(g, 405, 245, 2, 1, '#3a2a54');
      }
      // Schwanz
      const amp = 3 + 2.5 * Math.sin(t * 1.3) + (Math.sin(t * 0.37) > 0.95 ? 3 : 0);
      for (let i = 0; i < 10; i++) {
        const q = i / 9;
        rect(g, 424 + i, 249 - Math.round(q * q * amp), 1, 1, k);
      }
    }

    // ---------- Regal mit Spielhüllen ----------
    const regal = { spiele: [], lift: [], hover: -1, heraus: -1 };
    function huelle(i) {
      const s = regal.spiele[i];
      const boden = REGAL_BOEDEN[Math.floor(i / 5)];
      const h = 15 + (s.hash % 3);
      return { x: 512 + (i % 5) * 8, y: boden - h, w: 7, h, boden };
    }
    const regalZiel = (i) => (i === regal.heraus ? 22 : i === regal.hover ? 2 : 0);
    function regalUpdate(dt) {
      for (let i = 0; i < regal.spiele.length; i++) regal.lift[i] += (regalZiel(i) - regal.lift[i]) * Math.min(1, dt * 12);
    }
    function regalZeichnen(t) {
      // Neon-Leisten unter den Böden
      for (const boden of REGAL_BOEDEN) {
        g.globalAlpha = 0.6 + 0.12 * Math.sin(t * 2);
        rect(g, 508, boden + 3, 48, 1, '#2ff3ff');
        g.globalAlpha = 1;
      }
      if (regal.spiele.length) {
        g.globalAlpha = 0.8 + 0.2 * Math.sin(t * 2.4);
        schrift(g, 'ZULETZT', 507 + Math.round((50 - textBreite('ZULETZT')) / 2), 140, '#2ff3ff');
        g.globalAlpha = 1;
      }
      regal.spiele.forEach((s, i) => {
        const r = huelle(i);
        const lift = regal.lift[i] || 0;
        const y = Math.round(r.y - lift);
        const alpha = 1 - Math.min(1, Math.max(0, (lift - 2) / 20));
        if (alpha <= 0.02) return;
        g.globalAlpha = alpha;
        rect(g, r.x, y, 7, r.h, `hsl(${s.farbe},55%,42%)`);
        rect(g, r.x, y, 7, 2, `hsl(${s.farbe},55%,26%)`);
        rect(g, r.x + 1, y + 4, 5, 6, '#ddd3ee');
        rect(g, r.x + 1, y + 5, 5, 1, `hsl(${s.farbe},85%,55%)`);
        rect(g, r.x + 1, y + 7, 4, 1, '#9a8fb4');
        rect(g, r.x + 2, y + r.h - 3, 3, 1, '#f4f0ff');
        rect(g, r.x, y, 1, r.h, 'rgba(255,255,255,0.2)');
        rect(g, r.x + 6, y, 1, r.h, 'rgba(0,0,0,0.3)');
        if (i === regal.hover && i !== regal.heraus) {
          rect(g, r.x - 1, y - 1, 9, 1, '#d4f53c');
          rect(g, r.x - 1, y + r.h, 9, 1, '#d4f53c');
          rect(g, r.x - 1, y, 1, r.h, '#d4f53c');
          rect(g, r.x + 7, y, 1, r.h, '#d4f53c');
        }
        g.globalAlpha = 1;
      });
    }

    // =============================================================
    //  Strand zeichnen
    // =============================================================
    const SONNE = { x: 330, y: 142, r: 27 };
    const sonnenFarben = [[0, [255, 230, 110]], [0.55, [255, 140, 110]], [1, [255, 70, 150]]];

    function sonneZeichnen(t) {
      g.globalCompositeOperation = 'lighter';
      licht(g, SONNE.x, SONNE.y + 6, 95, '255,110,150', 0.32);
      licht(g, SONNE.x, SONNE.y, 45, '255,200,120', 0.25);
      g.globalCompositeOperation = 'source-over';
      // Retro-Sonne mit nach unten wandernden Streifen
      const lauf = Math.floor(t * 3) % 7;
      for (let dy = -SONNE.r; dy <= HORIZONT - SONNE.y; dy++) {
        if (dy > -4) {
          const luecke = 1 + Math.floor((dy + 4) / 8);
          if ((dy + 40 - lauf) % 7 < luecke) continue;
        }
        const halb = Math.round(Math.sqrt(Math.max(0, SONNE.r * SONNE.r - dy * dy)));
        if (!halb) continue;
        rect(g, SONNE.x - halb, SONNE.y + dy, halb * 2 + 1, 1, `rgb(${verlauf(sonnenFarben, (dy + SONNE.r) / (SONNE.r * 2))})`);
      }
    }

    function moeweZeichnen(m, t) {
      const x = Math.round(m.x);
      const y = Math.round(m.y0 + Math.sin(t * 0.8 + m.p) * 4);
      const gleiten = Math.sin(t * 0.5 + m.p) > 0.55;
      const oben = !gleiten && Math.sin(t * 9 + m.p) > 0;
      const s = m.gross ? 2 : 1;
      const form = oben ? [[0, 0], [1, 1], [2, 2], [3, 1], [4, 0]] : [[0, 2], [1, 1], [2, 2], [3, 1], [4, 2]];
      g.fillStyle = '#2a0e3c';
      for (const [dx, dy] of form) g.fillRect(x + dx * s, y + dy * s, s, s);
    }

    function palmeZeichnen(bx, by, hoehe, neigung, t, phase) {
      const farbe = '#1c0a2c';
      let tx = bx;
      let ty = by;
      for (let i = 0; i < hoehe; i++) {
        const k = i / hoehe;
        tx = bx + neigung * k * k * hoehe * 0.35;
        ty = by - i;
        rect(g, tx, ty, k < 0.6 ? 3 : 2, 1, farbe);
        if (i % 4 === 0) rect(g, tx, ty, 1, 1, '#3a1650');
      }
      const wedel = [-2.9, -2.4, -1.95, -1.55, -1.15, -0.7, -0.25];
      wedel.forEach((a0, n) => {
        const a = a0 + Math.sin(t * 1.1 + phase + n * 0.7) * 0.07;
        const laenge = 15 + (n % 3) * 3;
        for (let s = 0; s < laenge; s++) {
          const q = s / laenge;
          const x = tx + 1 + Math.cos(a) * s;
          const y = ty + Math.sin(a) * s + q * q * 9;
          rect(g, x, y, 1, q < 0.7 ? 2 : 1, farbe);
          if (s % 2 === 0 && s > 2) rect(g, x, y + 2, 1, 1 + (q < 0.6 ? 1 : 0), farbe);
        }
      });
      rect(g, tx, ty + 1, 2, 2, '#2a0e30');
      rect(g, tx + 2, ty + 2, 2, 2, '#2a0e30');
    }

    function liegestuhlZeichnen(t) {
      // Schatten
      g.globalAlpha = 0.3;
      ellipse(g, 300, 247, 18, 2, '#4a1a3a');
      g.globalAlpha = 1;
      const lehne = [[282, 224], [290, 222], [299, 239], [291, 241]];
      const sitz = [[291, 241], [299, 239], [314, 241], [306, 243]];
      for (let i = 0; i < 5; i++) {
        const f = i % 2 ? '#ffe4f2' : '#ff4fa8';
        poly(g, teilFlaeche(lehne, i / 5, 0, (i + 1) / 5, 1), f);
        poly(g, teilFlaeche(sitz, 0, i / 5, 1, (i + 1) / 5), f);
      }
      const holz = '#4a2018';
      linie(g, 281, 224, 290, 242, holz);
      linie(g, 290, 222, 299, 240, holz);
      linie(g, 290, 242, 287, 248, holz);
      linie(g, 306, 243, 310, 248, holz);
      linie(g, 299, 240, 302, 248, holz);
      linie(g, 314, 241, 316, 247, holz);
      // Sonnenschirm, leicht schwankend
      const sw = Math.round(Math.sin(t * 0.8) * 1);
      linie(g, 324, 247, 326 + sw, 211, '#3a1424');
      for (let dx = -17; dx <= 17; dx++) {
        const h = Math.round(Math.sqrt(1 - (dx * dx) / 289) * 7);
        const f = Math.floor((dx + 17) / 5) % 2 ? '#ffe4f2' : '#2fd8e8';
        rect(g, 326 + sw + dx, 210 - h, 1, h + 1, f);
      }
      rect(g, 309 + sw, 210, 35, 1, '#7a2a6a');
      // Handtuch
      poly(g, [[332, 243], [354, 241], [358, 246], [336, 248]], '#2ff3ff');
      poly(g, [[338, 242.5], [341, 242.2], [345, 247.4], [342, 247.6]], '#ffffff');
      poly(g, [[346, 241.8], [349, 241.5], [353, 246.8], [350, 247]], '#ffffff');
    }

    function jetskiZeichnen(t) {
      const j = jetski;
      // Kielwasser
      for (const p of j.spur) {
        const a = Math.max(0, 0.6 - p.alter * 0.35);
        if (a <= 0) continue;
        g.fillStyle = `rgba(230,245,255,${a})`;
        const breite = Math.round(p.alter * 5);
        g.fillRect(Math.round(p.x), Math.round(p.y + 2 + breite * 0.4), 2, 1);
        g.fillRect(Math.round(p.x), Math.round(p.y + 2 - breite * 0.2), 1, 1);
      }
      if (j.pause > 0) return;
      const x = Math.round(j.x);
      const y = Math.round(j.y + Math.sin(t * 9) * 0.6);
      const r = j.v > 0;
      // Gischt
      for (const s of j.gischt) {
        g.fillStyle = `rgba(255,230,245,${Math.max(0, 0.9 - s.alter * 1.6)})`;
        g.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
      }
      rect(g, x, y, 11, 2, '#f2f6ff');
      rect(g, x, y + 2, 11, 1, '#2ff3ff');
      rect(g, r ? x + 10 : x - 1, y + 1, 1, 1, '#f2f6ff');
      rect(g, x + (r ? 3 : 6), y - 1, 3, 1, '#ff4fa8');
      // Fahrer
      const fx = x + (r ? 4 : 5);
      rect(g, fx, y - 5, 2, 4, '#1c0a2c');
      rect(g, fx, y - 3, 2, 1, '#ffd84a');
      rect(g, fx, y - 7, 2, 2, '#1c0a2c');
      rect(g, fx + (r ? 2 : -1), y - 4, 1, 1, '#1c0a2c');
    }

    function strandZeichnen() {
      g.drawImage(strandHimmel, 0, 0);
      for (const s of sterne) {
        if (s.y > 82) continue;
        g.fillStyle = `rgba(255,225,255,${0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * s.s + s.p))})`;
        g.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
      }
      for (const w of strandWolken) {
        g.globalAlpha = w.a;
        g.drawImage(w.img, Math.round(w.x), Math.round(w.y));
      }
      g.globalAlpha = 1;
      sonneZeichnen(t);
      // Segelboot am Horizont
      const bx = Math.round(segelboot.x);
      rect(g, bx, HORIZONT - 2, 8, 2, '#2a0e3c');
      poly(g, [[bx + 4, HORIZONT - 13], [bx + 4, HORIZONT - 3], [bx + 9, HORIZONT - 3]], '#2a0e3c');
      poly(g, [[bx + 3, HORIZONT - 10], [bx + 3, HORIZONT - 3], [bx, HORIZONT - 3]], '#3c1650');
      g.drawImage(meer, 0, 0);
      // Spiegelung der Sonne im Wasser
      const takt = Math.floor(t * 7);
      for (let y = HORIZONT + 1; y < UFER - 3; y += 2) {
        const nah = (y - HORIZONT) / (UFER - HORIZONT);
        const breite = 30 - nah * 14;
        for (let n = 0; n < 3; n++) {
          const roh = Math.sin(y * 12.9898 + n * 78.233 + takt * 3.17) * 43758.5453;
          const zufallswert = roh - Math.floor(roh);
          const w = 2 + Math.floor(zufallswert * 7);
          const x = SONNE.x - breite / 2 + zufallswert * breite;
          g.globalAlpha = 0.75 - nah * 0.35;
          rect(g, x, y, w, 1, n % 2 ? '#ff7ab6' : '#ffd36b');
        }
      }
      g.globalAlpha = 1;
      for (const s of glitzer) {
        if (Math.sin(t * s.s + s.p) < 0.35) continue;
        g.fillStyle = 'rgba(255,190,232,0.65)';
        g.fillRect(Math.round(s.x), s.y, s.l, 1);
      }
      jetskiZeichnen(t);
      // Sand und Brandung
      g.drawImage(sand, 0, 0);
      const flut = Math.sin(t * 0.4) * 1.6;
      for (let x = FX0; x < FX1; x++) {
        const ys = Math.round(UFER + flut + 2 * Math.sin(t * 0.9 + x * 0.045) + 1.2 * Math.sin(t * 0.55 + x * 0.13));
        rect(g, x, UFER - 6, 1, ys - (UFER - 6), '#2aa4b4');
        g.fillStyle = 'rgba(70,200,210,0.55)';
        g.fillRect(x, ys - 2, 1, 2);
        g.fillStyle = '#f4f8ff';
        g.fillRect(x, ys, 1, 1);
        g.fillStyle = 'rgba(244,248,255,0.45)';
        g.fillRect(x, ys + 1, 1, 1);
        g.fillStyle = 'rgba(120,60,90,0.35)';
        g.fillRect(x, ys + 2, 1, 4);
      }
      liegestuhlZeichnen(t);
      palmeZeichnen(168, 252, 58, 1, t, 0);
      palmeZeichnen(476, 252, 74, -1, t, 2);
      for (const m of moewen) moeweZeichnen(m, t);
    }

    function strandUpdate(dt) {
      for (const w of strandWolken) {
        w.x -= w.v * dt;
        if (w.x + w.img.width < FX0 - 20) w.x = FX1 + 10 + rs() * 60;
      }
      for (const m of moewen) {
        m.x += m.v * dt;
        if (m.v > 0 && m.x > FX1 + 20) m.x = FX0 - 20;
        if (m.v < 0 && m.x < FX0 - 20) m.x = FX1 + 20;
      }
      for (const s of glitzer) {
        s.x -= s.v * dt;
        if (s.x < FX0) s.x = FX1;
      }
      segelboot.x += segelboot.v * dt;
      if (segelboot.x > FX1 + 10) segelboot.x = FX0 - 20;
      const j = jetski;
      for (const p of j.spur) p.alter += dt;
      while (j.spur.length && j.spur[0].alter > 2) j.spur.shift();
      for (const s of j.gischt) {
        s.alter += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 40 * dt;
      }
      while (j.gischt.length && j.gischt[0].alter > 0.6) j.gischt.shift();
      if (j.pause > 0) {
        j.pause -= dt;
        if (j.pause <= 0) {
          const rechts = rs() < 0.5;
          j.v = (rechts ? 1 : -1) * (40 + rs() * 18);
          j.x = rechts ? FX0 - 20 : FX1 + 20;
          j.y = 186 + Math.floor(rs() * 14);
        }
        return;
      }
      j.x += j.v * dt;
      j.spurTimer -= dt;
      if (j.spurTimer <= 0) {
        j.spur.push({ x: j.x + (j.v > 0 ? 0 : 10), y: j.y, alter: 0 });
        j.spurTimer = 0.06;
      }
      if (j.gischt.length < 40) {
        const hinten = j.x + (j.v > 0 ? -1 : 11);
        j.gischt.push({ x: hinten, y: j.y, vx: -Math.sign(j.v) * (10 + rs() * 20), vy: -20 - rs() * 18, alter: 0 });
      }
      if ((j.v > 0 && j.x > FX1 + 30) || (j.v < 0 && j.x < FX0 - 30)) j.pause = 5 + rs() * 9;
    }

    // ---------- Roter Knopf unter dem Regal ----------
    const KNOPF = { x: 524, y: 208, w: 17, h: 14, cx: 532, cy: 215 };
    function knopfZeichnen() {
      const { x, y, w, h, cx, cy } = KNOPF;
      rect(g, x, y, w, h, '#150c26');
      rect(g, x, y, w, 1, '#3a2858');
      rect(g, x, y, 1, h, '#2a1d44');
      rect(g, x, y + h - 1, w, 1, '#0a0614');
      rect(g, x + w - 1, y, 1, h, '#0a0614');
      for (const [sx, sy] of [[x + 1, y + 1], [x + w - 2, y + 1], [x + 1, y + h - 2], [x + w - 2, y + h - 2]]) rect(g, sx, sy, 1, 1, '#4a3a6a');
      ellipse(g, cx, cy, 6, 5, '#2c2046');
      ellipse(g, cx, cy, 5, 4, '#0c0716');
      const unten = knopf.druck > 0;
      ellipse(g, cx, cy + (unten ? 1 : 0), 4, 3, unten ? '#a3182c' : '#e0283e');
      if (!unten) {
        rect(g, cx - 2, cy - 2, 2, 1, '#ff8a96');
        rect(g, cx - 3, cy - 1, 1, 1, '#ff8a96');
        rect(g, cx + 1, cy + 2, 3, 1, '#8a1020');
      }
    }

    // "DRÜCK MICH" mit wippendem Pfeil unter dem Knopf
    function knopfHinweisZeichnen(t) {
      const wipp = Math.round(Math.sin(t * 4) * 0.8);
      const ay = KNOPF.y + KNOPF.h + 1 + wipp;
      const pink = '#ff7ad6';
      g.globalAlpha = 0.9 + 0.1 * Math.sin(t * 3);
      // Pfeil nach oben: breite Spitze, kurzer Schaft
      rect(g, KNOPF.cx, ay, 1, 1, pink);
      rect(g, KNOPF.cx - 1, ay + 1, 3, 1, pink);
      rect(g, KNOPF.cx - 2, ay + 2, 5, 1, pink);
      rect(g, KNOPF.cx - 3, ay + 3, 7, 1, pink);
      rect(g, KNOPF.cx - 1, ay + 4, 3, 2, pink);
      const text = 'DRÜCK MICH';
      const tx = KNOPF.cx - Math.floor(textBreite(text) / 2);
      const ty = KNOPF.y + KNOPF.h + 11;
      schrift(g, text, tx + 1, ty + 1, '#1a0a26');
      schrift(g, text, tx, ty, pink);
      g.globalAlpha = 1;
    }

    // ---------- Deko im Wohnzimmer ----------
    const lichterkette = [];
    for (const [x0, x1, n] of [[0, 108, 15], [532, 640, 15]]) {
      for (let i = 1; i < n; i++) {
        const x = x0 + ((x1 - x0) * i) / n;
        const q = (x - x0) / (x1 - x0);
        lichterkette.push({ x: Math.round(x), y: 31 + Math.round(Math.sin(q * Math.PI) * 8), f: ['#ff5fc8', '#2ff3ff', '#ffd84a', '#7dff6a'][i % 4], p: i * 1.7 });
      }
    }
    const lavaBlasen = [{ p: 0, s: 0.35, r: 2 }, { p: 2.1, s: 0.27, r: 1 }, { p: 4.2, s: 0.42, r: 1 }];

    function dekoZeichnen(t) {
      // Lichterkette: Birnen funkeln einzeln
      for (const b of lichterkette) {
        const a = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.2 + b.p));
        g.globalAlpha = a;
        rect(g, b.x, b.y + 1, 2, 2, b.f);
        g.globalAlpha = 1;
        rect(g, b.x, b.y, 2, 1, '#2a1a40');
      }

      // Neon "GAME ON" über dem Bücherregal (ein Buchstabe flackert ab und zu)
      const gx = 30, gy = 47;
      const rahmenAn = 0.85 + 0.15 * Math.sin(t * 2);
      g.globalAlpha = rahmenAn;
      rect(g, gx - 4, gy - 4, 66, 1, '#ff4fc0');
      rect(g, gx - 4, gy + 13, 66, 1, '#ff4fc0');
      rect(g, gx - 5, gy - 3, 1, 16, '#ff4fc0');
      rect(g, gx + 62, gy - 3, 1, 16, '#ff4fc0');
      g.globalAlpha = 1;
      const kaputt = Math.sin(t * 0.9) > 0.85 && Math.floor(t * 14) % 3 !== 0;
      'GAME ON'.split('').reduce((x, b, i) => {
        const aus = kaputt && i === 5;
        schrift(g, b, x, gy, aus ? '#1d4a5a' : '#2ff3ff', 2);
        return x + (zeichenBreite(b) + 1) * 2;
      }, gx);

      // Neon-Planet an der Wand
      const px = 120, py = 104;
      g.globalAlpha = 0.8 + 0.2 * Math.sin(t * 1.6);
      for (let a = 0; a < Math.PI * 2; a += 0.12) rect(g, px + Math.round(Math.cos(a) * 6), py + Math.round(Math.sin(a) * 6), 1, 1, '#ff5fc8');
      for (let a = 0; a < Math.PI * 2; a += 0.06) {
        const rx = Math.cos(a) * 12;
        const ry = Math.sin(a) * 3;
        const x = px + Math.round(rx * 0.97 - ry * 0.25);
        const y = py + Math.round(ry + rx * 0.22);
        // hinter dem Planeten nicht zeichnen
        if (Math.sin(a) < 0 && Math.hypot(x - px, y - py) < 6) continue;
        rect(g, x, y, 1, 1, '#2ff3ff');
      }
      rect(g, px + 9, py - 8, 1, 1, '#ffd84a');
      rect(g, px - 10, py + 7, 1, 1, '#ffd84a');
      g.globalAlpha = 1;

      // Neon "GG" mit Herz über der Uhr
      g.globalAlpha = 0.85 + 0.15 * Math.sin(t * 2.6 + 1);
      schrift(g, 'GG', 574, 152, '#d4f53c', 3);
      const herzAn = Math.floor(t * 1.5) % 2 === 0;
      if (herzAn) {
        for (const [dx, dy] of [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3]]) rect(g, 602 + dx * 2, 156 + dy * 2, 2, 2, '#ff4f8a');
      }
      g.globalAlpha = 1;

      // Lavalampe auf der Fensterbank
      rect(g, 177, 245, 9, 5, '#2a2240');
      rect(g, 178, 244, 7, 1, '#3a3058');
      poly(g, [[179, 232], [184, 232], [186, 244], [177, 244]], '#7a1a6a');
      for (const b of lavaBlasen) {
        const y = 238 + Math.sin(t * b.s + b.p) * 5;
        ellipse(g, 181 + Math.round(Math.sin(t * 0.7 + b.p) * 0.8), Math.round(y), b.r, b.r + 1, '#ff6fd0');
      }
      rect(g, 179, 229, 5, 3, '#2a2240');
      rect(g, 180, 228, 3, 1, '#3a3058');
    }

    function dekoLicht(t) {
      licht(g, 532, 234, 22, '255,110,210', 0.12);
      licht(g, 59, 52, 44, '47,243,255', 0.12);
      licht(g, 59, 52, 30, '255,79,192', 0.06);
      licht(g, 120, 104, 24, '255,95,200', 0.1);
      licht(g, 590, 160, 30, '212,245,60', 0.1);
      licht(g, 182, 238, 22, '255,90,210', 0.2);
    }

    function hintergrundWechseln() {
      hintergrund.ziel = 1 - hintergrund.ziel;
      hintergrund.timer = 0;
    }

    // ---------- Aktualisieren ----------
    let t = 0;

    function update(dt) {
      t += dt;
      for (const w of wolken) {
        w.x -= w.v * dt;
        if (w.x + w.img.width < FX0 - 20) w.x = FX1 + 10 + rnd() * 60;
      }
      for (let i = 0; i < autos.length; i++) {
        const a = autos[i];
        a.x += a.v * dt;
        if ((a.v > 0 && a.x > FX1 + 40) || (a.v < 0 && a.x < FX0 - 40)) autos[i] = autoNeu(a.nah, false);
      }
      if (luftschiff.pause > 0) luftschiff.pause -= dt;
      else {
        luftschiff.x += luftschiff.v * dt;
        if (luftschiff.x < FX0 - 50) {
          luftschiff.x = FX1 + 50;
          luftschiff.y = 72 + Math.floor(rnd() * 22);
          luftschiff.pause = 18 + rnd() * 20;
        }
      }
      for (const d of regen) {
        d.y += d.v * dt;
        d.x -= d.v * 0.16 * dt;
        if (d.y > FY1) {
          d.y = FY0 - rnd() * 20;
          d.x = FX0 + rnd() * (FX1 - FX0 + 60);
        }
      }
      dampfTimer -= dt;
      if (dampfTimer <= 0) {
        dampf.push({ x: 364 + rnd() * 3, y: 240, leben: 0, p: rnd() * 6 });
        dampfTimer = 0.28;
      }
      for (const d of dampf) {
        d.leben += dt;
        d.y -= 5 * dt;
      }
      while (dampf.length && dampf[0].leben > 2.6) dampf.shift();
      for (const r of router) {
        r.t -= dt;
        if (r.t <= 0) {
          r.an = !r.an;
          r.t = 0.05 + rnd() * 0.4;
        }
      }
      if (lampeFlackern > 0) {
        lampeFlackern -= dt;
        lampe = 0.25 + Math.random() * 0.75;
      } else {
        lampe = 1;
        if (Math.random() < dt * 0.12) lampeFlackern = 0.25 + Math.random() * 0.4;
      }
      if (neonAus > 0) neonAus -= dt;
      else if (Math.random() < dt * 0.05) neonAus = 0.08 + Math.random() * 0.12;
      regalUpdate(dt);
      strandUpdate(dt);
      // Hintergrund alle 60 Sekunden wechseln, sanft überblenden (ca. 2 Sekunden)
      hintergrund.timer += dt;
      if (hintergrund.timer >= WECHSEL_SEKUNDEN) hintergrundWechseln();
      const schritt = dt / 2;
      hintergrund.blend = hintergrund.ziel > hintergrund.blend ? Math.min(hintergrund.ziel, hintergrund.blend + schritt) : Math.max(hintergrund.ziel, hintergrund.blend - schritt);
      if (knopf.druck > 0) knopf.druck -= dt;
      if (billboardAus > 0) billboardAus -= dt;
      else if (Math.random() < dt * 0.08) billboardAus = 0.05 + Math.random() * 0.2;
      tvUpdate(dt);
    }

    // ---------- Zeichnen ----------
    // Eine Außenszene auf ihre eigene Leinwand zeichnen (nur der Fensterausschnitt)
    function aussenZeichnen(ctx, zeichner) {
      g = ctx;
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.clearRect(FX0 - 2, FY0 - 2, FX1 - FX0 + 4, FY1 - FY0 + 4);
      g.save();
      g.beginPath();
      g.rect(FX0, FY0, FX1 - FX0, FY1 - FY0);
      g.clip();
      zeichner();
      g.restore();
      g = hauptG;
    }

    function zeichnen() {
      const k = hintergrund.blend;
      if (k < 1) aussenZeichnen(stadtG, stadtZeichnen);
      if (k > 0) aussenZeichnen(strandG, strandZeichnen);

      g = hauptG;
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, W, H);
      g.save();
      g.beginPath();
      g.rect(FX0, FY0, FX1 - FX0, FY1 - FY0);
      g.clip();
      if (k < 1) g.drawImage(stadtC, 0, 0);
      if (k > 0) {
        g.globalAlpha = k;
        g.drawImage(strandC, 0, 0);
        g.globalAlpha = 1;
      }
      g.drawImage(spiegelung, 0, 0);
      g.restore();
      raumZeichnen(k);
    }

    function stadtZeichnen() {
      // feste Ebenen – die Szene reagiert nicht auf die Maus
      const oS = 0, oF = 0, oM = 0, oN = 0, oY = 0;

      g.drawImage(himmel, oS, 0);
      for (const s of sterne) {
        const b = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.s + s.p));
        g.fillStyle = `rgba(255,225,255,${b})`;
        const x = Math.round(s.x + oS), y = Math.round(s.y);
        g.fillRect(x, y, 1, 1);
        if (s.gross && b > 0.8) {
          g.fillStyle = `rgba(255,225,255,${(b - 0.8) * 2})`;
          g.fillRect(x - 1, y, 3, 1);
          g.fillRect(x, y - 1, 1, 3);
        }
      }
      for (const w of wolken) {
        g.globalAlpha = w.a;
        g.drawImage(w.img, Math.round(w.x + oS), Math.round(w.y));
      }
      g.globalAlpha = 1;

      g.drawImage(fern.c, oF, oY);
      for (const f of fern.funkeln) rect(g, f.x + oF, f.y + oY, 1, 1, Math.sin(t * f.s + f.p) > 0.55 ? f.aus : f.f);
      for (const a of autos) if (!a.nah) autoZeichnen({ ...a, x: a.x + oF, y: a.y + oY }, t);

      g.globalCompositeOperation = 'lighter';
      scheinwerfer(232 + oF, 252, -Math.PI / 2 + Math.sin(t * 0.25) * 0.55, 240, 22, 0.16);
      scheinwerfer(452 + oF, 252, -Math.PI / 2 + Math.sin(t * 0.21 + 2) * 0.6, 240, 22, 0.14);
      const saeule = g.createLinearGradient(0, 44, 0, 62);
      saeule.addColorStop(0, 'rgba(110,230,255,0)');
      saeule.addColorStop(1, `rgba(110,230,255,${0.35 + 0.1 * Math.sin(t * 4)})`);
      g.fillStyle = saeule;
      g.fillRect(340 + oM, 30, 6, 32);
      g.globalCompositeOperation = 'source-over';

      hologrammZeichnen(t, oM);
      g.drawImage(mitte.c, oM, oY);
      for (const f of mitte.funkeln) rect(g, f.x + oM, f.y + oY, f.w, f.h, Math.sin(t * f.s + f.p) > 0.6 ? f.aus : f.f);
      g.save();
      g.translate(0, oY);
      schilderZeichnen(t, oM);
      g.restore();

      if (luftschiff.pause <= 0) luftschiffZeichnen(t, oM);
      for (const a of autos) if (a.nah) autoZeichnen({ ...a, x: a.x + oM, y: a.y + oY }, t);

      g.drawImage(nah, oN, oY);
      if (Math.floor(t * 1.3) % 6 !== 0) {
        g.globalAlpha = 0.95;
        'OFFEN'.split('').forEach((b, i) => schrift(g, b, 490 + oN, 186 + oY + i * 6, '#ff5f8f'));
        g.globalAlpha = 1;
      }

      for (const d of regen) {
        g.fillStyle = d.vorne ? 'rgba(200,210,255,0.42)' : 'rgba(170,180,255,0.24)';
        g.fillRect(Math.round(d.x), Math.round(d.y), 1, d.vorne ? d.l + 1 : d.l);
      }
    }

    function raumZeichnen(k) {
      // Zimmer
      g.drawImage(raum, 0, 0);

      // Neonröhre unter dem Träger
      const neon = neonAus > 0 ? 0.15 : 0.85 + 0.15 * Math.sin(t * 3);
      g.globalAlpha = neon;
      rect(g, 160, 30, 330, 2, '#ff6fe0');
      rect(g, 160, 30, 330, 1, '#ffd0f6');
      g.globalAlpha = 1;

      tvZeichnen(t);
      tvAbbilden();

      // Uhr mit echter Zeit
      const jetzt = new Date();
      const hh = String(jetzt.getHours()).padStart(2, '0');
      const mm = String(jetzt.getMinutes()).padStart(2, '0');
      const ux = 561 + Math.round((62 - textBreite('88:88', 3)) / 2);
      schrift(g, '88 88', ux, 190, '#3a0a12', 3);
      schrift(g, `${hh}${jetzt.getSeconds() % 2 ? ' ' : ':'}${mm}`, ux, 190, '#ff4545', 3);

      // LEDs
      rect(g, ...aufFlaeche(SCHRANK.vorne, 0.86, 0.2), 2, 1, `rgba(125,255,106,${0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.4))})`);
      router.forEach((r, i) => rect(g, 230 + i * 4, 247, 1, 1, r.an ? '#7af3ff' : '#22324a'));
      rect(g, ...aufFlaeche(TV.vorne, 0.7, 0.94), 1, 1, '#ff4b4b');

      // Lampe
      rect(g, 609, 52, 7, 2, `rgba(255,${110 + 80 * lampe},${110 + 40 * lampe},${0.4 + 0.6 * lampe})`);

      // Dampf
      for (const d of dampf) {
        const a = Math.max(0, 0.65 * (1 - d.leben / 2.6));
        g.fillStyle = `rgba(230,210,255,${a})`;
        g.fillRect(Math.round(d.x + Math.sin(d.leben * 2.4 + d.p) * 1.6), Math.round(d.y), 1, 1);
      }

      katzeZeichnen(t);
      regalZeichnen(t);
      knopfZeichnen();
      knopfHinweisZeichnen(t);
      dekoZeichnen(t);

      // Lichtstimmung
      g.globalCompositeOperation = 'lighter';
      // Licht vom Fenster: lila bei der Stadt, warm bei Sonnenuntergang am Strand
      if (k < 1) {
        g.globalAlpha = (0.7 + 0.3 * neon) * (1 - k);
        g.drawImage(fensterlicht, 0, 0);
      }
      if (k > 0) {
        g.globalAlpha = 1.1 * k;
        g.drawImage(fensterlichtStrand, 0, 0);
      }
      g.globalAlpha = 1;
      licht(g, 532, 215, 18, '255,40,60', 0.16 + 0.08 * Math.sin(t * 3));
      dekoLicht(t);
      const neonGrad = g.createLinearGradient(0, 32, 0, 96);
      neonGrad.addColorStop(0, `rgba(255,80,220,${0.24 * neon})`);
      neonGrad.addColorStop(1, 'rgba(255,80,220,0)');
      g.fillStyle = neonGrad;
      g.fillRect(120, 32, 400, 64);
      const tvFarbe = tv.modus === 'pong' ? '70,215,255' : tv.modus === 'titel' ? '255,90,210' : '220,220,255';
      const tvStaerke = tv.modus === 'rauschen' ? 0.18 + Math.random() * 0.12 : 0.17 + Math.random() * 0.025;
      const [tvx, tvy] = aufFlaeche(BILD, 0.5, 0.5);
      licht(g, tvx + 10, tvy, 120, tvFarbe, tvStaerke);
      licht(g, tvx + 30, 270, 90, tvFarbe, tvStaerke * 0.5);
      licht(g, 612, 58, 70, '255,60,80', 0.26 * lampe);
      licht(g, 600, 200, 60, '255,60,80', 0.12 * lampe);
      licht(g, 592, 197, 44, '255,60,60', 0.16);
      for (const boden of REGAL_BOEDEN) licht(g, 532, boden + 8, 28, '47,243,255', 0.13);
      g.globalCompositeOperation = 'source-over';

      g.drawImage(vignette, 0, 0);

      // Leuchten (Bloom) auf zweiter, weich skalierter Leinwand
      if (gg) {
        gg.clearRect(0, 0, glanz.width, glanz.height);
        gg.filter = 'brightness(0.75) contrast(2) saturate(1.6) blur(1.2px)';
        gg.drawImage(haupt, 0, 0, glanz.width, glanz.height);
        gg.filter = 'none';
      }
    }

    return {
      update,
      zeichnen,
      zeige(zeit) {
        update(zeit);
        zeichnen();
      },
      regal: {
        setzen(liste) {
          regal.spiele = liste.slice(0, REGAL_PLAETZE);
          regal.lift = regal.spiele.map(() => 0);
          regal.hover = -1;
          regal.heraus = -1;
        },
        // Welche Spielhülle liegt an dieser Stelle (Koordinaten im 640×360-Raster)?
        treffer(x, y) {
          for (let i = 0; i < regal.spiele.length; i++) {
            const r = huelle(i);
            if (x >= r.x - 1 && x <= r.x + r.w && y >= r.y - 3 && y <= r.boden) return i;
          }
          return -1;
        },
        hover(i) {
          regal.hover = i;
        },
        heraus(i) {
          regal.heraus = i;
        },
        rechteck(i) {
          const r = huelle(i);
          return { x: r.x, y: r.y - (regal.lift[i] || 0), w: r.w, h: r.h };
        },
        sofort() {
          regal.lift = regal.spiele.map((_, i) => regalZiel(i));
        },
      },
      knopf: {
        treffer: (x, y) => x >= KNOPF.x && x < KNOPF.x + KNOPF.w && y >= KNOPF.y && y < KNOPF.y + KNOPF.h,
        druecken() {
          knopf.druck = 0.18;
          hintergrundWechseln();
        },
        sofort() {
          hintergrund.blend = hintergrund.ziel;
          knopf.druck = 0;
        },
        get strand() {
          return hintergrund.ziel === 1;
        },
      },
    };
  }

  // ---------- Start mit Animationsschleife ----------
  function start(haupt, glanz, { bewegt = true } = {}) {
    const szene = erstellen(haupt, glanz);
    let laeuft = false;
    let raf = 0;
    let letzte = 0;
    function frame(jetzt) {
      const dt = Math.min(0.05, (jetzt - letzte) / 1000 || 0);
      letzte = jetzt;
      szene.update(dt);
      szene.zeichnen();
      if (laeuft) raf = requestAnimationFrame(frame);
    }
    const steuerung = {
      W, H,
      get laeuft() { return laeuft; },
      weiter() {
        if (laeuft) return;
        laeuft = true;
        letzte = performance.now();
        raf = requestAnimationFrame(frame);
      },
      pause() {
        laeuft = false;
        cancelAnimationFrame(raf);
      },
    };
    // Regal-Steuerung; ist die Animation angehalten, wird sofort neu gezeichnet
    const neuZeichnen = () => {
      if (!laeuft) {
        szene.regal.sofort();
        szene.zeichnen();
      }
    };
    steuerung.regal = {
      setzen(liste) { szene.regal.setzen(liste); neuZeichnen(); },
      treffer: szene.regal.treffer,
      hover(i) { szene.regal.hover(i); neuZeichnen(); },
      heraus(i) { szene.regal.heraus(i); neuZeichnen(); },
      rechteck: szene.regal.rechteck,
    };
    steuerung.knopf = {
      treffer: szene.knopf.treffer,
      druecken() {
        szene.knopf.druecken();
        if (!laeuft) {
          szene.knopf.sofort();
          szene.zeichnen();
        }
      },
      get strand() {
        return szene.knopf.strand;
      },
    };
    szene.zeige(12);
    if (bewegt) steuerung.weiter();
    return steuerung;
  }

  return { start, W, H };
})();
