'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/stores/useAuth';
import { cn } from '@/lib/utils';
import {
  Calendar,
  ClipboardList,
  Calculator,
  Store,
  Users,
  FileText,
} from 'lucide-react';

interface SidebarProps {
  onNavigate?: () => void;
}

const menuItems = [
  {
    title: '스케줄',
    items: [
      { href: '/schedule/calendar', label: '달력', icon: Calendar },
    ],
  },
  {
    title: '정산',
    items: [{ href: '/settlement', label: '월별 정산', icon: Calculator }],
  },
];

const adminMenuItems = [
  {
    title: '관리',
    items: [
      { href: '/admin/stores', label: '매장 관리', icon: Store },
      { href: '/admin/workers', label: '근무자 관리', icon: Users },
      { href: '/admin/logs', label: '활동 로그', icon: FileText },
    ],
  },
];

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  const allMenus = isAdmin ? [...menuItems, ...adminMenuItems] : menuItems;

  return (
    <aside className="h-full bg-gray-50 border-r">
      <div className="p-4">
        <h2 className="font-semibold text-lg mb-4 md:hidden">메뉴</h2>
        <nav className="space-y-6">
          {allMenus.map((section) => (
            <div key={section.title}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {section.title}
              </h3>
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                          isActive
                            ? 'bg-gray-200 text-gray-900 font-medium'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
