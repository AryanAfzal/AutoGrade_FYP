'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Trash2,
  FileText,
  Upload,
  ChevronDown,
  ChevronUp,
  Save,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { authApi, examApi } from '@/lib/api';
import type {
  Question,
  QuestionRubric,
  RubricConcept,
  QuestionType,
  User,
} from '@/types';
import { cn } from '@/lib/utils';

interface ExamMetaForm {
  title: string;
  course: string;
  term: string;
  totalMarks: number;
  recheckDeadline: string;
}

const CLO_OPTIONS = ['CLO-1', 'CLO-2', 'CLO-3', 'CLO-4', 'CLO-5'];
const TERM_OPTIONS = [
  'Fall 2024',
  'Spring 2025',
  'Fall 2025',
  'Spring 2026',
];

type InputMode = 'manual' | 'pdf';

const emptyQuestion = (): Omit<Question, 'id' | 'examId'> => ({
  type: 'mcq',
  questionText: '',
  maxMarks: 1,
  clo: 'CLO-1',
  options: [
    { label: 'A', text: '' },
    { label: 'B', text: '' },
    { label: 'C', text: '' },
    { label: 'D', text: '' },
  ],
  correctAnswer: 'A',
  referenceAnswer: '',
  keywords: [],
});

const emptyRubric = (maxMarks: number): QuestionRubric => ({
  concepts: [
    {
      name: 'Key concept',
      description: '',
      keywords: [],
      maxMarks,
      strictness: 'balanced',
    },
  ],
  scoringWeights: { semantic: 0.4, keywords: 0.2, concepts: 0.4 },
});

const distributeMarks = (concepts: RubricConcept[], totalMarks: number) => {
  const marksEach = Math.floor((totalMarks / concepts.length) * 100) / 100;
  return concepts.map((concept, index) => ({
    ...concept,
    maxMarks:
      index === concepts.length - 1
        ? Number((totalMarks - marksEach * (concepts.length - 1)).toFixed(2))
        : marksEach,
  }));
};

