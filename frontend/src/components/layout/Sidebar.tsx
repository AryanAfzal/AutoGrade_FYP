'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  LayoutDashboard,
  FilePlus,
  Upload,
  ClipboardCheck,
  BarChart3,
  LogOut,
  BookOpen,
  ShieldCheck,
  GraduationCap,
  UserCircle2,
  Building2,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authApi, getStoredUser } from '@/lib/api';
import type { User, UserRole } from '@/types';

const teacherNavItems = [
  { label: 'Dashboard', href: '/dashboard/teacher', icon: LayoutDashboard },
  { label: 'Create Exam', href: '/dashboard/create-exam', icon: FilePlus },
  { label: 'Upload Sheets', href: '/dashboard/upload-sheets', icon: Upload },
  { label: 'AI Review', href: '/dashboard/ai-review', icon: ClipboardCheck },
  { label: 'Recheck Requests', href: '/dashboard/recheck-requests', icon: MessageSquare },
  { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { label: 'Profile & Settings', href: '/dashboard/profile', icon: UserCircle2 },
];

const adminNavItems = [
  { label: 'Dashboard', href: '/dashboard/admin', icon: LayoutDashboard },
  { label: 'Institution Management', href: '/dashboard/admin/institution', icon: Building2 },
  { label: 'Applications & Subjects', href: '/dashboard/admin/review', icon: ShieldCheck },
  { label: 'Profile & Settings', href: '/dashboard/profile', icon: UserCircle2 },
];

const studentNavItems = [
  { label: 'Dashboard', href: '/dashboard/student', icon: LayoutDashboard },
  { label: 'Results', href: '/dashboard/student/results', icon: GraduationCap },
  { label: 'Profile & Settings', href: '/dashboard/profile', icon: UserCircle2 },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const role: UserRole | null = user?.role || null;

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

  const navItems = useMemo(() => {
    if (!role) return [];
    if (role === 'admin') return adminNavItems;
    if (role === 'student') return studentNavItems;
    return teacherNavItems;
  }, [role]);

  const handleLogout = () => {
    authApi.logout();
    router.push('/login');
  };

  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User';

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-[#005461] flex flex-col z-50">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[#006878]">
        <Image
          src="/favicon-round.png"
          alt="AutoGrade Logo"
          width={32}
          height={32}
          className="w-8 h-8 object-contain rounded-full shadow-sm flex-shrink-0"
        />
        <span className="text-white font-semibold text-base">AutoGrade</span>
      </div>

      <div className="px-6 py-3 border-b border-[#006878]">
        <span className="text-[10px] uppercase tracking-widest text-[#6BAAB5]">
          {role === 'admin' ? 'Admin Portal' : role === 'student' ? 'Student Portal' : 'Teacher Portal'}
        </span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ label, href, icon: Icon }) => {
          const route = href.split('#')[0];
          const dashboardRoot = ['/dashboard/admin', '/dashboard/student', '/dashboard/teacher'].includes(route);
          const active = pathname === route || (!dashboardRoot && route !== '/dashboard' && pathname.startsWith(`${route}/`));

          return (
            <button
              key={href}
              onClick={() => router.push(href)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-left',
                active
                  ? 'bg-[#FAB963] text-[#1A1A1A]'
                  : 'text-[#C8E6EA] hover:bg-[#006878] hover:text-white'
              )}
            >
              <Icon size={18} className={active ? 'text-[#1A1A1A]' : 'text-[#9ECDD6]'} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-[#006878] space-y-2">
        <button
          type="button"
          onClick={() => router.push('/dashboard/profile')}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#006878] transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-full bg-[#FAB963] text-[#1A1A1A] font-bold flex items-center justify-center overflow-hidden shrink-0">
            {user?.profilePicture ? (
              <img
                src={user.profilePicture}
                alt={user.fullName}
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{user?.fullName?.charAt(0)?.toUpperCase() || roleLabel.charAt(0)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white font-semibold truncate">
              {user?.fullName || roleLabel}
            </p>
            <p className="text-[11px] text-[#9ECDD6] truncate">
              {user?.email || roleLabel}
            </p>
          </div>
        </button>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#C8E6EA] hover:bg-red-500 hover:text-white transition-all duration-200"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
