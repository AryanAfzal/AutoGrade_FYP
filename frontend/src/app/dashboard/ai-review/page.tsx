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
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { evaluationApi, examApi } from '@/lib/api';
import type { StudentResult, Exam, SimilarityFlag, SimilarityReport } from '@/types';
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
  const [filter, setFilter] = useState<'all' | 'flagged' | 'high-similarity'>('all');

  useEffect(() => {
    if (!examId) return;

    setLoading(true);
    Promise.all([
      examApi.getById(examId).catch(() => null),
      evaluationApi.getResults(examId).catch(() => []),
      evaluationApi.getSimilarityFlags(examId).catch(() => null),
    ])
      .then(([examData, resultsData, similarityData]) => {
        setExam(examData);
        setResults(resultsData.filter((r) => r.status === 'awaiting_approval'));

        // Backend returns { examId, summary, flaggedPairs }
        if (Array.isArray(similarityData)) {
          setSimilarities(similarityData);
        } else if (similarityData && Array.isArray((similarityData as SimilarityReport).flaggedPairs)) {
          setSimilarities((similarityData as SimilarityReport).flaggedPairs);
        } else {
          setSimilarities([]);
        }
      })
      .catch(() => setError('Failed to load review data'))
      .finally(() => setLoading(false));
  }, [examId]);

  const handleApprove = async (studentId: string) => {
    try {
      await evaluationApi.publishResults(examId!);
      setResults((prev) => prev.filter((r) => r.answersheetId !== studentId));
    } catch {
      setError('Failed to approve result');
    }
  };

  const selectedStudent = selectedStudentId
    ? results.find((r) => r.answersheetId === selectedStudentId)
    : null;

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
        <h2 className="text-2xl font-bold text-[#1A1A1A]">AI Review</h2>
        <p className="text-sm text-[#888888] mt-1">
          Review AI-evaluated results before publishing · {filteredResults.length} pending
        </p>
      </div>

      {/* Exam info */}
      {exam && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#005461] uppercase tracking-wide">{exam.title}</p>
              <p className="text-xs text-[#888888] mt-1">{exam.course} · {exam.term}</p>
            </div>
            <Badge variant="info">Awaiting Review</Badge>
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
              {filter === 'all' && 'No results pending review'}
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
                          <p className="text-xs text-[#888888]">{result.registrationNo}</p>
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
                  <div>
                    <h3 className="text-base font-semibold text-[#1A1A1A]">{selectedStudent.studentName}</h3>
                    <p className="text-sm text-[#888888]">{selectedStudent.registrationNo}</p>
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
                            Q{idx + 1}: {entry.questionText.substring(0, 60)}...
                          </p>
                          <div className="flex gap-2 mt-2 flex-wrap">
                            <Badge variant="default">{entry.aiMark}/{entry.maxMarks}</Badge>
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
                      </div>

                      {entry.isFlagged && (
                        <div className="bg-white rounded border border-[#E8DCC8] p-2 mt-2">
                          <p className="text-xs font-medium text-[#888888] mb-1">Student Answer:</p>
                          <p className="text-xs text-[#1A1A1A] line-clamp-3">{entry.studentAnswer}</p>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-4">
                <Button
                  variant="primary"
                  onClick={() => handleApprove(selectedStudent.answersheetId)}
                  className="flex-1"
                >
                  <CheckCircle2 size={14} className="mr-2" />
                  Approve & Publish
                </Button>
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