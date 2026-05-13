'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FilePlus,
  Upload,
  ClipboardCheck,
  BarChart3,
  LogOut,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authApi } from '@/lib/api';

const navItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    label: 'Create Exam',
    href: '/dashboard/create-exam',
    icon: FilePlus,
  },
  {
    label: 'Upload Sheets',
    href: '/dashboard/upload-sheets',
    icon: Upload,
  },
  {
    label: 'AI Review',
    href: '/dashboard/ai-review',
    icon: ClipboardCheck,
  },
  {
    label: 'Analytics',
    href: '/dashboard/analytics',
    icon: BarChart3,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    authApi.logout();
    router.push('/login');
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-[#005461] flex flex-col z-50">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[#006878]">
        <div className="w-8 h-8 bg-[#FAB963] rounded-lg flex items-center justify-center flex-shrink-0">
          <BookOpen size={16} className="text-[#1A1A1A]" />
        </div>
        <span className="text-white font-semibold text-base">AutoGrade</span>
      </div>

      {/* Role badge */}
      <div className="px-6 py-3 border-b border-[#006878]">
        <span className="text-[10px] uppercase tracking-widest text-[#6BAAB5]">
          Teacher Portal
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== '/dashboard' && pathname.startsWith(href));

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
              <Icon
                size={18}
                className={active ? 'text-[#1A1A1A]' : 'text-[#9ECDD6]'}
              />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Bottom — user + logout */}
      <div className="px-3 py-4 border-t border-[#006878] space-y-1">
        <div className="px-3 py-2">
          <p className="text-xs text-[#9ECDD6] truncate">
            Signed in as
          </p>
          <p className="text-sm text-white font-medium truncate">
            Teacher
          </p>
        </div>
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