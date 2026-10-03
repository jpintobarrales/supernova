'use strict';

/* ================= utilidades ================= */

const $ = (sel) => document.querySelector(sel);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

const COLORS = {
  ink: '#141414',
  pink: '#FF4DCC',
  white: '#F6F5EF',
  lime: '#FFD400',
  cyan: '#4DE3FF',
  green: '#2FE85A',
  orange: '#FF7A45',
  red: '#FF4D00',
  yellow: '#FFC53F',
  purple: '#A45CFF',
  sky: '#7EC8F7',
  grass: '#8BC94F',
};

/* personajes: fotos en ./personajes (1.png / 2.png, tambien acepta jpg/jpeg/webp) */
const CHARS = [
  { name: 'CONI LEWIN', shirt: '#FF4DCC' },
  { name: 'CONI LÜER', shirt: '#4DE3FF' },
];
const CHAR_IMGS = [null, null];

function loadCharImage(i) {
  const exts = ['png', 'jpg', 'jpeg', 'webp'];
  const tryExt = (n) => {
    if (n >= exts.length) return;
    const img = new Image();
    img.onload = () => {
      CHAR_IMGS[i] = img;
      const el = $('#charImg' + (i + 1));
      if (el) { el.src = img.src; el.classList.remove('hidden'); }
      const fb = $('#charFb' + (i + 1));
      if (fb) fb.classList.add('hidden');
    };
    img.onerror = () => tryExt(n + 1);
    img.src = 'personajes/' + (i + 1) + '.' + exts[n];
  };
  tryExt(0);
}

/* sprites del juego: si el PNG existe en ./sprites se usa, si no queda el dibujo vectorial */
const SPRITES = { car: [null, null], tire: null, coin: null, can: null, bg: null };

function loadSprite(set, base) {
  const exts = ['png', 'jpg', 'jpeg', 'webp'];
  const tryExt = (n) => {
    if (n >= exts.length) return;
    const img = new Image();
    img.onload = () => { set(img); };
    img.onerror = () => tryExt(n + 1);
    img.src = 'sprites/' + base + '.' + exts[n];
  };
  tryExt(0);
}

function spriteReady(img) {
  return !!(img && img.complete && img.naturalWidth);
}

/* ================= helpers de dibujo ================= */

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function star(g, cx, cy, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const d = i % 2 ? r * 0.45 : r;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.closePath();
}

function cloud(g, x, y, s) {
  g.beginPath();
  g.arc(x, y, 18 * s, 0, TAU);
  g.arc(x - 17 * s, y + 5 * s, 13 * s, 0, TAU);
  g.arc(x + 17 * s, y + 5 * s, 14 * s, 0, TAU);
  g.arc(x + 3 * s, y - 9 * s, 12 * s, 0, TAU);
  g.fill();
}

/* ================= motor del juego ================= */

