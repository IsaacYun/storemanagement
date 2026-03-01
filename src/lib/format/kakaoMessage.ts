import { Store, Worker, ScheduleChange, CHANGE_TYPE_LABELS } from '@/lib/supabase/types';
import { MonthlyWorkHours, formatMinutesToHoursAndMinutes } from '@/lib/calculations/workHours';
import { SalaryCalculation, formatMoney } from '@/lib/calculations/salary';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

export interface KakaoMessageOptions {
  worker: Worker;
  store: Store;
  year: number;
  month: number;
  salary: SalaryCalculation;
  workHours: MonthlyWorkHours;
  changes?: ScheduleChange[];
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
  if (workHours.mealAllowanceMinutes > 0) {
    message += `  식대: +${formatMinutesToHoursAndMinutes(workHours.mealAllowanceMinutes)}\n`;
  }
  if (workHours.weeklyHolidayPayMinutes > 0) {
    message += `  주휴수당: +${formatMinutesToHoursAndMinutes(workHours.weeklyHolidayPayMinutes)}\n`;
  }
  if (workHours.fullAttendanceBonusMinutes > 0) {
    message += `  만근수당: +${formatMinutesToHoursAndMinutes(workHours.fullAttendanceBonusMinutes)}\n`;
  }

  message += `  총 근무: ${formatMinutesToHoursAndMinutes(workHours.totalMinutesRounded)}`;
  if (workHours.hasRounding) message += ` (0.5시간 단위 올림 적용)`;
  message += `\n\n`;

  // 급여 내역
  message += `▶ 급여 내역\n`;
  message += `  시급: ${formatMoney(salary.hourlyWage)}원\n`;
  message += `  기본급: ${formatMoney(salary.baseWage)}원\n`;
  message += `  ─────────────\n`;
  message += `  세전: ${formatMoney(salary.grossWage)}원\n`;

  if (salary.taxAmount > 0) {
    message += `  세금(3.3%): -${formatMoney(salary.taxAmount)}원\n`;
  }

  message += `\n`;
  message += `▶ 실수령액: ${formatMoney(salary.netWage)}원\n`;

  // 변동사항 상세 목록 추가
  if (options.changes && options.changes.length > 0) {
    message += `\n▶ 변동사항 내역\n`;
    options.changes.forEach((change) => {
      const dateStr = format(new Date(change.work_date), 'M/d(EEE)', { locale: ko });
      const typeLabel = CHANGE_TYPE_LABELS[change.change_type];

      let detail = '';
      if (change.start_time && change.end_time) {
        detail = `${change.start_time.slice(0, 5)}-${change.end_time.slice(0, 5)}`;
      } else if (change.minutes) {
        detail = formatMinutesToHoursAndMinutes(change.minutes);
      }

      message += `  ${dateStr} ${typeLabel}`;
      if (detail) message += ` (${detail})`;
      if (change.note) message += ` - ${change.note}`;
      message += `\n`;
    });
  }

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