export default function CreateExamPage() {
  const router = useRouter();
  const [inputMode, setInputMode] = useState<InputMode>('manual');
  const [questions, setQuestions] = useState<Omit<Question, 'id' | 'examId'>[]>([emptyQuestion()]);
  const [expandedIndex, setExpandedIndex] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState('');
  const [keywordInput, setKeywordInput] = useState<string[]>(['']);
  const [assignedSubjects, setAssignedSubjects] = useState<string[]>([]);

  useEffect(() => {
    const rawUser = localStorage.getItem('user');
    if (!rawUser) {
      router.push('/login');
      return;
    }

    const parsed = JSON.parse(rawUser) as User;
    if (parsed.role !== 'teacher') {
      router.push(parsed.role === 'admin' ? '/dashboard/admin' : parsed.role === 'student' ? '/dashboard/student' : '/login');
      return;
    }

    authApi.getCurrentUser()
      .then((currentUser) => setAssignedSubjects(currentUser.assignedSubjects || []))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Unable to load assigned subjects.'));
  }, [router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ExamMetaForm>();

  // ── Question helpers ──────────────────────────────────────
  const addQuestion = () => {
    setQuestions((prev) => [...prev, emptyQuestion()]);
    setExpandedIndex(questions.length);
    setKeywordInput((prev) => [...prev, '']);
  };

  const removeQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
    setKeywordInput((prev) => prev.filter((_, i) => i !== index));
    setExpandedIndex(Math.max(0, index - 1));
  };

  const updateQuestion = (
    index: number,
    field: string,
    value: unknown
  ) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== index) return q;
        const updated = { ...q, [field]: value };
        if (field === 'maxMarks' && q.rubric) {
          updated.rubric = {
            ...q.rubric,
            concepts: distributeMarks(q.rubric.concepts, Number(value)),
          };
        }
        return updated;
      })
    );
  };

  const updateRubricConcept = (
    questionIndex: number,
    conceptIndex: number,
    field: keyof RubricConcept,
    value: string | number | string[]
  ) => {
    setQuestions((previous) =>
      previous.map((question, index) => {
        if (index !== questionIndex || !question.rubric) return question;
        return {
          ...question,
          rubric: {
            ...question.rubric,
            concepts: question.rubric.concepts.map((concept, itemIndex) =>
              itemIndex === conceptIndex
                ? { ...concept, [field]: value }
                : concept
            ),
          },
        };
      })
    );
  };

  const addRubricConcept = (questionIndex: number) => {
    setQuestions((previous) =>
      previous.map((question, index) => {
        if (index !== questionIndex || !question.rubric) return question;
        const concepts = [
          ...question.rubric.concepts,
          {
            name: `Concept ${question.rubric.concepts.length + 1}`,
            description: '',
            keywords: [],
            maxMarks: 0,
            strictness: 'balanced' as const,
          },
        ];
        return {
          ...question,
          rubric: {
            ...question.rubric,
            concepts: distributeMarks(concepts, question.maxMarks),
          },
        };
      })
    );
  };

  const removeRubricConcept = (questionIndex: number, conceptIndex: number) => {
    setQuestions((previous) =>
      previous.map((question, index) => {
        if (
          index !== questionIndex ||
          !question.rubric ||
          question.rubric.concepts.length <= 1
        ) {
          return question;
        }
        const concepts = question.rubric.concepts.filter(
          (_, itemIndex) => itemIndex !== conceptIndex
        );
        return {
          ...question,
          rubric: {
            ...question.rubric,
            concepts: distributeMarks(concepts, question.maxMarks),
          },
        };
      })
    );
  };

  const updateScoringWeight = (
    questionIndex: number,
    field: keyof QuestionRubric['scoringWeights'],
    percentage: number
  ) => {
    setQuestions((previous) =>
      previous.map((question, index) => {
        if (index !== questionIndex) return question;
        const rubric = question.rubric ?? emptyRubric(question.maxMarks);
        return {
          ...question,
          rubric: {
            ...rubric,
            scoringWeights: {
              ...rubric.scoringWeights,
              [field]: percentage / 100,
            },
          },
        };
      })
    );
  };

  const updateOption = (
    qIndex: number,
    optIndex: number,
    value: string
  ) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const options = [...(q.options || [])];
        options[optIndex] = { ...options[optIndex], text: value };
        return { ...q, options };
      })
    );
  };

  const addKeyword = (qIndex: number) => {
    const kw = keywordInput[qIndex]?.trim();
    if (!kw) return;
    const current = questions[qIndex].keywords || [];
    updateQuestion(qIndex, 'keywords', [...current, kw]);
    setKeywordInput((prev) =>
      prev.map((v, i) => (i === qIndex ? '' : v))
    );
  };

  const removeKeyword = (qIndex: number, kw: string) => {
    const current = questions[qIndex].keywords || [];
    updateQuestion(
      qIndex,
      'keywords',
      current.filter((k) => k !== kw)
    );
  };

  // ── PDF Upload ────────────────────────────────────────────
  const handlePdfUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfLoading(true);
    setError('');
    try {
      const result = await examApi.uploadPDF(file);
      if (result.questions?.length) {
        setQuestions(
          result.questions.map((question) => ({
            ...question,
            rubric:
              question.type === 'descriptive'
                ? question.rubric ?? emptyRubric(question.maxMarks)
                : question.rubric,
          }))
        );
        setKeywordInput(result.questions.map(() => ''));
      }
    } catch {
      setError('Failed to parse PDF. Please check the format and try again.');
    } finally {
      setPdfLoading(false);
    }
  };

  // ── Submit ────────────────────────────────────────────────
  const onSubmit = async (meta: ExamMetaForm) => {
    if (questions.length === 0) {
      setError('Please add at least one question.');
      return;
    }
    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].questionText.trim()) {
        setError(`Question ${i + 1} text is empty.`);
        return;
      }
      const question = questions[i];
      if (question.type !== 'descriptive') continue;
      const rubric = question.rubric;
      if (!rubric?.concepts.length) {
        setError(`Question ${i + 1} needs at least one rubric concept.`);
        return;
      }
      const marksAssigned = rubric.concepts.reduce(
        (sum, concept) => sum + Number(concept.maxMarks),
        0
      );
      if (Math.abs(marksAssigned - question.maxMarks) > 0.01) {
        setError(
          `Question ${i + 1} rubric marks total ${marksAssigned}, but the question is worth ${question.maxMarks}.`
        );
        return;
      }
      if (
        rubric.concepts.some(
          (concept) =>
            !concept.name.trim() ||
            (!concept.description.trim() && concept.keywords.length === 0)
        )
      ) {
        setError(
          `Each rubric concept in question ${i + 1} needs a name and a description or at least one keyword.`
        );
        return;
      }
      const weightTotal = Object.values(rubric.scoringWeights).reduce(
        (sum, weight) => sum + weight,
        0
      );
      if (Math.abs(weightTotal - 1) > 0.001) {
        setError(`Question ${i + 1} rubric scoring weights must add up to 100%.`);
        return;
      }
    }
    setLoading(true);
    setError('');
    try {
      const exam = await examApi.create({
        ...meta,
        recheckDeadline: new Date(meta.recheckDeadline).toISOString(),
        questions: questions as Question[],
      });
      router.push(
        `/dashboard/upload-sheets?examId=${exam.id}`
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Failed to create exam.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Mode toggle */}
      <div className="flex gap-2 p-1 bg-white rounded-xl border border-[#E8DCC8] w-fit">
        {(['manual', 'pdf'] as InputMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setInputMode(mode)}
            className={cn(
              'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200',
              inputMode === mode
                ? 'bg-[#005461] text-white'
                : 'text-[#888888] hover:text-[#1A1A1A]'
            )}
          >
            {mode === 'manual' ? (
              <FileText size={15} />
            ) : (
              <Upload size={15} />
            )}
            {mode === 'manual' ? 'Enter Manually' : 'Upload PDF'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Exam metadata */}
        <Card>
          <h3 className="text-sm font-semibold text-[#005461] mb-4 uppercase tracking-wide">
            Exam Details
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Input
                label="Exam Title"
                placeholder="e.g. Mid Term Examination — Data Structures"
                error={errors.title?.message}
                {...register('title', {
                  required: 'Exam title is required',
                })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[#1A1A1A]">Assigned subject</label>
              <select
                defaultValue=""
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E8DCC8] bg-white text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#005461]"
                {...register('course', {
                  required: 'Select a subject assigned to your teacher account',
                  validate: (value) => assignedSubjects.includes(value) || 'Select a subject assigned to your teacher account',
                })}
              >
                <option value="" disabled>Select a subject</option>
                {assignedSubjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
              </select>
              {errors.course?.message && <p className="text-xs text-red-500">{errors.course.message}</p>}
              {assignedSubjects.length === 0 && <p className="text-xs text-[#888888]">No subjects are assigned to your account yet.</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[#1A1A1A]">
                Term
              </label>
              <select
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E8DCC8] bg-white text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#005461]"
                {...register('term', { required: true })}
              >
                {TERM_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Total Marks"
              type="number"
              placeholder="e.g. 50"
              error={errors.totalMarks?.message}
              {...register('totalMarks', {
                required: 'Total marks required',
                min: { value: 1, message: 'Must be at least 1' },
              })}
            />
            <Input
              label="Student recheck deadline"
              type="datetime-local"
              error={errors.recheckDeadline?.message}
              hint="Students can submit a request until this date and time after results are published."
              {...register('recheckDeadline', {
                required: 'Set a recheck deadline before creating the exam.',
                validate: (value) =>
                  new Date(value).getTime() > Date.now() ||
                  'Choose a future date and time.',
              })}
            />
          </div>
        </Card>

        {/* PDF upload mode */}
        {inputMode === 'pdf' && (
          <Card>
            <h3 className="text-sm font-semibold text-[#005461] mb-4 uppercase tracking-wide">
              Upload Question PDF
            </h3>
            <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-[#E8DCC8] rounded-xl py-10 cursor-pointer hover:border-[#005461] transition-colors bg-[#FFF8EB]">
              <div className="w-12 h-12 bg-[#005461] rounded-full flex items-center justify-center">
                <Upload size={20} className="text-[#FAB963]" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-[#1A1A1A]">
                  Click to upload question PDF
                </p>
                <p className="text-xs text-[#888888] mt-1">
                  PDF format only · Max 20MB
                </p>
              </div>
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handlePdfUpload}
              />
            </label>
            {pdfLoading && (
              <div className="flex items-center gap-2 mt-4">
                <div className="w-4 h-4 border-2 border-[#005461] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-[#888888]">
                  Parsing PDF...
                </p>
              </div>
            )}
            {questions.length > 0 && !pdfLoading && (
              <p className="text-sm text-green-600 mt-3">
                ✓ {questions.length} questions extracted from PDF
              </p>
            )}
          </Card>
        )}

        {/* Questions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#1A1A1A]">
              Questions{' '}
              <span className="text-[#888888] font-normal">
                ({questions.length})
              </span>
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addQuestion}
            >
              <Plus size={14} className="mr-1" /> Add Question
            </Button>
          </div>

          {questions.map((q, qIndex) => (
            <Card key={qIndex} padding="sm">
              {/* Question header */}
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() =>
                  setExpandedIndex(
                    expandedIndex === qIndex ? -1 : qIndex
                  )
                }
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-[#005461] rounded-lg flex items-center justify-center shrink-0">
                    <span className="text-xs text-white font-semibold">
                      {qIndex + 1}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#1A1A1A] truncate max-w-md">
                      {q.questionText || (
                        <span className="text-[#888888]">
                          Untitled question
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-[#888888]">
                      {q.type === 'mcq' ? 'MCQ' : 'Descriptive'} ·{' '}
                      {q.maxMarks} mark{q.maxMarks > 1 ? 's' : ''} ·{' '}
                      {q.clo}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeQuestion(qIndex);
                    }}
                    className="p-1.5 rounded-lg text-[#888888] hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                  {expandedIndex === qIndex ? (
                    <ChevronUp size={16} className="text-[#888888]" />
                  ) : (
                    <ChevronDown
                      size={16}
                      className="text-[#888888]"
                    />
                  )}
                </div>
              </div>

              {/* Expanded question form */}
              {expandedIndex === qIndex && (
                <div className="mt-4 pt-4 border-t border-[#E8DCC8] space-y-4">
                  {/* Type + CLO + Marks */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-[#1A1A1A]">
                        Type
                      </label>
                      <select
                        value={q.type}
                        onChange={(e) =>
                          setQuestions((previous) =>
                            previous.map((question, index) =>
                              index === qIndex
                                ? {
                                    ...question,
                                    type: e.target.value as QuestionType,
                                    rubric:
                                      e.target.value === 'descriptive'
                                        ? question.rubric ??
                                          emptyRubric(question.maxMarks)
                                        : question.rubric,
                                  }
                                : question
                            )
                          )
                        }
                        className="px-3 py-2 text-sm rounded-lg border border-[#E8DCC8] bg-white text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#005461]"
                      >
                        <option value="mcq">MCQ</option>
                        <option value="descriptive">Descriptive</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-[#1A1A1A]">
                        CLO
                      </label>
                      <select
                        value={q.clo}
                        onChange={(e) =>
                          updateQuestion(qIndex, 'clo', e.target.value)
                        }
                        className="px-3 py-2 text-sm rounded-lg border border-[#E8DCC8] bg-white text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#005461]"
                      >
                        {CLO_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-[#1A1A1A]">
                        Marks
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={q.maxMarks}
                        onChange={(e) =>
                          updateQuestion(
                            qIndex,
                            'maxMarks',
                            Number(e.target.value)
                          )
                        }
                        className="px-3 py-2 text-sm rounded-lg border border-[#E8DCC8] bg-white text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#005461]"
                      />
                    </div>
                  </div>

                  {/* Question text */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-[#1A1A1A]">
                      Question Text
                    </label>
                    <textarea
                      rows={2}
                      value={q.questionText}
                      onChange={(e) =>
                        updateQuestion(
                          qIndex,
                          'questionText',
                          e.target.value
                        )
                      }
                      placeholder="Enter the question..."
                      className="px-3 py-2 text-sm rounded-lg border border-[#E8DCC8] bg-white text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#005461] resize-none"
                    />
                  </div>

                  {/* MCQ options */}
                  {q.type === 'mcq' && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-[#1A1A1A]">
                        Options
                      </label>
                      {q.options?.map((opt, optIndex) => (
                        <div
                          key={opt.label}
                          className="flex items-center gap-2"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              updateQuestion(
                                qIndex,
                                'correctAnswer',
                                opt.label
                              )
                            }
                            className={cn(
                              'w-8 h-8 rounded-lg text-xs font-bold shrink-0 transition-all',
                              q.correctAnswer === opt.label
                                ? 'bg-[#FAB963] text-[#1A1A1A]'
                                : 'bg-[#F5F0E8] text-[#888888] hover:bg-[#E8DCC8]'
                            )}
                          >
                            {opt.label}
                          </button>
                          <input
                            type="text"
                            value={opt.text}
                            onChange={(e) =>
                              updateOption(
                                qIndex,
                                optIndex,
                                e.target.value
                              )
                            }
                            placeholder={`Option ${opt.label}`}
                            className="flex-1 px-3 py-2 text-sm rounded-lg border border-[#E8DCC8] bg-white text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#005461]"
                          />
                        </div>
                      ))}
                      <p className="text-xs text-[#888888]">
                        Click a letter to set it as the correct answer
                      </p>
                    </div>
                  )}

                  {/* Descriptive fields */}
                  {q.type === 'descriptive' && (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-[#1A1A1A]">
                          Reference Answer
                        </label>
                        <textarea
                          rows={3}
                          value={q.referenceAnswer}
                          onChange={(e) =>
                            updateQuestion(
                              qIndex,
                              'referenceAnswer',
                              e.target.value
                            )
                          }
                          placeholder="Enter the ideal answer for AI comparison..."
                          className="px-3 py-2 text-sm rounded-lg border border-[#E8DCC8] bg-white text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#005461] resize-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-[#1A1A1A]">
                          Keywords
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={keywordInput[qIndex] || ''}
                            onChange={(e) =>
                              setKeywordInput((prev) =>
                                prev.map((v, i) =>
                                  i === qIndex ? e.target.value : v
                                )
                              )
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addKeyword(qIndex);
                              }
                            }}
                            placeholder="Type a keyword and press Enter"
                            className="flex-1 px-3 py-2 text-sm rounded-lg border border-[#E8DCC8] bg-white text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#005461]"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => addKeyword(qIndex)}
                          >
                            Add
                          </Button>
                        </div>
                        {(q.keywords?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {q.keywords?.map((kw) => (
                              <span
                                key={kw}
                                className="flex items-center gap-1 bg-[#FFF8EB] border border-[#E8DCC8] text-[#005461] text-xs px-2.5 py-1 rounded-full"
                              >
                                {kw}
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeKeyword(qIndex, kw)
                                  }
                                  className="text-[#888888] hover:text-red-500 ml-1"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <section className="space-y-3 rounded-lg border border-[#E8DCC8] bg-[#FFFDF8] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-semibold text-[#005461]">
                              Rubric checkpoints
                            </h4>
                            <p className="mt-1 text-xs text-[#888888]">
                              Allocate all {q.maxMarks} question marks across concepts.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={
                              (q.rubric?.concepts.length ?? 0) >=
                              Math.floor(q.maxMarks * 100)
                            }
                            onClick={() => addRubricConcept(qIndex)}
                          >
                            Add concept
                          </Button>
                        </div>
                        {(q.rubric?.concepts ?? []).map((concept, conceptIndex) => (
                          <div
                            key={`${qIndex}-rubric-${conceptIndex}`}
                            className="space-y-2 rounded-md border border-[#E8DCC8] bg-white p-3"
                          >
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_100px_150px_auto]">
                              <input
                                value={concept.name}
                                onChange={(event) =>
                                  updateRubricConcept(qIndex, conceptIndex, 'name', event.target.value)
                                }
                                placeholder="Concept name"
                                aria-label={`Question ${qIndex + 1} rubric concept ${conceptIndex + 1} name`}
                                className="min-w-0 rounded-lg border border-[#E8DCC8] px-3 py-2 text-sm"
                              />
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={concept.maxMarks}
                                onChange={(event) =>
                                  updateRubricConcept(
                                    qIndex,
                                    conceptIndex,
                                    'maxMarks',
                                    Number(event.target.value)
                                  )
                                }
                                aria-label={`Marks for ${concept.name}`}
                                className="rounded-lg border border-[#E8DCC8] px-3 py-2 text-sm"
                              />
                              <select
                                value={concept.strictness}
                                onChange={(event) =>
                                  updateRubricConcept(
                                    qIndex,
                                    conceptIndex,
                                    'strictness',
                                    event.target.value as RubricConcept['strictness']
                                  )
                                }
                                aria-label={`Strictness for ${concept.name}`}
                                className="rounded-lg border border-[#E8DCC8] bg-white px-3 py-2 text-sm"
                              >
                                <option value="lenient">Lenient</option>
                                <option value="balanced">Balanced</option>
                                <option value="strict">Strict</option>
                              </select>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={(q.rubric?.concepts.length ?? 0) <= 1}
                                onClick={() => removeRubricConcept(qIndex, conceptIndex)}
                                aria-label={`Remove ${concept.name}`}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                            <textarea
                              rows={2}
                              value={concept.description}
                              onChange={(event) =>
                                updateRubricConcept(
                                  qIndex,
                                  conceptIndex,
                                  'description',
                                  event.target.value
                                )
                              }
                              placeholder="Describe the evidence that demonstrates this concept..."
                              aria-label={`Description for ${concept.name}`}
                              className="w-full resize-y rounded-lg border border-[#E8DCC8] px-3 py-2 text-sm"
                            />
                            <input
                              value={concept.keywords.join(', ')}
                              onChange={(event) =>
                                updateRubricConcept(
                                  qIndex,
                                  conceptIndex,
                                  'keywords',
                                  event.target.value
                                    .split(',')
                                    .map((keyword) => keyword.trim())
                                    .filter(Boolean)
                                )
                              }
                              placeholder="Optional concept keywords, separated by commas"
                              aria-label={`Keywords for ${concept.name}`}
                              className="w-full rounded-lg border border-[#E8DCC8] px-3 py-2 text-sm"
                            />
                          </div>
                        ))}
                        <p className="text-xs text-[#888888]">
                          Allocated: {(q.rubric?.concepts ?? []).reduce(
                            (sum, concept) => sum + concept.maxMarks,
                            0
                          )}{' '}
                          / {q.maxMarks} marks
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          {(
                            [
                              ['semantic', 'Reference-answer similarity'],
                              ['keywords', 'Keyword evidence'],
                              ['concepts', 'Concept coverage'],
                            ] as const
                          ).map(([field, label]) => (
                            <label key={field} className="flex flex-col gap-1 text-xs text-[#666666]">
                              {label} weight (%)
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={Math.round(
                                  (q.rubric?.scoringWeights[field] ?? 0) * 100
                                )}
                                onChange={(event) =>
                                  updateScoringWeight(
                                    qIndex,
                                    field,
                                    Number(event.target.value)
                                  )
                                }
                                className="rounded-lg border border-[#E8DCC8] px-3 py-2 text-sm text-[#1A1A1A]"
                              />
                            </label>
                          ))}
                        </div>
                        <p className="text-xs text-[#888888]">
                          Scoring weights must total 100%.
                        </p>
                      </section>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push('/dashboard')}
          >
            Cancel
          </Button>
          <Button type="submit" loading={loading} size="lg">
            <Save size={16} className="mr-2" />
            Save & Continue to Upload
          </Button>
        </div>
      </form>
    </div>
  );
}