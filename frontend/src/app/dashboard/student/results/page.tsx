'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileCheck,
  FileText,
  GraduationCap,
  HelpCircle,
  MessageSquare,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { authApi } from '@/lib/api';
import type { PublishedStudentResult, User, UserNotification } from '@/types';
import { cn, formatDate } from '@/lib/utils';

const formatScore = (val: number | string | null | undefined): string => {
  if (val === null || val === undefined || val === '') return '—';
  const num = Number(val);
  if (!Number.isFinite(num)) return '—';
  const rounded = Math.round(num * 100) / 100;
  return rounded.toString();
};

export default function StudentResultsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [results, setResults] = useState<PublishedStudentResult[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [expandedExamIds, setExpandedExamIds] = useState<Set<string>>(new Set());
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [justifications, setJustifications] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submittingEntryId, setSubmittingEntryId] = useState<string | null>(null);
  const [markingNotificationId, setMarkingNotificationId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshResultsAndNotifications = useCallback(async () => {
    try {
      const [studentResults, studentNotifications] = await Promise.all([
        authApi.getPublishedStudentResults(),
        authApi.getNotifications(),
      ]);
      setResults(studentResults);
      setNotifications(studentNotifications);
      setError('');
    } catch (refreshError: unknown) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Unable to refresh your results and notifications.',
      );
    }
  }, []);

  useEffect(() => {
    const rawUser = localStorage.getItem('user');
    if (!rawUser) {
      router.push('/login');
      return;
    }

    const storedUser = JSON.parse(rawUser) as User;
    if (storedUser.role !== 'student') {
      router.push('/dashboard');
      return;
    }
    setUser(storedUser);

    Promise.all([
      authApi.getCurrentUser(),
      authApi.getPublishedStudentResults(),
      authApi.getNotifications(),
    ])
      .then(([currentUser, studentResults, studentNotifications]) => {
        setUser(currentUser);
        setResults(studentResults);
        setNotifications(studentNotifications);
        // By default, if there are results, expand the first one so the student sees answers right away
        if (studentResults.length > 0) {
          setExpandedExamIds(new Set([studentResults[0].examId]));
        }
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load your published results.');
      })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (loading || !user) return;
    const refresh = () => void refreshResultsAndNotifications();
    const intervalId = window.setInterval(refresh, 30000);
    window.addEventListener('autograde:notifications-updated', refresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('autograde:notifications-updated', refresh);
    };
  }, [loading, refreshResultsAndNotifications, user]);

  const toggleExamExpand = (examId: string) => {
    setExpandedExamIds((prev) => {
      const next = new Set(prev);
      if (next.has(examId)) {
        next.delete(examId);
      } else {
        next.add(examId);
      }
      return next;
    });
  };

  const submitRequest = async (answerEntryId: string) => {
    const justification = (justifications[answerEntryId] || '').trim();
    if (justification.length < 10) {
      setError('Please provide at least 10 characters explaining why this answer should be rechecked.');
      return;
    }
    setSubmittingEntryId(answerEntryId);
    setError('');
    setNotice('');
    try {
      const response = await authApi.createRecheckRequest(answerEntryId, justification);
      setNotice(response.message);
      setOpenEntryId(null);
      const updatedResults = await authApi.getPublishedStudentResults();
      setResults(updatedResults);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to submit your recheck request.');
    } finally {
      setSubmittingEntryId(null);
    }
  };

  const markNotificationRead = async (notification: UserNotification) => {
    setMarkingNotificationId(notification.id);
    setError('');
    try {
      await authApi.markNotificationRead(notification.id);
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item,
        ),
      );
      window.dispatchEvent(new Event('autograde:notifications-updated'));
    } catch (notificationError: unknown) {
      setError(notificationError instanceof Error ? notificationError.message : 'Unable to update notification.');
    } finally {
      setMarkingNotificationId(null);
    }
  };

  if (!user) return null;

  // Calculate summary statistics
  const totalExams = results.length;
  const totalScore = results.reduce((acc, r) => acc + (typeof r.totalMarks === 'number' ? r.totalMarks : 0), 0);
  const totalMax = results.reduce((acc, r) => acc + r.maxMarks, 0);
  const averagePercentage = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  const totalQuestions = results.reduce((acc, r) => acc + r.questions.length, 0);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E8DCC8] pb-4">
        <div>
          <h2 className="text-2xl font-bold text-[#1A1A1A]">My Exam Results</h2>
          <p className="mt-1 text-sm text-[#666666]">
            Published marks, rubric feedback, and recheck requests matched to roll number:{' '}
            <strong className="text-[#005461]">{user.rollNumber || 'not assigned'}</strong>
          </p>
        </div>
        {totalExams > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (expandedExamIds.size === results.length) {
                  setExpandedExamIds(new Set());
                } else {
                  setExpandedExamIds(new Set(results.map((r) => r.examId)));
                }
              }}
            >
              {expandedExamIds.size === results.length ? 'Collapse all' : 'Expand all'}
            </Button>
          </div>
        )}
      </div>

      {/* Notifications and Alerts */}
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{notice}</span>
        </p>
      )}

      {/* Notifications Drawer */}
      {!!notifications.length && (
        <section className="space-y-3" aria-label="Notifications">
          <h3 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
            <MessageSquare size={15} className="text-[#005461]" />
            Recent Updates & Recheck Notifications
          </h3>
          <div className="space-y-2">
            {notifications.map((notification) => (
              <Card key={notification.id} padding="sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#005461]">{notification.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#444444]">{notification.message}</p>
                    <p className="mt-1 text-xs text-[#888888]">{formatDate(notification.createdAt)}</p>
                  </div>
                  {!notification.readAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={markingNotificationId === notification.id}
                      disabled={markingNotificationId !== null}
                      onClick={() => markNotificationRead(notification)}
                    >
                      Mark as read
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Summary Stats Overview */}
      {!loading && totalExams > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-[#E8DCC8] bg-white p-4 shadow-sm flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F0F8FA] text-[#005461]">
              <FileCheck size={20} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[#888888]">Published Exams</p>
              <p className="text-xl font-bold text-[#1A1A1A]">{totalExams}</p>
            </div>
          </div>

          <div className="rounded-xl border border-[#E8DCC8] bg-white p-4 shadow-sm flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Award size={20} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[#888888]">Average Performance</p>
              <p className="text-xl font-bold text-emerald-800">{averagePercentage}%</p>
            </div>
          </div>

          <div className="rounded-xl border border-[#E8DCC8] bg-white p-4 shadow-sm flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <BookOpen size={20} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[#888888]">Evaluated Questions</p>
              <p className="text-xl font-bold text-[#1A1A1A]">{totalQuestions}</p>
            </div>
          </div>
        </div>
      )}

      {/* Results Content */}
      {loading ? (
        <Card>
          <div className="py-12 text-center text-sm text-[#888888] flex flex-col items-center gap-2">
            <Clock3 size={24} className="animate-spin text-[#005461]" />
            <p>Loading your published results...</p>
          </div>
        </Card>
      ) : results.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <div className="h-12 w-12 rounded-full bg-[#F0F8FA] flex items-center justify-center text-[#005461] mb-1">
              <CheckCircle2 size={24} />
            </div>
            <p className="text-base font-semibold text-[#1A1A1A]">No published exam results yet</p>
            <p className="text-sm text-[#888888] max-w-md">
              When an instructor publishes marked answer sheets for roll number <strong>{user.rollNumber}</strong>, your grades, question answers, and feedback will appear here in detailed cards.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {results.map((result) => {
            const isExpanded = expandedExamIds.has(result.examId);
            const scoreNum = typeof result.totalMarks === 'number' ? result.totalMarks : 0;
            const percentage = result.maxMarks > 0 ? Math.round((scoreNum / result.maxMarks) * 100) : 0;
            const isRecheckOpen =
              result.recheckDeadline && Date.now() <= new Date(result.recheckDeadline).getTime();

            return (
              <div
                key={`${result.examId}-${result.rollNumber}`}
                className={cn(
                  'rounded-2xl border transition-all duration-200 overflow-hidden shadow-sm bg-white',
                  isExpanded ? 'border-[#005461] ring-1 ring-[#005461]/20' : 'border-[#E8DCC8] hover:border-[#005461]/50'
                )}
              >
                {/* Tile Header (Clickable) */}
                <div
                  className="cursor-pointer p-5 transition-colors hover:bg-[#FFFDF8]"
                  onClick={() => toggleExamExpand(result.examId)}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    {/* Left: Exam Info */}
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E8DCC8]/60 text-[#005461]">
                          {result.subject}
                        </span>
                        <span className="text-xs text-[#888888] font-medium">
                          {result.term}
                        </span>
                        {isRecheckOpen ? (
                          <Badge variant="amber" className="text-[11px]">
                            <Clock3 size={10} className="mr-1 inline" />
                            Recheck open until {new Date(result.recheckDeadline!).toLocaleDateString()}
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-[#888888] bg-[#F5EFE6] px-2 py-0.5 rounded-full">
                            Recheck closed
                          </span>
                        )}
                      </div>

                      <h3 className="text-lg font-bold text-[#1A1A1A]">
                        {result.examTitle}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#777777]">
                        <span>Roll: <strong className="text-[#1A1A1A]">{result.rollNumber}</strong></span>
                        <span>•</span>
                        <span>Questions: <strong>{result.questions.length}</strong></span>
                        <span>•</span>
                        <span>
                          Published: {result.publishedAt ? formatDate(result.publishedAt) : 'Recently'}
                        </span>
                      </div>
                    </div>

                    {/* Right: Score Tile & Expand Button */}
                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-3 sm:pt-0 border-t border-[#E8DCC8]/40 sm:border-t-0">
                      <div className="text-right">
                        <div className="flex items-baseline justify-end gap-1.5">
                          <span className="text-2xl font-black text-[#005461]">
                            {formatScore(result.totalMarks)}
                          </span>
                          <span className="text-sm font-semibold text-[#888888]">
                            / {result.maxMarks}
                          </span>
                        </div>
                        <div className="flex items-center justify-end gap-1.5 mt-0.5">
                          <span
                            className={cn(
                              'text-xs font-bold px-2 py-0.5 rounded-full',
                              percentage >= 70
                                ? 'bg-emerald-100 text-emerald-800'
                                : percentage >= 50
                                ? 'bg-blue-100 text-[#005461]'
                                : percentage >= 40
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                            )}
                          >
                            {percentage}%
                          </span>
                          <span className="text-[11px] text-[#888888]">Final mark</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-center h-9 w-9 rounded-xl border border-[#E8DCC8] bg-white text-[#005461] transition-transform">
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar Line */}
                  <div className="mt-4 h-1.5 w-full bg-[#F5EFE6] rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full transition-all duration-500 rounded-full',
                        percentage >= 70
                          ? 'bg-emerald-500'
                          : percentage >= 50
                          ? 'bg-[#005461]'
                          : percentage >= 40
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      )}
                      style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
                    />
                  </div>
                </div>

                {/* Expanded Details & Questions Accordion Content */}
                {isExpanded && (
                  <div className="border-t border-[#E8DCC8] bg-[#FAF8F5] p-5 space-y-4">
                    {/* Recheck Information Banner */}
                    <div className="rounded-xl border border-[#E8DCC8] bg-white p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 text-[#444444]">
                        <Clock3 size={15} className="text-[#005461] shrink-0" />
                        <span>
                          Recheck Deadline:{' '}
                          <strong className="text-[#1A1A1A]">
                            {result.recheckDeadline ? new Date(result.recheckDeadline).toLocaleString() : 'Not configured'}
                          </strong>
                        </span>
                      </div>
                      <div className="text-[#666666]">
                        {isRecheckOpen ? (
                          <span className="text-emerald-700 font-medium">
                            ✓ You can request a recheck on individual answers below until the deadline.
                          </span>
                        ) : (
                          <span className="text-[#888888]">
                            The window to request rechecks for this exam has passed.
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Question Breakdown Heading */}
                    <div className="flex items-center justify-between pt-1">
                      <h4 className="text-sm font-bold text-[#1A1A1A] uppercase tracking-wider flex items-center gap-2">
                        <FileText size={15} className="text-[#005461]" />
                        Questions & Evaluated Answers ({result.questions.length})
                      </h4>
                      <span className="text-xs text-[#888888]">
                        Click &quot;Request a recheck&quot; to contest any individual question score.
                      </span>
                    </div>

                    {/* Questions Cards List */}
                    <div className="space-y-3">
                      {result.questions.map((question, index) => {
                        const isMCQ = question.maxMarks === 1;
                        const isFullScore = typeof question.mark === 'number' && question.mark === question.maxMarks;
                        const isZeroScore = typeof question.mark === 'number' && question.mark === 0;

                        return (
                          <div
                            key={`${result.examId}-q-${index}`}
                            className="rounded-xl border border-[#E8DCC8] bg-white p-4 shadow-sm space-y-3 transition-all hover:border-[#CBD5E1]"
                          >
                            {/* Question Title & Mark Pill */}
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                  <span className="inline-flex h-6 px-2.5 items-center justify-center rounded-md bg-[#005461] text-xs font-bold text-white">
                                    Q{index + 1}
                                  </span>
                                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#888888] bg-[#F5EFE6] px-2 py-0.5 rounded">
                                    {isMCQ ? 'Multiple Choice' : 'Theory / Descriptive'}
                                  </span>
                                </div>
                                <p className="text-sm font-semibold text-[#1A1A1A] leading-snug">
                                  {question.questionText}
                                </p>
                              </div>

                              <div className="shrink-0 text-right">
                                <span
                                  className={cn(
                                    'inline-flex items-center px-3 py-1 rounded-lg text-sm font-black border',
                                    isFullScore
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : isZeroScore
                                      ? 'bg-red-50 text-red-800 border-red-200'
                                      : 'bg-[#FFF8EB] text-[#005461] border-[#E8DCC8]'
                                  )}
                                >
                                  {formatScore(question.mark)} / {question.maxMarks}
                                </span>
                              </div>
                            </div>

                            {/* Student Answer Box */}
                            <div className="rounded-lg border border-[#E8DCC8] bg-[#FAFAFA] p-3">
                              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#888888]">
                                Your Submitted Answer
                              </p>
                              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#2D3748] font-normal">
                                {question.studentAnswer || 'No answer extracted for this question.'}
                              </p>
                            </div>

                            {/* Feedback Box */}
                            {question.feedback && (
                              <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 p-3 text-xs leading-relaxed text-[#5C4813]">
                                <span className="font-bold text-[#8D6B12] block mb-0.5">
                                  💡 Rubric & Evaluation Feedback:
                                </span>
                                {question.feedback}
                              </div>
                            )}

                            {/* Recheck Status / Request Action */}
                            <div className="pt-1">
                              {question.recheckRequest ? (
                                <div
                                  className={cn(
                                    'rounded-lg border p-3 text-xs',
                                    question.recheckRequest.status === 'pending'
                                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                                      : question.recheckRequest.status === 'revised'
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                      : 'border-slate-200 bg-slate-50 text-slate-800'
                                  )}
                                >
                                  <div className="flex items-center gap-1.5 font-bold">
                                    <Clock3 size={13} />
                                    <span>
                                      {question.recheckRequest.status === 'pending'
                                        ? 'Recheck Request Pending Teacher Review'
                                        : question.recheckRequest.status === 'upheld'
                                        ? 'Recheck Resolved — Original Mark Upheld'
                                        : 'Recheck Resolved — Mark Revised by Teacher'}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-[#555555]">
                                    <strong>Your reason:</strong> {question.recheckRequest.justification}
                                  </p>
                                  {question.recheckRequest.decisionComment && (
                                    <p className="mt-1 font-medium text-[#1A1A1A]">
                                      <strong>Teacher decision comment:</strong>{' '}
                                      {question.recheckRequest.decisionComment}
                                    </p>
                                  )}
                                </div>
                              ) : isRecheckOpen ? (
                                <div>
                                  {openEntryId === question.answerEntryId ? (
                                    <div className="space-y-3 rounded-xl border border-[#005461]/30 bg-[#FFFDF8] p-3.5">
                                      <div className="flex items-center justify-between">
                                        <label
                                          className="block text-xs font-bold text-[#005461]"
                                          htmlFor={`recheck-${question.answerEntryId}`}
                                        >
                                          Explain why this question merits a recheck (minimum 10 characters):
                                        </label>
                                        <button
                                          type="button"
                                          onClick={() => setOpenEntryId(null)}
                                          className="text-xs text-[#888888] hover:text-[#1A1A1A]"
                                        >
                                          <X size={15} />
                                        </button>
                                      </div>

                                      <textarea
                                        id={`recheck-${question.answerEntryId}`}
                                        value={justifications[question.answerEntryId] || ''}
                                        onChange={(event) =>
                                          setJustifications((current) => ({
                                            ...current,
                                            [question.answerEntryId]: event.target.value,
                                          }))
                                        }
                                        rows={3}
                                        maxLength={3000}
                                        className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#1A1A1A] placeholder:text-[#999999] focus:outline-none focus:ring-2 focus:ring-[#005461]"
                                        placeholder="e.g. Please re-evaluate line 2 where I explained the difference between supervised and unsupervised learning."
                                      />

                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span
                                          className={cn(
                                            'text-xs font-medium',
                                            (justifications[question.answerEntryId] || '').trim().length < 10
                                              ? 'text-amber-700'
                                              : 'text-emerald-700'
                                          )}
                                        >
                                          {(justifications[question.answerEntryId] || '').trim().length} / 10 minimum characters
                                        </span>
                                        <div className="flex gap-2">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setOpenEntryId(null)}
                                            disabled={submittingEntryId !== null}
                                          >
                                            Cancel
                                          </Button>
                                          <Button
                                            size="sm"
                                            loading={submittingEntryId === question.answerEntryId}
                                            disabled={
                                              (justifications[question.answerEntryId] || '').trim().length < 10 ||
                                              submittingEntryId !== null
                                            }
                                            onClick={() => submitRequest(question.answerEntryId)}
                                          >
                                            <Send size={13} className="mr-1.5" />
                                            Submit Request
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => {
                                        setError('');
                                        setOpenEntryId(question.answerEntryId);
                                      }}
                                    >
                                      <MessageSquare size={13} className="mr-1.5 text-[#005461]" />
                                      Request a recheck
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <p className="flex items-center gap-1 text-xs text-[#888888]">
                                  <Clock3 size={13} /> Recheck requests closed for this paper.
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
