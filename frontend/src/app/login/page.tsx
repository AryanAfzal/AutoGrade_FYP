'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { authApi, saveAuthSession } from '@/lib/api';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { GraduationCap, Shield, BookOpen, CheckCircle2, ArrowLeft } from 'lucide-react';

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
    <div className="login-page relative min-h-screen flex">
      <div className="login-brand-panel relative hidden lg:flex lg:w-1/2 min-h-screen overflow-hidden bg-[#003D47] flex-col justify-between p-12">
        <img
          src="/assets/african-female-teacher-checking-answer-sheet-after-exam-top-view-workplace-school-and-college-education-concept-vector-illustration-in-flat-cartoon-2RPAB4R.jpg"
          alt=""
          aria-hidden="true"
          className="login-brand-image absolute inset-0 h-full w-full object-cover object-center opacity-25"
        />
        <div className="login-brand-overlay absolute inset-0 bg-gradient-to-b from-[#003D47]/75 via-[#005461]/40 to-[#003D47]/95" />

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/favicon-round.png"
              alt="AutoGrade Logo"
              width={42}
              height={42}
              className="login-brand-mark w-[42px] h-[42px] object-contain rounded-full shadow-md"
              priority
            />
            <span className="text-white text-xl font-semibold">AutoGrade</span>
          </div>
          <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/10">
            <ArrowLeft size={15} />
            Back to website
          </Link>
        </div>

        <div className="relative z-10 max-w-lg space-y-5 pr-4">
          <h1 className="text-[42px] font-bold text-white leading-[1.08] tracking-[-1.8px]">
            AI-Powered<br />
            Examination<br />
            Evaluation
          </h1>
          <p className="text-[#9ECDD6] text-base leading-relaxed max-w-sm">
            Automate grading, track learning outcomes, and deliver meaningful feedback with secure role-based access control.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {['AI Evaluation', 'CLO Analytics', 'Secure Roles'].map((feature) => (
              <span
                key={feature}
                className="rounded-full border border-white/20 bg-[#003D47]/55 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm"
              >
                {feature}
              </span>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-[#C8E6EA] text-xs">
          COMSATS University Islamabad, Wah Campus — Session 2023–2026
        </p>
      </div>

      <div className="login-form-panel relative w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="login-content w-full max-w-md space-y-6">
          <div className="login-mobile-brand flex lg:hidden items-center gap-3 mb-4 pr-24">
            <div className="w-9 h-9 bg-[#005461] rounded-lg flex items-center justify-center">
              <BookOpen size={18} className="text-[#FAB963]" />
            </div>
            <span className="login-mobile-brand-name text-[#005461] text-lg font-semibold">AutoGrade</span>
            <Link href="/" className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[#005461]">
              <ArrowLeft size={14} />
              Website
            </Link>
          </div>

          <div className="space-y-1">
            <h2 className="login-title text-2xl font-bold text-[#1A1A1A]">Welcome back</h2>
            <p className="login-subtitle text-sm text-[#888888]">Select your role and sign in to continue</p>
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
                className={`login-role-card relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 text-center transition-all duration-200 ${
                  selectedRole === role
                    ? 'selected border-[#005461] bg-[#005461] text-white shadow-md'
                    : 'border-[#E8DCC8] bg-white text-[#4A4A4A] hover:border-[#005461] cursor-pointer'
                }`}
              >
                <span className={selectedRole === role ? 'text-[#FAB963]' : ''}>{icon}</span>
                <span className="text-xs font-medium">{label}</span>
                <span
                  className={`login-role-description text-[10px] leading-tight hidden sm:block ${
                    selectedRole === role ? 'text-[#C8E6EA]' : 'text-[#888888]'
                  }`}
                >
                  {description}
                </span>
              </button>
            ))}
          </div>

          {selectedRole === 'admin' && (
            <div className="login-admin-notice rounded-xl border border-[#E8DCC8] bg-white px-4 py-3 text-xs text-[#555555]">
              <p className="font-semibold text-[#005461]">Administrator Account</p>
              <p className="mt-0.5">
                Authorized email: <code className="font-mono">admin@academy.com</code>
              </p>
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="login-success-notice flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
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
                  ? 'admin@academy.com'
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
              <label className="login-remember-label flex items-center gap-2 cursor-pointer select-none text-[#4A4A4A]">
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
                className="login-forgot-link font-semibold text-[#005461] hover:underline"
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

            <Button type="submit" size="lg" loading={loading} className="login-submit-button w-full">
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
                  className="login-register-link text-[#005461] font-semibold hover:underline"
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
                  className="login-register-link text-[#005461] font-semibold hover:underline"
                >
                  Create student account
                </button>
              </>
            ) : (
              <span>Predefined administrator accounts cannot be registered by ordinary users.</span>
            )}
          </div>

          <p className="login-footer text-center text-xs text-[#888888]">
            AutoGrade — FYP Project · COMSATS Wah · <span className="text-[#005461] font-medium">2023–2026</span>
          </p>
        </div>
      </div>
    </div>
  );
}
