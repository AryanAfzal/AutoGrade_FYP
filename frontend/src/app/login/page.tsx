'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { GraduationCap, Shield, BookOpen, Eye, EyeOff } from 'lucide-react';

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
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    setError('');
    try {
      const response = await authApi.login(data.email, data.password, selectedRole);
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));

      if (response.user.role === 'admin') {
        router.push('/dashboard/admin');
        return;
      }

      if (response.user.role === 'teacher') {
        router.push('/dashboard/teacher');
        return;
      }

      router.push('/dashboard/student');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Invalid credentials. Please try again.');
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
            Automate grading, track learning outcomes, and deliver meaningful feedback.
          </p>

          <div className="flex flex-col gap-3 pt-4">
            {[
              'MCQ & Descriptive Answer Evaluation',
              'CLO Attainment Tracking',
              'Academic Integrity Detection',
              'Instant Student Feedback',
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
        <div className="w-full max-w-md space-y-8">
          <div className="flex lg:hidden items-center gap-3 mb-6">
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
                onClick={() => setSelectedRole(role)}
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

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email Address"
              type="email"
              placeholder="you@cuiwah.edu.pk"
              error={errors.email?.message}
              {...register('email', {
                required: 'Email is required',
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: 'Enter a valid email address',
                },
              })}
            />

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                error={errors.password?.message}
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 6,
                    message: 'Password must be at least 6 characters',
                  },
                })}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-8 text-[#888888] hover:text-[#005461] transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <Button type="submit" size="lg" loading={loading} className="w-full mt-2">
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
                  Apply here
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
                  Register here
                </button>
              </>
            ) : (
              <span>Administrator accounts are managed by the institution.</span>
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
