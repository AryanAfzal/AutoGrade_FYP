'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { KeyRound, MailCheck, ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { authApi } from '@/lib/api';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetData, setResetData] = useState<{
    message: string;
    resetToken?: string;
    resetLink?: string;
    expiresInMinutes?: number;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetData(null);

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter your valid registered email address.');
      return;
    }

    setLoading(true);
    try {
      const response = await authApi.forgotPassword(email.trim());
      setResetData(response);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to process password reset request.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF8EB] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-[#E8DCC8] rounded-2xl shadow-sm p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-[#005461] rounded-xl flex items-center justify-center">
            <KeyRound size={22} className="text-[#FAB963]" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#6BAAB5]">Account Recovery</p>
            <h1 className="text-2xl font-bold text-[#1A1A1A]">Forgot Password</h1>
          </div>
        </div>

        <p className="text-sm text-[#666666]">
          Enter your registered email address to receive a time-limited, single-use password reset link.
        </p>

        {resetData ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2 text-sm text-emerald-900">
              <div className="flex items-center gap-2 font-semibold text-emerald-800">
                <MailCheck size={18} />
                <span>Reset Link Generated</span>
              </div>
              <p>{resetData.message}</p>
              <p className="text-xs text-emerald-700">
                Security Notice: This link is valid for {resetData.expiresInMinutes || 15} minutes and can only be used once.
              </p>
            </div>

            {resetData.resetToken && (
              <div className="rounded-xl border border-[#E8DCC8] bg-[#FAF7F2] p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#005461]">
                  Direct Reset Link (Email Dispatch Preview)
                </p>
                <p className="text-xs text-[#666666] break-all font-mono bg-white p-2 rounded border border-[#E8DCC8]">
                  {resetData.resetLink}
                </p>
                <Button
                  type="button"
                  className="w-full flex items-center justify-center gap-2"
                  onClick={() =>
                    router.push(`/reset-password?token=${encodeURIComponent(resetData.resetToken!)}`)
                  }
                >
                  <span>Open Password Reset Form</span>
                  <ArrowRight size={15} />
                </Button>
              </div>
            )}

            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => router.push('/login')}
            >
              Back to Sign In
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label="Registered Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@cuiwah.edu.pk"
              required
            />

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
              >
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} className="w-full">
              Send Password Reset Link
            </Button>

            <div className="text-center pt-1">
              <Link
                href="/login"
                className="text-xs font-semibold text-[#005461] hover:underline"
              >
                Remembered your password? Back to Sign In
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
