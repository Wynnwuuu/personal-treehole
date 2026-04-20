import { invoke } from '@tauri-apps/api/core'

export interface EntryPayload {
  id: string
  content: string
  created_at: string
}

export async function greet(name: string): Promise<string> {
  return invoke('greet', { name })
}

export async function saveEntry(content: string): Promise<void> {
  await invoke('save_entry', { content })
}

export async function getEntries(): Promise<EntryPayload[]> {
  return invoke('get_entries')
}

export async function getUnsyncedEntries(): Promise<EntryPayload[]> {
  return invoke('get_unsynced_entries')
}

export async function markEntrySynced(id: string): Promise<void> {
  await invoke('mark_entry_synced', { id })
}
