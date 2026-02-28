'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useStoreSelection } from '@/lib/stores/useStoreSelection';
import { Worker, Schedule, ScheduleChange, Store } from '@/lib/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  calculateMonthlyWorkHours,
  formatMinutesToHoursAndMinutes,
  MonthlyWorkHours,
} from '@/lib/calculations/workHours';
import {
  calculateSalary,
  checkFullAttendance,
  formatMoney,
  SalaryCalculation,
} from '@/lib/calculations/salary';
import { generateKakaoMessage, copyToClipboard } from '@/lib/format/kakaoMessage';

interface WorkerSettlement {
  worker: Worker;
  workHours: MonthlyWorkHours;
  salary: SalaryCalculation;
  isFullAttendance: boolean;
}

export default function SettlementPage() {
  const { selectedStoreId } = useStoreSelection();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [store, setStore] = useState<Store | null>(null);
  const [settlements, setSettlements] = useState<WorkerSettlement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedStoreId) return;

    const fetchSettlements = async () => {
      setIsLoading(true);
      const supabase = createClient();

      const currentDate = new Date(year, month - 1);
      const monthStart = format(startOfMonth(currentDate), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(currentDate), 'yyyy-MM-dd');

      const [storeRes, workersRes, schedulesRes, changesRes] = await Promise.all([
        supabase.from('stores').select('*').eq('id', selectedStoreId).single(),
        supabase
          .from('workers')
          .select('*')
          .eq('store_id', selectedStoreId)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('schedules')
          .select('*')
          .eq('store_id', selectedStoreId)
          .eq('is_active', true),
        supabase
          .from('schedule_changes')
          .select('*')
          .eq('work_store_id', selectedStoreId)
          .gte('work_date', monthStart)
          .lte('work_date', monthEnd),
      ]);

      const storeData = storeRes.data as Store;
      const workers = (workersRes.data || []) as Worker[];
      const schedules = (schedulesRes.data || []) as Schedule[];
      const changes = (changesRes.data || []) as ScheduleChange[];

      setStore(storeData);

      // 근무자별 정산 계산
      const workerSettlements: WorkerSettlement[] = workers.map((worker) => {
        const workerSchedules = schedules.filter((s) => s.worker_id === worker.id);
        const workerChanges = changes.filter((c) => c.worker_id === worker.id);

        const workHours = calculateMonthlyWorkHours(
          workerSchedules,
          workerChanges,
          year,
          month
        );
        const isFullAttendance = checkFullAttendance(workerChanges);
        const salary = calculateSalary(
          workHours,
          storeData,
          worker,
          workerChanges,
          isFullAttendance
        );

        return { worker, workHours, salary, isFullAttendance };
      });

      setSettlements(workerSettlements);
      setIsLoading(false);
    };

    fetchSettlements();
  }, [selectedStoreId, year, month]);

  const handlePrevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  };

  const handleCopyKakao = async (settlement: WorkerSettlement) => {
    if (!store) return;

    const message = generateKakaoMessage({
      worker: settlement.worker,
      store,
      year,
      month,
      salary: settlement.salary,
      workHours: settlement.workHours,
    });

    const success = await copyToClipboard(message);

    if (success) {
      setCopiedId(settlement.worker.id);
      toast.success('클립보드에 복사되었습니다');
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      toast.error('복사에 실패했습니다');
    }
  };

  // 합계 계산
  const totals = settlements.reduce(
    (acc, s) => ({
      workMinutes: acc.workMinutes + s.workHours.totalMinutes,
      grossWage: acc.grossWage + s.salary.grossWage,
      taxAmount: acc.taxAmount + s.salary.taxAmount,
      netWage: acc.netWage + s.salary.netWage,
    }),
    { workMinutes: 0, grossWage: 0, taxAmount: 0, netWage: 0 }
  );

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
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold min-w-[140px] text-center">
            {year}년 {month}월 정산
          </h1>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 정산 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>근무자별 정산</span>
            {store && (
              <span className="text-sm font-normal text-gray-500">
                시급: {formatMoney(store.hourly_wage)}원
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">로딩 중...</div>
          ) : settlements.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              근무자가 없습니다
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>근무자</TableHead>
                    <TableHead className="text-right">총 근무시간</TableHead>
                    <TableHead className="text-right">기본급</TableHead>
                    <TableHead className="text-right">추가지급</TableHead>
                    <TableHead className="text-right">세전급여</TableHead>
                    <TableHead className="text-right">세금(3.3%)</TableHead>
                    <TableHead className="text-right">실수령액</TableHead>
                    <TableHead className="text-center">카톡</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlements.map((s) => {
                    const extras =
                      s.salary.mealAllowance +
                      s.salary.weeklyHolidayPay +
                      s.salary.fullAttendanceBonus;

                    return (
                      <TableRow key={s.worker.id}>
                        <TableCell className="font-medium">
                          {s.worker.name}
                          {s.worker.is_tax_applied && (
                            <span className="text-xs text-gray-400 ml-1">
                              (세금)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMinutesToHoursAndMinutes(s.workHours.totalMinutes)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(s.salary.baseWage)}원
                        </TableCell>
                        <TableCell className="text-right">
                          {extras > 0 ? `+${formatMoney(extras)}원` : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(s.salary.grossWage)}원
                        </TableCell>
                        <TableCell className="text-right text-red-500">
                          {s.salary.taxAmount > 0
                            ? `-${formatMoney(s.salary.taxAmount)}원`
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatMoney(s.salary.netWage)}원
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopyKakao(s)}
                          >
                            {copiedId === s.worker.id ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* 합계 */}
                  <TableRow className="bg-gray-50 font-semibold">
                    <TableCell>합계</TableCell>
                    <TableCell className="text-right">
                      {formatMinutesToHoursAndMinutes(totals.workMinutes)}
                    </TableCell>
                    <TableCell className="text-right" colSpan={2}>
                      -
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(totals.grossWage)}원
                    </TableCell>
                    <TableCell className="text-right text-red-500">
                      -{formatMoney(totals.taxAmount)}원
                    </TableCell>
                    <TableCell className="text-right">
                      {formatMoney(totals.netWage)}원
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 범례 */}
      <div className="text-sm text-gray-500">
        <p>* 추가지급: 식대 + 주휴수당 + 만근보너스</p>
        <p>* 카톡 버튼을 클릭하면 근무자에게 보낼 급여 안내 메시지가 복사됩니다</p>
      </div>
    </div>
  );
}