function createGame(canvas, hooks) {
  const g = canvas.getContext('2d');
  const W = 800, H = 240;
  const GRASS_TOP = 150, ROAD_TOP = 198, ROAD_Y = 200;
  const CAR_X = 56;

  let hi = 0;
  try { hi = +(localStorage.getItem('caddy-run-hi') || 0); } catch (_) {}

  const S = {
    mode: 'idle',
    charIndex: 0,
    speed: 6,
    score: 0,
    hi,
    dist: 0,
    p: { y: ROAD_Y, vy: 0, onGround: true },
    obs: [],
    items: [],
    pops: [],
    clouds: [],
    next: 300,
    frame: 0,
    anim: 0,
    t: 0,
    overT: 0,
    lastEmitBucket: -1,
  };

  for (let i = 0; i < 7; i++) {
    S.clouds.push({ x: rnd(0, 800), y: rnd(18, 92), s: rnd(0.7, 1.4), v: rnd(0.1, 0.28) });
  }

  const emit = () => hooks.onState({
    mode: S.mode,
    score: Math.floor(S.score),
    hi: S.hi,
    level: Math.floor(S.score / 5000) + 1,
    charIndex: S.charIndex,
  });

  function start(charIndex) {
    if (typeof charIndex === 'number') S.charIndex = charIndex;
    S.mode = 'play';
    S.speed = 6;
    S.score = 0;
    S.obs = [];
    S.items = [];
    S.pops = [];
    S.next = 320;
    S.overT = 0;
    S.p = { y: ROAD_Y, vy: 0, onGround: true };
    emit();
  }

  function toSelect() {
    S.mode = 'idle';
    S.overT = 0;
    emit();
  }

  function jump() {
    if (S.mode !== 'play') return;
    if (S.p.onGround) {
      S.p.vy = -11.8;
      S.p.onGround = false;
    }
  }

  function hit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function spawnWave() {
    if (Math.random() < 0.6) {
      if (Math.random() < 0.65) {
        const count = S.speed > 8.5 && Math.random() < 0.4 ? 2 : 1;
        const size = Math.random() < 0.5 ? 36 : 48;
        for (let i = 0; i < count; i++) {
          S.obs.push({ kind: 'tire', x: 830 + i * (size + 6), w: size, h: size, y: ROAD_Y - size });
        }
      } else {
        const h = 46 + Math.round(rnd(0, 8));
        S.obs.push({ kind: 'can', x: 830, w: 38, h, y: ROAD_Y - h });
      }
    }

    const level = Math.floor(S.score / 5000);
    if (Math.random() < 0.48 + 0.04 * Math.min(5, level)) {
      const high = Math.random() < 0.5;
      S.items.push({
        cx: 830 + rnd(170, 260),
        y: high ? ROAD_Y - 58 : ROAD_Y - 16,
        s: high ? 28 : 24,
        val: Math.round((high ? 60 : 30) * (1 + 0.5 * level)),
        t: rnd(0, 6),
      });
    }
    S.next = rnd(300, 560) * Math.max(1, S.speed / 7);
  }

  function update(dt) {
    S.t += dt;
    S.anim += dt;

    if (S.mode === 'over') { S.overT += dt; return; }

    const spd = S.mode === 'play' ? S.speed : 2;
    S.dist += spd * dt;

    S.clouds.forEach((c) => {
      c.x -= (c.v + spd * 0.05) * dt;
      if (c.x < -70) { c.x = 830 + rnd(0, 60); c.y = rnd(18, 92); c.s = rnd(0.7, 1.4); }
    });

    if (S.mode !== 'play') return;

    const p = S.p;
    p.vy += 0.62 * dt;
    p.y += p.vy * dt;
    if (p.y >= ROAD_Y) { p.y = ROAD_Y; p.vy = 0; p.onGround = true; }

    S.speed = 6 + 11 * Math.log2(1 + S.score / 5005);
    S.score += 0.018 * S.speed * dt;

    const level = Math.floor(S.score / 5000) + 1;
    const prevLevel = Math.floor((S.score - 0.018 * S.speed * dt) / 5000) + 1;
    if (level > prevLevel) {
      S.pops.push({ x: 400, y: 60, txt: 'LEVEL ' + level, t: 0, big: true });
    }

    S.next -= S.speed * dt;
    if (S.next <= 0) spawnWave();

    S.obs.forEach((o) => { o.x -= S.speed * dt; });
    S.obs = S.obs.filter((o) => o.x + o.w > -12);
    S.items.forEach((it) => { it.cx -= S.speed * dt; it.t += dt; });
    S.items = S.items.filter((it) => it.cx + it.s > -12);
    S.pops.forEach((pp) => { pp.t += dt; pp.y -= 0.5 * dt; });
    S.pops = S.pops.filter((pp) => pp.t < 50);

    const sweep = S.speed * dt;
    const player = { x: CAR_X + 10, y: p.y - 34, w: 106, h: 30 };

    for (const it of S.items) {
      if (!it.got && hit(player, { x: it.cx - it.s / 2, y: it.y - it.s / 2, w: it.s + sweep, h: it.s })) {
        it.got = true;
        S.score += it.val;
        S.pops.push({ x: it.cx, y: it.y - 14, txt: '+' + it.val, t: 0, big: false });
      }
    }
    S.items = S.items.filter((it) => !it.got);

    for (const o of S.obs) {
      const box = o.kind === 'tire'
        ? { x: o.x + 5, y: o.y + 5, w: o.w - 10 + sweep, h: o.h - 10 }
        : { x: o.x + 6, y: o.y + 4, w: o.w - 12 + sweep, h: o.h - 4 };
      if (hit(player, box)) {
        S.mode = 'over';
        const final = Math.floor(S.score);
        if (final > S.hi) {
          S.hi = final;
          try { localStorage.setItem('caddy-run-hi', String(S.hi)); } catch (_) {}
        }
        emit();
        return;
      }
    }

    const bucket = Math.floor(S.score / 100);
    if (bucket !== S.lastEmitBucket) {
      S.lastEmitBucket = bucket;
      emit();
    }
  }

  /* ---------- escenario ---------- */

  function drawSunClouds() {
    // sol
    const sx = 716, sy = 42;
    g.fillStyle = 'rgba(255,233,138,.5)';
    g.beginPath(); g.arc(sx, sy, 34, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,217,59,.85)';
    g.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + S.t * 0.004;
      g.beginPath();
      g.moveTo(sx + Math.cos(a) * 40, sy + Math.sin(a) * 40);
      g.lineTo(sx + Math.cos(a) * 50, sy + Math.sin(a) * 50);
      g.stroke();
    }
    g.fillStyle = '#FFD93B';
    g.beginPath(); g.arc(sx, sy, 21, 0, TAU); g.fill();
    g.strokeStyle = COLORS.ink; g.lineWidth = 2.5; g.stroke();

    // nubes
    g.fillStyle = 'rgba(255,255,255,.92)';
    S.clouds.forEach((c) => cloud(g, c.x, c.y, c.s));
  }

  function drawSky() {
    g.fillStyle = COLORS.sky;
    g.fillRect(0, 0, W, GRASS_TOP + 20);

    drawSunClouds();

    // colinas lejanas
    g.fillStyle = '#7CB45B';
    const hp = 160, ho = (S.dist * 0.16) % hp;
    g.beginPath();
    g.moveTo(-hp - ho, GRASS_TOP + 20);
    for (let bx = -hp - ho; bx < W + hp; bx += hp) {
      g.quadraticCurveTo(bx + hp / 2, GRASS_TOP - 26, bx + hp, GRASS_TOP + 20);
    }
    g.lineTo(W + hp, GRASS_TOP + 20);
    g.closePath();
    g.fill();
  }

  function srand(i) {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function drawField() {
    g.fillStyle = COLORS.grass;
    g.fillRect(0, GRASS_TOP, W, ROAD_TOP - GRASS_TOP);
    g.fillStyle = '#A5D96B';
    g.fillRect(0, GRASS_TOP, W, 5);
    g.fillStyle = '#7FB544';
    g.fillRect(0, ROAD_TOP - 6, W, 6);

    // arboles y arbustos (parallax lento, posiciones deterministicas)
    const ts = 230, to = (S.dist * 0.42) % ts;
    const i0 = Math.floor((S.dist * 0.42) / ts);
    for (let i = i0 - 1; i < i0 + W / ts + 2; i++) {
      const x = i * ts - (S.dist * 0.42) + srand(i) * 90;
      const r = 13 + srand(i * 3.7) * 15;
      const base = 178 + srand(i * 1.3) * 6;
      g.fillStyle = '#6D9A3E';
      g.beginPath(); g.arc(x, base - r, r, 0, TAU); g.fill();
      g.fillStyle = '#5E8C34';
      g.beginPath(); g.arc(x - r * 0.5, base - r * 0.6, r * 0.66, 0, TAU); g.fill();
      g.fillStyle = '#7A5A33';
      g.fillRect(x - 2, base - 4, 4, 8);
    }

    // alambrado
    g.fillStyle = '#8A5A2B';
    const fs = 74, fo = (S.dist * 0.55) % fs;
    for (let x = -fo; x < W + fs; x += fs) {
      g.fillRect(x, 176, 3, 17);
      g.fillRect(x, 180, fs, 2);
      g.fillRect(x, 187, fs, 2);
    }
  }

  function drawRoad() {
    g.fillStyle = '#EDEDE6';
    g.fillRect(0, ROAD_TOP, W, 3);
    g.fillStyle = '#56565C';
    g.fillRect(0, ROAD_TOP + 3, W, H - ROAD_TOP - 3);
    g.fillStyle = '#46464B';
    g.fillRect(0, H - 6, W, 6);
    g.fillStyle = '#F7D54D';
    const ds = 56, dOff = S.dist % ds;
    for (let x = -dOff; x < W; x += ds) {
      g.fillRect(x, 222, 26, 4);
    }
  }

  // fondo generado (santiago de noche): cubre el canvas anclado abajo y
  // se desplaza con S.dist; los tiles impares van espejados para ocultar la junta
  function drawBgImage(img) {
    const ih = img.naturalHeight || 1;
    const iw = img.naturalWidth || 1;
    const dh = W * (ih / iw) * 1.02;   // un poco más alto que el canvas, anclado abajo
    const dy = H - dh;
    const tile = Math.floor(S.dist / W);
    const off = S.dist % W;

    for (let i = 0; i < 2; i++) {
      const n = tile + i;
      const x = i === 0 ? -off : W - off;
      if (n % 2 === 0) {
        g.drawImage(img, 0, 0, iw, ih, x, dy, W, dh);
      } else {
        g.save();
        g.translate(x + W, 0);
        g.scale(-1, 1);
        g.drawImage(img, 0, 0, iw, ih, 0, dy, W, dh);
        g.restore();
      }
    }
  }

  /* ---------- obstaculos ---------- */

  function drawTire(o) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2, r = o.w / 2;
    g.fillStyle = 'rgba(20,20,20,.2)';
    g.beginPath(); g.ellipse(cx, ROAD_Y + 4, r * 0.9, 4, 0, 0, TAU); g.fill();

    const spr = SPRITES.tire;
    if (spriteReady(spr)) {
      // balanceo leve mientras se desplaza (la perspectiva del sprite no permite roll)
      const rot = Math.sin(S.dist / 26 + o.x * 0.01) * 0.07;
      const th = o.h * 1.06;
      const tw = th * (spr.naturalWidth / spr.naturalHeight);
      g.save();
      g.translate(cx, o.y + o.h);
      g.rotate(rot);
      g.drawImage(spr, -tw / 2, -th, tw, th);
      g.restore();
      return;
    }

    g.fillStyle = '#1E1E1E';
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
    const rot = S.dist / r;
    g.fillStyle = '#0C0C0C';
    for (let i = 0; i < 12; i++) {
      const a = rot + i * Math.PI / 6;
      g.save();
      g.translate(cx, cy);
      g.rotate(a);
      g.fillRect(r - 4, -2, 4, 4);
      g.restore();
    }
    g.fillStyle = '#3A3A3A';
    g.beginPath(); g.arc(cx, cy, r * 0.6, 0, TAU); g.fill();
    g.fillStyle = '#C9CDD2';
    g.beginPath(); g.arc(cx, cy, r * 0.34, 0, TAU); g.fill();
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = COLORS.ink;
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5 - rot * 1.5;
      g.beginPath();
      g.arc(cx + Math.cos(a) * r * 0.2, cy + Math.sin(a) * r * 0.2, 1.4, 0, TAU);
      g.fill();
    }
  }

  function drawCan(o) {
    const { x, y, w, h } = o;
    g.fillStyle = 'rgba(20,20,20,.2)';
    g.beginPath(); g.ellipse(x + w / 2, ROAD_Y + 4, w * 0.7, 4, 0, 0, TAU); g.fill();

    const spr = SPRITES.can;
    if (spriteReady(spr)) {
      const ch = h * 1.06;
      const cw = ch * (spr.naturalWidth / spr.naturalHeight);
      g.drawImage(spr, x + w / 2 - cw / 2, y + h - ch, cw, ch);
      return;
    }

    // asa superior
    g.fillStyle = '#C0924F';
    rr(g, x + w * 0.28, y, w * 0.44, 7, 2); g.fill();
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 2.2;
    g.stroke();

    // cuerpo del bidon
    g.fillStyle = '#C0924F';
    rr(g, x, y + 5, w, h - 5, 3); g.fill();
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 2.5;
    g.stroke();

    // costillas laterales del bidon
    g.strokeStyle = 'rgba(20,20,20,.28)';
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x + 5, y + 13); g.lineTo(x + 5, y + h - 6); g.stroke();
    g.beginPath(); g.moveTo(x + w - 5, y + 13); g.lineTo(x + w - 5, y + h - 6); g.stroke();

    // panel en relieve frontal
    g.fillStyle = '#A87E3F';
    rr(g, x + 8, y + 14, w - 16, h - 24, 2); g.fill();
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 1.6;
    g.stroke();

    // tapa negra
    g.fillStyle = '#20242C';
    rr(g, x + w - 11, y + 7, 8, 8, 2); g.fill();
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 2;
    g.stroke();

    // letras
    g.fillStyle = '#F6F5EF';
    g.font = 'bold 9px "Silkscreen", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('GAS', x + w / 2, y + 14 + (h - 24) / 2);
  }

  function drawCoin(it) {
    const spin = Math.cos(it.t / 9);
    g.save();
    g.translate(it.cx, it.y + 3 * Math.sin(it.t / 10));
    g.scale(Math.abs(spin) * 0.8 + 0.2, 1);
    const spr = SPRITES.coin;
    if (spriteReady(spr)) {
      const s = it.s * 1.15;
      g.drawImage(spr, -s / 2, -s / 2, s, s);
      g.restore();
      return;
    }
    g.fillStyle = COLORS.yellow;
    g.beginPath(); g.arc(0, 0, it.s / 2, 0, TAU); g.fill();
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#E8A20C';
    star(g, 0, 0, it.s * 0.28);
    g.fill();
    g.restore();
  }

  /* ---------- auto y conductora/or ---------- */

  function drawWheel(x, y) {
    const r = 11;
    g.fillStyle = '#1B1B1B';
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = COLORS.white;
    g.beginPath(); g.arc(x, y, r * 0.6, 0, TAU); g.fill();
    // tapacubos cromado estilo de ville
    g.fillStyle = '#D8DDE2';
    g.beginPath(); g.arc(x, y, r * 0.46, 0, TAU); g.fill();
    g.strokeStyle = '#9AA0A6';
    g.lineWidth = 1.4;
    g.beginPath(); g.arc(x, y, r * 0.31, 0, TAU); g.stroke();
    g.fillStyle = '#EFF1F4';
    g.beginPath(); g.arc(x, y, r * 0.13, 0, TAU); g.fill();
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  }

  function drawAvatar(ci, x, y, size, border) {
    const img = CHAR_IMGS[ci];
    g.save();
    if (img && img.complete && img.naturalWidth) {
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const side = Math.min(iw, ih) * 0.94;
      const sx = (iw - side) / 2;
      const sy = Math.max(0, (ih - side) * 0.06);
      g.drawImage(img, sx, sy, side, side, Math.round(x), Math.round(y), size, size);
    } else {
      g.fillStyle = '#E8B48C';
      g.fillRect(x, y, size, size);
      g.fillStyle = ci === 0 ? '#141414' : '#8A6A3A';
      g.fillRect(x, y, size, size * 0.45);
      g.fillStyle = COLORS.ink;
      g.fillRect(x + size * 0.24, y + size * 0.55, size * 0.12, size * 0.12);
      g.fillRect(x + size * 0.64, y + size * 0.55, size * 0.12, size * 0.12);
      g.fillStyle = '#C2607A';
      g.fillRect(x + size * 0.38, y + size * 0.78, size * 0.24, size * 0.1);
    }
    g.restore();
    if (border) {
      g.strokeStyle = COLORS.ink;
      g.lineWidth = 2;
      g.strokeRect(x, y, size, size);
    }
  }

  // conductora/or dibujado/a como personaje pixelado 8 bits (no un cuadrado):
  // pelo, cara y ropa tomados de los rasgos de cada retrato, con brazo al volante
  function drawDriver(ci, x, y) {
    const P = ci === 0
      ? { hair: '#1B1B1B', hairHi: '#404040', skin: '#EFB48D', top: '#F3EDE2', dot1: '#F06292', dot2: '#4C9A4C' }
      : { hair: '#C9974C', hairHi: '#E8C078', skin: '#F2C9A0', top: '#5B7FB4', dot1: '#7FA3D6', dot2: '#3E6396' };
    const bob = S.p.onGround && S.mode === 'play' ? Math.round(Math.sin(S.anim / 5)) : 0;
    y += bob;
    const ink = COLORS.ink;

    // pelo largo de mujer: copete amplio y mechones cayendo por los hombros
    g.fillStyle = P.hair;
    g.fillRect(x + 3, y + 1, 13, 5);     // copete
    g.fillRect(x + 2, y + 4, 3, 14);     // mechon izquierdo largo
    g.fillRect(x + 14, y + 4, 3, 14);    // mechon derecho largo
    g.fillRect(x + 1, y + 9, 2, 7);      // punta suelta izquierda
    g.fillRect(x + 16, y + 9, 2, 7);     // punta suelta derecha
    g.fillStyle = P.hairHi;
    g.fillRect(x + 5, y + 2, 3, 1);
    g.fillRect(x + 11, y + 2, 2, 1);
    g.fillRect(x + 3, y + 6, 1, 6);
    g.fillRect(x + 15, y + 6, 1, 6);

    // cara
    g.fillStyle = P.skin;
    g.fillRect(x + 4, y + 4, 11, 9);
    g.strokeStyle = ink;
    g.lineWidth = 1.4;
    g.strokeRect(x + 4, y + 4, 11, 9);

    // ojos y boca
    g.fillStyle = ink;
    g.fillRect(x + 7, y + 7, 2, 2);
    g.fillRect(x + 11, y + 7, 2, 2);
    g.fillStyle = '#C2607A';
    g.fillRect(x + 8, y + 10.5, 4, 1.5);

    // cuello y torso
    g.fillStyle = P.skin;
    g.fillRect(x + 8, y + 13, 3, 2);
    g.fillStyle = P.top;
    g.fillRect(x + 3, y + 15, 13, 9);
    g.strokeStyle = ink;
    g.lineWidth = 1.4;
    g.strokeRect(x + 3, y + 15, 13, 9);
    g.fillStyle = P.dot1;
    g.fillRect(x + 5, y + 17, 2, 2);
    g.fillStyle = P.dot2;
    g.fillRect(x + 11, y + 19, 2, 2);

    // brazo extendido hacia el volante
    g.fillStyle = P.top;
    g.fillRect(x + 13, y + 16, 8, 3);
    g.strokeStyle = ink;
    g.lineWidth = 1.2;
    g.strokeRect(x + 13, y + 16, 8, 3);
    g.fillStyle = P.skin;
    g.fillRect(x + 20, y + 16, 2.5, 3);
  }

  const CAR_SPR_W = 150, CAR_SPR_H = 42; // proporcion 868x240 del sprite

  function drawCar(gy, vy, ci) {
    const X = CAR_X;
    const airH = Math.max(0, ROAD_Y - gy);
    const shS = Math.max(0.35, 1 - airH / 160);

    const spr = SPRITES.car[ci];
    if (spriteReady(spr)) {
      const cx = X + CAR_SPR_W / 2;
      g.fillStyle = 'rgba(10,10,20,' + (0.3 * shS).toFixed(3) + ')';
      g.beginPath();
      g.ellipse(cx, ROAD_Y + 6, CAR_SPR_W * 0.46 * shS, 7 * shS, 0, 0, TAU);
      g.fill();

      g.save();
      g.translate(cx, gy - 18);
      g.rotate(clamp(vy * 0.0045, -0.07, 0.05));
      g.translate(-cx, -(gy - 18));
      g.drawImage(spr, X - 4, gy - CAR_SPR_H + 2, CAR_SPR_W, CAR_SPR_H);
      g.restore();

      if (S.mode === 'over') {
        for (let i = 0; i < 3; i++) {
          const t = ((S.overT * 0.055) + i * 0.33) % 1;
          g.fillStyle = 'rgba(150,155,160,' + (0.65 * (1 - t)).toFixed(3) + ')';
          g.beginPath();
          g.arc(X + 128 - t * 10, gy - 40 - t * 46, 4 + t * 10, 0, TAU);
          g.fill();
        }
      }
      return;
    }

    g.fillStyle = 'rgba(20,20,20,' + (0.28 * shS).toFixed(3) + ')';
    g.beginPath();
    g.ellipse(X + 58, ROAD_Y + 6, 66 * shS, 7 * shS, 0, 0, TAU);
    g.fill();

    g.save();
    g.translate(X + 58, gy - 18);
    g.rotate(clamp(vy * 0.0045, -0.07, 0.05));
    g.translate(-(X + 58), -(gy - 18));

    drawWheel(X + 30, gy - 11);
    drawWheel(X + 92, gy - 11);

    // interior, asiento y capota plegada (detras de la conductora)
    g.fillStyle = '#262B33';
    g.fillRect(X + 36, gy - 38, 46, 6);
    g.fillStyle = '#E8DCC0';
    rr(g, X + 42, gy - 42, 16, 10, 2); g.fill();
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 1.6;
    g.stroke();
    g.fillStyle = '#E4DFD2';
    rr(g, X + 18, gy - 37, 20, 5, 2); g.fill();
    g.stroke();

    // conductora/or 8 bits manejando
    drawDriver(ci, X + 44, gy - 58);

    // volante delante del brazo
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 2;
    g.beginPath(); g.arc(X + 71, gy - 41, 4.2, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(X + 71, gy - 41); g.lineTo(X + 71, gy - 34); g.stroke();

    // carroceria plana tipo losa (deville)
    g.fillStyle = '#F7F5EE';
    rr(g, X + 2, gy - 33, 122, 21, 2);
    g.fill();
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 2.5;
    g.stroke();

    // moldura lateral cromada corrida
    g.strokeStyle = '#C9CDD2';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(X + 4, gy - 25); g.lineTo(X + 108, gy - 25); g.stroke();
    g.strokeStyle = 'rgba(20,20,20,.15)';
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(X + 4, gy - 14); g.lineTo(X + 118, gy - 14); g.stroke();

    // puerta: junta y manija
    g.strokeStyle = 'rgba(20,20,20,.25)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(X + 76, gy - 32);
    g.lineTo(X + 76, gy - 13);
    g.stroke();
    g.fillStyle = '#C9CDD2';
    g.fillRect(X + 68, gy - 29, 6, 2.4);

    // parabrisas vertical con marco y visera
    g.fillStyle = '#C9E7F5';
    rr(g, X + 82, gy - 48, 15, 15, 1);
    g.fill();
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = 'rgba(20,20,20,.14)';
    g.fillRect(X + 83, gy - 48, 13, 3);
    g.beginPath();
    g.moveTo(X + 89.5, gy - 47);
    g.lineTo(X + 89.5, gy - 34);
    g.stroke();
    g.fillStyle = '#D8DDE2';
    g.fillRect(X + 80, gy - 34, 19, 3);

    // espejo retrovisor rectangular en brazo cromado (sobre la puerta)
    g.strokeStyle = '#9AA0A6';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(X + 80, gy - 33);
    g.lineTo(X + 85, gy - 41);
    g.stroke();
    g.fillStyle = '#DDE1E6';
    rr(g, X + 82, gy - 47, 9, 6, 1); g.fill();
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 1.8;
    g.stroke();
    g.fillStyle = '#C9E7F5';
    g.fillRect(X + 83.5, gy - 45.5, 4.5, 3);

    // parrilla ancha con barras verticales
    g.fillStyle = '#DDE1E6';
    rr(g, X + 110, gy - 34, 14, 21, 1);
    g.fill();
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 2;
    g.stroke();
    g.strokeStyle = 'rgba(20,20,20,.45)';
    g.lineWidth = 1.2;
    for (let i = 1; i < 6; i++) {
      g.beginPath();
      g.moveTo(X + 110 + i * 2.33, gy - 32);
      g.lineTo(X + 110 + i * 2.33, gy - 14);
      g.stroke();
    }

    // faro redondo + direccional ambar junto a la parrilla
    g.fillStyle = '#FFF3B0';
    g.beginPath(); g.arc(X + 109, gy - 28, 4, 0, TAU); g.fill();
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 1.8;
    g.stroke();
    g.fillStyle = '#F5A623';
    g.beginPath(); g.arc(X + 109, gy - 18.5, 1.8, 0, TAU); g.fill();
    g.stroke();

    // parachoque delantero grande envolvente
    g.fillStyle = '#DDE1E6';
    rr(g, X + 106, gy - 13, 24, 6, 2); g.fill();
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#B9BEC6';
    g.fillRect(X + 111, gy - 15, 4, 4);
    g.fillRect(X + 122, gy - 15, 4, 4);

    // luz trasera vertical en el borde + parachoque trasero
    g.fillStyle = '#D93A2B';
    rr(g, X + 1, gy - 31, 4, 10, 1); g.fill();
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 1.8;
    g.stroke();
    g.fillStyle = '#F6F5EF';
    g.fillRect(X + 2, gy - 29.5, 2, 2.5);
    g.fillStyle = '#DDE1E6';
    rr(g, X - 6, gy - 13, 16, 6, 2); g.fill();
    g.stroke();
    g.fillStyle = '#B9BEC6';
    g.fillRect(X - 2, gy - 15, 4, 4);

    g.restore();

    // humo al chocar
    if (S.mode === 'over') {
      for (let i = 0; i < 3; i++) {
        const t = ((S.overT * 0.055) + i * 0.33) % 1;
        g.fillStyle = 'rgba(150,155,160,' + (0.65 * (1 - t)).toFixed(3) + ')';
        g.beginPath();
        g.arc(X + 108 - t * 10, gy - 36 - t * 46, 4 + t * 10, 0, TAU);
        g.fill();
      }
    }
  }

  /* ---------- dibujo principal ---------- */

  function draw() {
    g.imageSmoothingEnabled = false;

    if (spriteReady(SPRITES.bg)) {
      drawBgImage(SPRITES.bg);
    } else {
      drawSky();
      drawField();
      drawRoad();
    }

    S.items.forEach(drawCoin);
    S.obs.forEach((o) => {
      if (o.kind === 'tire') drawTire(o); else drawCan(o);
    });

    const p = S.p;
    const gy = S.mode === 'idle' ? ROAD_Y + Math.sin(S.anim / 28) * 1.2 : p.y;
    drawCar(gy, p.vy, S.charIndex);

    g.font = 'bold 14px "Silkscreen", monospace';
    g.textBaseline = 'top';

    // retrato + nombre del personaje
    drawAvatar(S.charIndex, 18, 12, 16, true);
    g.textAlign = 'left';
    g.fillStyle = COLORS.pink;
    g.fillText(CHARS[S.charIndex].name, 42, 14);

    g.textAlign = 'right';
    g.fillStyle = COLORS.ink;
    g.fillText('HI ' + String(S.hi).padStart(5, '0'), 670, 14);
    const scoreTxt = String(Math.floor(S.score)).padStart(5, '0');
    g.fillStyle = COLORS.lime;
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 3;
    g.lineJoin = 'round';
    g.strokeText(scoreTxt, 736, 14);
    g.fillText(scoreTxt, 736, 14);

    g.textAlign = 'center';
    S.pops.forEach((pp) => {
      g.globalAlpha = Math.max(0, 1 - pp.t / 50);
      g.font = 'bold ' + (pp.big ? 18 : 12) + 'px "Silkscreen", monospace';
      g.fillStyle = pp.big ? COLORS.lime : COLORS.pink;
      g.strokeStyle = COLORS.ink;
      g.lineWidth = pp.big ? 4 : 3;
      g.strokeText(pp.txt, pp.x, pp.y);
      g.fillText(pp.txt, pp.x, pp.y);
    });
    g.globalAlpha = 1;
  }

  let visible = true; // se apaga cuando el juego sale de pantalla (ahorro mobile)
  let loopOn = false;
  function loop(now) {
    loopOn = false;
    const dt = Math.min(2.2, (now - (loop.last || now)) / 16.667) || 1;
    loop.last = now;
    S.frame++;
    update(dt);
    draw();
    if (visible) { loopOn = true; requestAnimationFrame(loop); }
  }
  function kickLoop() {
    if (!loopOn) { loopOn = true; requestAnimationFrame(loop); }
  }

  const onKey = (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (!e.repeat) jump();
    }
  };
  const onPointer = (e) => {
    if (e.target.closest('#fsBtn')) return;
    e.preventDefault();
    jump();
  };

  window.addEventListener('keydown', onKey);
  canvas.addEventListener('pointerdown', onPointer);

  if ('IntersectionObserver' in window && typeof canvas.getBoundingClientRect === 'function') {
    const target = (typeof canvas.closest === 'function' && canvas.closest('.cabinet')) || canvas;
    new IntersectionObserver((entries) => {
      const vis = !entries[0] || entries[0].isIntersecting;
      if (vis === visible) return;
      visible = vis;
      if (vis) kickLoop();
    }, { threshold: 0.05 }).observe(target);
  }

  emit();
  kickLoop();

  return {
    start,
    jump,
    toSelect,
    debugStep: (n) => { for (let i = 0; i < n; i++) update(1); },
  };
}

