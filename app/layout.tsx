import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Signal Flow Map',
  description: 'UHD Broadcast Signal Flow Map - 실시간 협업',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="font-mono">{children}</body>
    </html>
  );
}
