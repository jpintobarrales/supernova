// Transicion "despixelada" en la union entre heroes (HOME -> BIO -> MERCH).
// En el borde inferior de cada hero hay un canvas three.js (dentro de la propia seccion, asi que
// scrollea JUNTO con la pagina, sin retraso ni saltos). Los pixeles que aparecen se muestrean del
// fondo real del hero de abajo (degradado + cuadricula de la BIO, imagen de fondo del MERCH).
// Lo unico que cambia en el tiempo es el progreso (cuantos pixeles ya cambiaron), suavizado.
import * as THREE from 'three';

const PIXEL = 3;     // tamano del pixel en px CSS
const BAND  = 0.08;  // alto de la franja de pixeles (fraccion del alto de pantalla)

// sel = seccion NUEVA (la de abajo); el canvas va al final de la seccion anterior
// kind 0 = degradado 160deg + cuadricula de 64px (fondo de la BIO, ver style.css)
// kind 1 = imagen de fondo "center bottom / cover" (fondo del MERCH)
const SEAMS = [
  { sel: '.bio-section',   kind: 0 },
  { sel: '.merch-section', kind: 1, img: 'sprites/fondo_merch.jpg' },
].map(s => ({ ...s, el: document.querySelector(s.sel) }))
 .filter(s => s.el && s.el.previousElementSibling);

const VERT = `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = `
  precision highp float;
  uniform float uKind, uP, uPixel, uPr, uTexOn;
  uniform vec2 uRes, uSize, uImg;   // uRes: tamano del canvas; uSize: tamano de la seccion nueva
  uniform sampler2D uTex;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // color del fondo real del hero de abajo en (x, ly); ly = distancia hacia ARRIBA de la union,
  // reflejada para que el fondo "continue" por encima de la linea
  vec3 newBg(float x, float ly) {
    if (uKind < 0.5) {
      // degradado 160deg: #7c3aed 0% -> #a855f7 35% -> #ec4899 100%
      float a = radians(160.0);
      vec2 dir = vec2(sin(a), -cos(a));
      float len = abs(uSize.x * dir.x) + abs(uSize.y * dir.y);
      float g = clamp(dot(vec2(x, ly) - uSize * 0.5, dir) / len + 0.5, 0.0, 1.0);
      vec3 c1 = vec3(0.486, 0.227, 0.929), c2 = vec3(0.659, 0.333, 0.969), c3 = vec3(0.925, 0.282, 0.600);
      vec3 col = g < 0.35 ? mix(c1, c2, g / 0.35) : mix(c2, c3, (g - 0.35) / 0.65);
      // cuadricula blanca al 16% cada 64px
      float tile = 64.0 * uPr;
      if (mod(x, tile) < uPr || mod(ly, tile) < uPr) col = mix(col, vec3(1.0), 0.16);
      return col;
    }
    if (uTexOn < 0.5) return vec3(1.0, 0.949, 0.976);
    // background: center bottom / cover
    float sc = max(uSize.x / uImg.x, uSize.y / uImg.y);
    vec2 dsz = uImg * sc;
    vec2 off = vec2((uSize.x - dsz.x) * 0.5, uSize.y - dsz.y);
    vec2 uv = clamp((vec2(x, ly) - off) / dsz, 0.0, 1.0);
    return texture2D(uTex, vec2(uv.x, 1.0 - uv.y)).rgb;
  }

  void main() {
    vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);   // desde arriba del canvas
    vec2 cell = floor(p / uPixel);                            // celdas fijas al canvas (= a la pagina)
    float ly = uRes.y - (cell.y + 0.5) * uPixel;              // distancia sobre la linea de union
    float lx = (cell.x + 0.5) * uPixel;

    // densidad: maxima pegada a la linea, se disipa hacia arriba;
    // aparece y se va de a poco segun el progreso del paso por la union
    float e = 1.0 - smoothstep(0.0, 1.0, ly / uRes.y);
    float f = smoothstep(0.0, 0.2, uP) * (1.0 - smoothstep(0.8, 1.0, uP));
    if (hash(cell) < e * f) gl_FragColor = vec4(newBg(lx, ly), 1.0);
    else gl_FragColor = vec4(0.0);
  }
