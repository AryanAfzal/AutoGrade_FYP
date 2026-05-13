const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ─── HELPER ───────────────────────────────────────────────
function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Something went wrong' }));
    throw new Error(error.message || 'Request failed');
  }
  return res.json();
}

// ─── AUTH ─────────────────────────────────────────────────
export const authApi = {
  login: async (email: string, password: string) => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return handleResponse<{ token: string; user: import('@/types').User }>(res);
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
};

// ─── EXAMS ────────────────────────────────────────────────
export const examApi = {
  create: async (data: {
    title: string;
    course: string;
    term: string;
    totalMarks: number;
    questions: import('@/types').Question[];
  }) => {
    const res = await fetch(`${BASE_URL}/exams`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
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

// ─── UPLOADS ──────────────────────────────────────────────
export const uploadApi = {
  uploadSheets: async (examId: string, files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
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
};

// ─── EVALUATION ───────────────────────────────────────────
export const evaluationApi = {
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

  publishResults: async (examId: string) => {
    const res = await fetch(`${BASE_URL}/evaluation/${examId}/publish`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return handleResponse<{ message: string }>(res);
  },
};

// ─── ANALYTICS ────────────────────────────────────────────
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