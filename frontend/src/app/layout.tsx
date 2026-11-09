import type { Metadata } from 'next';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import './globals.css';
import NavigationProgressBar from '@/components/common/NavigationProgressBar';

export const metadata: Metadata = {
  title: 'AutoGrade',
  description: 'AI-powered exam evaluation and academic analytics platform',
  icons: {
    icon: '/favicon-round.png',
    shortcut: '/favicon-round.png',
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen overflow-x-hidden">
        <NavigationProgressBar />
        {children}
      </body>
    </html>
  );
}
