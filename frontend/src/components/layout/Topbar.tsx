'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Settings } from 'lucide-react';
import { authApi, getStoredUser } from '@/lib/api';
import type { User, UserNotification } from '@/types';

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': {
    title: 'Dashboard',
    subtitle: 'Overview of your exams and activity',
  },
  '/dashboard/admin': {
    title: 'Institution Dashboard',
    subtitle: 'Overview of institution management and application review',
  },
  '/dashboard/admin/review': {
    title: 'Application Review',
    subtitle: 'Review teacher and student applications and assign department subjects',
  },
  '/dashboard/admin/institution': {
    title: 'Institution Management',
    subtitle: 'Manage departments, subjects, users, and academic terms',
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
  '/dashboard/recheck-requests': {
    title: 'Recheck Requests',
    subtitle: 'Resolve student requests to review published marks',
  },
  '/dashboard/student/results': {
    title: 'My Results',
    subtitle: 'Published marks, feedback, and recheck requests',
  },
};

export default function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

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

  useEffect(() => {
    if (user?.role !== 'student') {
      setUnreadNotifications(0);
      return;
    }

    let active = true;
    const refreshNotifications = () => {
      authApi.getNotifications()
        .then((notifications: UserNotification[]) => {
          if (active) {
            setUnreadNotifications(notifications.filter((notification) => !notification.readAt).length);
          }
        })
        .catch((error: unknown) => {
          if (active) {
            console.error('Unable to refresh student notifications:', error);
          }
        });
    };

    refreshNotifications();
    const intervalId = window.setInterval(refreshNotifications, 30000);
    window.addEventListener('autograde:notifications-updated', refreshNotifications);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('autograde:notifications-updated', refreshNotifications);
    };
  }, [user?.role, pathname]);

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
          onClick={() => {
            if (user?.role === 'student') router.push('/dashboard/student/results');
          }}
          title={user?.role === 'student' ? `${unreadNotifications} unread notifications` : 'Notifications'}
          className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#FFF8EB] transition-colors"
        >
          <Bell size={18} className="text-[#005461]" />
          {unreadNotifications > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FAB963] px-1 text-[9px] font-bold text-[#1A1A1A]">
              {unreadNotifications > 9 ? '9+' : unreadNotifications}
            </span>
          )}
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
