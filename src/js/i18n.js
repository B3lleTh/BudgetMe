import { consultar, ejecutar } from './db.js';

/**
 * i18n layer.
 *
 * Two mechanisms work together:
 * 1) DICCIONARIO / t('clave') — used for the nav menu and Settings screen,
 *    where we control the exact string composition in code.
 * 2) FRASES + traducirNodo(el) — a lightweight "phrase substitution" layer
 *    that walks any rendered DOM subtree and swaps known English phrases for
 *    their Spanish equivalent (text nodes + title/placeholder attributes).
 *    This is what makes the rest of the app (recurrentes, gastos, ingresos,
 *    tarjetas, cajas, historial, respaldos, and any modal opened via
 *    abrirModal) follow the language setting without every module needing to
 *    be individually rewritten to call t() for each string. app.js calls
 *    traducirNodo() on every view after render(), and ui.js's abrirModal()
 *    calls it on every modal it builds.
 */

export const DICCIONARIO = {
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.ingresos': 'Salary & Income',
    'nav.gastos': 'Expenses',
    'nav.historial': 'History',
    'nav.tarjetas': 'Cards',
    'nav.cajas': 'Savings Boxes',
    'nav.recurrentes': 'Recurring',
    'nav.inversiones': 'Investments',
    'nav.prestamos': 'Loans',
    'nav.respaldos': 'Backups',
    'nav.configuracion': 'Settings',
    'settings.title': 'Settings',
    'settings.subtitle': 'App preferences',
    'settings.language': 'Language',
    'settings.language.help': 'Changes the whole app immediately.',
    'settings.language.en': 'English',
    'settings.language.es': 'Español',
    'settings.note.title': 'Coverage note',
    'settings.note.body': "The nav menu, this page, and the rest of the app's screens all follow this setting.",
    'toast.language.changed': 'Language updated',
  },
  es: {
    'nav.dashboard': 'Panel',
    'nav.ingresos': 'Salario e Ingresos',
    'nav.gastos': 'Gastos',
    'nav.historial': 'Historial',
    'nav.tarjetas': 'Tarjetas',
    'nav.cajas': 'Cajas de ahorro',
    'nav.inversiones': 'Inversiones',
    'nav.recurrentes': 'Recurrentes',
    'nav.prestamos': 'Préstamos',
    'nav.respaldos': 'Respaldos',
    'nav.configuracion': 'Configuración',
    'settings.title': 'Configuración',
    'settings.subtitle': 'Preferencias de la app',
    'settings.language': 'Idioma',
    'settings.language.help': 'Cambia toda la app de inmediato.',
    'settings.language.en': 'English',
    'settings.language.es': 'Español',
    'settings.note.title': 'Nota de cobertura',
    'settings.note.body': 'El menú de navegación, esta página y el resto de las pantallas de la app siguen esta preferencia.',
    'toast.language.changed': 'Idioma actualizado',
  },
};

let idiomaActual = 'en';

export function idioma() {
  return idiomaActual;
}

export function t(clave) {
  return DICCIONARIO[idiomaActual]?.[clave] || DICCIONARIO.en[clave] || clave;
}

export async function cargarIdioma() {
  try {
    const filas = await consultar(`SELECT valor FROM configuracion WHERE clave = 'idioma'`);
    idiomaActual = filas[0]?.valor === 'es' ? 'es' : 'en';
  } catch {
    idiomaActual = 'en';
  }
  return idiomaActual;
}

