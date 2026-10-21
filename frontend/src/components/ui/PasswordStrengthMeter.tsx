'use client';

import { CheckCircle2, Circle } from 'lucide-react';

export interface PasswordEvaluation {
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasSpecialChar: boolean;
  hasNumber: boolean;
  isPolicyMet: boolean;
  strength: 'empty' | 'weak' | 'medium' | 'strong';
  label: string;
  score: number; // 0 to 3
}

export function evaluatePassword(password: string): PasswordEvaluation {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasSpecialChar = /[^A-Za-z0-9]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const isPolicyMet = hasMinLength && hasUppercase && hasSpecialChar;

  if (!password) {
    return {
      hasMinLength,
      hasUppercase,
      hasSpecialChar,
      hasNumber,
      isPolicyMet,
      strength: 'empty',
      label: 'Enter a password',
      score: 0,
    };
  }

  const criteriaCount = [hasMinLength, hasUppercase, hasSpecialChar].filter(Boolean).length;

  if (criteriaCount <= 1) {
    return {
      hasMinLength,
      hasUppercase,
      hasSpecialChar,
      hasNumber,
      isPolicyMet,
      strength: 'weak',
      label: 'Weak',
      score: 1,
    };
  }

  if (!isPolicyMet || (password.length < 10 && !hasNumber)) {
    return {
      hasMinLength,
      hasUppercase,
      hasSpecialChar,
      hasNumber,
      isPolicyMet,
      strength: isPolicyMet ? 'medium' : 'weak',
      label: isPolicyMet ? 'Medium' : 'Weak',
      score: isPolicyMet ? 2 : 1,
    };
  }

  return {
    hasMinLength,
    hasUppercase,
    hasSpecialChar,
    hasNumber,
    isPolicyMet,
    strength: 'strong',
    label: 'Strong',
    score: 3,
  };
}

export function validatePasswordPolicy(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter.';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must include at least one special character (e.g. @, #, !, $).';
  }
  return null;
}

export default function PasswordStrengthMeter({ password }: { password: string }) {
  const evalResult = evaluatePassword(password);

  if (!password) return null;

  const colorMap = {
    empty: 'bg-gray-200 text-gray-500',
    weak: 'bg-red-500 text-red-600',
    medium: 'bg-amber-500 text-amber-700',
    strong: 'bg-emerald-600 text-emerald-700',
  };

  const rules = [
    { label: 'At least 8 characters', met: evalResult.hasMinLength },
    { label: 'One uppercase letter (A–Z)', met: evalResult.hasUppercase },
    { label: 'One special character (!@#$%^&*)', met: evalResult.hasSpecialChar },
  ];

  return (
    <div className="rounded-lg border border-[#E8DCC8] bg-[#FAF7F2] p-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[#555555]">Password strength</span>
        <span
          className={`font-semibold ${
            evalResult.strength === 'strong'
              ? 'text-emerald-700'
              : evalResult.strength === 'medium'
              ? 'text-amber-700'
              : 'text-red-600'
          }`}
        >
          {evalResult.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {[1, 2, 3].map((step) => (
          <div
            key={step}
            className={`h-1.5 rounded-full transition-all duration-200 ${
              evalResult.score >= step
                ? colorMap[evalResult.strength].split(' ')[0]
                : 'bg-[#E8DCC8]'
            }`}
          />
        ))}
      </div>

      <ul className="space-y-1 pt-1">
        {rules.map((rule) => (
          <li
            key={rule.label}
            className={`flex items-center gap-1.5 text-xs ${
              rule.met ? 'text-emerald-700 font-medium' : 'text-[#777777]'
            }`}
          >
            {rule.met ? (
              <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
            ) : (
              <Circle size={13} className="text-[#AAAAAA] shrink-0" />
            )}
            <span>{rule.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
