use chrono::Utc;
use directories::ProjectDirs;
use rusqlite::{params, Connection};
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug)]
pub struct Entry {
  pub id: String,
  pub content: String,
  pub created_at: String,
}

fn get_db_path() -> Result<PathBuf, String> {
  let project_dir = ProjectDirs::from("com", "personal", "treehole")
    .ok_or_else(|| "无法获取应用数据目录".to_string())?
  let dir = project_dir.data_dir();
  std::fs::create_dir_all(dir).map_err(|err| format!("创建数据目录失败：{}", err))?;

  Ok(dir.join("treehole.db"))
}

pub fn init_db() -> Result<(), String> {
  let path = get_db_path()?;
  let conn = Connection::open(path).map_err(|err| format!("打开数据库失败：{}", err))?
  conn.execute(
    "CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced INTEGER DEFAULT 0
    )",
    [],
  )
  .map_err(|err| format!("创建表失败：{}", err))?;
  Ok(())
}

pub fn save_entry(content: &str) -> Result<String, String> {
  let path = get_db_path()?;
  let conn = Connection::open(path).map_err(|err| format!("打开数据库失败：{}", err))?
  let id = Uuid::new_v4().to_string();
  let created_at = Utc::now().to_rfc3339();

  conn.execute(
    "INSERT INTO entries (id, content, created_at, synced) VALUES (?1, ?2, ?3, 0)",
    params![id, content, created_at],
  )
  .map_err(|err| format!("保存条目失败：{}", err))?;

  Ok(id)
}

pub fn get_entries() -> Result<Vec<Entry>, String> {
  let path = get_db_path()?;
  let conn = Connection::open(path).map_err(|err| format!("打开数据库失败：{}", err))?
  let mut stmt = conn
    .prepare("SELECT id, content, created_at FROM entries ORDER BY created_at DESC")
    .map_err(|err| format!("准备查询失败：{}", err))?;

  let rows = stmt
    .query_map([], |row| {
      Ok(Entry {
        id: row.get(0)?,
        content: row.get(1)?,
        created_at: row.get(2)?,
      })
    })
    .map_err(|err| format!("查询失败：{}", err))?;

  let mut entries = Vec::new();
  for entry in rows {
    entries.push(entry.map_err(|err| format!("读取行失败：{}", err))?);
  }

  Ok(entries)
}

pub fn get_unsynced_entries() -> Result<Vec<Entry>, String> {
  let path = get_db_path()?;
  let conn = Connection::open(path).map_err(|err| format!("打开数据库失败：{}", err))?
  let mut stmt = conn
    .prepare("SELECT id, content, created_at FROM entries WHERE synced = 0 ORDER BY created_at DESC")
    .map_err(|err| format!("准备查询失败：{}", err))?;

  let rows = stmt
    .query_map([], |row| {
      Ok(Entry {
        id: row.get(0)?,
        content: row.get(1)?,
        created_at: row.get(2)?,
      })
    })
    .map_err(|err| format!("查询失败：{}", err))?;

  let mut entries = Vec::new();
  for entry in rows {
    entries.push(entry.map_err(|err| format!("读取行失败：{}", err))?);
  }

  Ok(entries)
}

pub fn mark_entry_synced(id: &str) -> Result<(), String> {
  let path = get_db_path()?;
  let conn = Connection::open(path).map_err(|err| format!("打开数据库失败：{}", err))?
  conn.execute(
    "UPDATE entries SET synced = 1 WHERE id = ?1",
    params![id],
  )
  .map_err(|err| format!("更新同步状态失败：{}", err))?;
  Ok(())
}
