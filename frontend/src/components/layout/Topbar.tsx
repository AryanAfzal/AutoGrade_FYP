'use client';

import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': {
    title: 'Dashboard',
    subtitle: 'Overview of your exams and activity',
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
  const page = pageTitles[pathname] || {
    title: 'AutoGrade',
    subtitle: '',
  };

  return (
    <header className="fixed top-0 left-60 right-0 h-16 bg-white border-b border-[#E8DCC8] flex items-center justify-between px-8 z-40">
      {/* Page title */}
      <div>
        <h1 className="text-base font-semibold text-[#1A1A1A]">
          {page.title}
        </h1>
        {page.subtitle && (
          <p className="text-xs text-[#888888]">{page.subtitle}</p>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Notification bell */}
        <button className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#FFF8EB] transition-colors">
          <Bell size={18} className="text-[#005461]" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#FAB963] rounded-full" />
        </button>

        {/* Avatar */}
        <div className="w-9 h-9 bg-[#005461] rounded-lg flex items-center justify-center">
          <span className="text-[#FAB963] text-sm font-semibold">T</span>
        </div>
      </div>
    </header>
  );
}