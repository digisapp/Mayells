import { redirect } from 'next/navigation';

/**
 * The client detail page is now the single person page under /admin/users.
 * Old links (inbox "view profile", bookmarks) land here and are forwarded.
 */
export default async function AdminClientDetailRedirect({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  redirect(`/admin/users/${encodeURIComponent(clientId)}`);
}
