-- Migration: is_tax_applied (boolean) -> tax_type (text)
-- 세금 유형 확장: 미적용, 3.3% 소득세, 10% 부가세

-- 1. 새 컬럼 추가
ALTER TABLE workers ADD COLUMN tax_type TEXT DEFAULT 'none';

-- 2. 기존 데이터 마이그레이션
-- is_tax_applied가 true면 'income_3.3', false면 'none'으로 변환
UPDATE workers SET tax_type = CASE
    WHEN is_tax_applied = true THEN 'income_3.3'
    ELSE 'none'
END;

-- 3. 제약조건 추가 (유효한 값만 허용)
ALTER TABLE workers ADD CONSTRAINT workers_tax_type_check
    CHECK (tax_type IN ('none', 'income_3.3', 'vat_10'));

-- 4. 기존 컬럼 삭제 (선택사항 - 백업 후 실행 권장)
-- ALTER TABLE workers DROP COLUMN is_tax_applied;

-- 5. 코멘트 추가
COMMENT ON COLUMN workers.tax_type IS '세금 유형: none(미적용), income_3.3(3.3% 소득세), vat_10(10% 부가세)';
