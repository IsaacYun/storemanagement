-- =====================================================
-- Migration 003: schedules 테이블에 적용 종료일 추가
-- =====================================================

-- 1. effective_to 컬럼 추가
ALTER TABLE schedules
ADD COLUMN IF NOT EXISTS effective_to DATE DEFAULT NULL;

COMMENT ON COLUMN schedules.effective_to IS '스케줄 적용 종료일 (NULL이면 계속 유효)';

-- 2. effective_to 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_schedules_effective_to ON schedules(effective_to);
