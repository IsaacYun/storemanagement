import { Store, Worker, ScheduleChange } from '@/lib/supabase/types';
import { MonthlyWorkHours } from './workHours';

export interface SalaryCalculation {
  // 시간 기반
  workMinutes: number;
  workMinutesRounded: number;
  hourlyWage: number;
  baseWage: number;

  // 추가 지급
  mealAllowanceHours: number; // 식대 시간
  mealAllowanceWage: number; // 식대 금액 (시급 * 시간)
  weeklyHolidayPayHours: number; // 주휴수당 시간
  weeklyHolidayPayWage: number; // 주휴수당 금액
  fullAttendanceBonusHours: number; // 만근수당 시간
  fullAttendanceBonus: number; // 만근수당 금액

  // 정산
  grossWage: number;
  taxRate: number;
  taxAmount: number;
  netWage: number;

  // 올림 정보
  hasRounding: boolean;
}

/**
 * 급여 계산
 *
 * 세전급여 = 기본급 + 식대 + 주휴수당 + 만근보너스
 * 세금 = 세전급여 × 3.3% (적용 시)
 * 실수령 = 세전급여 - 세금
 *
 * 참고: 추가근무/대타는 0.5시간 단위로 올림 처리됨
 */
export function calculateSalary(
  workHours: MonthlyWorkHours,
  store: Store,
  worker: Worker,
  changes: ScheduleChange[],
  isFullAttendance: boolean = false
): SalaryCalculation {
  const { totalMinutesRounded, hasRounding } = workHours;
  const hourlyWage = store.hourly_wage;

  // 기본급 계산 (올림 적용된 시간 기준)
  // totalMinutesRounded에 이미 식대, 주휴수당, 만근수당 시간이 포함되어 있음
  const workHoursDecimal = totalMinutesRounded / 60;
  const baseWage = Math.round(workHoursDecimal * hourlyWage);

  // 추가 지급 항목 집계 (표시용으로만 사용, 급여 계산에는 미반영 - 이미 totalMinutesRounded에 포함)
  const approvedChanges = changes.filter((c) => c.status === 'approved');

  // 식대: 시간(분) 기준으로 계산 (표시용)
  const mealAllowanceMinutes = approvedChanges
    .filter((c) => c.change_type === 'meal_allowance')
    .reduce((sum, c) => sum + (c.minutes || 0), 0);
  const mealAllowanceHours = mealAllowanceMinutes / 60;
  const mealAllowanceWage = Math.round(mealAllowanceHours * hourlyWage);

  // 주휴수당: 시간(분) 기준으로 계산 (표시용)
  const weeklyHolidayPayMinutes = approvedChanges
    .filter((c) => c.change_type === 'weekly_holiday_pay')
    .reduce((sum, c) => sum + (c.minutes || 0), 0);
  const weeklyHolidayPayHours = weeklyHolidayPayMinutes / 60;
  const weeklyHolidayPayWage = Math.round(weeklyHolidayPayHours * hourlyWage);

  // 만근수당: 시간(분) 기준으로 계산 (표시용)
  const fullAttendanceBonusMinutes = approvedChanges
    .filter((c) => c.change_type === 'full_attendance_bonus')
    .reduce((sum, c) => sum + (c.minutes || 0), 0);
  const fullAttendanceBonusHours = fullAttendanceBonusMinutes / 60;
  const fullAttendanceBonus = fullAttendanceBonusMinutes > 0
    ? Math.round(fullAttendanceBonusHours * hourlyWage)
    : (isFullAttendance ? store.full_attendance_bonus : 0);

  // 세전 급여 (baseWage에 이미 모든 항목이 시간 기준으로 포함됨)
  const grossWage = baseWage;

  // 세금 계산 (3.3% 사업소득세)
  const taxRate = worker.is_tax_applied ? 0.033 : 0;
  const taxAmount = Math.floor(grossWage * taxRate);

  // 실수령액
  const netWage = grossWage - taxAmount;

  return {
    workMinutes: workHours.totalMinutes,
    workMinutesRounded: totalMinutesRounded,
    hourlyWage,
    baseWage,
    mealAllowanceHours,
    mealAllowanceWage,
    weeklyHolidayPayHours,
    weeklyHolidayPayWage,
    fullAttendanceBonusHours,
    fullAttendanceBonus,
    grossWage,
    taxRate,
    taxAmount,
    netWage,
    hasRounding,
  };
}

/**
 * 만근 여부 확인
 * 미근무(absence)가 없으면 만근
 */
export function checkFullAttendance(changes: ScheduleChange[]): boolean {
  const hasAbsence = changes.some(
    (c) => c.change_type === 'absence' && c.status === 'approved'
  );
  return !hasAbsence;
}

/**
 * 금액 포맷 (원화)
 */
export function formatMoney(amount: number): string {
  return amount.toLocaleString('ko-KR');
}