`;

// sin efecto si el usuario pide menos movimiento; si WebGL no esta disponible, se quita en silencio
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
if (SEAMS.length && !reduced) try {
  const placeholder = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  placeholder.needsUpdate = true;

  let vh = innerHeight, topH = 0;
  let queued = false, last = 0;

  SEAMS.forEach(s => {
    s.prev = s.el.previousElementSibling;
    s.canvas = document.createElement('canvas');
    s.canvas.className = 'seam-fx';
    s.canvas.setAttribute('aria-hidden', 'true');
    s.canvas.style.visibility = 'hidden';
    s.prev.appendChild(s.canvas);

    s.renderer = new THREE.WebGLRenderer({ canvas: s.canvas, alpha: true, antialias: false });
    s.renderer.setClearColor(0x000000, 0);
    s.scene = new THREE.Scene();
    s.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    s.u = {
      uKind: { value: s.kind }, uP: { value: 0 }, uPixel: { value: PIXEL }, uPr: { value: 1 },
      uTexOn: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
      uSize: { value: new THREE.Vector2(1, 1) }, uImg: { value: new THREE.Vector2(1, 1) },
      uTex: { value: placeholder },
    };
    s.scene.add(new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ uniforms: s.u, vertexShader: VERT, fragmentShader: FRAG })
    ));
    s.p = 0;
    s.shown = false;

    if (s.img) {
      new THREE.TextureLoader().load(s.img, tex => {
        tex.colorSpace = THREE.NoColorSpace;
        s.u.uTex.value = tex;
        s.u.uImg.value.set(tex.image.width, tex.image.height);
        s.u.uTexOn.value = 1;
        s.dirty = true;
        update();
      });
    }
  });

  function resize() {
    vh = innerHeight;
    const tb = document.querySelector('.topbar');
    topH = tb ? tb.offsetHeight : 0;
    const pr = Math.min(devicePixelRatio || 1, 2);
    const h = Math.max(8, Math.round(BAND * (vh - topH)));
    SEAMS.forEach(s => {
      const w = s.prev.clientWidth;
      s.canvas.style.height = h + 'px';
      s.renderer.setPixelRatio(pr);
      s.renderer.setSize(w, h, false);
      s.u.uRes.value.set(w * pr, h * pr);
      s.u.uPixel.value = PIXEL * pr;
      s.u.uPr.value = pr;
      const r = s.el.getBoundingClientRect();
      s.u.uSize.value.set(r.width * pr, r.height * pr);
      s.dirty = true;
    });
    update();
  }

  function render(now) {
    queued = false;
    const dt = Math.min((now - (last || now)) / 1000, 0.05) || 0.016;
    last = now;
    const aP = 1 - Math.exp(-dt * 5);
    let moving = false;

    SEAMS.forEach(s => {
      const y = s.el.getBoundingClientRect().top;          // union en pantalla
      // progreso objetivo: 0 = la union entra por abajo ... 1 = sale por arriba (bajo el menu)
      const target = Math.min(Math.max(1 - (y - topH) / (vh - topH), 0), 1);
      const before = s.p;
      s.p += (target - s.p) * aP;
      if (Math.abs(target - s.p) < 0.002) s.p = target; else moving = true;

      const mixing = s.p > 0.002 && s.p < 0.998;
      if (mixing) {
        if (s.p !== before || s.dirty || !s.shown) {
          s.u.uP.value = s.p;
          s.renderer.render(s.scene, s.camera);
        }
        if (!s.shown) { s.canvas.style.visibility = 'visible'; s.shown = true; }
      } else if (s.shown) {
        s.canvas.style.visibility = 'hidden';
        s.shown = false;
      }
      s.dirty = false;
    });
    if (moving) update();           // seguir animando hasta que el progreso se asiente
  }

  function update() { if (!queued) { queued = true; requestAnimationFrame(render); } }

  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', resize);
  addEventListener('load', resize);
  resize();
} catch (e) {
  document.querySelectorAll('.seam-fx').forEach(c => c.remove());
}
