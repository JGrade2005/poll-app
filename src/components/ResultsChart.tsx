import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ChoiceResult } from '../lib/types'

interface ResultsChartProps {
  choices: ChoiceResult[]
  /** Accessible description, e.g. the question text. */
  label: string
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * Horizontal bar chart (Recharts). Every bar is labelled with its count and
 * percentage so the chart never relies on color alone (UI.md section 9).
 */
export function ResultsChart({ choices, label }: ResultsChartProps) {
  const data = choices.map((c, i) => ({
    name: `${String.fromCharCode(65 + i)}. ${truncate(c.choice_text, 22)}`,
    fullName: c.choice_text,
    count: c.count,
    percentage: c.percentage,
    display: `${c.count} (${c.percentage}%)`,
  }))
  const max = Math.max(1, ...choices.map((c) => c.count))

  return (
    <figure aria-label={`Bar chart of answers for: ${label}`} className="w-full">
      <ResponsiveContainer width="100%" height={Math.max(110, data.length * 56)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 88, bottom: 4, left: 4 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" allowDecimals={false} domain={[0, max]} tick={{ fill: '#475569' }} />
          <YAxis
            type="category"
            dataKey="name"
            width={170}
            tick={{ fill: '#1e293b', fontSize: 14 }}
            interval={0}
          />
          <Tooltip
            cursor={{ fill: '#f1f5f9' }}
            formatter={(value, _name, item) => [
              `${String(value)} (${(item?.payload as { percentage?: number })?.percentage ?? 0}%)`,
              'Responses',
            ]}
            labelFormatter={(_label, payload) =>
              (payload?.[0]?.payload as { fullName?: string } | undefined)?.fullName ?? ''
            }
          />
          <Bar dataKey="count" fill="#1d4ed8" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList
              dataKey="display"
              position="right"
              fill="#0f172a"
              fontSize={14}
              fontWeight={600}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  )
}
