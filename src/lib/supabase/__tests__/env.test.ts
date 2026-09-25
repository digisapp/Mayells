import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanEnvValue, supabaseUrl, supabaseAnonKey } from '../env';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('cleanEnvValue', () => {
  it('strips the trailing newline a dashboard paste leaves behind', () => {
    expect(cleanEnvValue('eyJhbGciOi.payload.sig\n')).toBe('eyJhbGciOi.payload.sig');
    expect(cleanEnvValue('  https://x.supabase.co\r\n')).toBe('https://x.supabase.co');
  });

  it('treats missing or blank values as unset', () => {
    expect(cleanEnvValue(undefined)).toBeUndefined();
    expect(cleanEnvValue('')).toBeUndefined();
    expect(cleanEnvValue(' \n')).toBeUndefined();
  });
});

describe('supabase env getters', () => {
  it('trim the configured url and anon key', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co\n');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key\n');
    expect(supabaseUrl()).toBe('https://abc.supabase.co');
    expect(supabaseAnonKey()).toBe('anon-key');
  });

  it('yield a key that survives a WebSocket query string intact', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key\n');
    const url = `wss://abc.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(supabaseAnonKey()!)}&vsn=2.0.0`;
    expect(url).not.toContain('%0A');
  });
});
