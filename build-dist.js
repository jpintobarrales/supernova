// Arma ./dist (lo que publica Cloudflare via wrangler.jsonc) con SOLO lo que el sitio carga,
// y lo "endurece" para que copiar el codigo sea mucho mas incomodo:
//   - HTML: sin comentarios ni espacios sobrantes
//   - CSS : minificado
//   - JS  : minificado + ofuscado (nombres ilegibles, textos en tabla cifrada)
// El codigo fuente legible queda SOLO en tu carpeta / repositorio; lo publicado es lo ilegible.
//
// Uso:   npm run build            (arma dist)
//        npm run deploy           (arma dist y publica en Cloudflare)
//        node build-dist.js --plain   (solo minifica, sin ofuscar: util para depurar)
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const JavaScriptObfuscator = require('javascript-obfuscator');
const { minify: minifyHtml } = require('html-minifier-terser');

const PLAIN = process.argv.includes('--plain');

const JS = ['game.js', 'ticker.js', 'menu-fx.js', 'footer.js', 'transition.js'];
const COPY = ['favicon.png', 'SUPERNOVA.jpg', '_headers'];
const DIRS = ['personajes', 'sprites', 'merch'];   // solo .webp (los PNG/JPG originales no se publican)

// Ofuscacion "moderada": ilegible pero sin ralentizar el juego (sin aplanado de flujo ni codigo basura)
const OBFUSCATE = {
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,            // los nombres que usa el HTML (onclick, ids) no se tocan
  stringArray: true,
  stringArrayThreshold: 0.8,
  stringArrayEncoding: ['base64'],
  stringArrayWrappersCount: 1,
  splitStrings: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false,
  numbersToExpressions: false,
  simplify: true,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  target: 'browser',
};

const size = f => fs.statSync(f).size;
const rows = [];
const note = (name, before, after) => rows.push([name, before, after]);

(async () => {
  fs.rmSync('dist', { recursive: true, force: true });
  fs.mkdirSync('dist', { recursive: true });

  // ---- HTML ----
  const html = fs.readFileSync('index.html', 'utf8');
  const htmlMin = await minifyHtml(html, {
    collapseWhitespace: true,
    conservativeCollapse: true,   // conserva 1 espacio entre elementos en linea (botones, textos)
    removeComments: true,
    minifyCSS: true,
    keepClosingSlash: true,
  });
  fs.writeFileSync('dist/index.html', htmlMin);
  note('index.html', html.length, htmlMin.length);

  // ---- CSS ----
  const css = fs.readFileSync('style.css', 'utf8');
  const cssMin = esbuild.transformSync(css, { loader: 'css', minify: true }).code;
  fs.writeFileSync('dist/style.css', cssMin);
  note('style.css', css.length, cssMin.length);

  // ---- JS ----
  JS.forEach(f => {
    const src = fs.readFileSync(f, 'utf8');
    let out = esbuild.transformSync(src, { loader: 'js', minify: true, target: 'es2019', legalComments: 'none' }).code;
    if (!PLAIN) out = JavaScriptObfuscator.obfuscate(out, OBFUSCATE).getObfuscatedCode();
    fs.writeFileSync(path.join('dist', f), out);
    note(f, src.length, out.length);
  });

  // ---- tal cual ----
  COPY.forEach(f => fs.copyFileSync(f, path.join('dist', f)));
  DIRS.forEach(d => {
    fs.mkdirSync(path.join('dist', d), { recursive: true });
    fs.readdirSync(d).filter(f => f.endsWith('.webp')).forEach(f => fs.copyFileSync(path.join(d, f), path.join('dist', d, f)));
  });

  let total = 0, n = 0;
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else { total += size(p); n++; }
    });
  })('dist');

  console.log(PLAIN ? 'Modo --plain (solo minificado)' : 'Modo ofuscado');
  rows.forEach(([name, a, b]) => console.log(`  ${name.padEnd(14)} ${(a / 1024).toFixed(1).padStart(7)} KB -> ${(b / 1024).toFixed(1).padStart(7)} KB`));
  console.log(`dist listo: ${n} archivos, ${(total / 1024).toFixed(0)} KB`);
})().catch(e => { console.error(e); process.exit(1); });
