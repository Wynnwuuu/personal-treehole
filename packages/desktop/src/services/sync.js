import { getUnsyncedEntries, markEntrySynced } from './api';
import { SYNC_API_URL } from '../config';
export async function syncLocalEntries(token) {
    if (!token?.trim()) {
        throw new Error('需要设置同步令牌才能上传。');
    }
    const entries = await getUnsyncedEntries();
    if (entries.length === 0) {
        return { synced: 0 };
    }
    const response = await fetch(`${SYNC_API_URL}/api/entries/sync`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ entries })
    });
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`同步失败：${response.status} ${body}`);
    }
    for (const entry of entries) {
        await markEntrySynced(entry.id);
    }
    return { synced: entries.length };
}
