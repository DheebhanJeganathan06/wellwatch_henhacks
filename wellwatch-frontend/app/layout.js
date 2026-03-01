import { DM_Sans, DM_Mono } from 'next/font/google';
import './globals.css';


const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});


const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});


export const metadata = {
  title: 'WellWatch — Abandoned Well Monitoring',
  description: 'Real-time methane monitoring and AI triage for Pennsylvania abandoned oil & gas wells.',
};


export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

