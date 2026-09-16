import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/auth/require-admin';
import { SettingsClient, SETTINGS_TABS, type SettingsTab } from './settings-client';

export const metadata: Metadata = {
  title: 'Settings — Mayells Admin',
  robots: { index: false, follow: false },
};

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdminPage();
  const { tab } = await searchParams;
  const initialTab: SettingsTab = SETTINGS_TABS.some((t) => t.value === tab) ? (tab as SettingsTab) : 'sales';
  return <SettingsClient initialTab={initialTab} />;
}
