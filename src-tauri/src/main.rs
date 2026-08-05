// Backend Rust — únicamente maneja respaldos del archivo SQLite.
// Toda la lógica de negocio vive en JavaScript (frontend).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Serialize)]
struct Respaldo {
    nombre: String,
    ruta: String,
    fecha: String,
    tamano_bytes: u64,
}

fn app_data_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().expect("no se pudo resolver app_data_dir")
}

fn db_path(app: &tauri::AppHandle) -> PathBuf {
    app_data_dir(app).join("finanzas.db")
}

fn respaldos_dir(app: &tauri::AppHandle) -> PathBuf {
    app_data_dir(app).join("respaldos")
}

#[tauri::command]
fn crear_respaldo(app: tauri::AppHandle) -> Result<Respaldo, String> {
    let origen = db_path(&app);
    if !origen.exists() {
        return Err("La base de datos aún no existe".into());
    }
    let dir = respaldos_dir(&app);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let fecha = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let nombre = format!("finanzas_{}.db", fecha);
    let destino = dir.join(&nombre);

    fs::copy(&origen, &destino).map_err(|e| e.to_string())?;
    let meta = fs::metadata(&destino).map_err(|e| e.to_string())?;

    Ok(Respaldo {
        nombre,
        ruta: destino.to_string_lossy().to_string(),
        fecha,
        tamano_bytes: meta.len(),
    })
}

#[tauri::command]
fn listar_respaldos(app: tauri::AppHandle) -> Result<Vec<Respaldo>, String> {
    let dir = respaldos_dir(&app);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = vec![];
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("db") {
            let meta = entry.metadata().map_err(|e| e.to_string())?;
            let modificado: chrono::DateTime<chrono::Local> = meta
                .modified()
                .map(|t| t.into())
                .unwrap_or_else(|_| chrono::Local::now());
            out.push(Respaldo {
                nombre: path.file_name().unwrap().to_string_lossy().to_string(),
                ruta: path.to_string_lossy().to_string(),
                fecha: modificado.format("%Y-%m-%d %H:%M:%S").to_string(),
                tamano_bytes: meta.len(),
            });
        }
    }
    out.sort_by(|a, b| b.fecha.cmp(&a.fecha));
    Ok(out)
}

#[tauri::command]
fn restaurar_respaldo(app: tauri::AppHandle, ruta: String) -> Result<(), String> {
    let origen = PathBuf::from(&ruta);
    if !origen.exists() {
        return Err("El respaldo seleccionado no existe".into());
    }
    let destino = db_path(&app);
    // Respaldo de seguridad del estado actual antes de restaurar, por si acaso.
    if destino.exists() {
        let _ = crear_respaldo(app.clone());
    }
    fs::copy(&origen, &destino).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn exportar_respaldo(app: tauri::AppHandle, ruta_destino: String) -> Result<(), String> {
    let origen = db_path(&app);
    fs::copy(&origen, &ruta_destino).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn importar_respaldo(app: tauri::AppHandle, ruta_origen: String) -> Result<(), String> {
    restaurar_respaldo(app, ruta_origen)
}

#[tauri::command]
fn eliminar_respaldo(ruta: String) -> Result<(), String> {
    let path = PathBuf::from(&ruta);
    if !path.exists() {
        return Err("El respaldo no existe".into());
    }
    fs::remove_file(&path).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            crear_respaldo,
            listar_respaldos,
            restaurar_respaldo,
            exportar_respaldo,
            importar_respaldo,
            eliminar_respaldo,
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar la aplicación Finanzas");
}