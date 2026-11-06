'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, BookOpen, CheckCircle2, Clock3, GraduationCap } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { authApi } from '@/lib/api';
import type {
  EnrollmentOffering,
  PublishedStudentResult,
  StudentEnrollment,
  User,
} from '@/types';
import { formatDate } from '@/lib/utils';

const enrollmentStatusVariant = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
} as const;

export default function StudentDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [offerings, setOfferings] = useState<EnrollmentOffering[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [results, setResults] = useState<PublishedStudentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestingTeacherId, setRequestingTeacherId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadStudentData = useCallback(async () => {
    const [userResult, enrollmentResult, resultsResult] = await Promise.allSettled([
      authApi.getCurrentUser(),
      authApi.getEnrollmentOptions(),
      authApi.getPublishedStudentResults(),
    ]);

    const loadErrors: string[] = [];
    if (userResult.status === 'fulfilled') {
      setUser(userResult.value);
    } else {
      loadErrors.push(
        userResult.reason instanceof Error
          ? userResult.reason.message
          : 'Unable to refresh your account details.',
      );
    }
    if (enrollmentResult.status === 'fulfilled') {
      setOfferings(enrollmentResult.value.offerings);
      setEnrollments(enrollmentResult.value.enrollments);
    } else {
      setOfferings([]);
      setEnrollments([]);
      loadErrors.push(
        enrollmentResult.reason instanceof Error
          ? `Available teacher subjects could not be loaded: ${enrollmentResult.reason.message}`
          : 'Available teacher subjects could not be loaded.',
      );
    }
    if (resultsResult.status === 'fulfilled') {
      setResults(resultsResult.value);
    } else {
      setResults([]);
      loadErrors.push(
        resultsResult.reason instanceof Error
          ? `Published results could not be loaded: ${resultsResult.reason.message}`
          : 'Published results could not be loaded.',
      );
    }
    setError(loadErrors.join(' '));
  }, []);

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
    loadStudentData()
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load student account data.');
      })
      .finally(() => setLoading(false));
  }, [loadStudentData, router]);

  const requestEnrollment = async (offering: EnrollmentOffering) => {
    setRequestingTeacherId(offering.teacherId);
    setError('');
    setNotice('');
    try {
      const response = await authApi.createStudentEnrollment(
        offering.teacherId,
        offering.subject,
      );
      await loadStudentData();
      setNotice(response.message);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to submit the subject enrollment request.',
      );
    } finally {
      setRequestingTeacherId(null);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A1A]">Welcome back, {user.fullName}</h2>
        <p className="mt-1 text-sm text-[#888888]">
          Your account and assessment results are linked to your assigned roll number.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle size={15} className="mr-2 inline" />{error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FFF8EB]">
              <GraduationCap size={18} className="text-[#005461]" />
            </div>
            <div>
              <p className="text-xs uppercase text-[#888888]">Student roll number</p>
              <p className="text-sm font-semibold text-[#1A1A1A]">{user.rollNumber || 'Not assigned'}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FFF8EB]">
              <Clock3 size={18} className="text-[#005461]" />
            </div>
            <div>
              <p className="text-xs uppercase text-[#888888]">Account status</p>
              <p className="text-sm font-semibold text-[#1A1A1A]">{user.status || 'APPROVED'}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FFF8EB]">
              <BookOpen size={18} className="text-[#005461]" />
            </div>
            <div>
              <p className="text-xs uppercase text-[#888888]">Published results</p>
              <p className="text-sm font-semibold text-[#1A1A1A]">{results.length}</p>
            </div>
          </div>
        </Card>
      </div>

      {!loading && !user.rollNumber && (
        <Card>
          <p className="text-sm text-amber-800">
            Your administrator must assign a roll number before subject enrollment or result matching is available.
          </p>
        </Card>
      )}

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#1A1A1A]">My subject enrollments</h3>
          <p className="mt-1 text-sm text-[#666666]">
            Choose an available teacher and subject. The teacher must approve your request before you are enrolled.
          </p>
        </div>
        {loading ? (
          <Card><p className="py-8 text-center text-sm text-[#888888]">Loading subjects...</p></Card>
        ) : offerings.length === 0 ? (
          <Card>
            <p className="py-8 text-center text-sm text-[#888888]">
              No teacher subjects are available yet. An approved teacher must have subjects assigned by the administrator or have created an exam for that subject.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {offerings.map((offering) => {
              const existing = enrollments.find(
                (enrollment) => enrollment.subject === offering.subject,
              );
              const isUnavailable = existing?.status === 'PENDING' || existing?.status === 'APPROVED';
              return (
                <Card key={`${offering.teacherId}-${offering.subject}`} padding="sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#1A1A1A]">{offering.subject}</p>
                      <p className="mt-1 text-sm text-[#666666]">Teacher: {offering.teacherName}</p>
                      {existing?.status === 'REJECTED' && existing.rejectionReason && (
                        <p className="mt-2 text-xs text-red-700">Previous request: {existing.rejectionReason}</p>
                      )}
                    </div>
                    {isUnavailable ? (
                      <Badge variant={enrollmentStatusVariant[existing.status]}>
                        {existing.status === 'PENDING' ? 'Request pending' : 'Enrolled'}
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!user.rollNumber || !!requestingTeacherId}
                        loading={requestingTeacherId === offering.teacherId}
                        onClick={() => requestEnrollment(offering)}
                      >
                        {existing?.status === 'REJECTED' ? 'Request again' : 'Request enrollment'}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
        {!!enrollments.length && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-[#1A1A1A]">My requests</h4>
            {enrollments.map((enrollment) => (
              <div key={enrollment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E8DCC8] bg-white px-4 py-3">
                <p className="text-sm text-[#1A1A1A]">
                  {enrollment.subject} <span className="text-[#888888]">with {enrollment.teacherName}</span>
                </p>
                <Badge variant={enrollmentStatusVariant[enrollment.status]}>{enrollment.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-[#1A1A1A]">My published results</h3>
          <p className="mt-1 text-sm text-[#666666]">
            Results are matched to your roll number: <strong>{user.rollNumber || 'not assigned'}</strong>.
          </p>
        </div>
        {loading ? (
          <Card><p className="py-8 text-center text-sm text-[#888888]">Loading published results...</p></Card>
        ) : results.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-2 py-8 text-center">
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
      </section>

      <Button variant="secondary" onClick={() => router.push('/dashboard')}>
        Go to dashboard overview
      </Button>
    </div>
  );
}
