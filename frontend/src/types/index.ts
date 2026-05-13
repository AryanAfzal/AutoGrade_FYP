// AUTH
export interface User {
  id: string;
  fullName: string;
  email: string;
  role: 'teacher' | 'admin' | 'student';
}

export interface AuthResponse {
  token: string;
  user: User;
}

// EXAM
export type QuestionType = 'mcq' | 'descriptive';

export interface MCQOption {
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
}

export interface Question {
  id: string;
  examId: string;
  type: QuestionType;
  questionText: string;
  maxMarks: number;
  clo: string;
  // MCQ specific
  options?: MCQOption[];
  correctAnswer?: string;
  // Descriptive specific
  referenceAnswer?: string;
  keywords?: string[];
}

export interface Exam {
  id: string;
  title: string;
  course: string;
  term: string;
  totalMarks: number;
  status: 'draft' | 'active' | 'under_review' | 'published' | 'closed';
  createdAt: string;
  questions: Question[];
}

// ANSWER SHEETS
export type SheetStatus =
  | 'uploaded'
  | 'mapped'
  | 'processing'
  | 'flagged'
  | 'awaiting_approval'
  | 'approved';

export interface AnswerSheet {
  id: string;
  examId: string;
  studentName: string;
  registrationNo: string;
  filePath: string;
  status: SheetStatus;
  uploadedAt: string;
}

// EVALUATION
export interface AnswerEntry {
  id: string;
  questionId: string;
  questionText: string;
  studentAnswer: string;
  referenceAnswer: string;
  aiMark: number;
  maxMarks: number;
  confidence: number;
  semanticScore: number;
  keywordScore: number;
  isCorrect?: boolean;
  isFlagged: boolean;
  approvedMark?: number;
  type: QuestionType;
}

export interface StudentResult {
  answersheetId: string;
  studentName: string;
  registrationNo: string;
  totalAiMark: number;
  totalMaxMarks: number;
  status: SheetStatus;
  entries: AnswerEntry[];
}

// SIMILARITY
export type SimilarityStatus = 'review' | 'suspected' | 'critical';

export interface SimilarityFlag {
  id: string;
  studentA: string;
  studentB: string;
  regA: string;
  regB: string;
  similarity: number;
  status: SimilarityStatus;
}

// ANALYTICS
export interface CLOAttainment {
  clo: string;
  attainmentPercent: number;
  studentsMet: number;
  totalStudents: number;
}

export interface QuestionDifficulty {
  questionId: string;
  questionText: string;
  averageMark: number;
  maxMarks: number;
  difficultyIndex: number;
}

export interface AnalyticsReport {
  examId: string;
  examTitle: string;
  totalStudents: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  cloAttainment: CLOAttainment[];
  questionDifficulty: QuestionDifficulty[];
  scoreDistribution: { range: string; count: number }[];
}