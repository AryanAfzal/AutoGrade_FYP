import type { User } from '@/types';

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:3001';
const formattedApiUrl = /^https?:\/\//i.test(rawApiUrl) ? rawApiUrl : `https://${rawApiUrl}`;
const BASE_URL = formattedApiUrl.replace(/\/+$/, '');

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('token') || localStorage.getItem('token');
}

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem('user') || localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function saveAuthSession(token: string, user: User, rememberMe = true) {
  if (typeof window === 'undefined') return;
  const serializedUser = JSON.stringify(user);
  if (rememberMe) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', serializedUser);
    localStorage.setItem('rememberMe', 'true');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
  } else {
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('user', serializedUser);
    // Keep user metadata mirrored so legacy components reading localStorage.getItem('user') work during the active session
    localStorage.setItem('user', serializedUser);
    localStorage.setItem('rememberMe', 'false');
    localStorage.removeItem('token');
  }
  window.dispatchEvent(new CustomEvent('autograde:user-updated', { detail: user }));
}

export function updateStoredUser(user: User) {
  if (typeof window === 'undefined') return;
  const serializedUser = JSON.stringify(user);
  if (sessionStorage.getItem('token')) {
    sessionStorage.setItem('user', serializedUser);
  }
  localStorage.setItem('user', serializedUser);
  window.dispatchEvent(new CustomEvent('autograde:user-updated', { detail: user }));
}

export function clearAuthSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('rememberMe');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(res: Response, isAuthEndpoint = false): Promise<T> {
  if (!res.ok) {
    if (res.status === 401 && !isAuthEndpoint && typeof window !== 'undefined') {
      clearAuthSession();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login?expired=1';
      }
    }
    const error = await res.json().catch(() => ({ message: 'Something went wrong' }));
    const message = Array.isArray(error.message)
      ? error.message.join(' ')
      : error.message || 'Request failed';
    throw new Error(message);
  }
  return res.json();
}