/* ================= fondo de pagina (cielo de dia) ================= */

/* ================= UI ================= */

const overlaySelect = $('#overlaySelect');
const overlayOver = $('#overlayOver');
const finalScore = $('#finalScore');
const replayBtn = $('#replay');
const changeBtn = $('#changeChar');

let lastMode = 'idle';
let focusIdx = 0;

const game = createGame($('#game'), {
  onState(st) {
    if (st.mode !== lastMode) {
      overlaySelect.classList.toggle('hidden', st.mode !== 'idle');
      overlayOver.classList.toggle('hidden', st.mode !== 'over');
      if (st.mode === 'over') {
        finalScore.textContent = 'SCORE ' + String(st.score).padStart(5, '0') +
          ' · HI ' + String(st.hi).padStart(5, '0');
      }
      lastMode = st.mode;
    }
  },
});

function pickChar(i) {
  document.querySelectorAll('.char').forEach((el) => el.classList.remove('kb-focus'));
  game.start(i);
}

document.querySelectorAll('.char').forEach((el) => {
  el.addEventListener('click', () => pickChar(+el.dataset.i));
  el.addEventListener('pointerenter', () => {
    focusIdx = +el.dataset.i;
    document.querySelectorAll('.char').forEach((c) => c.classList.toggle('kb-focus', +c.dataset.i === focusIdx));
  });
});
document.querySelectorAll('.char').forEach((c) => c.classList.toggle('kb-focus', +c.dataset.i === 0));

