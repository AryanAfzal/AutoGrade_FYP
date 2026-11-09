'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Topbar from '@/components/layout/Topbar';
import { clearAuthSession, getStoredUser, getToken } from '@/lib/api';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const token = getToken();
    const user = getStoredUser();

    if (!token || !user) {
      clearAuthSession();
      router.replace('/login');
      return;
    }

    const homeRoute =
      user.role === 'admin'
        ? '/dashboard/admin'
        : user.role === 'student'
        ? '/dashboard/student'
        : '/dashboard/teacher';

    if (pathname === '/dashboard') {
      router.replace(homeRoute);
      return;
    }

    if (pathname.startsWith('/dashboard/profile')) {
      setAuthorized(true);
      return;
    }

    if (pathname.startsWith('/dashboard/admin') && user.role !== 'admin') {
      router.replace(homeRoute);
      return;
    }

    if (pathname.startsWith('/dashboard/student') && user.role !== 'student') {
      router.replace(homeRoute);
      return;
    }

    const teacherRoutes = [
      '/dashboard/teacher',
      '/dashboard/create-exam',
      '/dashboard/upload-sheets',
      '/dashboard/ai-review',
      '/dashboard/analytics',
      '/dashboard/recheck-requests',
      '/dashboard/exams',
      '/dashboard/uploads',
      '/dashboard/review',
      '/dashboard/similarity',
    ];
    if (
      teacherRoutes.some((prefix) => pathname.startsWith(prefix)) &&
      user.role !== 'teacher'
    ) {
      router.replace(homeRoute);
      return;
    }

    setAuthorized(true);
  }, [pathname, router]);

  if (!authorized) {
    return (
      <div className="min-h-screen bg-[#FFF8EB] flex items-center justify-center text-sm text-[#666666]">
        Verifying session & role permissions...
      </div>
    );
  }

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
