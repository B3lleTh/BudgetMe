# Finanzas 💰

> Aplicación de finanzas personales, 100% local y privada.
> Personal finance app, 100% local and private.

---

## 🇲🇽 Español

### ¿Qué es?

Finanzas es una app de escritorio para llevar el control de tus cuentas,
tarjetas de crédito, gastos, ingresos, pagos recurrentes e inversiones —
todo desde tu computadora, sin necesidad de internet ni de crear una cuenta.

**Tu información nunca sale de tu equipo.** No hay servidores, no hay nube,
no hay tracking. Todo se guarda en un archivo local en tu computadora.

### Funciones principales

- **Dashboard** — resumen general de tu situación financiera.
- **Ingresos** — registra ingresos fijos, variables (freelance) y su
  proyección mensual/anual.
- **Gastos** — registra gastos normales o a meses sin intereses (MSI) con
  tarjeta de crédito.
- **Tarjetas** — administra tus tarjetas de crédito y su saldo.
- **Cajas de ahorro** — aparta dinero para metas específicas, incluyendo una
  caja automática para reservar el pago de tu tarjeta de crédito.
- **Recurrentes** — pagos que se repiten cada mes (rentas, suscripciones,
  mensualidades de tarjeta, etc.), con recordatorio de cuándo pagar.
- **Investments** — simula y da seguimiento a inversiones con interés
  compuesto.
- **Historial** — todos tus movimientos, en un solo lugar.
- **Respaldos** — crea copias de seguridad de tu información, expórtalas,
  impórtalas o restaura una anterior. También puedes reiniciar toda la app
  a cero si quieres empezar de nuevo (se crea un respaldo automático antes
  de hacerlo, por seguridad).

### Instalación

Descarga la última versión desde la sección
[**Releases**](../../releases) de este repositorio:

- **Mac**: descarga el archivo `.dmg`, ábrelo y arrastra la app a la carpeta
  Aplicaciones. La primera vez que la abras, macOS puede advertir que es de
  un "desarrollador no identificado" — da clic derecho sobre la app → Abrir,
  para confirmar que confías en ella.
- **Windows**: descarga el instalador `.msi` o `.exe` y ejecútalo. Windows
  puede mostrar una advertencia de SmartScreen — clic en "Más información" →
  "Ejecutar de todas formas".

### Para desarrolladores

Requisitos: [Node.js](https://nodejs.org), [Rust](https://rustup.rs).

```bash
npm install
npm install -g @tauri-apps/cli
npm run tauri:dev
```

Para generar tu propio instalador local:

```bash
npm run tauri build
```

### Privacidad

- Toda tu información vive en un archivo SQLite en tu computadora.
- La app no se conecta a internet ni envía datos a ningún lado.
- Los respaldos son archivos que tú controlas — puedes copiarlos a donde
  quieras (USB, tu nube personal, etc.) para tener una copia adicional.

---

## 🇺🇸 English

### What is it?

Finanzas is a desktop app to track your accounts, credit cards, expenses,
income, recurring payments, and investments — all from your computer, no
internet connection or account creation required.

**Your data never leaves your device.** No servers, no cloud, no tracking.
Everything is stored in a local file on your computer.

### Main features

- **Dashboard** — overview of your financial situation.
- **Income** — track fixed and variable (freelance) income, with
  monthly/yearly projections.
- **Expenses** — track regular expenses or installment purchases (interest-
  free months) on credit cards.
- **Cards** — manage your credit cards and balances.
- **Savings boxes** — set aside money for specific goals, including an
  automatic box to reserve money for your credit card payment.
- **Recurring** — monthly repeating payments (rent, subscriptions, credit
  card installments, etc.), with reminders of when to pay.
- **Investments** — simulate and track investments with compound interest.
- **History** — every transaction, in one place.
- **Backups** — create backups of your data, export them, import them, or
  restore a previous one. You can also reset the entire app to a blank
  state if you want to start fresh (a safety backup is created
  automatically beforehand).

### Installation

Download the latest version from the
[**Releases**](../../releases) section of this repository:

- **Mac**: download the `.dmg` file, open it, and drag the app to your
  Applications folder. The first time you open it, macOS may warn that
  it's from an "unidentified developer" — right-click the app → Open, to
  confirm you trust it.
- **Windows**: download the `.msi` or `.exe` installer and run it. Windows
  may show a SmartScreen warning — click "More info" → "Run anyway".

### For developers

Requirements: [Node.js](https://nodejs.org), [Rust](https://rustup.rs).

```bash
npm install
npm install -g @tauri-apps/cli
npm run tauri:dev
```

To generate your own local installer:

```bash
npm run tauri build
```

### Privacy

- All your data lives in a SQLite file on your computer.
- The app doesn't connect to the internet or send data anywhere.
- Backups are files you control — copy them anywhere you'd like (USB,
  personal cloud, etc.) for an extra copy.

---

## Licencia / License

_(agrega aquí tu licencia, por ejemplo MIT, o "Todos los derechos
reservados" si prefieres no permitir reutilización)_
