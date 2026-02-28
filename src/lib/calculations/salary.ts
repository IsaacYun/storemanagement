import { Store, Worker, ScheduleChange } from '@/lib/supabase/types';
import { MonthlyWorkHours } from './workHours';

export interface SalaryCalculation {
  // 시간 기반
  workMinutes: number;
  hourlyWage: number;
  baseWage: number;

  // 추가 지급
  mealAllowance: number;
  weeklyHolidayPay: number;
  fullAttendanceBonus: number;

  // 정산
  grossWage: number;
  taxRate: number;
  taxAmount: number;
  netWage: number;
}

/**
 * 급여 계산
 *
 * 세전급여 = 기본급 + 식대 + 주휴수당 + 만근보너스
 * 세금 = 세전급여 × 3.3% (적용 시)
 * 실수령 = 세전급여 - 세금
 */
export function calculateSalary(
  workHours: MonthlyWorkHours,
  store: Store,
  worker: Worker,
  changes: ScheduleChange[],
  isFullAttendance: boolean = false
): SalaryCalculation {
  const { totalMinutes } = workHours;
  const hourlyWage = store.hourly_wage;

  // 기본급 계산 (분 → 시간, 반올림)
  const workHoursDecimal = totalMinutes / 60;
  const baseWage = Math.round(workHoursDecimal * hourlyWage);

  // 추가 지급 항목 집계
  const approvedChanges = changes.filter((c) => c.status === 'approved');

  const mealAllowance = approvedChanges
    .filter((c) => c.change_type === 'meal_allowance')
    .reduce((sum, c) => sum + (c.amount || 0), 0);

  const weeklyHolidayPay = approvedChanges
    .filter((c) => c.change_type === 'weekly_holiday_pay')
    .reduce((sum, c) => sum + (c.amount || 0), 0);

  const fullAttendanceBonus = isFullAttendance
    ? store.full_attendance_bonus
    : 0;

  // 세전 급여
  const grossWage =
    baseWage + mealAllowance + weeklyHolidayPay + fullAttendanceBonus;

  // 세금 계산 (3.3% 사업소득세)
  const taxRate = worker.is_tax_applied ? 0.033 : 0;
  const taxAmount = Math.floor(grossWage * taxRate);

  // 실수령액
  const netWage = grossWage - taxAmount;

  return {
    workMinutes: totalMinutes,
    hourlyWage,
    baseWage,
    mealAllowance,
    weeklyHolidayPay,
    fullAttendanceBonus,
    grossWage,
    taxRate,
    taxAmount,
    netWage,
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
