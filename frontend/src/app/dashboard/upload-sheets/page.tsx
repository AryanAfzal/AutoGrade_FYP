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
  Trash2,
  Cloud,
  Cpu,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { examApi, uploadApi, evaluationApi } from '@/lib/api';
import type { Exam, AnswerSheet, SheetStatus, OcrEngine } from '@/types';
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

const canPreviewSheet = (sheet: AnswerSheet) =>
  sheet.status === 'uploaded' || sheet.status === 'processing';

function getNextPreviewSheetId(sheets: AnswerSheet[], currentId: string | null) {
  if (currentId && sheets.some((sheet) => sheet.id === currentId && canPreviewSheet(sheet))) {
    return currentId;
  }
  return sheets.find(canPreviewSheet)?.id ?? null;
}

function UploadSheetsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>(
    searchParams.get('examId') || ''
  );
  const [sheets, setSheets] = useState<AnswerSheet[]>([]);
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState('');
  const [successCount, setSuccessCount] = useState(0);
  const [deletingSheetId, setDeletingSheetId] = useState<string | null>(null);
  const [ocrEngine, setOcrEngine] = useState<OcrEngine>('trocr');

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
    setSheets([]);
    setSelectedSheetId(null);
    uploadApi
      .getSheets(selectedExamId)
      .then((loadedSheets) => {
        setSheets(loadedSheets);
        setSelectedSheetId(getNextPreviewSheetId(loadedSheets, null));
      })
      .catch(() => setSheets([]))
      .finally(() => setLoadingSheets(false));
  }, [selectedExamId]);

  useEffect(() => {
    if (!selectedExamId || !selectedSheetId) {
      setPreviewUrl(null);
      setPreviewError('');
      setPreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setPreviewUrl(null);
    setPreviewError('');
    setPreviewLoading(true);

    uploadApi
      .getSheetPdf(selectedExamId, selectedSheetId, controller.signal)
      .then((file) => {
        objectUrl = URL.createObjectURL(file);
        setPreviewUrl(objectUrl);
      })
      .catch((previewLoadError: unknown) => {
        if (!controller.signal.aborted) {
          setPreviewError(
            previewLoadError instanceof Error
              ? previewLoadError.message
              : 'Unable to load this PDF preview.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selectedExamId, selectedSheetId]);

  // Auto-refresh sheets every 2 seconds if evaluation is in progress
  useEffect(() => {
    if (!selectedExamId || !sheets.some(s => s.status === 'processing')) return;
    
    const interval = setInterval(() => {
      uploadApi
        .getSheets(selectedExamId)
        .then((loadedSheets) => {
          setSheets(loadedSheets);
          setSelectedSheetId((currentId) =>
            getNextPreviewSheetId(loadedSheets, currentId),
          );
        })
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
        fileArray,
        ocrEngine
      );
      setSheets((prev) => [...uploaded, ...prev]);
      if (uploaded[0]) setSelectedSheetId(uploaded[0].id);
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
      const evaluation = await evaluationApi.triggerEvaluation(selectedExamId, ocrEngine);
      
      // Refresh sheets to show updated status
      const updated = await uploadApi.getSheets(selectedExamId);
      setSheets(updated);
      setSelectedSheetId((currentId) =>
        getNextPreviewSheetId(updated, currentId),
      );

      setError(
        evaluation.started
          ? ''
          : evaluation.message || 'No sheets to evaluate',
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Failed to start evaluation'
      );
    } finally {
      setEvaluating(false);
    }
  };

  const handleDeleteSheet = async (sheet: AnswerSheet) => {
    const confirmed = window.confirm(
      `Delete the answer sheet for ${sheet.registrationNo || sheet.studentName}? This also removes its evaluation and any published result.`,
    );
    if (!confirmed) return;

    setDeletingSheetId(sheet.id);
    setError('');
    try {
      await uploadApi.deleteSheet(selectedExamId, sheet.id);
      const updatedSheets = sheets.filter((item) => item.id !== sheet.id);
      setSheets(updatedSheets);
      setSelectedSheetId((currentId) =>
        getNextPreviewSheetId(updatedSheets, currentId),
      );
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete this answer sheet.');
    } finally {
      setDeletingSheetId(null);
    }
  };

  const selectedExam = exams.find((e: Exam) => e.id === selectedExamId);

  return (
    <div className="grid max-w-7xl items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(250px,1fr)]">
      <div className="min-w-0 space-y-6">
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
        <div className="grid gap-5 lg:grid-cols-2">
          <section>
            <div className="mb-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <h3 className="text-sm font-semibold text-[#005461] uppercase tracking-wide">
                  Upload Answer Sheets
                </h3>
                <span className="text-[11px] font-medium text-[#777777]">
                  Select OCR engine
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setOcrEngine('pen_to_print')}
                  aria-pressed={ocrEngine === 'pen_to_print'}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left transition-all duration-200 cursor-pointer active:scale-[0.98]',
                    ocrEngine === 'pen_to_print'
                      ? 'border-[#005461] bg-[#005461] text-white shadow-sm'
                      : 'border-[#E8DCC8] bg-white text-[#1A1A1A] hover:border-[#005461]/60 hover:bg-[#FFFDF8]'
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                      ocrEngine === 'pen_to_print'
                        ? 'bg-[#FAB963] text-[#1A1A1A]'
                        : 'bg-[#E4F2F4] text-[#005461]'
                    )}
                  >
                    <Cloud size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-tight truncate">
                      Perform OCR via API
                    </p>
                    <p
                      className={cn(
                        'text-[10px] leading-tight truncate mt-0.5',
                        ocrEngine === 'pen_to_print' ? 'text-[#C8E6EA]' : 'text-[#888888]'
                      )}
                    >
                      Pen to Print Cloud OCR
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setOcrEngine('trocr')}
                  aria-pressed={ocrEngine === 'trocr'}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left transition-all duration-200 cursor-pointer active:scale-[0.98]',
                    ocrEngine === 'trocr'
                      ? 'border-[#005461] bg-[#005461] text-white shadow-sm'
                      : 'border-[#E8DCC8] bg-white text-[#1A1A1A] hover:border-[#005461]/60 hover:bg-[#FFFDF8]'
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                      ocrEngine === 'trocr'
                        ? 'bg-[#FAB963] text-[#1A1A1A]'
                        : 'bg-[#E4F2F4] text-[#005461]'
                    )}
                  >
                    <Cpu size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-tight truncate">
                      TrOCR Base Model
                    </p>
                    <p
                      className={cn(
                        'text-[10px] leading-tight truncate mt-0.5',
                        ocrEngine === 'trocr' ? 'text-[#C8E6EA]' : 'text-[#888888]'
                      )}
                    >
                      PaddleOCR + Local TrOCR
                    </p>
                  </div>
                </button>
              </div>
            </div>
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
          </section>

          <section className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[#005461] uppercase tracking-wide">
                  Paper Preview
                </h3>
                {sheets.find((sheet) => sheet.id === selectedSheetId) && (
                  <p className="mt-1 truncate text-xs text-[#777777]">
                    {sheets.find((sheet) => sheet.id === selectedSheetId)?.registrationNo ||
                      sheets.find((sheet) => sheet.id === selectedSheetId)?.studentName}
                  </p>
                )}
              </div>
            </div>
            <div className="flex min-h-[280px] items-center justify-center overflow-hidden rounded-xl border border-[#E8DCC8] bg-[#F7F5F0] lg:h-[360px]">
              {previewLoading ? (
                <div className="flex items-center gap-2 text-sm text-[#777777]">
                  <Loader size={16} className="animate-spin text-[#005461]" />
                  Loading paper...
                </div>
              ) : previewError ? (
                <div className="flex max-w-sm flex-col items-center gap-2 px-5 text-center">
                  <AlertCircle size={22} className="text-[#B45309]" />
                  <p className="text-sm font-medium text-[#333333]">Preview unavailable</p>
                  <p className="text-xs text-[#777777]">{previewError}</p>
                </div>
              ) : previewUrl ? (
                <iframe
                  title="Uploaded answer sheet PDF preview"
                  src={previewUrl}
                  className="h-full min-h-[360px] w-full bg-white"
                />
              ) : (
                <div className="flex max-w-sm flex-col items-center gap-2 px-5 text-center">
                  <FileText size={24} className="text-[#A9A293]" />
                  <p className="text-sm font-medium text-[#333333]">No paper selected</p>
                  <p className="text-xs text-[#777777]">
                    Upload a PDF or select an uploaded sheet below to preview it here.
                  </p>
                </div>
              )}
            </div>
          </section>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
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
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="w-9 h-9 bg-[#FFF8EB] rounded-lg flex items-center justify-center shrink-0">
                          <FileText
                            size={16}
                            className="text-[#005461]"
                          />
                        </div>
                        <div className="min-w-0">
                          <button
                            type="button"
                            aria-pressed={selectedSheetId === sheet.id}
                            disabled={!canPreviewSheet(sheet)}
                            onClick={() => setSelectedSheetId(sheet.id)}
                            className={`min-w-0 rounded px-1 py-1 text-left ${
                              !canPreviewSheet(sheet)
                                ? 'cursor-default'
                                : selectedSheetId === sheet.id
                                  ? 'bg-[#EAF5F6]'
                                  : 'hover:bg-[#FFF8EB]'
                            }`}
                          >
                            <span className="block truncate text-sm font-medium text-[#1A1A1A]">
                              {sheet.studentName || 'Unknown Student'}
                            </span>
                            <span className="block truncate text-xs text-[#888888]">
                              {sheet.registrationNo || 'No Reg. No. detected'} · {formatDate(sheet.uploadedAt)}
                            </span>
                          </button>
                          {!canPreviewSheet(sheet) && (
                            <span className="ml-1 text-[10px] text-[#888888]">
                              Evaluated — preview hidden
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <Badge variant={sheet.ocrEngine === 'pen_to_print' ? 'info' : 'default'}>
                          {sheet.ocrEngine === 'pen_to_print' ? 'Pen to Print API' : 'TrOCR Model'}
                        </Badge>
                        <Badge variant={config.variant}>
                          <span className="flex items-center gap-1">
                            {config.icon}
                            {config.label}
                          </span>
                        </Badge>
                        <Button
                          variant="danger"
                          size="sm"
                          loading={deletingSheetId === sheet.id}
                          disabled={sheet.status === 'processing' || deletingSheetId !== null}
                          onClick={() => handleDeleteSheet(sheet)}
                        >
                          <Trash2 size={14} className="mr-1.5" />
                          Delete
                        </Button>
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

      <aside className="xl:sticky xl:top-6">
        <Card className="border-[#F0D8B5] bg-[#FFFCF6]">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[#005461]">
            How to evaluate papers
          </h3>
          <p className="mt-1 text-xs leading-5 text-[#777777]">
            Follow these steps to upload answer sheets and start AI evaluation.
          </p>
          <ol className="mt-5 space-y-4">
            {[
              {
                title: 'Select an exam',
                detail: 'Choose the exam these answer sheets belong to.',
              },
              {
                title: 'Upload the paper',
                detail: 'Click the upload area or drag in one or more student answer PDFs.',
              },
              {
                title: 'Start AI evaluation',
                detail: 'In Uploaded Sheets below, click Start Evaluation to begin marking.',
              },
              {
                title: 'Wait for processing',
                detail: 'Keep this page open while sheets show Processing. When complete, continue to AI Review.',
              },
            ].map((step, index) => (
              <li key={step.title} className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#005461] text-xs font-bold text-white">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#1A1A1A]">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-[#777777]">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-5 rounded-lg border border-[#E8DCC8] bg-white px-3 py-2.5">
            <p className="text-xs font-medium text-[#005461]">Next step</p>
            <p className="mt-1 text-xs leading-5 text-[#777777]">
              After evaluation, open AI Review to check marks and publish results.
            </p>
          </div>
        </Card>
      </aside>
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