import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
}

export default function Card({
  children,
  className,
  padding = 'md',
}: CardProps) {
  const paddings = {
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-7',
  };

  return (
    <div
      className={cn(
        'bg-white rounded-xl border border-[#E2E8F0] shadow-sm',
        paddings[padding],
        className
      )}
    >
      {children}
    </div>
  );
}