'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: '대시보드' },
  { href: '/treemap', label: '트리맵' },
  { href: '/journal', label: '매매일지' },
  { href: '/dividends', label: '배당' },
  { href: '/assets', label: '기타 자산' },
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      {navItems.map((item) => {
        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              isActive
                ? 'text-white bg-gray-700 font-medium'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
