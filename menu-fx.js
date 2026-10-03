// Efecto de click del menu (y de los botones SUPERNOVA y base86 del footer): aparece la palabra "CLICK" con un corazoncito pixelado
// justo donde se hizo click (o sobre el boton si se activa con teclado).
(function () {
  const links = document.querySelectorAll('.nav a, .btn-base86, .foot-start');
  if (!links.length) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  links.forEach(a => a.addEventListener('click', e => {
    const r = a.getBoundingClientRect();
    const keyboard = e.detail === 0 || (!e.clientX && !e.clientY);
    const x = keyboard ? r.left + r.width / 2 : e.clientX;
    const y = keyboard ? r.bottom : e.clientY;

    const fx = document.createElement('span');
    fx.className = 'click-fx';
    fx.setAttribute('aria-hidden', 'true');
    fx.innerHTML = 'CLICK<i class="heart"></i>';
    fx.style.left = x + 'px';
    fx.style.top = (y + 4) + 'px';
    document.body.appendChild(fx);
    fx.addEventListener('animationend', () => fx.remove());
    setTimeout(() => fx.remove(), 1200);
  }));
})();
