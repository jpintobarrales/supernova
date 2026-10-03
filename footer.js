// Reloj de la barra de tareas del footer (HH:MM, hora local del visitante)
(function () {
  const el = document.getElementById('clock');
  if (!el) return;
  function tick() {
    const d = new Date();
    el.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  tick();
  setInterval(tick, 15000);
})();
