// 데이터베이스 테이블 타입 정의

export type ChangeType =
  | 'absence'           // 미근무
  | 'overtime'          // 추가근무
  | 'substitute'        // 대타
  | 'late'              // 지각
  | 'early_leave'       // 조퇴
  | 'meal_allowance'    // 식대
  | 'weekly_holiday_pay'; // 주휴수당

export type UserRole = 'admin' | 'worker';
export type SettlementStatus = 'draft' | 'confirmed' | 'paid';
export type ChangeStatus = 'pending' | 'approved' | 'rejected';

// 매장
export interface Store {
  id: string;
  name: string;
  hourly_wage: number;
  full_attendance_bonus: number;
  opening_time: string;
  closing_time: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Relations
  wage_history?: StoreWageHistory[];
}

// 매장 시급 변경 이력
export interface StoreWageHistory {
  id: string;
  store_id: string;
  hourly_wage: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

// 근무자
export interface Worker {
  id: string;
  user_id: string | null;
  store_id: string;
  name: string;
  phone: string | null;
  is_tax_applied: boolean;
  is_active: boolean;
  resigned_at: string | null; // 퇴사일 (null이면 재직 중)
  role: UserRole;
  created_at: string;
  updated_at: string;
  // Relations
  store?: Store;
}

// 기본 스케줄 (주간 반복)
export interface Schedule {
  id: string;
  worker_id: string;
  store_id: string;
  day_of_week: number; // 0: 일, 1: 월, ..., 6: 토
  start_time: string;
  end_time: string;
  effective_from: string | null; // 적용 시작일 (null이면 처음부터)
  effective_to: string | null; // 적용 종료일 (null이면 계속 유효)
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Relations
  worker?: Worker;
  store?: Store;
}

// 변동사항
export interface ScheduleChange {
  id: string;
  worker_id: string;
  work_date: string;
  change_type: ChangeType;
  work_store_id: string | null;
  original_worker_id: string | null;
  start_time: string | null;
  end_time: string | null;
  minutes: number | null;
  amount: number;
  note: string | null;
  created_by: string | null;
  status: ChangeStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  worker?: Worker;
  work_store?: Store;
  original_worker?: Worker;
}

// 월별 정산
export interface MonthlySettlement {
  id: string;
  worker_id: string;
  store_id: string;
  year: number;
  month: number;
  base_work_minutes: number;
  absence_minutes: number;
  overtime_minutes: number;
  substitute_minutes: number;
  late_minutes: number;
  early_leave_minutes: number;
  meal_allowance: number;
  weekly_holiday_pay: number;
  full_attendance_bonus: number;
  gross_wage: number;
  tax_amount: number;
  net_wage: number;
  status: SettlementStatus;
  confirmed_at: string | null;
  confirmed_by: string | null;
  kakao_message: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  worker?: Worker;
  store?: Store;
}

// 활동 로그
export interface ActivityLog {
  id: string;
  user_id: string | null;
  worker_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// 요일 라벨
export const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

// 변동사항 타입 라벨
export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  absence: '미근무',
  overtime: '추가근무',
  substitute: '대타',
  late: '지각',
  early_leave: '조퇴',
  meal_allowance: '식대',
  weekly_holiday_pay: '주휴수당',
};

// 변동사항 타입 색상 (Badge 용)
export const CHANGE_TYPE_COLORS: Record<ChangeType, string> = {
  absence: 'destructive',
  overtime: 'default',
  substitute: 'secondary',
  late: 'outline',
  early_leave: 'outline',
  meal_allowance: 'default',
  weekly_holiday_pay: 'default',
};
