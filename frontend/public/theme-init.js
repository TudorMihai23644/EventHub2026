// Tema se aplică înainte de prima afișare (fără „clipire” în tema greșită). Fișier separat, nu script inline:
// Content-Security-Policy permite doar scripturi de pe site. Alegerea din buton are prioritate; altfel, tema sistemului.
(function () {
  var theme = null;
  try { theme = localStorage.getItem('eventhub-theme'); } catch { /* stocare indisponibilă */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f5f4f1' : '#050506');
})();
