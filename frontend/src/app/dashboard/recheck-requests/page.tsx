'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Clock3, MessageSquare, RefreshCw } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { evaluationApi } from '@/lib/api';
import type { TeacherRecheckRequest } from '@/types';
import { formatDate } from '@/lib/utils';

export default function TeacherRecheckRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<TeacherRecheckRequest[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadRequests = useCallback(async () => {
    const items = await evaluationApi.getTeacherRecheckRequests();
    setRequests(items);
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/login');
      return;
    }
    const user = JSON.parse(storedUser) as { role?: string };
    if (user.role !== 'teacher') {
      router.push(user.role === 'admin' ? '/dashboard/admin' : '/dashboard/student');
      return;
    }
    loadRequests()
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : 'Unable to load recheck requests.'),
      )
      .finally(() => setLoading(false));
  }, [loadRequests, router]);

  const decide = async (request: TeacherRecheckRequest, decision: 'uphold' | 'revise') => {
    const comment = (comments[request.id] || '').trim();
    if (!comment) {
      setError('A comment is required for every recheck decision.');
      return;
    }
    const rawMark = marks[request.id] ?? String(request.originalMark);
    const mark = Number(rawMark);
    if (decision === 'revise' && (!rawMark.trim() || !Number.isFinite(mark) || mark < 0 || mark > request.maxMarks)) {
      setError(`Enter a revised mark between 0 and ${request.maxMarks}.`);
      return;
    }

    setBusyId(request.id);
    setError('');
    setNotice('');
    try {
      await evaluationApi.decideRecheckRequest(
        request.id,
        decision === 'uphold'
          ? { decision, comment }
          : { decision, comment, mark },
      );
      setRequests((current) => current.filter((item) => item.id !== request.id));
      setNotice(
        decision === 'uphold'
          ? `Original mark upheld for ${request.studentName}. The student has been notified.`
          : `Mark revised for ${request.studentName}. The published result and student notification have been updated.`,
      );
    } catch (decisionError: unknown) {
      setError(decisionError instanceof Error ? decisionError.message : 'Unable to resolve this request.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#1A1A1A]">Recheck Requests</h2>
          <p className="mt-1 text-sm text-[#666666]">
            Review the student&apos;s answer and justification, then uphold or revise the published mark.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            loadRequests()
              .catch((loadError: unknown) =>
                setError(loadError instanceof Error ? loadError.message : 'Unable to refresh requests.'),
              )
              .finally(() => setLoading(false));
          }}
        >
          <RefreshCw size={14} className="mr-2" /> Refresh
        </Button>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="mr-2 inline" />{error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 size={15} className="mr-2 inline" />{notice}
        </p>
      )}

      {loading ? (
        <Card><p className="py-10 text-center text-sm text-[#777777]">Loading recheck requests...</p></Card>
      ) : requests.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF8EB]">
              <MessageSquare size={21} className="text-[#005461]" />
            </div>
            <p className="font-semibold text-[#1A1A1A]">No pending requests</p>
            <p className="max-w-md text-sm text-[#777777]">
              Student requests for your published exams will appear here until you resolve them.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <Card key={request.id}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E8DCC8] pb-4">
                <div>
                  <p className="font-semibold text-[#1A1A1A]">{request.studentName}</p>
                  <p className="mt-1 text-sm text-[#666666]">
                    {request.rollNumber || 'No roll number'} · {request.studentEmail}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[#005461]">
                    {request.examTitle} · {request.subject}
                  </p>
                </div>
                <Badge variant="warning"><Clock3 size={12} className="mr-1" /> Pending</Badge>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-[#E8DCC8] bg-[#FFFDF8] p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#777777]">Question</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-[#1A1A1A]">
                    {request.questionText}
                  </p>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[#777777]">Student answer</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#444444]">
                    {request.studentAnswer || 'No answer was recorded.'}
                  </p>
                  {request.feedback && (
                    <>
                      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[#777777]">Original feedback</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#444444]">{request.feedback}</p>
                    </>
                  )}
                </div>
                <div className="space-y-4">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Original mark</p>
                    <p className="mt-1 text-2xl font-bold text-[#005461]">
                      {request.originalMark} <span className="text-base font-medium text-[#777777]">/ {request.maxMarks}</span>
                    </p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-800">Student justification</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#444444]">{request.justification}</p>
                    <p className="mt-3 text-xs text-[#777777]">Submitted {formatDate(request.createdAt)}</p>
                  </div>
                  <Input
                    label="Decision comment (required)"
                    value={comments[request.id] || ''}
                    onChange={(event) => setComments((current) => ({ ...current, [request.id]: event.target.value }))}
                    placeholder="Explain your decision to the student"
                    maxLength={2000}
                  />
                  <Input
                    label={`Revised mark (0–${request.maxMarks})`}
                    type="number"
                    min="0"
                    max={request.maxMarks}
                    step="0.01"
                    value={marks[request.id] ?? String(request.originalMark)}
                    onChange={(event) => setMarks((current) => ({ ...current, [request.id]: event.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      loading={busyId === request.id}
                      disabled={busyId !== null}
                      onClick={() => decide(request, 'uphold')}
                    >
                      Uphold original mark
                    </Button>
                    <Button
                      loading={busyId === request.id}
                      disabled={busyId !== null}
                      onClick={() => decide(request, 'revise')}
                    >
                      Revise mark
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
