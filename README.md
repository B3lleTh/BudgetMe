<div align="center">

# BudgetMe

### *tu dinero, tus reglas, tu computadora*
### *your money, your rules, your machine*

[![Estado](https://img.shields.io/badge/estado-en%20desarrollo%20activo-orange)](#estado-del-proyecto--project-status)
[![Plataformas](https://img.shields.io/badge/plataformas-Windows%20%7C%20macOS-blue)](#instalación--installation)
[![Licencia](https://img.shields.io/badge/licencia-libre%20%2B%20créditos-lightgrey)](./LICENSE.md)
[![Privacidad](https://img.shields.io/badge/datos-100%25%20locales-brightgreen)](#privacidad--privacy)

</div>

---

```
  ┌───────────────────────────────────────────┐
  │  Sin nube. Sin cuentas. Sin servidores.   │
  │  No cloud. No accounts. No servers.       │
  └───────────────────────────────────────────┘
```

---

## Estado del proyecto / Project status

> **🚧 En desarrollo activo — Active development**
> Esto significa que la app funciona, pero puede tener bugs, cambios entre
> versiones, y funciones que se siguen puliendo. Reporta lo que encuentres
> en la sección [Issues](../../issues).
>
> This means the app works, but may have bugs, breaking changes between
> versions, and features still being polished. Report anything you find in
> the [Issues](../../issues) section.

**Disponible solo para computadora de escritorio / laptop — no hay versión
móvil ni web.**
**Desktop / laptop only — no mobile or web version exists.**

| Plataforma / Platform | Estado / Status |
|---|---|
| macOS (Apple Silicon) | ✅ Disponible / Available |
| macOS (Intel) | ✅ Disponible / Available |
| Windows | ✅ Disponible / Available |
| Linux | ⏳ No probado aún / Not tested yet |

---

## 🇲🇽 Español

### ¿Qué es?

**BudgetMe** es una app de escritorio para llevar el control de tus cuentas,
tarjetas de crédito, gastos, ingresos, pagos recurrentes e inversiones —
todo desde tu computadora, sin necesidad de internet ni de crear una cuenta.

**Tu información nunca sale de tu equipo.** No hay servidores, no hay nube,
no hay tracking. Todo se guarda en un archivo local en tu computadora.

### Qué puedes hacer con ella

| Módulo | Qué hace |
|---|---|
| **Dashboard** | Resumen general de tu situación financiera de un vistazo |
| **Ingresos** | Ingresos fijos y variables (freelance), con proyección mensual/anual |
| **Gastos** | Gastos normales o a meses sin intereses (MSI) con tarjeta |
| **Tarjetas** | Administra tus tarjetas de crédito y su saldo |
| **Cajas de ahorro** | Aparta dinero para metas, incluyendo una caja automática para tu pago de TC |
| **Recurrentes** | Pagos mensuales repetitivos con recordatorio de cuándo pagar |
| **Investments** | Simula y da seguimiento a inversiones con interés compuesto |
| **Historial** | Todos tus movimientos en un solo lugar |
| **Respaldos** | Crea, exporta, importa o restaura copias de tu información — o reinicia todo desde cero |

### Instalación

Descarga la última versión desde la sección
[**Releases**](../../releases):

**macOS**
1. Descarga el `.dmg` correspondiente a tu chip:
   `aarch64` = Apple Silicon (M1/M2/M3/M4) · `x64` = Intel
2. Ábrelo y arrastra la app a tu carpeta de Aplicaciones.
3. La primera vez, macOS dirá que es de un "desarrollador no identificado"
   — clic derecho sobre la app → **Abrir**, para confirmar que confías en
   ella.
4. Corriendo lo Siguiente en Terminal :  xattr -cr /Applications/BudgetMe.app
5. En caso de BUG al Abrir por primera Vez solo reabra la App

**Windows**
1. Descarga el instalador `.msi` o `.exe`.
2. Ejecútalo. Si aparece una advertencia de SmartScreen → **Más
   información** → **Ejecutar de todas formas**.

### Para desarrolladores

Requisitos: [Node.js](https://nodejs.org) · [Rust](https://rustup.rs)

```bash
npm install
npm install -g @tauri-apps/cli
npm run tauri:dev
```

Generar tu propio instalador local:

```bash
npm run tauri build
```

### Privacidad

- Toda tu información vive en un archivo SQLite en tu computadora.
- La app no se conecta a internet ni envía datos a ningún lado.
- Los respaldos son archivos que tú controlas — cópialos donde quieras
  (USB, tu nube personal, etc.) para tener una copia adicional.

### Licencia

Uso y modificación libres, con créditos obligatorios al autor original.
El uso comercial (monetizar la app o un derivado) requiere acuerdo previo
con el autor. Detalles completos en [`LICENSE.md`](./LICENSE.md).

---

## 🇺🇸 English

### What is it?

**BudgetMe** is a desktop app to track your accounts, credit cards, expenses,
income, recurring payments, and investments — all from your computer, no
internet connection or account creation required.

**Your data never leaves your device.** No servers, no cloud, no tracking.
Everything is stored in a local file on your computer.

### What you can do with it

| Module | What it does |
|---|---|
| **Dashboard** | Overview of your financial situation at a glance |
| **Income** | Fixed and variable (freelance) income, with monthly/yearly projections |
| **Expenses** | Regular expenses or installment purchases (interest-free months) |
| **Cards** | Manage your credit cards and balances |
| **Savings boxes** | Set money aside for goals, including an automatic box for your card payment |
| **Recurring** | Monthly repeating payments with reminders of when to pay |
| **Investments** | Simulate and track investments with compound interest |
| **History** | Every transaction, in one place |
| **Backups** | Create, export, import, or restore backups — or reset everything from scratch |

### Installation

Download the latest version from the [**Releases**](../../releases)
section:

**macOS**
1. Download the `.dmg` matching your chip:
   `aarch64` = Apple Silicon (M1/M2/M3/M4) · `x64` = Intel
2. Open it and drag the app into your Applications folder.
3. The first time, macOS will say it's from an "unidentified developer" —
   right-click the app → **Open**, to confirm you trust it.
4. Running This on Terminal :  xattr -cr /Applications/BudgetMe.app
5. In Case of Bug at a First Time Usign it, just re-open

**Windows**
1. Download the `.msi` or `.exe` installer.
2. Run it. If SmartScreen warns you → **More info** → **Run anyway**.

### For developers

Requirements: [Node.js](https://nodejs.org) · [Rust](https://rustup.rs)

```bash
npm install
npm install -g @tauri-apps/cli
npm run tauri:dev
```

Build your own local installer:

```bash
npm run tauri build
```

### Privacy

- All your data lives in a SQLite file on your computer.
- The app doesn't connect to the internet or send data anywhere.
- Backups are files you control — copy them anywhere (USB, personal
  cloud, etc.) for an extra copy.

---

## Actualizar a una nueva versión / Updating to a new version

### 🇲🇽 Español

BudgetMe **no se actualiza solo** — no hay auto-updater conectado a
internet (coherente con que la app es 100% local, sin conexión a
servidores). Para actualizar tienes que descargar la nueva versión
manualmente:

1. Ve a la sección [**Releases**](../../releases) y descarga el instalador
   más reciente para tu sistema (`.dmg` para macOS, `.msi`/`.exe` para
   Windows).
2. **Antes de instalar, haz un respaldo**: abre la app actual → pestaña
   **Respaldos** → **Crear respaldo**. Esto es opcional pero muy
   recomendado, sobre todo si la versión trae cambios en la base de datos.
3. Instala la nueva versión normalmente (mismo proceso que la primera vez,
   ver [Instalación](#instalación)). En macOS/Windows la instalación nueva
   reemplaza la anterior — no necesitas desinstalar nada manualmente.
4. Abre la app. **Tu información NO se borra**: la base de datos vive en el
   directorio de datos de tu sistema, separado del programa. Si la nueva
   versión agrega columnas o tablas nuevas, la app las crea/migra
   automáticamente la primera vez que abres — no se pierde ningún dato
   existente.
5. Si algo se ve raro después de actualizar, usa tu respaldo del paso 2:
   pestaña **Respaldos** → **Restaurar respaldo**.

> 💡 Revisa las notas de cada [Release](../../releases) antes de
> actualizar — ahí se describe qué cambió y si hay algún paso extra
> necesario para esa versión en particular.

### 🇺🇸 English

BudgetMe **does not auto-update** — there's no internet-connected updater
(consistent with the app being 100% local, no server connection). To
update you need to download the new version manually:

1. Go to the [**Releases**](../../releases) section and download the
   latest installer for your system (`.dmg` for macOS, `.msi`/`.exe` for
   Windows).
2. **Before installing, make a backup**: open the current app → **Backups**
   tab → **Create backup**. This is optional but strongly recommended,
   especially if the new version includes database changes.
3. Install the new version normally (same process as the first time, see
   [Installation](#installation)). On macOS/Windows the new install
   replaces the previous one — you don't need to manually uninstall
   anything.
4. Open the app. **Your data is NOT erased**: the database lives in your
   system's app data directory, separate from the program itself. If the
   new version adds new columns or tables, the app creates/migrates them
   automatically the first time you open it — no existing data is lost.
5. If something looks off after updating, use your backup from step 2:
   **Backups** tab → **Restore backup**.

> 💡 Check each [Release](../../releases)'s notes before updating — they
> describe what changed and whether that particular version needs any
> extra step.

---

### License

Free to use and modify, with mandatory credit to the original author.
Commercial use (monetizing the app or a derivative) requires prior
agreement with the author. Full details in [`LICENSE.md`](./LICENSE.md).

---

<div align="center">

*Hecho para llevar mis propias cuentas, compartido por si a ti también te sirve.*
*Built to manage my own finances, shared in case it's useful to you too.*

</div>

# Licencia de **BudgetMe** / **BudgetMe** License

**Copyright (c) 2026 B3lleTh**

---

## 🇲🇽 Español

Por la presente se otorga permiso, de forma gratuita, a cualquier persona
que obtenga una copia de este software y sus archivos de documentación
asociados (el "Software"), para usar, copiar, modificar, fusionar,
publicar y distribuir copias del Software, sujeto a las siguientes
condiciones:

1. **Uso libre y gratuito.** Cualquier persona puede usar, modificar y
   distribuir este Software para uso personal, educativo o dentro de
   organizaciones, sin costo alguno.

2. **Créditos obligatorios.** Toda copia, fork, o versión modificada del
   Software —publicada o distribuida a terceros— debe incluir de forma
   visible el crédito al autor original: **B3lleTh**, junto con un enlace
   al repositorio original cuando sea razonablemente posible.

3. **Uso comercial con compensación.** Si tú, o una empresa, planean
   **monetizar** este Software o un trabajo derivado de él —ya sea
   vendiéndolo, cobrando una suscripción, integrándolo en un producto de
   paga, o generando ingresos directos a partir de él— se requiere
   **contactar previamente al autor original** para acordar los términos,
   los cuales pueden incluir una comisión o compensación sobre los
   ingresos generados. El uso comercial sin este acuerdo previo no está
   autorizado por esta licencia.

4. **Sin garantía.** Este Software se entrega "tal cual", sin garantía de
   ningún tipo, expresa o implícita. El autor no se hace responsable de
   ningún daño derivado del uso del Software, incluyendo pero no limitado
   a pérdida de datos financieros.

5. **Aviso de desarrollo activo.** Este proyecto se encuentra actualmente
   en desarrollo activo. Puede contener errores, funciones incompletas o
   cambios significativos entre versiones.

Para acuerdos de uso comercial, contacta al autor a través del repositorio
en GitHub: [github.com/B3lleTh](https://github.com/B3lleTh)

---

## 🇺🇸 English

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the "Software"),
to use, copy, modify, merge, publish, and distribute copies of the
Software, subject to the following conditions:

1. **Free and open use.** Anyone may use, modify, and distribute this
   Software for personal, educational, or organizational use, at no cost.

2. **Attribution required.** Any copy, fork, or modified version of the
   Software — published or distributed to third parties — must include
   visible credit to the original author: **B3lleTh**, along with a link
   to the original repository whenever reasonably possible.

3. **Commercial use with compensation.** If you, or a company, intend to
   **monetize** this Software or a derivative work — whether by selling
   it, charging a subscription, bundling it into a paid product, or
   otherwise generating direct revenue from it — you must **contact the
   original author beforehand** to agree on terms, which may include a
   commission or compensation based on revenue generated. Commercial use
   without this prior agreement is not authorized under this license.

4. **No warranty.** This Software is provided "as is", without warranty of
   any kind, express or implied. The author is not liable for any damages
   arising from the use of the Software, including but not limited to loss
   of financial data.

5. **Active development notice.** This project is currently under active
   development. It may contain bugs, incomplete features, or breaking
   changes between versions.

For commercial licensing agreements, contact the author via the GitHub
repository: [github.com/B3lleTh](https://github.com/B3lleTh)
