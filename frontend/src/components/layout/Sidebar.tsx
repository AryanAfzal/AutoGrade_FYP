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
  ShieldCheck,
  GraduationCap,
  Building2,
  MessageSquare,
  ChevronsLeft,
  ChevronsRight,
  Award,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getStoredUser } from '@/lib/api';
import type { User, UserRole } from '@/types';
import { useSidebar } from './SidebarContext';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const teacherNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard/teacher', icon: LayoutDashboard },
  { label: 'Create Exam', href: '/dashboard/create-exam', icon: FilePlus },
  { label: 'Upload Sheets', href: '/dashboard/upload-sheets', icon: Upload },
  { label: 'AI Review', href: '/dashboard/ai-review', icon: ClipboardCheck },
  { label: 'Published Results', href: '/dashboard/published-results', icon: Award },
  { label: 'Recheck Requests', href: '/dashboard/recheck-requests', icon: MessageSquare },
  { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
];

const adminNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard/admin', icon: LayoutDashboard },
  { label: 'Institution Management', href: '/dashboard/admin/institution', icon: Building2 },
  { label: 'Applications & Subjects', href: '/dashboard/admin/review', icon: ShieldCheck },
];

const studentNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard/student', icon: LayoutDashboard },
  { label: 'Results', href: '/dashboard/student/results', icon: GraduationCap },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggleCollapsed, mobileOpen, closeMobile } = useSidebar();
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

  // Close mobile drawer on route change
  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  const navItems = useMemo(() => {
    if (!role) return [];
    if (role === 'admin') return adminNavItems;
    if (role === 'student') return studentNavItems;
    return teacherNavItems;
  }, [role]);

  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User';

  const handleNavigate = (href: string) => {
    closeMobile();
    router.push(href);
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          onClick={closeMobile}
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'bg-[#005461] border-r border-[#006878] flex flex-col select-none shadow-[4px_0_24px_rgba(0,0,0,0.12)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          // Desktop styling (always present and pinned in layout)
          'hidden md:flex md:h-screen md:shrink-0 md:z-40',
          collapsed ? 'md:w-[76px]' : 'md:w-[250px]',
          // Mobile Drawer styling (fixed overlay drawer)
          mobileOpen
            ? '!flex fixed inset-y-0 left-0 z-50 w-[270px] max-w-[85vw] h-full shadow-2xl animate-in slide-in-from-left duration-300'
            : ''
        )}
      >
        {/* Top Brand Header */}
        <div className="flex items-center justify-between px-3.5 py-4 border-b border-[#006878] shrink-0 h-[68px]">
          {collapsed && !mobileOpen ? (
            <div className="w-full flex items-center justify-center">
              <button
                type="button"
                onClick={toggleCollapsed}
                title="Expand sidebar"
                className="p-1 rounded-full transition-transform duration-200 hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Image
                  src="/favicon-round.png"
                  alt="AutoGrade Logo"
                  width={36}
                  height={36}
                  className="w-9 h-9 object-contain rounded-full shadow-md"
                />
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleNavigate('/')}
                className="flex items-center gap-2.5 transition-transform duration-200 hover:scale-[1.02] active:scale-95 text-left cursor-pointer"
              >
                <Image
                  src="/favicon-round.png"
                  alt="AutoGrade Logo"
                  width={34}
                  height={34}
                  className="w-[34px] h-[34px] object-contain rounded-full shadow-md shrink-0"
                />
                <div className="min-w-0">
                  <span className="text-white font-bold text-base tracking-tight block leading-tight">
                    AutoGrade
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[#FAB963] block">
                    {roleLabel} Portal
                  </span>
                </div>
              </button>

              {/* Close Button on Mobile */}
              <button
                type="button"
                onClick={closeMobile}
                className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-[#9ECDD6] hover:bg-[#006878] hover:text-white transition-all cursor-pointer"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>

              {/* Collapse Button on Desktop */}
              <button
                type="button"
                onClick={toggleCollapsed}
                title="Collapse sidebar"
                className="hidden md:flex w-8 h-8 rounded-lg items-center justify-center text-[#9ECDD6] hover:bg-[#006878] hover:text-white transition-all duration-200 cursor-pointer active:scale-95 shrink-0"
              >
                <ChevronsLeft size={18} />
              </button>
            </>
          )}
        </div>

        {/* Collapse/Expand Action Button in Rail (Desktop only) */}
        {collapsed && !mobileOpen && (
          <div className="hidden md:flex flex-col items-center py-2.5 border-b border-[#006878] shrink-0">
            <div className="relative group">
              <button
                type="button"
                onClick={toggleCollapsed}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-[#9ECDD6] hover:bg-[#006878] hover:text-white transition-all duration-200 cursor-pointer active:scale-95"
                aria-label="Expand sidebar"
              >
                <ChevronsRight size={19} />
              </button>
              {/* Tooltip */}
              <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 hidden md:flex items-center opacity-0 -translate-x-2 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:translate-x-0">
                <div className="relative px-3 py-1.5 bg-[#0F172A] text-white text-xs font-semibold rounded-lg shadow-xl border border-white/10 whitespace-nowrap">
                  <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-[#0F172A] border-l border-b border-white/10 rotate-45" />
                  Expand Sidebar
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Menu List */}
        <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto flex flex-col justify-start">
          {collapsed && !mobileOpen ? (
            // Collapsed Icon-Only Circular Rail (Desktop Only)
            <div className="flex flex-col items-center space-y-2.5">
              {navItems.map(({ label, href, icon: Icon }) => {
                const route = href.split('#')[0];
                const dashboardRoot = ['/dashboard/admin', '/dashboard/student', '/dashboard/teacher'].includes(route);
                const active = pathname === route || (!dashboardRoot && route !== '/dashboard' && pathname.startsWith(`${route}/`));

                return (
                  <div key={href} className="relative group flex justify-center w-full">
                    <button
                      type="button"
                      onClick={() => handleNavigate(href)}
                      className={cn(
                        'w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer relative',
                        active
                          ? 'bg-[#FAB963] text-[#1A1A1A] shadow-md shadow-[#FAB963]/30 scale-100 ring-2 ring-[#FAB963]/50'
                          : 'text-[#C8E6EA] hover:bg-[#006878] hover:text-white hover:scale-105 active:scale-95'
                      )}
                      aria-label={label}
                    >
                      <Icon size={20} className={active ? 'text-[#1A1A1A]' : 'text-[#C8E6EA]'} />
                    </button>

                    {/* Tooltip on right */}
                    <div className="pointer-events-none absolute left-full ml-3.5 top-1/2 -translate-y-1/2 z-50 hidden md:flex items-center opacity-0 -translate-x-2 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:translate-x-0">
                      <div className="relative px-3 py-1.5 bg-[#0F172A] text-white text-xs font-semibold rounded-lg shadow-xl border border-white/10 whitespace-nowrap">
                        <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-[#0F172A] border-l border-b border-white/10 rotate-45" />
                        {label}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // Expanded Menu (Desktop & Mobile Drawer)
            <div className="space-y-1.5">
              {navItems.map(({ label, href, icon: Icon }) => {
                const route = href.split('#')[0];
                const dashboardRoot = ['/dashboard/admin', '/dashboard/student', '/dashboard/teacher'].includes(route);
                const active = pathname === route || (!dashboardRoot && route !== '/dashboard' && pathname.startsWith(`${route}/`));

                return (
                  <button
                    key={href}
                    type="button"
                    onClick={() => handleNavigate(href)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 text-left cursor-pointer group',
                      active
                        ? 'bg-[#FAB963] text-[#1A1A1A] font-semibold shadow-sm'
                        : 'text-[#C8E6EA] hover:bg-[#006878] hover:text-white hover:translate-x-1'
                    )}
                  >
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-200',
                        active
                          ? 'bg-[#1A1A1A]/10 text-[#1A1A1A]'
                          : 'bg-[#004752] text-[#9ECDD6] group-hover:bg-[#005461] group-hover:text-white'
                      )}
                    >
                      <Icon size={17} />
                    </div>
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </nav>
      </aside>
    </>
  );
}
