'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { BookOpen, UserRoundCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { authApi } from '@/lib/api';

interface TeacherApplicationForm {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone: string;
  department: string;
  qualification: string;
}

export default function TeacherRegistrationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<TeacherApplicationForm>();

  const password = watch('password');

  const onSubmit = async (data: TeacherApplicationForm) => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const result = await authApi.registerTeacher({
        fullName: data.fullName,
        email: data.email,
        password: data.password,
        phone: data.phone,
        department: data.department,
        qualification: data.qualification,
      });
      setSuccess(result.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to submit the application.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF8EB] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white border border-[#E8DCC8] rounded-2xl shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 bg-[#005461] rounded-xl flex items-center justify-center">
            <UserRoundCheck size={22} className="text-[#FAB963]" />
          </div>
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-[#6BAAB5]">Teacher Portal</p>
            <h1 className="text-2xl font-bold text-[#1A1A1A]">Apply as a teacher</h1>
          </div>
        </div>

        {success ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {success}
            </div>
            <Button className="w-full" onClick={() => router.push('/login')}>Return to login</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Full name"
                placeholder="Enter your full name"
                error={errors.fullName?.message}
                {...register('fullName', { required: 'Full name is required', minLength: { value: 2, message: 'Enter your full name' } })}
              />
              <Input
                label="Email address"
                type="email"
                placeholder="you@cuiwah.edu.pk"
                error={errors.email?.message}
                {...register('email', { required: 'Email is required' })}
              />
              <Input
                label="Phone"
                type="tel"
                placeholder="+92..."
                error={errors.phone?.message}
                {...register('phone', { required: 'Phone number is required', minLength: { value: 7, message: 'Enter a valid phone number' } })}
              />
              <Input
                label="Department"
                placeholder="e.g. Computer Science"
                error={errors.department?.message}
                {...register('department', { required: 'Department is required' })}
              />
              <Input
                label="Highest qualification"
                placeholder="e.g. MS Computer Science"
                error={errors.qualification?.message}
                {...register('qualification', { required: 'Qualification is required' })}
              />
              <div className="hidden md:block" />
              <Input
                label="Password"
                type="password"
                placeholder="At least 8 characters"
                error={errors.password?.message}
                {...register('password', { required: 'Password is required', minLength: { value: 8, message: 'Use at least 8 characters' } })}
              />
              <Input
                label="Confirm password"
                type="password"
                placeholder="Re-enter your password"
                error={errors.confirmPassword?.message}
                {...register('confirmPassword', { required: 'Please confirm your password', validate: (value) => value === password || 'Passwords do not match' })}
              />
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-[#FFF8EB] p-3 text-xs text-[#666666]">
              <BookOpen size={15} className="mt-0.5 shrink-0 text-[#005461]" />
              <p>An administrator reviews your application and, if approved, assigns the subjects you may teach. You cannot create exams or manage students until approval.</p>
            </div>

            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

            <div className="flex items-center gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => router.push('/login')}>Back to login</Button>
              <Button type="submit" loading={loading} className="flex-1">Submit application</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
