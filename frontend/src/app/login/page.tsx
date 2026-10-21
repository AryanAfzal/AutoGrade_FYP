'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi, saveAuthSession } from '@/lib/api';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { GraduationCap, Shield, BookOpen, CheckCircle2 } from 'lucide-react';

type Role = 'teacher' | 'admin' | 'student';

interface LoginForm {
  email: string;
  password: string;
}

interface RoleOption {
  role: Role;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const roles: RoleOption[] = [
  {
    role: 'teacher',
    label: 'Teacher',
    description: 'Manage exams and review grades',
    icon: <BookOpen size={20} />,
  },
  {
    role: 'admin',
    label: 'Administrator',
    description: 'Manage users and institution',
    icon: <Shield size={20} />,
  },
  {
    role: 'student',
    label: 'Student',
    description: 'View results and feedback',
    icon: <GraduationCap size={20} />,
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<Role>('teacher');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('expired') === '1') {
        setError('Your session has expired. Please sign in again.');
      }
      if (params.get('reset') === 'success') {
        setNotice('Your password has been changed successfully. Please sign in with your new password.');
      }
    }
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>();

  const redirectUser = (role: Role) => {
    if (role === 'admin') {
      router.push('/dashboard/admin');
      return;
    }
    if (role === 'teacher') {
      router.push('/dashboard/teacher');
      return;
    }
    router.push('/dashboard/student');
  };

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const response = await authApi.login(
        data.email,
        data.password,
        selectedRole,
        rememberMe,
      );
      saveAuthSession(response.token, response.user, rememberMe);
      redirectUser(response.user.role);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Invalid login credentials. Please check your email and password.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF8EB] flex">
      <div className="hidden lg:flex lg:w-1/2 bg-[#005461] flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#FAB963] rounded-lg flex items-center justify-center">
            <BookOpen size={20} className="text-[#1A1A1A]" />
          </div>
          <span className="text-white text-xl font-semibold">AutoGrade</span>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight">
            AI-Powered<br />
            Examination<br />
            Evaluation
          </h1>
          <p className="text-[#9ECDD6] text-base leading-relaxed max-w-sm">
            Automate grading, track learning outcomes, and deliver meaningful feedback with secure role-based access control.
          </p>

          <div className="flex flex-col gap-3 pt-4">
            {[
              'MCQ & Descriptive Answer Evaluation',
              'CLO Attainment Tracking',
              'Academic Integrity Detection',
              'Role-Based Access (Admin, Teacher, Student)',
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-[#FAB963] shrink-0" />
                <span className="text-[#C8E6EA] text-sm">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[#6BAAB5] text-xs">
          COMSATS University Islamabad, Wah Campus — Session 2023–2026
        </p>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="flex lg:hidden items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-[#005461] rounded-lg flex items-center justify-center">
              <BookOpen size={18} className="text-[#FAB963]" />
            </div>
            <span className="text-[#005461] text-lg font-semibold">AutoGrade</span>
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-[#1A1A1A]">Welcome back</h2>
            <p className="text-sm text-[#888888]">Select your role and sign in to continue</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {roles.map(({ role, label, description, icon }) => (
              <button
                key={role}
                type="button"
                onClick={() => {
                  setSelectedRole(role);
                  setError('');
                }}
                className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 text-center transition-all duration-200 ${
                  selectedRole === role
                    ? 'border-[#005461] bg-[#005461] text-white shadow-md'
                    : 'border-[#E8DCC8] bg-white text-[#4A4A4A] hover:border-[#005461] cursor-pointer'
                }`}
              >
                <span className={selectedRole === role ? 'text-[#FAB963]' : ''}>{icon}</span>
                <span className="text-xs font-medium">{label}</span>
                <span
                  className={`text-[10px] leading-tight hidden sm:block ${
                    selectedRole === role ? 'text-[#C8E6EA]' : 'text-[#888888]'
                  }`}
                >
                  {description}
                </span>
              </button>
            ))}
          </div>

          {selectedRole === 'admin' && (
            <div className="rounded-xl border border-[#E8DCC8] bg-white px-4 py-3 text-xs text-[#555555]">
              <p className="font-semibold text-[#005461]">Predefined Administrator Accounts</p>
              <p className="mt-0.5">
                Authorized emails: <code className="font-mono">admin1@cuiwah.edu.pk</code>,{' '}
                <code className="font-mono">admin2@cuiwah.edu.pk</code>,{' '}
                <code className="font-mono">admin3@cuiwah.edu.pk</code>
              </p>
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
            >
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
              <span>{notice}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <Input
              label="Email Address"
              type="email"
              placeholder={
                selectedRole === 'admin'
                  ? 'admin1@cuiwah.edu.pk'
                  : 'you@cuiwah.edu.pk'
              }
              error={errors.email?.message}
              {...register('email', {
                required: 'Email address is required.',
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: 'Please enter a valid email address.',
                },
              })}
            />

            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              error={errors.password?.message}
              {...register('password', {
                required: 'Password is required.',
              })}
            />

            <div className="flex items-center justify-between text-xs pt-0.5">
              <label className="flex items-center gap-2 cursor-pointer select-none text-[#4A4A4A]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-[#E8DCC8] text-[#005461] focus:ring-[#005461]"
                />
                <span>Remember me on this device</span>
              </label>

              <Link
                href="/forgot-password"
                className="font-semibold text-[#005461] hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            {error && (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 rounded-lg px-4 py-3"
              >
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <Button type="submit" size="lg" loading={loading} className="w-full">
              Sign in as {roles.find((r) => r.role === selectedRole)?.label}
            </Button>
          </form>

          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-[#888888]">
            {selectedRole === 'teacher' ? (
              <>
                <span>New teacher?</span>
                <button
                  type="button"
                  onClick={() => router.push('/register/teacher')}
                  className="text-[#005461] font-semibold hover:underline"
                >
                  Create teacher account
                </button>
              </>
            ) : selectedRole === 'student' ? (
              <>
                <span>New student?</span>
                <button
                  type="button"
                  onClick={() => router.push('/register/student')}
                  className="text-[#005461] font-semibold hover:underline"
                >
                  Create student account
                </button>
              </>
            ) : (
              <span>Predefined administrator accounts cannot be registered by ordinary users.</span>
            )}
          </div>

          <p className="text-center text-xs text-[#888888]">
            AutoGrade — FYP Project · COMSATS Wah · <span className="text-[#005461] font-medium">2023–2026</span>
          </p>
        </div>
      </div>
    </div>
  );
}
