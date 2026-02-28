'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useStoreSelection } from '@/lib/stores/useStoreSelection';
import { ScheduleChange, Worker, CHANGE_TYPE_LABELS } from '@/lib/supabase/types';
import { Button } from '@/components/ui/button';
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
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChangeWithWorker extends ScheduleChange {
  worker: Worker;
}

export default function ChangesPage() {
  const router = useRouter();
  const { selectedStoreId } = useStoreSelection();
  const [changes, setChanges] = useState<ChangeWithWorker[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!selectedStoreId) return;

    const fetchChanges = async () => {
      setIsLoading(true);
      const supabase = createClient();

      const now = new Date();
      const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

      const { data } = await supabase
        .from('schedule_changes')
        .select('*, worker:workers(*)')
        .eq('work_store_id', selectedStoreId)
        .gte('work_date', monthStart)
        .lte('work_date', monthEnd)
        .order('work_date', { ascending: false });

      setChanges((data as ChangeWithWorker[]) || []);
      setIsLoading(false);
    };

    fetchChanges();
  }, [selectedStoreId]);

  const getChangeColor = (type: ScheduleChange['change_type']) => {
    switch (type) {
      case 'absence':
        return 'destructive';
      case 'substitute':
        return 'secondary';
      case 'overtime':
        return 'default';
      default:
        return 'outline';
    }
  };

  if (!selectedStoreId) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-500">
          매장을 선택해주세요
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">변동사항 목록</h1>
        <Button onClick={() => router.push('/changes/new')}>
          <Plus className="h-4 w-4 mr-2" />
          변동사항 입력
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {format(new Date(), 'yyyy년 M월', { locale: ko })} 변동사항
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">로딩 중...</div>
          ) : changes.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              이번 달 변동사항이 없습니다
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>근무자</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>시간</TableHead>
                  <TableHead>메모</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {changes.map((change) => (
                  <TableRow key={change.id}>
                    <TableCell>
                      {format(new Date(change.work_date), 'M/d (EEE)', {
                        locale: ko,
                      })}
                    </TableCell>
                    <TableCell>{change.worker?.name}</TableCell>
                    <TableCell>
                      <Badge variant={getChangeColor(change.change_type)}>
                        {CHANGE_TYPE_LABELS[change.change_type]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {change.start_time && change.end_time
                        ? `${change.start_time.slice(0, 5)} - ${change.end_time.slice(0, 5)}`
                        : change.minutes
                        ? `${change.minutes}분`
                        : change.amount
                        ? `${change.amount.toLocaleString()}원`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-gray-500 max-w-[200px] truncate">
                      {change.note || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          change.status === 'approved'
                            ? 'default'
                            : change.status === 'pending'
                            ? 'outline'
                            : 'destructive'
                        }
                      >
                        {change.status === 'approved'
                          ? '승인'
                          : change.status === 'pending'
                          ? '대기'
                          : '거절'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
