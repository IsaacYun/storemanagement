'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Store } from '@/lib/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { formatMoney } from '@/lib/calculations/salary';

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editStore, setEditStore] = useState<Store | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // 폼 상태
  const [name, setName] = useState('');
  const [hourlyWage, setHourlyWage] = useState('');
  const [fullAttendanceBonus, setFullAttendanceBonus] = useState('');
  const [openingTime, setOpeningTime] = useState('10:00');
  const [closingTime, setClosingTime] = useState('22:00');

  const fetchStores = async () => {
    setIsLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('stores')
      .select('*')
      .order('name');

    setStores(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchStores();
  }, []);

  const resetForm = () => {
    setName('');
    setHourlyWage('');
    setFullAttendanceBonus('');
    setOpeningTime('10:00');
    setClosingTime('22:00');
    setEditStore(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (store: Store) => {
    setEditStore(store);
    setName(store.name);
    setHourlyWage(store.hourly_wage.toString());
    setFullAttendanceBonus(store.full_attendance_bonus.toString());
    setOpeningTime(store.opening_time.slice(0, 5));
    setClosingTime(store.closing_time.slice(0, 5));
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !hourlyWage) {
      toast.error('필수 항목을 입력해주세요');
      return;
    }

    const supabase = createClient();
    const storeData = {
      name,
      hourly_wage: parseInt(hourlyWage),
      full_attendance_bonus: parseInt(fullAttendanceBonus) || 0,
      opening_time: openingTime,
      closing_time: closingTime,
    };

    try {
      if (editStore) {
        const { error } = await supabase
          .from('stores')
          .update(storeData)
          .eq('id', editStore.id);

        if (error) throw error;
        toast.success('매장이 수정되었습니다');
      } else {
        const { error } = await supabase.from('stores').insert(storeData);

        if (error) throw error;
        toast.success('매장이 등록되었습니다');
      }

      setIsDialogOpen(false);
      resetForm();
      fetchStores();
    } catch (error) {
      toast.error('저장에 실패했습니다');
      console.error(error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">매장 관리</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              매장 등록
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editStore ? '매장 수정' : '새 매장 등록'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>매장명 *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 금곡점"
                />
              </div>
              <div className="space-y-2">
                <Label>시급 (원) *</Label>
                <Input
                  type="number"
                  value={hourlyWage}
                  onChange={(e) => setHourlyWage(e.target.value)}
                  placeholder="예: 10000"
                />
              </div>
              <div className="space-y-2">
                <Label>만근 보너스 (원)</Label>
                <Input
                  type="number"
                  value={fullAttendanceBonus}
                  onChange={(e) => setFullAttendanceBonus(e.target.value)}
                  placeholder="예: 50000"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>영업 시작</Label>
                  <Input
                    type="time"
                    value={openingTime}
                    onChange={(e) => setOpeningTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>영업 종료</Label>
                  <Input
                    type="time"
                    value={closingTime}
                    onChange={(e) => setClosingTime(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsDialogOpen(false)}
                >
                  취소
                </Button>
                <Button type="submit" className="flex-1">
                  {editStore ? '수정' : '등록'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">매장 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">로딩 중...</div>
          ) : stores.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              등록된 매장이 없습니다
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>매장명</TableHead>
                  <TableHead className="text-right">시급</TableHead>
                  <TableHead className="text-right">만근 보너스</TableHead>
                  <TableHead>영업 시간</TableHead>
                  <TableHead className="text-center">상태</TableHead>
                  <TableHead className="text-center">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.map((store) => (
                  <TableRow key={store.id}>
                    <TableCell className="font-medium">{store.name}</TableCell>
                    <TableCell className="text-right">
                      {formatMoney(store.hourly_wage)}원
                    </TableCell>
                    <TableCell className="text-right">
                      {store.full_attendance_bonus > 0
                        ? `${formatMoney(store.full_attendance_bonus)}원`
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {store.opening_time.slice(0, 5)} -{' '}
                      {store.closing_time.slice(0, 5)}
                    </TableCell>
                    <TableCell className="text-center">
                      {store.is_active ? (
                        <span className="text-green-600">운영중</span>
                      ) : (
                        <span className="text-gray-400">비활성</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(store)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
