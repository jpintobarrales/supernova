// Marquees: repite el texto para llenar TODO el ancho (el texto entra desde el extremo derecho
// y no desde la mitad de la pagina). La velocidad en px/s se conserva (data-speed).
(function () {
  const tickers = [...document.querySelectorAll('.ticker')];
  if (!tickers.length) return;

  function build(t) {
    const track = t.querySelector('.ticker-track');
    if (!track) return;
    if (!t._unitHTML) {
      const first = track.querySelector('span');
      if (!first) return;
      t._unitHTML = first.outerHTML;
    }
    track.style.animation = 'none';
    track.innerHTML = t._unitHTML;
    const unit = track.firstElementChild.getBoundingClientRect().width;
    if (!unit) return;
    const copies = Math.ceil(window.innerWidth / unit) + 2;
    track.innerHTML = t._unitHTML.repeat(copies);
    const speed = parseFloat(t.dataset.speed) || 40;      // px por segundo
    track.style.setProperty('--unit', unit + 'px');
    track.style.animation = 'tickLoop ' + (unit / speed).toFixed(2) + 's linear infinite';
  }

  function run() { tickers.forEach(build); }

  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(run);
  let rt = 0;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(run, 150); });
})();