window.addEventListener('keydown', (e) => {
  if (lastMode !== 'idle') return;
  if (e.code === 'Digit1') pickChar(0);
  if (e.code === 'Digit2') pickChar(1);
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
    focusIdx = e.code === 'ArrowLeft' ? 0 : 1;
    document.querySelectorAll('.char').forEach((c) => c.classList.toggle('kb-focus', +c.dataset.i === focusIdx));
  }
  if (e.code === 'Enter') pickChar(focusIdx);
});

const fsBtn = $('#fsBtn');
fsBtn.addEventListener('click', () => {
  const scr = $('.screen');
  if (!scr) return;
  if (typeof scr.requestFullscreen === 'function') {
    if (document.fullscreenElement && typeof document.exitFullscreen === 'function') document.exitFullscreen().catch(() => {});
    else scr.requestFullscreen().catch(() => {});
  } else if (scr.classList) {
    setFsFallback(scr, !scr.classList.contains('fs-fallback')); // iOS y navegadores sin Fullscreen API
  }
  fsBtn.blur();
});
// En el fallback el .screen es position:fixed, pero vive dentro de .cabinet (z-index:1), asi que las
// tarjetas de proximas fechas (z-index mayor) quedaban por delante del juego. Se sube el cabinet entero
// por encima de todo y se bloquea el scroll de la pagina mientras dura la pantalla completa.
function setFsFallback(scr, on) {
  scr.classList.toggle('fs-fallback', on);
  const cab = scr.closest('.cabinet');
  if (cab) cab.classList.toggle('fs-open', on);
  document.documentElement.classList.toggle('fs-lock', on);
}
window.addEventListener('keydown', (e) => {
  const scr = document.querySelector('.screen.fs-fallback');
  if (e.key === 'Escape' && scr) setFsFallback(scr, false);
});
fsBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
replayBtn.addEventListener('click', () => { game.start(); replayBtn.blur(); });
replayBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
changeBtn.addEventListener('click', () => { game.toSelect(); changeBtn.blur(); });
changeBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

