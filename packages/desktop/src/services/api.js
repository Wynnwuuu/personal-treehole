import { invoke } from '@tauri-apps/api/core';
export async function greet(name) {
    return invoke('greet', { name });
}
export async function saveEntry(content) {
    await invoke('save_entry', { content });
}
export async function getEntries() {
    return invoke('get_entries');
}
export async function getUnsyncedEntries() {
    return invoke('get_unsynced_entries');
}
export async function markEntrySynced(id) {
    await invoke('mark_entry_synced', { id });
}
