'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useStoreSelection } from '@/lib/stores/useStoreSelection';
import { useAuth } from '@/lib/stores/useAuth';
import { Worker, ChangeType, CHANGE_TYPE_LABELS, Store } from '@/lib/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { CalendarIcon, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { calculateMinutesBetween } from '@/lib/calculations/workHours';

const CHANGE_TYPES: ChangeType[] = [
  'absence',
  'overtime',
  'substitute',
  'late',
  'early_leave',
  'meal_allowance',
  'weekly_holiday_pay',
];

export default function NewChangePage() {
  const router = useRouter();
  const { selectedStoreId } = useStoreSelection();
  const { worker: currentWorker, isAdmin } = useAuth();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 폼 상태
  const [workerId, setWorkerId] = useState('');
  const [workDate, setWorkDate] = useState<Date>();
  const [changeType, setChangeType] = useState<ChangeType>('absence');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [minutes, setMinutes] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [workStoreId, setWorkStoreId] = useState('');
  const [originalWorkerId, setOriginalWorkerId] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient();

      const [workersRes, storesRes] = await Promise.all([
        supabase
          .from('workers')
          .select('*')
          .eq('store_id', selectedStoreId)
          .eq('is_active', true)
          .order('name'),
        supabase.from('stores').select('*').eq('is_active', true).order('name'),
      ]);

      setWorkers(workersRes.data || []);
      setStores(storesRes.data || []);

      // 기본값 설정
      if (selectedStoreId) {
        setWorkStoreId(selectedStoreId);
      }

      // 근무자는 본인만 선택 가능
      if (!isAdmin && currentWorker) {
        setWorkerId(currentWorker.id);
      }
    };

    if (selectedStoreId) {
      fetchData();
    }
  }, [selectedStoreId, isAdmin, currentWorker]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workDate || !workerId) {
      toast.error('필수 항목을 입력해주세요');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();

      // 시간 계산
      let calculatedMinutes = parseInt(minutes) || 0;
      if (startTime && endTime) {
        calculatedMinutes = calculateMinutesBetween(startTime, endTime);
      }

      const changeData = {
        worker_id: workerId,
        work_date: format(workDate, 'yyyy-MM-dd'),
        change_type: changeType,
        work_store_id: workStoreId || selectedStoreId,
        original_worker_id: changeType === 'substitute' ? originalWorkerId || null : null,
        start_time: startTime || null,
        end_time: endTime || null,
        minutes: calculatedMinutes || null,
        amount: parseInt(amount) || 0,
        note: note || null,
        created_by: currentWorker?.id || null,
        status: isAdmin ? 'approved' : 'pending',
      };

      const { error } = await supabase.from('schedule_changes').insert(changeData);

      if (error) throw error;

      // 대타인 경우 원래 근무자에게 미근무 자동 생성
      if (changeType === 'substitute' && originalWorkerId) {
        await supabase.from('schedule_changes').insert({
          worker_id: originalWorkerId,
          work_date: format(workDate, 'yyyy-MM-dd'),
          change_type: 'absence',
          work_store_id: workStoreId || selectedStoreId,
          minutes: calculatedMinutes,
          note: `대타: ${workers.find((w) => w.id === workerId)?.name}`,
          created_by: currentWorker?.id || null,
          status: 'approved',
        });
      }

      toast.success('변동사항이 등록되었습니다');
      router.push('/changes');
    } catch (error) {
      toast.error('등록에 실패했습니다');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const needsTimeInput = ['absence', 'overtime', 'substitute'].includes(changeType);
  const needsMinutesInput = ['late', 'early_leave'].includes(changeType);
  const needsAmountInput = ['meal_allowance', 'weekly_holiday_pay'].includes(changeType);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">변동사항 입력</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">새 변동사항</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 근무자 선택 */}
            <div className="space-y-2">
              <Label>근무자 *</Label>
              <Select
                value={workerId}
                onValueChange={setWorkerId}
                disabled={!isAdmin}
              >
                <SelectTrigger>
                  <SelectValue placeholder="근무자 선택" />
                </SelectTrigger>
                <SelectContent>
                  {workers.map((worker) => (
                    <SelectItem key={worker.id} value={worker.id}>
                      {worker.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 날짜 선택 */}
            <div className="space-y-2">
              <Label>날짜 *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !workDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {workDate
                      ? format(workDate, 'yyyy년 M월 d일 (EEE)', { locale: ko })
                      : '날짜 선택'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={workDate}
                    onSelect={setWorkDate}
                    locale={ko}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* 변동 유형 */}
            <div className="space-y-2">
              <Label>변동 유형 *</Label>
              <Select
                value={changeType}
                onValueChange={(v) => setChangeType(v as ChangeType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANGE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {CHANGE_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 대타: 원래 근무자 & 근무 매장 */}
            {changeType === 'substitute' && (
              <>
                <div className="space-y-2">
                  <Label>원래 근무자</Label>
                  <Select value={originalWorkerId} onValueChange={setOriginalWorkerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="선택 (선택사항)" />
                    </SelectTrigger>
                    <SelectContent>
                      {workers
                        .filter((w) => w.id !== workerId)
                        .map((worker) => (
                          <SelectItem key={worker.id} value={worker.id}>
                            {worker.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>근무 매장</Label>
                  <Select value={workStoreId} onValueChange={setWorkStoreId}>
                    <SelectTrigger>
                      <SelectValue />
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
              </>
            )}

            {/* 시간 입력 */}
            {needsTimeInput && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>시작 시간</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>종료 시간</Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* 분 입력 */}
            {needsMinutesInput && (
              <div className="space-y-2">
                <Label>시간 (분)</Label>
                <Input
                  type="number"
                  placeholder="예: 15"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
              </div>
            )}

            {/* 금액 입력 */}
            {needsAmountInput && (
              <div className="space-y-2">
                <Label>금액 (원)</Label>
                <Input
                  type="number"
                  placeholder="예: 10000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            )}

            {/* 메모 */}
            <div className="space-y-2">
              <Label>메모</Label>
              <Input
                placeholder="메모 (선택사항)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {/* 제출 버튼 */}
            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                className="flex-1"
              >
                취소
              </Button>
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {isLoading ? '등록 중...' : '등록'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