export async function establecerIdioma(nuevoIdioma) {
  idiomaActual = nuevoIdioma === 'es' ? 'es' : 'en';
  await ejecutar(
    `INSERT INTO configuracion (clave, valor) VALUES ('idioma', $1)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
    [idiomaActual]
  );
  return idiomaActual;
}

/** English phrase → Spanish phrase. The engine auto-sorts by length (desc)
 * so partial phrases never clobber longer ones. */
const FRASES = [
  // Genéricos / botones / formularios
  ['Save changes', 'Guardar cambios'], ['Cancel', 'Cancelar'], ['Save', 'Guardar'],
  ['Delete', 'Eliminar'], ['Confirm deletion', 'Confirmar eliminación'],
  ['Deleted successfully', 'Eliminado correctamente'], ['Could not delete. Please try again.', 'No se pudo eliminar. Intenta de nuevo.'],
  ['Enter a name', 'Ingresa un nombre'], ['Enter a valid amount', 'Ingresa un monto válido'],
  ['Name', 'Nombre'], ['Category', 'Categoría'], ['Amount', 'Monto'], ['Date', 'Fecha'],
  ['Notes (optional)', 'Notas (opcional)'], ['Notes', 'Notas'], ['Account', 'Cuenta'],
  ['Register a debit account first', 'Registra primero una cuenta de débito'],
  ['Register a credit card first', 'Registra primero una tarjeta de crédito'],
  ['Edit', 'Editar'], ['New', 'Nuevo'], ['Create', 'Crear'], ['Confirm', 'Confirmar'],
  ['Loading dashboard…', 'Cargando panel…'],
  ['An error occurred while loading this section.', 'Ocurrió un error al cargar esta sección.'],
  ['An error occurred while loading the section', 'Ocurrió un error al cargar la sección'],
  ['Log a quick small expense', 'Registrar un gasto hormiga rápido'],

  // Dashboard
  ['Available balance (debit)', 'Saldo disponible (débito)'],
  ['This month\u2019s expenses', 'Gastos de este mes'],
  ['This month\u2019s income', 'Ingresos de este mes'],
  ['This month\u2019s savings', 'Ahorro de este mes'],
  ['Total to pay this month (recurring + cards)', 'Total a pagar este mes (recurrentes + tarjetas)'],
  ['Pending to pay (recurring)', 'Pendiente por pagar (recurrentes)'],
  ['Next statement date', 'Próxima fecha de corte'],
  ['Next payment due date', 'Próxima fecha límite de pago'],
  ['Credit available', 'Crédito disponible'],
  ['Credit used', 'Crédito utilizado'],
  ['Net Worth', 'Patrimonio neto'],
  ['Total saved', 'Total ahorrado'],
  ['Reserved for card payments', 'Reservado para pago de tarjetas'],
  ['General overview', 'Panorama general'],
  ['vs previous month', 'vs. mes anterior'],
  ['Monthly Behavior', 'Comportamiento mensual'],
  ['Annual Behavior', 'Comportamiento anual'],
  ['First, register your income', 'Primero, registra tus ingresos'],
  ['Without your salary or main income registered, the rest of the dashboard indicators have nothing to calculate from.', 'Sin tu salario o ingreso principal registrado, el resto de los indicadores del panel no tienen nada de dónde calcular.'],
  ['Register my income', 'Registrar mis ingresos'],
  ['Click a card for the breakdown', 'Haz clic en una tarjeta para ver el desglose'],
  ['Breakdown', 'Desglose'],
  ['No details available', 'No hay detalles disponibles'],
  ['This month', 'Este mes'],
  ['Net worth', 'Patrimonio neto'],
  ['(card debt)', '(deuda de tarjeta)'],

  // Préstamos
  ['Loans', 'Préstamos'],
  ['Track personal loans, their interest, and their payoff progress', 'Da seguimiento a tus préstamos personales, su interés y su avance de pago'],
  ['New loan', 'Nuevo préstamo'],
  ['Total owed', 'Total adeudado'],
  ['Total owed on loans', 'Total adeudado en préstamos'],
  ['Monthly payments committed', 'Mensualidades comprometidas'],
  ['No loans registered yet', 'Aún no hay préstamos registrados'],
  ['Register a loan you\u2019re paying off — new or one you already had running.', 'Registra un préstamo que estés pagando — nuevo o uno que ya traías corriendo.'],
  ['This loan will be deleted. This does not revert past payments already applied.', 'Este préstamo será eliminado. Esto no revierte pagos ya aplicados.'],
  ['Paid off', 'Liquidado'],
  ['annual', 'anual'],
  ['payments', 'pagos'],
  ['Monthly payment', 'Mensualidad'],
  ['Original amount', 'Monto original'],
  ['Annual interest rate (%)', 'Tasa de interés anual (%)'],
  ['Total term (months)', 'Plazo total (meses)'],
  ['Statement/payment day', 'Día de corte/pago'],
  ['Start date', 'Fecha de inicio'],
  ['I already have this loan running (some payments already made outside the app)', 'Ya traigo este préstamo corriendo (ya hice algunos pagos fuera de la app)'],
  ['Deposit the loan amount into an account?', '¿Depositar el monto del préstamo en una cuenta?'],
  ['No — I already have the money / don\u2019t track this deposit', 'No — ya tengo el dinero / no rastrear este depósito'],
  ['Remaining balance owed today', 'Saldo restante que debes hoy'],
  ['Payments already made', 'Pagos ya realizados'],
  ['Pay from account', 'Pagar desde la cuenta'],
  ['Estimated monthly payment', 'Mensualidad estimada'],
  ['for', 'para'],
  ['remaining months.', 'meses restantes.'],
  ['Payments already made cannot reach or exceed the total term', 'Los pagos ya realizados no pueden igualar o superar el plazo total'],
  ['Loan registered', 'Préstamo registrado'],
  ['Could not save the loan', 'No se pudo guardar el préstamo'],
  ['Loan payments must be made in full from Recurring', 'Los pagos de préstamo deben hacerse completos desde Recurrentes'],
  ['Total owed on loans (outstanding balance)', 'Total adeudado en préstamos (saldo pendiente)'],

  // Recurrentes
  ['Recurring expenses', 'Gastos recurrentes'],
  ['Subscriptions, insurance, and fixed monthly payments', 'Suscripciones, seguros y pagos fijos mensuales'],
  ['New recurring expense', 'Nuevo gasto recurrente'],
  ['Pending this month', 'Pendiente este mes'],
  ['Already paid this month', 'Ya pagado este mes'],
  ['Total committed', 'Total comprometido'],
  ['Last 6 months', 'Últimos 6 meses'],
  ['No recurring expenses yet', 'Aún no hay gastos recurrentes'],
  ['Register Netflix, gym, insurance, or any fixed monthly payment.', 'Registra Netflix, el gimnasio, seguros o cualquier pago fijo mensual.'],
  ['This recurring expense will be deleted.', 'Este gasto recurrente será eliminado.'],
  ['Marked as paid and deducted', 'Marcado como pagado y descontado'],
  ['Could not mark as paid', 'No se pudo marcar como pagado'],
  ['Marked as paid (no deduction)', 'Marcado como pagado (sin descuento)'],
  ['Recurring expense skipped this period', 'Gasto recurrente omitido este periodo'],
  ['Skip undone — back to pending', 'Omisión deshecha — vuelve a pendiente'],
  ['Payment undone — back to pending', 'Pago deshecho — vuelve a pendiente'],
  ['Could not undo the payment', 'No se pudo deshacer el pago'],
  ['Recurring expense reactivated', 'Gasto recurrente reactivado'],
  ['Recurring expense paused', 'Gasto recurrente pausado'],
  ['no category', 'sin categoría'],
  ['applies', 'aplica'],
  ['Every month', 'Todos los meses'],
  ['Paid so far', 'Pagado hasta ahora'],
  ['Active this period', 'Activo este periodo'],
  ['Deducts the amount from your debit account', 'Descuenta el monto de tu cuenta de débito'],
  ['Mark as paid', 'Marcar como pagado'],
  ['Only changes the status, doesn\u2019t move money', 'Solo cambia el estado, no mueve dinero'],
  ['Already paid (no deduction)', 'Ya pagado (sin descuento)'],
  ['Register a partial payment toward this amount', 'Registra un abono a este monto'],
  ['Undo the last payment for this item', 'Deshace el último pago de este elemento'],
  ['Add payment', 'Abonar'],
  ['Skip', 'Omitir'],
  ['Undo skip', 'Deshacer omisión'],
  ['Undo payment', 'Deshacer pago'],
  ['Undo', 'Deshacer'],
  ['recurring expense', 'gasto recurrente'],
  ['Frequency', 'Frecuencia'],
  ['Charge account', 'Cuenta de cargo'],
  ['Which months does it apply to? (leave empty for all)', '¿A qué meses aplica? (vacío = todos)'],
  ['Recurring expense updated', 'Gasto recurrente actualizado'],
  ['Recurring expense created', 'Gasto recurrente creado'],
  ['Could not save', 'No se pudo guardar'],
  ['Remaining to fully pay this period', 'Falta para pagar completo este periodo'],
  ['Amount to pay now', 'Monto a pagar ahora'],
  ['From account', 'Desde la cuenta'],
  ['Register payment', 'Registrar abono'],
  ['Cannot exceed the remaining amount', 'No puede exceder el monto restante'],
  ['Fully paid off', 'Pagado por completo'],
  ['Partial payment registered', 'Abono registrado'],
  ['Could not register the payment', 'No se pudo registrar el pago'],
  ['Pending', 'Pendiente'], ['Paid', 'Pagado'], ['Skipped', 'Omitido'],
  ['Weekly', 'Semanal'], ['Biweekly', 'Quincenal'], ['Monthly', 'Mensual'], ['Custom', 'Personalizado'],
  ['Every', 'Cada'], ['days', 'días'],
  ['Card payments must be made in full from Recurring', 'Los pagos de tarjeta deben hacerse completos desde Recurrentes'],

  // Gastos
  ['Total this month', 'Total este mes'],
  ['New expense', 'Nuevo gasto'],
  ['All categories', 'Todas las categorías'],
  ['Small daily spend', 'Gasto hormiga'],
  ['Variable', 'Variable'],
  ['Important', 'Importante'],
  ['Shopping', 'Compras'],
  ['Total spent this month by category', 'Total gastado este mes por categoría'],
  ['# entries', '# de registros'],
  ['Total', 'Total'],
  ['No expenses yet', 'Aún no hay gastos'],
  ['Register your first expense to start seeing your monthly behavior.', 'Registra tu primer gasto para empezar a ver tu comportamiento mensual.'],
  ['This expense will be deleted and the balance of the affected account/card will be reverted.', 'Este gasto será eliminado y se revertirá el saldo de la cuenta/tarjeta afectada.'],
  ['Installments', 'Meses sin intereses'],
  ['each', 'c/u'],
  ['biweekly', 'quincenal'],
  ['monthly', 'mensual'],
  ['Edit expense', 'Editar gasto'],
  ['The amount isn\u2019t editable here to avoid throwing off your history: if the amount is wrong, delete the expense (reverts the balance) and register it again.', 'El monto no es editable aquí para no descuadrar tu historial: si está mal, elimina el gasto (revierte el saldo) y regístralo de nuevo.'],
  ['Expense updated', 'Gasto actualizado'],
  ['Could not update', 'No se pudo actualizar'],
  ['How was it paid?', '¿Cómo se pagó?'],
  ['Credit card', 'Tarjeta de crédito'],
  ['Debit', 'Débito'],
  ['Card', 'Tarjeta'],
  ['Interest-free installment purchase', 'Compra a meses sin intereses'],
  ['Number of months', 'Número de meses'],
  ['Charge monthly', 'Cobrar mensual'],
  ['Split biweekly', 'Dividir quincenal'],
  ['payments of', 'pagos de'],
  ['every two weeks', 'cada dos semanas'],
  ['every month', 'cada mes'],
  ['two weeks', 'dos semanas'],
  ['month.', 'mes.'],
  ['Expense registered', 'Gasto registrado'],
  ['Could not save the expense', 'No se pudo guardar el gasto'],
  ['Quick small expense', 'Gasto hormiga rápido'],
  ['What for?', '¿En qué?'],
  ['Register', 'Registrar'],
  ['Small expense registered', 'Gasto hormiga registrado'],
  ['Could not register', 'No se pudo registrar'],

  // Ingresos
  ['Salary and Income', 'Salario e Ingresos'],
  ['Fixed, variable, and extra income', 'Ingresos fijos, variables y extra'],
  ['Extra income', 'Ingreso extra'],
  ['New fixed income', 'Nuevo ingreso fijo'],
  ['Total this year', 'Total este año'],
  ['My income (fixed and variable)', 'Mis ingresos (fijos y variables)'],
  ['You need at least one debit account. Create one first under Cards.', 'Necesitas al menos una cuenta de débito. Créala primero en Tarjetas.'],
  ['You haven\u2019t registered your salary or main income yet.', 'Aún no has registrado tu salario o ingreso principal.'],
  ['estimated monthly', 'estimado mensual'],
  ['next payment', 'próximo pago'],
  ['Confirm payment', 'Confirmar pago'],
  ['Adds the amount to your debit account', 'Agrega el monto a tu cuenta de débito'],
  ['Already received (no deposit)', 'Ya recibido (sin depósito)'],
  ['This recurring income will be deleted. This action cannot be undone.', 'Este ingreso recurrente será eliminado. Esta acción no se puede deshacer.'],
  ['Marked as received (no deposit added)', 'Marcado como recibido (sin depósito agregado)'],
  ['Payment confirmed', 'Pago confirmado'],
  ['Could not confirm the payment', 'No se pudo confirmar el pago'],
  ['This extra income entry will be deleted.', 'Este ingreso extra será eliminado.'],
  ['No extra income registered yet.', 'Aún no hay ingresos extra registrados.'],
  ['fixed income', 'ingreso fijo'],
  ['Type', 'Tipo'],
  ['Fixed (salary)', 'Fijo (salario)'],
  ['Variable / freelance', 'Variable / freelance'],
  ['Payment days (e.g. 15,30)', 'Días de pago (ej. 15,30)'],
  ['Every how many days', 'Cada cuántos días'],
  ['(estimated average)', '(promedio estimado)'],
  ['fixed', 'fijo'],
  ['Destination account', 'Cuenta destino'],
  ['Income updated', 'Ingreso actualizado'],
  ['Income registered', 'Ingreso registrado'],
  ['Could not save the income', 'No se pudo guardar el ingreso'],
  ['Edit extra income', 'Editar ingreso extra'],
  ['Could not update the income', 'No se pudo actualizar el ingreso'],

  // Tarjetas
  ['Cards & Accounts', 'Tarjetas y Cuentas'],
  ['Debit, credit, and their real availability', 'Débito, crédito y su disponibilidad real'],
  ['Debit account', 'Cuenta de débito'],
  ['Debit Accounts', 'Cuentas de débito'],
  ['Cards', 'Tarjetas'],
  ['no bank', 'sin banco'],
  ['You don\u2019t have any debit accounts yet.', 'Aún no tienes cuentas de débito.'],
  ['You don\u2019t have any cards registered yet.', 'Aún no tienes tarjetas registradas.'],
  ['This debit account will be deleted. This does not revert past transactions.', 'Esta cuenta de débito será eliminada. Esto no revierte transacciones pasadas.'],
  ['This card will be deleted. This does not revert past transactions.', 'Esta tarjeta será eliminada. Esto no revierte transacciones pasadas.'],
  ['credit', 'crédito'],
  ['Statement day', 'Día de corte'],
  ['Payment due day', 'Día límite de pago'],
  ['Available', 'Disponible'],
  ['used)', 'usado)'],
  ['Pay', 'Pagar'],
  ['debit account', 'cuenta de débito'],
  ['card', 'tarjeta'],
  ['Bank', 'Banco'],
  ['Current balance', 'Saldo actual'],
  ['Starting balance', 'Saldo inicial'],
  ['Account updated', 'Cuenta actualizada'],
  ['Account created', 'Cuenta creada'],
  ['Could not save the account', 'No se pudo guardar la cuenta'],
  ['Credit', 'Crédito'],
  ['Current debt', 'Deuda actual'],
  ['Credit limit', 'Límite de crédito'],
  ['Card updated', 'Tarjeta actualizada'],
  ['Card created', 'Tarjeta creada'],
  ['Could not save the card', 'No se pudo guardar la tarjeta'],
  ['Amount to pay', 'Monto a pagar'],
  ['Use money reserved in', 'Usar dinero reservado en'],
  ['available)', 'disponible)'],
  ['Tip: go to Savings Boxes and manually deposit money into', 'Consejo: ve a Cajas de ahorro y deposita dinero manualmente en'],
  ['ahead of time — it will then show up here as an option to pay with.', 'con anticipación — así aparecerá aquí como opción de pago.'],
  ['Reserved for Card Payments', 'Reservado para pago de tarjetas'],
  ['Source account', 'Cuenta de origen'],
  ['Payment registered', 'Pago registrado'],

  // Cajas
  ['Savings boxes', 'Cajas de ahorro'],
  ['Goals and money set aside with a purpose', 'Metas y dinero apartado con un propósito'],
  ['New box', 'Nueva caja'],
  ['You don\u2019t have any boxes yet', 'Aún no tienes cajas'],
  ['Create one for Emergencies, Trips, or whatever you want to save for.', 'Crea una para Emergencias, Viajes o lo que quieras ahorrar.'],
  ['This savings box will be deleted.', 'Esta caja de ahorro será eliminada.'],
  ['Goal', 'Meta'],
  ['Deposit', 'Depositar'],
  ['Withdraw', 'Retirar'],
  ['Adjust balance', 'Ajustar saldo'],
  ['Deposit, withdraw, or adjust here yourself whenever you decide to set money aside to pay off your cards. Nothing moves automatically.', 'Deposita, retira o ajusta aquí tú mismo cuando decidas apartar dinero para pagar tus tarjetas. Nada se mueve automáticamente.'],
  ['New savings box', 'Nueva caja de ahorro'],
  ['Goal description (optional)', 'Descripción de la meta (opcional)'],
  ['Target amount (optional)', 'Monto objetivo (opcional)'],
  ['Box created', 'Caja creada'],
  ['Could not create the box', 'No se pudo crear la caja'],
  ['Edit savings box', 'Editar caja de ahorro'],
  ['Box updated', 'Caja actualizada'],
  ['Could not update the box', 'No se pudo actualizar la caja'],
  ['Deposit to', 'Depositar en'],
  ['Withdraw from', 'Retirar de'],
  ['To account', 'A la cuenta'],
  ['Available in this account', 'Disponible en esta cuenta'],
  ['Not enough balance in the box', 'No hay suficiente saldo en la caja'],
  ['Not enough balance in that debit account', 'No hay suficiente saldo en esa cuenta de débito'],
  ['available:', 'disponible:'],
  ['You can\u2019t deposit more than what you actually have available in that debit account', 'No puedes depositar más de lo que realmente tienes disponible en esa cuenta de débito'],
  ['Movement registered', 'Movimiento registrado'],
  ['Could not register the movement', 'No se pudo registrar el movimiento'],
  ['Adjust balance of', 'Ajustar saldo de'],
  ['Set the new balance directly — this does not move money to or from any debit account, it only corrects what this box shows.', 'Establece el nuevo saldo directamente — esto no mueve dinero hacia o desde ninguna cuenta de débito, solo corrige lo que muestra esta caja.'],
  ['New balance', 'Nuevo saldo'],
  ['Reason (optional)', 'Motivo (opcional)'],
  ['e.g. correction, manual set aside…', 'ej. corrección, apartado manual…'],
  ['Apply adjustment', 'Aplicar ajuste'],
  ['Balance cannot be negative', 'El saldo no puede ser negativo'],
  ['Balance adjusted', 'Saldo ajustado'],
  ['Could not adjust the balance', 'No se pudo ajustar el saldo'],

  // Historial
  ['Transaction History', 'Historial de transacciones'],
  ['The general ledger: absolutely everything gets recorded here', 'El libro mayor: absolutamente todo se registra aquí'],
  ['All types', 'Todos los tipos'],
  ['Income', 'Ingreso'], ['Expense', 'Gasto'], ['Transfer', 'Transferencia'], ['Card Payment', 'Pago de tarjeta'],
  ['Box Movement', 'Movimiento de caja'], ['Withdrawal', 'Retiro'], ['Recurring', 'Recurrente'],
  ['Balance Adjustment', 'Ajuste de saldo'], ['Partial Payment', 'Abono'],
  ['No transactions', 'Sin transacciones'],
  ['Every financial action you register will automatically appear here.', 'Cada acción financiera que registres aparecerá aquí automáticamente.'],

  // Respaldos
  ['Backups', 'Respaldos'],
  ['Your information lives only on this device', 'Tu información vive solo en este dispositivo'],
  ['Import', 'Importar'],
  ['Create backup now', 'Crear respaldo ahora'],
  ['Danger zone — Reset everything', 'Zona de peligro — Reiniciar todo'],
  ['This permanently deletes all your accounts, cards, boxes, expenses, income, recurring items and history, leaving the app as if freshly installed. Useful if you were testing the app and want to start fresh with real data. You will be required to create a backup right before, in case you need to recover something afterward.',
   'Esto elimina permanentemente todas tus cuentas, tarjetas, cajas, gastos, ingresos, recurrentes e historial, dejando la app como recién instalada. Útil si estabas probando la app y quieres empezar de cero con datos reales. Se te pedirá crear un respaldo justo antes, por si necesitas recuperar algo después.'],
  ['Reset everything', 'Reiniciar todo'],
  ['Backup created', 'Respaldo creado'],
  ['Could not create the backup', 'No se pudo crear el respaldo'],
  ['Import backup', 'Importar respaldo'],
  ['This will replace your current information (a safety backup will be created first). Continue?', 'Esto reemplazará tu información actual (se creará un respaldo de seguridad primero). ¿Continuar?'],
  ['Backup imported. Restart the app to see the changes.', 'Respaldo importado. Reinicia la app para ver los cambios.'],
  ['Could not import', 'No se pudo importar'],
  ['Reset everything?', '¿Reiniciar todo?'],
  ['An automatic safety backup will be created first. Then you will be asked to confirm in writing to continue.', 'Primero se creará un respaldo de seguridad automático. Luego se te pedirá confirmar por escrito para continuar.'],
  ['Continue', 'Continuar'],
  ['Safety backup created', 'Respaldo de seguridad creado'],
  ['Could not create the safety backup. The reset was canceled for your own protection.', 'No se pudo crear el respaldo de seguridad. El reinicio se canceló para tu protección.'],
  ['Final confirmation', 'Confirmación final'],
  ['Your safety backup has been created. This action', 'Tu respaldo de seguridad ha sido creado. Esta acción'],
  ['cannot be undone', 'no se puede deshacer'],
  ['from within the app.', 'desde dentro de la app.'],
  ['To continue, type exactly:', 'Para continuar, escribe exactamente:'],
  ['Type RESET', 'Escribe RESET'],
  ['Type exactly RESET', 'Escribe exactamente RESET'],
  ['Everything was reset. Your backup is still available in this section.', 'Todo fue reiniciado. Tu respaldo sigue disponible en esta sección.'],
  ['Could not reset. Nothing was lost.', 'No se pudo reiniciar. No se perdió nada.'],
  ['No backups yet', 'Aún no hay respaldos'],
  ['Create your first backup to protect your information.', 'Crea tu primer respaldo para proteger tu información.'],
  ['Export', 'Exportar'],
  ['Restore', 'Restaurar'],
  ['Restore backup', 'Restaurar respaldo'],
  ['Your current information will be replaced with this backup. This action cannot be undone.', 'Tu información actual será reemplazada con este respaldo. Esta acción no se puede deshacer.'],
  ['Backup restored. Restart the app to see the changes.', 'Respaldo restaurado. Reinicia la app para ver los cambios.'],
  ['Could not restore', 'No se pudo restaurar'],
  ['Backup exported', 'Respaldo exportado'],
  ['Could not export', 'No se pudo exportar'],
];

// Ordenar por longitud descendente una sola vez para que las frases largas
// se sustituyan antes que sus sub-frases (evita traducciones parciales raras).
FRASES.sort((a, b) => b[0].length - a[0].length);

export function traducirTexto(str) {
  if (idiomaActual !== 'es' || !str) return str;
  let out = str;
  for (const [en, es] of FRASES) {
    if (out.indexOf(en) !== -1) out = out.split(en).join(es);
  }
  return out;
}

/** Recorre un subárbol del DOM y traduce nodos de texto + atributos
 * title/placeholder/aria-label visibles al usuario. No toca <script>. */
export function traducirNodo(raiz) {
  if (idiomaActual !== 'es' || !raiz) return;
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && n.parentElement.tagName !== 'SCRIPT' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodos = [];
  let n;
  while ((n = walker.nextNode())) nodos.push(n);
  for (const nodo of nodos) {
    const traducido = traducirTexto(nodo.nodeValue);
    if (traducido !== nodo.nodeValue) nodo.nodeValue = traducido;
  }
  const elementos = raiz.querySelectorAll ? raiz.querySelectorAll('[title],[placeholder],[aria-label]') : [];
  for (const el of elementos) {
    for (const attr of ['title', 'placeholder', 'aria-label']) {
      const v = el.getAttribute(attr);
      if (v) { const tr = traducirTexto(v); if (tr !== v) el.setAttribute(attr, tr); }
    }
  }
  if (raiz.hasAttribute) {
    for (const attr of ['title', 'placeholder', 'aria-label']) {
      const v = raiz.getAttribute(attr);
      if (v) { const tr = traducirTexto(v); if (tr !== v) raiz.setAttribute(attr, tr); }
    }
  }
}