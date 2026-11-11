// Toasts y diálogo de confirmación. Los componentes Toasts.svelte y
// Confirmacion.svelte (montados una vez en App) leen este estado.
import { t } from './i18n.svelte';

export type TipoToast = 'exito' | 'error' | 'info';
export interface Toast { id: number; mensaje: string; tipo: TipoToast }

export const toasts = $state<Toast[]>([]);
let siguiente = 1;

/** El mensaje se traduce aquí: pasa el texto en inglés. */
export function mostrarToast(mensaje: string, tipo: TipoToast = 'info', duracionMs = 3500) {
  const id = siguiente++;
  toasts.push({ id, mensaje: t(mensaje), tipo });
  setTimeout(() => cerrarToast(id), duracionMs);
}

export function cerrarToast(id: number) {
  const i = toasts.findIndex(x => x.id === id);
  if (i >= 0) toasts.splice(i, 1);
}

interface Pregunta { titulo: string; mensaje: string; textoConfirmar: string; responder: (si: boolean) => void }
export const confirmacion = $state<{ actual: Pregunta | null }>({ actual: null });

/** Confirmación propia (sin confirm() nativo). Resuelve true si acepta. */
export function confirmar({ titulo = 'Confirm deletion', mensaje, textoConfirmar = 'Delete' }: { titulo?: string; mensaje: string; textoConfirmar?: string }): Promise<boolean> {
  return new Promise((resolver) => {
    confirmacion.actual = {
      titulo, mensaje, textoConfirmar,
      responder: (si) => { confirmacion.actual = null; resolver(si); },
    };
  });
}

/** Flujo central de borrado: confirma, ejecuta, refresca y avisa. `accion`
 * debe limpiar dependientes antes de borrar el registro (evita huérfanos). */
export async function confirmarYEliminar({ mensaje, titulo, textoConfirmar, accion, alExito }: {
  mensaje: string; titulo?: string; textoConfirmar?: string; accion: () => Promise<unknown>; alExito?: () => unknown;
}): Promise<boolean> {
  if (!(await confirmar({ titulo, mensaje, textoConfirmar }))) return false;
  try {
    await accion();
    await alExito?.();
    mostrarToast('Deleted successfully', 'exito');
    return true;
  } catch (error) {
    console.error('Error deleting:', error);
    mostrarToast('Could not delete. Please try again.', 'error');
    return false;
  }
}
