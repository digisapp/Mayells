// Box-level reading of ISO base media files (ISO/IEC 14496-12): the
// container behind MOV/MP4 videos and HEIC/HEIF photos. Shared by the
// location strippers, which patch a file's bytes in place and never change a
// box size, so every offset into the file stays valid.

export interface BoxSpan {
  type: string;
  start: number;
  headerSize: number;
  end: number;
}

/**
 * Read one box header at `at`. With `allowOpenEnded`, a size of 0 is
 * returned as a zero-length span for the caller to resolve (top level only).
 * Returns null when the header doesn't fit or is nonsense.
 */
export function readBox(buf: Uint8Array, at: number, end: number, allowOpenEnded = false): BoxSpan | null {
  if (at + 8 > end) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let size = view.getUint32(at);
  const type = fourcc(buf, at + 4);
  let headerSize = 8;
  if (size === 1) {
    if (at + 16 > end) return null;
    const large = view.getBigUint64(at + 8);
    if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    size = Number(large);
    headerSize = 16;
  } else if (size === 0) {
    return allowOpenEnded ? { type, start: at, headerSize, end: at } : null;
  }
  if (size < headerSize) return null;
  if (!allowOpenEnded && at + size > end) return null;
  return { type, start: at, headerSize, end: at + size };
}

export function fourcc(buf: Uint8Array, at: number): string {
  // Latin-1, so Apple's © (0xA9) round-trips as '©'.
  return String.fromCharCode(buf[at], buf[at + 1], buf[at + 2], buf[at + 3]);
}

export function writeFourcc(buf: Uint8Array, at: number, type: string) {
  for (let i = 0; i < 4; i++) buf[at + i] = type.charCodeAt(i);
}

/**
 * The child boxes of a container; throws on a child that overruns it.
 *
 * QuickTime lets user-data lists end with a 32-bit zero, so by default a tail
 * shorter than a box header, or a zero size, just ends the list. With
 * `strict`, the children must fill the container exactly: a scrubber that
 * stopped early could miss the very box it is looking for.
 */
export function childrenOf(buf: Uint8Array, start: number, end: number, { strict = false } = {}): BoxSpan[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: BoxSpan[] = [];
  let at = start;
  while (at + 8 <= end) {
    if (!strict && view.getUint32(at) === 0) break;
    const box = readBox(buf, at, end);
    if (!box) throw new Error(`malformed child box at ${at}`);
    out.push(box);
    at = box.end;
  }
  if (strict && at !== end) throw new Error(`stray bytes at ${at}`);
  return out;
}

export function latin1(buf: Uint8Array, start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i++) out += String.fromCharCode(buf[i]);
  return out;
}
