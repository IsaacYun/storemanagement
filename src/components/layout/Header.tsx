'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/stores/useAuth';
import { useStoreSelection } from '@/lib/stores/useStoreSelection';
import { Store } from '@/lib/supabase/types';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Menu, LogOut, User, Settings, Store as StoreIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Sidebar } from './Sidebar';

export function Header() {
  const router = useRouter();
  const { worker, isAdmin } = useAuth();
  const { selectedStoreId, setSelectedStore } = useStoreSelection();
  const [stores, setStores] = useState<Store[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  const selectedStore = stores.find((s) => s.id === selectedStoreId);

  useEffect(() => {
    const fetchStores = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('stores')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (data) {
        setStores(data);
        // 첫 번째 매장 자동 선택 (localStorage에 저장된 값이 없을 때만)
        if (!selectedStoreId && data.length > 0) {
          setSelectedStore(data[0].id);
        }
      }
    };

    fetchStores();
  }, [selectedStoreId, setSelectedStore]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white">
      <div className="flex h-14 items-center px-4 gap-4">
        {/* 모바일 메뉴 */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* 로고 */}
        <Link href="/schedule/calendar" className="font-semibold text-lg hidden sm:block">
          매장 근무 관리
        </Link>

        {/* 매장 선택 - 더 크고 눈에 띄게 */}
        <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-1.5 border border-blue-200">
          <StoreIcon className="h-5 w-5 text-blue-600" />
          <Select value={selectedStoreId || ''} onValueChange={setSelectedStore}>
            <SelectTrigger className="w-auto min-w-[120px] border-0 bg-transparent text-blue-900 font-bold text-lg focus:ring-0 focus:ring-offset-0 p-0 h-auto">
              <SelectValue placeholder="매장 선택">
                {selectedStore?.name || '매장 선택'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {stores.map((store) => (
                <SelectItem key={store.id} value={store.id} className="text-base">
                  <div className="flex items-center gap-2">
                    <StoreIcon className="h-4 w-4" />
                    <span className="font-medium">{store.name}</span>
                    <span className="text-gray-400 text-sm">
                      (시급 {store.hourly_wage.toLocaleString()}원)
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1" />

        {/* 사용자 메뉴 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  {worker?.name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:inline">{worker?.name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled>
              <User className="mr-2 h-4 w-4" />
              {worker?.name} ({isAdmin ? '관리자' : '근무자'})
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/settings')}>
              <User className="mr-2 h-4 w-4" />
              프로필 설정
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem onClick={() => router.push('/admin/stores')}>
                <Settings className="mr-2 h-4 w-4" />
                관리 설정
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
