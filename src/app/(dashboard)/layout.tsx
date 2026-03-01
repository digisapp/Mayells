import { DashboardSidebar } from '@/components/layout/DashboardSidebar';
import { DashboardTopbar } from '@/components/layout/DashboardTopbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col">
        <DashboardTopbar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
