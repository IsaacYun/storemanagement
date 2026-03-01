'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Store, StoreWageHistory } from '@/lib/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Plus, Pencil, CalendarIcon, History, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { formatMoney } from '@/lib/calculations/salary';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface StoreWithHistory extends Store {
  wage_history: StoreWageHistory[];
}

export default function StoresPage() {
  const [stores, setStores] = useState<StoreWithHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editStore, setEditStore] = useState<StoreWithHistory | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);

  // 폼 상태
  const [name, setName] = useState('');
  const [hourlyWage, setHourlyWage] = useState('');
  const [fullAttendanceBonus, setFullAttendanceBonus] = useState('');
  const [openingTime, setOpeningTime] = useState('10:00');
  const [closingTime, setClosingTime] = useState('22:00');
  const [wageEffectiveFrom, setWageEffectiveFrom] = useState<Date | undefined>(undefined);
  const [isWageChanged, setIsWageChanged] = useState(false);

  const fetchStores = async () => {
    setIsLoading(true);
    const supabase = createClient();

    // 매장 조회
    const { data: storesData } = await supabase
      .from('stores')
      .select('*')
      .order('name');

    // 시급 이력 테이블이 있는지 확인하고 조회
    let wageHistoryData: StoreWageHistory[] = [];
    try {
      const { data } = await supabase
        .from('store_wage_history')
        .select('*')
        .order('effective_from', { ascending: false });
      wageHistoryData = data || [];
    } catch {
      // 테이블이 없으면 무시
      console.log('store_wage_history table not found');
    }

    // 매장에 시급 이력 매핑
    const storesWithHistory: StoreWithHistory[] = (storesData || []).map((store) => ({
      ...store,
      wage_history: wageHistoryData.filter((h) => h.store_id === store.id),
    }));

    setStores(storesWithHistory);
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
    setWageEffectiveFrom(undefined);
    setIsWageChanged(false);
    setEditStore(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (store: StoreWithHistory) => {
    setEditStore(store);
    setName(store.name);
    setHourlyWage(store.hourly_wage.toString());
    setFullAttendanceBonus(store.full_attendance_bonus.toString());
    setOpeningTime(store.opening_time.slice(0, 5));
    setClosingTime(store.closing_time.slice(0, 5));
    setWageEffectiveFrom(new Date()); // 기본값: 오늘부터
    setIsWageChanged(false);
    setIsDialogOpen(true);
  };

  const handleWageChange = (value: string) => {
    setHourlyWage(value);
    // 기존 시급과 다르면 변경됨 표시
    if (editStore && parseInt(value) !== editStore.hourly_wage) {
      setIsWageChanged(true);
    } else {
      setIsWageChanged(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !hourlyWage) {
      toast.error('필수 항목을 입력해주세요');
      return;
    }

    const supabase = createClient();
    const newHourlyWage = parseInt(hourlyWage);

    try {
      if (editStore) {
        // 수정 모드
        const storeData = {
          name,
          hourly_wage: newHourlyWage,
          full_attendance_bonus: parseInt(fullAttendanceBonus) || 0,
          opening_time: openingTime,
          closing_time: closingTime,
        };

        const { error } = await supabase
          .from('stores')
          .update(storeData)
          .eq('id', editStore.id);

        if (error) throw error;

        // 시급이 변경되었으면 이력 추가 시도
        if (isWageChanged && wageEffectiveFrom) {
          const effectiveFromStr = format(wageEffectiveFrom, 'yyyy-MM-dd');

          try {
            // 기존 시급 이력 중 적용 중인 것의 종료일 설정
            const prevDay = new Date(wageEffectiveFrom);
            prevDay.setDate(prevDay.getDate() - 1);
            const prevDayStr = format(prevDay, 'yyyy-MM-dd');

            // 기존에 effective_to가 null인 이력 업데이트
            await supabase
              .from('store_wage_history')
              .update({ effective_to: prevDayStr })
              .eq('store_id', editStore.id)
              .is('effective_to', null)
              .lt('effective_from', effectiveFromStr);

            // 새 시급 이력 추가
            const { error: historyError } = await supabase
              .from('store_wage_history')
              .insert({
                store_id: editStore.id,
                hourly_wage: newHourlyWage,
                effective_from: effectiveFromStr,
              });

            if (historyError) {
              // 이미 같은 날짜에 이력이 있으면 업데이트
              if (historyError.code === '23505') {
                await supabase
                  .from('store_wage_history')
                  .update({ hourly_wage: newHourlyWage })
                  .eq('store_id', editStore.id)
                  .eq('effective_from', effectiveFromStr);
              }
            }

            toast.success(`매장이 수정되었습니다. 시급은 ${format(wageEffectiveFrom, 'M월 d일')}부터 적용됩니다.`);
          } catch {
            // store_wage_history 테이블이 없으면 그냥 무시
            toast.success('매장이 수정되었습니다');
          }
        } else {
          toast.success('매장이 수정되었습니다');
        }
      } else {
        // 신규 등록
        const storeData = {
          name,
          hourly_wage: newHourlyWage,
          full_attendance_bonus: parseInt(fullAttendanceBonus) || 0,
          opening_time: openingTime,
          closing_time: closingTime,
        };

        const { data: newStore, error } = await supabase
          .from('stores')
          .insert(storeData)
          .select()
          .single();

        if (error) throw error;

        // 신규 매장 시급 이력 추가 시도
        if (newStore) {
          try {
            await supabase.from('store_wage_history').insert({
              store_id: newStore.id,
              hourly_wage: newHourlyWage,
              effective_from: format(new Date(), 'yyyy-MM-dd'),
            });
          } catch {
            // 테이블이 없으면 무시
          }
        }

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

  const toggleHistory = (storeId: string) => {
    setExpandedStoreId(expandedStoreId === storeId ? null : storeId);
  };

  // 현재 적용 중인 시급 가져오기
  const getCurrentWage = (store: StoreWithHistory): number => {
    if (!store.wage_history || store.wage_history.length === 0) {
      return store.hourly_wage;
    }
    const today = format(new Date(), 'yyyy-MM-dd');
    const currentHistory = store.wage_history.find(
      (h) => h.effective_from <= today && (!h.effective_to || h.effective_to >= today)
    );
    return currentHistory?.hourly_wage || store.hourly_wage;
  };

  // 예정된 시급 변경이 있는지 확인
  const getFutureWage = (store: StoreWithHistory): StoreWageHistory | null => {
    if (!store.wage_history || store.wage_history.length === 0) {
      return null;
    }
    const today = format(new Date(), 'yyyy-MM-dd');
    const futureHistory = store.wage_history.find((h) => h.effective_from > today);
    return futureHistory || null;
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
                  onChange={(e) => handleWageChange(e.target.value)}
                  placeholder="예: 10000"
                />
                {editStore && isWageChanged && (
                  <div className="p-3 bg-blue-50 rounded-lg space-y-2">
                    <p className="text-sm text-blue-700">
                      시급이 {formatMoney(editStore.hourly_wage)}원 → {formatMoney(parseInt(hourlyWage) || 0)}원으로 변경됩니다
                    </p>
                    <div className="space-y-1">
                      <Label className="text-xs text-blue-600">적용 시작일</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !wageEffectiveFrom && 'text-muted-foreground'
                            )}
                            size="sm"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {wageEffectiveFrom
                              ? format(wageEffectiveFrom, 'yyyy년 M월 d일', { locale: ko })
                              : '날짜 선택'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={wageEffectiveFrom}
                            onSelect={setWageEffectiveFrom}
                            locale={ko}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <p className="text-xs text-blue-600">
                      * 이 날짜 이전의 급여 계산은 기존 시급({formatMoney(editStore.hourly_wage)}원)으로 유지됩니다
                    </p>
                  </div>
                )}
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
            <div className="space-y-2">
              {stores.map((store) => {
                const currentWage = getCurrentWage(store);
                const futureWage = getFutureWage(store);
                const isExpanded = expandedStoreId === store.id;
                const hasHistory = store.wage_history && store.wage_history.length > 0;

                return (
                  <div key={store.id} className="border rounded-lg">
                    <div className="p-4">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-4 flex-wrap">
                          <span className="font-medium">{store.name}</span>
                          <span className="text-gray-600">
                            {formatMoney(currentWage)}원/시간
                          </span>
                          {futureWage && (
                            <Badge variant="secondary" className="text-xs">
                              {format(new Date(futureWage.effective_from), 'M/d')}부터{' '}
                              {formatMoney(futureWage.hourly_wage)}원
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">
                            {store.opening_time.slice(0, 5)} - {store.closing_time.slice(0, 5)}
                          </span>
                          {store.full_attendance_bonus > 0 && (
                            <Badge variant="outline" className="text-xs">
                              만근 {formatMoney(store.full_attendance_bonus)}원
                            </Badge>
                          )}
                          {store.is_active ? (
                            <Badge variant="default" className="text-xs">운영중</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">비활성</Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(store)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {hasHistory && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleHistory(store.id)}
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <History className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 시급 변경 이력 */}
                    {isExpanded && hasHistory && (
                      <div className="border-t bg-gray-50 p-4">
                        <h4 className="text-sm font-medium mb-2 text-gray-700">시급 변경 이력</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>시급</TableHead>
                              <TableHead>적용 기간</TableHead>
                              <TableHead>상태</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {store.wage_history.map((history) => {
                              const today = format(new Date(), 'yyyy-MM-dd');
                              const isActive =
                                history.effective_from <= today &&
                                (!history.effective_to || history.effective_to >= today);
                              const isFuture = history.effective_from > today;
                              const isPast = history.effective_to && history.effective_to < today;

                              return (
                                <TableRow key={history.id}>
                                  <TableCell className="font-medium">
                                    {formatMoney(history.hourly_wage)}원
                                  </TableCell>
                                  <TableCell>
                                    {format(new Date(history.effective_from), 'yyyy.M.d')}
                                    {history.effective_to
                                      ? ` ~ ${format(new Date(history.effective_to), 'yyyy.M.d')}`
                                      : ' ~'}
                                  </TableCell>
                                  <TableCell>
                                    {isActive && (
                                      <Badge variant="default" className="text-xs">적용중</Badge>
                                    )}
                                    {isFuture && (
                                      <Badge variant="secondary" className="text-xs">예정</Badge>
                                    )}
                                    {isPast && (
                                      <Badge variant="outline" className="text-xs">종료</Badge>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-sm text-gray-500">
        <p>* 시급 변경 시 적용 시작일을 지정하면 이전 기간의 급여 계산에 영향을 주지 않습니다</p>
        <p>* 시급 변경 이력 기능을 사용하려면 migration-005를 적용해주세요</p>
      </div>
    </div>
  );
}
