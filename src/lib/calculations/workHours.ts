import { Schedule, ScheduleChange } from '@/lib/supabase/types';
import { getDaysInMonth, getDay, format } from 'date-fns';

export interface MonthlyWorkHours {
  baseMinutes: number;
  absenceMinutes: number;
  overtimeMinutes: number;
  substituteMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  totalMinutes: number;
}

/**
 * 시작 시간과 종료 시간 사이의 분 수 계산
 */
export function calculateMinutesBetween(
  startTime: string,
  endTime: string
): number {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  return endMinutes - startMinutes;
}

/**
 * 특정 월의 기본 스케줄 기반 총 근무 분 계산
 */
export function calculateBaseMinutesForMonth(
  schedules: Schedule[],
  year: number,
  month: number
): number {
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  let totalMinutes = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = getDay(date); // 0: 일요일

    const schedule = schedules.find(
      (s) => s.day_of_week === dayOfWeek && s.is_active
    );

    if (schedule) {
      totalMinutes += calculateMinutesBetween(
        schedule.start_time,
        schedule.end_time
      );
    }
  }

  return totalMinutes;
}

/**
 * 변동사항 유형별 분 합계
 */
function sumMinutesByType(
  changes: ScheduleChange[],
  type: ScheduleChange['change_type']
): number {
  return changes
    .filter((c) => c.change_type === type && c.status === 'approved')
    .reduce((sum, c) => sum + (c.minutes || 0), 0);
}

/**
 * 월별 근무시간 계산 (기본 스케줄 + 변동사항 반영)
 */
export function calculateMonthlyWorkHours(
  schedules: Schedule[],
  changes: ScheduleChange[],
  year: number,
  month: number
): MonthlyWorkHours {
  // 기본 스케줄 근무시간
  const baseMinutes = calculateBaseMinutesForMonth(schedules, year, month);

  // 해당 월의 변동사항만 필터링
  const monthChanges = changes.filter((c) => {
    const date = new Date(c.work_date);
    return date.getFullYear() === year && date.getMonth() + 1 === month;
  });

  // 변동사항 유형별 집계
  const absenceMinutes = sumMinutesByType(monthChanges, 'absence');
  const overtimeMinutes = sumMinutesByType(monthChanges, 'overtime');
  const substituteMinutes = sumMinutesByType(monthChanges, 'substitute');
  const lateMinutes = sumMinutesByType(monthChanges, 'late');
  const earlyLeaveMinutes = sumMinutesByType(monthChanges, 'early_leave');

  // 총 근무시간 계산
  const totalMinutes = Math.max(
    0,
    baseMinutes -
      absenceMinutes +
      overtimeMinutes +
      substituteMinutes -
      lateMinutes -
      earlyLeaveMinutes
  );

  return {
    baseMinutes,
    absenceMinutes,
    overtimeMinutes,
    substituteMinutes,
    lateMinutes,
    earlyLeaveMinutes,
    totalMinutes,
  };
}

/**
 * 특정 날짜의 기본 스케줄 근무 분 계산
 */
export function getScheduleMinutesForDate(
  schedules: Schedule[],
  date: Date
): number {
  const dayOfWeek = getDay(date);
  const schedule = schedules.find(
    (s) => s.day_of_week === dayOfWeek && s.is_active
  );

  if (!schedule) return 0;

  return calculateMinutesBetween(schedule.start_time, schedule.end_time);
}

/**
 * 분을 시간:분 형식으로 변환
 */
export function formatMinutesToHoursAndMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (mins === 0) {
    return `${hours}시간`;
  }
  return `${hours}시간 ${mins}분`;
}

/**
 * 특정 월의 근무 날짜 목록 생성
 */
export function getWorkDatesInMonth(
  schedules: Schedule[],
  year: number,
  month: number
): string[] {
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const workDates: string[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = getDay(date);

    const hasSchedule = schedules.some(
      (s) => s.day_of_week === dayOfWeek && s.is_active
    );

    if (hasSchedule) {
      workDates.push(format(date, 'yyyy-MM-dd'));
    }
  }

  return workDates;
}
