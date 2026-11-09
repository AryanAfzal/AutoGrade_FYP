'use client';

import { Suspense } from 'react';
import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BarChart3,
  Download,
  AlertCircle,
  Loader,
  TrendingUp,
  Users,
  Award,
  ChevronDown,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { analyticsApi, examApi } from '@/lib/api';
import type { AnalyticsReport, Exam } from '@/types';

function AnalyticsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>(
    searchParams.get('examId') || ''
  );
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

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

  // Load all exams for the dropdown
  useEffect(() => {
    examApi.getAll()
      .then(setExams)
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : 'Failed to load exams.'),
      );
  }, []);

  // Load analytics when exam selected
  useEffect(() => {
    if (!selectedExamId) {
      setReport(null);
      setSelectedStudentId(null);
      return;
    }
    setLoading(true);
    setError('');
    analyticsApi
      .getReport(selectedExamId)
      .then((analyticsReport) => {
        setReport(analyticsReport);
        setSelectedStudentId(analyticsReport.students[0]?.resultId ?? null);
      })
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : 'Failed to load analytics data.'),
      )
      .finally(() => setLoading(false));
  }, [selectedExamId]);

  const handleExport = async () => {
    if (!selectedExamId) return;
    setExporting(true);
    try {
      await analyticsApi.exportCSV(selectedExamId);
    } catch (exportError: unknown) {
      setError(exportError instanceof Error ? exportError.message : 'Failed to export CSV.');
    } finally {
      setExporting(false);
    }
  };

  const selectedExam = exams.find((e) => e.id === selectedExamId);
  const selectedStudent = useMemo(
    () => report?.students.find((student) => student.resultId === selectedStudentId) ?? null,
    [report, selectedStudentId],
  );
  const studentChartData = useMemo(
    () =>
      selectedStudent?.questions.map((question) => ({
        question: `Q${question.questionNumber} · ${question.clo}`,
        mark: question.mark,
        maxMarks: question.maxMarks,
      })) ?? [],
    [selectedStudent],
  );

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
                  {report.averageScore.toFixed(1)} <span className="text-sm font-medium text-[#888888]">/ {report.examTotalMarks}</span>
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
                  {report.highestScore.toFixed(1)} <span className="text-sm font-medium text-[#888888]">/ {report.examTotalMarks}</span>
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
                  {report.lowestScore.toFixed(1)} <span className="text-sm font-medium text-[#888888]">/ {report.examTotalMarks}</span>
                </p>
              </div>
            </Card>
          </div>

          <Card>
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
                <Users size={16} className="text-[#005461]" />
                Student papers and total marks
              </h3>
              <p className="mt-1 text-xs text-[#777777]">
                Select a student row to see their question-by-question attainment and CLO totals.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E8DCC8] text-xs uppercase tracking-wide text-[#777777]">
                    <th className="px-3 py-3 font-semibold">Roll number</th>
                    <th className="px-3 py-3 font-semibold">Student</th>
                    <th className="px-3 py-3 text-right font-semibold">Total marks</th>
                    <th className="px-3 py-3 text-right font-semibold">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {report.students.map((student) => (
                    <tr key={student.resultId} className="border-b border-[#F1EADF] last:border-0">
                      <td colSpan={4} className="p-0">
                        <button
                          type="button"
                          aria-pressed={selectedStudentId === student.resultId}
                          onClick={() => setSelectedStudentId(student.resultId)}
                          className={`grid w-full grid-cols-4 items-center text-left transition-colors ${
                            selectedStudentId === student.resultId
                              ? 'bg-[#EAF5F6]'
                              : 'hover:bg-[#FFF8EB]'
                          }`}
                        >
                          <span className="px-3 py-3 font-semibold text-[#005461]">{student.rollNumber || '—'}</span>
                          <span className="px-3 py-3 text-[#333333]">{student.studentName}</span>
                          <span className="px-3 py-3 text-right font-semibold text-[#1A1A1A]">
                            {student.totalMarks} / {student.maxMarks}
                          </span>
                          <span className="px-3 py-3 text-right text-[#666666]">
                            {student.maxMarks ? `${((student.totalMarks / student.maxMarks) * 100).toFixed(1)}%` : '—'}
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {selectedStudent && (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-[#1A1A1A]">
                    {selectedStudent.studentName}
                  </h3>
                  <p className="mt-1 text-sm text-[#666666]">
                    Roll number: <strong>{selectedStudent.rollNumber || 'Not recorded'}</strong>
                  </p>
                </div>
                <p className="text-lg font-bold text-[#005461]">
                  {selectedStudent.totalMarks} / {selectedStudent.maxMarks}
                </p>
              </div>

              {studentChartData.length > 0 ? (
                <div className="mt-5">
                  <h4 className="text-sm font-semibold text-[#1A1A1A]">
                    CLO attainment by question
                  </h4>
                  <p className="mt-1 text-xs text-[#777777]">
                    Each point shows the awarded mark; the second line shows that question&apos;s maximum. CLOs are included on the question axis.
                  </p>
                  <div className="mt-3 h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={studentChartData} margin={{ top: 10, right: 20, left: 0, bottom: 45 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8DCC8" />
                        <XAxis
                          dataKey="question"
                          angle={-30}
                          textAnchor="end"
                          interval={0}
                          height={65}
                          tick={{ fill: '#666666', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          domain={[0, 'dataMax']}
                          tick={{ fill: '#888888', fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: 10, border: '1px solid #E8DCC8', fontSize: 12 }}
                          formatter={(value, name) => [`${value} marks`, name === 'Question maximum' ? 'Question maximum' : 'Student mark']}
                        />
                        <Line
                          type="linear"
                          dataKey="mark"
                          name="Student mark"
                          stroke="#005461"
                          strokeWidth={3}
                          dot={{ r: 5, fill: '#FFFFFF', stroke: '#005461', strokeWidth: 3 }}
                          activeDot={{ r: 7, fill: '#FAB963', stroke: '#FFFFFF', strokeWidth: 2 }}
                        />
                        <Line
                          type="linear"
                          dataKey="maxMarks"
                          name="Question maximum"
                          stroke="#A3A3A3"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={{ r: 3, fill: '#A3A3A3' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-[#777777]">No question-level marks are available for this paper.</p>
              )}

              <div className="mt-5">
                <h4 className="text-sm font-semibold text-[#1A1A1A]">Question marks</h4>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#E8DCC8] text-xs uppercase tracking-wide text-[#777777]">
                        <th className="px-3 py-2 font-semibold">Question</th>
                        <th className="px-3 py-2 font-semibold">CLO</th>
                        <th className="px-3 py-2 text-right font-semibold">Marks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStudent.questions.map((question) => (
                        <tr key={question.questionId} className="border-b border-[#F1EADF] last:border-0">
                          <td className="px-3 py-2.5 text-[#1A1A1A]">
                            Q{question.questionNumber}: {question.questionText}
                          </td>
                          <td className="px-3 py-2.5 text-[#666666]">{question.clo}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-[#005461]">
                            {question.mark} / {question.maxMarks}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-5">
                <h4 className="text-sm font-semibold text-[#1A1A1A]">Marks by CLO</h4>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#E8DCC8] text-xs uppercase tracking-wide text-[#777777]">
                        <th className="px-3 py-2 font-semibold">Learning outcome</th>
                        <th className="px-3 py-2 text-right font-semibold">Marks</th>
                        <th className="px-3 py-2 text-right font-semibold">Attainment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStudent.cloScores.map((item) => (
                        <tr key={item.clo} className="border-b border-[#F1EADF] last:border-0">
                          <td className="px-3 py-2.5 font-medium text-[#1A1A1A]">{item.clo}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-[#005461]">
                            {item.earnedMarks} / {item.possibleMarks}
                          </td>
                          <td className="px-3 py-2.5 text-right text-[#666666]">{item.attainmentPercent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          )}

          {/* Score Distribution */}
          {report.scoreDistribution && report.scoreDistribution.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-[#1A1A1A] mb-4 flex items-center gap-2">
                <BarChart3 size={16} className="text-[#005461]" />
                Score Distribution
              </h3>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={report.scoreDistribution.map((item) => ({
                      range: `${item.range}%`,
                      students: item.count,
                    }))}
                    margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8DCC8" />
                    <XAxis dataKey="range" tick={{ fill: '#888888', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: '#888888', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: '#FFF8EB' }}
                      contentStyle={{ borderRadius: 10, border: '1px solid #E8DCC8', fontSize: 12 }}
                      formatter={(value) => [`${value} students`, 'Students']}
                    />
                    <Bar dataKey="students" radius={[8, 8, 0, 0]} maxBarSize={58}>
                      {report.scoreDistribution.map((_, index) => (
                        <Cell
                          key={index}
                          fill={['#DC2626', '#F59E0B', '#EAB308', '#14B8A6', '#005461'][index]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
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
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={report.cloAttainment.map((clo) => ({
                      clo: clo.clo.length > 18 ? `${clo.clo.slice(0, 18)}…` : clo.clo,
                      attainment: clo.attainmentPercent,
                    }))}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E8DCC8" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: '#888888', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="clo" width={100} tick={{ fill: '#444444', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: '#FFF8EB' }}
                      contentStyle={{ borderRadius: 10, border: '1px solid #E8DCC8', fontSize: 12 }}
                      formatter={(value) => [`${value}%`, 'Attainment']}
                    />
                    <Bar dataKey="attainment" fill="#005461" radius={[0, 8, 8, 0]} maxBarSize={24}>
                      {report.cloAttainment.map((clo, index) => (
                        <Cell
                          key={index}
                          fill={clo.attainmentPercent >= 75 ? '#059669' : clo.attainmentPercent >= 50 ? '#F59E0B' : '#DC2626'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-5 overflow-x-auto">
                <h4 className="text-sm font-semibold text-[#1A1A1A]">Class marks by CLO</h4>
                <table className="mt-2 w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#E8DCC8] text-xs uppercase tracking-wide text-[#777777]">
                      <th className="px-3 py-2 font-semibold">Learning outcome</th>
                      <th className="px-3 py-2 text-right font-semibold">Class marks</th>
                      <th className="px-3 py-2 text-right font-semibold">Attainment</th>
                      <th className="px-3 py-2 text-right font-semibold">Students ≥50%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.cloAttainment.map((clo) => (
                      <tr key={clo.clo} className="border-b border-[#F1EADF] last:border-0">
                        <td className="px-3 py-2.5 font-medium text-[#1A1A1A]">{clo.clo}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-[#005461]">
                          {clo.earnedMarks} / {clo.possibleMarks}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[#666666]">{clo.attainmentPercent}%</td>
                        <td className="px-3 py-2.5 text-right text-[#666666]">
                          {clo.studentsMet} / {clo.totalStudents}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                  {report.passRate}
                  %
                </p>
              </div>
              <div>
                <p className="text-xs text-[#888888] uppercase tracking-wide">
                  Average total
                </p>
                <p className="text-lg font-bold text-[#005461] mt-1">
                  {report.averageScore.toFixed(1)} / {report.examTotalMarks}
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