'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PasswordStrengthMeter, { validatePasswordPolicy } from '@/components/ui/PasswordStrengthMeter';
import { authApi } from '@/lib/api';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const queryToken = searchParams.get('token');
    if (queryToken) {
      setToken(queryToken);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!token.trim()) {
      setError('Reset token is missing. Please use the link from your password reset request.');
      return;
    }

    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation password do not match.');
      return;
    }

    setLoading(true);
    try {
      const result = await authApi.resetPassword({
        token: token.trim(),
        newPassword,
        confirmPassword,
      });
      setSuccessMessage(result.message);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to reset password. The link may have expired or already been used.',
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
            <ShieldCheck size={22} className="text-[#FAB963]" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#6BAAB5]">Password Security</p>
            <h1 className="text-2xl font-bold text-[#1A1A1A]">Reset Your Password</h1>
          </div>
        </div>

        {successMessage ? (
          <div className="space-y-5">
            <div
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2 text-sm text-emerald-900"
            >
              <div className="flex items-center gap-2 font-semibold text-emerald-800">
                <CheckCircle2 size={19} className="text-emerald-600" />
                <span>Password Changed Successfully</span>
              </div>
              <p>{successMessage}</p>
            </div>

            <Button
              className="w-full"
              onClick={() => router.push('/login?reset=success')}
            >
              Continue to Sign In
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {!searchParams.get('token') && (
              <Input
                label="Reset Token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your single-use reset token"
                required
              />
            )}

            <Input
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 chars, 1 uppercase & 1 special char"
              required
            />

            <PasswordStrengthMeter password={newPassword} />

            <Input
              label="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
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

            <div className="flex items-center gap-3 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push('/login')}
              >
                Cancel
              </Button>
              <Button type="submit" loading={loading} className="flex-1">
                Confirm Password Reset
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FFF8EB] flex items-center justify-center">Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
