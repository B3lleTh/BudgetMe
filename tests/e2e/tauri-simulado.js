// Sustituto de Tauri para pruebas en navegador: SQLite en WASM (sql.js),
// persistido en localStorage para sobrevivir recargas.
(function () {
  const listo = (async () => {
    const SQL = await initSqlJs({ locateFile: f => '/__mock/' + f });
    const guardado = localStorage.getItem('__db');
    const bytes = guardado ? Uint8Array.from(atob(guardado), c => c.charCodeAt(0)) : null;
    return { SQL, db: bytes ? new SQL.Database(bytes) : new SQL.Database() };
  })();
  function persistir(db) {
    const b = db.export(); let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    localStorage.setItem('__db', btoa(s));
  }
  function params(values) { const o = {}; (values || []).forEach((v, i) => { o['$' + (i + 1)] = v; }); return o; }
  window.__log = [];
  window.__TAURI_INTERNALS__ = {
    transformCallback: () => 0, unregisterCallback() {}, convertFileSrc: (p) => p,
    async invoke(cmd, args) {
      const st = await listo; const db = st.db;
      window.__log.push(cmd);
      if (cmd === 'plugin:sql|load') return args.db;
      if (cmd === 'plugin:sql|close') return true;
      if (cmd === 'plugin:sql|execute') {
        try { db.run(args.query, params(args.values)); }
        catch (e) { throw String(e.message || e); }
        const rows = db.getRowsModified();
        const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
        if (/^\s*BEGIN/i.test(args.query)) window.__enTx = true;
        if (/^\s*(COMMIT|ROLLBACK)/i.test(args.query)) window.__enTx = false;
        if (!window.__enTx && !/^\s*PRAGMA/i.test(args.query)) persistir(db);
        return [rows, id];
      }
      if (cmd === 'plugin:sql|select') {
        let stmt;
        try { stmt = db.prepare(args.query); stmt.bind(params(args.values)); }
        catch (e) { throw String(e.message || e); }
        const out = []; while (stmt.step()) out.push(stmt.getAsObject()); stmt.free();
        return out;
      }
      if (cmd === 'listar_respaldos') return [];
      if (cmd === 'crear_respaldo') return { nombre: 'x.db', ruta: '/x.db', fecha: '', tamano_bytes: 0 };
      return null;
    },
  };
  window.addEventListener('error', e => (window.__errores ||= []).push(String(e.message)));
  window.addEventListener('unhandledrejection', e => (window.__errores ||= []).push(String(e.reason)));
})();
