'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Clock3, MessageSquare } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { authApi } from '@/lib/api';
import type { PublishedStudentResult, User, UserNotification } from '@/types';
import { formatDate } from '@/lib/utils';

export default function StudentResultsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [results, setResults] = useState<PublishedStudentResult[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
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
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh your results and notifications.');
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

  const submitRequest = async (answerEntryId: string) => {
    const justification = (justifications[answerEntryId] || '').trim();
    if (justification.length < 50) {
      setError('Please provide at least 50 characters explaining why this answer should be rechecked.');
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

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-bold text-[#1A1A1A]">My Results</h2>
        <p className="mt-1 text-sm text-[#666666]">
          Published results matched to your roll number: <strong>{user.rollNumber || 'not assigned'}</strong>.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle size={15} className="mr-2 inline" />{error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 size={15} className="mr-2 inline" />{notice}
        </p>
      )}

      {!!notifications.length && (
        <section className="space-y-3" aria-label="Notifications">
          <h3 className="text-sm font-semibold text-[#1A1A1A]">Notifications</h3>
          {notifications.map((notification) => (
            <Card key={notification.id} padding="sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#005461]">{notification.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#444444]">{notification.message}</p>
                  <p className="mt-2 text-xs text-[#888888]">{formatDate(notification.createdAt)}</p>
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
        </section>
      )}

      {loading ? (
        <Card><p className="py-8 text-center text-sm text-[#888888]">Loading published results...</p></Card>
      ) : results.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 size={24} className="text-[#005461]" />
            <p className="text-sm font-medium text-[#1A1A1A]">No published results yet</p>
            <p className="text-xs text-[#888888]">
              When a teacher publishes a paper recorded under your roll number, it will appear here.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {results.map((result) => (
            <Card key={`${result.examId}-${result.rollNumber}`} padding="sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[#1A1A1A]">{result.examTitle}</p>
                  <p className="mt-1 text-sm text-[#666666]">
                    {result.subject} · {result.term} · Roll no: {result.rollNumber}
                  </p>
                  <p className="mt-1 text-xs text-[#888888]">
                    Published {result.publishedAt ? formatDate(result.publishedAt) : 'recently'}
                  </p>
                  <p className="mt-1 text-xs text-[#666666]">
                    Recheck deadline:{' '}
                    <strong>
                      {result.recheckDeadline ? new Date(result.recheckDeadline).toLocaleString() : 'Not configured'}
                    </strong>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-[#005461]">
                    {result.totalMarks ?? '—'} / {result.maxMarks}
                  </p>
                  <p className="text-xs text-[#888888]">Final score</p>
                </div>
              </div>
              {!!result.questions.length && (
                <div className="mt-4 space-y-3 border-t border-[#E8DCC8] pt-3">
                  {result.questions.map((question, index) => (
                    <div
                      key={`${result.examId}-question-${index}`}
                      className="rounded-xl border border-[#E8DCC8] bg-[#FFFDF8] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <p className="min-w-0 flex-1 text-sm font-semibold text-[#1A1A1A]">
                          <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#005461] text-xs text-white">
                            {index + 1}
                          </span>
                          {question.questionText}
                        </p>
                        <span className="rounded-lg border border-[#E8DCC8] bg-white px-3 py-1.5 text-sm font-bold text-[#005461]">
                          {question.mark ?? '—'} / {question.maxMarks}
                        </span>
                      </div>
                      <div className="mt-3 rounded-lg border border-[#E8DCC8] bg-white px-3 py-3">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#888888]">
                          Your answer
                        </p>
                        <p className="whitespace-pre-wrap text-sm leading-6 text-[#444444]">
                          {question.studentAnswer || 'No answer was extracted for this question.'}
                        </p>
                      </div>
                      {question.feedback && (
                        <p className="mt-2 text-xs leading-5 text-[#666666]">
                          <span className="font-semibold text-[#005461]">Feedback:</span>{' '}
                          {question.feedback}
                        </p>
                      )}
                      {question.recheckRequest ? (
                        <div className={`mt-3 rounded-lg border px-3 py-3 text-sm ${
                          question.recheckRequest.status === 'pending'
                            ? 'border-amber-200 bg-amber-50 text-amber-900'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        }`}>
                          <p className="font-semibold">
                            {question.recheckRequest.status === 'pending'
                              ? 'Recheck request pending'
                              : question.recheckRequest.status === 'upheld'
                                ? 'Original mark upheld'
                                : 'Mark revised'}
                          </p>
                          {question.recheckRequest.status !== 'pending' && question.recheckRequest.decisionComment && (
                            <p className="mt-1">Teacher comment: {question.recheckRequest.decisionComment}</p>
                          )}
                        </div>
                      ) : result.recheckDeadline &&
                        Date.now() <= new Date(result.recheckDeadline).getTime() ? (
                        <div className="mt-3">
                          {openEntryId === question.answerEntryId ? (
                            <div className="space-y-2 rounded-lg border border-[#E8DCC8] bg-[#FFFDF8] p-3">
                              <label className="block text-xs font-semibold text-[#1A1A1A]" htmlFor={`recheck-${question.answerEntryId}`}>
                                Explain the reason for your request (at least 50 characters)
                              </label>
                              <textarea
                                id={`recheck-${question.answerEntryId}`}
                                value={justifications[question.answerEntryId] || ''}
                                onChange={(event) => setJustifications((current) => ({
                                  ...current,
                                  [question.answerEntryId]: event.target.value,
                                }))}
                                rows={4}
                                maxLength={3000}
                                className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#005461]"
                                placeholder="Point out which part of your answer may have been overlooked and explain why it merits review."
                              />
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className={`text-xs ${
                                  (justifications[question.answerEntryId] || '').trim().length < 50
                                    ? 'text-amber-700'
                                    : 'text-emerald-700'
                                }`}>
                                  {(justifications[question.answerEntryId] || '').trim().length}/50 minimum characters
                                </span>
                                <div className="flex gap-2">
                                  <Button variant="ghost" size="sm" onClick={() => setOpenEntryId(null)}>
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    loading={submittingEntryId === question.answerEntryId}
                                    disabled={(justifications[question.answerEntryId] || '').trim().length < 50 || submittingEntryId !== null}
                                    onClick={() => submitRequest(question.answerEntryId)}
                                  >
                                    Submit request
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
                              <MessageSquare size={14} className="mr-2" />
                              Request a recheck
                            </Button>
                          )}
                        </div>
                      ) : (
                        <p className="mt-3 flex items-center gap-1 text-xs text-[#888888]">
                          <Clock3 size={13} /> Recheck requests are closed.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
