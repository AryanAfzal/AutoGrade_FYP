'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Settings, LogOut, ChevronDown, UserCircle2, Menu } from 'lucide-react';
import { authApi, getStoredUser } from '@/lib/api';
import type { User, UserNotification } from '@/types';
import { cn } from '@/lib/utils';
import { useSidebar } from './SidebarContext';

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
  '/dashboard/published-results': {
    title: 'Published Results',
    subtitle: 'View and manage student exam scores and analytics',
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
  const { toggleMobileOpen } = useSidebar();
  const [user, setUser] = useState<User | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

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

  // Close account dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  const handleLogout = () => {
    setAccountMenuOpen(false);
    authApi.logout();
    router.push('/login');
  };

  return (
    <header className="h-16 shrink-0 bg-white border-b border-[#E8DCC8] shadow-[0_4px_18px_rgba(15,23,42,0.04)] flex items-center justify-between px-3 sm:px-6 md:px-8 z-30 w-full gap-2">
      {/* Left Title & Mobile Menu Button */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={toggleMobileOpen}
          aria-label="Open navigation menu"
          className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-[#005461] hover:bg-[#FFF8EB] active:scale-95 transition-all shrink-0 cursor-pointer"
        >
          <Menu size={22} />
        </button>

        <div className="min-w-0">
          <h1 className="text-sm sm:text-base font-semibold text-[#1A1A1A] truncate">
            {page.title}
          </h1>
          {page.subtitle && (
            <p className="text-[11px] sm:text-xs text-[#888888] truncate hidden sm:block">
              {page.subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right Controls & Profile */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Settings shortcut button */}
        <button
          type="button"
          onClick={() => router.push('/dashboard/profile')}
          title="Profile & Settings"
          className="relative w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg hover:bg-[#FFF8EB] transition-colors cursor-pointer active:scale-95 text-[#005461]"
        >
          <Settings size={18} />
        </button>

        {/* Notifications for student */}
        <button
          type="button"
          onClick={() => {
            if (user?.role === 'student') router.push('/dashboard/student/results');
          }}
          title={user?.role === 'student' ? `${unreadNotifications} unread notifications` : 'Notifications'}
          className="relative w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg hover:bg-[#FFF8EB] transition-colors cursor-pointer active:scale-95 text-[#005461]"
        >
          <Bell size={18} />
          {unreadNotifications > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FAB963] px-1 text-[9px] font-bold text-[#1A1A1A]">
              {unreadNotifications > 9 ? '9+' : unreadNotifications}
            </span>
          )}
        </button>

        {/* Account Menu Dropdown */}
        <div ref={accountMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setAccountMenuOpen((prev) => !prev)}
            aria-expanded={accountMenuOpen}
            aria-label="Account menu"
            className="flex items-center gap-1.5 sm:gap-2.5 rounded-xl border border-[#E8DCC8] bg-[#FAF7F2] p-1 sm:px-3 sm:py-1.5 hover:border-[#005461] hover:bg-[#FFF8EB] transition-all cursor-pointer active:scale-95"
          >
            <div className="w-7 h-7 bg-[#005461] rounded-full flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
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
              <div className="hidden md:block text-left">
                <p className="text-xs font-semibold text-[#1A1A1A] leading-tight max-w-[120px] truncate">
                  {user.fullName}
                </p>
                <p className="text-[10px] text-[#888888] uppercase font-bold">
                  {user.role}
                </p>
              </div>
            )}
            <ChevronDown
              size={14}
              className={cn(
                'text-[#888888] transition-transform duration-200 hidden sm:block',
                accountMenuOpen && 'rotate-180 text-[#005461]'
              )}
            />
          </button>

          {/* Popdown Menu with Logout */}
          {accountMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 max-w-[90vw] rounded-2xl bg-white border border-[#E8DCC8] shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-3 py-2.5 border-b border-[#F0E6D8] flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#005461] text-[#FAB963] font-bold flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                  {user?.profilePicture ? (
                    <img
                      src={user.profilePicture}
                      alt={user.fullName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-base">{user?.fullName?.charAt(0)?.toUpperCase() || 'U'}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[#1A1A1A] truncate">{user?.fullName || 'User'}</p>
                  <p className="text-[11px] text-[#888888] truncate">{user?.email}</p>
                  <span className="inline-block mt-0.5 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#E4F2F4] text-[#005461]">
                    {user?.role} Portal
                  </span>
                </div>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    router.push('/dashboard/profile');
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#334155] hover:bg-[#FFF8EB] hover:text-[#005461] transition-colors cursor-pointer"
                >
                  <UserCircle2 size={16} className="text-[#005461]" />
                  <span>Profile & Settings</span>
                </button>
              </div>

              <div className="border-t border-[#F0E6D8] pt-1">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <LogOut size={16} className="text-red-500" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
