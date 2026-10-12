'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, CheckCircle2, Clock3, GraduationCap } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import type { User } from '@/types';

export default function StudentDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const rawUser = localStorage.getItem('user');
    if (!rawUser) {
      router.push('/login');
      return;
    }

    const parsed = JSON.parse(rawUser) as User;
    if (parsed.role !== 'student') {
      router.push('/dashboard');
      return;
    }

    setUser(parsed);
  }, [router]);

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A1A]">Welcome back, {user.fullName}</h2>
        <p className="text-sm text-[#888888] mt-1">
          {user.status === 'PENDING'
            ? 'Your registration is pending teacher approval.'
            : 'Here is your approved student dashboard overview.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FFF8EB] rounded-lg flex items-center justify-center">
              <BookOpen size={18} className="text-[#005461]" />
            </div>
            <div>
              <p className="text-xs text-[#888888] uppercase">Course</p>
              <p className="text-sm font-semibold text-[#1A1A1A]">{user.course || 'Not assigned yet'}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FFF8EB] rounded-lg flex items-center justify-center">
              <Clock3 size={18} className="text-[#005461]" />
            </div>
            <div>
              <p className="text-xs text-[#888888] uppercase">Status</p>
              <p className="text-sm font-semibold text-[#1A1A1A]">{user.status || 'APPROVED'}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FFF8EB] rounded-lg flex items-center justify-center">
              <GraduationCap size={18} className="text-[#005461]" />
            </div>
            <div>
              <p className="text-xs text-[#888888] uppercase">Student</p>
              <p className="text-sm font-semibold text-[#1A1A1A]">Your records</p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle2 size={18} className="text-[#005461]" />
          <h3 className="text-base font-semibold text-[#1A1A1A]">Student access</h3>
        </div>

        <p className="text-sm text-[#888888]">
          {user.status === 'APPROVED'
            ? 'Your student account is active and you can access assessment and results tools.'
            : 'Your registration request has been submitted and is awaiting approval from your assigned teacher.'}
        </p>

        <div className="mt-6">
          <Button variant="secondary" onClick={() => router.push('/dashboard')}>
            Go to dashboard overview
          </Button>
        </div>
      </Card>
    </div>
  );
}
