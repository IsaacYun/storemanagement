'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useStoreSelection } from '@/lib/stores/useStoreSelection';
import { Worker, Store, Schedule, DAY_LABELS } from '@/lib/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Calendar as CalendarIcon, Copy, Check, Trash2, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { logActivity } from '@/lib/utils/activityLog';
import { format, subDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface WorkerWithSchedules extends Worker {
  schedules: Schedule[];
}

interface ScheduleInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export default function WorkersPage() {
  const { selectedStoreId } = useStoreSelection();
  const [workers, setWorkers] = useState<WorkerWithSchedules[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editWorker, setEditWorker] = useState<WorkerWithSchedules | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);

  // 폼 상태
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [storeId, setStoreId] = useState('');
  const [isTaxApplied, setIsTaxApplied] = useState(true);
  const [role, setRole] = useState<'admin' | 'worker'>('worker');
  const [resignedAt, setResignedAt] = useState<Date | undefined>(undefined);
  const [showResigned, setShowResigned] = useState(false);

  // 스케줄 폼 상태
  const [scheduleInputs, setScheduleInputs] = useState<ScheduleInput[]>(
    Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i,
      startTime: '',
      endTime: '',
      isActive: false,
    }))
  );
  const [effectiveFrom, setEffectiveFrom] = useState<Date | undefined>(undefined);
  const [effectiveTo, setEffectiveTo] = useState<Date | undefined>(undefined);
  const [copiedDay, setCopiedDay] = useState<number | null>(null);

  const fetchWorkers = async () => {
    if (!selectedStoreId) return;

    setIsLoading(true);
    const supabase = createClient();

    let query = supabase
      .from('workers')
      .select('*')
      .eq('store_id', selectedStoreId);

    // 퇴사자 표시 여부
    if (!showResigned) {
      query = query.eq('is_active', true);
    }

    const { data: workersData } = await query.order('name');

    const workerIds = workersData?.map((w) => w.id) || [];

    const { data: schedulesData } = await supabase
      .from('schedules')
      .select('*')
      .in('worker_id', workerIds);

    const workersWithSchedules: WorkerWithSchedules[] = (workersData || []).map(
      (worker) => ({
        ...worker,
        schedules: (schedulesData || []).filter((s) => s.worker_id === worker.id),
      })
    );

    setWorkers(workersWithSchedules);
    setIsLoading(false);
  };

  const fetchStores = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('stores')
      .select('*')
      .eq('is_active', true)
      .order('name');

    setStores(data || []);
  };

  useEffect(() => {
    fetchStores();
  }, []);

  useEffect(() => {
    fetchWorkers();
  }, [selectedStoreId, showResigned]);

  const resetForm = () => {
    setName('');
    setPhone('');
    setStoreId(selectedStoreId || '');
    setIsTaxApplied(true); // 기본값: 3.3% 세금 적용
    setRole('worker');
    setResignedAt(undefined);
    setEditWorker(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (worker: WorkerWithSchedules) => {
    setEditWorker(worker);
    setName(worker.name);
    setPhone(worker.phone || '');
    setStoreId(worker.store_id);
    setIsTaxApplied(worker.is_tax_applied);
    setRole(worker.role);
    setResignedAt(worker.resigned_at ? new Date(worker.resigned_at) : undefined);
    setIsDialogOpen(true);
  };

  const openScheduleDialog = (worker: WorkerWithSchedules) => {
    setEditWorker(worker);
    const inputs = Array.from({ length: 7 }, (_, i) => {
      const schedule = worker.schedules.find((s) => s.day_of_week === i && s.is_active);
      return {
        dayOfWeek: i,
        startTime: schedule?.start_time?.slice(0, 5) || '',
        endTime: schedule?.end_time?.slice(0, 5) || '',
        isActive: !!schedule?.is_active,
      };
    });
    setScheduleInputs(inputs);
    setEffectiveFrom(new Date()); // 기본값: 오늘부터
    setEffectiveTo(undefined);
    setCopiedDay(null);
    setIsScheduleDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !storeId) {
      toast.error('필수 항목을 입력해주세요');
      return;
    }

    const supabase = createClient();

    try {
      if (editWorker) {
        // 수정 시: 퇴사일 포함
        const updateData = {
          name,
          phone: phone || null,
          store_id: storeId,
          is_tax_applied: isTaxApplied,
          role,
          resigned_at: resignedAt ? format(resignedAt, 'yyyy-MM-dd') : null,
          is_active: !resignedAt, // 퇴사일이 설정되면 비활성화
        };
        const { error } = await supabase
          .from('workers')
          .update(updateData)
          .eq('id', editWorker.id);

        if (error) throw error;
        toast.success('근무자가 수정되었습니다');
      } else {
        // 신규 등록 시: 기본 필드만
        const insertData = {
          name,
          phone: phone || null,
          store_id: storeId,
          is_tax_applied: isTaxApplied,
          role,
        };
        const { error } = await supabase.from('workers').insert(insertData);

        if (error) throw error;
        toast.success('근무자가 등록되었습니다');
      }

      setIsDialogOpen(false);
      resetForm();
      fetchWorkers();
    } catch (error) {
      toast.error('저장에 실패했습니다');
      console.error(error);
    }
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editWorker) return;

    const supabase = createClient();
    const effectiveFromStr = effectiveFrom ? format(effectiveFrom, 'yyyy-MM-dd') : null;
    const effectiveToStr = effectiveTo ? format(effectiveTo, 'yyyy-MM-dd') : null;

    try {
      // 정산 완료된 월 체크
      if (effectiveFrom) {
        const fromYear = effectiveFrom.getFullYear();
        const fromMonth = effectiveFrom.getMonth() + 1;
        const toYear = effectiveTo ? effectiveTo.getFullYear() : fromYear;
        const toMonth = effectiveTo ? effectiveTo.getMonth() + 1 : fromMonth;

        // 해당 기간에 정산 완료된 월이 있는지 확인
        const { data: confirmedSettlements } = await supabase
          .from('monthly_settlements')
          .select('year, month')
          .eq('worker_id', editWorker.id)
          .eq('status', 'confirmed');

        if (confirmedSettlements && confirmedSettlements.length > 0) {
          const conflictingMonths = confirmedSettlements.filter((s) => {
            // 정산된 월이 스케줄 적용 기간과 겹치는지 확인
            const settlementDate = s.year * 12 + s.month;
            const fromDate = fromYear * 12 + fromMonth;
            const toDate = toYear * 12 + toMonth;
            return settlementDate >= fromDate && settlementDate <= toDate;
          });

          if (conflictingMonths.length > 0) {
            const monthList = conflictingMonths
              .map((m) => `${m.year}년 ${m.month}월`)
              .join(', ');
            toast.error(`정산이 완료된 월(${monthList})은 스케줄을 변경할 수 없습니다`);
            return;
          }
        }
      }

      // 새로 저장할 스케줄 구성
      const schedulesToInsert = scheduleInputs
        .filter((s) => s.isActive && s.startTime && s.endTime)
        .map((s) => {
          const schedule: Record<string, unknown> = {
            worker_id: editWorker.id,
            store_id: editWorker.store_id,
            day_of_week: s.dayOfWeek,
            start_time: s.startTime,
            end_time: s.endTime,
            is_active: true,
          };
          if (effectiveFromStr) schedule.effective_from = effectiveFromStr;
          if (effectiveToStr) schedule.effective_to = effectiveToStr;
          return schedule;
        });

      // 1. 기존 스케줄 조회
      const { data: existingSchedules } = await supabase
        .from('schedules')
        .select('*')
        .eq('worker_id', editWorker.id)
        .eq('is_active', true);

      if (existingSchedules && effectiveFromStr) {
        const dayBeforeNewPeriod = format(subDays(effectiveFrom!, 1), 'yyyy-MM-dd');

        // 2. 새 기간과 겹치는 기존 스케줄 처리
        for (const existing of existingSchedules) {
          const existingFrom = existing.effective_from;
          const existingTo = existing.effective_to;

          // 기존 스케줄이 새 기간의 시작일 이전에 시작하고, 새 기간과 겹치는 경우
          // (existingTo가 null이거나 existingTo >= effectiveFromStr)
          const startsBeforeNewPeriod = !existingFrom || existingFrom < effectiveFromStr;
          const overlapsWithNewPeriod = !existingTo || existingTo >= effectiveFromStr;

          if (startsBeforeNewPeriod && overlapsWithNewPeriod) {
            // 기존 스케줄의 종료일을 새 기간 시작 전날로 변경
            await supabase
              .from('schedules')
              .update({ effective_to: dayBeforeNewPeriod })
              .eq('id', existing.id);
          }

          // 기존 스케줄이 새 기간 내에서 시작하는 경우 (완전히 포함되는 경우) 삭제
          const startsWithinNewPeriod =
            existingFrom &&
            existingFrom >= effectiveFromStr &&
            (!effectiveToStr || existingFrom <= effectiveToStr);

          if (startsWithinNewPeriod) {
            await supabase.from('schedules').delete().eq('id', existing.id);
          }
        }
      } else if (!effectiveFromStr) {
        // effective_from이 없으면 기존 방식대로 null인 스케줄만 삭제
        await supabase
          .from('schedules')
          .delete()
          .eq('worker_id', editWorker.id)
          .is('effective_from', null);
      }

      // 3. 새 스케줄 추가 (활성화된 요일만)
      if (schedulesToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('schedules')
          .insert(schedulesToInsert);

        if (insertError) {
          throw new Error(`스케줄 저장 실패: ${insertError.message || '권한이 없습니다'}`);
        }
      }

      let message = '스케줄이 저장되었습니다';
      if (effectiveFromStr && effectiveToStr) {
        message = `스케줄이 ${format(effectiveFrom!, 'M월 d일')} ~ ${format(effectiveTo!, 'M월 d일')} 적용됩니다`;
      } else if (effectiveFromStr) {
        message = `스케줄이 ${format(effectiveFrom!, 'M월 d일')}부터 적용됩니다`;
      }
      toast.success(message);
      setIsScheduleDialogOpen(false);
      fetchWorkers();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '저장에 실패했습니다';
      toast.error(errorMessage);
      console.error('Schedule save error:', error);
    }
  };

  const updateScheduleInput = (
    dayOfWeek: number,
    field: keyof ScheduleInput,
    value: string | boolean
  ) => {
    setScheduleInputs((prev) =>
      prev.map((s) => (s.dayOfWeek === dayOfWeek ? { ...s, [field]: value } : s))
    );
  };

  // 시간 복사 기능
  const copyTimeToDay = (fromDay: number, toDay: number) => {
    const source = scheduleInputs.find((s) => s.dayOfWeek === fromDay);
    if (!source) return;

    setScheduleInputs((prev) =>
      prev.map((s) =>
        s.dayOfWeek === toDay
          ? {
              ...s,
              startTime: source.startTime,
              endTime: source.endTime,
              isActive: source.isActive,
            }
          : s
      )
    );
    toast.success(`${DAY_LABELS[fromDay]} → ${DAY_LABELS[toDay]} 복사됨`);
  };

  // 선택한 요일 시간을 모든 요일에 복사
  const copyTimeToAllDays = (fromDay: number) => {
    const source = scheduleInputs.find((s) => s.dayOfWeek === fromDay);
    if (!source || !source.startTime || !source.endTime) {
      toast.error('먼저 시간을 입력해주세요');
      return;
    }

    setScheduleInputs((prev) =>
      prev.map((s) => ({
        ...s,
        startTime: source.startTime,
        endTime: source.endTime,
        isActive: true,
      }))
    );
    toast.success(`${DAY_LABELS[fromDay]} 시간을 모든 요일에 복사했습니다`);
  };

  // 근무자 삭제
  const handleDeleteWorker = async (worker: WorkerWithSchedules) => {
    const supabase = createClient();

    try {
      // 스케줄 먼저 삭제
      await supabase
        .from('schedules')
        .delete()
        .eq('worker_id', worker.id);

      // 근무자 삭제
      const { error } = await supabase
        .from('workers')
        .delete()
        .eq('id', worker.id);

      if (error) throw error;

      toast.success(`${worker.name}님이 삭제되었습니다`);

      // 활동 로그 저장
      logActivity({
        action: 'delete',
        targetTable: 'workers',
        targetId: worker.id,
        beforeData: worker as unknown as Record<string, unknown>,
      });

      fetchWorkers();
    } catch (error) {
      toast.error('삭제에 실패했습니다');
      console.error(error);
    }
  };

  // 평일(월~금)에만 복사
  const copyTimeToWeekdays = (fromDay: number) => {
    const source = scheduleInputs.find((s) => s.dayOfWeek === fromDay);
    if (!source || !source.startTime || !source.endTime) {
      toast.error('먼저 시간을 입력해주세요');
      return;
    }

    setScheduleInputs((prev) =>
      prev.map((s) =>
        s.dayOfWeek >= 1 && s.dayOfWeek <= 5
          ? {
              ...s,
              startTime: source.startTime,
              endTime: source.endTime,
              isActive: true,
            }
          : s
      )
    );
    toast.success(`${DAY_LABELS[fromDay]} 시간을 평일(월~금)에 복사했습니다`);
  };

  // 주말(토~일)에만 복사
  const copyTimeToWeekends = (fromDay: number) => {
    const source = scheduleInputs.find((s) => s.dayOfWeek === fromDay);
    if (!source || !source.startTime || !source.endTime) {
      toast.error('먼저 시간을 입력해주세요');
      return;
    }

    setScheduleInputs((prev) =>
      prev.map((s) =>
        s.dayOfWeek === 0 || s.dayOfWeek === 6
          ? {
              ...s,
              startTime: source.startTime,
              endTime: source.endTime,
              isActive: true,
            }
          : s
      )
    );
    toast.success(`${DAY_LABELS[fromDay]} 시간을 주말(토~일)에 복사했습니다`);
  };

  if (!selectedStoreId) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-500">
          매장을 선택해주세요
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold">근무자 관리</h1>
          <div className="flex items-center gap-2">
            <Switch
              checked={showResigned}
              onCheckedChange={setShowResigned}
              id="show-resigned"
            />
            <Label htmlFor="show-resigned" className="text-sm text-gray-500 cursor-pointer">
              퇴사자 포함
            </Label>
          </div>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              근무자 등록
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editWorker ? '근무자 수정' : '새 근무자 등록'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>이름 *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                />
              </div>
              <div className="space-y-2">
                <Label>연락처</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010-1234-5678"
                />
              </div>
              <div className="space-y-2">
                <Label>소속 매장 *</Label>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger>
                    <SelectValue placeholder="매장 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>역할</Label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as 'admin' | 'worker')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="worker">근무자</SelectItem>
                    <SelectItem value="admin">관리자</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>3.3% 세금 적용</Label>
                <Switch
                  checked={isTaxApplied}
                  onCheckedChange={setIsTaxApplied}
                />
              </div>
              {editWorker && (
                <div className="space-y-2 p-3 bg-red-50 rounded-lg">
                  <Label className="text-red-700">퇴사일</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !resignedAt && 'text-muted-foreground'
                        )}
                      >
                        <UserX className="mr-2 h-4 w-4" />
                        {resignedAt
                          ? format(resignedAt, 'yyyy년 M월 d일', { locale: ko })
                          : '퇴사일 선택 (재직 중)'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={resignedAt}
                        onSelect={setResignedAt}
                        locale={ko}
                      />
                    </PopoverContent>
                  </Popover>
                  {resignedAt && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-gray-500"
                      onClick={() => setResignedAt(undefined)}
                    >
                      퇴사일 취소 (재직으로 변경)
                    </Button>
                  )}
                </div>
              )}
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
                  {editWorker ? '수정' : '등록'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* 스케줄 다이얼로그 */}
      <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editWorker?.name} 스케줄 설정</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleScheduleSubmit} className="space-y-4">
            {/* 적용 기간 선택 */}
            <div className="space-y-2 p-3 bg-blue-50 rounded-lg">
              <Label className="text-blue-700">적용 기간</Label>
              <p className="text-xs text-blue-600 mb-2">
                이 기간 외의 근무 기록은 영향받지 않습니다
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-gray-500 mb-1">시작일</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !effectiveFrom && 'text-muted-foreground'
                        )}
                        size="sm"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {effectiveFrom
                          ? format(effectiveFrom, 'M월 d일', { locale: ko })
                          : '선택'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={effectiveFrom}
                        onSelect={setEffectiveFrom}
                        locale={ko}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1">종료일 (선택)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !effectiveTo && 'text-muted-foreground'
                        )}
                        size="sm"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {effectiveTo
                          ? format(effectiveTo, 'M월 d일', { locale: ko })
                          : '계속'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={effectiveTo}
                        onSelect={setEffectiveTo}
                        locale={ko}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              {effectiveTo && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-gray-500"
                  onClick={() => setEffectiveTo(undefined)}
                >
                  종료일 제거 (계속 적용)
                </Button>
              )}
            </div>

            {/* 빠른 복사 버튼 */}
            {copiedDay !== null && scheduleInputs[copiedDay]?.startTime && (
              <div className="space-y-2 p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600 font-medium">
                  {DAY_LABELS[copiedDay]} ({scheduleInputs[copiedDay].startTime}-{scheduleInputs[copiedDay].endTime}) 복사:
                </span>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copyTimeToWeekdays(copiedDay)}
                  >
                    평일(월~금)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copyTimeToWeekends(copiedDay)}
                  >
                    주말(토~일)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copyTimeToAllDays(copiedDay)}
                  >
                    모든 요일
                  </Button>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                    <Button
                      key={day}
                      type="button"
                      variant={day === copiedDay ? 'secondary' : 'ghost'}
                      size="sm"
                      className={cn(
                        'w-9 h-9 p-0',
                        day === 0 && 'text-red-500',
                        day === 6 && 'text-blue-500',
                        day === copiedDay && 'ring-2 ring-green-400'
                      )}
                      disabled={day === copiedDay}
                      onClick={() => copyTimeToDay(copiedDay, day)}
                    >
                      {DAY_LABELS[day]}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-gray-400">
                  위 요일 버튼을 클릭하면 해당 요일에 시간이 복사됩니다
                </p>
              </div>
            )}

            {/* 요일별 스케줄 */}
            <div className="space-y-2">
              {scheduleInputs.map((schedule) => (
                <div
                  key={schedule.dayOfWeek}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded',
                    schedule.isActive ? 'bg-gray-50' : ''
                  )}
                >
                  <Switch
                    checked={schedule.isActive}
                    onCheckedChange={(v) =>
                      updateScheduleInput(schedule.dayOfWeek, 'isActive', v)
                    }
                  />
                  <span
                    className={cn(
                      'w-8 text-sm font-medium',
                      schedule.dayOfWeek === 0 && 'text-red-500',
                      schedule.dayOfWeek === 6 && 'text-blue-500'
                    )}
                  >
                    {DAY_LABELS[schedule.dayOfWeek]}
                  </span>
                  <Input
                    type="time"
                    value={schedule.startTime}
                    onChange={(e) =>
                      updateScheduleInput(
                        schedule.dayOfWeek,
                        'startTime',
                        e.target.value
                      )
                    }
                    disabled={!schedule.isActive}
                    className="flex-1"
                  />
                  <span className="text-gray-400">~</span>
                  <Input
                    type="time"
                    value={schedule.endTime}
                    onChange={(e) =>
                      updateScheduleInput(
                        schedule.dayOfWeek,
                        'endTime',
                        e.target.value
                      )
                    }
                    disabled={!schedule.isActive}
                    className="flex-1"
                  />
                  {/* 복사 버튼 */}
                  <Button
                    type="button"
                    variant={copiedDay === schedule.dayOfWeek ? 'default' : 'ghost'}
                    size="icon"
                    className={cn(
                      'h-8 w-8',
                      copiedDay === schedule.dayOfWeek && 'bg-green-500 hover:bg-green-600'
                    )}
                    disabled={!schedule.startTime || !schedule.endTime}
                    onClick={() => {
                      if (copiedDay === schedule.dayOfWeek) {
                        setCopiedDay(null);
                      } else {
                        setCopiedDay(schedule.dayOfWeek);
                      }
                    }}
                    title={schedule.startTime && schedule.endTime ? '이 시간을 다른 요일에 복사' : '시간을 먼저 입력하세요'}
                  >
                    {copiedDay === schedule.dayOfWeek ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setIsScheduleDialogOpen(false)}
              >
                취소
              </Button>
              <Button type="submit" className="flex-1">
                저장
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">근무자 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">로딩 중...</div>
          ) : workers.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              등록된 근무자가 없습니다
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>연락처</TableHead>
                  <TableHead>스케줄</TableHead>
                  <TableHead className="text-center">세금</TableHead>
                  <TableHead className="text-center">상태</TableHead>
                  <TableHead className="text-center">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workers.map((worker) => (
                  <TableRow
                    key={worker.id}
                    className={!worker.is_active ? 'opacity-50 bg-gray-50' : ''}
                  >
                    <TableCell className="font-medium">
                      {worker.name}
                      {worker.role === 'admin' && (
                        <Badge variant="default" className="ml-2 text-xs">
                          관리자
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{worker.phone || '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {worker.schedules
                          .filter((s) => s.is_active)
                          .sort((a, b) => a.day_of_week - b.day_of_week)
                          .map((s) => (
                            <Badge key={s.id} variant="outline" className="text-xs">
                              {DAY_LABELS[s.day_of_week]}{' '}
                              {s.start_time.slice(0, 5)}-{s.end_time.slice(0, 5)}
                            </Badge>
                          ))}
                        {worker.schedules.filter((s) => s.is_active).length === 0 && (
                          <span className="text-gray-400 text-sm">미설정</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {worker.is_tax_applied ? (
                        <Badge variant="secondary">3.3%</Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {!worker.is_active ? (
                        <Badge variant="destructive">
                          퇴사
                          {worker.resigned_at && (
                            <span className="ml-1">
                              ({format(new Date(worker.resigned_at), 'M/d')})
                            </span>
                          )}
                        </Badge>
                      ) : (
                        <Badge variant="outline">재직</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openScheduleDialog(worker)}
                          disabled={!worker.is_active}
                        >
                          <CalendarIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(worker)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {worker.name}님을 삭제하시겠습니까?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                근무자와 관련된 스케줄이 모두 삭제됩니다.
                                변동사항 기록은 유지됩니다.
                                퇴사 처리를 원하시면 수정 버튼에서 퇴사일을 설정해주세요.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>취소</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteWorker(worker)}
                                className="bg-red-500 hover:bg-red-600"
                              >
                                삭제
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
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
