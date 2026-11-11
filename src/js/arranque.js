// Punto de entrada: carga app.js de forma dinámica para poder mostrar un error visible.
const vista = document.getElementById('vista');
const LIMITE_MS = 20000;

function mostrarErrorDeArranque(error) {
  console.error('Startup failed:', error);
  vista.innerHTML = `
    <div class="tarjeta">
      <h3>The app could not start</h3>
      <p style="opacity:.75; margin:8px 0 14px;">Some files did not load. Check your connection and try again.</p>
      <pre id="detalle-error" style="font-size:12px; opacity:.7; white-space:pre-wrap; margin-bottom:14px;"></pre>
      <button class="btn btn--primario" id="btn-reintentar">Retry</button>
    </div>`;
  vista.querySelector('#detalle-error').textContent = String(error?.message || error);
  vista.querySelector('#btn-reintentar').addEventListener('click', () => location.reload());
}

async function arrancar() {
  vista.innerHTML = `<div class="cargando">Loading…</div>`;
  try {
    await Promise.race([
      import('./app.js'),
      new Promise((_, rechazar) => setTimeout(
        () => rechazar(new Error('Timed out loading the app files')), LIMITE_MS)),
    ]);
  } catch (e) {
    mostrarErrorDeArranque(e);
  }
}

arrancar();