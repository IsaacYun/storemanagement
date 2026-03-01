'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useStoreSelection } from '@/lib/stores/useStoreSelection';
import { useMonthSelection } from '@/lib/stores/useMonthSelection';
import { Schedule, ScheduleChange, Worker } from '@/lib/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameMonth,
  isToday,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Lock, Trash2, Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { calculateMinutesBetween, formatMinutesToHoursAndMinutes } from '@/lib/calculations/workHours';
import { CHANGE_TYPE_LABELS } from '@/lib/supabase/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
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
import { toast } from 'sonner';
import { logActivity } from '@/lib/utils/activityLog';

interface WorkEntry {
  worker: Worker;
  type: 'schedule' | 'substitute' | 'overtime' | 'meal_allowance' | 'weekly_holiday_pay' | 'full_attendance_bonus';
  schedule: Schedule | null;
  change: ScheduleChange | null;
  startTime: string;
  endTime: string;
  workMinutes: number;
  hasAbsence: boolean;
  hasLate: boolean;
  hasEarlyLeave: boolean;
  relatedChanges: ScheduleChange[]; // 지각, 조퇴 등
}

interface DayData {
  date: Date;
  entries: WorkEntry[];
  totalWorkMinutes: number;
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

export default function CalendarPage() {
  const router = useRouter();
  const { selectedStoreId } = useStoreSelection();
  const { year, month, goToPrevMonth, goToNextMonth, goToToday } = useMonthSelection();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [changes, setChanges] = useState<ScheduleChange[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMonthConfirmed, setIsMonthConfirmed] = useState(false);
  const [selectedDay, setSelectedDay] = useState<{
    date: Date;
    worker: Worker;
    schedule: Schedule | null;
    changes: ScheduleChange[];
  } | null>(null);

  // 수정 다이얼로그 상태
  const [editingChange, setEditingChange] = useState<ScheduleChange | null>(null);
  const [editWorkDate, setEditWorkDate] = useState<Date | undefined>(undefined);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editMinutes, setEditMinutes] = useState('');
  const [editHours, setEditHours] = useState(''); // 식대, 주휴수당용
  const [editNote, setEditNote] = useState('');

  const currentDate = new Date(year, month - 1);

  const fetchData = async () => {
    if (!selectedStoreId) return;

    setIsLoading(true);
    const supabase = createClient();

    const monthStart = format(startOfMonth(currentDate), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(currentDate), 'yyyy-MM-dd');

    // 해당 매장 근무자 + 관리자(모든 매장에서 보임)
    const [storeWorkersRes, adminWorkersRes, schedulesRes, settlementRes] = await Promise.all([
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
        .from('monthly_settlements')
        .select('status')
        .eq('store_id', selectedStoreId)
        .eq('year', year)
        .eq('month', month)
        .eq('status', 'confirmed')
        .limit(1),
    ]);

    const changesRes = await supabase
      .from('schedule_changes')
      .select('*')
      .eq('work_store_id', selectedStoreId)
      .gte('work_date', monthStart)
      .lte('work_date', monthEnd);

    // 매장 근무자 + 관리자 합치기
    const allWorkers = [
      ...(storeWorkersRes.data || []),
      ...(adminWorkersRes.data || []),
    ].sort((a, b) => a.name.localeCompare(b.name));
    setWorkers(allWorkers);
    setSchedules(schedulesRes.data || []);
    setChanges(changesRes.data || []);
    setIsMonthConfirmed((settlementRes.data?.length || 0) > 0);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [selectedStoreId, year, month]);

  const handleDeleteChange = async (changeId: string) => {
    const supabase = createClient();

    try {
      const changeToDelete = changes.find((c) => c.id === changeId);

      const { error } = await supabase
        .from('schedule_changes')
        .delete()
        .eq('id', changeId);

      if (error) throw error;

      toast.success('변동사항이 삭제되었습니다');

      // 활동 로그 저장 (이름 포함)
      const worker = workers.find((w) => w.id === changeToDelete?.worker_id);
      logActivity({
        action: 'delete',
        targetTable: 'schedule_changes',
        targetId: changeId,
        beforeData: {
          ...changeToDelete,
          worker_name: worker?.name,
        } as Record<string, unknown>,
      });

      // 데이터 새로고침
      fetchData();
      setSelectedDay(null);
    } catch (error) {
      toast.error('삭제에 실패했습니다');
      console.error(error);
    }
  };

