/**
 * Map over `items` with at most `limit` calls in flight, keeping results in
 * input order. Photo prep uses 2: decoding a dozen 12–48MP photos at once
 * exhausts iOS Safari's memory, which reloads the tab and loses the form.
 *
 * `onSettled(done, total)` fires as each item finishes. If `fn` rejects, no
 * further items are started and the returned promise rejects with that error.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onSettled?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  let failed = false;

  async function worker() {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        failed = true;
        throw err;
      }
      done++;
      onSettled?.(done, items.length);
    }
  }

  const workers = Math.min(Math.max(1, Math.floor(limit)), items.length);
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}
