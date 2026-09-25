import type { UIMessage } from 'ai';

/**
 * Request shaping for the concierge chat. Kept free of React so the payload
 * rules can be unit-tested.
 *
 * The AI SDK re-posts the whole conversation on every turn, and inlines photos
 * as base64 data URLs. Vercel rejects request bodies over ~4.5MB, so without
 * this a couple of photos (or one uncompressed iPhone photo) made every later
 * message in the conversation fail.
 */

/** Long edge a chat photo is resized to; vision models gain nothing beyond this. */
export const CHAT_PHOTO_MAX_DIM = 1280;
export const CHAT_PHOTO_QUALITY = 0.8;
/** Ceiling for one photo after compression (~1.6MB once base64-encoded). */
export const MAX_CHAT_PHOTO_BYTES = 1.2 * 1024 * 1024;
/** Types the server can attach to a lead and the model can read. */
export const CHAT_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** How many trailing messages the server keeps (route.ts slices to this). */
const SERVER_HISTORY = 20;
/** Earlier photos carried for lead attachment; the server attaches at most five in all. */
const MAX_EARLIER_PHOTOS = 4;
/** Base64 characters allowed for earlier photos, so the body stays well under 4.5MB. */
const EARLIER_PHOTOS_BUDGET = 2_000_000;

export const EARLIER_PHOTO_PLACEHOLDER = '[The visitor shared a photo here; it was shown to you earlier.]';

type Part = UIMessage['parts'][number];

function isImageDataUrlPart(part: Part): part is Extract<Part, { type: 'file' }> {
  return part.type === 'file' && part.url.startsWith('data:image/');
}

/** A requestAppraisal result saying the chat's photos are on file with the request. */
function isPhotosOnFileResult(part: Part): boolean {
  const tool = part as { type: string; state?: string; output?: { ok?: unknown; photosAttached?: unknown } };
  return (
    tool.type === 'tool-requestAppraisal' &&
    tool.state === 'output-available' &&
    tool.output?.ok === true &&
    typeof tool.output.photosAttached === 'number' &&
    tool.output.photosAttached > 0
  );
}

/**
 * Keep only the newest photo inline for the model and swap every earlier one
 * for a short placeholder, so each request carries at most one image for the
 * model to look at. The earlier photos travel separately (newest first until
 * the budget runs out) purely so that an appraisal request taken later in the
 * chat can still attach everything the visitor sent. Photos shared before a
 * request that reported them on file don't travel again: they'd only make
 * every later message slower to send (the server skips photos a prospect
 * already has either way).
 */
export function slimChatRequest<M extends UIMessage>(messages: M[]): { messages: M[]; earlierPhotos: string[] } {
  let onFileBefore = -1;
  for (let i = messages.length - 1; i >= 0 && onFileBefore < 0; i--) {
    if (messages[i].parts.some(isPhotosOnFileResult)) onFileBefore = i;
  }

  let newestMessage = -1;
  let newestPart = -1;
  const firstServerMessage = Math.max(0, messages.length - SERVER_HISTORY);
  for (let i = messages.length - 1; i >= firstServerMessage && newestMessage < 0; i--) {
    const parts = messages[i].parts;
    for (let j = parts.length - 1; j >= 0; j--) {
      if (isImageDataUrlPart(parts[j])) {
        newestMessage = i;
        newestPart = j;
        break;
      }
    }
  }

  const earlier: string[] = [];
  const slimmed = messages.map((m, i) => {
    if (!m.parts.some((p) => p.type === 'file')) return m;
    const parts = m.parts.map((p, j): Part => {
      if (p.type !== 'file' || (i === newestMessage && j === newestPart)) return p;
      if (isImageDataUrlPart(p) && i > onFileBefore) earlier.push(p.url);
      return { type: 'text', text: EARLIER_PHOTO_PLACEHOLDER };
    });
    return { ...m, parts };
  });

  const earlierPhotos: string[] = [];
  let budget = EARLIER_PHOTOS_BUDGET;
  for (let k = earlier.length - 1; k >= 0 && earlierPhotos.length < MAX_EARLIER_PHOTOS; k--) {
    if (earlier[k].length > budget) break;
    budget -= earlier[k].length;
    earlierPhotos.unshift(earlier[k]);
  }

  return { messages: slimmed, earlierPhotos };
}

/** A non-2xx reply from /api/ai/chat, keeping the status the SDK would discard. */
export class ChatHttpError extends Error {
  readonly status: number;
  constructor(status: number, body: string) {
    super(body || `Chat request failed (${status})`);
    this.name = 'ChatHttpError';
    this.status = status;
  }
}

/** fetch for the chat transport: same request, but failures keep their HTTP status. */
export const chatFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (!res.ok) throw new ChatHttpError(res.status, await res.text().catch(() => ''));
  return res;
};

export type ChatErrorKind = 'rate-limited' | 'too-large' | 'offline' | 'failed';

export function chatErrorKind(error: Error | undefined, online = true): ChatErrorKind {
  if (error instanceof ChatHttpError) {
    if (error.status === 429) return 'rate-limited';
    if (error.status === 413) return 'too-large';
    return 'failed';
  }
  // Safari reports a dropped connection (e.g. the phone locked mid-reply) as
  // "Load failed", Chrome as "Failed to fetch".
  if (!online || (error instanceof TypeError && /load failed|fetch|network/i.test(error.message))) {
    return 'offline';
  }
  return 'failed';
}
