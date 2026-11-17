'use client';

import { Suspense } from 'react';
import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Flag,
  Loader,
  Maximize2,
  ScanLine,
  TrendingDown,
  MessageSquare,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import { evaluationApi, examApi } from '@/lib/api';
import type {
  AnswerEntry,
  StudentResult,
  Exam,
  SimilarityFlag,
  SimilarityReport,
} from '@/types';
import { cn, getConfidenceLabel } from '@/lib/utils';

const confidenceVariant = (confidence: number): 'default' | 'success' | 'warning' | 'danger' | 'info' | 'amber' => {
  if (confidence >= 0.75) return 'success';
  if (confidence >= 0.50) return 'amber';
  return 'danger';
};

function AIReviewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const examId = searchParams.get('examId');

  const [exam, setExam] = useState<Exam | null>(null);
  const [results, setResults] = useState<StudentResult[]>([]);
  const [similarities, setSimilarities] = useState<SimilarityFlag[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [markDrafts, setMarkDrafts] = useState<Record<string, string>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [reviewingEntryId, setReviewingEntryId] = useState<string | null>(null);
  const [completingResultId, setCompletingResultId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [recheckDeadline, setRecheckDeadline] = useState('');
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [filter, setFilter] = useState<'all' | 'flagged' | 'high-similarity'>('all');
  const [omrImageUrl, setOmrImageUrl] = useState<string | null>(null);
  const [omrImageLoading, setOmrImageLoading] = useState(false);
  const [omrImageError, setOmrImageError] = useState('');
  const [omrModalOpen, setOmrModalOpen] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const [showGraceModal, setShowGraceModal] = useState(false);
  const [graceMarksValue, setGraceMarksValue] = useState('2');
  const [graceTarget, setGraceTarget] = useState<'all' | 'selected'>('all');
  const [applyingGrace, setApplyingGrace] = useState(false);

  useEffect(() => {
    const rawUser = localStorage.getItem('user');
    if (!rawUser) {
      router.push('/login');
      return;
    }

    const parsed = JSON.parse(rawUser) as { role?: string };
    if (parsed.role !== 'teacher') {
      router.push(parsed.role === 'admin' ? '/dashboard/admin' : parsed.role === 'student' ? '/dashboard/student' : '/login');
    }
  }, [router]);

  useEffect(() => {
    if (!examId) return;

    setLoading(true);
    Promise.all([
      examApi.getById(examId),
      evaluationApi.getResults(examId),
    ])
      .then(([examData, resultsData]) => {
        setExam(examData);
        setRecheckDeadline('');
        if (examData.recheckDeadline) {
          const isPast = new Date(examData.recheckDeadline).getTime() <= Date.now();
          const targetDate = isPast
            ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            : new Date(examData.recheckDeadline);
          targetDate.setMinutes(targetDate.getMinutes() - targetDate.getTimezoneOffset());
          setRecheckDeadline(targetDate.toISOString().slice(0, 16));
        } else {
          const defaultFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          defaultFuture.setMinutes(defaultFuture.getMinutes() - defaultFuture.getTimezoneOffset());
          setRecheckDeadline(defaultFuture.toISOString().slice(0, 16));
        }
        const awaiting = resultsData.filter((r) => r.status === 'awaiting_approval');
        setResults(awaiting);
        if (awaiting.length > 0) {
          setSelectedStudentId((prev) => prev ?? awaiting[0].answersheetId);
        }
      })
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load review data.',
        ),
      )
      .finally(() => setLoading(false));

    evaluationApi.getSimilarityFlags(examId)
      .then((similarityData) => {
        // Backend returns { examId, summary, flaggedPairs }
        if (Array.isArray(similarityData)) {
          setSimilarities(similarityData);
        } else if (similarityData && Array.isArray((similarityData as SimilarityReport).flaggedPairs)) {
          setSimilarities((similarityData as SimilarityReport).flaggedPairs);
        } else {
          setSimilarities([]);
        }
      })
      .catch((similarityError: unknown) =>
        setError(
          similarityError instanceof Error
            ? similarityError.message
            : 'Failed to load similarity data.',
        ),
      );
  }, [examId]);

  const handleReviewEntry = async (
    entry: AnswerEntry,
    action: 'approve' | 'override',
  ) => {
    setError('');
    setNotice('');
    let payload: { action: 'approve'; approvalComment?: string } | {
      action: 'override';
      mark: number;
      comment?: string;
    };
    if (action === 'override') {
      const mark = Number(markDrafts[entry.id] ?? entry.approvedMark ?? entry.aiMark);
      const rawComment = (commentDrafts[entry.id] || '').trim();
      if (!Number.isFinite(mark) || mark < 0 || mark > entry.maxMarks) {
        setError(`Enter a revised mark between 0 and ${entry.maxMarks}.`);
        return;
      }
      const comment = rawComment || 'Teacher revised mark';
      payload = { action: 'override', mark, comment };
    } else {
      payload = { action: 'approve' };
    }

    setReviewingEntryId(entry.id);
    try {
      await evaluationApi.reviewAnswerEntry(examId!, entry.id, payload);
      const refreshedResults = await evaluationApi.getResults(examId!);
      setResults(refreshedResults.filter((result) => result.status === 'awaiting_approval'));
      setNotice(
        action === 'approve'
          ? 'AI mark approved and recorded.'
          : 'Revised mark saved and recorded.',
      );
    } catch (reviewError: unknown) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : 'Unable to record the review decision.',
      );
    } finally {
      setReviewingEntryId(null);
    }
  };

  const handlePublish = async () => {
    if (!examId || !hasDonePapers) return;

    if (!isDeadlineValid) {
      const shouldAutoExtend = window.confirm(
        'The student recheck deadline has passed (or is not set). Would you like to automatically extend the deadline by 7 days from now and publish results immediately?'
      );
      if (!shouldAutoExtend) return;

      setPublishing(true);
      setError('');
      setNotice('');
      try {
        const autoDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const updatedExam = await examApi.updateRecheckDeadline(examId, autoDeadline.toISOString());
        setExam(updatedExam);
        const localDate = new Date(autoDeadline);
        localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
        setRecheckDeadline(localDate.toISOString().slice(0, 16));
      } catch (deadlineError: unknown) {
        setError(
          deadlineError instanceof Error
            ? deadlineError.message
            : 'Unable to update recheck deadline prior to publishing.',
        );
        setPublishing(false);
        return;
      }
    } else {
      if (!window.confirm('Publish all papers marked done for this exam to students?')) return;
      setPublishing(true);
      setError('');
      setNotice('');
    }

    try {
      const result = await evaluationApi.publishResults(examId);
      const refreshedResults = await evaluationApi.getResults(examId);
      setResults(refreshedResults.filter((item) => item.status === 'awaiting_approval'));
      setSelectedStudentId(null);
      if (result.examCompleted) {
        setExam((current) =>
          current
            ? { ...current, status: 'published', publishedAt: result.publishedAt }
            : current,
        );
      }
      setNotice(`${result.publishedCount} student result(s) published successfully.`);
    } catch (publishError: unknown) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : 'Unable to publish results.',
      );
    } finally {
      setPublishing(false);
    }
  };

  const handleQuickExtendDeadline = async (days = 7) => {
    if (!examId) return;
    setSavingDeadline(true);
    setError('');
    setNotice('');
    try {
      const newDeadline = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const updatedExam = await examApi.updateRecheckDeadline(examId, newDeadline.toISOString());
      setExam(updatedExam);
      const localDate = new Date(newDeadline);
      localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
      setRecheckDeadline(localDate.toISOString().slice(0, 16));
      setNotice(`Student recheck deadline extended to ${days} days from now.`);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to extend deadline.');
    } finally {
      setSavingDeadline(false);
    }
  };

  const handleApplyGraceMarks = async () => {
    if (!examId) return;
    const marksNum = Number(graceMarksValue);
    if (!Number.isFinite(marksNum) || marksNum <= 0) {
      setError('Please enter a valid positive number for grace marks.');
      return;
    }
    setApplyingGrace(true);
    setError('');
    setNotice('');
    try {
      const resultIds =
        graceTarget === 'selected' && selectedStudentId
          ? [selectedStudentId]
          : undefined;
      const res = await evaluationApi.addGraceMarks(examId, {
        marks: marksNum,
        resultIds,
      });
      const refreshedResults = await evaluationApi.getResults(examId);
      setResults(refreshedResults.filter((item) => item.status === 'awaiting_approval'));
      setNotice(res.message);
      setShowGraceModal(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to apply grace marks.');
    } finally {
      setApplyingGrace(false);
    }
  };

  const handleSaveDeadline = async () => {
    if (!examId || !recheckDeadline) {
      setError('Choose a recheck deadline.');
      return;
    }
    const deadline = new Date(recheckDeadline);
    if (!Number.isFinite(deadline.getTime()) || deadline <= new Date()) {
      setError('The recheck deadline must be in the future.');
      return;
    }
    setSavingDeadline(true);
    setError('');
    setNotice('');
    try {
      const updatedExam = await examApi.updateRecheckDeadline(examId, deadline.toISOString());
      setExam(updatedExam);
      setNotice('Student recheck deadline saved.');
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the recheck deadline.');
    } finally {
      setSavingDeadline(false);
    }
  };

  const handleCompleteReview = async (result: StudentResult) => {
    if (!examId) return;
    setError('');
    setNotice('');
    setCompletingResultId(result.answersheetId);
    try {
      await evaluationApi.completeResultReview(examId, result.id);
      const refreshedResults = await evaluationApi.getResults(examId);
      setResults(refreshedResults.filter((item) => item.status === 'awaiting_approval'));
      setNotice(`${result.studentName}'s paper is marked done and ready to publish.`);
    } catch (completeError: unknown) {
      setError(
        completeError instanceof Error
          ? completeError.message
          : 'Unable to mark this paper done.',
      );
    } finally {
      setCompletingResultId(null);
    }
  };

  const selectedStudent = selectedStudentId
    ? results.find((r) => r.answersheetId === selectedStudentId)
    : null;

  useEffect(() => {
    setOmrModalOpen(false);
    if (!examId || !selectedStudent || selectedStudent.ocrEngine !== 'omr') {
      setOmrImageUrl(null);
      setOmrImageError('');
      setOmrImageLoading(false);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setOmrImageUrl(null);
    setOmrImageError('');
    setOmrImageLoading(true);

    evaluationApi
      .getOmrImage(examId, selectedStudent.answersheetId, controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setOmrImageUrl(objectUrl);
      })
      .catch((imgError: unknown) => {
        if (!controller.signal.aborted) {
          setOmrImageError(
            imgError instanceof Error
              ? imgError.message
              : 'Unable to load highlighted OMR sheet.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setOmrImageLoading(false);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [examId, selectedStudent?.answersheetId, selectedStudent?.ocrEngine]);

  const handleApproveAllEntries = async (student: StudentResult) => {
    if (!examId) return;
    const pendingEntries = student.entries.filter((e) => e.reviewStatus === 'pending');
    if (pendingEntries.length === 0) return;

    setApprovingAll(true);
    setError('');
    setNotice('');
    try {
      for (const entry of pendingEntries) {
        await evaluationApi.reviewAnswerEntry(examId, entry.id, { action: 'approve' });
      }
      const refreshedResults = await evaluationApi.getResults(examId);
      setResults(refreshedResults.filter((item) => item.status === 'awaiting_approval'));
      setNotice(
        `Approved ${pendingEntries.length} question mark${pendingEntries.length === 1 ? '' : 's'} for ${student.studentName}.`,
      );
    } catch (bulkError: unknown) {
      setError(
        bulkError instanceof Error
          ? bulkError.message
          : 'Unable to approve all question marks.',
      );
    } finally {
      setApprovingAll(false);
    }
  };

  const doneCount = results.filter((result) => !!result.reviewCompletedAt).length;
  const hasDonePapers = doneCount > 0;
  const isDeadlineSet = !!exam?.recheckDeadline;
  const isDeadlineExpired = !!exam?.recheckDeadline && new Date(exam.recheckDeadline).getTime() <= Date.now();
  const isDeadlineValid = isDeadlineSet && !isDeadlineExpired;
  const canPublish = hasDonePapers && isDeadlineValid;

  // Check if a student is involved in a high-similarity flag
  const studentHasSimilarity = (studentName: string) =>
    similarities.some(
      (s) =>
        (s.studentA.name === studentName || s.studentB.name === studentName) &&
        s.similarityScore >= 0.85
    );

  const filteredResults = results.filter((result) => {
    if (filter === 'flagged') return result.entries.some((e) => e.isFlagged);
    if (filter === 'high-similarity') return studentHasSimilarity(result.studentName);
    return true;
  });

  if (!examId) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Card>
          <div className="flex items-center justify-center py-12 gap-3">
            <AlertCircle size={20} className="text-[#FAB963]" />
            <p className="text-sm text-[#888888]">Please select an exam from the dashboard</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[#1A1A1A]">Teacher Review</h2>
            <p className="text-sm text-[#888888] mt-1">
              Approve or override each question before publishing · {results.length} submission(s) pending
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowGraceModal(true)}
              disabled={results.length === 0}
            >
              <Sparkles size={14} className="mr-2 text-amber-500" />
              Add Grace Marks
            </Button>
            <div className="flex flex-col items-end gap-1">
              <Button
                variant="primary"
                onClick={handlePublish}
                loading={publishing}
                disabled={!hasDonePapers || publishing}
              >
                <CheckCircle2 size={14} className="mr-2" />
                Publish done papers ({doneCount})
              </Button>
              {hasDonePapers && !isDeadlineValid && (
                <span className="text-[11px] text-amber-700 font-medium">
                  {isDeadlineExpired ? '⚠️ Deadline expired (will extend & publish)' : '⚠️ Deadline needed (will set & publish)'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Exam info */}
      {exam && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[#005461] uppercase tracking-wide">{exam.title}</p>
              <p className="text-xs text-[#888888] mt-1">{exam.course} · {exam.term}</p>
              {exam.publishedAt && (
                <p className="mt-2 text-xs text-[#888888]">
                  Published {new Date(exam.publishedAt).toLocaleString()}
                </p>
              )}
            </div>
            <Badge variant={exam.status === 'published' ? 'success' : 'info'}>
              {exam.status === 'published' ? 'Published' : 'Awaiting Review'}
            </Badge>
          </div>
          <div className="mt-5 flex flex-col gap-3 border-t border-[#E8DCC8] pt-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                label="Student recheck deadline"
                type="datetime-local"
                value={recheckDeadline}
                onChange={(event) => setRecheckDeadline(event.target.value)}
                hint={exam.recheckDeadline
                  ? `Current deadline: ${new Date(exam.recheckDeadline).toLocaleString()}`
                  : 'Set a deadline so students know how long they have to request a recheck.'}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                loading={savingDeadline}
                disabled={savingDeadline || !recheckDeadline}
                onClick={handleSaveDeadline}
              >
                Save deadline
              </Button>
              <Button
                variant="secondary"
                loading={savingDeadline}
                disabled={savingDeadline}
                onClick={() => handleQuickExtendDeadline(7)}
              >
                Set 7 days from now
              </Button>
            </div>
          </div>
          {isDeadlineExpired && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
              <AlertCircle size={15} className="shrink-0 text-amber-600" />
              <span>
                <strong>Deadline Expired:</strong> The current deadline was {new Date(exam.recheckDeadline!).toLocaleString()}. Click &quot;Set 7 days from now&quot; or click &quot;Publish done papers&quot; to auto-extend and publish immediately.
              </span>
            </div>
          )}
          {!isDeadlineSet && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
              <AlertCircle size={15} className="shrink-0 text-amber-600" />
              <span>
                A future recheck deadline is required before results can be published.
              </span>
            </div>
          )}
        </Card>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'flagged', 'high-similarity'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg border transition-all duration-200',
              filter === f
                ? 'bg-[#005461] text-white border-[#005461]'
                : 'bg-white text-[#005461] border-[#E8DCC8] hover:border-[#005461]'
            )}
          >
            {f === 'all' && 'All Results'}
            {f === 'flagged' && 'Flagged Answers'}
            {f === 'high-similarity' && 'High Similarity'}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-red-500" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </Card>
      )}
      {notice && (
        <Card className="border-green-200 bg-green-50">
          <p role="status" className="text-sm text-green-700">{notice}</p>
        </Card>
      )}

      {/* Loading */}
      {loading ? (
        <Card>
          <div className="flex items-center justify-center py-12 gap-3">
            <Loader size={18} className="text-[#005461] animate-spin" />
            <p className="text-sm text-[#888888]">Loading results...</p>
          </div>
        </Card>
      ) : filteredResults.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <CheckCircle2 size={32} className="text-green-500" />
            <p className="text-sm font-medium text-[#1A1A1A]">All clear!</p>
            <p className="text-xs text-[#888888]">
              {filter === 'all' && (results.length > 0 ? 'All questions have been reviewed. Publish when ready.' : 'No results pending review')}
              {filter === 'flagged' && 'No flagged answers found'}
              {filter === 'high-similarity' && 'No high similarity matches'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Results list */}
          <div className="lg:col-span-1 space-y-2">
            {filteredResults.map((result) => {
              const flaggedCount = result.entries.filter((e) => e.isFlagged).length;
              const hasSimilarity = studentHasSimilarity(result.studentName);

              return (
                <button
                  key={result.answersheetId}
                  onClick={() => setSelectedStudentId(result.answersheetId)}
                  className={cn(
                    'w-full text-left',
                    selectedStudentId === result.answersheetId && 'ring-2 ring-[#005461] rounded-xl'
                  )}
                >
                  <Card
                    padding="sm"
                    className={cn(
                      'cursor-pointer border transition-all duration-200',
                      selectedStudentId === result.answersheetId
                        ? 'border-[#005461] bg-[#F0F8FA]'
                        : 'hover:border-[#005461]'
                    )}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold text-[#1A1A1A]">{result.studentName}</p>
                          <p className="text-xs text-[#888888]">
                            Roll no. on paper: {result.registrationNo || 'Not detected'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-[#005461]">
                            {result.totalAiMark}/{result.totalMaxMarks}
                          </p>
                          <p className="text-xs text-[#888888]">
                            {Math.round((result.totalAiMark / result.totalMaxMarks) * 100)}%
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-[#666666]">
                        {result.entries.filter((entry) => entry.reviewStatus !== 'pending').length}
                        {' / '}
                        {result.entries.length} questions reviewed
                        {result.totalApprovedMark !== null &&
                          result.totalApprovedMark !== undefined &&
                          ` · Final ${result.totalApprovedMark}/${result.totalMaxMarks}`}
                      </p>
                      {result.reviewCompletedAt && (
                        <Badge variant="success">Done · ready to publish</Badge>
                      )}

                      {(flaggedCount > 0 || hasSimilarity || result.ocrEngine === 'omr') && (
                        <div className="flex gap-2 flex-wrap">
                          {result.ocrEngine === 'omr' && (
                            <Badge variant="info" className="text-xs">
                              <ScanLine size={10} className="mr-1" />
                              OMR MCQ
                            </Badge>
                          )}
                          {flaggedCount > 0 && (
                            <Badge variant="danger" className="text-xs">
                              <Flag size={10} className="mr-1" />
                              {flaggedCount} flagged
                            </Badge>
                          )}
                          {hasSimilarity && (
                            <Badge variant="warning" className="text-xs">
                              <TrendingDown size={10} className="mr-1" />
                              High match
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </Card>
                </button>
              );
            })}
          </div>

          {/* Detail view */}
          {selectedStudent && (
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-[#1A1A1A]">{selectedStudent.studentName}</h3>
                      <p className="text-sm text-[#888888]">
                        Roll no. on paper: {selectedStudent.registrationNo || 'Not detected'}
                      </p>
                    </div>
                    {selectedStudent.reviewCompletedAt ? (
                      <Badge variant="success">Done · ready to publish</Badge>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {selectedStudent.entries.some((entry) => entry.reviewStatus === 'pending') && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleApproveAllEntries(selectedStudent)}
                            loading={approvingAll}
                            disabled={approvingAll || !!reviewingEntryId || !!completingResultId}
                          >
                            <CheckCircle2 size={14} className="mr-2" />
                            Approve all marks ({selectedStudent.entries.filter((e) => e.reviewStatus === 'pending').length})
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => handleCompleteReview(selectedStudent)}
                          loading={completingResultId === selectedStudent.answersheetId}
                          disabled={
                            !!completingResultId ||
                            approvingAll ||
                            selectedStudent.entries.length !== exam?.questions.length ||
                            selectedStudent.entries.some(
                              (entry) =>
                                entry.reviewStatus === 'pending' ||
                                entry.approvedMark === null ||
                                entry.approvedMark === undefined,
                            )
                          }
                        >
                          <CheckCircle2 size={14} className="mr-2" />
                          Done reviewing this paper
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-4 border-t border-[#E8DCC8]">
                    <div>
                      <p className="text-xs text-[#888888]">Total Score</p>
                      <p className="text-xl font-bold text-[#005461] mt-1">
                        {selectedStudent.totalAiMark}/{selectedStudent.totalMaxMarks}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[#888888]">Percentage</p>
                      <p className="text-xl font-bold text-[#005461] mt-1">
                        {Math.round((selectedStudent.totalAiMark / selectedStudent.totalMaxMarks) * 100)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[#888888]">
                        {selectedStudent.ocrEngine === 'omr' ? 'Right / Wrong' : 'Flagged'}
                      </p>
                      {selectedStudent.ocrEngine === 'omr' ? (
                        <p className="text-xl font-bold mt-1">
                          <span className="text-emerald-600">
                            {selectedStudent.entries.filter((e) => e.isCorrect).length}
                          </span>
                          <span className="text-[#888888] mx-1">/</span>
                          <span className="text-red-500">
                            {selectedStudent.entries.filter((e) => !e.isCorrect).length}
                          </span>
                        </p>
                      ) : (
                        <p className="text-xl font-bold text-red-500 mt-1">
                          {selectedStudent.entries.filter((e) => e.isFlagged).length}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Highlighted OMR Checked Sheet Preview */}
              {selectedStudent.ocrEngine === 'omr' && (
                <Card>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold text-[#005461] uppercase tracking-wide flex items-center gap-2">
                          <ScanLine size={15} />
                          Checked OMR Sheet (Right / Wrong Highlights)
                        </h4>
                        <p className="text-xs text-[#777777] mt-0.5">
                          Green = Right bubble · Red X = Wrong mark (green outline shows answer key) · Amber = Blank / Multiple
                        </p>
                      </div>
                      {omrImageUrl && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setOmrModalOpen(true)}
                        >
                          <Maximize2 size={14} className="mr-1.5" />
                          Expand Full Sheet
                        </Button>
                      )}
                    </div>

                    <div className="rounded-xl border border-[#E8DCC8] bg-[#F7F5F0] overflow-hidden flex items-center justify-center min-h-[260px]">
                      {omrImageLoading ? (
                        <div className="flex items-center gap-2 py-12 text-sm text-[#777777]">
                          <Loader size={16} className="animate-spin text-[#005461]" />
                          Loading checked OMR sheet...
                        </div>
                      ) : omrImageError ? (
                        <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
                          <AlertCircle size={22} className="text-[#B45309]" />
                          <p className="text-sm font-medium text-[#333333]">Highlighted OMR image unavailable</p>
                          <p className="text-xs text-[#777777]">{omrImageError}</p>
                        </div>
                      ) : omrImageUrl ? (
                        <img
                          src={omrImageUrl}
                          alt={`Checked OMR sheet for ${selectedStudent.studentName}`}
                          className="w-full max-h-[680px] object-contain bg-white cursor-zoom-in"
                          onClick={() => setOmrModalOpen(true)}
                        />
                      ) : null}
                    </div>
                  </div>
                </Card>
              )}

              {/* Answer details */}
              <div className="space-y-2">
                {selectedStudent.entries.map((entry, idx) => {
                  const omr = entry.omrDetails;
                  const omrWrong = omr && omr.status === 'wrong';
                  const omrRight = omr && omr.status === 'correct';
                  const omrFlag = omr && (omr.status === 'blank' || omr.status === 'multiple');

                  return (
                  <Card
                    key={entry.id}
                    padding="sm"
                    className={cn(
                      omrWrong && 'border-red-300 bg-red-50/40',
                      omrRight && 'border-emerald-200 bg-emerald-50/20',
                      omrFlag && 'border-amber-300 bg-amber-50/40',
                      !omr && entry.isFlagged && 'border-red-200 bg-red-50',
                    )}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-[#1A1A1A]">
                            Q{idx + 1}: {entry.questionText}
                          </p>
                          <div className="flex gap-2 mt-2 flex-wrap">
                            <Badge variant={omrRight ? 'success' : omrWrong ? 'danger' : 'default'}>
                              {entry.aiMark}/{entry.maxMarks}
                            </Badge>
                            {omr && (
                              <Badge variant={omrRight ? 'success' : omrWrong ? 'danger' : 'amber'}>
                                {omrRight ? (
                                  <span className="flex items-center gap-1">
                                    <Check size={11} /> Right ({omr.selectedOption})
                                  </span>
                                ) : omrWrong ? (
                                  <span className="flex items-center gap-1">
                                    <XCircle size={11} /> Wrong · Marked {omr.selectedOption} (Key: {omr.correctOption})
                                  </span>
                                ) : omr.status === 'blank' ? (
                                  `Blank (Key: ${omr.correctOption})`
                                ) : (
                                  `Multiple Marked: ${omr.selectedOption} (Key: ${omr.correctOption})`
                                )}
                              </Badge>
                            )}
                            {entry.reviewStatus !== 'pending' && (
                              <Badge variant={entry.reviewStatus === 'overridden' ? 'warning' : 'success'}>
                                {entry.reviewStatus === 'overridden' ? 'Overridden' : 'Approved'} · {entry.approvedMark}/{entry.maxMarks}
                              </Badge>
                            )}
                            {!omr && (
                              <Badge variant={confidenceVariant(entry.confidence)}>
                                {getConfidenceLabel(entry.confidence)} - {Math.round(entry.confidence * 100)}%
                              </Badge>
                            )}
                            {entry.isFlagged && (
                              <Badge variant="danger">
                                <Flag size={10} className="mr-1" />
                                Flagged
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      {omr ? (
                        <div className="space-y-3 border-t border-[#E8DCC8] pt-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-xs font-medium text-[#666666]">Detected Bubbles:</span>
                            <div className="flex items-center gap-2">
                              {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                                const selectedList = omr.selectedOption
                                  ? omr.selectedOption.split(',').map((s) => s.trim())
                                  : [];
                                const isSelected = selectedList.includes(opt);
                                const isKey = omr.correctOption === opt;
                                const ratioPct = Math.round((omr.fillRatios?.[opt] ?? 0) * 100);

                                let bubbleStyle = 'border-[#D8CCBA] bg-white text-[#555555]';
                                if (isSelected && isKey) {
                                  bubbleStyle = 'border-emerald-600 bg-emerald-600 text-white shadow-sm';
                                } else if (isSelected && !isKey) {
                                  bubbleStyle =
                                    omr.status === 'multiple'
                                      ? 'border-amber-500 bg-amber-500 text-white'
                                      : 'border-red-600 bg-red-600 text-white shadow-sm';
                                } else if (!isSelected && isKey) {
                                  bubbleStyle =
                                    'border-2 border-emerald-600 bg-emerald-50 text-emerald-700 font-bold';
                                }

                                return (
                                  <div
                                    key={opt}
                                    title={`Option ${opt}: ${ratioPct}% filled`}
                                    className="flex flex-col items-center gap-0.5"
                                  >
                                    <span
                                      className={cn(
                                        'w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold',
                                        bubbleStyle,
                                      )}
                                    >
                                      {opt}
                                    </span>
                                    <span className="text-[10px] text-[#888888]">{ratioPct}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="bg-white rounded border border-[#E8DCC8] p-2.5">
                              <p className="text-xs font-medium text-[#888888] mb-0.5">Student Marked:</p>
                              <p className="text-sm text-[#1A1A1A] font-medium">
                                {entry.studentAnswer || 'Blank'}
                              </p>
                            </div>
                            <div className="bg-white rounded border border-emerald-200 p-2.5">
                              <p className="text-xs font-medium text-emerald-700 mb-0.5">Correct Option:</p>
                              <p className="text-sm text-[#1A1A1A] font-medium">
                                {entry.referenceAnswer || omr.correctOption}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-3 gap-2 text-xs border-t border-[#E8DCC8] pt-2">
                            <div>
                              <p className="text-[#888888]">Keyword Score</p>
                              <p className="font-semibold text-[#1A1A1A]">{Math.round(entry.keywordScore * 100)}%</p>
                            </div>
                            <div>
                              <p className="text-[#888888]">Semantic Score</p>
                              <p className="font-semibold text-[#1A1A1A]">{Math.round(entry.semanticScore * 100)}%</p>
                            </div>
                            <div>
                              <p className="text-[#888888]">Confidence</p>
                              <p className="font-semibold text-[#1A1A1A]">{Math.round(entry.confidence * 100)}%</p>
                            </div>
                            {entry.conceptScore !== undefined && (
                              <div>
                                <p className="text-[#888888]">Rubric coverage</p>
                                <p className="font-semibold text-[#1A1A1A]">{Math.round(entry.conceptScore * 100)}%</p>
                              </div>
                            )}
                          </div>

                          {!!entry.rubricBreakdown?.length && (
                            <div className="space-y-2 rounded-lg border border-[#E8DCC8] bg-[#FFFDF8] p-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-[#005461]">
                                Rubric breakdown
                              </p>
                              {entry.rubricBreakdown.map((concept) => (
                                <div
                                  key={concept.conceptName}
                                  className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E8DCC8] pt-2 text-sm"
                                >
                                  <div>
                                    <p className="font-medium text-[#1A1A1A]">{concept.conceptName}</p>
                                    <p className="text-xs text-[#888888]">
                                      {concept.status} · {concept.strictness} · {Math.round(concept.coverage * 100)}% coverage
                                    </p>
                                  </div>
                                  <Badge variant={concept.status === 'addressed' ? 'success' : concept.status === 'partially addressed' ? 'warning' : 'danger'}>
                                    {concept.awardedMarks}/{concept.maxMarks} marks
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="bg-white rounded border border-[#E8DCC8] p-3">
                            <p className="text-xs font-medium text-[#888888] mb-1">Student Answer:</p>
                            <p className="text-sm text-[#1A1A1A] whitespace-pre-wrap break-words">
                              {entry.studentAnswer?.trim() || 'No answer was extracted for this question.'}
                            </p>
                          </div>
                          {entry.feedback && (
                            <div className="rounded border border-[#E8DCC8] bg-white p-3">
                              <p className="mb-1 text-xs font-medium text-[#888888]">Rubric feedback draft</p>
                              <p className="text-sm text-[#1A1A1A]">{entry.feedback}</p>
                            </div>
                          )}
                        </>
                      )}
                      <div className="space-y-3 rounded-lg border border-[#E8DCC8] bg-[#FFFDF8] p-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-[#005461]">
                            Teacher decision
                          </p>
                          <p className="mt-1 text-xs text-[#666666]">
                            Approve the AI mark or enter a revised mark with a required explanation.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="flex flex-col gap-1 text-xs text-[#666666]">
                            Revised mark (0–{entry.maxMarks})
                            <input
                              type="number"
                              min="0"
                              max={entry.maxMarks}
                              step="0.01"
                              value={
                                markDrafts[entry.id] ??
                                String(entry.approvedMark ?? entry.aiMark)
                              }
                              onChange={(event) =>
                                setMarkDrafts((current) => ({
                                  ...current,
                                  [entry.id]: event.target.value,
                                }))
                              }
                              className="rounded-lg border border-[#E8DCC8] bg-white px-3 py-2 text-sm text-[#1A1A1A]"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-xs text-[#666666]">
                            Override comment (optional)
                            <textarea
                              rows={2}
                              value={commentDrafts[entry.id] || ''}
                              onChange={(event) =>
                                setCommentDrafts((current) => ({
                                  ...current,
                                  [entry.id]: event.target.value,
                                }))
                              }
                              placeholder="Optional reason for revising the mark"
                              className="resize-y rounded-lg border border-[#E8DCC8] bg-white px-3 py-2 text-sm text-[#1A1A1A]"
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleReviewEntry(entry, 'approve')}
                            loading={reviewingEntryId === entry.id}
                            disabled={!!reviewingEntryId}
                          >
                            <CheckCircle2 size={14} className="mr-2" />
                            Approve AI mark
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => handleReviewEntry(entry, 'override')}
                            loading={reviewingEntryId === entry.id}
                            disabled={!!reviewingEntryId}
                          >
                            Save override
                          </Button>
                        </div>
                        {!!entry.reviewAuditTrail?.length && (
                          <div className="space-y-2 border-t border-[#E8DCC8] pt-3">
                            <p className="flex items-center gap-1 text-xs font-semibold text-[#005461]">
                              <MessageSquare size={13} />
                              Review history
                            </p>
                            {entry.reviewAuditTrail.map((audit) => (
                              <div key={audit.id} className="rounded border border-[#E8DCC8] bg-white p-2 text-xs">
                                <p className="font-medium text-[#1A1A1A]">
                                  {audit.reviewerName} {audit.action === 'approve' ? 'approved' : 'overrode'} the mark
                                  {' · '}{audit.originalAiMark} → {audit.finalMark}
                                </p>
                                <p className="mt-1 text-[#888888]">
                                  {new Date(audit.reviewedAt).toLocaleString()}
                                  {audit.comment ? ` · ${audit.comment}` : ''}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                  );
                })}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-4">
                <Button
                  variant="ghost"
                  onClick={() => setSelectedStudentId(null)}
                  className="flex-1"
                >
                  Review Later
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {omrModalOpen && omrImageUrl && selectedStudent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          onClick={() => setOmrModalOpen(false)}
        >
          <div
            className="relative max-h-[92vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#E8DCC8] mb-3">
              <div>
                <p className="text-sm font-semibold text-[#005461]">
                  {selectedStudent.studentName} · {selectedStudent.registrationNo}
                </p>
                <p className="text-xs text-[#777777]">
                  Highlighted OMR MCQ Sheet ({selectedStudent.totalAiMark}/{selectedStudent.totalMaxMarks})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOmrModalOpen(false)}
                className="rounded-lg p-1.5 text-[#666666] hover:bg-[#F5EFE6] hover:text-[#1A1A1A]"
                aria-label="Close OMR sheet preview"
              >
                <X size={18} />
              </button>
            </div>
            <img
              src={omrImageUrl}
              alt={`Full checked OMR sheet for ${selectedStudent.studentName}`}
              className="w-full h-auto rounded-lg border border-[#E8DCC8]"
            />
          </div>
        </div>
      )}

      {showGraceModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowGraceModal(false)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#E8DCC8]">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-[#FAB963]" />
                <h3 className="text-base font-bold text-[#1A1A1A]">Award Grace Marks</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGraceModal(false)}
                className="rounded-lg p-1 text-[#666666] hover:bg-[#F5EFE6] hover:text-[#1A1A1A]"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-[#666666]">
              Add bonus marks across student papers for this exam. Marks will be distributed across questions without exceeding question maximums.
            </p>

            <div className="space-y-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-[#1A1A1A]">
                Grace marks to add:
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={graceMarksValue}
                  onChange={(e) => setGraceMarksValue(e.target.value)}
                  className="rounded-lg border border-[#E8DCC8] bg-white px-3 py-2 text-sm text-[#1A1A1A]"
                  placeholder="e.g. 2 or 3"
                />
              </label>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#1A1A1A]">Apply to:</label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-xs text-[#1A1A1A] cursor-pointer">
                    <input
                      type="radio"
                      name="graceTarget"
                      checked={graceTarget === 'all'}
                      onChange={() => setGraceTarget('all')}
                      className="accent-[#005461]"
                    />
                    <span>All student papers in this exam ({results.length})</span>
                  </label>
                  <label
                    className={cn(
                      'flex items-center gap-2 text-xs cursor-pointer',
                      selectedStudent ? 'text-[#1A1A1A]' : 'text-gray-400 cursor-not-allowed'
                    )}
                  >
                    <input
                      type="radio"
                      name="graceTarget"
                      checked={graceTarget === 'selected'}
                      onChange={() => setGraceTarget('selected')}
                      disabled={!selectedStudent}
                      className="accent-[#005461]"
                    />
                    <span>
                      Selected student only {selectedStudent ? `(${selectedStudent.studentName})` : '(No student selected)'}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E8DCC8]">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setShowGraceModal(false)}
                disabled={applyingGrace}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={handleApplyGraceMarks}
                loading={applyingGrace}
                disabled={applyingGrace || !graceMarksValue}
              >
                Apply Grace Marks
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AIReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 max-w-6xl">
          <Card>
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader size={18} className="text-[#005461] animate-spin" />
              <p className="text-sm text-[#888888]">Loading...</p>
            </div>
          </Card>
        </div>
      }
    >
      <AIReviewContent />
    </Suspense>
  );
}