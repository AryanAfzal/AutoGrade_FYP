'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Settings } from 'lucide-react';
import { getStoredUser } from '@/lib/api';
import type { User } from '@/types';

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': {
    title: 'Dashboard',
    subtitle: 'Overview of your exams and activity',
  },
  '/dashboard/admin': {
    title: 'Admin Control Center',
    subtitle: 'Synchronized multi-admin review of teacher and student applications',
  },
  '/dashboard/teacher': {
    title: 'Teacher Dashboard',
    subtitle: 'Manage your subjects, student enrollments, and examinations',
  },
  '/dashboard/student': {
    title: 'Student Portal',
    subtitle: 'Enroll in subjects and view your published examination results',
  },
  '/dashboard/profile': {
    title: 'Profile & Account Settings',
    subtitle: 'Manage your personal profile, university details, and password security',
  },
  '/dashboard/create-exam': {
    title: 'Create Exam',
    subtitle: 'Set up a new examination with questions and answer keys',
  },
  '/dashboard/upload-sheets': {
    title: 'Upload Answer Sheets',
    subtitle: 'Upload and process student answer PDFs',
  },
  '/dashboard/ai-review': {
    title: 'AI Review',
    subtitle: 'Review AI-evaluated results before publishing',
  },
  '/dashboard/analytics': {
    title: 'Analytics',
    subtitle: 'Class performance, CLO attainment, and difficulty index',
  },
};

export default function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
    const onUserUpdate = (event: Event) => {
      const custom = event as CustomEvent<User>;
      if (custom.detail) {
        setUser(custom.detail);
      } else {
        setUser(getStoredUser());
      }
    };
    window.addEventListener('autograde:user-updated', onUserUpdate);
    return () => window.removeEventListener('autograde:user-updated', onUserUpdate);
  }, []);

  const page = pageTitles[pathname] || {
    title: 'AutoGrade',
    subtitle: '',
  };

  return (
    <header className="fixed top-0 left-60 right-0 h-16 bg-white border-b border-[#E8DCC8] shadow-[0_4px_18px_rgba(15,23,42,0.04)] flex items-center justify-between px-8 z-40">
      <div>
        <h1 className="text-base font-semibold text-[#1A1A1A]">
          {page.title}
        </h1>
        {page.subtitle && (
          <p className="text-xs text-[#888888]">{page.subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/dashboard/profile')}
          title="Account Settings"
          className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#FFF8EB] transition-colors"
        >
          <Settings size={18} className="text-[#005461]" />
        </button>

        <button
          type="button"
          title="Notifications"
          className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#FFF8EB] transition-colors"
        >
          <Bell size={18} className="text-[#005461]" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#FAB963] rounded-full" />
        </button>

        <button
          type="button"
          onClick={() => router.push('/dashboard/profile')}
          className="flex items-center gap-2.5 rounded-xl border border-[#E8DCC8] bg-[#FAF7F2] px-2.5 py-1.5 hover:border-[#005461] transition-colors"
        >
          <div className="w-7 h-7 bg-[#005461] rounded-full flex items-center justify-center overflow-hidden">
            {user?.profilePicture ? (
              <img
                src={user.profilePicture}
                alt={user.fullName}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[#FAB963] text-xs font-semibold">
                {user?.fullName?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            )}
          </div>
          {user && (
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold text-[#1A1A1A] leading-tight">
                {user.fullName}
              </p>
              <p className="text-[10px] text-[#888888] uppercase">
                {user.role}
              </p>
            </div>
          )}
        </button>
      </div>
    </header>
  );
}
