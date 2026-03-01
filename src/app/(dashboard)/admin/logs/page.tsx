'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useStoreSelection } from '@/lib/stores/useStoreSelection';
import { ActivityLog, Worker, Store } from '@/lib/supabase/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface LogWithWorker extends ActivityLog {
  worker: Worker | null;
}

const ACTION_LABELS: Record<string, string> = {
  'create': '생성',
  'update': '수정',
  'delete': '삭제',
  'login': '로그인',
  'logout': '로그아웃',
  'confirm_settlement': '정산 완료',
  'cancel_settlement': '정산 취소',
};

const TABLE_LABELS: Record<string, string> = {
  'stores': '매장',
  'workers': '근무자',
  'schedules': '스케줄',
  'schedule_changes': '변동사항',
  'monthly_settlements': '월별 정산',
};

const CHANGE_TYPE_LABELS: Record<string, string> = {
  'absence': '미근무',
  'overtime': '추가근무',
  'substitute': '대타',
  'late': '지각',
  'early_leave': '조퇴',
  'meal_allowance': '식대',
  'weekly_holiday_pay': '주휴수당',
  'full_attendance_bonus': '만근수당',
};

// 필드명 한글 변환
const FIELD_LABELS: Record<string, string> = {
  name: '이름',
  phone: '전화번호',
  is_tax_applied: '세금 적용',
  is_active: '활성화',
  hourly_wage: '시급',
  full_attendance_bonus: '만근수당',
  role: '역할',
  day_of_week: '요일',
  start_time: '시작 시간',
  end_time: '종료 시간',
  change_type: '변동 유형',
  minutes: '시간(분)',
  note: '메모',
  status: '상태',
  work_date: '근무일',
};

// 값 변환 (boolean, 역할 등)
function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '없음';
  if (typeof value === 'boolean') return value ? '예' : '아니오';
  if (key === 'role') return value === 'admin' ? '관리자' : '근무자';
  if (key === 'status') {
    if (value === 'approved') return '승인';
    if (value === 'pending') return '대기';
    if (value === 'rejected') return '거절';
  }
  if (key === 'change_type') return CHANGE_TYPE_LABELS[value as string] || String(value);
  if (key === 'day_of_week') {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return days[value as number] + '요일';
  }
  if (key === 'hourly_wage' || key === 'full_attendance_bonus') {
    return Number(value).toLocaleString() + '원';
  }
  return String(value);
}

// before_data와 after_data 비교하여 변경된 필드 추출
function getChangedFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): Array<{ field: string; before: string; after: string }> {
  if (!before || !after) return [];

  const changes: Array<{ field: string; before: string; after: string }> = [];
  const relevantFields = Object.keys(FIELD_LABELS);

  for (const key of relevantFields) {
    const beforeVal = before[key];
    const afterVal = after[key];

    // 값이 다른 경우에만 추가
    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      changes.push({
        field: FIELD_LABELS[key] || key,
        before: formatValue(key, beforeVal),
        after: formatValue(key, afterVal),
      });
    }
  }

  return changes;
}

