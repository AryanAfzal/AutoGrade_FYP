'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { BookOpen, GraduationCap } from 'lucide-react';
import type { RegistrationOption } from '@/types';

interface StudentRegistrationForm {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  course: string;
  teacherId: string;
}

export default function StudentRegistrationPage() {
  const router = useRouter();
  const [teachers, setTeachers] = useState<RegistrationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<StudentRegistrationForm>();
  const selectedTeacherId = watch('teacherId');
  const selectedTeacher = teachers.find((teacher) => teacher.id === selectedTeacherId);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const response = await authApi.getRegistrationOptions();
        setTeachers(response.teachers);
      } catch {
        setError('Unable to load teachers and courses right now.');
      } finally {
        setLoadingOptions(false);
      }
    };

    loadOptions();
  }, []);

  const passwordValue = watch('password');

  const onSubmit = async (data: StudentRegistrationForm) => {
    if (data.password !== data.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await authApi.registerStudent({
        fullName: data.fullName,
        email: data.email,
        password: data.password,
        course: data.course,
        teacherId: data.teacherId,
      });
      setSuccess(response.message);
      setTimeout(() => router.push('/login'), 1800);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Unable to submit registration');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF8EB] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white border border-[#E8DCC8] rounded-2xl shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 bg-[#005461] rounded-xl flex items-center justify-center">
            <GraduationCap size={22} className="text-[#FAB963]" />
          </div>
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-[#6BAAB5]">Student Portal</p>
            <h1 className="text-2xl font-bold text-[#1A1A1A]">Register as a student</h1>
          </div>
        </div>

        {loadingOptions ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-[#005461] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {teachers.length === 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                No approved teachers have subjects assigned yet. Please check back after an administrator assigns subjects.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Full Name"
                placeholder="Enter your full name"
                error={errors.fullName?.message}
                {...register('fullName', {
                  required: 'Full name is required',
                  minLength: { value: 2, message: 'Full name is too short' },
                })}
              />

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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Password"
                type="password"
                placeholder="Create a password"
                error={errors.password?.message}
                {...register('password', {
                  required: 'Password is required',
                  minLength: { value: 6, message: 'Password must be at least 6 characters' },
                })}
              />

              <Input
                label="Confirm Password"
                type="password"
                placeholder="Confirm password"
                error={errors.confirmPassword?.message}
                {...register('confirmPassword', {
                  required: 'Please confirm your password',
                  validate: (value) => value === passwordValue || 'Passwords do not match',
                })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-[#1A1A1A]">Course</label>
                <select
                  {...register('course', {
                    required: 'Subject is required',
                    validate: (value) => selectedTeacher?.subjects.includes(value) || 'Select a subject assigned to the chosen teacher',
                  })}
                  className="w-full border border-[#E8DCC8] bg-[#FFFDF9] rounded-xl px-4 py-3 text-sm text-[#1A1A1A] focus:border-[#005461] focus:outline-none"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select a subject
                  </option>
                  {(selectedTeacher?.subjects || []).map((course) => (
                    <option key={course} value={course}>
                      {course}
                    </option>
                  ))}
                </select>
                {errors.course && <p className="text-xs text-red-500 mt-1">{errors.course.message}</p>}
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-[#1A1A1A]">Assigned teacher</label>
                <select
                  {...register('teacherId', { required: 'Teacher is required' })}
                  onChange={(event) => {
                    setValue('teacherId', event.target.value, { shouldValidate: true });
                    setValue('course', '');
                  }}
                  className="w-full border border-[#E8DCC8] bg-[#FFFDF9] rounded-xl px-4 py-3 text-sm text-[#1A1A1A] focus:border-[#005461] focus:outline-none"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select a teacher with an assigned subject
                  </option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.fullName}
                    </option>
                  ))}
                </select>
                {errors.teacherId && <p className="text-xs text-red-500 mt-1">{errors.teacherId.message}</p>}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                <p className="text-sm text-emerald-600">{success}</p>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => router.push('/login')}>
                Back to Login
              </Button>
              <Button type="submit" loading={loading} disabled={teachers.length === 0} className="flex-1">
                Submit Registration
              </Button>
            </div>
          </form>
        )}

        <div className="mt-6 flex items-center gap-2 text-xs text-[#888888]">
          <BookOpen size={14} className="text-[#005461]" />
          <span>Registration requests are reviewed by the assigned teacher.</span>
        </div>
      </div>
    </div>
  );
}
