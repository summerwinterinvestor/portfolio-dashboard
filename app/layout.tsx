import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import PrivacyToggle from "@/components/PrivacyToggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "포트폴리오 대시보드",
  description: "개인 주식 포트폴리오 관리 앱",
};

const navItems = [
  { href: "/", label: "대시보드" },
  { href: "/treemap", label: "트리맵" },
  { href: "/journal", label: "매매일지" },
  { href: "/dividends", label: "배당" },
  { href: "/assets", label: "기타 자산" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('privacy')==='on')document.documentElement.classList.add('privacy-on')}catch(e){}` }} />
      </head>
      <body className="min-h-full flex flex-col bg-gray-950 text-gray-100">
        <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              <span className="text-base font-semibold text-white tracking-tight">
                Portfolio
              </span>
              <div className="flex items-center gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="px-3 py-2 rounded-md text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}
                <PrivacyToggle />
              </div>
            </div>
          </div>
        </nav>
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
        <footer className="border-t border-gray-800 py-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-center gap-1 text-xs text-gray-600">
            <span>Made by</span>
            <a
              href="https://blog.naver.com/summer_winter_nh"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              여름겨울
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
