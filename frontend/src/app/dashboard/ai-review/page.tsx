'use client';

import { Suspense } from 'react';
import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Flag,
  Loader,
  TrendingDown,
  MessageSquare,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
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
  const [filter, setFilter] = useState<'all' | 'flagged' | 'high-similarity'>('all');

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
        setResults(resultsData.filter((r) => r.status === 'awaiting_approval'));
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
      comment: string;
    };
    if (action === 'override') {
      const mark = Number(markDrafts[entry.id] ?? entry.approvedMark ?? entry.aiMark);
      const comment = (commentDrafts[entry.id] || '').trim();
      if (!Number.isFinite(mark) || mark < 0 || mark > entry.maxMarks) {
        setError(`Enter a revised mark between 0 and ${entry.maxMarks}.`);
        return;
      }
      if (!comment) {
        setError('A comment is required when overriding an AI-assigned mark.');
        return;
      }
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
    if (!examId || !canPublish) return;
    if (!window.confirm('Publish all papers marked done for this exam to students?')) return;
    setPublishing(true);
    setError('');
    setNotice('');
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

  const canPublish = results.some((result) => !!result.reviewCompletedAt);

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
          <Button
            variant="primary"
            onClick={handlePublish}
            loading={publishing}
            disabled={!canPublish || publishing}
          >
            <CheckCircle2 size={14} className="mr-2" />
            Publish done papers ({results.filter((result) => !!result.reviewCompletedAt).length})
          </Button>
        </div>
      </div>

      {/* Exam info */}
      {exam && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#005461] uppercase tracking-wide">{exam.title}</p>
              <p className="text-xs text-[#888888] mt-1">{exam.course} · {exam.term}</p>
            </div>
            <Badge variant={exam.status === 'published' ? 'success' : 'info'}>
              {exam.status === 'published' ? 'Published' : 'Awaiting Review'}
            </Badge>
            {exam.publishedAt && (
              <p className="mt-2 text-xs text-[#888888]">
                Published {new Date(exam.publishedAt).toLocaleString()}
              </p>
            )}
          </div>
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

                      {(flaggedCount > 0 || hasSimilarity) && (
                        <div className="flex gap-2 flex-wrap">
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
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => handleCompleteReview(selectedStudent)}
                        loading={completingResultId === selectedStudent.answersheetId}
                        disabled={
                          !!completingResultId ||
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
                      <p className="text-xs text-[#888888]">Flagged</p>
                      <p className="text-xl font-bold text-red-500 mt-1">
                        {selectedStudent.entries.filter((e) => e.isFlagged).length}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Answer details */}
              <div className="space-y-2">
                {selectedStudent.entries.map((entry, idx) => (
                  <Card key={entry.id} padding="sm" className={cn(entry.isFlagged && 'border-red-200 bg-red-50')}>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-[#1A1A1A]">
                            Q{idx + 1}: {entry.questionText}
                          </p>
                          <div className="flex gap-2 mt-2 flex-wrap">
                            <Badge variant="default">{entry.aiMark}/{entry.maxMarks}</Badge>
                            {entry.reviewStatus !== 'pending' && (
                              <Badge variant={entry.reviewStatus === 'overridden' ? 'warning' : 'success'}>
                                {entry.reviewStatus === 'overridden' ? 'Overridden' : 'Approved'} · {entry.approvedMark}/{entry.maxMarks}
                              </Badge>
                            )}
                            <Badge variant={confidenceVariant(entry.confidence)}>
                              {getConfidenceLabel(entry.confidence)} - {Math.round(entry.confidence * 100)}%
                            </Badge>
                            {entry.isFlagged && (
                              <Badge variant="danger">
                                <Flag size={10} className="mr-1" />
                                Flagged
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

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
                            Override comment (required to revise)
                            <textarea
                              rows={2}
                              value={commentDrafts[entry.id] || ''}
                              onChange={(event) =>
                                setCommentDrafts((current) => ({
                                  ...current,
                                  [entry.id]: event.target.value,
                                }))
                              }
                              placeholder="Explain why the AI mark is being changed"
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
                ))}
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