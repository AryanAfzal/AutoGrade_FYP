'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  GraduationCap,
  Users,
} from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { authApi, institutionApi } from '@/lib/api';

interface AdminSummary {
  departments: number;
  courses: number;
  terms: number;
  users: number;
  pendingApplications: number;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      institutionApi.getOverview(),
      authApi.getTeacherApplications(),
      authApi.getStudentApplications(),
    ])
      .then(([overview, teachers, students]) => {
        if (!active) return;
        setSummary({
          departments: overview.departmentCount,
          courses: overview.courseCount,
          terms: overview.termCount,
          users: overview.userCount,
          pendingApplications: teachers.filter((item) => item.status === 'PENDING').length
            + students.filter((item) => item.status === 'PENDING').length,
        });
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load administrator overview.');
      });
    return () => { active = false; };
  }, []);

  const openRoute = (route: string) => router.push(route);

  return (
    <div className="space-y-8">
      <header className="rounded-2xl bg-[#005461] p-7 text-white md:p-9">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#A7D4DB]">Administrator workspace</p>
        <h1 className="mt-2 text-3xl font-bold">Institution dashboard</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#D4EBEE]">
          Review applications, organize academic departments and subjects, and manage institution-wide settings from separate workspaces.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => openRoute('/dashboard/admin/review')}>
            <ClipboardCheck size={16} className="mr-2" />Open application review
          </Button>
          <Button variant="secondary" onClick={() => openRoute('/dashboard/admin/institution')}>
            <Building2 size={16} className="mr-2" />Manage institution
          </Button>
        </div>
      </header>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#1A1A1A]">At a glance</h2>
            <p className="text-sm text-[#777777]">Current institution setup and outstanding reviews.</p>
          </div>
          {summary && summary.pendingApplications > 0 && <Badge variant="warning">{summary.pendingApplications} pending</Badge>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Departments', value: summary?.departments, icon: Building2 },
            { label: 'Department subjects', value: summary?.courses, icon: BookOpen },
            { label: 'Academic terms', value: summary?.terms, icon: CalendarDays },
            { label: 'Managed users', value: summary?.users, icon: Users },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#888888]">{label}</p>
                  <p className="mt-2 text-3xl font-bold text-[#005461]">{value ?? '—'}</p>
                </div>
                <div className="rounded-xl bg-[#FFF1D7] p-3"><Icon size={20} className="text-[#005461]" /></div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col justify-between gap-5">
          <div>
            <div className="mb-3 inline-flex rounded-xl bg-[#FFF1D7] p-3 text-[#005461]"><ClipboardCheck size={21} /></div>
            <h2 className="text-lg font-bold">Application review</h2>
            <p className="mt-1 text-sm leading-6 text-[#777777]">Approve teachers and students, assign roll numbers, and assign department-approved subjects to teachers.</p>
          </div>
          <Button variant="secondary" className="self-start" onClick={() => openRoute('/dashboard/admin/review')}>
            Review applications <ArrowRight size={16} className="ml-2" />
          </Button>
        </Card>
        <Card className="flex flex-col justify-between gap-5">
          <div>
            <div className="mb-3 inline-flex rounded-xl bg-[#E4F2F4] p-3 text-[#005461]"><GraduationCap size={21} /></div>
            <h2 className="text-lg font-bold">Department & subject management</h2>
            <p className="mt-1 text-sm leading-6 text-[#777777]">Create departments and their course subjects, assign users to departments, and configure academic terms.</p>
          </div>
          <Button variant="secondary" className="self-start" onClick={() => openRoute('/dashboard/admin/institution')}>
            Manage institution <ArrowRight size={16} className="ml-2" />
          </Button>
        </Card>
      </section>

      {summary && summary.pendingApplications > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-4 border-l-4 border-l-[#FAB963]">
          <div className="flex items-center gap-3">
            <Clock3 size={20} className="text-[#A65A00]" />
            <div><p className="font-semibold">Applications need attention</p><p className="text-sm text-[#777777]">{summary.pendingApplications} teacher or student application(s) are waiting for review.</p></div>
          </div>
          <Button onClick={() => openRoute('/dashboard/admin/review')}>Review now</Button>
        </Card>
      )}
    </div>
  );
}
