// What a repeated send adds, decided without the database so it can be
// unit-tested. A phone that locks (or loses signal) after the server has
// saved a send reports "Load failed"; the seller is told to try again, and
// the retry carries the same photos. Every route that records a send uses
// these to make that retry harmless: the upload link, the website lead
// forms and the chat concierge.

// ── Upload link (/upload/[token]) ────────────────────────────────────────

export interface SubmittedItem {
  images: string[];
  sellerTitle?: string | null;
  sellerNotes?: string | null;
}

export interface StoredItem {
  id: string;
  images: string[] | null;
  sellerNotes: string | null;
}

export interface UploadItemsPlan {
  /** Items none of whose photos are stored yet. */
  insert: SubmittedItem[];
  /** Stored items this send adds photos or newer notes to: `images` is the full new list, `added` the new part of it. */
  update: { id: string; images: string[]; added: string[]; sellerNotes?: string }[];
  /** Submitted items already stored in full. */
  alreadyStored: number;
}

/**
 * Split a send into what is new and what the link already has. Every
 * uploaded file has its own storage path, so a photo whose path is already
 * on one of the link's items was sent before. An item with some photos
 * stored and some new (the seller added one after a failed send) gets the
 * new ones added to the stored item rather than becoming a second item.
 * `pathOf` maps a photo URL to its storage path; URLs it can't read are
 * compared as they are.
 */
export function planUploadItems(
  submitted: readonly SubmittedItem[],
  stored: readonly StoredItem[],
  pathOf: (url: string) => string | null,
): UploadItemsPlan {
  const key = (url: string) => pathOf(url) ?? url;
  const owner = new Map<string, string>();
  for (const item of stored) {
    for (const url of item.images ?? []) owner.set(key(url), item.id);
  }

  const plan: UploadItemsPlan = { insert: [], update: [], alreadyStored: 0 };
  const seen = new Set<string>();
  for (const item of submitted) {
    const fresh: string[] = [];
    let storedId: string | undefined;
    for (const url of item.images) {
      const k = key(url);
      const id = owner.get(k);
      if (id) storedId ??= id;
      else if (!seen.has(k)) fresh.push(url);
      seen.add(k);
    }
    if (!storedId) {
      if (fresh.length > 0) plan.insert.push({ ...item, images: fresh });
      continue;
    }
    const current = stored.find((s) => s.id === storedId)!;
    const notes = item.sellerNotes?.trim();
    const newerNotes = notes && notes !== (current.sellerNotes ?? '').trim() ? notes : undefined;
    if (fresh.length === 0 && !newerNotes) {
      plan.alreadyStored++;
      continue;
    }
    plan.update.push({
      id: storedId,
      images: [...(current.images ?? []), ...fresh],
      added: fresh,
      ...(newerNotes ? { sellerNotes: newerNotes } : {}),
    });
  }
  return plan;
}

// ── Website lead forms (/api/appraisal-requests) ─────────────────────────

/** A resend inside this window is the same request, not a new lead. */
export const RESUBMIT_WINDOW_MINUTES = 15;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The form's per-fill id, or null if absent or malformed. */
export function parseSubmissionId(raw: unknown): string | null {
  return typeof raw === 'string' && UUID_RE.test(raw) ? raw.toLowerCase() : null;
}

/**
 * The line in a prospect's source notes that records which form fill made
 * it, so a resend of that fill can find it. No migration needed, and the
 * admin can quote it when a seller asks about their request.
 */
export function submissionMarker(submissionId: string): string {
  return `Form ref: ${submissionId}`;
}

/**
 * What resends of one request have in common, for the advisory lock that
 * keeps two of them from both creating a prospect: the form's id or, from a
 * page open since before forms sent one, its first photo.
 */
export function resubmissionKey(submissionId: string | null, photoUrls: readonly string[]): string | null {
  if (submissionId) return `form:${submissionId}`;
  const first = [...photoUrls].sort()[0];
  return first ? `photo:${first}` : null;
}

export interface LeadForm {
  name: string;
  phone: string;
  email?: string;
  items?: string;
}

export interface OriginalLead {
  fullName: string;
  phone: string | null;
  email: string | null;
  itemSummary: string | null;
  /** Every photo URL already on the prospect's items. */
  attachedUrls: readonly string[];
}

export interface ResubmissionPlan {
  /** Photos this send has that the prospect doesn't yet. */
  addPhotos: string[];
  /** For the prospect's notes, when the resend differs; null when it's a plain repeat. */
  note: string | null;
}

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const trimmed = (s: string | null | undefined) => (s ?? '').trim();

/**
 * A resend of a request that was already saved. Nothing new is created: any
 * photos that made it this time are added, and details the seller changed
 * go in the notes for the specialist, so nothing they sent is lost.
 */
export function planResubmission(
  original: OriginalLead,
  form: LeadForm,
  photoUrls: readonly string[],
  at: Date,
): ResubmissionPlan {
  const attached = new Set(original.attachedUrls);
  const addPhotos = [...new Set(photoUrls)].filter((url) => !attached.has(url));

  const changes = [
    trimmed(form.name) !== trimmed(original.fullName) ? `Name: ${form.name}` : null,
    digits(form.phone) !== digits(original.phone) ? `Phone: ${form.phone}` : null,
    form.email && lower(form.email) !== lower(original.email) ? `Email: ${form.email}` : null,
    trimmed(form.items) && trimmed(form.items) !== trimmed(original.itemSummary) ? `Items: ${form.items}` : null,
  ].filter((c): c is string => c !== null);

  if (addPhotos.length === 0 && changes.length === 0) return { addPhotos, note: null };
  const photos = addPhotos.length > 0 ? ` with ${addPhotos.length} more photo${addPhotos.length === 1 ? '' : 's'}` : '';
  const head = `[${at.toISOString()}] Sent again from the website form${photos}`;
  return { addPhotos, note: changes.length > 0 ? `${head}. Changed:\n${changes.join('\n')}` : `${head}.` };
}

// ── Chat photos (attachChatPhotos) ───────────────────────────────────────

/**
 * Where a chat photo is stored: its content hash is in the name, so the next
 * requestAppraisal call can tell which photos a prospect already has without
 * downloading anything. The nonce keeps each prospect's copy its own object.
 */
export function chatPhotoPath(hash: string, nonce: string, ext: string): string {
  return `submissions/chat-${hash.slice(0, 32)}-${nonce}.${ext}`;
}

const CHAT_HASH_RE = /\/submissions\/chat-([0-9a-f]{32})-/;

/** The content hash in a stored chat photo's URL, or null for any other photo. */
export function chatPhotoHash(url: string): string | null {
  return CHAT_HASH_RE.exec(url)?.[1] ?? null;
}

/**
 * The photos to store, in order: those whose hash isn't already on the
 * prospect, once each.
 */
export function unattachedChatPhotos<T extends { hash: string }>(photos: readonly T[], attachedUrls: readonly string[]): T[] {
  const have = new Set(attachedUrls.map(chatPhotoHash).filter((h): h is string => h !== null));
  return photos.filter((p) => {
    const h = p.hash.slice(0, 32);
    if (have.has(h)) return false;
    have.add(h);
    return true;
  });
}
