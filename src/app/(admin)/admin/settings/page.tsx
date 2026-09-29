import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/auth/require-admin';
import { SettingsClient } from './settings-client';
import { isSettingsTab, type SettingsTab } from './tabs';

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
  const initialTab: SettingsTab = isSettingsTab(tab) ? tab : 'sales';
  return <SettingsClient initialTab={initialTab} />;
}
