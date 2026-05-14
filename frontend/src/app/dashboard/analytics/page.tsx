'use client';

import { Suspense } from 'react';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  BarChart3,
  Download,
  AlertCircle,
  Loader,
  TrendingUp,
  Users,
  Award,
  BookOpen,
  ChevronDown,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { analyticsApi, examApi } from '@/lib/api';
import type { AnalyticsReport, Exam } from '@/types';
import { cn } from '@/lib/utils';

function AnalyticsContent() {
  const searchParams = useSearchParams();

  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>(
    searchParams.get('examId') || ''
  );
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  // Load all exams for the dropdown
  useEffect(() => {
    examApi.getAll().then(setExams).catch(() => setExams([]));
  }, []);

  // Load analytics when exam selected
  useEffect(() => {
    if (!selectedExamId) {
      setReport(null);
      return;
    }
    setLoading(true);
    setError('');
    analyticsApi
      .getReport(selectedExamId)
      .then(setReport)
      .catch(() => setError('Failed to load analytics data'))
      .finally(() => setLoading(false));
  }, [selectedExamId]);

  const handleExport = async () => {
    if (!selectedExamId) return;
    setExporting(true);
    try {
      await analyticsApi.exportCSV(selectedExamId);
    } catch {
      setError('Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  const getCLOAttainmentColor = (percent: number) => {
    if (percent >= 75) return 'bg-green-500';
    if (percent >= 50) return 'bg-[#FAB963]';
    return 'bg-red-500';
  };

  const getDifficultyColor = (difficulty: number) => {
    if (difficulty < 0.3) return 'text-green-600';
    if (difficulty < 0.7) return 'text-[#FAB963]';
    return 'text-red-600';
  };

  const getDifficultyBg = (difficulty: number) => {
    if (difficulty < 0.3) return 'bg-green-50 border-green-200';
    if (difficulty < 0.7) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  const selectedExam = exams.find((e) => e.id === selectedExamId);

  return (
    <div className="space-y-6 max-w-6xl">

      {/* Exam Selector */}
      <Card>
        <h3 className="text-sm font-semibold text-[#005461] mb-4 uppercase tracking-wide">
          Select Exam
        </h3>
        <div className="relative">
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="w-full px-3 py-2.5 text-sm rounded-lg border border-[#E8DCC8] bg-white text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#005461] appearance-none pr-10"
          >
            <option value="">— Select an exam to view analytics —</option>
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.title} · {exam.course} · {exam.term}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="absolute right-3 top-3 text-[#888888] pointer-events-none"
          />
        </div>

        {selectedExam && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#E8DCC8]">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs text-[#888888]">Course</p>
                <p className="text-sm font-medium text-[#1A1A1A]">{selectedExam.course}</p>
              </div>
              <div>
                <p className="text-xs text-[#888888]">Term</p>
                <p className="text-sm font-medium text-[#1A1A1A]">{selectedExam.term}</p>
              </div>
              <div>
                <p className="text-xs text-[#888888]">Total Marks</p>
                <p className="text-sm font-medium text-[#1A1A1A]">{selectedExam.totalMarks}</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleExport}
              loading={exporting}
              disabled={!report}
            >
              <Download size={14} className="mr-2" />
              Export CSV
            </Button>
          </div>
        )}
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-red-500" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </Card>
      )}

      {/* No exam selected */}
      {!selectedExamId && (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <BarChart3 size={32} className="text-[#E8DCC8]" />
            <p className="text-sm text-[#888888]">
              Select an exam above to view class analytics
            </p>
          </div>
        </Card>
      )}

      {/* Loading */}
      {selectedExamId && loading && (
        <Card>
          <div className="flex items-center justify-center py-12 gap-3">
            <Loader size={18} className="text-[#005461] animate-spin" />
            <p className="text-sm text-[#888888]">Loading analytics...</p>
          </div>
        </Card>
      )}

      {/* No data yet */}
      {selectedExamId && !loading && !error && report && report.totalStudents === 0 && (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertCircle size={32} className="text-[#E8DCC8]" />
            <p className="text-sm text-[#888888]">
              No evaluated results yet for this exam
            </p>
            <p className="text-xs text-[#888888]">
              Upload answer sheets and run evaluation first
            </p>
          </div>
        </Card>
      )}

      {/* Analytics Data */}
      {selectedExamId && !loading && report && report.totalStudents > 0 && (
        <>
          {/* Score Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <div className="text-center">
                <div className="w-12 h-12 bg-[#FFF8EB] rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Users size={20} className="text-[#005461]" />
                </div>
                <p className="text-xs text-[#888888] uppercase tracking-wide">Total Students</p>
                <p className="text-2xl font-bold text-[#1A1A1A] mt-1">
                  {report.totalStudents}
                </p>
              </div>
            </Card>

            <Card>
              <div className="text-center">
                <div className="w-12 h-12 bg-[#FFF8EB] rounded-lg flex items-center justify-center mx-auto mb-3">
                  <TrendingUp size={20} className="text-[#005461]" />
                </div>
                <p className="text-xs text-[#888888] uppercase tracking-wide">Average Score</p>
                <p className="text-2xl font-bold text-[#005461] mt-1">
                  {report.averageScore.toFixed(1)}
                </p>
              </div>
            </Card>

            <Card>
              <div className="text-center">
                <div className="w-12 h-12 bg-[#FFF8EB] rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Award size={20} className="text-[#005461]" />
                </div>
                <p className="text-xs text-[#888888] uppercase tracking-wide">Highest Score</p>
                <p className="text-2xl font-bold text-green-600 mt-1">
                  {report.highestScore.toFixed(1)}
                </p>
              </div>
            </Card>

            <Card>
              <div className="text-center">
                <div className="w-12 h-12 bg-[#FFF8EB] rounded-lg flex items-center justify-center mx-auto mb-3">
                  <TrendingUp size={20} className="text-[#005461] rotate-180" />
                </div>
                <p className="text-xs text-[#888888] uppercase tracking-wide">Lowest Score</p>
                <p className="text-2xl font-bold text-red-600 mt-1">
                  {report.lowestScore.toFixed(1)}
                </p>
              </div>
            </Card>
          </div>

          {/* Score Distribution */}
          {report.scoreDistribution && report.scoreDistribution.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-[#1A1A1A] mb-4 flex items-center gap-2">
                <BarChart3 size={16} className="text-[#005461]" />
                Score Distribution
              </h3>
              <div className="space-y-3">
                {report.scoreDistribution.map((item, idx) => {
                  const maxCount = Math.max(
                    ...report.scoreDistribution.map((s) => s.count),
                    1
                  );
                  return (
                    <div key={idx}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-[#1A1A1A]">
                          {item.range}%
                        </span>
                        <span className="text-xs text-[#888888]">
                          {item.count} student{item.count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="w-full bg-[#E8DCC8] rounded-full h-2">
                        <div
                          className="bg-[#005461] h-2 rounded-full transition-all duration-500"
                          style={{ width: `${(item.count / maxCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* CLO Attainment */}
          {report.cloAttainment && report.cloAttainment.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-[#1A1A1A] mb-4 flex items-center gap-2">
                <Award size={16} className="text-[#005461]" />
                Course Learning Outcome (CLO) Attainment
              </h3>
              <div className="space-y-4">
                {report.cloAttainment.map((clo, idx) => (
                  <div
                    key={idx}
                    className="pb-4 border-b border-[#E8DCC8] last:pb-0 last:border-b-0"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-medium text-[#1A1A1A]">{clo.clo}</p>
                        <p className="text-xs text-[#888888]">
                          {clo.studentsMet} of {clo.totalStudents} students met target (≥50%)
                        </p>
                      </div>
                      <Badge
                        variant={
                          clo.attainmentPercent >= 75
                            ? 'success'
                            : clo.attainmentPercent >= 50
                            ? 'amber'
                            : 'danger'
                        }
                      >
                        {clo.attainmentPercent}%
                      </Badge>
                    </div>
                    <div className="w-full bg-[#E8DCC8] rounded-full h-2.5">
                      <div
                        className={cn(
                          'h-2.5 rounded-full transition-all duration-500',
                          getCLOAttainmentColor(clo.attainmentPercent)
                        )}
                        style={{ width: `${clo.attainmentPercent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Question Difficulty Index */}
          {report.questionDifficulty && report.questionDifficulty.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-[#1A1A1A] mb-4 flex items-center gap-2">
                <BookOpen size={16} className="text-[#005461]" />
                Question Difficulty Index
              </h3>
              <div className="space-y-2">
                {report.questionDifficulty.map((q, idx) => (
                  <Card
                    key={q.questionId}
                    padding="sm"
                    className={cn('border', getDifficultyBg(q.difficultyIndex))}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 mr-4">
                        <p className="text-sm font-medium text-[#1A1A1A]">
                          Q{idx + 1}:{' '}
                          {q.questionText.length > 80
                            ? q.questionText.substring(0, 80) + '...'
                            : q.questionText}
                        </p>
                        <p className="text-xs text-[#888888] mt-1">
                          Avg Score: {q.averageMark.toFixed(1)} / {q.maxMarks}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={cn('text-sm font-bold', getDifficultyColor(q.difficultyIndex))}>
                          {(q.difficultyIndex * 100).toFixed(0)}%
                        </p>
                        <p className="text-xs text-[#888888]">
                          {q.difficultyIndex < 0.3
                            ? 'Easy'
                            : q.difficultyIndex < 0.7
                            ? 'Medium'
                            : 'Hard'}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </Card>
          )}

          {/* Summary */}
          <Card>
            <h3 className="text-sm font-semibold text-[#1A1A1A] mb-4">Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-[#888888] uppercase tracking-wide">
                  Pass Rate (≥50%)
                </p>
                <p className="text-lg font-bold text-[#005461] mt-1">
                  {report.totalStudents > 0
                    ? Math.round(
                        (report.scoreDistribution
                          .filter((s) => {
                            const min = parseInt(s.range.split('-')[0]);
                            return min >= 50;
                          })
                          .reduce((acc, s) => acc + s.count, 0) /
                          report.totalStudents) *
                          100
                      )
                    : 0}
                  %
                </p>
              </div>
              <div>
                <p className="text-xs text-[#888888] uppercase tracking-wide">
                  Avg Difficulty
                </p>
                <p className="text-lg font-bold text-[#005461] mt-1">
                  {report.questionDifficulty.length > 0
                    ? (
                        report.questionDifficulty.reduce(
                          (acc, q) => acc + q.difficultyIndex,
                          0
                        ) / report.questionDifficulty.length
                      ).toFixed(2)
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#888888] uppercase tracking-wide">Total CLOs</p>
                <p className="text-lg font-bold text-[#005461] mt-1">
                  {report.cloAttainment.length}
                </p>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 max-w-6xl">
          <Card>
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader size={18} className="text-[#005461] animate-spin" />
              <p className="text-sm text-[#888888]">Loading analytics...</p>
            </div>
          </Card>
        </div>
      }
    >
      <AnalyticsContent />
    </Suspense>
  );
}