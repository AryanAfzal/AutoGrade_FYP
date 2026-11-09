'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus, Upload, ClipboardCheck, BarChart3, BookOpen, Clock, X, UserCheck, AlertCircle, Trash2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { authApi, examApi } from '@/lib/api';
import type { Exam, TeacherEnrollmentRequest, User } from '@/types';
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

export default function TeacherDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [requests, setRequests] = useState<TeacherEnrollmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<string[]>([]);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [requestError, setRequestError] = useState('');
  const [requestNotice, setRequestNotice] = useState('');
  const [examError, setExamError] = useState('');
  const [deletingExamId, setDeletingExamId] = useState<string | null>(null);
  const [viewingExamId, setViewingExamId] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (!raw) {
      router.push('/login');
      return;
    }

    const parsed = JSON.parse(raw) as User;
    if (parsed.role !== 'teacher') {
      router.push(parsed.role === 'admin' ? '/dashboard/admin' : parsed.role === 'student' ? '/dashboard/student' : '/login');
      return;
    }

    setUser(parsed);

    const loadData = async () => {
      try {
        const [examData, requestData, currentUser] = await Promise.all([
          examApi.getAll(),
          authApi.getTeacherRequests(),
          authApi.getCurrentUser(),
        ]);
        setExams(examData);
        setRequests(requestData);
        setUser(currentUser);
      } catch {
        setExams([]);
        setRequests([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [router]);

  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'PENDING').length, [requests]);
  const approvedCount = useMemo(() => requests.filter((r) => r.status === 'APPROVED').length, [requests]);
  const rejectedCount = useMemo(() => requests.filter((r) => r.status === 'REJECTED').length, [requests]);

  const handleRequestDecision = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    setProcessingIds((current) => [...current, id]);
    setRequestError('');
    setRequestNotice('');
    try {
      const result = await authApi.updateTeacherRequest(id, status, rejectionReasons[id]);
      setRequests((current) =>
        current.map((request) => (request.id === id ? { ...request, status } : request))
      );
      setRequestNotice(result.message);
    } catch (error: unknown) {
      setRequestError(error instanceof Error ? error.message : 'Unable to update the enrollment request.');
    } finally {
      setProcessingIds((current) => current.filter((item) => item !== id));
    }
  };

  const handleDeleteExam = async (exam: Exam) => {
    const confirmed = window.confirm(
      `Delete "${exam.title}"? This permanently removes the exam, uploaded answer sheets, evaluations, and results.`,
    );
    if (!confirmed) return;

    setDeletingExamId(exam.id);
    setExamError('');
    try {
      await examApi.delete(exam.id);
      setExams((current) => current.filter((item) => item.id !== exam.id));
    } catch (error: unknown) {
      setExamError(error instanceof Error ? error.message : 'Unable to delete this exam.');
    } finally {
      setDeletingExamId(null);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A1A]">Good day, Teacher</h2>
        <p className="text-sm text-[#888888] mt-1">
          Here&apos;s what&apos;s happening with your exams and subject enrollment requests today.
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

      <Card>
        <div className="flex items-center gap-3">
          <BookOpen size={18} className="text-[#005461]" />
          <div>
            <p className="text-xs uppercase tracking-wider text-[#888888]">Subjects assigned by admin</p>
            <p className="mt-1 text-sm font-medium text-[#1A1A1A]">
              {user.assignedSubjects?.length ? user.assignedSubjects.join(', ') : 'No subjects assigned yet. Contact the administrator.'}
            </p>
          </div>
        </div>
      </Card>

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

        {requestError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <AlertCircle size={15} className="mr-2 inline" />{requestError}
          </p>
        )}
        {requestNotice && (
          <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {requestNotice}
          </p>
        )}

        {requests.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-12 h-12 bg-[#FFF8EB] rounded-full flex items-center justify-center">
                <BookOpen size={20} className="text-[#005461]" />
              </div>
              <p className="text-sm font-medium text-[#1A1A1A]">No subject enrollment requests found</p>
              <p className="text-xs text-[#888888]">Approved students&apos; requests to enroll in your subjects will appear here.</p>
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
                        <span className="font-semibold text-[#005461]">Roll no: {request.rollNumber || 'Unassigned'}</span>
                        <span className="text-[#E8DCC8]">·</span>
                        <span>{request.email}</span>
                        <span className="text-[#E8DCC8]">·</span>
                        <span>{request.subject}</span>
                        <span className="text-[#E8DCC8]">·</span>
                        <span>{request.requestedAt ? formatDate(request.requestedAt) : 'Just now'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant={statusVariant[request.status]}>{request.status}</Badge>
                    {request.status === 'PENDING' && (
                      <div className="flex flex-wrap items-center gap-2">
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
                          disabled={!(rejectionReasons[request.id] || '').trim()}
                          onClick={() => handleRequestDecision(request.id, 'REJECTED')}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                {request.status === 'PENDING' && (
                  <div className="mt-3 max-w-sm">
                    <Input
                      label="Rejection reason (required to reject)"
                      value={rejectionReasons[request.id] || ''}
                      onChange={(event) => setRejectionReasons((current) => ({ ...current, [request.id]: event.target.value }))}
                      placeholder="Explain why this enrollment is rejected"
                    />
                  </div>
                )}
                {request.status === 'REJECTED' && request.rejectionReason && (
                  <p className="mt-2 text-xs text-red-700">Rejection reason: {request.rejectionReason}</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <div id="papers-made" className="scroll-mt-24 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#1A1A1A]">Papers made</h3>
            <p className="mt-1 text-xs text-[#777777]">Your created exams, newest first.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/create-exam')}>
            + New Exam
          </Button>
        </div>

        {examError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <AlertCircle size={15} className="mr-2 inline" />{examError}
          </p>
        )}
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
                <div className="flex flex-wrap items-center justify-between gap-3">
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
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant={statusVariant[exam.status]}>{exam.status.replace('_', ' ')}</Badge>
                    <Button variant="secondary" size="sm" onClick={() => router.push(`/dashboard/upload-sheets?examId=${exam.id}`)}>
                      Manage
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setViewingExamId((current) => current === exam.id ? null : exam.id)
                      }
                    >
                      {viewingExamId === exam.id ? 'Hide paper' : 'View paper'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/dashboard/ai-review?examId=${exam.id}`)}
                    >
                      Review
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={deletingExamId === exam.id}
                      disabled={deletingExamId !== null}
                      onClick={() => handleDeleteExam(exam)}
                    >
                      <Trash2 size={14} className="mr-1.5" />
                      Delete
                    </Button>
                  </div>
                </div>
                {viewingExamId === exam.id && (
                  <div className="mt-4 space-y-3 border-t border-[#E8DCC8] pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-[#005461]">
                        Questions and answer key
                      </h4>
                      <span className="text-xs text-[#777777]">
                        {exam.questions?.length ?? 0} question(s) · {exam.totalMarks} total marks
                      </span>
                    </div>
                    {!exam.questions?.length ? (
                      <p className="rounded-lg bg-[#FFF8EB] px-4 py-3 text-sm text-[#777777]">
                        This paper does not contain any saved questions.
                      </p>
                    ) : (
                      exam.questions.map((question, index) => {
                        const correctOption = question.options?.find(
                          (option) => option.label === question.correctAnswer,
                        );
                        return (
                          <div
                            key={question.id}
                            className="rounded-xl border border-[#E8DCC8] bg-[#FFFDF8] p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <p className="min-w-0 flex-1 text-sm font-semibold leading-6 text-[#1A1A1A]">
                                <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#005461] text-xs text-white">
                                  {index + 1}
                                </span>
                                {question.questionText}
                              </p>
                              <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-[#005461]">
                                {question.maxMarks} marks · {question.clo}
                              </span>
                            </div>
                            {question.type === 'mcq' && (
                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                {(question.options || []).map((option) => (
                                  <div
                                    key={option.label}
                                    className={`rounded-lg border px-3 py-2 text-sm ${
                                      option.label === question.correctAnswer
                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                        : 'border-[#E8DCC8] bg-white text-[#444444]'
                                    }`}
                                  >
                                    <span className="mr-2 font-semibold">{option.label}.</span>
                                    {option.text}
                                    {option.label === question.correctAnswer && (
                                      <span className="ml-2 text-xs font-semibold">(Correct)</span>
                                    )}
                                  </div>
                                ))}
                                <p className="text-xs text-[#666666] sm:col-span-2">
                                  Answer key: <strong>{question.correctAnswer || 'Not set'}</strong>
                                  {correctOption ? ` — ${correctOption.text}` : ''}
                                </p>
                              </div>
                            )}
                            {question.type === 'descriptive' && (
                              <div className="mt-3 space-y-3">
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
                                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                                    Reference answer
                                  </p>
                                  <p className="whitespace-pre-wrap text-sm leading-6 text-[#333333]">
                                    {question.referenceAnswer || 'No reference answer provided.'}
                                  </p>
                                </div>
                                {!!question.keywords?.length && (
                                  <p className="text-xs text-[#555555]">
                                    <strong>Keywords:</strong> {question.keywords.join(', ')}
                                  </p>
                                )}
                                {!!question.rubric?.concepts.length && (
                                  <div>
                                    <p className="mb-2 text-xs font-semibold text-[#005461]">Marking rubric</p>
                                    <div className="space-y-2">
                                      {question.rubric.concepts.map((concept, conceptIndex) => (
                                        <div
                                          key={`${question.id}-rubric-${conceptIndex}`}
                                          className="rounded-lg border border-[#E8DCC8] bg-white px-3 py-2"
                                        >
                                          <div className="flex flex-wrap justify-between gap-2 text-sm">
                                            <strong className="text-[#1A1A1A]">{concept.name}</strong>
                                            <span className="font-semibold text-[#005461]">{concept.maxMarks} marks</span>
                                          </div>
                                          {concept.description && (
                                            <p className="mt-1 text-xs leading-5 text-[#555555]">{concept.description}</p>
                                          )}
                                          {!!concept.keywords.length && (
                                            <p className="mt-1 text-xs text-[#777777]">
                                              Keywords: {concept.keywords.join(', ')}
                                            </p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
