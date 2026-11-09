'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import { authApi } from '@/lib/api';
import type { PublishedStudentResult, User } from '@/types';
import { formatDate } from '@/lib/utils';

export default function StudentResultsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [results, setResults] = useState<PublishedStudentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

    Promise.all([authApi.getCurrentUser(), authApi.getPublishedStudentResults()])
      .then(([currentUser, studentResults]) => {
        setUser(currentUser);
        setResults(studentResults);
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load your published results.');
      })
      .finally(() => setLoading(false));
  }, [router]);

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
