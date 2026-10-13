// AUTH
export type UserRole = 'teacher' | 'admin' | 'student';
export type UserAccountStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  status?: UserAccountStatus;
  course?: string | null;
  teacherId?: string | null;
  department?: string | null;
  qualification?: string | null;
  assignedSubjects?: string[];
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface RegistrationOption {
  id: string;
  fullName: string;
  email: string;
  subjects: string[];
}

export interface TeacherApplication {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  department: string | null;
  qualification: string | null;
  status: UserAccountStatus;
  rejectionReason: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
  assignedSubjects: string[];
}

export interface RegistrationRequest {
  id: string;
  fullName: string;
  email: string;
  course: string | null;
  status: UserAccountStatus;
  teacherId: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
}

// EXAM
export type QuestionType = 'mcq' | 'descriptive';

export interface MCQOption {
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
}

export type RubricStrictness = 'lenient' | 'balanced' | 'strict';

export interface RubricConcept {
  name: string;
  description: string;
  keywords: string[];
  maxMarks: number;
  strictness: RubricStrictness;
}

export interface RubricScoringWeights {
  semantic: number;
  keywords: number;
  concepts: number;
}

export interface QuestionRubric {
  concepts: RubricConcept[];
  scoringWeights: RubricScoringWeights;
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
  rubric?: QuestionRubric;
}

export interface Exam {
  id: string;
  title: string;
  course: string;
  term: string;
  totalMarks: number;
  status: 'draft' | 'active' | 'under_review' | 'published' | 'closed';
  publishedAt?: string | null;
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
  reviewStatus: 'pending' | 'approved' | 'overridden';
  reviewAuditTrail?: ReviewAuditEntry[];
  type: QuestionType;
  rubricBreakdown?: {
    conceptName: string;
    maxMarks: number;
    coverage: number;
    awardedMarks: number;
    status: 'addressed' | 'partially addressed' | 'not addressed';
    strictness: RubricStrictness;
  }[] | null;
  conceptScore?: number;
  feedback?: string | null;
}

export interface ReviewAuditEntry {
  id: string;
  action: 'approve' | 'override';
  originalAiMark: number;
  finalMark: number;
  comment: string | null;
  reviewedAt: string;
  reviewerName: string;
}

export interface StudentResult {
  id: string;
  answersheetId: string;
  studentName: string;
  registrationNo: string;
  totalAiMark: number;
  totalMaxMarks: number;
  totalApprovedMark: number | null;
  reviewCompletedAt: string | null;
  status: SheetStatus;
  entries: AnswerEntry[];
}

// SIMILARITY
export type SimilarityStatus = 'review' | 'suspected' | 'critical';

// SIMILARITY
export interface SimilarityStudent {
  name:          string;
  regNo:         string;
  answersheetId: string;
  answerText:    string;
}

export interface SimilarityFlag {
  questionId:      string;
  questionText:    string;
  questionNumber:  number;
  studentA:        SimilarityStudent;
  studentB:        SimilarityStudent;
  similarityScore: number;
}

export interface SimilarityReport {
  examId:   string;
  summary: {
    totalFlaggedPairs: number;
    studentsInvolved:  string[];
    byQuestion:        { questionId: string; questionText: string; flagCount: number }[];
  };
  flaggedPairs: SimilarityFlag[];
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