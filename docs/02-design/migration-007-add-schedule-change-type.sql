-- Migration: Add 'schedule_change' to change_type enum
-- 기존 스케줄의 시간 변경을 위한 새 변동사항 유형 추가

ALTER TYPE change_type ADD VALUE 'schedule_change';

-- 코멘트 업데이트
COMMENT ON TYPE change_type IS 'absence: 결근, overtime: 추가근무, substitute: 대타, late: 지각, early_leave: 조퇴, meal_allowance: 식대, weekly_holiday_pay: 주휴수당, schedule_change: 시간변경';
