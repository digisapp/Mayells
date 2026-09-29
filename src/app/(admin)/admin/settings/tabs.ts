/**
 * Settings tab ids. A plain module (not the 'use client' SettingsClient) so
 * the server page can validate ?tab= — server code can't read values
 * exported from a client module.
 */
export const SETTINGS_TAB_VALUES = [
  'sales',
  'shipping',
  'commission',
  'ai',
  'prospects',
  'notifications',
  'security',
] as const;

export type SettingsTab = (typeof SETTINGS_TAB_VALUES)[number];

export function isSettingsTab(value: string | undefined): value is SettingsTab {
  return !!value && (SETTINGS_TAB_VALUES as readonly string[]).includes(value);
}
