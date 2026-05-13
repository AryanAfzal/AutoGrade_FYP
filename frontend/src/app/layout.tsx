import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AutoGrade',
  description: 'AI-Powered Examination Evaluation Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#FFF8EB] overflow-x-hidden">{children}</body>
    </html>
  );
}