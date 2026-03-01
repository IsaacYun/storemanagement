import { Schedule, ScheduleChange } from '@/lib/supabase/types';
import { getDaysInMonth, getDay, format, parseISO, isAfter, isBefore, isEqual } from 'date-fns';

export interface MonthlyWorkHours {
  baseMinutes: number;
  absenceMinutes: number;
  overtimeMinutes: number;
  overtimeMinutesRounded: number; // 0.5시간 단위 올림
  substituteMinutes: number;
  substituteMinutesRounded: number; // 0.5시간 단위 올림
  lateMinutes: number;
  earlyLeaveMinutes: number;
  totalMinutes: number;
  totalMinutesRounded: number; // 올림 적용된 총 근무시간
  hasRounding: boolean; // 올림이 적용되었는지 여부
}

/**
 * 분을 0.5시간 단위로 올림
 * 예: 31분 → 60분 (1시간), 61분 → 90분 (1.5시간)
 */
export function roundUpToHalfHour(minutes: number): number {
  if (minutes <= 0) return 0;
  const halfHours = Math.ceil(minutes / 30);
  return halfHours * 30;
}

/**
 * 시작 시간과 종료 시간 사이의 분 수 계산
 * 자정을 넘어가는 경우 (예: 18:00-00:00) 처리
 */
export function calculateMinutesBetween(
  startTime: string,
  endTime: string
): number {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  const startMinutes = startHour * 60 + startMin;
  let endMinutes = endHour * 60 + endMin;

  // 종료 시간이 시작 시간보다 작거나 같으면 자정을 넘긴 것으로 처리
  // 예: 18:00 ~ 00:00 → 18:00 ~ 24:00 (6시간)
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60; // 1440분 (24시간) 추가
  }

  return endMinutes - startMinutes;
}

/**
 * 특정 날짜에 적용 가능한 스케줄 찾기
 * effective_from과 effective_to를 고려하여 유효한 스케줄 반환
 */
function findEffectiveSchedule(
  schedules: Schedule[],
  date: Date,
  dayOfWeek: number
): Schedule | undefined {
  const dateStr = format(date, 'yyyy-MM-dd');

  // 해당 요일의 활성 스케줄들 필터링
  const daySchedules = schedules.filter(
    (s) => s.day_of_week === dayOfWeek && s.is_active
  );

  // effective_from 기준으로 정렬 (최신순, null은 가장 오래된 것으로)
  const sorted = daySchedules.sort((a, b) => {
    if (!a.effective_from && !b.effective_from) return 0;
    if (!a.effective_from) return 1; // null은 뒤로
    if (!b.effective_from) return -1;
    return b.effective_from.localeCompare(a.effective_from); // 최신순
  });

  // 해당 날짜에 적용 가능한 스케줄 찾기
  for (const schedule of sorted) {
    // effective_from 체크
    const afterStart = !schedule.effective_from || dateStr >= schedule.effective_from;
    // effective_to 체크 (null이면 종료일 없음 = 계속 유효)
    const beforeEnd = !schedule.effective_to || dateStr <= schedule.effective_to;

    if (afterStart && beforeEnd) {
      return schedule;
    }
  }

  return undefined;
}

/**
 * 특정 월의 기본 스케줄 기반 총 근무 분 계산
 * effective_from을 고려하여 날짜별로 적용할 스케줄 결정
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

    const schedule = findEffectiveSchedule(schedules, date, dayOfWeek);

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

  // 추가근무/대타는 개별 올림 없이 원본 값 그대로 (표시용)
  const overtimeMinutesRounded = overtimeMinutes;
  const substituteMinutesRounded = substituteMinutes;

  // 총 근무시간 계산 (원래 값)
  const totalMinutes = Math.max(
    0,
    baseMinutes -
      absenceMinutes +
      overtimeMinutes +
      substituteMinutes -
      lateMinutes -
      earlyLeaveMinutes
  );

  // 추가근무+대타 합산에 대해서만 0.5시간 단위 올림 적용
  const extraMinutes = overtimeMinutes + substituteMinutes;
  const extraMinutesRounded = roundUpToHalfHour(extraMinutes);

  // 총 근무시간 계산 (추가근무+대타 합산에만 올림 적용)
  const totalMinutesRounded = Math.max(
    0,
    baseMinutes -
      absenceMinutes +
      extraMinutesRounded -
      lateMinutes -
      earlyLeaveMinutes
  );

  // 올림이 적용되었는지 확인
  const hasRounding = extraMinutesRounded !== extraMinutes;

  return {
    baseMinutes,
    absenceMinutes,
    overtimeMinutes,
    overtimeMinutesRounded,
    substituteMinutes,
    substituteMinutesRounded,
    lateMinutes,
    earlyLeaveMinutes,
    totalMinutes,
    totalMinutesRounded,
    hasRounding,
  };
}

/**
 * 특정 날짜의 기본 스케줄 근무 분 계산
 * effective_from을 고려
 */
export function getScheduleMinutesForDate(
  schedules: Schedule[],
  date: Date
): number {
  const dayOfWeek = getDay(date);
  const schedule = findEffectiveSchedule(schedules, date, dayOfWeek);

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
 * effective_from을 고려하여 해당 날짜에 유효한 스케줄이 있는지 확인
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

    const schedule = findEffectiveSchedule(schedules, date, dayOfWeek);

    if (schedule) {
      workDates.push(format(date, 'yyyy-MM-dd'));
    }
  }

  return workDates;
}
