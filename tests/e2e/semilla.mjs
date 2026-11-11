// Datos de ejemplo cargados con el MISMO libro mayor de la app.
export const semilla = async () => {
  const db = await import('/src/lib/datos/db.ts');
  const L = await import('/src/lib/datos/ledger.ts');
  const { hoyISO, prefijoMes } = await import('/src/lib/formato.ts');
  const mes = prefijoMes(0), prev = prefijoMes(-1);
  await db.ejecutar(`INSERT INTO configuracion (clave, valor) VALUES ('nombre_usuario','Liliana')`);
  await db.ejecutar(`INSERT INTO cuentas_debito (nombre, banco, saldo) VALUES ('Nómina','BBVA',18500),('Ahorro diario','Nu',4200)`);
  await db.ejecutar(`INSERT INTO tarjetas (nombre, banco, tipo, limite, fecha_corte, fecha_limite_pago) VALUES ('Oro','Banamex','credito',45000,12,2)`);
  await db.ejecutar(`INSERT INTO recurrentes (tipo,nombre,categoria,monto,periodicidad,dias_de_pago,es_variable,cuenta_destino_id,estado) VALUES ('ingreso','Sueldo','salario',16000,'quincenal','[15,30]',0,1,'pendiente')`);
  await db.ejecutar(`INSERT INTO recurrentes (tipo,nombre,categoria,monto,periodicidad,cuenta_destino_id,estado,meses_activos) VALUES ('gasto','Renta','vivienda',9500,'mensual',1,'pendiente','[]'),('gasto','Netflix','suscripcion',299,'mensual',1,'pendiente','[]'),('gasto','Gimnasio','salud',650,'mensual',2,'pendiente','[]')`);
  const [sueldo] = await db.consultar(`SELECT * FROM recurrentes WHERE nombre='Sueldo'`);
  await L.aplicarRecurrente({ recurrente: sueldo, cuentaDebitoId: 1, monto: 16000, fecha: `${prev}-15` });
  await L.aplicarRecurrente({ recurrente: sueldo, cuentaDebitoId: 1, monto: 16000, fecha: `${prev}-28` });
  await L.aplicarRecurrente({ recurrente: sueldo, cuentaDebitoId: 1, monto: 16000, fecha: `${mes}-01` });
  const gasto = async (nombre, categoria, monto, dia, metodo = 'debito', msi = 0) => {
    const f = `${mes}-${String(dia).padStart(2, '0')}`;
    const r = await db.ejecutar(`INSERT INTO gastos (nombre,categoria,fecha,monto,metodo_pago,tarjeta_id,cuenta_debito_id,es_msi,msi_meses,msi_periodicidad,msi_monto_por_corte) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [nombre, categoria, f, monto, metodo, metodo === 'tarjeta' ? 1 : null, metodo === 'debito' ? 1 : null, msi ? 1 : 0, msi || null, msi ? 'mensual' : null, msi ? Math.round((monto / msi) * 100) / 100 : null]);
    await L.registrarGasto({ gastoId: r.lastInsertId, cuentaDebitoId: 1, tarjetaId: 1, metodoPago: metodo, monto, categoria, notas: nombre, fecha: f });
  };
  await gasto('Súper Chedraui', 'importante', 1840, 2);
  await gasto('Café', 'hormiga', 65, 3);
  await gasto('Gasolina', 'variable', 900, 4);
  await gasto('Laptop', 'compras', 18000, 5, 'tarjeta', 6);
  await gasto('Cena "La Casa"', 'variable', 1250, 6, 'tarjeta');
  await db.ejecutar(`INSERT INTO cajas (nombre, objetivo, meta) VALUES ('Fondo de emergencia','3 meses de gastos',60000),('Viaje a Oaxaca',NULL,15000)`);
  const cajas = await db.consultar(`SELECT id FROM cajas WHERE es_sistema = 0 ORDER BY id`);
  await L.movimientoCaja({ cajaId: cajas[0].id, cuentaDebitoId: 1, monto: 8000, direccion: 'deposito', fecha: `${mes}-02` });
  await L.movimientoCaja({ cajaId: cajas[1].id, cuentaDebitoId: 2, monto: 2500, direccion: 'deposito', fecha: `${mes}-02` });
  await L.crearPrestamo({ nombre: 'Auto', montoOriginal: 120000, saldoInicial: 84000, tasaInteres: 12, plazoMeses: 36, mesesPagados: 12, pagoMensual: 3954.15, fechaInicio: '2025-11-01', fechaCorte: 10, cuentaDestinoId: null, cuentaPagoId: 1 });
  await L.crearInversion({ nombre: 'CETES 28', cuentaOrigenId: 2, aporte: 1500, tasaAnual: 10.5, fecha: hoyISO() });
  return 'ok';
};

/** Siembra y vuelve a montar la vista actual. */
export async function sembrar(page, vista = 'bienvenida') {
  await page.evaluate(`(${semilla})()`);
  await irA(page, vista);
}

export async function irA(page, vista) {
  await page.evaluate(async (v) => (await import('/src/lib/navegacion.svelte.ts')).navegar(v), vista);
  await page.waitForFunction(() => !document.querySelector('.cargando'));
  await page.waitForTimeout(250);
}