const params = new URLSearchParams(location.search);
if (params.has('autostart')) {
  game.start(+(params.get('char') || 1) - 1);
  const frames = +(params.get('frames') || 0);
  if (frames) game.debugStep(frames);
}

loadCharImage(0);
loadCharImage(1);
loadSprite((img) => { SPRITES.car[0] = img; }, 'car1');
loadSprite((img) => { SPRITES.car[1] = img; }, 'car2');
loadSprite((img) => { SPRITES.tire = img; }, 'tire');
loadSprite((img) => { SPRITES.coin = img; }, 'coin');
loadSprite((img) => { SPRITES.can = img; }, 'can');
loadSprite((img) => { SPRITES.bg = img; }, 'bg');

/* ============ FX del hero: corazones pixel + sparkles (estetica kawaii retro) ============ */
(function startHeroFX() {
  const cv = document.querySelector('.hero-fx');
  if (!cv) return;
  const g = cv.getContext('2d');
  const hero = cv.parentElement;
  const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
  const TINTS = ['#FF9AD5', '#FFB3E0', '#FF8AC2', '#FFC1EA'];
  let W = 0, H = 0, hearts = [], sparks = [], running = false, rafId = 0;

  function resize() {
    const cw = hero.clientWidth, ch = hero.clientHeight;
    if (typeof cw !== 'number' || typeof ch !== 'number' || !cw || !ch) return false; // sin layout real
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cw; H = ch;
    cv.width = W * dpr;
    cv.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function spawnHeart(anywhere) {
    return {
      x: rnd(0, W),
      y: anywhere ? rnd(0, H) : H + 24,
      v: rnd(0.35, 0.9),
      sway: rnd(0.4, 1.2),
      ph: rnd(0, TAU),
      px: Math.round(rnd(4, 7)),       // tamaño de cada pixel del corazon
      color: TINTS[Math.floor(Math.random() * TINTS.length)],
      alpha: rnd(0.45, 0.85),
    };
  }

  const SPARK_COLORS = ['#FFFFFF', '#FFFFFF', '#FF9AD5', '#FFD400', '#4DE3FF'];

  function spawnSpark(anywhere) {
    return {
      x: rnd(0, W),
      y: rnd(0, H * 0.95),
      s: rnd(2, 6),
      ph: rnd(0, TAU),
      speed: rnd(0.02, 0.055),
      color: SPARK_COLORS[(Math.random() * SPARK_COLORS.length) | 0],
    };
  }

  function drawHeart(h, t) {
    const x = h.x + Math.sin(t * h.sway + h.ph) * 14;
    const fade = Math.min(1, (H - h.y) / 60, Math.max(0.15, h.y / 40));
    g.globalAlpha = h.alpha * fade;
    g.fillStyle = h.color;
    const o = 1.6; // desplazamiento del "borde" oscuro
    HEART.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] !== 'X') continue;
        g.fillStyle = '#C2609A';
        g.fillRect(x + rx * h.px + o, h.y + ry * h.px + o, h.px, h.px);
      }
    });
    HEART.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] !== 'X') continue;
        g.fillStyle = h.color;
        g.fillRect(x + rx * h.px, h.y + ry * h.px, h.px, h.px);
      }
    });
    g.globalAlpha = 1;
  }

  function drawSpark(s, t) {
    const tw = (Math.sin((t + s.ph) / (s.speed * 120)) + 1) / 2;
    if (tw < 0.15) return;
    const flare = 1 + tw * tw * 1.8;
    const a = s.s * flare;
    g.fillStyle = s.color;
    g.globalAlpha = 0.3 + tw * 0.7;
    g.fillRect(s.x - a, s.y - 1, a * 2, 2);
    g.fillRect(s.x - 1, s.y - a, 2, a * 2);
    g.globalAlpha = 1;
    g.fillRect(s.x - 1, s.y - 1, 2, 2);
  }

  function tick(now) {
    if (!running) return;
    const t = now / 1000;
    g.clearRect(0, 0, W, H);
    hearts.forEach((h) => {
      h.y -= h.v;
      if (h.y < -40) Object.assign(h, spawnHeart(false));
      drawHeart(h, t);
    });
    sparks.forEach((s) => drawSpark(s, t));
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  if (!resize()) return;
  const area = W * H;
  hearts = Array.from({ length: Math.max(16, Math.min(30, Math.round(area / 80000))) }, () => spawnHeart(true));
  sparks = Array.from({ length: Math.max(48, Math.min(130, Math.round(area / 15000))) }, () => spawnSpark(true));
  window.addEventListener('resize', resize);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? start() : stop()));
    }, { threshold: 0.05 }).observe(hero);
  } else {
    start();
  }
})();

