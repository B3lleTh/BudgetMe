// Pruebas de la lógica de dinero y fechas, con los módulos reales de la app.
const base = `const db = await import('/src/lib/datos/db.ts'); const L = await import('/src/lib/datos/ledger.ts');
  await db.ejecutar("INSERT INTO cuentas_debito (nombre, saldo) VALUES ('A', 10000)");
  await db.ejecutar("INSERT INTO tarjetas (nombre, tipo, limite) VALUES ('T','credito',50000)");
  const saldo = async () => (await db.consultar('SELECT saldo FROM cuentas_debito WHERE id=1'))[0].saldo;
  const deuda = async () => (await db.consultar('SELECT saldo FROM tarjetas WHERE id=1'))[0].saldo;`;
const caso = (nombre, fecha, cuerpo) => ({ nombre, fecha, codigo: `(async () => { ${base} ${cuerpo} })()` });

export const PRUEBAS_LOGICA = [
  caso('Fecha local: 23:30 del 30-nov en CDMX sigue siendo 30-nov', '2026-11-30T23:30:00-06:00', `
    const { hoyISO, prefijoMes } = await import('/src/lib/formato.ts');
    return hoyISO() === '2026-11-30' && prefijoMes(0) === '2026-11' && prefijoMes(-1) === '2026-10' || [hoyISO(), prefijoMes(0)];`),
  caso('Borrar gasto con tarjeta BAJA la deuda', '2026-11-10T12:00:00-06:00', `
    const r = await db.ejecutar("INSERT INTO gastos (nombre,fecha,monto,metodo_pago,tarjeta_id) VALUES ('x','2026-11-10',1000,'tarjeta',1)");
    await L.registrarGasto({ gastoId: r.lastInsertId, tarjetaId: 1, metodoPago: 'tarjeta', monto: 1000, fecha: '2026-11-10' });
    const antes = await deuda();
    const [tx] = await db.consultar("SELECT * FROM transacciones WHERE ref_tabla='gastos'");
    await L.revertirTransaccion(tx);
    return antes === 1000 && await deuda() === 0 || [antes, await deuda()];`),
  caso('Deshacer pago de tarjeta regresa deuda y dinero', '2026-11-10T12:00:00-06:00', `
    await db.ejecutar("UPDATE tarjetas SET saldo = 3000 WHERE id = 1");
    await L.pagarTarjeta({ tarjetaId: 1, cuentaDebitoId: 1, monto: 3000, fecha: '2026-11-10' });
    const [tx] = await db.consultar("SELECT * FROM transacciones WHERE tipo='pago_tc'");
    await L.revertirTransaccion(tx);
    return await deuda() === 3000 && await saldo() === 10000 || [await deuda(), await saldo()];`),
  caso('Undo de un recurrente solo revierte el mes actual', '2026-11-10T12:00:00-06:00', `
    const { transaccionesDelPeriodoDeRecurrente } = await import('/src/lib/datos/consultas.ts');
    await db.ejecutar("INSERT INTO recurrentes (tipo,nombre,monto,periodicidad,cuenta_destino_id,estado) VALUES ('gasto','Netflix',300,'mensual',1,'pendiente')");
    let [r] = await db.consultar("SELECT * FROM recurrentes");
    await L.aplicarRecurrente({ recurrente: r, cuentaDebitoId: 1, monto: 300, fecha: '2026-10-05' });
    await L.aplicarRecurrente({ recurrente: r, cuentaDebitoId: 1, monto: 300, fecha: '2026-11-05' });
    [r] = await db.consultar("SELECT * FROM recurrentes");
    const tx = await transaccionesDelPeriodoDeRecurrente(r, ['recurrente']);
    for (const t of tx) await L.revertirTransaccion(t);
    return tx.length === 1 && await saldo() === 9700 || [tx.length, await saldo()];`),
  caso('Reinicio mensual: pagado en octubre vuelve a pendiente en noviembre', '2026-11-02T09:00:00-06:00', `
    const { reiniciarRecurrentesDeMesesAnteriores } = await import('/src/lib/datos/consultas.ts');
    await db.ejecutar("INSERT INTO recurrentes (tipo,nombre,monto,cuenta_destino_id,estado,ultima_aplicacion) VALUES ('gasto','Renta',9000,1,'pagado','2026-10-03'),('gasto','Gym',500,1,'pagado','2026-11-01'),('gasto','Seguro',800,1,'omitido','2026-10-20')");
    await db.ejecutar("INSERT INTO recurrentes (tipo,nombre,monto,cuenta_destino_id,estado,abonado,ultima_aplicacion) VALUES ('gasto','Luz',600,1,'pendiente',200,'2026-10-15')");
    await reiniciarRecurrentesDeMesesAnteriores();
    const f = Object.fromEntries((await db.consultar('SELECT nombre, estado, abonado FROM recurrentes')).map(x => [x.nombre, x.estado + '/' + x.abonado]));
    return f.Renta === 'pendiente/0' && f.Gym === 'pagado/0' && f.Seguro === 'pendiente/0' && f.Luz === 'pendiente/0' || f;`),
  caso('Préstamo depositado NO cuenta como ingreso del mes', '2026-11-10T12:00:00-06:00', `
    const { SQL_ES_INGRESO } = await import('/src/lib/datos/consultas.ts');
    await L.crearPrestamo({ nombre: 'P', montoOriginal: 50000, saldoInicial: 50000, tasaInteres: 10, plazoMeses: 12, pagoMensual: 4395.79, fechaInicio: '2026-11-10', cuentaDestinoId: 1, cuentaPagoId: 1 });
    await L.registrarIngreso({ cuentaDebitoId: 1, monto: 2000, categoria: 'bono', fecha: '2026-11-10' });
    const [x] = await db.consultar("SELECT COALESCE(SUM(monto),0) t FROM transacciones WHERE fecha LIKE '2026-11%' AND " + SQL_ES_INGRESO);
    return x.t === 2000 && await saldo() === 62000 || [x.t, await saldo()];`),
  caso('Pagar tarjeta con la caja de reserva (y rechazo si no alcanza)', '2026-11-10T12:00:00-06:00', `
    await db.ejecutar("UPDATE tarjetas SET saldo = 5000 WHERE id = 1");
    const [caja] = await db.consultar('SELECT id FROM cajas WHERE es_sistema = 1');
    await L.movimientoCaja({ cajaId: caja.id, cuentaDebitoId: 1, monto: 4000, direccion: 'deposito', fecha: '2026-11-10' });
    let rechazo = false;
    try { await L.pagarTarjeta({ tarjetaId: 1, usarReservaTC: true, monto: 4500, fecha: '2026-11-10' }); } catch (e) { rechazo = String(e).includes('INSUFFICIENT_RESERVE_BALANCE'); }
    await L.pagarTarjeta({ tarjetaId: 1, usarReservaTC: true, monto: 4000, fecha: '2026-11-10' });
    const [c] = await db.consultar('SELECT saldo FROM cajas WHERE id = $1', [caja.id]);
    return rechazo && c.saldo === 0 && await deuda() === 1000 && await saldo() === 6000 || [rechazo, c.saldo, await deuda(), await saldo()];`),
  caso('Pago de préstamo y su undo restauran capital y meses', '2026-11-10T12:00:00-06:00', `
    await L.crearPrestamo({ nombre: 'P', montoOriginal: 12000, saldoInicial: 12000, tasaInteres: 12, plazoMeses: 12, pagoMensual: 1066.19, fechaInicio: '2026-11-01', cuentaPagoId: 1 });
    let [p] = await db.consultar('SELECT * FROM prestamos');
    await L.pagarPrestamo({ prestamo: p, cuentaDebitoId: 1, monto: 1066.19, fecha: '2026-11-10' });
    const [tras] = await db.consultar('SELECT * FROM prestamos');
    const [tx] = await db.consultar("SELECT * FROM transacciones WHERE tipo='pago_prestamo'");
    await L.revertirPagoPrestamo(tx, tras);
    [p] = await db.consultar('SELECT * FROM prestamos');
    return Math.abs(tras.saldo_actual - 11053.81) < 0.01 && p.saldo_actual === 12000 && p.meses_pagados === 0 && await saldo() === 10000 || [tras.saldo_actual, p.saldo_actual, p.meses_pagados, await saldo()];`),
  caso('Traducción: claves con variables y apóstrofo recto', '2026-11-10T12:00:00-06:00', `
    const i = await import('/src/lib/i18n.svelte.ts');
    await i.establecerIdioma('es');
    const a = i.t("You don't have any debit accounts yet."), b = i.t('{n} pending payments', { n: 3 }), c = i.t('Texto sin traducción');
    await i.establecerIdioma('en');
    return a === 'Aún no tienes cuentas de débito.' && b === '3 pagos pendientes' && c === 'Texto sin traducción' || [a, b, c];`),
  caso('Avisos: tarjeta cerca del límite y meta alcanzada', '2026-11-10T12:00:00-06:00', `
    const R = await import('/src/lib/datos/resumen.ts');
    const { calcularAvisos } = await import('/src/componentes/inicio/avisos.ts');
    await db.ejecutar("UPDATE tarjetas SET saldo = 45000 WHERE id = 1");
    await db.ejecutar("INSERT INTO cajas (nombre, meta, saldo) VALUES ('Viaje', 1000, 1200)");
    const b = await R.balance();
    const avisos = await calcularAvisos(b, [], 0, 0);
    const textos = avisos.map(a => a.texto).join(' | ');
    return /90%/.test(textos) && /Viaje reached its goal/.test(textos) || textos;`),
];

export async function correrLogica(entorno, c) {
  for (const p of PRUEBAS_LOGICA) {
    const page = await entorno.pagina({ fecha: p.fecha });
    try {
      const r = await page.evaluate(p.codigo);
      c.revisar(p.nombre, r === true, r);
    } catch (e) { c.revisar(p.nombre, false, e.message.split('\n')[0]); }
    await page.context().close();
  }
}
