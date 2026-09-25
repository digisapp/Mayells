/**
 * Supabase connection settings, whitespace-trimmed.
 *
 * Values pasted into a hosting dashboard often pick up a trailing newline.
 * fetch() trims header values so REST calls shrug it off, but the Realtime
 * client puts the key in the WebSocket URL (`?apikey=…%0A`), and the server
 * rejects the handshake — so every reader goes through these helpers.
 *
 * Each getter references its `process.env.NEXT_PUBLIC_*` name literally so
 * Next can still inline the value into the browser bundle.
 */
export function cleanEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function supabaseUrl(): string | undefined {
  return cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabaseAnonKey(): string | undefined {
  return cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
