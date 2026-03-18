import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { logger } from '../logger';

const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

beforeEach(() => {
  logSpy.mockClear();
  warnSpy.mockClear();
  errorSpy.mockClear();
});

afterAll(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

describe('logger', () => {
  it('logs info messages as structured JSON', () => {
    logger.info('Test message');
    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(logSpy.mock.calls[0][0]);
    expect(logged.level).toBe('info');
    expect(logged.message).toBe('Test message');
    expect(logged.timestamp).toBeDefined();
  });

  it('includes metadata in info logs', () => {
    logger.info('User action', { userId: '123', action: 'login' });
    const logged = JSON.parse(logSpy.mock.calls[0][0]);
    expect(logged.userId).toBe('123');
    expect(logged.action).toBe('login');
  });

  it('logs warnings via console.warn', () => {
    logger.warn('Something odd');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(warnSpy.mock.calls[0][0]);
    expect(logged.level).toBe('warn');
  });

  it('logs errors with Error object details', () => {
    const error = new Error('Something broke');
    logger.error('Operation failed', error);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(logged.level).toBe('error');
    expect(logged.message).toBe('Operation failed');
    expect(logged.error).toBe('Something broke');
    expect(logged.stack).toBeDefined();
  });

  it('logs errors with string error values', () => {
    logger.error('Failed', 'string error');
    const logged = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(logged.error).toBe('string error');
  });

  it('logs errors with additional metadata', () => {
    logger.error('DB error', new Error('timeout'), { table: 'users' });
    const logged = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(logged.table).toBe('users');
    expect(logged.error).toBe('timeout');
  });

  it('logs errors without an error object', () => {
    logger.error('Something failed');
    const logged = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(logged.level).toBe('error');
    expect(logged.message).toBe('Something failed');
    expect(logged.error).toBeUndefined();
  });
});
