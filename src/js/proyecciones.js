// Convierte cualquier periodicidad a un estimado mensual y anual consistente.
// quincenal = 2 pagos/mes ≈ 24/año | semanal ≈ 4.33 pagos/mes ≈ 52/año
// personalizada = 365 / intervalo_dias pagos/año
// variable/freelance = usa el promedio estimado, salvo que ya haya pagos reales
// capturados ese mes (ver totalRealDelMesSiVariable), en cuyo caso usa lo real.
export function pagosPorAnio(recurrente) {
  switch (recurrente.periodicidad) {
    case 'semanal': return 52;
    case 'quincenal': return 24;
    case 'mensual': return 12;
    case 'personalizada': return recurrente.intervalo_dias ? 365 / recurrente.intervalo_dias : 12;
    default: return 12;
  }
}

export function montoMensualEstimado(recurrente, totalRealDelMesSiVariable = null) {
  if (recurrente.es_variable && totalRealDelMesSiVariable != null && totalRealDelMesSiVariable > 0) {
    return totalRealDelMesSiVariable;
  }
  const pagosAnio = pagosPorAnio(recurrente);
  return (recurrente.monto * pagosAnio) / 12;
}

export function montoAnualEstimado(recurrente, totalRealDelMesSiVariable = null) {
  if (recurrente.es_variable && totalRealDelMesSiVariable != null && totalRealDelMesSiVariable > 0) {
    // Mientras no haya suficiente historial, se proyecta el mes real * 12 como mejor estimado.
    return totalRealDelMesSiVariable * 12;
  }
  return recurrente.monto * pagosPorAnio(recurrente);
}

/** Calcula las próximas fechas de pago de un recurrente dentro del mes actual (para el botón "Confirmar pago"). */
export function proximasFechasDelMes(recurrente, anio, mes) {
  const dias = (() => {
    try { return JSON.parse(recurrente.dias_de_pago || '[]'); } catch { return []; }
  })();
  const diasEnMes = new Date(anio, mes, 0).getDate();

  if (recurrente.periodicidad === 'quincenal') {
    return (dias.length ? dias : [15, diasEnMes]).map(d => Math.min(d, diasEnMes));
  }
  if (recurrente.periodicidad === 'semanal') {
    // dias_de_pago guarda el día de la semana (0=domingo..6=sábado)
    const diaSemana = dias[0] ?? 5;
    const fechas = [];
    for (let d = 1; d <= diasEnMes; d++) {
      if (new Date(anio, mes - 1, d).getDay() === diaSemana) fechas.push(d);
    }
    return fechas;
  }
  if (recurrente.periodicidad === 'personalizada') {
    return dias.length ? dias.map(d => Math.min(d, diasEnMes)) : [1];
  }
  // mensual
  return [Math.min(dias[0] || 1, diasEnMes)];
}
