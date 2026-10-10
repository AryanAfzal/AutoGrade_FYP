'use client';

import { Suspense } from 'react';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader,
  X,
  ChevronDown,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { examApi, uploadApi, evaluationApi } from '@/lib/api';
import type { Exam, AnswerSheet, SheetStatus } from '@/types';
import { cn, formatDate } from '@/lib/utils';

const statusConfig: Record<
  SheetStatus,
  { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'amber'; icon: React.ReactNode }
> = {
  uploaded: {
    label: 'Uploaded',
    variant: 'default',
    icon: <Clock size={12} />,
  },
  mapped: {
    label: 'Mapped',
    variant: 'info',
    icon: <Clock size={12} />,
  },
  processing: {
    label: 'Processing',
    variant: 'warning',
    icon: <Loader size={12} className="animate-spin" />,
  },
  flagged: {
    label: 'Flagged',
    variant: 'danger',
    icon: <AlertCircle size={12} />,
  },
  awaiting_approval: {
    label: 'Awaiting Review',
    variant: 'amber',
    icon: <Clock size={12} />,
  },
  approved: {
    label: 'Approved',
    variant: 'success',
    icon: <CheckCircle size={12} />,
  },
};

function UploadSheetsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>(
    searchParams.get('examId') || ''
  );
  const [sheets, setSheets] = useState<AnswerSheet[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState('');
  const [successCount, setSuccessCount] = useState(0);

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

  // Load exams
  useEffect(() => {
    examApi.getAll().then(setExams).catch(() => setExams([]));
  }, []);

  // Load sheets when exam selected
  useEffect(() => {
    if (!selectedExamId) return;
    setLoadingSheets(true);
    uploadApi
      .getSheets(selectedExamId)
      .then(setSheets)
      .catch(() => setSheets([]))
      .finally(() => setLoadingSheets(false));
  }, [selectedExamId]);

  // Auto-refresh sheets every 2 seconds if evaluation is in progress
  useEffect(() => {
    if (!selectedExamId || !sheets.some(s => s.status === 'processing')) return;
    
    const interval = setInterval(() => {
      uploadApi
        .getSheets(selectedExamId)
        .then(setSheets)
        .catch(() => {});
    }, 2000);

    return () => clearInterval(interval);
  }, [selectedExamId, sheets]);

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(
      (f) => f.type === 'application/pdf'
    );
    if (fileArray.length === 0) {
      setError('Only PDF files are accepted.');
      return;
    }
    if (!selectedExamId) {
      setError('Please select an exam first.');
      return;
    }
    setUploading(true);
    setError('');
    setSuccessCount(0);
    try {
      const uploaded = await uploadApi.uploadSheets(
        selectedExamId,
        fileArray
      );
      setSheets((prev) => [...uploaded, ...prev]);
      setSuccessCount(uploaded.length);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Upload failed.'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
  };

  const handleTriggerEvaluation = async () => {
    if (!selectedExamId) return;
    
    setEvaluating(true);
    setError('');

    try {
      // Trigger evaluation (this will process all uploaded sheets)
      const results = await evaluationApi.triggerEvaluation(selectedExamId);
      
      // Refresh sheets to show updated status
      const updated = await uploadApi.getSheets(selectedExamId);
      setSheets(updated);

      const processingCount = updated.filter(
        (s) => s.status === 'processing' || s.status === 'awaiting_approval'
      ).length;

      if (processingCount > 0) {
        setError(''); // Clear error
        // The auto-refresh will update as evaluation progresses
      } else {
        setError('No sheets to evaluate');
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Failed to start evaluation'
      );
    } finally {
      setEvaluating(false);
    }
  };

  const selectedExam = exams.find((e: Exam) => e.id === selectedExamId);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Exam selector */}
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
            <option value="">— Select an exam —</option>
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
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#E8DCC8]">
            <div>
              <p className="text-xs text-[#888888]">Course</p>
              <p className="text-sm font-medium text-[#1A1A1A]">
                {selectedExam.course}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#888888]">Term</p>
              <p className="text-sm font-medium text-[#1A1A1A]">
                {selectedExam.term}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#888888]">Total Marks</p>
              <p className="text-sm font-medium text-[#1A1A1A]">
                {selectedExam.totalMarks}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#888888]">Questions</p>
              <p className="text-sm font-medium text-[#1A1A1A]">
                {selectedExam.questions?.length ?? 0}
              </p>
            </div>
            <div className="ml-auto">
              <Badge variant="info">
                {selectedExam.status.replace('_', ' ')}
              </Badge>
            </div>
          </div>
        )}
      </Card>

      {/* Upload zone */}
      <Card>
        <h3 className="text-sm font-semibold text-[#005461] mb-4 uppercase tracking-wide">
          Upload Answer Sheets
        </h3>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-xl py-14 cursor-pointer transition-all duration-200',
            dragOver
              ? 'border-[#005461] bg-[#E8F4F6]'
              : 'border-[#E8DCC8] bg-[#FFF8EB] hover:border-[#005461]',
            uploading && 'pointer-events-none opacity-60'
          )}
        >
          <div
            className={cn(
              'w-14 h-14 rounded-full flex items-center justify-center transition-colors',
              dragOver ? 'bg-[#005461]' : 'bg-[#005461]'
            )}
          >
            {uploading ? (
              <Loader
                size={22}
                className="text-[#FAB963] animate-spin"
              />
            ) : (
              <Upload size={22} className="text-[#FAB963]" />
            )}
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[#1A1A1A]">
              {uploading
                ? 'Uploading and processing...'
                : dragOver
                ? 'Drop files here'
                : 'Drag & drop answer sheet PDFs here'}
            </p>
            <p className="text-xs text-[#888888] mt-1">
              or click to browse · PDF only · Max 20MB per file · Up to
              500 sheets
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            onChange={handleFileInput}
          />
        </div>

        {/* Success message */}
        {successCount > 0 && (
          <div className="flex items-center gap-2 mt-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <CheckCircle size={16} className="text-green-600" />
            <p className="text-sm text-green-700">
              {successCount} sheet{successCount > 1 ? 's' : ''}{' '}
              uploaded successfully and queued for AI processing.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertCircle size={16} className="text-red-500" />
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={() => setError('')}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </Card>

      {/* Sheets list */}
      {selectedExamId && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#1A1A1A]">
              Uploaded Sheets{' '}
              <span className="text-[#888888] font-normal">
                ({sheets.length})
              </span>
            </h3>
            <div className="flex gap-2">
              {sheets.some((s) => s.status === 'uploaded') && (
                <Button
                  size="sm"
                  onClick={handleTriggerEvaluation}
                  disabled={evaluating}
                >
                  {evaluating ? 'Evaluating...' : 'Start Evaluation'}
                </Button>
              )}
              {sheets.some(
                (s) => s.status === 'awaiting_approval'
              ) && (
                <Button
                  size="sm"
                  onClick={() =>
                    router.push(
                      `/dashboard/ai-review?examId=${selectedExamId}`
                    )
                  }
                >
                  Go to AI Review →
                </Button>
              )}
            </div>
          </div>

          {loadingSheets ? (
            <Card>
              <div className="flex items-center justify-center py-10 gap-3">
                <div className="w-5 h-5 border-2 border-[#005461] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-[#888888]">
                  Loading sheets...
                </p>
              </div>
            </Card>
          ) : sheets.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <FileText size={28} className="text-[#E8DCC8]" />
                <p className="text-sm text-[#888888]">
                  No sheets uploaded yet for this exam
                </p>
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              {sheets.map((sheet) => {
                const config = statusConfig[sheet.status];
                return (
                  <Card key={sheet.id} padding="sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[#FFF8EB] rounded-lg flex items-center justify-center shrink-0">
                          <FileText
                            size={16}
                            className="text-[#005461]"
                          />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#1A1A1A]">
                            {sheet.studentName || 'Unknown Student'}
                          </p>
                          <p className="text-xs text-[#888888]">
                            {sheet.registrationNo || 'No Reg. No. detected'}{' '}
                            · {formatDate(sheet.uploadedAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={config.variant}>
                          <span className="flex items-center gap-1">
                            {config.icon}
                            {config.label}
                          </span>
                        </Badge>
                      </div>
                    </div>

                    {/* Flagged warning */}
                    {sheet.status === 'flagged' && (
                      <div className="mt-3 pt-3 border-t border-[#E8DCC8] flex items-start gap-2">
                        <AlertCircle
                          size={14}
                          className="text-red-500 mt-0.5 shrink-0"
                        />
                        <p className="text-xs text-red-600">
                          This sheet was flagged during processing.
                          Manual review required before evaluation can
                          proceed.
                        </p>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function UploadSheetsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 max-w-4xl">
          <Card>
            <div className="flex items-center justify-center py-12 gap-3">
              <Loader size={18} className="text-[#005461] animate-spin" />
              <p className="text-sm text-[#888888]">Loading sheets...</p>
            </div>
          </Card>
        </div>
      }
    >
      <UploadSheetsContent />
    </Suspense>
  );
}