// Pruebas haciendo clic en la interfaz real.
import { sembrar, irA } from './semilla.mjs';

export async function correrInterfaz(entorno, c) {
  const page = await entorno.pagina({ fecha: '2026-11-10T12:00:00-06:00' });
  const q = (sql) => page.evaluate(async (s) => (await import('/src/lib/datos/db.ts')).consultar(s), sql);
  await sembrar(page, 'recurrentes');

  // 1) Pagar la mensualidad MSI eligiendo la cuenta
  const deudaAntes = (await q('SELECT saldo FROM tarjetas WHERE id=1'))[0].saldo;
  await page.locator('.fila', { hasText: 'installment 1/6' }).getByRole('button', { name: 'Pay', exact: true }).click();
  await page.waitForSelector('#form-pagar');
  const deshabilitadas = await page.locator('.opcion-pago--deshabilitada').count();
  await page.locator('.opcion-pago', { hasText: 'Nómina' }).click();
  await page.locator('button[form=form-pagar]').click();
  await page.waitForSelector('#form-pagar', { state: 'detached' });
  await page.waitForTimeout(300);
  const [rec] = await q("SELECT estado, ultima_aplicacion FROM recurrentes WHERE gasto_id IS NOT NULL");
  const [g] = await q("SELECT msi_pagados FROM gastos WHERE es_msi=1");
  const deudaDespues = (await q('SELECT saldo FROM tarjetas WHERE id=1'))[0].saldo;
  c.revisar('Pagar MSI desde el diálogo: pagado, −3000 deuda, msi_pagados=1', rec.estado === 'pagado' && rec.ultima_aplicacion === '2026-11-10' && g.msi_pagados === 1 && deudaAntes - deudaDespues === 3000, { rec, g, deudaAntes, deudaDespues });
  c.revisar('Cuentas sin saldo suficiente aparecen deshabilitadas', deshabilitadas >= 1, deshabilitadas);

  // 2) Deshacer ese pago
  await page.locator('.fila', { hasText: 'Laptop' }).getByRole('button', { name: 'Undo payment' }).click();
  await page.waitForTimeout(600);
  const [rec2] = await q("SELECT estado FROM recurrentes WHERE gasto_id IS NOT NULL");
  const [g2] = await q("SELECT msi_pagados FROM gastos WHERE es_msi=1");
  const deuda3 = (await q('SELECT saldo FROM tarjetas WHERE id=1'))[0].saldo;
  c.revisar('Undo del pago MSI: pendiente, deuda y contador restaurados', rec2.estado === 'pendiente' && g2.msi_pagados === 0 && deuda3 === deudaAntes, { rec2, g2, deuda3 });

  // 3) Gasto rápido con doble clic → un solo registro
  const antes = (await q('SELECT COUNT(*) n FROM gastos'))[0].n;
  await page.locator('.fab').click();
  await page.waitForSelector('#form-rapido');
  await page.locator('#form-rapido input').first().fill('Estacionamiento');
  await page.locator('#form-rapido input[inputmode=decimal]').fill('45');
  await page.locator('button[form=form-rapido]').dblclick();
  await page.waitForTimeout(800);
  const despues = (await q('SELECT COUNT(*) n FROM gastos'))[0].n;
  c.revisar('Doble clic en gasto rápido registra UNA vez', despues - antes === 1, { antes, despues });

  // 4) No se puede borrar una caja con dinero
  await irA(page, 'cajas');
  await page.locator('.caja', { hasText: 'Fondo de emergencia' }).getByRole('button', { name: 'Delete' }).click();
  await page.waitForTimeout(300);
  const confirmacion = await page.locator('.modal--confirmacion').count();
  const toast = await page.locator('.toast').last().textContent();
  c.revisar('Borrar caja con saldo: bloqueado con explicación', confirmacion === 0 && /still has money/.test(toast), { confirmacion, toast });

  // 5) Inicio: figura, calendario, avisos y actividad
  await irA(page, 'bienvenida');
  const tubos = await page.locator('[data-tubo]').count();
  const hoy = await page.locator('.dia.hoy').textContent();
  const marcasIngreso = await page.locator('.marca--ingreso').count();
  const actividad = await page.locator('.actividad li').count();
  const avisos = await page.locator('.aviso-item').count();
  c.revisar('Inicio: 4 tubos, hoy marcado, quincenas, actividad y avisos', tubos === 4 && hoy.trim() === '10' && marcasIngreso >= 2 && actividad === 6 && avisos >= 1, { tubos, hoy, marcasIngreso, actividad, avisos });

  // 6) Cambiar idioma desde Configuración traduce sin recargar
  await irA(page, 'configuracion');
  await page.getByRole('button', { name: 'Español' }).click();
  await page.waitForTimeout(300);
  const nav = await page.locator('.nav__item.activo').textContent();
  await irA(page, 'dashboard');
  const titulo = await page.locator('.panel-seccion__titulo').first().textContent();
  c.revisar('Español: menú y Panel traducidos al instante', nav.trim() === 'Configuración' && titulo.trim() === 'Este mes', { nav, titulo });

  await page.context().close();
}
