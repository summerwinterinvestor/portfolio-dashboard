'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';

interface MonthlyData {
  label: string;  // e.g. "2025-06"
  amount: number;
}

interface YearlyData {
  label: string;  // e.g. "2025"
  amount: number;
}

interface Props {
  monthlyData: MonthlyData[];
  yearlyData: YearlyData[];
  view: 'monthly' | 'yearly';
}

function fmt(n: number) {
  return n.toLocaleString('ko-KR');
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs">
        <p className="text-gray-400 mb-1">{label}</p>
        <p className="text-yellow-400 font-semibold">
          ₩{fmt(Math.round(payload[0].value))}
        </p>
      </div>
    );
  }
  return null;
};

export default function DividendChart({ monthlyData, yearlyData, view }: Props) {
  const data = view === 'monthly' ? monthlyData : yearlyData;

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-600 text-sm">
        배당 데이터가 없습니다.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) =>
            v >= 1_000_000
              ? `${(v / 1_000_000).toFixed(1)}M`
              : v >= 1000
              ? `${(v / 1000).toFixed(0)}K`
              : String(v)
          }
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1f2937' }} />
        <Legend wrapperStyle={{ fontSize: '11px', color: '#9ca3af' }} />
        <Bar
          dataKey="amount"
          name="배당금 (원)"
          fill="#ecc94b"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
