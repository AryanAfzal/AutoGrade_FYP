'use client';

import { Suspense } from 'react';
import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileText,
  Flag,
  Loader,
  Maximize2,
  MessageSquare,
  Scale,
  ScanLine,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  Users,
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
  GroupedSimilarityPair,
  SimilarityQuestionComparison,
  MatchedSegment,
} from '@/types';
import { cn, getConfidenceLabel } from '@/lib/utils';

function HighlightedAnswerText({
  text,
  segments,
  side,
}: {
  text: string;
  segments?: MatchedSegment[];
  side: 'A' | 'B';
}) {
  if (!text || !text.trim()) {
    return <span className="italic text-gray-400">No answer text provided</span>;
  }
  if (!segments || segments.length === 0) {
    return <span className="text-[#222222] leading-relaxed whitespace-pre-wrap">{text}</span>;
  }

  const phrases = segments
    .map((s) => (side === 'A' ? s.textA : s.textB)?.trim())
    .filter((p): p is string => Boolean(p && p.length >= 8));

  if (phrases.length === 0) {
    return <span className="text-[#222222] leading-relaxed whitespace-pre-wrap">{text}</span>;
  }

  const escaped = phrases
    .sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  try {
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(regex);

    return (
      <span className="text-[#222222] leading-relaxed whitespace-pre-wrap">
        {parts.map((part, i) => {
          const isMatch = phrases.some((p) => p.toLowerCase() === part.toLowerCase());
          if (isMatch) {
            return (
              <mark
                key={i}
                className="bg-amber-200 text-amber-950 px-1 py-0.5 rounded font-medium border-b-2 border-amber-500"
                title="Matching copied text"
              >
                {part}
              </mark>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  } catch {
    return <span className="text-[#222222] leading-relaxed whitespace-pre-wrap">{text}</span>;
  }
}

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

  const [groupedPairs, setGroupedPairs] = useState<GroupedSimilarityPair[]>([]);
  const [selectedPair, setSelectedPair] = useState<GroupedSimilarityPair | null>(null);
  const [comparisonModalOpen, setComparisonModalOpen] = useState(false);
  const [confirmCheatingOpen, setConfirmCheatingOpen] = useState(false);
  const [penaltyTarget, setPenaltyTarget] = useState<'both' | 'student_a' | 'student_b'>('both');
  const [cheatingNotes, setCheatingNotes] = useState(
    'Confirmed unauthorized copying across questions with identical sentence structure, verbatim phrasing, and list ordering.',
  );
  const [submittingPenalty, setSubmittingPenalty] = useState(false);
  const [activeQuestionTab, setActiveQuestionTab] = useState<number | 'all'>('all');

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
        // Backend returns { examId, summary, flaggedPairs, groupedPairs }
        if (Array.isArray(similarityData)) {
          setSimilarities(similarityData.filter((s) => s.similarityScore > 0.85));
        } else if (similarityData && Array.isArray((similarityData as SimilarityReport).flaggedPairs)) {
          const rep = similarityData as SimilarityReport;
          const filteredFlags = (rep.flaggedPairs || []).filter((s) => s.similarityScore > 0.85);
          setSimilarities(filteredFlags);
          if (rep.groupedPairs && Array.isArray(rep.groupedPairs)) {
            setGroupedPairs(rep.groupedPairs.filter((p) => p.overallSimilarity > 0.85));
          }
        } else {
          setSimilarities([]);
          setGroupedPairs([]);
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

  const getLiveScore = (studentResult: StudentResult) => {
    if (!studentResult.entries || !studentResult.entries.length) {
      const score = typeof studentResult.totalApprovedMark === 'number'
        ? studentResult.totalApprovedMark
        : studentResult.totalAiMark;
      return {
        score,
        max: studentResult.totalMaxMarks,
        percent: Math.round((score / (studentResult.totalMaxMarks || 1)) * 100),
      };
    }
    const sum = studentResult.entries.reduce((total, entry) => {
      let mark = typeof entry.approvedMark === 'number' ? entry.approvedMark : entry.aiMark;
      if (studentResult.answersheetId === selectedStudentId && markDrafts[entry.id] !== undefined) {
        const val = markDrafts[entry.id].trim();
        if (val !== '') {
          const num = Number(val);
          if (Number.isFinite(num) && num >= 0 && num <= entry.maxMarks) {
            mark = num;
          }
        }
      }
      return total + mark;
    }, 0);
    const roundedScore = Math.round(sum * 100) / 100;
    const percent = Math.round((roundedScore / (studentResult.totalMaxMarks || 1)) * 100);
    return {
      score: roundedScore,
      max: studentResult.totalMaxMarks,
      percent,
    };
  };

  // Check if a student is involved in a critical match (> 85%)
  const studentHasSimilarity = (studentName: string) =>
    similarities.some(
      (s) =>
        (s.studentA.name === studentName || s.studentB.name === studentName) &&
        s.similarityScore > 0.85
    );

  const handleDecideSimilarity = async (
    pair: GroupedSimilarityPair,
    action: 'confirm_cheating' | 'dismiss',
    customTarget?: 'both' | 'student_a' | 'student_b',
    customNotes?: string,
  ) => {
    if (!examId) return;
    setSubmittingPenalty(true);
    setError('');
    setNotice('');

    try {
      const target = customTarget || penaltyTarget;
      const notes = customNotes || cheatingNotes;

      const res = await evaluationApi.decideSimilarity(examId, {
        action,
        penaltyTarget: target,
        studentAResultId: pair.studentA.resultId,
        studentBResultId: pair.studentB.resultId,
        studentARegNo: pair.studentA.regNo,
        studentBRegNo: pair.studentB.regNo,
        teacherNotes: notes,
        reportData: {
          pairKey: pair.pairKey,
          studentA: { name: pair.studentA.name, regNo: pair.studentA.regNo },
          studentB: { name: pair.studentB.name, regNo: pair.studentB.regNo },
          overallSimilarity: pair.overallSimilarity,
          matchedQuestionsCount: pair.matchedQuestionsCount,
          riskLevel: pair.riskLevel,
          teacherNotes: notes,
          penaltyTarget: target,
          decidedAt: new Date().toISOString(),
          questions: pair.questions.map((q) => ({
            questionNumber: q.questionNumber,
            questionText: q.questionText,
            similarityScore: q.similarityScore,
            semanticScore: q.semanticScore,
            lexicalScore: q.lexicalScore,
            verbatimRatio: q.verbatimRatio,
            riskLevel: q.riskLevel,
            answerA: q.answerA,
            answerB: q.answerB,
            matchedSegments: q.matchedSegments,
          })),
        },
      });

      // Refresh data in real-time
      const [refreshedResults, refreshedSimilarity] = await Promise.all([
        evaluationApi.getResults(examId),
        evaluationApi.getSimilarityFlags(examId),
      ]);

      const awaiting = refreshedResults.filter((r) => r.status === 'awaiting_approval');
      setResults(awaiting);

      if (Array.isArray(refreshedSimilarity)) {
        setSimilarities(refreshedSimilarity.filter((s) => s.similarityScore > 0.85));
      } else if (
        refreshedSimilarity &&
        Array.isArray((refreshedSimilarity as SimilarityReport).flaggedPairs)
      ) {
        const rep = refreshedSimilarity as SimilarityReport;
        setSimilarities((rep.flaggedPairs || []).filter((s) => s.similarityScore > 0.85));
        if (rep.groupedPairs && Array.isArray(rep.groupedPairs)) {
          setGroupedPairs(rep.groupedPairs.filter((p) => p.overallSimilarity > 0.85));
        }
      }

      setConfirmCheatingOpen(false);
      setComparisonModalOpen(false);
      setNotice(
        action === 'confirm_cheating'
          ? `Academic integrity violation recorded: awarded 0 marks to ${
              res.penalizedStudents?.join(', ') || 'selected student(s)'
            }. Results and total scores updated in real-time.`
          : 'Similarity flag dismissed. Original marks remain intact.',
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Failed to record similarity decision.',
      );
    } finally {
      setSubmittingPenalty(false);
    }
  };

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
      ) : filter === 'high-similarity' ? (
        <div className="space-y-6">
          {/* Similarity Hub Header */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                  <ShieldAlert size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-amber-950">
                    Critical Plagiarism &amp; Cheating Detection (&gt;85% Match)
                  </h3>
                  <p className="mt-1 text-xs text-amber-900/90 leading-relaxed max-w-3xl">
                    Showing only submissions with a <strong>critical match rate greater than 85% (&gt;85%)</strong>. Lower matches are ignored to eliminate false positives on common standard concepts.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-white text-amber-900 border border-amber-300">
                  {groupedPairs.length} Critical Pair{groupedPairs.length === 1 ? '' : 's'}
                </span>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                  Threshold: &gt;85% Match
                </span>
              </div>
            </div>
          </div>

          {groupedPairs.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <CheckCircle2 size={36} className="text-emerald-500" />
                <p className="text-base font-semibold text-[#1A1A1A]">No Plagiarism or Copying Detected</p>
                <p className="text-xs text-[#888888] max-w-md text-center">
                  All candidate answers have been evaluated. No students share suspicious multi-word sentence structures or identical example sequences.
                </p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {groupedPairs.map((pair) => {
                const isCritical = pair.riskLevel === 'critical' || pair.overallSimilarity >= 0.80;
                const isZeroed =
                  pair.studentA.cheatingStatus === 'confirmed_cheating' ||
                  pair.studentB.cheatingStatus === 'confirmed_cheating';

                return (
                  <div
                    key={pair.pairKey}
                    className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm transition-all hover:border-[#005461]/40 space-y-4"
                  >
                    {/* Pair Header */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-[#F0F8FA] px-3.5 py-2 rounded-xl border border-[#005461]/20">
                          <Users size={16} className="text-[#005461]" />
                          <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#1A1A1A]">
                            <span>{pair.studentA.name}</span>
                            <span className="text-xs font-normal text-[#666666]">({pair.studentA.regNo})</span>
                            <ArrowRightLeft size={13} className="text-amber-600 mx-1" />
                            <span>{pair.studentB.name}</span>
                            <span className="text-xs font-normal text-[#666666]">({pair.studentB.regNo})</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {isZeroed ? (
                          <Badge variant="danger" className="text-xs">
                            <ShieldAlert size={12} className="mr-1 inline" />
                            Confirmed Cheating · 0 Marks Awarded
                          </Badge>
                        ) : isCritical ? (
                          <Badge variant="danger" className="text-xs">
                            <ShieldAlert size={12} className="mr-1 inline" />
                            Critical Match · {Math.round(pair.overallSimilarity * 100)}% Copied
                          </Badge>
                        ) : (
                          <Badge variant="warning" className="text-xs">
                            <TrendingDown size={12} className="mr-1 inline" />
                            Suspicious · {Math.round(pair.overallSimilarity * 100)}% Match
                          </Badge>
                        )}
                        <span className="text-xs text-[#888888] font-medium">
                          {pair.matchedQuestionsCount} question(s) flagged
                        </span>
                      </div>
                    </div>

                    {/* Matched Questions Preview Pills */}
                    <div className="flex flex-wrap gap-2">
                      {pair.questions.map((q) => (
                        <div
                          key={q.questionId}
                          className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1 text-xs"
                        >
                          <span className="font-bold text-amber-950">Q{q.questionNumber}:</span>
                          <span className="text-amber-900 truncate max-w-[220px]" title={q.questionText}>
                            {q.questionText}
                          </span>
                          <span className="font-black text-amber-800">
                            {Math.round(q.similarityScore * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#F5EFE6]">
                      <div className="text-xs text-[#888888]">
                        Open side-by-side comparison to view text highlights and confirm or dismiss.
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSelectedPair(pair);
                            setActiveQuestionTab('all');
                            setComparisonModalOpen(true);
                          }}
                        >
                          <ArrowRightLeft size={14} className="mr-1.5 text-[#005461]" />
                          Compare Answers Side-by-Side
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setSelectedPair(pair);
                            setConfirmCheatingOpen(true);
                          }}
                        >
                          <ShieldAlert size={14} className="mr-1.5" />
                          Confirm Cheating (Award 0)
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : filteredResults.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <CheckCircle2 size={32} className="text-green-500" />
            <p className="text-sm font-medium text-[#1A1A1A]">All clear!</p>
            <p className="text-xs text-[#888888]">
              {filter === 'all' && (results.length > 0 ? 'All questions have been reviewed. Publish when ready.' : 'No results pending review')}
              {filter === 'flagged' && 'No flagged answers found'}
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
                      {(() => {
                        const liveScore = getLiveScore(result);
                        return (
                          <>
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-sm font-semibold text-[#1A1A1A]">{result.studentName}</p>
                                <p className="text-xs text-[#888888]">
                                  Roll no. on paper: {result.registrationNo || 'Not detected'}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-[#005461]">
                                  {liveScore.score}/{liveScore.max}
                                </p>
                                <p className="text-xs text-[#888888]">
                                  {liveScore.percent}%
                                </p>
                              </div>
                            </div>
                            <p className="text-xs text-[#666666]">
                              {result.entries.filter((entry) => entry.reviewStatus !== 'pending').length}
                              {' / '}
                              {result.entries.length} questions reviewed
                              {result.entries.some((entry) => entry.reviewStatus !== 'pending') &&
                                ` · Current ${liveScore.score}/${liveScore.max}`}
                            </p>
                          </>
                        );
                      })()}
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
                    {(() => {
                      const live = getLiveScore(selectedStudent);
                      return (
                        <>
                          <div>
                            <p className="text-xs text-[#888888]">Total Score</p>
                            <p className="text-xl font-bold text-[#005461] mt-1">
                              {live.score}/{live.max}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-[#888888]">Percentage</p>
                            <p className="text-xl font-bold text-[#005461] mt-1">
                              {live.percent}%
                            </p>
                          </div>
                        </>
                      );
                    })()}
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
                  Highlighted OMR MCQ Sheet ({getLiveScore(selectedStudent).score}/{selectedStudent.totalMaxMarks})
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

      {/* Side-by-Side Answer Comparison Modal */}
      {comparisonModalOpen && selectedPair && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setComparisonModalOpen(false)}
        >
          <div
            className="relative flex flex-col max-h-[94vh] w-full max-w-5xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-[#E8DCC8]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex flex-wrap items-start justify-between gap-3 p-5 border-b border-[#E8DCC8] bg-[#FAF8F5]">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldAlert size={20} className="text-[#005461]" />
                  <h3 className="text-lg font-bold text-[#1A1A1A]">
                    Academic Integrity Review · Side-by-Side Comparison
                  </h3>
                </div>
                <p className="mt-1 text-xs text-[#666666]">
                  Comparing answers between <strong className="text-[#1A1A1A]">{selectedPair.studentA.name}</strong> ({selectedPair.studentA.regNo}) and <strong className="text-[#1A1A1A]">{selectedPair.studentB.name}</strong> ({selectedPair.studentB.regNo}).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-red-100 text-red-800 border border-red-200">
                  {Math.round(selectedPair.overallSimilarity * 100)}% Overall Match
                </span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#005461] text-white">
                  {selectedPair.matchedQuestionsCount} Flagged Question{selectedPair.matchedQuestionsCount === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={() => setComparisonModalOpen(false)}
                  className="rounded-lg p-1.5 text-[#666666] hover:bg-[#F5EFE6] hover:text-[#1A1A1A] ml-2"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Question Filter Tabs */}
            {selectedPair.questions.length > 1 && (
              <div className="flex items-center gap-2 px-5 py-2.5 bg-white border-b border-[#E8DCC8] overflow-x-auto">
                <span className="text-xs font-bold text-[#888888] uppercase tracking-wider mr-1">
                  View:
                </span>
                <button
                  type="button"
                  onClick={() => setActiveQuestionTab('all')}
                  className={cn(
                    'px-3 py-1 rounded-lg text-xs font-medium transition-colors',
                    activeQuestionTab === 'all'
                      ? 'bg-[#005461] text-white'
                      : 'bg-[#F5EFE6] text-[#444444] hover:bg-[#E8DCC8]'
                  )}
                >
                  All Questions ({selectedPair.questions.length})
                </button>
                {selectedPair.questions.map((q) => (
                  <button
                    key={q.questionId}
                    type="button"
                    onClick={() => setActiveQuestionTab(q.questionNumber)}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-medium transition-colors',
                      activeQuestionTab === q.questionNumber
                        ? 'bg-[#005461] text-white'
                        : 'bg-[#F5EFE6] text-[#444444] hover:bg-[#E8DCC8]'
                    )}
                  >
                    Question {q.questionNumber} ({Math.round(q.similarityScore * 100)}%)
                  </button>
                ))}
              </div>
            )}

            {/* Modal Body: Scrollable Question Comparisons */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-[#FAF8F5]">
              {selectedPair.questions
                .filter((q) => activeQuestionTab === 'all' || activeQuestionTab === q.questionNumber)
                .map((q) => {
                  return (
                    <div
                      key={q.questionId}
                      className="rounded-2xl border border-[#E8DCC8] bg-white p-5 shadow-sm space-y-4"
                    >
                      {/* Question Bar */}
                      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[#F5EFE6]">
                        <div className="flex-1 min-w-0">
                          <span className="inline-block px-2.5 py-0.5 rounded text-xs font-bold bg-[#005461] text-white mb-1">
                            Question {q.questionNumber}
                          </span>
                          <h4 className="text-sm font-bold text-[#1A1A1A]">
                            {q.questionText}
                          </h4>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-amber-100 text-amber-900 border border-amber-200">
                            Composite: {Math.round(q.similarityScore * 100)}%
                          </span>
                          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-900 border border-blue-200">
                            Semantic: {Math.round((q.semanticScore || q.similarityScore) * 100)}%
                          </span>
                          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-900 border border-emerald-200">
                            Verbatim: {Math.round((q.verbatimRatio || 0) * 100)}%
                          </span>
                        </div>
                      </div>

                      {/* Dual-Pane Side-by-Side Comparison */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Student A Pane */}
                        <div className="rounded-xl border border-blue-200 bg-white overflow-hidden shadow-sm">
                          <div className="bg-blue-50/70 px-4 py-2.5 border-b border-blue-200 flex items-center justify-between">
                            <span className="text-xs font-bold text-blue-950">
                              {selectedPair.studentA.name}
                            </span>
                            <span className="text-[11px] font-medium text-blue-800">
                              Roll: {selectedPair.studentA.regNo}
                            </span>
                          </div>
                          <div className="p-4 text-xs leading-relaxed max-h-[300px] overflow-y-auto">
                            <HighlightedAnswerText
                              text={q.answerA}
                              segments={q.matchedSegments}
                              side="A"
                            />
                          </div>
                        </div>

                        {/* Student B Pane */}
                        <div className="rounded-xl border border-amber-200 bg-white overflow-hidden shadow-sm">
                          <div className="bg-amber-50/70 px-4 py-2.5 border-b border-amber-200 flex items-center justify-between">
                            <span className="text-xs font-bold text-amber-950">
                              {selectedPair.studentB.name}
                            </span>
                            <span className="text-[11px] font-medium text-amber-800">
                              Roll: {selectedPair.studentB.regNo}
                            </span>
                          </div>
                          <div className="p-4 text-xs leading-relaxed max-h-[300px] overflow-y-auto">
                            <HighlightedAnswerText
                              text={q.answerB}
                              segments={q.matchedSegments}
                              side="B"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Highlights Key & Analysis Box */}
                      <div className="rounded-xl bg-[#F5EFE6]/60 border border-[#E8DCC8] p-3 text-xs text-[#555555] flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-3.5 h-3.5 rounded bg-amber-200 border border-amber-400"></span>
                          <span><strong>Yellow highlighted spans</strong> show verbatim identical or near-identical matching phrases.</span>
                        </div>
                        <span className="text-[11px] text-[#777777]">
                          {q.matchedSegments?.length || 0} matching sequence block(s) detected
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Modal Sticky Bottom Action Footer */}
            <div className="p-4 border-t border-[#E8DCC8] bg-white flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="ghost"
                type="button"
                onClick={() => handleDecideSimilarity(selectedPair, 'dismiss')}
                loading={submittingPenalty}
                disabled={submittingPenalty}
              >
                <Check size={14} className="mr-1.5 text-emerald-600" />
                Dismiss Flag (Accept as Independent)
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setComparisonModalOpen(false)}
                >
                  Close
                </Button>
                <Button
                  variant="danger"
                  type="button"
                  onClick={() => setConfirmCheatingOpen(true)}
                  disabled={submittingPenalty}
                >
                  <ShieldAlert size={14} className="mr-1.5" />
                  Confirm Cheating &amp; Award Zero (0) Marks
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Cheating Penalty Dialog */}
      {confirmCheatingOpen && selectedPair && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setConfirmCheatingOpen(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 border border-red-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E8DCC8]">
              <div className="flex items-center gap-2 text-red-700">
                <ShieldAlert size={20} />
                <h3 className="text-base font-bold text-[#1A1A1A]">Confirm Cheating &amp; Impose Penalty</h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmCheatingOpen(false)}
                className="rounded-lg p-1 text-[#666666] hover:bg-[#F5EFE6]"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-[#555555] leading-relaxed">
              Applying this penalty will award <strong>zero (0) marks</strong> for the assessment, record an official academic integrity violation audit, attach the side-by-side evidence report, and notify the student(s).
            </p>

            <div className="space-y-3 pt-1">
              <label className="text-xs font-bold text-[#1A1A1A] block">
                Select penalty recipient:
              </label>

              <div className="space-y-2 text-xs">
                <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-[#E8DCC8] hover:border-[#005461] cursor-pointer transition-colors bg-[#FAF8F5]">
                  <input
                    type="radio"
                    name="penaltyTarget"
                    value="both"
                    checked={penaltyTarget === 'both'}
                    onChange={() => setPenaltyTarget('both')}
                    className="mt-0.5 accent-red-600"
                  />
                  <div>
                    <span className="font-bold text-[#1A1A1A] block">
                      Award Zero to Both Students (Recommended)
                    </span>
                    <span className="text-[#666666]">
                      {selectedPair.studentA.name} ({selectedPair.studentA.regNo}) &amp; {selectedPair.studentB.name} ({selectedPair.studentB.regNo})
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-[#E8DCC8] hover:border-[#005461] cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="penaltyTarget"
                    value="student_b"
                    checked={penaltyTarget === 'student_b'}
                    onChange={() => setPenaltyTarget('student_b')}
                    className="mt-0.5 accent-red-600"
                  />
                  <div>
                    <span className="font-bold text-[#1A1A1A] block">
                      Award Zero to {selectedPair.studentB.name} Only
                    </span>
                    <span className="text-[#666666]">
                      Roll: {selectedPair.studentB.regNo} (If Student B copied without permission)
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-[#E8DCC8] hover:border-[#005461] cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="penaltyTarget"
                    value="student_a"
                    checked={penaltyTarget === 'student_a'}
                    onChange={() => setPenaltyTarget('student_a')}
                    className="mt-0.5 accent-red-600"
                  />
                  <div>
                    <span className="font-bold text-[#1A1A1A] block">
                      Award Zero to {selectedPair.studentA.name} Only
                    </span>
                    <span className="text-[#666666]">
                      Roll: {selectedPair.studentA.regNo}
                    </span>
                  </div>
                </label>
              </div>

              <div className="space-y-1 pt-2">
                <label className="text-xs font-bold text-[#1A1A1A]">
                  Instructor Penalty Explanation / Reason:
                </label>
                <textarea
                  value={cheatingNotes}
                  onChange={(e) => setCheatingNotes(e.target.value)}
                  rows={3}
                  className="w-full text-xs rounded-xl border border-[#E8DCC8] p-3 focus:outline-none focus:border-[#005461]"
                  placeholder="Explain the academic integrity violation..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E8DCC8]">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setConfirmCheatingOpen(false)}
                disabled={submittingPenalty}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                type="button"
                onClick={() => handleDecideSimilarity(selectedPair, 'confirm_cheating')}
                loading={submittingPenalty}
                disabled={submittingPenalty}
              >
                <ShieldAlert size={14} className="mr-1.5" />
                Confirm Cheating &amp; Award 0 Marks
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