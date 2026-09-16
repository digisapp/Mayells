import { redirect } from 'next/navigation';

/**
 * The Clients list has been folded into Users (filtered to consignors). Kept
 * as a redirect so bookmarks and the old sidebar entry keep working.
 */
export default function AdminClientsRedirect() {
  redirect('/admin/users?filter=consignors');
}
