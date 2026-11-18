'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowUpDown,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileCheck,
  FileText,
  Filter,
  GraduationCap,
  Loader,
  Maximize2,
  MessageSquare,
  ScanLine,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import { evaluationApi, examApi, getStoredUser } from '@/lib/api';
import type { Exam, PublishedPaperItem, User } from '@/types';
import { cn, formatDate } from '@/lib/utils';

const formatScore = (val: number | string | null | undefined): string => {
  if (val === null || val === undefined || val === '') return '—';
  const num = Number(val);
  if (!Number.isFinite(num)) return '—';
  const rounded = Math.round(num * 100) / 100;
  return rounded.toString();
};

function PublishedResultsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialExamId = searchParams.get('examId') || 'all';

  const [user, setUser] = useState<User | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>(initialExamId);
  const [papers, setPapers] = useState<PublishedPaperItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'passed' | 'failed' | 'cheating'>('all');
  const [sortBy, setSortBy] = useState<'score_desc' | 'score_asc' | 'date_desc' | 'name_asc'>('date_desc');
  const [expandedPaperIds, setExpandedPaperIds] = useState<Set<string>>(new Set());

  // OMR Image Modal state
  const [omrModalOpen, setOmrModalOpen] = useState(false);
  const [omrImageUrl, setOmrImageUrl] = useState<string | null>(null);
  const [omrImageLoading, setOmrImageLoading] = useState(false);
  const [omrImageError, setOmrImageError] = useState('');
  const [omrModalPaper, setOmrModalPaper] = useState<PublishedPaperItem | null>(null);

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      router.push('/login');
      return;
    }
    if (stored.role !== 'teacher' && stored.role !== 'admin') {
      router.push('/dashboard/student');
      return;
    }
    setUser(stored);
  }, [router]);

  // Load all exams
  useEffect(() => {
    examApi
      .getAll()
      .then((data) => setExams(data))
      .catch((err) => console.error('Failed to load exams', err));
  }, []);

  // Load published papers
  useEffect(() => {
    setLoading(true);
    setError('');
    const examFilter = selectedExamId === 'all' ? undefined : selectedExamId;
    evaluationApi
      .getPublishedPapers(examFilter)
      .then((data) => {
        setPapers(data);
        if (data.length > 0) {
          // By default expand the first paper
          setExpandedPaperIds(new Set([data[0].id]));
        }
      })
      .catch((loadErr: unknown) => {
        setError(loadErr instanceof Error ? loadErr.message : 'Unable to load published papers.');
      })
      .finally(() => setLoading(false));
  }, [selectedExamId]);

  const togglePaperExpand = (paperId: string) => {
    setExpandedPaperIds((prev) => {
      const next = new Set(prev);
      if (next.has(paperId)) {
        next.delete(paperId);
      } else {
        next.add(paperId);
      }
      return next;
    });
  };

  const handleOpenOmrModal = async (paper: PublishedPaperItem) => {
    setOmrModalPaper(paper);
    setOmrModalOpen(true);
    setOmrImageUrl(null);
    setOmrImageError('');
    setOmrImageLoading(true);

    try {
      const blob = await evaluationApi.getOmrImage(paper.examId, paper.answersheetId);
      const url = URL.createObjectURL(blob);
      setOmrImageUrl(url);
    } catch (err: unknown) {
      setOmrImageError(err instanceof Error ? err.message : 'Unable to load OMR annotated image.');
    } finally {
      setOmrImageLoading(false);
    }
  };

  // Filtered & Sorted Papers
  const filteredPapers = useMemo(() => {
    let result = papers.filter((p) => {
      // Search filter
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        p.studentName.toLowerCase().includes(q) ||
        p.registrationNo.toLowerCase().includes(q) ||
        p.examTitle.toLowerCase().includes(q) ||
        p.course.toLowerCase().includes(q);

      if (!matchSearch) return false;

      // Status tab filter
      const scoreNum = typeof p.totalApprovedMark === 'number' ? p.totalApprovedMark : p.totalAiMark;
      const pct = p.totalMaxMarks > 0 ? (scoreNum / p.totalMaxMarks) * 100 : 0;
      const isCheating = p.cheatingStatus === 'confirmed_cheating';

      if (statusFilter === 'cheating') return isCheating;
      if (statusFilter === 'passed') return !isCheating && pct >= 50;
      if (statusFilter === 'failed') return !isCheating && pct < 50;
      return true;
    });

    // Sorting
    result.sort((a, b) => {
      const scoreA = typeof a.totalApprovedMark === 'number' ? a.totalApprovedMark : a.totalAiMark;
      const scoreB = typeof b.totalApprovedMark === 'number' ? b.totalApprovedMark : b.totalAiMark;

      if (sortBy === 'score_desc') return scoreB - scoreA;
      if (sortBy === 'score_asc') return scoreA - scoreB;
      if (sortBy === 'name_asc') return a.studentName.localeCompare(b.studentName);
      // default: date_desc
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return dateB - dateA;
    });

    return result;
  }, [papers, searchQuery, statusFilter, sortBy]);

  // Overall Statistics
  const stats = useMemo(() => {
    const total = papers.length;
    if (total === 0) {
      return { total: 0, avgPct: 0, highestScore: 0, cheatingCount: 0 };
    }
    const cheatingCount = papers.filter((p) => p.cheatingStatus === 'confirmed_cheating').length;
    const scores = papers.map((p) =>
      typeof p.totalApprovedMark === 'number' ? p.totalApprovedMark : p.totalAiMark
    );
    const percentages = papers.map((p) =>
      p.totalMaxMarks > 0
        ? ((typeof p.totalApprovedMark === 'number' ? p.totalApprovedMark : p.totalAiMark) /
            p.totalMaxMarks) *
          100
        : 0
    );
    const avgPct = Math.round(percentages.reduce((a, b) => a + b, 0) / total);
    const highestScore = Math.max(...scores);

    return {
      total,
      avgPct,
      highestScore: Math.round(highestScore * 100) / 100,
      cheatingCount,
    };
  }, [papers]);

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Top Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#005461] text-white shadow-sm">
              <Award size={22} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-[#1A1A1A]">Published Results &amp; Papers</h2>
              <p className="text-xs text-[#888888] mt-0.5">
                Archived view of finalized student papers, question evaluations, teacher overrides, and academic integrity decisions.
              </p>
            </div>
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push('/dashboard/ai-review')}
          >
            Go to AI Review
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (expandedPaperIds.size === filteredPapers.length) {
                setExpandedPaperIds(new Set());
              } else {
                setExpandedPaperIds(new Set(filteredPapers.map((p) => p.id)));
              }
            }}
          >
            {expandedPaperIds.size === filteredPapers.length ? 'Collapse All' : 'Expand All'}
          </Button>
        </div>
      </div>

      {/* Summary KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#E8DCC8] bg-white p-4 shadow-sm flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F0F8FA] text-[#005461]">
            <FileCheck size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#888888]">Published Papers</p>
            <p className="text-2xl font-black text-[#1A1A1A]">{stats.total}</p>
          </div>
        </div>

        <div className="rounded-xl border border-[#E8DCC8] bg-white p-4 shadow-sm flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <TrendingUp size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#888888]">Average Performance</p>
            <p className="text-2xl font-black text-emerald-800">{stats.avgPct}%</p>
          </div>
        </div>

        <div className="rounded-xl border border-[#E8DCC8] bg-white p-4 shadow-sm flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Award size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#888888]">Top Score</p>
            <p className="text-2xl font-black text-blue-900">{stats.highestScore}</p>
          </div>
        </div>

        <div className="rounded-xl border border-[#E8DCC8] bg-white p-4 shadow-sm flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
            <ShieldAlert size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#888888]">Cheating Penalties</p>
            <p className="text-2xl font-black text-red-700">{stats.cheatingCount}</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card padding="sm" className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Exam Filter Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-[#1A1A1A] mb-1">Filter by Exam:</label>
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="w-full text-xs rounded-xl border border-[#E8DCC8] bg-white px-3 py-2 text-[#1A1A1A] focus:outline-none focus:border-[#005461]"
            >
              <option value="all">All Exams ({exams.length})</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title} ({ex.course} · {ex.term})
                </option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div>
            <label className="block text-xs font-semibold text-[#1A1A1A] mb-1">Search Candidate / Roll:</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                placeholder="Student name, roll no, or subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs rounded-xl border border-[#E8DCC8] bg-white pl-9 pr-3 py-2 text-[#1A1A1A] focus:outline-none focus:border-[#005461]"
              />
            </div>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-xs font-semibold text-[#1A1A1A] mb-1">Sort Results By:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full text-xs rounded-xl border border-[#E8DCC8] bg-white px-3 py-2 text-[#1A1A1A] focus:outline-none focus:border-[#005461]"
            >
              <option value="date_desc">Published: Newest First</option>
              <option value="score_desc">Score: Highest First</option>
              <option value="score_asc">Score: Lowest First</option>
              <option value="name_asc">Candidate Name (A - Z)</option>
            </select>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F5EFE6]">
          <div className="flex gap-1.5 flex-wrap">
            {(
              [
                { id: 'all', label: `All Papers (${papers.length})` },
                { id: 'passed', label: 'Passed (≥50%)' },
                { id: 'failed', label: 'Failed (<50%)' },
                { id: 'cheating', label: `Cheating Violations (${stats.cheatingCount})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={cn(
                  'px-3 py-1 rounded-lg text-xs font-medium transition-colors',
                  statusFilter === tab.id
                    ? 'bg-[#005461] text-white shadow-sm'
                    : 'bg-[#FAF8F5] text-[#555555] hover:bg-[#E8DCC8]/60'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <span className="text-xs text-[#888888]">
            Showing <strong>{filteredPapers.length}</strong> of {papers.length} published paper(s)
          </span>
        </div>
      </Card>

      {/* Error alert */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-red-500" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </Card>
      )}

      {/* Main Content List */}
      {loading ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader size={24} className="text-[#005461] animate-spin" />
            <p className="text-sm text-[#888888]">Loading published papers and evaluated sheets...</p>
          </div>
        </Card>
      ) : filteredPapers.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <CheckCircle2 size={36} className="text-[#005461]" />
            <p className="text-base font-semibold text-[#1A1A1A]">No published results found</p>
            <p className="text-xs text-[#888888] max-w-md">
              {searchQuery || statusFilter !== 'all' || selectedExamId !== 'all'
                ? 'No published papers match your current filters. Try resetting the search or filter options.'
                : 'Papers that have been reviewed and published from the AI Review section will be permanently archived and displayed here.'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredPapers.map((paper) => {
            const isExpanded = expandedPaperIds.has(paper.id);
            const scoreNum =
              typeof paper.totalApprovedMark === 'number'
                ? paper.totalApprovedMark
                : paper.totalAiMark;
            const percentage =
              paper.totalMaxMarks > 0 ? Math.round((scoreNum / paper.totalMaxMarks) * 100) : 0;
            const isCheating = paper.cheatingStatus === 'confirmed_cheating';

            return (
              <div
                key={paper.id}
                className={cn(
                  'rounded-2xl border transition-all duration-200 overflow-hidden shadow-sm bg-white',
                  isCheating
                    ? 'border-red-300'
                    : isExpanded
                    ? 'border-[#005461] ring-1 ring-[#005461]/20'
                    : 'border-[#E8DCC8] hover:border-[#005461]/50'
                )}
              >
                {/* Paper Header Tile (Clickable) */}
                <div
                  className="cursor-pointer p-5 transition-colors hover:bg-[#FFFDF8]"
                  onClick={() => togglePaperExpand(paper.id)}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    {/* Left details */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#E8DCC8]/60 text-[#005461]">
                          {paper.course}
                        </span>
                        <span className="text-xs text-[#888888] font-medium">{paper.term}</span>

                        {isCheating ? (
                          <Badge variant="danger" className="text-[11px]">
                            <ShieldAlert size={10} className="mr-1 inline" />
                            Cheating Penalty (0 Marks)
                          </Badge>
                        ) : (
                          <Badge variant="success" className="text-[11px]">
                            <CheckCircle2 size={10} className="mr-1 inline" />
                            Published Result
                          </Badge>
                        )}

                        {paper.ocrEngine === 'omr' ? (
                          <Badge variant="info" className="text-[11px]">
                            <ScanLine size={10} className="mr-1 inline" />
                            OMR Bubble MCQ
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-[#666666] bg-[#F5EFE6] px-2 py-0.5 rounded-full">
                            Handwritten Theory
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-baseline gap-2">
                        <h3 className="text-lg font-bold text-[#1A1A1A]">{paper.studentName}</h3>
                        <span className="text-xs text-[#666666]">
                          Roll No: <strong className="text-[#1A1A1A]">{paper.registrationNo}</strong>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#777777]">
                        <span>Exam: <strong>{paper.examTitle}</strong></span>
                        <span>•</span>
                        <span>Questions: <strong>{paper.entries.length}</strong></span>
                        <span>•</span>
                        <span>
                          Published on:{' '}
                          <strong>{paper.publishedAt ? formatDate(paper.publishedAt) : 'Recently'}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Right: Score Tile & Expand Toggle */}
                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-3 sm:pt-0 border-t border-[#E8DCC8]/40 sm:border-t-0">
                      <div className="text-right">
                        <div className="flex items-baseline justify-end gap-1.5">
                          <span
                            className={cn(
                              'text-2xl font-black',
                              isCheating ? 'text-red-600' : 'text-[#005461]'
                            )}
                          >
                            {isCheating ? '0' : formatScore(paper.totalApprovedMark)}
                          </span>
                          <span className="text-sm font-semibold text-[#888888]">
                            / {paper.totalMaxMarks}
                          </span>
                        </div>
                        <div className="flex items-center justify-end gap-1.5 mt-0.5">
                          {isCheating ? (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                              0% · Cheating Penalty
                            </span>
                          ) : (
                            <span
                              className={cn(
                                'text-xs font-bold px-2 py-0.5 rounded-full',
                                percentage >= 70
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : percentage >= 50
                                  ? 'bg-blue-100 text-[#005461]'
                                  : percentage >= 40
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-red-100 text-red-800'
                              )}
                            >
                              {percentage}% · Final Grade
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-center h-9 w-9 rounded-xl border border-[#E8DCC8] bg-white text-[#005461] transition-transform">
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Details & Questions */}
                {isExpanded && (
                  <div className="border-t border-[#E8DCC8] bg-[#FAF8F5] p-5 space-y-4">
                    {/* Academic Integrity Penalty Banner */}
                    {isCheating && (
                      <div className="rounded-xl border border-red-300 bg-red-50/80 p-4 space-y-2">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700">
                            <ShieldAlert size={20} />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-red-950">
                              Academic Integrity Violation Confirmed · Zero Marks Imposed
                            </h4>
                            <p className="mt-0.5 text-xs text-red-800 leading-relaxed">
                              This candidate was caught in unauthorized copying / high similarity. Zero marks (0) were awarded by the instructor.
                            </p>
                            {paper.cheatingPenaltyNotes && (
                              <p className="mt-2 text-xs font-semibold text-red-900 bg-white/80 p-2.5 rounded-lg border border-red-200">
                                Instructor Explanation: &quot;{paper.cheatingPenaltyNotes}&quot;
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Paper Meta Strip */}
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#555555] bg-white p-3 rounded-xl border border-[#E8DCC8]">
                      <div className="flex items-center gap-3">
                        <span>
                          Student Recheck Deadline:{' '}
                          <strong className="text-[#1A1A1A]">
                            {paper.recheckDeadline
                              ? new Date(paper.recheckDeadline).toLocaleString()
                              : 'Not set'}
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          AI Evaluation Score:{' '}
                          <strong className="text-[#005461]">
                            {formatScore(paper.totalAiMark)} / {paper.totalMaxMarks}
                          </strong>
                        </span>
                      </div>

                      {paper.hasOmrImage && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenOmrModal(paper)}
                        >
                          <ScanLine size={13} className="mr-1.5 text-[#005461]" />
                          View Annotated OMR Sheet
                        </Button>
                      )}
                    </div>

                    {/* Questions List */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider flex items-center gap-1.5">
                        <FileText size={14} className="text-[#005461]" />
                        Evaluated Questions &amp; Rubrics ({paper.entries.length})
                      </h4>

                      {paper.entries.map((entry, qIndex) => {
                        const isMCQ = entry.type === 'mcq' || entry.maxMarks === 1;
                        const isOverridden = entry.reviewStatus === 'overridden';

                        return (
                          <div
                            key={entry.id || qIndex}
                            className="rounded-xl border border-[#E8DCC8] bg-white p-4 shadow-sm space-y-3"
                          >
                            {/* Question Header */}
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="inline-flex h-5 px-2 items-center justify-center rounded bg-[#005461] text-xs font-bold text-white">
                                    Q{qIndex + 1}
                                  </span>
                                  <span className="text-[11px] font-semibold uppercase text-[#888888] bg-[#F5EFE6] px-2 py-0.5 rounded">
                                    {isMCQ ? 'Multiple Choice' : 'Theory / Rubric'}
                                  </span>
                                  {isOverridden && (
                                    <Badge variant="warning" className="text-[10px]">
                                      Teacher Revised
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm font-semibold text-[#1A1A1A]">{entry.questionText}</p>
                              </div>

                              <div className="text-right shrink-0">
                                <span className="inline-flex items-center px-3 py-1 rounded-lg text-sm font-black border bg-[#FFF8EB] text-[#005461] border-[#E8DCC8]">
                                  {formatScore(entry.approvedMark ?? entry.aiMark)} / {entry.maxMarks}
                                </span>
                                {typeof entry.approvedMark === 'number' &&
                                  entry.approvedMark !== entry.aiMark && (
                                    <p className="text-[10px] text-[#888888] mt-0.5">
                                      AI gave: {formatScore(entry.aiMark)}
                                    </p>
                                  )}
                              </div>
                            </div>

                            {/* Student Answer */}
                            <div className="rounded-lg border border-[#E8DCC8] bg-[#FAFAFA] p-3 text-xs">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-[#888888] mb-1">
                                Extracted Student Answer:
                              </p>
                              <p className="whitespace-pre-wrap leading-relaxed text-[#222222]">
                                {entry.studentAnswer || 'No answer extracted.'}
                              </p>
                            </div>

                            {/* Rubric Breakdown (if available) */}
                            {entry.rubricBreakdown && entry.rubricBreakdown.length > 0 && (
                              <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-900">
                                  Semantic Rubric Breakdown:
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                  {entry.rubricBreakdown.map((r, rIdx) => (
                                    <div
                                      key={rIdx}
                                      className="flex items-center justify-between p-2 rounded bg-white border border-blue-200"
                                    >
                                      <div>
                                        <span className="font-semibold text-[#1A1A1A] block">{r.conceptName}</span>
                                        <span className="text-[10px] text-[#666666] capitalize">
                                          {r.status} · {Math.round(r.coverage)}% coverage
                                        </span>
                                      </div>
                                      <span className="font-bold text-[#005461]">
                                        {formatScore(r.awardedMarks)}/{r.maxMarks}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Feedback */}
                            {entry.feedback && (
                              <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 p-2.5 text-xs text-[#5C4813]">
                                <span className="font-bold text-[#8D6B12] block mb-0.5">Feedback:</span>
                                {entry.feedback}
                              </div>
                            )}

                            {/* Review Audit History */}
                            {entry.reviewAuditTrail && entry.reviewAuditTrail.length > 0 && (
                              <div className="border-t border-[#F5EFE6] pt-2 text-[11px] text-[#777777] space-y-1">
                                <p className="font-bold text-[#444444] flex items-center gap-1">
                                  <MessageSquare size={12} className="text-[#005461]" /> Review History:
                                </p>
                                {entry.reviewAuditTrail.map((audit) => (
                                  <p key={audit.id}>
                                    • {audit.reviewerName} {audit.action === 'approve' ? 'approved' : 'overrode'} mark ({audit.originalAiMark} → {audit.finalMark}) on {new Date(audit.reviewedAt).toLocaleString()}
                                    {audit.comment ? ` · Note: "${audit.comment}"` : ''}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* OMR Sheet Preview Modal */}
      {omrModalOpen && omrModalPaper && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setOmrModalOpen(false)}
        >
          <div
            className="relative max-h-[92vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-5 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E8DCC8]">
              <div>
                <h3 className="text-base font-bold text-[#005461]">
                  {omrModalPaper.studentName} · {omrModalPaper.registrationNo}
                </h3>
                <p className="text-xs text-[#666666]">
                  OMR Bubble MCQ Sheet · Score:{' '}
                  {formatScore(omrModalPaper.totalApprovedMark)} / {omrModalPaper.totalMaxMarks}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOmrModalOpen(false)}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            {omrImageLoading ? (
              <div className="py-16 text-center text-sm text-[#888888] flex flex-col items-center gap-2">
                <Loader size={24} className="animate-spin text-[#005461]" />
                <p>Loading OMR bubble sheet image...</p>
              </div>
            ) : omrImageError ? (
              <div className="py-12 text-center text-sm text-red-600 flex flex-col items-center gap-2">
                <AlertCircle size={24} />
                <p>{omrImageError}</p>
              </div>
            ) : omrImageUrl ? (
              <img
                src={omrImageUrl}
                alt="Highlighted OMR Sheet"
                className="w-full h-auto rounded-xl border border-[#E8DCC8]"
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PublishedResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 max-w-6xl">
          <Card>
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader size={18} className="text-[#005461] animate-spin" />
              <p className="text-sm text-[#888888]">Loading published results...</p>
            </div>
          </Card>
        </div>
      }
    >
      <PublishedResultsContent />
    </Suspense>
  );
}