// 활동 로그를 읽기 쉬운 문장으로 변환
function formatLogDescription(log: LogWithWorker): string {
  const data = log.after_data || log.before_data;

  switch (log.action) {
    case 'confirm_settlement':
      if (data && typeof data === 'object') {
        const d = data as Record<string, unknown>;
        return `${d.year}년 ${d.month}월 정산 완료 (${d.workers}명)`;
      }
      return '정산 완료';

    case 'cancel_settlement':
      if (data && typeof data === 'object') {
        const d = data as Record<string, unknown>;
        return `${d.year}년 ${d.month}월 정산 취소`;
      }
      return '정산 취소';

    case 'delete':
      if (log.target_table === 'schedule_changes' && data) {
        const d = data as Record<string, unknown>;
        const changeType = CHANGE_TYPE_LABELS[d.change_type as string] || d.change_type;
        const workerName = d.worker_name || (d.worker as Record<string, unknown>)?.name;
        if (workerName) {
          return `${d.work_date} ${workerName}님 ${changeType} 삭제`;
        }
        return `${d.work_date} ${changeType} 삭제`;
      }
      if (log.target_table === 'workers' && data) {
        const d = data as Record<string, unknown>;
        return `근무자 "${d.name}" 삭제`;
      }
      return '항목 삭제';

    case 'create':
      if (log.target_table === 'schedule_changes' && data) {
        const d = data as Record<string, unknown>;
        const changeType = CHANGE_TYPE_LABELS[d.change_type as string] || d.change_type;
        const workerName = d.worker_name || (d.worker as Record<string, unknown>)?.name;
        if (workerName) {
          return `${d.work_date} ${workerName}님 ${changeType} 추가`;
        }
        return `${d.work_date} ${changeType} 추가`;
      }
      if (log.target_table === 'workers' && data) {
        const d = data as Record<string, unknown>;
        return `근무자 "${d.name}" 등록`;
      }
      return '항목 생성';

    case 'update':
      const changes = getChangedFields(
        log.before_data as Record<string, unknown> | null,
        log.after_data as Record<string, unknown> | null
      );

      if (log.target_table === 'workers' && data) {
        const d = data as Record<string, unknown>;
        if (changes.length > 0) {
          const changeDesc = changes
            .map((c) => `${c.field}: ${c.before} → ${c.after}`)
            .join(', ');
          return `근무자 "${d.name}" 수정: ${changeDesc}`;
        }
        return `근무자 "${d.name}" 정보 수정`;
      }
      if (log.target_table === 'schedules' && changes.length > 0) {
        const workerName = (log.before_data as Record<string, unknown>)?.worker_name ||
                          (log.after_data as Record<string, unknown>)?.worker_name;
        const changeDesc = changes
          .map((c) => `${c.field}: ${c.before} → ${c.after}`)
          .join(', ');
        return workerName
          ? `${workerName}님 스케줄 수정: ${changeDesc}`
          : `스케줄 수정: ${changeDesc}`;
      }
      if (log.target_table === 'schedule_changes' && changes.length > 0) {
        const workerName = (log.before_data as Record<string, unknown>)?.worker_name ||
                          (log.after_data as Record<string, unknown>)?.worker_name;
        const changeDesc = changes
          .map((c) => `${c.field}: ${c.before} → ${c.after}`)
          .join(', ');
        return workerName
          ? `${workerName}님 변동사항 수정: ${changeDesc}`
          : `변동사항 수정: ${changeDesc}`;
      }
      if (changes.length > 0) {
        const changeDesc = changes
          .map((c) => `${c.field}: ${c.before} → ${c.after}`)
          .join(', ');
        return `항목 수정: ${changeDesc}`;
      }
      return '항목 수정';

    default:
      return log.action;
  }
}

export default function LogsPage() {
  const { selectedStoreId } = useStoreSelection();
  const [logs, setLogs] = useState<LogWithWorker[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  // 매장 목록 조회
  useEffect(() => {
    const fetchStores = async () => {
      const supabase = createClient();
      const { data } = await supabase.from('stores').select('*');
      setStores(data || []);
    };
    fetchStores();
  }, []);

  useEffect(() => {
    const fetchLogs = async () => {
      setIsLoading(true);
      const supabase = createClient();

      // 로그 총 개수 조회
      const { count } = await supabase
        .from('activity_logs')
        .select('*', { count: 'exact', head: true });

      setTotalCount(count || 0);

      // 로그 조회 (페이지네이션)
      const { data } = await supabase
        .from('activity_logs')
        .select('*, worker:workers(*)')
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      setLogs((data as LogWithWorker[]) || []);
      setIsLoading(false);
    };

    fetchLogs();
  }, [page]);

  // store_id로 매장명 찾기
  const getStoreName = (log: LogWithWorker): string => {
    const data = log.after_data || log.before_data;
    if (!data || typeof data !== 'object') return '-';

    const d = data as Record<string, unknown>;
    const storeId = d.store_id || d.work_store_id;
    if (!storeId) return '-';

    const store = stores.find(s => s.id === storeId);
    return store?.name || '-';
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  const getActionColor = (action: string) => {
    if (action.includes('delete') || action.includes('cancel')) return 'destructive';
    if (action.includes('create') || action.includes('confirm')) return 'default';
    if (action.includes('update')) return 'secondary';
    return 'outline';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">활동 로그</h1>
        <span className="text-sm text-gray-500">총 {totalCount}건</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">최근 활동 내역</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">로딩 중...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              활동 로그가 없습니다
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>시간</TableHead>
                      <TableHead>매장</TableHead>
                      <TableHead>사용자</TableHead>
                      <TableHead>행동</TableHead>
                      <TableHead>대상</TableHead>
                      <TableHead>상세</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(log.created_at), 'M/d HH:mm', { locale: ko })}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-gray-600">
                          {getStoreName(log)}
                        </TableCell>
                        <TableCell>{log.worker?.name || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={getActionColor(log.action)}>
                            {ACTION_LABELS[log.action] || log.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.target_table
                            ? TABLE_LABELS[log.target_table] || log.target_table
                            : '-'}
                        </TableCell>
                        <TableCell className="max-w-[300px] text-gray-600 text-sm">
                          {formatLogDescription(log)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 페이지네이션 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-gray-600">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="text-sm text-gray-500">
        <p>* 활동 로그는 관리자만 볼 수 있습니다</p>
        <p>* 최근 활동부터 표시됩니다</p>
      </div>
    </div>
  );
}
