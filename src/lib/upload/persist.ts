// Keeps a seller's finished uploads (and their notes) across reloads of the
// upload page. iOS often reloads a tab after the camera has been open, under
// memory pressure, and a seller may close the tab and tap the emailed link
// again later. Without this, everything they had photographed vanished and
// the uploaded files were orphaned in storage.
//
// localStorage rather than sessionStorage: tapping the link in Mail opens a
// new tab, which sessionStorage would not carry over to. Only storage URLs,
// grouping and notes are kept, on the seller's own phone, and only until
// they send (or for a week).

import { MAX_NOTE_CHARS } from './limits';

const KEY_PREFIX = 'mayells-upload:';
const VERSION = 1;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface SavedMedia {
  url: string;
  video: boolean;
}

export interface SavedItem {
  notes: string;
  media: SavedMedia[];
  /** Photos or videos that hadn't finished uploading; they can't be restored. */
  unfinished: number;
}

export interface SavedUploadState {
  v: typeof VERSION;
  savedAt: number;
  items: SavedItem[];
}

interface SnapshotTask {
  id: string;
  status: string;
  resultUrl?: string;
  isVideo: boolean;
}

/**
 * The part of the page's state worth keeping, or null when there is
 * nothing to keep (so the saved copy can be cleared).
 */
export function snapshotUploadState(
  items: readonly { taskIds: readonly string[]; notes: string }[],
  tasks: readonly SnapshotTask[],
  now: number,
): SavedUploadState | null {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const saved: SavedItem[] = items
    .map((item) => {
      const media: SavedMedia[] = [];
      let unfinished = 0;
      for (const id of item.taskIds) {
        const task = byId.get(id);
        if (!task) continue;
        if (task.status === 'complete' && task.resultUrl) media.push({ url: task.resultUrl, video: task.isVideo });
        else unfinished++;
      }
      return { notes: item.notes, media, unfinished };
    })
    .filter((item) => item.media.length > 0 || item.unfinished > 0);
  if (!saved.some((item) => item.media.length > 0)) return null;
  return { v: VERSION, savedAt: now, items: saved };
}

/** Validate what came out of storage; anything odd is treated as nothing saved. */
export function parseUploadState(raw: string | null, now: number): SavedUploadState | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<SavedUploadState>;
    if (data?.v !== VERSION || typeof data.savedAt !== 'number' || !Array.isArray(data.items)) return null;
    if (now - data.savedAt > MAX_AGE_MS || data.savedAt > now + 60_000) return null;
    const items: SavedItem[] = [];
    for (const item of data.items) {
      if (!item || typeof item.notes !== 'string' || !Array.isArray(item.media)) return null;
      const media = item.media.filter(
        (m): m is SavedMedia => !!m && typeof m.url === 'string' && /^https:\/\//.test(m.url) && typeof m.video === 'boolean',
      );
      const unfinished = Number.isInteger(item.unfinished) && item.unfinished > 0 ? item.unfinished : 0;
      items.push({ notes: item.notes.slice(0, MAX_NOTE_CHARS), media, unfinished });
    }
    return items.some((item) => item.media.length > 0) ? { v: VERSION, savedAt: data.savedAt, items } : null;
  } catch {
    return null;
  }
}

/** What to tell the seller after a restore. */
export function restoredCounts(state: SavedUploadState): { photos: number; videos: number; unfinished: number } {
  let photos = 0;
  let videos = 0;
  let unfinished = 0;
  for (const item of state.items) {
    for (const m of item.media) {
      if (m.video) videos++;
      else photos++;
    }
    unfinished += item.unfinished;
  }
  return { photos, videos, unfinished };
}

// Storage can be missing or throw (private mode, blocked site data); losing
// the saved copy only loses a convenience, never the page.
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadUploadState(token: string): SavedUploadState | null {
  try {
    return parseUploadState(storage()?.getItem(KEY_PREFIX + token) ?? null, Date.now());
  } catch {
    return null;
  }
}

/** Save, or clear when `state` is null. */
export function saveUploadState(token: string, state: SavedUploadState | null): void {
  try {
    const store = storage();
    if (!store) return;
    if (state) store.setItem(KEY_PREFIX + token, JSON.stringify(state));
    else store.removeItem(KEY_PREFIX + token);
  } catch {
    // Quota or privacy settings: carry on without a saved copy.
  }
}

export function clearUploadState(token: string): void {
  saveUploadState(token, null);
}
