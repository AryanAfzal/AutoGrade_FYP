import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#FFF8EB]">
      <Sidebar />
      <Topbar />
      <main className="ml-60 pt-16 min-h-screen">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}