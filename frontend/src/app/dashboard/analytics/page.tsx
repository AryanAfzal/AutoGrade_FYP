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
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { analyticsApi, examApi } from '@/lib/api';
import type { AnalyticsReport, Exam, CLOAttainment, QuestionDifficulty } from '@/types';
import { cn, calculatePercentage } from '@/lib/utils';

function AnalyticsContent() {
  const searchParams = useSearchParams();
  const examId = searchParams.get('examId');

  const [exam, setExam] = useState<Exam | null>(null);
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!examId) return;

    setLoading(true);
    Promise.all([
      examApi.getById(examId).catch(() => null),
      analyticsApi.getReport(examId).catch(() => null),
    ])
      .then(([examData, reportData]) => {
        setExam(examData);
        setReport(reportData);
      })
      .catch(() => setError('Failed to load analytics'))
      .finally(() => setLoading(false));
  }, [examId]);

  const handleExport = async () => {
    if (!examId) return;
    setExporting(true);
    try {
      await analyticsApi.exportCSV(examId);
      // Trigger download
      const link = document.createElement('a');
      link.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/analytics/${examId}/export`;
      link.download = `analytics-${examId}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setError('Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  const getDifficultyColor = (difficulty: number): string => {
    if (difficulty < 0.3) return 'text-green-600';
    if (difficulty < 0.7) return 'text-[#FAB963]';
    return 'text-red-600';
  };

  const getDifficultyBg = (difficulty: number): string => {
    if (difficulty < 0.3) return 'bg-green-50 border-green-200';
    if (difficulty < 0.7) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  const getCLOAttainmentColor = (percent: number): string => {
    if (percent >= 75) return 'bg-green-500';
    if (percent >= 50) return 'bg-[#FAB963]';
    return 'bg-red-500';
  };

  if (!examId) {
    return (
      <div className="space-y-6 max-w-6xl">
        <Card>
          <div className="flex items-center justify-center py-12 gap-3">
            <AlertCircle size={20} className="text-[#FAB963]" />
            <p className="text-sm text-[#888888]">
              Please select an exam from the dashboard
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-[#1A1A1A]">Class Analytics</h2>
        <p className="text-sm text-[#888888] mt-1">
          Performance insights and learning outcome attainment
        </p>
      </div>

      {/* Exam info */}
      {exam && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#005461] uppercase tracking-wide">
                {exam.title}
              </p>
              <p className="text-xs text-[#888888] mt-1">
                {exam.course} · {exam.term}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleExport}
              loading={exporting}
            >
              <Download size={14} className="mr-2" />
              Export CSV
            </Button>
          </div>
        </Card>
      )}

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
            <p className="text-sm text-[#888888]">Loading analytics...</p>
          </div>
        </Card>
      ) : report ? (
        <>
          {/* Score Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                {report.scoreDistribution.map((item, idx) => (
                  <div key={idx}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-[#1A1A1A]">{item.range}</span>
                      <span className="text-xs text-[#888888]">{item.count} students</span>
                    </div>
                    <div className="w-full bg-[#E8DCC8] rounded-full h-2">
                      <div
                        className="bg-[#005461] h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${(item.count / Math.max(...report.scoreDistribution.map((s) => s.count))) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* CLO Attainment */}
          <Card>
            <h3 className="text-sm font-semibold text-[#1A1A1A] mb-4 flex items-center gap-2">
              <Award size={16} className="text-[#005461]" />
              Course Learning Outcome (CLO) Attainment
            </h3>
            <div className="space-y-4">
              {report.cloAttainment.map((clo, idx) => (
                <div key={idx} className="pb-4 border-b border-[#E8DCC8] last:pb-0 last:border-b-0">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-[#1A1A1A]">{clo.clo}</p>
                      <p className="text-xs text-[#888888]">
                        {clo.studentsMet} of {clo.totalStudents} students met target
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
                        'h-2.5 rounded-full transition-all duration-300',
                        getCLOAttainmentColor(clo.attainmentPercent)
                      )}
                      style={{ width: `${clo.attainmentPercent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Question Difficulty Index */}
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
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#1A1A1A]">
                        Q{idx + 1}: {q.questionText.substring(0, 60)}...
                      </p>
                      <p className="text-xs text-[#888888] mt-1">
                        Avg Score: {q.averageMark.toFixed(1)}/{q.maxMarks}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn('text-sm font-bold', getDifficultyColor(q.difficultyIndex))}>
                        {(q.difficultyIndex * 100).toFixed(0)}%
                      </p>
                      <p className="text-xs text-[#888888]">
                        {q.difficultyIndex < 0.3 ? 'Easy' : q.difficultyIndex < 0.7 ? 'Medium' : 'Hard'}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </Card>

          {/* Summary statistics */}
          <Card>
            <h3 className="text-sm font-semibold text-[#1A1A1A] mb-4">Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-[#888888] uppercase tracking-wide">Pass Rate (≥50%)</p>
                <p className="text-lg font-bold text-[#005461] mt-1">
                  {Math.round(
                    ((report.scoreDistribution?.reduce((acc, s) => {
                      if (
                        s.range === '50-60%' ||
                        s.range === '60-70%' ||
                        s.range === '70-80%' ||
                        s.range === '80-90%' ||
                        s.range === '90-100%'
                      ) {
                        return acc + s.count;
                      }
                      return acc;
                    }, 0) || 0) /
                      report.totalStudents) *
                      100
                  )}%
                </p>
              </div>
              <div>
                <p className="text-xs text-[#888888] uppercase tracking-wide">Avg Difficulty</p>
                <p className="text-lg font-bold text-[#005461] mt-1">
                  {(
                    report.questionDifficulty.reduce((acc, q) => acc + q.difficultyIndex, 0) /
                    report.questionDifficulty.length
                  ).toFixed(2)}
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
      ) : (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertCircle size={32} className="text-[#E8DCC8]" />
            <p className="text-sm text-[#888888]">No analytics data available yet</p>
          </div>
        </Card>
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
