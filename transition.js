// Transicion "despixelada" en la union entre heroes (HOME -> BIO -> MERCH).
// En el borde inferior de cada hero hay un canvas WebGL (dentro de la propia seccion, asi que
// scrollea JUNTO con la pagina, sin retraso ni saltos). Los pixeles que aparecen se muestrean del
// fondo real del hero de abajo (degradado + cuadricula de la BIO, imagen de fondo del MERCH).
// Lo unico que cambia en el tiempo es el progreso (cuantos pixeles ya cambiaron), suavizado.
// WebGL "a mano" (sin librerias): ~4 KB en vez de ~250 KB de three.js. El contexto de cada canvas
// se crea solo cuando la union se acerca a la pantalla.
(function () {
  'use strict';

  const PIXEL = 3;     // tamano del pixel en px CSS
  const BAND  = 0.08;  // alto de la franja de pixeles (fraccion del alto de pantalla)

  // sel = seccion NUEVA (la de abajo); el canvas va al final de la seccion anterior
  // kind 0 = degradado 160deg + cuadricula de 64px (fondo de la BIO, ver style.css)
  // kind 1 = imagen de fondo "center bottom / cover" (fondo del MERCH)
  const SEAMS = [
    { sel: '.bio-section',   kind: 0 },
    { sel: '.merch-section', kind: 1, img: 'sprites/fondo_merch.webp' },
  ].map(s => ({ ...s, el: document.querySelector(s.sel) }))
   .filter(s => s.el && s.el.previousElementSibling);

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!SEAMS.length || reduced) return;

  const VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
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
      return texture2D(uTex, uv).rgb;   // sin flip: la fila superior de la imagen es v = 0
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

  let vh = innerHeight, topH = 0, pr = 1, cssH = 8;
  let queued = false, last = 0, broken = false;

  function shader(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }

  // crea el canvas + contexto + programa de una union (solo cuando hace falta)
  function init(s) {
    s.prev = s.el.previousElementSibling;
    s.canvas = document.createElement('canvas');
    s.canvas.className = 'seam-fx';
    s.canvas.setAttribute('aria-hidden', 'true');
    s.canvas.style.visibility = 'hidden';
    s.prev.appendChild(s.canvas);

    const gl = s.gl = s.canvas.getContext('webgl', {
      alpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power',
    });
    if (!gl) throw new Error('sin WebGL');

    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    // triangulo gigante que cubre todo el canvas
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 0, 0, 0);

    s.u = {};
    ['uKind', 'uP', 'uPixel', 'uPr', 'uTexOn', 'uRes', 'uSize', 'uImg', 'uTex'].forEach(n => { s.u[n] = gl.getUniformLocation(prog, n); });
    gl.uniform1f(s.u.uKind, s.kind);
    gl.uniform1f(s.u.uTexOn, 0);
    gl.uniform1i(s.u.uTex, 0);

    if (s.img) {
      const img = new Image();
      img.onload = () => {
        const tex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        // NPOT en WebGL1: sin mipmaps y con CLAMP_TO_EDGE
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform2f(s.u.uImg, img.naturalWidth, img.naturalHeight);
        gl.uniform1f(s.u.uTexOn, 1);
        s.dirty = true;
        update();
      };
      img.src = s.img;
    }

    if (s.p === undefined) s.p = 0;
    s.shown = false;
    s.ready = true;
    size(s);
  }

  function size(s) {
    const gl = s.gl, w = s.prev.clientWidth;
    s.canvas.style.height = cssH + 'px';
    s.canvas.width = Math.round(w * pr);
    s.canvas.height = Math.round(cssH * pr);
    gl.viewport(0, 0, s.canvas.width, s.canvas.height);
    gl.uniform2f(s.u.uRes, s.canvas.width, s.canvas.height);
    gl.uniform1f(s.u.uPixel, PIXEL * pr);
    gl.uniform1f(s.u.uPr, pr);
    const r = s.el.getBoundingClientRect();
    gl.uniform2f(s.u.uSize, r.width * pr, r.height * pr);
    s.dirty = true;
  }

  function resize() {
    vh = innerHeight;
    const tb = document.querySelector('.topbar');
    topH = tb ? tb.offsetHeight : 0;
    pr = Math.min(devicePixelRatio || 1, 2);
    cssH = Math.max(8, Math.round(BAND * (vh - topH)));
    SEAMS.forEach(s => { if (s.ready) size(s); });
    update();
  }

  function render(now) {
    queued = false;
    if (broken) return;
    const dt = Math.min((now - (last || now)) / 1000, 0.05) || 0.016;
    last = now;
    const aP = 1 - Math.exp(-dt * 5);
    let moving = false;

    SEAMS.forEach(s => {
      if (s.p === undefined) s.p = 0;
      const y = s.el.getBoundingClientRect().top;          // union en pantalla
      // progreso objetivo: 0 = la union entra por abajo ... 1 = sale por arriba (bajo el menu)
      const target = Math.min(Math.max(1 - (y - topH) / (vh - topH), 0), 1);
      const before = s.p;
      s.p += (target - s.p) * aP;
      if (Math.abs(target - s.p) < 0.002) s.p = target; else moving = true;

      const mixing = s.p > 0.002 && s.p < 0.998;
      if (mixing) {
        if (!s.ready) init(s);                              // contexto WebGL solo cuando hace falta
        if (s.p !== before || s.dirty || !s.shown) {
          s.gl.uniform1f(s.u.uP, s.p);
          s.gl.clear(s.gl.COLOR_BUFFER_BIT);
          s.gl.drawArrays(s.gl.TRIANGLES, 0, 3);
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

  function update() { if (!queued) { queued = true; requestAnimationFrame(t => { try { render(t); } catch (e) { fail(e); } }); } }

  // si WebGL falla (sin soporte, shader, etc.) se quita el efecto en silencio
  function fail(e) {
    broken = true;
    if (window.console) console.warn('[transition] efecto desactivado:', e && e.message ? e.message : e);
    document.querySelectorAll('.seam-fx').forEach(c => c.remove());
  }

  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', resize);
  addEventListener('load', resize);
  resize();
})();
