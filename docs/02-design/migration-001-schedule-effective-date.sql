-- =====================================================
-- Migration 001: schedules 테이블에 적용 시작일 추가
-- =====================================================
-- 목적: 스케줄 변경 시 특정 날짜부터 적용되도록 함
-- (이전 날짜의 근무 기록에 영향 없음)
-- =====================================================

-- 1. effective_from 컬럼 추가
ALTER TABLE schedules
ADD COLUMN effective_from DATE DEFAULT NULL;

COMMENT ON COLUMN schedules.effective_from IS '스케줄 적용 시작일 (NULL이면 처음부터)';

-- 2. 기존 UNIQUE 제약조건 제거 및 새 제약조건 추가
-- 같은 요일에 여러 스케줄이 있을 수 있음 (기간이 다르면)
ALTER TABLE schedules
DROP CONSTRAINT IF EXISTS schedules_worker_id_day_of_week_key;

-- effective_from이 같으면 같은 스케줄로 간주
ALTER TABLE schedules
ADD CONSTRAINT schedules_worker_day_effective_unique
UNIQUE(worker_id, day_of_week, effective_from);

-- 3. effective_from 인덱스 추가 (조회 성능)
CREATE INDEX idx_schedules_effective_from ON schedules(effective_from);
