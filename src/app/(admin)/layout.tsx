import type { Metadata } from 'next';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { DashboardTopbar } from '@/components/layout/DashboardTopbar';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      {/* min-w-0 lets wide tables scroll inside their own container instead
          of forcing the whole page to scroll horizontally. */}
      <div className="flex-1 min-w-0 flex flex-col">
        <DashboardTopbar />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