export const authApi = {
  getCurrentUser: async () => {
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: authHeaders(),
    });
    return handleResponse<import('@/types').User>(res);
  },

  login: async (
    email: string,
    password: string,
    role: 'teacher' | 'admin' | 'student' = 'teacher',
    rememberMe = true,
  ) => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role, rememberMe }),
    });
    return handleResponse<{
      token: string;
      rememberMe?: boolean;
      expiresIn?: string;
      user: import('@/types').User;
    }>(res, true);
  },

  googleAdminLogin: async (email: string, emailVerified: boolean) => {
    const res = await fetch(`${BASE_URL}/auth/google-admin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, emailVerified }),
    });
    return handleResponse<{ token: string; user: import('@/types').User }>(res, true);
  },

  googleAuth: async (payload: {
    idToken?: string;
    email?: string;
    fullName?: string;
    profilePicture?: string;
    role: 'teacher' | 'student' | 'admin';
    university?: string;
    registrationNumber?: string;
    rememberMe?: boolean;
  }) => {
    const res = await fetch(`${BASE_URL}/auth/google-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<{
      token?: string;
      pendingApproval?: boolean;
      message?: string;
      user: import('@/types').User;
    }>(res, true);
  },

  forgotPassword: async (email: string) => {
    const res = await fetch(`${BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return handleResponse<{
      message: string;
      resetToken?: string;
      resetLink?: string;
      expiresInMinutes?: number;
    }>(res, true);
  },

  resetPassword: async (payload: {
    token: string;
    newPassword: string;
    confirmPassword: string;
  }) => {
    const res = await fetch(`${BASE_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<{ message: string }>(res, true);
  },

  updateProfile: async (payload: {
    fullName?: string;
    email?: string;
    university?: string;
    phone?: string;
    department?: string;
    qualification?: string;
    registrationNumber?: string;
    profilePicture?: string;
  }) => {
    const res = await fetch(`${BASE_URL}/auth/profile`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse<{ message: string; user: import('@/types').User }>(res);
  },

  uploadProfilePicture: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = getToken();
    const res = await fetch(`${BASE_URL}/auth/profile/picture`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    return handleResponse<{ message: string; user: import('@/types').User }>(res);
  },

  changePassword: async (payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => {
    const res = await fetch(`${BASE_URL}/auth/change-password`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse<{ message: string }>(res, true);
  },

  registerStudent: async (payload: {
    university: string;
    fullName: string;
    email: string;
    registrationNumber: string;
    password: string;
  }) => {
    const res = await fetch(`${BASE_URL}/auth/register/student`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<{ message: string; user: import('@/types').User }>(res, true);
  },

  registerTeacher: async (payload: {
    fullName: string;
    email: string;
    password: string;
    university?: string;
    phone?: string;
    department?: string;
    qualification?: string;
  }) => {
    const res = await fetch(`${BASE_URL}/auth/register/teacher`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<{ message: string; user: import('@/types').User }>(res, true);
  },

  getTeacherApplications: async () => {
    const res = await fetch(`${BASE_URL}/auth/teacher-applications`, {
      headers: authHeaders(),
    });
    return handleResponse<import('@/types').TeacherApplication[]>(res);
  },

  getStudentApplications: async () => {
    const res = await fetch(`${BASE_URL}/auth/student-applications`, {
      headers: authHeaders(),
    });
    return handleResponse<import('@/types').StudentApplication[]>(res);
  },

  updateStudentApplication: async (
    id: string,
    status: 'APPROVED' | 'REJECTED',
    rollNumber?: string,
    reason?: string,
  ) => {
    const res = await fetch(`${BASE_URL}/auth/student-applications/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status, rollNumber, reason }),
    });
    return handleResponse<{
      message: string;
      student: {
        id: string;
        status: string;
        rollNumber: string | null;
        rejectionReason: string | null;
      };
    }>(res);
  },

  updateTeacherApplication: async (
    id: string,
    status: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) => {
    const res = await fetch(`${BASE_URL}/auth/teacher-applications/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status, reason }),
    });
    return handleResponse<{ message: string; teacher: { id: string; status: string; rejectionReason: string | null } }>(res);
  },

  assignTeacherSubjects: async (id: string, subjects: string[]) => {
    const res = await fetch(`${BASE_URL}/auth/teachers/${id}/subjects`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ subjects }),
    });
    return handleResponse<{
      id: string;
      fullName: string;
      assignedSubjects: string[];
      assignedCourseIds: string[];
    }>(res);
  },

  getTeacherRequests: async () => {
    const res = await fetch(`${BASE_URL}/auth/teacher-requests`, {
      headers: authHeaders(),
    });
    return handleResponse<import('@/types').TeacherEnrollmentRequest[]>(res);
  },

  getEnrollmentOptions: async () => {
    const res = await fetch(`${BASE_URL}/auth/enrollment-options`, {
      headers: authHeaders(),
    });
    return handleResponse<{
      offerings: import('@/types').EnrollmentOffering[];
      enrollments: import('@/types').StudentEnrollment[];
      department: { id: string; name: string; code: string } | null;
    }>(res);
  },

  createStudentEnrollment: async (teacherId: string, subject: string) => {
    const res = await fetch(`${BASE_URL}/auth/enrollments`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ teacherId, subject }),
    });
    return handleResponse<{ message: string }>(res);
  },

  updateTeacherRequest: async (id: string, status: 'APPROVED' | 'REJECTED', reason?: string) => {
    const res = await fetch(`${BASE_URL}/auth/teacher-requests/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status, reason }),
    });
    return handleResponse<{ message: string; user: { id: string; status: string; subject: string; teacherId: string } }>(res);
  },

  getPublishedStudentResults: async () => {
    const res = await fetch(`${BASE_URL}/student/results`, {
      headers: authHeaders(),
    });
    return handleResponse<import('@/types').PublishedStudentResult[]>(res);
  },

  createRecheckRequest: async (answerEntryId: string, justification: string) => {
    const res = await fetch(`${BASE_URL}/student/recheck-requests`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ answerEntryId, justification }),
    });
    return handleResponse<{ id: string; status: 'pending'; message: string }>(res);
  },

  getNotifications: async () => {
    const res = await fetch(`${BASE_URL}/student/notifications`, {
      headers: authHeaders(),
    });
    return handleResponse<import('@/types').UserNotification[]>(res);
  },

  markNotificationRead: async (id: string) => {
    const res = await fetch(`${BASE_URL}/student/notifications/${id}/read`, {
      method: 'PATCH',
      headers: authHeaders(),
    });
    return handleResponse<{ message: string }>(res);
  },

  logout: () => {
    const token = getToken();
    if (token) {
      fetch(`${BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: authHeaders(),
      }).catch(() => {});
    }
    clearAuthSession();
  },
};

