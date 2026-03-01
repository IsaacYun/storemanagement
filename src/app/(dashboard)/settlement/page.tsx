'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useStoreSelection } from '@/lib/stores/useStoreSelection';
import { useMonthSelection } from '@/lib/stores/useMonthSelection';
import { Worker, Schedule, ScheduleChange, Store, MonthlySettlement, CHANGE_TYPE_LABELS } from '@/lib/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Copy, Check, Lock, Unlock } from 'lucide-react';
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
import { logActivity } from '@/lib/utils/activityLog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface WorkerSettlement {
  worker: Worker;
  workHours: MonthlyWorkHours;
  salary: SalaryCalculation;
  isFullAttendance: boolean;
  changes: ScheduleChange[];
}

export default function SettlementPage() {
  const { selectedStoreId } = useStoreSelection();
  const { year, month, goToPrevMonth, goToNextMonth } = useMonthSelection();
  const [store, setStore] = useState<Store | null>(null);
  const [settlements, setSettlements] = useState<WorkerSettlement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<WorkerSettlement | null>(null);
  const [monthlyNote, setMonthlyNote] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  const fetchSettlements = async () => {
    if (!selectedStoreId) return;

    setIsLoading(true);
    const supabase = createClient();

    const currentDate = new Date(year, month - 1);
    const monthStart = format(startOfMonth(currentDate), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(currentDate), 'yyyy-MM-dd');

    const [storeRes, storeWorkersRes, adminWorkersRes, schedulesRes, changesRes, settlementStatusRes, noteRes] = await Promise.all([
      supabase.from('stores').select('*').eq('id', selectedStoreId).single(),
      supabase
        .from('workers')
        .select('*')
        .eq('store_id', selectedStoreId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('workers')
        .select('*')
        .eq('role', 'admin')
        .eq('is_active', true)
        .neq('store_id', selectedStoreId),
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
      // 정산 완료 상태 확인
      supabase
        .from('monthly_settlements')
        .select('status, confirmed_at')
        .eq('store_id', selectedStoreId)
        .eq('year', year)
        .eq('month', month)
        .eq('status', 'confirmed')
        .limit(1),
      // 월별 메모 조회
      supabase
        .from('monthly_notes')
        .select('note')
        .eq('store_id', selectedStoreId)
        .eq('year', year)
        .eq('month', month)
        .single(),
    ]);

    const storeData = storeRes.data as Store;
    // 매장 근무자 + 관리자 합치기
    const workers = [
      ...(storeWorkersRes.data || []),
      ...(adminWorkersRes.data || []),
    ].sort((a, b) => a.name.localeCompare(b.name)) as Worker[];
    const schedules = (schedulesRes.data || []) as Schedule[];
    const changes = (changesRes.data || []) as ScheduleChange[];

    // 정산 완료 상태 설정
    const settlementStatus = settlementStatusRes.data?.[0];
    setIsConfirmed(!!settlementStatus);
    setConfirmedAt(settlementStatus?.confirmed_at || null);

    // 월별 메모 설정
    setMonthlyNote(noteRes.data?.note || '');

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

      return { worker, workHours, salary, isFullAttendance, changes: workerChanges };
    });

    setSettlements(workerSettlements);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchSettlements();
  }, [selectedStoreId, year, month]);

  const handleCopyKakao = async (settlement: WorkerSettlement) => {
    if (!store) return;

    const message = generateKakaoMessage({
      worker: settlement.worker,
      store,
      year,
      month,
      salary: settlement.salary,
      workHours: settlement.workHours,
      changes: settlement.changes,
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

  const handleConfirmSettlement = async () => {
    if (!selectedStoreId || !store) return;

    const supabase = createClient();

    try {
      // 모든 근무자에 대해 정산 데이터 저장
      const settlementRecords = settlements.map((s) => ({
        worker_id: s.worker.id,
        store_id: selectedStoreId,
        year,
        month,
        base_work_minutes: s.workHours.baseMinutes,
        absence_minutes: s.workHours.absenceMinutes,
        overtime_minutes: s.workHours.overtimeMinutes,
        substitute_minutes: s.workHours.substituteMinutes,
        late_minutes: s.workHours.lateMinutes,
        early_leave_minutes: s.workHours.earlyLeaveMinutes,
        meal_allowance: s.salary.mealAllowanceWage,
        weekly_holiday_pay: s.salary.weeklyHolidayPayWage,
        full_attendance_bonus: s.salary.fullAttendanceBonus,
        gross_wage: s.salary.grossWage,
        tax_amount: s.salary.taxAmount,
        net_wage: s.salary.netWage,
        status: 'confirmed' as const,
        confirmed_at: new Date().toISOString(),
      }));

      // 기존 정산 데이터 삭제 후 새로 저장
      await supabase
        .from('monthly_settlements')
        .delete()
        .eq('store_id', selectedStoreId)
        .eq('year', year)
        .eq('month', month);

      const { error } = await supabase
        .from('monthly_settlements')
        .insert(settlementRecords);

      if (error) throw error;

      setIsConfirmed(true);
      setConfirmedAt(new Date().toISOString());
      toast.success(`${year}년 ${month}월 정산이 완료되었습니다`);

      // 활동 로그 저장
      logActivity({
        action: 'confirm_settlement',
        targetTable: 'monthly_settlements',
        afterData: { store_id: selectedStoreId, year, month, workers: settlements.length },
      });
    } catch (error) {
      toast.error('정산 완료에 실패했습니다');
      console.error(error);
    }
  };

  const handleCancelConfirmation = async () => {
    if (!selectedStoreId) return;

    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('monthly_settlements')
        .update({ status: 'draft', confirmed_at: null })
        .eq('store_id', selectedStoreId)
        .eq('year', year)
        .eq('month', month);

      if (error) throw error;

      setIsConfirmed(false);
      setConfirmedAt(null);
      toast.success('정산 완료가 취소되었습니다');

      // 활동 로그 저장
      logActivity({
        action: 'cancel_settlement',
        targetTable: 'monthly_settlements',
        afterData: { store_id: selectedStoreId, year, month },
      });
    } catch (error) {
      toast.error('정산 취소에 실패했습니다');
      console.error(error);
    }
  };

  const handleSaveNote = async () => {
    if (!selectedStoreId) return;

    setIsSavingNote(true);
    const supabase = createClient();

    try {
      // upsert로 저장 (있으면 업데이트, 없으면 생성)
      const { error } = await supabase
        .from('monthly_notes')
        .upsert({
          store_id: selectedStoreId,
          year,
          month,
          note: monthlyNote,
        }, {
          onConflict: 'store_id,year,month',
        });

      if (error) throw error;
      toast.success('메모가 저장되었습니다');
    } catch (error) {
      toast.error('메모 저장에 실패했습니다');
      console.error(error);
    } finally {
      setIsSavingNote(false);
    }
  };

  // 합계 계산 (올림 적용된 시간 기준)
  const totals = settlements.reduce(
    (acc, s) => ({
      workMinutes: acc.workMinutes + s.workHours.totalMinutesRounded,
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold min-w-[140px] text-center">
            {year}년 {month}월 정산
          </h1>
          <Button variant="outline" size="icon" onClick={goToNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {isConfirmed && (
            <Badge variant="secondary" className="ml-2">
              <Lock className="h-3 w-3 mr-1" />
              정산완료
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {isConfirmed ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Unlock className="h-4 w-4 mr-2" />
                  정산 취소
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>정산 완료를 취소하시겠습니까?</AlertDialogTitle>
                  <AlertDialogDescription>
                    취소하면 해당 월의 변동사항을 다시 수정할 수 있습니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>아니오</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCancelConfirmation}>
                    예, 취소합니다
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={settlements.length === 0}>
                  <Lock className="h-4 w-4 mr-2" />
                  정산 완료
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{year}년 {month}월 정산을 완료하시겠습니까?</AlertDialogTitle>
                  <AlertDialogDescription>
                    정산 완료 후에는 해당 월의 변동사항을 수정할 수 없습니다.
                    정산 데이터가 저장됩니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={handleConfirmSettlement}>
                    정산 완료
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* 정산 완료 안내 */}
      {isConfirmed && confirmedAt && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
          {format(new Date(confirmedAt), 'yyyy년 M월 d일 HH:mm', { locale: ko })}에 정산이 완료되었습니다.
        </div>
      )}

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
                    <TableHead className="text-right">세전급여</TableHead>
                    <TableHead className="text-right">세금(3.3%)</TableHead>
                    <TableHead className="text-right">실수령액</TableHead>
                    <TableHead className="text-center">카톡</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlements.map((s) => {
                    return (
                      <TableRow
                        key={s.worker.id}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => setSelectedWorker(s)}
                      >
                        <TableCell className="font-medium">
                          {s.worker.name}
                          {s.worker.is_tax_applied && (
                            <span className="text-xs text-gray-400 ml-1">
                              (세금)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMinutesToHoursAndMinutes(s.workHours.totalMinutesRounded)}
                          {s.workHours.hasRounding && (
                            <span className="text-xs text-blue-500 ml-1" title="0.5시간 단위 올림 적용">↑</span>
                          )}
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

      {/* 월별 메모 영역 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">월별 메모</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="이 달의 특이사항, 전체 변동사항 요약, 공지사항 등을 기록하세요..."
            value={monthlyNote}
            onChange={(e) => setMonthlyNote(e.target.value)}
            rows={4}
          />
          <div className="flex justify-end">
            <Button onClick={handleSaveNote} disabled={isSavingNote} size="sm">
              {isSavingNote ? '저장 중...' : '메모 저장'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 범례 */}
      <div className="text-sm text-gray-500">
        <p>* 총 근무시간이 0.5시간 단위로 올림 처리됩니다 (↑ 표시)</p>
        <p>* 행을 클릭하면 상세 정산 내역을 볼 수 있습니다</p>
      </div>

      {/* 근무자 상세 정산 다이얼로그 */}
      <Dialog open={!!selectedWorker} onOpenChange={() => setSelectedWorker(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedWorker?.worker.name} - {year}년 {month}월 정산 상세
            </DialogTitle>
          </DialogHeader>
          {selectedWorker && store && (
            <div className="space-y-4">
              {/* 근무시간 상세 */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">근무시간 상세</h4>
                <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>기본 근무</span>
                    <span>{formatMinutesToHoursAndMinutes(selectedWorker.workHours.baseMinutes)}</span>
                  </div>
                  {selectedWorker.workHours.absenceMinutes > 0 && (
                    <div className="flex justify-between text-red-500">
                      <span>미근무</span>
                      <span>-{formatMinutesToHoursAndMinutes(selectedWorker.workHours.absenceMinutes)}</span>
                    </div>
                  )}
                  {selectedWorker.workHours.overtimeMinutes > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>추가근무</span>
                      <span>+{formatMinutesToHoursAndMinutes(selectedWorker.workHours.overtimeMinutes)}</span>
                    </div>
                  )}
                  {selectedWorker.workHours.substituteMinutes > 0 && (
                    <div className="flex justify-between text-blue-600">
                      <span>대타근무</span>
                      <span>+{formatMinutesToHoursAndMinutes(selectedWorker.workHours.substituteMinutes)}</span>
                    </div>
                  )}
                  {selectedWorker.workHours.lateMinutes > 0 && (
                    <div className="flex justify-between text-orange-500">
                      <span>지각</span>
                      <span>-{formatMinutesToHoursAndMinutes(selectedWorker.workHours.lateMinutes)}</span>
                    </div>
                  )}
                  {selectedWorker.workHours.earlyLeaveMinutes > 0 && (
                    <div className="flex justify-between text-orange-500">
                      <span>조퇴</span>
                      <span>-{formatMinutesToHoursAndMinutes(selectedWorker.workHours.earlyLeaveMinutes)}</span>
                    </div>
                  )}
                  {selectedWorker.workHours.mealAllowanceMinutes > 0 && (
                    <div className="flex justify-between text-purple-600">
                      <span>식대</span>
                      <span>+{formatMinutesToHoursAndMinutes(selectedWorker.workHours.mealAllowanceMinutes)}</span>
                    </div>
                  )}
                  {selectedWorker.workHours.weeklyHolidayPayMinutes > 0 && (
                    <div className="flex justify-between text-purple-600">
                      <span>주휴수당</span>
                      <span>+{formatMinutesToHoursAndMinutes(selectedWorker.workHours.weeklyHolidayPayMinutes)}</span>
                    </div>
                  )}
                  {selectedWorker.workHours.fullAttendanceBonusMinutes > 0 && (
                    <div className="flex justify-between text-purple-600">
                      <span>만근수당</span>
                      <span>+{formatMinutesToHoursAndMinutes(selectedWorker.workHours.fullAttendanceBonusMinutes)}</span>
                    </div>
                  )}
                  <div className="border-t pt-1 mt-1 font-medium flex justify-between">
                    <span>총 근무시간</span>
                    <span>
                      {formatMinutesToHoursAndMinutes(selectedWorker.workHours.totalMinutesRounded)}
                      {selectedWorker.workHours.hasRounding && (
                        <span className="text-xs text-blue-500 ml-1">(0.5시간 단위 올림)</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* 급여 상세 */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">급여 상세</h4>
                <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>시급</span>
                    <span>{formatMoney(store.hourly_wage)}원</span>
                  </div>
                  <div className="border-t pt-1 mt-1 flex justify-between">
                    <span>세전급여</span>
                    <span>{formatMoney(selectedWorker.salary.grossWage)}원</span>
                  </div>
                  {selectedWorker.worker.is_tax_applied && selectedWorker.salary.taxAmount > 0 && (
                    <div className="flex justify-between text-red-500">
                      <span>세금 (3.3%)</span>
                      <span>-{formatMoney(selectedWorker.salary.taxAmount)}원</span>
                    </div>
                  )}
                  <div className="border-t pt-1 mt-1 font-semibold flex justify-between text-base">
                    <span>실수령액</span>
                    <span>{formatMoney(selectedWorker.salary.netWage)}원</span>
                  </div>
                </div>
              </div>

              {/* 변동사항 상세 */}
              {selectedWorker.changes.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">변동사항 내역 ({selectedWorker.changes.length}건)</h4>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-2 max-h-48 overflow-y-auto">
                    {selectedWorker.changes
                      .sort((a, b) => new Date(a.work_date).getTime() - new Date(b.work_date).getTime())
                      .map((change) => (
                        <div key={change.id} className="border-b border-gray-200 pb-2 last:border-0 last:pb-0">
                          <div className="flex justify-between items-center">
                            <span className="flex items-center gap-2">
                              <span className="text-gray-500">
                                {format(new Date(change.work_date), 'M/d(EEE)', { locale: ko })}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {CHANGE_TYPE_LABELS[change.change_type]}
                              </Badge>
                            </span>
                            <span className="text-gray-600">
                              {change.start_time && change.end_time
                                ? `${change.start_time.slice(0, 5)}-${change.end_time.slice(0, 5)}`
                                : change.minutes
                                ? formatMinutesToHoursAndMinutes(change.minutes)
                                : '-'}
                            </span>
                          </div>
                          {change.note && (
                            <p className="text-gray-500 text-xs mt-1 pl-1">📝 {change.note}</p>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* 카톡 복사 버튼 */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    handleCopyKakao(selectedWorker);
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  카카오톡 메시지 복사
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
