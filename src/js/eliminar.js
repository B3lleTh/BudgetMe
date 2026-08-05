import { confirmarModal, mostrarToast } from './toasts.js';

/**
 * Flujo central de eliminación. Corrige el bug de v1: siempre espera (await)
 * la acción real antes de refrescar, y el refresco (`alExito`) debe volver a
 * consultar la base de datos — nunca reusar una variable en memoria vieja.
 */
export async function confirmarYEliminar({
  mensaje,
  titulo = 'Confirm deletion',
  accion,       // async () => void  — debe lanzar si falla
  alExito,      // async () => void  — normalmente vuelve a consultar la DB y re-renderiza
  textoConfirmar = 'Delete',
}) {
  const confirmado = await confirmarModal({ titulo, mensaje, textoConfirmar });
  if (!confirmado) return false;

  try {
    await accion();
    if (alExito) await alExito();
    mostrarToast('Deleted successfully', 'exito');
    return true;
  } catch (error) {
    console.error('Error deleting:', error);
    mostrarToast('Could not delete. Please try again.', 'error');
    return false;
  }
}

/**
 * Delegación de eventos: en vez de enlazar un listener por botón en cada
 * render (lo que rompía el borrado cuando el contenedor se re-renderizaba),
 * se enlaza UNA vez sobre el contenedor padre y se usa closest() para
 * encontrar el botón real, comparando IDs siempre como string.
 */
export function delegarClicEliminar(contenedor, selectorBoton, manejador) {
  contenedor.addEventListener('click', (evento) => {
    const boton = evento.target.closest(selectorBoton);
    if (!boton || !contenedor.contains(boton)) return;
    const id = String(boton.dataset.id);
    manejador(id, boton);
  });
}
