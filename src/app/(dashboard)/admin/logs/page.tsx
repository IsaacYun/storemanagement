'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useStoreSelection } from '@/lib/stores/useStoreSelection';
import { ActivityLog, Worker } from '@/lib/supabase/types';
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
};

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
      if (log.target_table === 'workers' && data) {
        const d = data as Record<string, unknown>;
        return `근무자 "${d.name}" 정보 수정`;
      }
      return '항목 수정';

    default:
      return log.action;
  }
}

export default function LogsPage() {
  const { selectedStoreId } = useStoreSelection();
  const [logs, setLogs] = useState<LogWithWorker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

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
