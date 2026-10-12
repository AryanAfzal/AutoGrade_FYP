'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus, Upload, ClipboardCheck, BarChart3, BookOpen, Clock, Check, X, UserCheck } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { authApi, examApi } from '@/lib/api';
import type { Exam, RegistrationRequest, User } from '@/types';
import { formatDate } from '@/lib/utils';

const quickActions = [
  { label: 'Create Exam', description: 'Set up a new exam with questions', icon: FilePlus, href: '/dashboard/create-exam', color: 'bg-[#005461]', iconColor: 'text-[#FAB963]' },
  { label: 'Upload Sheets', description: 'Upload student answer PDFs', icon: Upload, href: '/dashboard/upload-sheets', color: 'bg-[#FAB963]', iconColor: 'text-[#1A1A1A]' },
  { label: 'AI Review', description: 'Review evaluated results', icon: ClipboardCheck, href: '/dashboard/ai-review', color: 'bg-[#005461]', iconColor: 'text-[#FAB963]' },
  { label: 'Analytics', description: 'View class performance', icon: BarChart3, href: '/dashboard/analytics', color: 'bg-[#FAB963]', iconColor: 'text-[#1A1A1A]' },
];

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info' | 'amber'> = {
  draft: 'default',
  active: 'info',
  under_review: 'warning',
  published: 'success',
  closed: 'danger',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<string[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (!raw) {
      router.push('/login');
      return;
    }

    const parsed = JSON.parse(raw) as User;
    if (parsed.role === 'student') {
      router.push('/dashboard/student');
      return;
    }

    if (parsed.role === 'admin') {
      router.push('/dashboard/admin');
      return;
    }

    if (parsed.role === 'teacher') {
      router.push('/dashboard/teacher');
      return;
    }

    router.push('/login');
  }, [router]);

  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'PENDING').length, [requests]);
  const approvedCount = useMemo(() => requests.filter((r) => r.status === 'APPROVED').length, [requests]);
  const rejectedCount = useMemo(() => requests.filter((r) => r.status === 'REJECTED').length, [requests]);

  const handleRequestDecision = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    setProcessingIds((current) => [...current, id]);
    try {
      await authApi.updateTeacherRequest(id, status);
      setRequests((current) =>
        current.map((request) => (request.id === id ? { ...request, status } : request))
      );
    } finally {
      setProcessingIds((current) => current.filter((item) => item !== id));
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A1A]">
          Good day, {user.role === 'admin' ? 'Administrator' : 'Teacher'}
        </h2>
        <p className="text-sm text-[#888888] mt-1">
          {user.role === 'admin'
            ? 'Manage institutional oversight, teacher actions, and student approvals.'
            : 'Here\'s what\'s happening with your exams and student registrations today.'}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {quickActions.map(({ label, description, icon: Icon, href, color, iconColor }) => (
          <button
            key={href}
            type="button"
            onClick={() => router.push(href)}
            className="flex flex-col items-start gap-3 p-5 bg-white rounded-xl border border-[#E8DCC8] hover:shadow-md hover:border-[#005461] transition-all duration-200 text-left group"
          >
            <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center`}>
              <Icon size={18} className={iconColor} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1A1A1A] group-hover:text-[#005461] transition-colors">
                {label}
              </p>
              <p className="text-xs text-[#888888] mt-0.5">{description}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-[#888888]">Pending</p>
              <p className="text-2xl font-bold text-[#1A1A1A] mt-1">{pendingCount}</p>
            </div>
            <Clock size={18} className="text-[#FAB963]" />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-[#888888]">Approved</p>
              <p className="text-2xl font-bold text-[#1A1A1A] mt-1">{approvedCount}</p>
            </div>
            <UserCheck size={18} className="text-[#005461]" />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-[#888888]">Rejected</p>
              <p className="text-2xl font-bold text-[#1A1A1A] mt-1">{rejectedCount}</p>
            </div>
            <X size={18} className="text-red-500" />
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#1A1A1A]">Student Registration Requests</h3>
        </div>

        {requests.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-12 h-12 bg-[#FFF8EB] rounded-full flex items-center justify-center">
                <BookOpen size={20} className="text-[#005461]" />
              </div>
              <p className="text-sm font-medium text-[#1A1A1A]">No student registrations found</p>
              <p className="text-xs text-[#888888]">New requests will appear here once students submit a registration.</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <Card key={request.id} padding="sm">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-[#FFF8EB] rounded-lg flex items-center justify-center flex-shrink-0">
                      <BookOpen size={18} className="text-[#005461]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#1A1A1A]">{request.fullName}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-[#888888]">
                        <span>{request.email}</span>
                        <span className="text-[#E8DCC8]">·</span>
                        <span>{request.course || 'No course'}</span>
                        <span className="text-[#E8DCC8]">·</span>
                        <span>{request.requestedAt ? formatDate(request.requestedAt) : 'Just now'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant={statusVariant[request.status]}>{request.status}</Badge>
                    {request.status === 'PENDING' && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={processingIds.includes(request.id)}
                          onClick={() => handleRequestDecision(request.id, 'APPROVED')}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          loading={processingIds.includes(request.id)}
                          onClick={() => handleRequestDecision(request.id, 'REJECTED')}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#1A1A1A]">Recent Exams</h3>
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/create-exam')}>
            + New Exam
          </Button>
        </div>

        {loading ? (
          <Card>
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-[#005461] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-[#888888]">Loading exams...</p>
              </div>
            </div>
          </Card>
        ) : exams.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-14 h-14 bg-[#FFF8EB] rounded-full flex items-center justify-center">
                <BookOpen size={24} className="text-[#005461]" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-[#1A1A1A]">No exams yet</p>
                <p className="text-xs text-[#888888] mt-1">Create your first exam to get started</p>
              </div>
              <Button onClick={() => router.push('/dashboard/create-exam')}>Create Exam</Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {exams.map((exam) => (
              <Card key={exam.id} padding="sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-[#FFF8EB] rounded-lg flex items-center justify-center flex-shrink-0">
                      <BookOpen size={18} className="text-[#005461]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#1A1A1A]">{exam.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-[#888888]">{exam.course}</span>
                        <span className="text-[#E8DCC8]">·</span>
                        <span className="text-xs text-[#888888]">{exam.term}</span>
                        <span className="text-[#E8DCC8]">·</span>
                        <Clock size={10} className="text-[#888888]" />
                        <span className="text-xs text-[#888888]">{formatDate(exam.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={statusVariant[exam.status]}>{exam.status.replace('_', ' ')}</Badge>
                    <Button variant="secondary" size="sm" onClick={() => router.push(`/dashboard/upload-sheets?examId=${exam.id}`)}>
                      Manage
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
