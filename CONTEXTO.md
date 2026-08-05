# Finanzas — v3 (contexto único del proyecto)

App de finanzas personales de escritorio. Tauri 2 + Rust + SQLite + JS puro
(sin frameworks, sin bundler). Todo local: la base `finanzas.db` vive en el
directorio de datos de la app en tu equipo; Rust solo copia/lista/restaura
ese archivo para respaldos.

## Arranque
```bash
npm install
npm install -g @tauri-apps/cli
npm run tauri:dev
```
El frontend se sirve con `npx serve src -l 1420` (`beforeDevCommand` en
`tauri.conf.json`), sin bundler: los imports npm (`@tauri-apps/plugin-sql`,
`@tauri-apps/plugin-dialog`, `@tauri-apps/api`) se resuelven vía **import
map** a `esm.sh` directamente en `index.html`.

## Arquitectura
- **Rust (`src-tauri/src/main.rs`)**: solo 5 comandos de respaldo
  (`crear_respaldo`, `listar_respaldos`, `restaurar_respaldo`,
  `exportar_respaldo`, `importar_respaldo`). Cero lógica de negocio.
- **`js/esquema.js`**: única fuente del esquema SQL + migraciones `ALTER
  TABLE` idempotentes.
- **`js/db.js`**: conexión SQLite + ejecuta el esquema una vez al inicio.
- **`js/ledger.js`**: el Libro Mayor. ÚNICA puerta de entrada para modificar
  saldos — cada función actualiza la entidad (cuenta/tarjeta/caja/inversión)
  Y registra la transacción, dentro de `BEGIN/COMMIT`. Ningún módulo de UI
  toca saldos directamente.
- **`js/modulos/*.js`**: un archivo por sección de la nav — Dashboard,
  Ingresos, Gastos, Tarjetas, Cajas, Recurrentes, Investments, Historial,
  Respaldos, Configuración. Cada uno exporta `render(vistaEl)`.
- **`js/eliminar.js`**: flujo central `confirmarYEliminar()` + delegación de
  eventos (`delegarClicEliminar`) reusado en todos los módulos.
- **`js/proyecciones.js`**: prorratea periodicidad de ingresos/recurrentes a
  mensual/anual (semanal ≈ 4.33 pagos/mes, quincenal = 2, personalizada =
  365/intervalo, variable = usa lo real del mes si ya hay pagos capturados).

## Decisiones de diseño clave

**Freelance/variable**: se extendió `recurrentes` (columna `es_variable`) en
vez de tabla paralela — el ingreso variable sigue siendo "un ingreso
recurrente", solo que el monto real puede diferir del estimado mes a mes.

**Caja "Reservado para TC"**: caja de sistema (`es_sistema = 1`), no
editable/borrable desde la UI. Al reservar dinero en un gasto a tarjeta, el
ledger lo mueve de débito a esa caja (sigue siendo tuyo, deja de contar como
"disponible").

**Pago de tarjeta de crédito — SOLO desde Recurring**: ya NO existe botón
"Pay" en la vista Tarjetas (`tarjetas.js`) — permitía pagar con una cuenta
de débito sin validar fondos suficientes, y duplicaba la lógica de pago.
Ahora el único flujo para pagar TC es marcar como pagada la mensualidad
auto-generada en Recurrentes (ver siguiente sección), que sí usa
`pagarTarjeta()` del ledger correctamente.

**Mensualidad de TC en Recurrentes — lógica MSI**:
`sincronizarMensualidadesTC()` en `recurrentes.js` genera automáticamente:
1. **Un recurrente por cada compra a meses sin intereses (MSI) activa**
   (tabla `gastos`, `es_msi=1`), vinculado por la columna `recurrentes.gasto_id`.
   Monto = `msi_monto_por_corte`, dura exactamente `msi_meses` ciclos. Cada
   vez que se marca como pagado, se incrementa `gastos.msi_pagados`; al
   llegar a `msi_meses` la compra queda saldada y el recurrente se borra
   solo (no se sigue cobrando después de terminar las mensualidades).
   "Undo" revierte tanto el dinero como el contador `msi_pagados`.
2. **Un recurrente agregado para el resto del saldo** (compras normales sin
   MSI), vinculado solo por `recurrentes.tarjeta_id` (con `gasto_id NULL`).
   Monto = `tarjeta.saldo - deuda MSI restante` (para no cobrar dos veces lo
   que ya se está cobrando en cuotas MSI separadas).
   Se recalcula en cada render mientras el recurrente siga "pendiente".

Ambos se pagan con el mismo botón "Mark as paid" de Recurrentes, que
detecta `r.tarjeta_id`/`r.gasto_id` y llama a `pagarTarjeta()` en vez del
flujo genérico de recurrentes.

## Menú de acciones (Recurring)
El botón "⋮" de cada fila abre un **modal** (no un dropdown flotante) para
evitar cualquier problema de superposición/z-index: los botones reales
quedan ocultos en el DOM (`#acciones-ocultas-<id>`) y el modal solo los
"clickea" programáticamente, reusando toda la lógica existente sin
duplicarla.

## Investments / Projections (`js/modulos/inversiones.js`)
Tabla `inversiones` (aporte inicial, saldo, tasa anual %, meses
capitalizados). "Advance 1 month" capitaliza interés mensual
(`saldo *= 1 + tasa/100/12`) y lo reinvierte (no mueve cuentas). "Withdraw"
saca dinero real a una cuenta débito. "Simulate" es una calculadora pura
(sin tocar la BD) que proyecta el valor final por año con interés
reinvertido mes a mes.

## Otras convenciones
- Toasts (`js/toasts.js`) para todo — cero `alert()`/`confirm()` nativos.
- `confirmarYEliminar()` + `delegarClicEliminar()` en todos los módulos con
  borrado; reversa transacciones del ledger antes de borrar el registro.
- IDs siempre comparados como `String(...)`.
- Percepción de velocidad: `.btn--carga` en vez de redibujar toda la vista.
- Íconos SVG lineales (`js/iconos.js`), nunca emoji.
- Moneda MXN (`Intl.NumberFormat('es-MX', ...)`) en `js/formato.js`.
- Config clave-valor en tabla `configuracion` (incluye `nombre_usuario` →
  saludo "Hi/Hola" en el Dashboard según idioma).
- Nav actual (orden): Dashboard, Ingresos, Gastos, Tarjetas, Cajas,
  Recurrentes, Investments, Historial, Respaldos, Configuración.

## Pendiente / limitaciones conocidas
- No hay ningún job de "reseteo mensual" automático de `estado` en
  `recurrentes` (ni para gastos fijos normales, ni para las mensualidades de
  TC) — es una limitación preexistente de toda la app, no solo de esta
  función. Si se necesita, hay que agregar una rutina que corra al detectar
  cambio de mes y regrese `estado` a `pendiente`.
- Nada de esto se ha probado corriendo la app real (Tauri) en esta sesión,
  solo `node --check` de sintaxis. Antes de confiar en producción: crear una
  compra a MSI + un gasto normal en la misma tarjeta, marcar mensualidades
  como pagadas varios "meses" seguidos y confirmar que el recurrente de MSI
  desaparece justo al llegar a `msi_meses` y que los saldos cuadran.
- Rediseño de iconografía/paleta "menos genérico de IA" y optimización real
  de build/Tauri: no abordado (requiere sesión dedicada con ejemplos
  visuales / entorno de build).
- El botón "Expenses" que se pidió mejorar en una sesión anterior nunca se
  identificó con claridad (la fila de gastos solo tenía editar/borrar).
