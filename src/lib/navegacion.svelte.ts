import { reiniciarRecurrentesDeMesesAnteriores } from './datos/consultas';

export type Vista =
  | 'bienvenida' | 'dashboard' | 'historial' | 'ingresos' | 'gastos' | 'recurrentes'
  | 'tarjetas' | 'cajas' | 'inversiones' | 'prestamos' | 'respaldos' | 'configuracion';

export const VISTAS: Vista[] = ['bienvenida', 'dashboard', 'historial', 'ingresos', 'gastos', 'recurrentes', 'tarjetas', 'cajas', 'inversiones', 'prestamos', 'respaldos', 'configuracion'];

// `version` cambia en cada navegación: App la usa como {#key} para volver a
// montar la vista (y que recargue sus datos) aunque sea la misma.
export const navegacion = $state<{ vista: Vista; version: number }>({ vista: 'bienvenida', version: 0 });

const desdeHash = (): Vista => {
  const h = location.hash.replace('#', '') as Vista;
  return VISTAS.includes(h) ? h : 'bienvenida';
};

export async function navegar(vista: Vista = desdeHash()) {
  // Al cambiar de mes, los recurrentes pagados vuelven a "pendiente".
  await reiniciarRecurrentesDeMesesAnteriores();
  if (location.hash !== `#${vista}`) history.replaceState(null, '', `#${vista}`);
  navegacion.vista = vista;
  navegacion.version++;
}

/** Vuelve a montar la vista actual (tras un cambio global como el tema). */
export const refrescar = () => navegar(navegacion.vista);