  // 수정 다이얼로그 열기
  const openEditDialog = (change: ScheduleChange) => {
    setEditingChange(change);
    setEditWorkDate(new Date(change.work_date));
    setEditStartTime(change.start_time?.slice(0, 5) || '');
    setEditEndTime(change.end_time?.slice(0, 5) || '');
    setEditMinutes(change.minutes?.toString() || '');
    // 식대/주휴수당은 분을 시간으로 변환
    if (['meal_allowance', 'weekly_holiday_pay'].includes(change.change_type) && change.minutes) {
      setEditHours((change.minutes / 60).toString());
    } else {
      setEditHours('');
    }
    setEditNote(change.note || '');
  };

  // 수정 저장
  const handleEditSubmit = async () => {
    if (!editingChange || !editWorkDate) return;

    const supabase = createClient();

    try {
      // 날짜가 변경된 경우, 해당 월의 정산 완료 여부 체크
      const newYear = editWorkDate.getFullYear();
      const newMonth = editWorkDate.getMonth() + 1;
      const originalDate = new Date(editingChange.work_date);
      const originalYear = originalDate.getFullYear();
      const originalMonth = originalDate.getMonth() + 1;

      // 다른 월로 이동하는 경우 해당 월 정산 체크
      if (newYear !== originalYear || newMonth !== originalMonth) {
        const { data: targetMonthSettlement } = await supabase
          .from('monthly_settlements')
          .select('id')
          .eq('store_id', selectedStoreId)
          .eq('year', newYear)
          .eq('month', newMonth)
          .eq('status', 'confirmed')
          .limit(1);

        if ((targetMonthSettlement?.length || 0) > 0) {
          toast.error(`${newYear}년 ${newMonth}월은 정산이 완료되어 변동사항을 이동할 수 없습니다`);
          return;
        }
      }

      // 시간 계산
      let calculatedMinutes = parseInt(editMinutes) || 0;
      if (editStartTime && editEndTime) {
        calculatedMinutes = calculateMinutesBetween(editStartTime, editEndTime);
      }
      // 식대/주휴수당은 시간(hours)을 분으로 변환
      if (['meal_allowance', 'weekly_holiday_pay'].includes(editingChange.change_type) && editHours) {
        calculatedMinutes = Math.round(parseFloat(editHours) * 60);
      }

      const updateData: Record<string, unknown> = {
        work_date: format(editWorkDate, 'yyyy-MM-dd'),
        start_time: editStartTime || null,
        end_time: editEndTime || null,
        minutes: calculatedMinutes || null,
        amount: 0,
        note: editNote || null,
      };

      const { error } = await supabase
        .from('schedule_changes')
        .update(updateData)
        .eq('id', editingChange.id);

      if (error) throw error;

      toast.success('변동사항이 수정되었습니다');

      // 활동 로그 저장
      const worker = workers.find((w) => w.id === editingChange.worker_id);
      logActivity({
        action: 'update',
        targetTable: 'schedule_changes',
        targetId: editingChange.id,
        beforeData: { ...editingChange, worker_name: worker?.name },
        afterData: { ...editingChange, ...updateData, worker_name: worker?.name },
      });

      setEditingChange(null);
      fetchData();

      // selectedDay 업데이트 (날짜가 변경되면 다이얼로그 닫기)
      if (selectedDay) {
        const originalDateStr = format(originalDate, 'yyyy-MM-dd');
        const newDateStr = format(editWorkDate, 'yyyy-MM-dd');

        if (originalDateStr !== newDateStr) {
          // 날짜가 변경되면 다이얼로그 닫기
          setSelectedDay(null);
        } else {
          // 같은 날짜면 업데이트
          const updatedChanges = selectedDay.changes.map((c) =>
            c.id === editingChange.id
              ? { ...c, ...updateData }
              : c
          );
          setSelectedDay({ ...selectedDay, changes: updatedChanges as ScheduleChange[] });
        }
      }
    } catch (error) {
      toast.error('수정에 실패했습니다');
      console.error(error);
    }
  };

