'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function NavigationProgressBar() {
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;
      const href = target.getAttribute('href');
      // If internal link and not a hash link or external link
      if (
        href &&
        href.startsWith('/') &&
        !href.startsWith('//') &&
        href !== pathname &&
        !target.getAttribute('download') &&
        target.target !== '_blank'
      ) {
        setIsNavigating(true);
        setProgress(30);
        setTimeout(() => setProgress((p) => (p > 0 ? 70 : 0)), 120);
      }
    };

    document.addEventListener('click', handleClick, { capture: true });
    return () => document.removeEventListener('click', handleClick, { capture: true });
  }, [pathname]);

  // When pathname changes (navigation completes), complete to 100% and fade out
  useEffect(() => {
    setProgress(100);
    const timeout = setTimeout(() => {
      setIsNavigating(false);
      setProgress(0);
    }, 380);
    return () => clearTimeout(timeout);
  }, [pathname]);

  if (!isNavigating && progress === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none h-[3.5px] bg-transparent"
    >
      <div
        className="h-full bg-gradient-to-r from-[#005461] via-[#FAB963] to-[#005461] shadow-[0_0_12px_rgba(250,185,99,0.85)]"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
          transition: 'width 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease',
        }}
      />
    </div>
  );
}
