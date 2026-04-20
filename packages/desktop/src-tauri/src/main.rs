#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use serde::Serialize;
use tauri::Manager;

mod db;

#[derive(Serialize)]
struct Entry {
  id: String,
  content: String,
  created_at: String,
}

#[tauri::command]
fn greet(name: String) -> String {
  format!("Hello, {}! Welcome to Personal Treehole.", name)
}

#[tauri::command]
fn save_entry(content: String) -> Result<String, String> {
  db::save_entry(&content)
}

#[tauri::command]
fn get_entries() -> Result<Vec<Entry>, String> {
  let entries = db::get_entries()?;
  Ok(entries)
}

#[tauri::command]
fn get_unsynced_entries() -> Result<Vec<Entry>, String> {
  let entries = db::get_unsynced_entries()?;
  Ok(entries)
}

#[tauri::command]
fn mark_entry_synced(id: String) -> Result<(), String> {
  db::mark_entry_synced(&id)
}

fn main() {
  if let Err(err) = db::init_db() {
    eprintln!("数据库初始化失败：{}", err);
  }

  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![greet, save_entry, get_entries, get_unsynced_entries, mark_entry_synced])
    .run(tauri::generate_context!())
    .expect("error while running tauri application")
}
