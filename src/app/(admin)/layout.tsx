import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { DashboardTopbar } from '@/components/layout/DashboardTopbar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="flex-1 flex flex-col">
        <DashboardTopbar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