/* ============ FX de la bio: cassettes, CDs y rayitos flotantes con luces ============ */
(function startBioFX() {
  const cv = document.querySelector('.bio-fx');
  if (!cv || typeof cv.getContext !== 'function') return;
  const g = cv.getContext('2d');
  const sec = cv.parentElement;
  if (!g || !sec) return;
  const DEFS = [
    { kind: 'cassette', src: ['sprites/fx_cassette.png'], size: [50, 70] },
    { kind: 'cd',       src: ['sprites/fx_cd.png'],       size: [40, 56] },
    { kind: 'rayo',     src: ['sprites/fx_rayo.png'],     size: [36, 52] },
    { kind: 'estrella', src: ['sprites/fx_estrella.png'], size: [22, 36] },
  ];
  const IMGS = {};
  if (typeof Image === 'function') {
    DEFS.forEach((d) => {
      let i = 0;
      const tryNext = () => {
        if (i >= d.src.length) { IMGS[d.kind] = null; return; }
        const img = new Image();
        img.onload = () => { IMGS[d.kind] = img; };
        img.onerror = () => { i += 1; tryNext(); };
        img.src = d.src[i];
      };
      tryNext();
    });
  } else {
    DEFS.forEach((d) => { IMGS[d.kind] = null; });
  }

  /* dibujos vectoriales de respaldo si el sprite aun no existe */
  const VEC = {
    cassette(s) {
      g.fillStyle = '#8FD8F7'; g.strokeStyle = '#141414'; g.lineWidth = 3;
      g.fillRect(-s / 2, -s * 0.32, s, s * 0.64); g.strokeRect(-s / 2, -s * 0.32, s, s * 0.64);
      g.fillStyle = '#FF9AD5'; g.fillRect(-s * 0.32, -s * 0.2, s * 0.64, s * 0.18);
      g.fillStyle = '#fff'; g.fillRect(-s * 0.28, s * 0.02, s * 0.56, s * 0.2);
      g.fillStyle = '#141414';
      g.beginPath(); g.arc(-s * 0.14, s * 0.12, s * 0.06, 0, TAU); g.arc(s * 0.14, s * 0.12, s * 0.06, 0, TAU); g.fill();
    },
    cd(s) {
      g.fillStyle = '#F2F2F2'; g.strokeStyle = '#141414'; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, s / 2, 0, TAU); g.fill(); g.stroke();
      const cols = ['#FF5C8A', '#FFB03A', '#FFE45C', '#7BE495', '#5CC8FF', '#B28CFF'];
      g.lineWidth = 4; g.globalAlpha *= 0.85;
      cols.forEach((c, i) => {
        g.strokeStyle = c;
        g.beginPath(); g.arc(0, 0, s * 0.36, (i / 6) * TAU, ((i + 0.7) / 6) * TAU); g.stroke();
      });
      g.globalAlpha /= 0.85;
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, s * 0.16, 0, TAU); g.fill();
      g.strokeStyle = '#141414'; g.lineWidth = 3; g.stroke();
      g.fillStyle = '#141414'; g.beginPath(); g.arc(0, 0, s * 0.05, 0, TAU); g.fill();
    },
    rayo(s) {
      g.fillStyle = '#FFD400'; g.strokeStyle = '#141414'; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-s * 0.08, -s * 0.5); g.lineTo(s * 0.3, -s * 0.08); g.lineTo(s * 0.06, -s * 0.04);
      g.lineTo(s * 0.22, s * 0.5); g.lineTo(-s * 0.3, -s * 0.02); g.lineTo(-s * 0.05, -s * 0.06);
      g.closePath(); g.fill(); g.stroke();
    },
    estrella(s) {
      g.fillStyle = '#FFF6C9'; g.strokeStyle = '#141414'; g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(0, -s / 2); g.lineTo(s * 0.14, -s * 0.14); g.lineTo(s / 2, 0); g.lineTo(s * 0.14, s * 0.14);
      g.lineTo(0, s / 2); g.lineTo(-s * 0.14, s * 0.14); g.lineTo(-s / 2, 0); g.lineTo(-s * 0.14, -s * 0.14);
      g.closePath(); g.fill(); g.stroke();
    },
  };

  let W = 0, H = 0, running = false, rafId = 0, last = 0;
  const items = [], parts = [];

  let winRects = [];
  function resize() {
    const cw = sec.clientWidth, ch = sec.clientHeight;
    if (typeof cw !== 'number' || typeof ch !== 'number' || !cw || !ch) return false;
    W = cw; H = ch;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr; cv.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    cacheWindows();
    return true;
  }

  /* rectangulos ocupados por las ventanas: los sprites deben spawnear en los margenes */
  function cacheWindows() {
    winRects = [];
    if (typeof sec.getBoundingClientRect !== 'function' || typeof sec.querySelectorAll !== 'function') return;
    const sr = sec.getBoundingClientRect();
    const wins = sec.querySelectorAll('.os-window');
    if (!wins || typeof wins.forEach !== 'function') return;
    wins.forEach((el) => {
      if (typeof el.getBoundingClientRect !== 'function') return;
      const r = el.getBoundingClientRect();
      winRects.push({
        x0: r.left - sr.left - 70, y0: r.top - sr.top - 70,
        x1: r.right - sr.left + 70, y1: r.bottom - sr.top + 70,
      });
    });
    const bar = sec.querySelector('.spotify-ticker');
    if (bar && typeof bar.getBoundingClientRect === 'function') {
      const br = bar.getBoundingClientRect();
      winRects.push({ x0: -9999, y0: br.top - sr.top - 70, x1: 9999, y1: br.bottom - sr.top + 70 });
    }
  }

  /* los anchors deben aterrizar debajo del menu sticky */
  syncScrollMargins();
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('resize', syncScrollMargins, { passive: true });
  }
  function syncScrollMargins() {
    const topbar = document.querySelector('.topbar');
    if (!topbar || typeof topbar.offsetHeight !== 'number') return;
    const th = topbar.offsetHeight;
    document.documentElement.style.setProperty('--topbar-h', th + 'px');
    sec.style.scrollMarginTop = th + 'px';
    const tk = document.querySelector('#ticker-main');
    const tkh = tk && typeof tk.offsetHeight === 'number' ? tk.offsetHeight : 0;
    const juego = document.querySelector('#juego');
    if (juego && juego.style) juego.style.scrollMarginTop = (th + tkh) + 'px';
    const merch = document.querySelector('#merch');
    if (!merch || !merch.style) return;
    merch.style.scrollMarginTop = th + 'px';
  }

  function freeSpot() {
    for (let i = 0; i < 20; i++) {
      const x = rnd(0.04, 0.96), y = rnd(0.05, 0.95);
      const px = x * W, py = y * H;
      const blocked = winRects.some((r) => px > r.x0 && px < r.x1 && py > r.y0 && py < r.y1);
      if (blocked) continue;
      const crowded = items.some((o) => Math.abs(o.fx * W - px) < 90 && Math.abs(o.fy * H - py) < 90);
      if (!crowded) return { fx: x, fy: y };
    }
    return { fx: rnd(0.02, 0.06), fy: rnd(0.05, 0.95) };
  }

  function spawn(d) {
    const spot = freeSpot();
    return {
      kind: d.kind,
      fx: spot.fx, fy: spot.fy,
      s: rnd(d.size[0], d.size[1]) * Math.min(1.3, Math.max(1, W / 1920)),
      drift: rnd(0.008, 0.02),
      ph: rnd(0, TAU),
      bobSpd: rnd(0.5, 1.1),
      rot: rnd(-0.35, 0.35),
      rotSpd: d.kind === 'cd' ? rnd(0.35, 0.7) : rnd(0.06, 0.18),
      speed: rnd(0.12, 0.4),
      twSpd: rnd(1.2, 2.4), twPh: rnd(0, TAU),
      glowPh: rnd(0, TAU),
      burstAt: rnd(2.5, 8),
    };
  }

  function burst(x, y) {
    const cols = ['#FFFFFF', '#FFE45C', '#FF9AD5', '#9BE5FF'];
    const n = 5 + Math.floor(rnd(0, 3));
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), v = rnd(18, 46);
      parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10,
        life: rnd(0.5, 1), max: 1, s: rnd(2, 4.5),
        c: cols[Math.floor(rnd(0, cols.length))],
      });
    }
    if (parts.length > 90) parts.splice(0, parts.length - 90);
  }

  function drawPart(p) {
    const a = Math.max(0, p.life / p.max);
    const s = p.s * (0.5 + a * 0.5);
    g.globalAlpha = a;
    g.fillStyle = p.c;
    g.fillRect(p.x - s, p.y - 1, s * 2, 2);
    g.fillRect(p.x - 1, p.y - s, 2, s * 2);
    g.globalAlpha = 1;
  }

  function drawItem(it, t, off, dt, isStatic) {
    const img = IMGS[it.kind];
    const x = it.fx * W + Math.sin(t * it.bobSpd * 0.6 + it.ph) * 10;
    const y = it.fy * H + Math.sin(t * it.bobSpd + it.ph) * 6 + off * it.speed;
    const rot = it.rot + Math.sin(t * it.rotSpd + it.ph) * (it.kind === 'cd' ? 0.9 : 0.16);
    const tw = (Math.sin(t * it.twSpd + it.twPh) + 1) / 2;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.globalAlpha = isStatic ? 0.8 : 0.45 + tw * 0.45;
    if (!isStatic) {
      const pulse = (Math.sin(t * 0.85 + it.glowPh) + 1) / 2;
      if (pulse > 0.72) {
        g.shadowColor = it.kind === 'rayo' ? '#FFE45C' : '#FFFFFF';
        g.shadowBlur = (pulse - 0.72) * 60;
      }
    }
    if (img && img.complete && img.naturalWidth > 0) {
      const r = img.naturalWidth / img.naturalHeight;
      const dw = r >= 1 ? it.s : it.s * r;
      const dh = r >= 1 ? it.s / r : it.s;
      g.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    } else {
      VEC[it.kind](it.s);
    }
    g.restore();
    if (!isStatic) {
      it.burstAt -= dt;
      if (it.burstAt <= 0) {
        it.burstAt = rnd(4, 10);
        burst(x, y);
      }
    }
  }

  function tick(now) {
    if (!running) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    const t = now / 1000;
    g.clearRect(0, 0, W, H);
    const rect = sec.getBoundingClientRect();
    const off = (rect.top + rect.height / 2) - window.innerHeight / 2;
    items.forEach((it) => {
      it.fy -= it.drift * dt;
      if (it.fy < -0.08) it.fy = 1.08;
      drawItem(it, t, off, dt, false);
    });
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      drawPart(p);
    }
    rafId = requestAnimationFrame(tick);
  }

  function start() { if (running) return; running = true; last = 0; rafId = requestAnimationFrame(tick); }
  function stop() { running = false; cancelAnimationFrame(rafId); }

  let builtFor = 0;
  function buildItems() {
    items.length = 0;
    const extra = Math.round(Math.max(0, W - 1280) / 220);
    const counts = { cassette: 2 + Math.ceil(extra / 2), cd: 3 + Math.ceil(extra / 2), rayo: 3, estrella: 6 + extra };
    DEFS.forEach((d) => { for (let i = 0; i < counts[d.kind]; i++) items.push(spawn(d)); });
    builtFor = W;
  }

  if (!resize()) return;
  buildItems();

  function drawStatic() {
    g.clearRect(0, 0, W, H);
    items.forEach((it) => drawItem(it, 0, 0, 0, true));
  }

  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.addEventListener('resize', () => {
    if (!resize()) return;
    if (Math.abs(W - builtFor) > 300) buildItems();
    if (reduced) drawStatic();
  });
  if (reduced) { drawStatic(); return; }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? start() : stop()));
    }, { threshold: 0.02 }).observe(sec);
  } else {
    start();
  }
})();

