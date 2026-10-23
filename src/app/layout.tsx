import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Navbar } from '@/components/layout/Navbar';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Root & Reason — AI Incident Investigator',
  description: 'Evidence-backed SOC Incident Investigation platform simulating an Alexa+ conversational analyst with deterministic security rules and Google Gemini.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-[#080c14] text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
        <Suspense fallback={<div className="h-16 border-b border-[#1a2a47] bg-[#080c14]" />}>
          <Navbar />
        </Suspense>
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
        <footer className="w-full border-t border-[#1a2a47] py-4 bg-[#080c14]/50 text-center text-xs text-slate-500 font-mono">
          Root & Reason — AI Incident Investigator • Amazon Developer Hackathon Track: Alexa+ Simulated Experience
        </footer>
      </body>
    </html>
  );
}
