import { Store, Worker, ScheduleChange } from '@/lib/supabase/types';
import { MonthlyWorkHours, formatMinutesToHoursAndMinutes } from '@/lib/calculations/workHours';
import { SalaryCalculation, formatMoney } from '@/lib/calculations/salary';

export interface KakaoMessageOptions {
  worker: Worker;
  store: Store;
  year: number;
  month: number;
  salary: SalaryCalculation;
  workHours: MonthlyWorkHours;
}

/**
 * 카카오톡 전송용 급여 안내 메시지 생성
 */
export function generateKakaoMessage(options: KakaoMessageOptions): string {
  const { worker, store, year, month, salary, workHours } = options;

  let message = `[${store.name}] ${year}년 ${month}월 급여 안내\n`;
  message += `━━━━━━━━━━━━━━━\n`;
  message += `${worker.name}님\n\n`;

  // 근무 시간
  message += `▶ 근무시간\n`;
  message += `  기본: ${formatMinutesToHoursAndMinutes(workHours.baseMinutes)}\n`;

  if (workHours.absenceMinutes > 0) {
    message += `  미근무: -${formatMinutesToHoursAndMinutes(workHours.absenceMinutes)}\n`;
  }
  if (workHours.overtimeMinutes > 0) {
    message += `  추가근무: +${formatMinutesToHoursAndMinutes(workHours.overtimeMinutes)}\n`;
  }
  if (workHours.substituteMinutes > 0) {
    message += `  대타근무: +${formatMinutesToHoursAndMinutes(workHours.substituteMinutes)}\n`;
  }
  if (workHours.lateMinutes > 0) {
    message += `  지각: -${formatMinutesToHoursAndMinutes(workHours.lateMinutes)}\n`;
  }
  if (workHours.earlyLeaveMinutes > 0) {
    message += `  조퇴: -${formatMinutesToHoursAndMinutes(workHours.earlyLeaveMinutes)}\n`;
  }

  message += `  총 근무: ${formatMinutesToHoursAndMinutes(workHours.totalMinutes)}\n\n`;

  // 급여 내역
  message += `▶ 급여 내역\n`;
  message += `  시급: ${formatMoney(salary.hourlyWage)}원\n`;
  message += `  기본급: ${formatMoney(salary.baseWage)}원\n`;

  if (salary.mealAllowance > 0) {
    message += `  식대: +${formatMoney(salary.mealAllowance)}원\n`;
  }
  if (salary.weeklyHolidayPay > 0) {
    message += `  주휴수당: +${formatMoney(salary.weeklyHolidayPay)}원\n`;
  }
  if (salary.fullAttendanceBonus > 0) {
    message += `  만근보너스: +${formatMoney(salary.fullAttendanceBonus)}원\n`;
  }

  message += `  ─────────────\n`;
  message += `  세전: ${formatMoney(salary.grossWage)}원\n`;

  if (salary.taxAmount > 0) {
    message += `  세금(3.3%): -${formatMoney(salary.taxAmount)}원\n`;
  }

  message += `\n`;
  message += `▶ 실수령액: ${formatMoney(salary.netWage)}원\n`;
  message += `━━━━━━━━━━━━━━━`;

  return message;
}

/**
 * 클립보드에 텍스트 복사
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}
