'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useStoreSelection } from '@/lib/stores/useStoreSelection';
import { Schedule, ScheduleChange, Worker, CHANGE_TYPE_LABELS } from '@/lib/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DayData {
  date: Date;
  workers: Array<{
    worker: Worker;
    schedule: Schedule | null;
    changes: ScheduleChange[];
  }>;
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

export default function CalendarPage() {
  const router = useRouter();
  const { selectedStoreId } = useStoreSelection();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [changes, setChanges] = useState<ScheduleChange[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  useEffect(() => {
    if (!selectedStoreId) return;

    const fetchData = async () => {
      setIsLoading(true);
      const supabase = createClient();

      const monthStart = format(startOfMonth(currentDate), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(currentDate), 'yyyy-MM-dd');

      // 먼저 근무자와 스케줄 조회
      const [workersRes, schedulesRes] = await Promise.all([
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
      ]);

      // 변동사항은 매장 기준으로 조회
      const changesRes = await supabase
        .from('schedule_changes')
        .select('*')
        .eq('work_store_id', selectedStoreId)
        .gte('work_date', monthStart)
        .lte('work_date', monthEnd);

      setWorkers(workersRes.data || []);
      setSchedules(schedulesRes.data || []);
      setChanges(changesRes.data || []);
      setIsLoading(false);
    };

    fetchData();
  }, [selectedStoreId, currentDate]);

  const calendarDays = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  });

  const firstDayOfWeek = getDay(startOfMonth(currentDate));
  const paddingDays = Array(firstDayOfWeek).fill(null);

  const getDayData = (date: Date): DayData => {
    const dayOfWeek = getDay(date);
    const dateStr = format(date, 'yyyy-MM-dd');

    const dayWorkers = workers.map((worker) => {
      const schedule = schedules.find(
        (s) => s.worker_id === worker.id && s.day_of_week === dayOfWeek
      );
      const workerChanges = changes.filter(
        (c) => c.worker_id === worker.id && c.work_date === dateStr
      );

      return { worker, schedule: schedule || null, changes: workerChanges };
    });

    return { date, workers: dayWorkers.filter((w) => w.schedule || w.changes.length > 0) };
  };

  const getChangeColor = (type: ScheduleChange['change_type']) => {
    switch (type) {
      case 'absence':
        return 'bg-red-100 text-red-800';
      case 'substitute':
        return 'bg-blue-100 text-blue-800';
      case 'overtime':
        return 'bg-green-100 text-green-800';
      case 'late':
      case 'early_leave':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold min-w-[140px] text-center">
            {format(currentDate, 'yyyy년 M월', { locale: ko })}
          </h1>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentDate(new Date())}
          >
            오늘
          </Button>
        </div>
        <Button onClick={() => router.push('/changes/new')}>
          <Plus className="h-4 w-4 mr-2" />
          변동사항 입력
        </Button>
      </div>

      {/* 달력 */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">로딩 중...</div>
          ) : (
            <div className="grid grid-cols-7">
              {/* 요일 헤더 */}
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

              {/* 빈 칸 (월 시작 전) */}
              {paddingDays.map((_, i) => (
                <div key={`pad-${i}`} className="min-h-[100px] border-b border-r bg-gray-50" />
              ))}

              {/* 날짜 */}
              {calendarDays.map((date) => {
                const dayData = getDayData(date);
                const dayOfWeek = getDay(date);

                return (
                  <div
                    key={date.toISOString()}
                    className={cn(
                      'min-h-[100px] border-b border-r p-1',
                      !isSameMonth(date, currentDate) && 'bg-gray-50',
                      isToday(date) && 'bg-blue-50'
                    )}
                  >
                    <div
                      className={cn(
                        'text-sm font-medium mb-1',
                        dayOfWeek === 0 && 'text-red-500',
                        dayOfWeek === 6 && 'text-blue-500'
                      )}
                    >
                      {format(date, 'd')}
                    </div>
                    <div className="space-y-0.5">
                      {dayData.workers.slice(0, 3).map(({ worker, schedule, changes }) => {
                        const hasAbsence = changes.some((c) => c.change_type === 'absence');

                        return (
                          <div
                            key={worker.id}
                            className={cn(
                              'text-xs px-1 py-0.5 rounded truncate',
                              hasAbsence
                                ? 'bg-red-100 text-red-800 line-through'
                                : 'bg-gray-100'
                            )}
                          >
                            {worker.name}
                            {changes.map((c) => (
                              <Badge
                                key={c.id}
                                variant="outline"
                                className={cn('ml-1 text-[10px] px-1 py-0', getChangeColor(c.change_type))}
                              >
                                {CHANGE_TYPE_LABELS[c.change_type]}
                              </Badge>
                            ))}
                          </div>
                        );
                      })}
                      {dayData.workers.length > 3 && (
                        <div className="text-xs text-gray-500 px-1">
                          +{dayData.workers.length - 3}명
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
          <div className="w-3 h-3 rounded bg-red-100" />
          <span>미근무</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-blue-100" />
          <span>대타</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-100" />
          <span>추가근무</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-yellow-100" />
          <span>지각/조퇴</span>
        </div>
      </div>
    </div>
  );
}