async function institutionRequest<T>(path: string, options: RequestInit = {}) {
  const method = options.method || 'GET';
  try {
    const res = await fetch(`${BASE_URL}/institutions${path}`, {
      ...options,
      headers: {
        ...authHeaders(),
        ...(options.headers || {}),
      },
    });
    return await handleResponse<T>(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected request failure.';
    throw new Error(`${method} /institutions${path}: ${message}`);
  }
}

export const institutionApi = {
  getOverview: () => institutionRequest<{
    departmentCount: number;
    courseCount: number;
    termCount: number;
    userCount: number;
    assignedUserCount: number;
  }>('/overview'),
  getDepartments: () => institutionRequest<import('@/types').Department[]>('/departments'),
  createDepartment: (payload: Partial<import('@/types').Department>) =>
    institutionRequest<import('@/types').Department>('/departments', { method: 'POST', body: JSON.stringify(payload) }),
  updateDepartment: (id: string, payload: Partial<import('@/types').Department>) =>
    institutionRequest<import('@/types').Department>(`/departments/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteDepartment: (id: string) => institutionRequest<{ message: string }>(`/departments/${id}`, { method: 'DELETE' }),
  getCourses: () => institutionRequest<import('@/types').Course[]>('/courses'),
  createCourse: (payload: Partial<import('@/types').Course>) =>
    institutionRequest<import('@/types').Course>('/courses', { method: 'POST', body: JSON.stringify(payload) }),
  updateCourse: (id: string, payload: Partial<import('@/types').Course>) =>
    institutionRequest<import('@/types').Course>(`/courses/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteCourse: (id: string) => institutionRequest<{ message: string }>(`/courses/${id}`, { method: 'DELETE' }),
  getTerms: () => institutionRequest<import('@/types').AcademicTerm[]>('/terms'),
  createTerm: (payload: Partial<import('@/types').AcademicTerm>) =>
    institutionRequest<import('@/types').AcademicTerm>('/terms', { method: 'POST', body: JSON.stringify(payload) }),
  updateTerm: (id: string, payload: Partial<import('@/types').AcademicTerm>) =>
    institutionRequest<import('@/types').AcademicTerm>(`/terms/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTerm: (id: string) => institutionRequest<{ message: string }>(`/terms/${id}`, { method: 'DELETE' }),
  getUsers: () => institutionRequest<import('@/types').User[]>('/users'),
  assignUserDepartment: (id: string, departmentId: string | null) =>
    institutionRequest<{ message: string; user: import('@/types').User }>(`/users/${id}/department`, {
      method: 'PATCH',
      body: JSON.stringify({ departmentId }),
    }),
  getStudentAssignments: () =>
    institutionRequest<import('@/types').AdminStudentSubjectAssignment[]>('/student-assignments'),
  assignStudentSubject: (studentId: string, teacherId: string, courseId: string) =>
    institutionRequest<{ message: string; enrollment: import('@/types').AdminStudentSubjectAssignment }>(`/users/${studentId}/subjects`, {
      method: 'POST',
      body: JSON.stringify({ teacherId, courseId }),
    }),
};

export const examApi = {
  create: async (data: {
    title: string;
    course: string;
    term: string;
    totalMarks: number;
    recheckDeadline: string;
    questions: import('@/types').Question[];
  }) => {
    const res = await fetch(`${BASE_URL}/exams`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<import('@/types').Exam>(res);
  },

  updateRecheckDeadline: async (id: string, recheckDeadline: string) => {
    const res = await fetch(`${BASE_URL}/exams/${id}/recheck-deadline`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ recheckDeadline }),
    });
    return handleResponse<import('@/types').Exam>(res);
  },

  getAll: async () => {
    const res = await fetch(`${BASE_URL}/exams`, {
      headers: authHeaders(),
    });
    return handleResponse<import('@/types').Exam[]>(res);
  },

  getById: async (id: string) => {
    const res = await fetch(`${BASE_URL}/exams/${id}`, {
      headers: authHeaders(),
    });
    return handleResponse<import('@/types').Exam>(res);
  },

  delete: async (id: string) => {
    const res = await fetch(`${BASE_URL}/exams/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return handleResponse<{ message: string }>(res);
  },

  uploadPDF: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = getToken();
    const res = await fetch(`${BASE_URL}/exams/parse-pdf`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    return handleResponse<{ questions: import('@/types').Question[] }>(res);
  },
};

export const uploadApi = {
  uploadSheets: async (
    examId: string,
    files: File[],
    ocrEngine: import('@/types').OcrEngine = 'trocr',
  ) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    formData.append('ocrEngine', ocrEngine);
    const token = getToken();
    const res = await fetch(`${BASE_URL}/uploads/${examId}`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    return handleResponse<import('@/types').AnswerSheet[]>(res);
  },

  getSheets: async (examId: string) => {
    const res = await fetch(`${BASE_URL}/uploads/${examId}`, {
      headers: authHeaders(),
    });
    return handleResponse<import('@/types').AnswerSheet[]>(res);
  },

  getSheetPdf: async (examId: string, sheetId: string, signal?: AbortSignal) => {
    const res = await fetch(`${BASE_URL}/uploads/${examId}/${sheetId}/file`, {
      headers: authHeaders(),
      signal,
    });
    if (!res.ok) {
      return handleResponse<Blob>(res);
    }
    return res.blob();
  },

  deleteSheet: async (examId: string, sheetId: string) => {
    const res = await fetch(`${BASE_URL}/uploads/${examId}/${sheetId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return handleResponse<{ message: string }>(res);
  },
};

export const evaluationApi = {
  triggerEvaluation: async (
    examId: string,
    ocrEngine?: import('@/types').OcrEngine,
  ) => {
    const res = await fetch(`${BASE_URL}/evaluation/${examId}/trigger`, {
      method: 'POST',
      headers: authHeaders(),
      body: ocrEngine ? JSON.stringify({ ocrEngine }) : undefined,
    });
    return handleResponse<{
      started: boolean;
      queuedSheets: number;
      message: string;
    }>(res);
  },

  getResults: async (examId: string) => {
    const res = await fetch(`${BASE_URL}/evaluation/${examId}`, {
      headers: authHeaders(),
    });
    return handleResponse<import('@/types').StudentResult[]>(res);
  },

  getSimilarityFlags: async (examId: string) => {
    const res = await fetch(`${BASE_URL}/evaluation/${examId}/similarity`, {
      headers: authHeaders(),
    });
    return handleResponse<import('@/types').SimilarityFlag[]>(res);
  },

  getOmrImage: async (examId: string, sheetId: string, signal?: AbortSignal) => {
    const res = await fetch(`${BASE_URL}/evaluation/${examId}/sheets/${sheetId}/omr-image`, {
      headers: authHeaders(),
      signal,
    });
    if (!res.ok) {
      return handleResponse<Blob>(res);
    }
    return res.blob();
  },

  reviewAnswerEntry: async (
    examId: string,
    entryId: string,
    payload:
      | { action: 'approve'; approvalComment?: string }
      | { action: 'override'; mark: number; comment: string },
  ) => {
    const res = await fetch(
      `${BASE_URL}/evaluation/${examId}/entries/${entryId}/review`,
      {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      },
    );
    return handleResponse<{
      entryId: string;
      reviewStatus: 'approved' | 'overridden';
      approvedMark: number;
      totalApprovedMark: number | null;
    }>(res);
  },

  completeResultReview: async (examId: string, resultId: string) => {
    const res = await fetch(
      `${BASE_URL}/evaluation/${examId}/results/${resultId}/complete`,
      {
        method: 'PATCH',
        headers: authHeaders(),
      },
    );
    return handleResponse<{
      resultId: string;
      reviewCompletedAt: string;
    }>(res);
  },

  publishResults: async (examId: string) => {
    const res = await fetch(`${BASE_URL}/evaluation/${examId}/publish`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return handleResponse<{
      message: string;
      publishedCount: number;
      examCompleted: boolean;
      publishedAt: string | null;
    }>(res);
  },

  getTeacherRecheckRequests: async () => {
    const res = await fetch(`${BASE_URL}/teacher/recheck-requests`, {
      headers: authHeaders(),
    });
    return handleResponse<import('@/types').TeacherRecheckRequest[]>(res);
  },

  decideRecheckRequest: async (
    id: string,
    payload: { decision: 'uphold'; comment: string } | { decision: 'revise'; comment: string; mark: number },
  ) => {
    const res = await fetch(`${BASE_URL}/teacher/recheck-requests/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse<{
      id: string;
      status: 'upheld' | 'revised';
      finalMark: number;
      totalApprovedMark: number | null;
      resolvedAt: string;
    }>(res);
  },
};

export const analyticsApi = {
  getReport: async (examId: string) => {
    const res = await fetch(`${BASE_URL}/analytics/${examId}`, {
      headers: authHeaders(),
    });
    return handleResponse<import('@/types').AnalyticsReport>(res);
  },

  exportCSV: async (examId: string) => {
    const token = getToken();
    const res = await fetch(`${BASE_URL}/analytics/${examId}/export`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${examId}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  },
};
