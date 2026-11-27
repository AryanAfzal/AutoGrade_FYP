'use client';

import Image from 'next/image';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PasswordStrengthMeter, { validatePasswordPolicy } from '@/components/ui/PasswordStrengthMeter';
import { GraduationCap } from 'lucide-react';

interface StudentRegistrationForm {
  university: string;
  fullName: string;
  email: string;
  registrationNumber: string;
  password: string;
  confirmPassword: string;
}

export default function StudentRegistrationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<StudentRegistrationForm>({
    defaultValues: {
      university: 'COMSATS University Islamabad, Wah Campus',
    },
  });

  const passwordValue = watch('password') || '';

  const onSubmit = async (data: StudentRegistrationForm) => {
    const policyError = validatePasswordPolicy(data.password);
    if (policyError) {
      setError(policyError);
      return;
    }

    if (data.password !== data.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await authApi.registerStudent({
        university: data.university,
        fullName: data.fullName,
        email: data.email,
        registrationNumber: data.registrationNumber,
        password: data.password,
      });
      setSuccess(response.message);
      setTimeout(() => router.push('/login'), 2200);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Unable to submit student registration.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF8EB] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white border border-[#E8DCC8] rounded-2xl shadow-sm p-4 sm:p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Image
            src="/favicon-round.png"
            alt="AutoGrade Logo"
            width={44}
            height={44}
            className="w-11 h-11 object-contain rounded-full shadow-sm"
          />
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-[#6BAAB5]">AutoGrade • Student Portal</p>
            <h1 className="text-2xl font-bold text-[#1A1A1A]">Create student account</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="University Name"
              placeholder="COMSATS University Islamabad, Wah Campus"
              error={errors.university?.message}
              {...register('university', {
                required: 'University name is required.',
                minLength: { value: 2, message: 'University name must be at least 2 characters.' },
              })}
            />

            <Input
              label="Registration / Roll Number"
              placeholder="e.g. FA22-BCS-047 or SP23-01"
              error={errors.registrationNumber?.message}
              {...register('registrationNumber', {
                required: 'Registration number is required.',
                minLength: {
                  value: 2,
                  message: 'Registration number must be at least 2 characters.',
                },
              })}
            />

            <Input
              label="Full Name"
              placeholder="Enter your full name"
              error={errors.fullName?.message}
              {...register('fullName', {
                required: 'Full name is required.',
                minLength: { value: 2, message: 'Full name must be at least 2 characters.' },
              })}
            />

            <Input
              label="Email Address"
              type="email"
              placeholder="you@cuiwah.edu.pk"
              error={errors.email?.message}
              {...register('email', {
                required: 'Email address is required.',
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: 'Please enter a valid email address.',
                },
              })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Password"
              type="password"
              placeholder="Min 8 chars, 1 uppercase & 1 special char"
              error={errors.password?.message}
              {...register('password', {
                required: 'Password is required.',
                validate: (val) => validatePasswordPolicy(val) || true,
              })}
            />

            <Input
              label="Confirm Password"
              type="password"
              placeholder="Confirm your password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword', {
                required: 'Please confirm your password.',
                validate: (value) => value === passwordValue || 'Passwords do not match.',
              })}
            />
          </div>

          <PasswordStrengthMeter password={passwordValue} />

          {error && (
            <div role="alert" className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {success && (
            <div role="status" className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
              <p className="text-sm text-emerald-700">{success}</p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => router.push('/login')}>
              Back to Login
            </Button>
            <Button type="submit" loading={loading} className="flex-1">
              Register Student Account
            </Button>
          </div>
        </form>

        <div className="text-xs text-[#888888]">
          <span>
            Duplicate email addresses and duplicate registration numbers are automatically prevented. Once an administrator approves your registration, you can log in and enroll in available subjects.
          </span>
        </div>
      </div>
    </div>
  );
}