/* ============ FX del merch: estrellitas parpadeantes sobre el skyline ============ */
(function startMerchFX() {
  const cv = document.querySelector('.merch-fx');
  if (!cv || typeof cv.getContext !== 'function') return;
  const g = cv.getContext('2d');
  const sec = cv.parentElement;
  if (!g || !sec) return;
  const TAU = Math.PI * 2;
  const COLORS = ['#FFFFFF', '#4DE3FF', '#FFD400', '#A45CFF'];
  // halo de cada color (el blanco brilla en rosa para que se note sobre el fondo claro)
  const GLOW = { '#FFFFFF': '#FF4DCC', '#4DE3FF': '#4DE3FF', '#FFD400': '#FFB300', '#A45CFF': '#A45CFF' };
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, stars = [], running = false, raf = 0;

  const rnd = (a, b) => a + Math.random() * (b - a);

  function seed() {
    const n = Math.max(70, Math.min(170, Math.round((W * H) / 11000)));
    stars = [];
    for (let i = 0; i < n; i++) {
      stars.push({
        x: rnd(0, W),
        y: rnd(0, H * 0.92),
        r: rnd(1.8, 4.4),
        ph: rnd(0, TAU),
        sp: rnd(0.6, 2.2),
        c: COLORS[(Math.random() * COLORS.length) | 0],
        rays: Math.random() < 0.4,
      });
    }
  }

  function resize() {
    const w = sec.clientWidth, h = sec.clientHeight;
    if (typeof w !== 'number' || typeof h !== 'number' || !w || !h) return false;
    W = w; H = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr; cv.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    return true;
  }

  function drawStar(s, a) {
    const r = s.r;
    g.globalAlpha = a;
    g.fillStyle = s.c;
    g.shadowColor = GLOW[s.c] || s.c;   // brillo suave alrededor de la estrella
    g.shadowBlur = r * 3.2;
    g.beginPath();
    g.moveTo(s.x, s.y - r);
    g.lineTo(s.x + r * 0.5, s.y);
    g.lineTo(s.x, s.y + r);
    g.lineTo(s.x - r * 0.5, s.y);
    g.closePath();
    g.fill();
    if (s.rays) {
      g.globalAlpha = a * 0.9;
      g.fillRect(s.x - r * 2.4, s.y - 0.5, r * 4.8, 1);
      g.fillRect(s.x - 0.5, s.y - r * 2.4, 1, r * 4.8);
    }
    g.shadowBlur = 0;
  }

  function frame(t) {
    if (!running) return;
    g.clearRect(0, 0, W, H);
    const time = (t || 0) / 1000;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const tw = 0.5 + 0.5 * Math.sin(time * s.sp + s.ph);
      drawStar(s, 0.3 + 0.7 * Math.pow(tw, 1.3));
    }
    g.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  function drawStatic() {
    g.clearRect(0, 0, W, H);
    for (let i = 0; i < stars.length; i++) drawStar(stars[i], 0.9);
    g.globalAlpha = 1;
  }

  function start() { if (running) return; running = true; raf = requestAnimationFrame(frame); }
  function stop() { running = false; if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf); }

  if (!resize()) return;
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('resize', () => { if (resize() && reduced) drawStatic(); });
  }
  if (reduced) { drawStatic(); return; }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? start() : stop()));
    }, { threshold: 0.02 }).observe(sec);
  } else {
    start();
  }
})();

/* ============ LANDING: reveal on scroll ============ */
(function () {
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('in-view');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.15 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in-view'));
  }
})();