  const calendarDays = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  });

  const firstDayOfWeek = getDay(startOfMonth(currentDate));
  const paddingDays = Array(firstDayOfWeek).fill(null);

  // 특정 날짜에 유효한 스케줄 찾기
  const findEffectiveSchedule = (
    workerSchedules: Schedule[],
    dateStr: string,
    dayOfWeek: number
  ): Schedule | undefined => {
    // 해당 요일의 활성 스케줄들 필터링
    const daySchedules = workerSchedules.filter(
      (s) => s.day_of_week === dayOfWeek && s.is_active
    );

    // effective_from 기준으로 정렬 (최신순)
    const sorted = daySchedules.sort((a, b) => {
      if (!a.effective_from && !b.effective_from) return 0;
      if (!a.effective_from) return 1;
      if (!b.effective_from) return -1;
      return b.effective_from.localeCompare(a.effective_from);
    });

    // 해당 날짜에 유효한 스케줄 찾기
    for (const schedule of sorted) {
      const afterStart = !schedule.effective_from || dateStr >= schedule.effective_from;
      const beforeEnd = !schedule.effective_to || dateStr <= schedule.effective_to;

      if (afterStart && beforeEnd) {
        return schedule;
      }
    }

    return undefined;
  };

  const getDayData = (date: Date): DayData => {
    const dayOfWeek = getDay(date);
    const dateStr = format(date, 'yyyy-MM-dd');

    let totalWorkMinutes = 0;
    const entries: WorkEntry[] = [];

    workers.forEach((worker) => {
      const workerSchedules = schedules.filter((s) => s.worker_id === worker.id);
      const schedule = findEffectiveSchedule(workerSchedules, dateStr, dayOfWeek);
      const workerChanges = changes.filter(
        (c) => c.worker_id === worker.id && c.work_date === dateStr
      );

      const hasAbsence = workerChanges.some((c) => c.change_type === 'absence');
      const hasLate = workerChanges.some((c) => c.change_type === 'late');
      const hasEarlyLeave = workerChanges.some((c) => c.change_type === 'early_leave');
      const relatedChanges = workerChanges.filter(
        (c) => c.change_type === 'late' || c.change_type === 'early_leave' || c.change_type === 'absence'
      );

      // 1. 기본 스케줄 항목 (있으면)
      if (schedule) {
        let workMinutes = calculateMinutesBetween(schedule.start_time, schedule.end_time);
        if (hasAbsence) {
          workMinutes = 0;
        } else {
          // 지각/조퇴 시간 차감
          workerChanges.forEach((c) => {
            if (c.minutes && (c.change_type === 'late' || c.change_type === 'early_leave')) {
              workMinutes -= c.minutes;
            }
          });
        }
        workMinutes = Math.max(0, workMinutes);
        totalWorkMinutes += workMinutes;

        entries.push({
          worker,
          type: 'schedule',
          schedule,
          change: null,
          startTime: schedule.start_time,
          endTime: schedule.end_time,
          workMinutes,
          hasAbsence,
          hasLate,
          hasEarlyLeave,
          relatedChanges,
        });
      }

      // 2. 대타 항목들 (별도 표시)
      const substituteChanges = workerChanges.filter((c) => c.change_type === 'substitute');
      substituteChanges.forEach((c) => {
        const workMinutes = c.minutes || 0;
        totalWorkMinutes += workMinutes;

        entries.push({
          worker,
          type: 'substitute',
          schedule: null,
          change: c,
          startTime: c.start_time || '',
          endTime: c.end_time || '',
          workMinutes,
          hasAbsence: false,
          hasLate: false,
          hasEarlyLeave: false,
          relatedChanges: [],
        });
      });

      // 3. 추가근무 항목들 (별도 표시)
      const overtimeChanges = workerChanges.filter((c) => c.change_type === 'overtime');
      overtimeChanges.forEach((c) => {
        const workMinutes = c.minutes || 0;
        totalWorkMinutes += workMinutes;

        entries.push({
          worker,
          type: 'overtime',
          schedule: null,
          change: c,
          startTime: c.start_time || '',
          endTime: c.end_time || '',
          workMinutes,
          hasAbsence: false,
          hasLate: false,
          hasEarlyLeave: false,
          relatedChanges: [],
        });
      });

      // 4. 식대 항목들 (별도 표시)
      const mealAllowanceChanges = workerChanges.filter((c) => c.change_type === 'meal_allowance');
      mealAllowanceChanges.forEach((c) => {
        entries.push({
          worker,
          type: 'meal_allowance',
          schedule: null,
          change: c,
          startTime: '',
          endTime: '',
          workMinutes: c.minutes || 0,
          hasAbsence: false,
          hasLate: false,
          hasEarlyLeave: false,
          relatedChanges: [],
        });
      });

      // 5. 주휴수당 항목들 (별도 표시)
      const weeklyHolidayPayChanges = workerChanges.filter((c) => c.change_type === 'weekly_holiday_pay');
      weeklyHolidayPayChanges.forEach((c) => {
        entries.push({
          worker,
          type: 'weekly_holiday_pay',
          schedule: null,
          change: c,
          startTime: '',
          endTime: '',
          workMinutes: c.minutes || 0,
          hasAbsence: false,
          hasLate: false,
          hasEarlyLeave: false,
          relatedChanges: [],
        });
      });

      // 6. 만근수당 항목들 (별도 표시)
      const fullAttendanceBonusChanges = workerChanges.filter((c) => c.change_type === 'full_attendance_bonus');
      fullAttendanceBonusChanges.forEach((c) => {
        entries.push({
          worker,
          type: 'full_attendance_bonus',
          schedule: null,
          change: c,
          startTime: '',
          endTime: '',
          workMinutes: c.minutes || 0,
          hasAbsence: false,
          hasLate: false,
          hasEarlyLeave: false,
          relatedChanges: [],
        });
      });

      // 7. 스케줄 없는데 미근무만 있는 경우 (타매장 대타로 인한 미근무 등)
      if (!schedule && hasAbsence && substituteChanges.length === 0 && overtimeChanges.length === 0) {
        entries.push({
          worker,
          type: 'schedule',
          schedule: null,
          change: workerChanges.find((c) => c.change_type === 'absence') || null,
          startTime: '',
          endTime: '',
          workMinutes: 0,
          hasAbsence: true,
          hasLate: false,
          hasEarlyLeave: false,
          relatedChanges,
        });
      }
    });

    // 시간순 정렬 (시작 시간 기준)
    entries.sort((a, b) => {
      if (!a.startTime && !b.startTime) return a.worker.name.localeCompare(b.worker.name);
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime.localeCompare(b.startTime);
    });

    return {
      date,
      entries,
      totalWorkMinutes,
    };
  };

  const formatWorkTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hours}h`;
    return `${hours}h${mins}m`;
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
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold min-w-[140px] text-center">
            {format(currentDate, 'yyyy년 M월', { locale: ko })}
          </h1>
          <Button variant="outline" size="icon" onClick={goToNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToToday}>
            오늘
          </Button>
          {isMonthConfirmed && (
            <Badge variant="secondary" className="ml-2">
              <Lock className="h-3 w-3 mr-1" />
              정산완료
            </Badge>
          )}
        </div>
        <Button
          onClick={() => router.push(`/changes/new?year=${year}&month=${month}`)}
          disabled={isMonthConfirmed}
        >
          <Plus className="h-4 w-4 mr-2" />
          변동사항 입력
        </Button>
      </div>

      {isMonthConfirmed && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
          이 달은 정산이 완료되어 변동사항을 수정할 수 없습니다.
          수정이 필요하면 정산 페이지에서 정산을 취소해주세요.
        </div>
      )}

      {/* 달력 */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">로딩 중...</div>
          ) : (
            <div className="grid grid-cols-7">
              {DAY_NAMES.map((day, i) => (
                <div
                  key={day}
                  className={cn(
                    'p-2 text-center text-sm font-medium border-b',
                    i === 0 && 'text-red-500',
                    i === 6 && 'text-blue-500'
                  )}
                >
                  {day}
                </div>
              ))}

              {paddingDays.map((_, i) => (
                <div key={`pad-${i}`} className="min-h-[120px] border-b border-r bg-gray-50" />
              ))}

              {calendarDays.map((date) => {
                const dayData = getDayData(date);
                const dayOfWeek = getDay(date);

                return (
                  <div
                    key={date.toISOString()}
                    className={cn(
                      'min-h-[120px] border-b border-r p-1',
                      !isSameMonth(date, currentDate) && 'bg-gray-50',
                      isToday(date) && 'bg-blue-50'
                    )}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span
                        className={cn(
                          'text-sm font-medium',
                          dayOfWeek === 0 && 'text-red-500',
                          dayOfWeek === 6 && 'text-blue-500'
                        )}
                      >
                        {format(date, 'd')}
                      </span>
                      {dayData.totalWorkMinutes > 0 && (
                        <span className="text-[10px] text-gray-400">
                          {formatWorkTime(dayData.totalWorkMinutes)}
                        </span>
                      )}
                    </div>

                    <div className="space-y-0.5">
                      {dayData.entries.slice(0, 5).map((entry, idx) => {
                        const workerChanges = changes.filter(
                          (c) => c.worker_id === entry.worker.id && c.work_date === format(date, 'yyyy-MM-dd')
                        );

                        return (
                          <div
                            key={`${entry.worker.id}-${entry.type}-${idx}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDay({
                                date,
                                worker: entry.worker,
                                schedule: entry.schedule,
                                changes: workerChanges,
                              });
                            }}
                            className={cn(
                              'text-xs px-1 py-0.5 rounded truncate flex items-center justify-between cursor-pointer hover:ring-2 hover:ring-blue-300',
                              entry.hasAbsence
                                ? 'bg-red-100 text-red-800 line-through'
                                : entry.type === 'substitute'
                                ? 'bg-blue-100 text-blue-800'
                                : entry.type === 'overtime'
                                ? 'bg-green-100 text-green-800'
                                : entry.type === 'meal_allowance'
                                ? 'bg-purple-100 text-purple-800'
                                : entry.type === 'weekly_holiday_pay'
                                ? 'bg-indigo-100 text-indigo-800'
                                : entry.type === 'full_attendance_bonus'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-gray-100'
                            )}
                          >
                            <span className="truncate">
                              {entry.type === 'substitute' && <span className="mr-0.5">[대타]</span>}
                              {entry.type === 'overtime' && <span className="mr-0.5">[추가]</span>}
                              {entry.type === 'meal_allowance' && <span className="mr-0.5">[식대]</span>}
                              {entry.type === 'weekly_holiday_pay' && <span className="mr-0.5">[주휴]</span>}
                              {entry.type === 'full_attendance_bonus' && <span className="mr-0.5">[만근]</span>}
                              {entry.worker.name}
                              {entry.startTime && entry.endTime && !entry.hasAbsence && (
                                <span className="text-gray-500 ml-1">
                                  {entry.startTime.slice(0, 5)}-{entry.endTime.slice(0, 5)}
                                </span>
                              )}
                              {(entry.type === 'meal_allowance' || entry.type === 'weekly_holiday_pay' || entry.type === 'full_attendance_bonus') && entry.workMinutes > 0 && (
                                <span className="text-gray-500 ml-1">
                                  {(entry.workMinutes / 60).toFixed(1)}h
                                </span>
                              )}
                            </span>
                            <span className="flex gap-0.5 ml-1 shrink-0">
                              {entry.hasLate && <span className="w-2 h-2 rounded-full bg-yellow-400" title="지각" />}
                              {entry.hasEarlyLeave && <span className="w-2 h-2 rounded-full bg-orange-400" title="조퇴" />}
                            </span>
                          </div>
                        );
                      })}
                      {dayData.entries.length > 5 && (
                        <div className="text-xs text-gray-500 px-1">
                          +{dayData.entries.length - 5}건
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 범례 */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-gray-100" />
          <span>기본 스케줄</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-blue-100" />
          <span>[대타]</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-100" />
          <span>[추가근무]</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-purple-100" />
          <span>[식대]</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-indigo-100" />
          <span>[주휴수당]</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-amber-100" />
          <span>[만근수당]</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-100" />
          <span>미근무</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-yellow-400" />
          <span>지각</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-orange-400" />
          <span>조퇴</span>
        </div>
      </div>

      {/* 근무자별 일별 상세 다이얼로그 */}
      <Dialog open={!!selectedDay} onOpenChange={() => setSelectedDay(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedDay && format(selectedDay.date, 'M월 d일 (EEE)', { locale: ko })} - {selectedDay?.worker.name}
            </DialogTitle>
          </DialogHeader>
          {selectedDay && (
            <div className="space-y-4">
              {/* 기본 스케줄 정보 */}
              {selectedDay.schedule && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">기본 스케줄</h4>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm">
                    <p>
                      근무시간: {selectedDay.schedule.start_time.slice(0, 5)} - {selectedDay.schedule.end_time.slice(0, 5)}
                    </p>
                  </div>
                </div>
              )}

              {/* 변동사항 목록 */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">변동사항</h4>
                {selectedDay.changes.length === 0 ? (
                  <p className="text-sm text-gray-500">변동사항이 없습니다</p>
                ) : (
                  <div className="space-y-2">
                    {selectedDay.changes.map((change) => (
                      <div
                        key={change.id}
                        className="bg-gray-50 rounded-lg p-3 text-sm flex items-start justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                change.change_type === 'absence'
                                  ? 'destructive'
                                  : change.change_type === 'substitute'
                                  ? 'secondary'
                                  : 'default'
                              }
                            >
                              {CHANGE_TYPE_LABELS[change.change_type]}
                            </Badge>
                          </div>
                          {change.start_time && change.end_time && (
                            <p className="text-gray-600">
                              {change.start_time.slice(0, 5)} - {change.end_time.slice(0, 5)}
                            </p>
                          )}
                          {change.minutes && !change.start_time && (
                            <p className="text-gray-600">{formatMinutesToHoursAndMinutes(change.minutes)}</p>
                          )}
                          {change.note && (
                            <p className="text-gray-500">{change.note}</p>
                          )}
                        </div>
                        {!isMonthConfirmed && (
                          <div className="flex gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(change)}
                            >
                              <Pencil className="h-4 w-4 text-blue-500" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>변동사항을 삭제하시겠습니까?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {CHANGE_TYPE_LABELS[change.change_type]} 기록이 삭제됩니다.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>취소</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteChange(change.id)}
                                    className="bg-red-500 hover:bg-red-600"
                                  >
                                    삭제
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 변동사항 추가 버튼 */}
              {!isMonthConfirmed && (
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={() => {
                      router.push(`/changes/new?workerId=${selectedDay.worker.id}&date=${format(selectedDay.date, 'yyyy-MM-dd')}`);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    변동사항 추가
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 변동사항 수정 다이얼로그 */}
      <Dialog open={!!editingChange} onOpenChange={() => setEditingChange(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              변동사항 수정 - {editingChange && CHANGE_TYPE_LABELS[editingChange.change_type]}
            </DialogTitle>
          </DialogHeader>
          {editingChange && (
            <div className="space-y-4">
              {/* 날짜 선택 */}
              <div className="space-y-2">
                <Label>날짜</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !editWorkDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editWorkDate
                        ? format(editWorkDate, 'yyyy년 M월 d일 (EEE)', { locale: ko })
                        : '날짜 선택'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editWorkDate}
                      onSelect={setEditWorkDate}
                      locale={ko}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* 시간 입력 (미근무, 추가근무, 대타) */}
              {['absence', 'overtime', 'substitute'].includes(editingChange.change_type) && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>시작 시간</Label>
                    <Input
                      type="time"
                      value={editStartTime}
                      onChange={(e) => setEditStartTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>종료 시간</Label>
                    <Input
                      type="time"
                      value={editEndTime}
                      onChange={(e) => setEditEndTime(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* 분 입력 (지각, 조퇴) */}
              {['late', 'early_leave'].includes(editingChange.change_type) && (
                <div className="space-y-2">
                  <Label>시간 (분)</Label>
                  <Input
                    type="number"
                    placeholder="예: 15"
                    value={editMinutes}
                    onChange={(e) => setEditMinutes(e.target.value)}
                  />
                </div>
              )}

              {/* 시간 입력 (식대, 주휴수당) */}
              {['meal_allowance', 'weekly_holiday_pay'].includes(editingChange.change_type) && (
                <div className="space-y-2">
                  <Label>시간 (0.5시간 단위)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="예: 1.5"
                    value={editHours}
                    onChange={(e) => setEditHours(e.target.value)}
                  />
                  <p className="text-xs text-gray-500">
                    예: 0.5 = 30분, 1 = 1시간, 1.5 = 1시간 30분
                  </p>
                </div>
              )}

              {/* 메모 */}
              <div className="space-y-2">
                <Label>메모</Label>
                <Input
                  placeholder="메모 (선택사항)"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                />
              </div>

              {/* 버튼 */}
              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingChange(null)}
                  className="flex-1"
                >
                  취소
                </Button>
                <Button onClick={handleEditSubmit} className="flex-1">
                  저장
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
