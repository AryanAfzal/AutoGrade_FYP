'use client';

import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label className="text-sm font-medium text-[#1A1A1A]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full px-3 py-2 text-sm rounded-lg border bg-white text-[#1A1A1A]',
            'border-[#E8DCC8] placeholder:text-[#888888]',
            'focus:outline-none focus:ring-2 focus:ring-[#005461] focus:border-transparent',
            'transition-all duration-200',
            error && 'border-red-400 focus:ring-red-400',
            className
          )}
          {...props}
        />
        {hint && !error && (
          <p className="text-xs text-[#888888]">{hint}</p>
        )}
        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;