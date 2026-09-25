/**
 * Keep the screen on while a submission is in flight. An iPhone that
 * auto-locks during "Uploading…" suspends the page and stalls the request;
 * Safari 16.4+ and Chrome honour a screen wake lock. It can't stop the seller
 * pressing the side button, so the upload retries cover that case.
 *
 * Call it synchronously from the submit handler (the request wants a user
 * gesture). Returns a release function immediately and never blocks the
 * submission: unsupported, refused (Low Power Mode) or slow, it's a no-op.
 */
export function keepScreenAwake(): () => void {
  let released = false;
  let sentinel: WakeLockSentinel | null = null;
  try {
    navigator.wakeLock
      ?.request('screen')
      .then((s) => {
        if (released) s.release().catch(() => {});
        else sentinel = s;
      })
      .catch(() => {});
  } catch {
    // no wake lock here
  }
  return () => {
    released = true;
    sentinel?.release().catch(() => {});
  };
}
