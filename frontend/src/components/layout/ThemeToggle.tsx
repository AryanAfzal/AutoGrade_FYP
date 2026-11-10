'use client';

import { useEffect, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const themeStorageKey = 'autograde-theme';

export default function ThemeToggle() {
  const [darkMode, setDarkMode] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const particleTimeout = useRef<number | null>(null);

  useEffect(() => {
    const storedTheme =
      window.localStorage.getItem(themeStorageKey) ??
      window.localStorage.getItem('autograde-login-theme');
    const isDark = storedTheme === 'dark';

    setDarkMode(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  useEffect(() => {
    return () => {
      if (particleTimeout.current !== null) {
        window.clearTimeout(particleTimeout.current);
      }
    };
  }, []);

  const toggleTheme = () => {
    const nextDarkMode = !darkMode;
    setDarkMode(nextDarkMode);
    document.documentElement.classList.toggle('dark', nextDarkMode);
    window.localStorage.setItem(themeStorageKey, nextDarkMode ? 'dark' : 'light');

    if (particleTimeout.current !== null) {
      window.clearTimeout(particleTimeout.current);
    }

    if (nextDarkMode) {
      setShowParticles(true);
      particleTimeout.current = window.setTimeout(() => {
        setShowParticles(false);
        particleTimeout.current = null;
      }, 1600);
    } else {
      setShowParticles(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-pressed={darkMode}
        className="theme-toggle"
      >
        {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        <span>{darkMode ? 'Light mode' : 'Dark mode'}</span>
      </button>

      {showParticles && (
        <div className="theme-particles" aria-hidden="true">
          {Array.from({ length: 20 }, (_, index) => (
            <span
              key={index}
              className="theme-particle"
              style={{
                top: `${5 + ((index * 37) % 90)}%`,
                animationDelay: `${(index % 10) * 70}ms`,
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
