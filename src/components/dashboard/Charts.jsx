// Charts — lightweight recharts wrappers for the Command Center. Horizontal bar
// and donut with a readable legend (color, label, exact value, percent), the
// shared deterministic palette, and clickable segments that drill to records.
// Width is measured via getBoundingClientRect (no ResizeObserver) so it is safe
// in jsdom tests; charts render only once a real width is known.

import { useRef, useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Cell, Tooltip, LabelList, PieChart, Pie } from 'recharts'
import { FONT, INK, colorForKey, PALETTE } from '../../lib/dashboardTheme'

export function useMeasuredWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const measure = () => { if (ref.current) setW(ref.current.getBoundingClientRect().width || 0) }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  return [ref, w]
}

const tooltipStyle = { fontFamily: FONT, fontSize: 12, borderRadius: 8, border: '1px solid #e6eaf0' }

// data: [{ key, label, value, color? }]
export function HBarChart({ data, height = 300, valueFormat = (v) => v, onBarClick }) {
  const [ref, w] = useMeasuredWidth()
  const rows = (data || []).filter((d) => d && Number.isFinite(Number(d.value)))
  return (
    <div ref={ref} style={{ width: '100%' }}>
      {w > 0 && rows.length > 0 ? (
        <BarChart width={w} height={height} data={rows} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 8 }} barCategoryGap={8}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={Math.min(150, Math.max(90, Math.round(w * 0.28)))}
            tick={{ fontSize: 12.5, fill: INK.body, fontFamily: FONT }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: '#f4f7fb' }} contentStyle={tooltipStyle} formatter={(v) => [valueFormat(v), 'Value']} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} cursor={onBarClick ? 'pointer' : 'default'}
            onClick={(e) => onBarClick && e && onBarClick(e.payload || e)} isAnimationActive={false}>
            {rows.map((d, i) => <Cell key={d.key || i} fill={d.color || colorForKey(d.key || d.label)} />)}
            <LabelList dataKey="value" position="right" formatter={valueFormat} style={{ fontSize: 12, fontWeight: 700, fill: INK.title, fontFamily: FONT }} />
          </Bar>
        </BarChart>
      ) : (
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK.faint, fontSize: 13, fontFamily: FONT }}>
          {rows.length === 0 ? 'No records in this period.' : ''}
        </div>
      )}
    </div>
  )
}

// data: [{ key, label, value, color? }]
export function DonutChart({ data, height = 300, valueFormat = (v) => v, onSliceClick }) {
  const [ref, w] = useMeasuredWidth()
  const rows = (data || []).filter((d) => d && Number(d.value) > 0)
  const total = rows.reduce((s, d) => s + Number(d.value), 0)
  const chartW = Math.max(160, Math.round(Math.min(w * 0.6, height + 40)))
  const r = Math.min(chartW, height) / 2
  return (
    <div ref={ref} style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
      {w > 0 && rows.length > 0 ? (
        <>
          <PieChart width={chartW} height={height}>
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [valueFormat(v), 'Value']} />
            <Pie data={rows} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={r * 0.58} outerRadius={r * 0.92}
              paddingAngle={1} isAnimationActive={false} cursor={onSliceClick ? 'pointer' : 'default'}
              onClick={(e) => onSliceClick && e && onSliceClick(e.payload || e)}>
              {rows.map((d, i) => <Cell key={d.key || i} fill={d.color || colorForKey(d.key || d.label)} />)}
            </Pie>
          </PieChart>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1, minWidth: 150, display: 'grid', gridTemplateColumns: rows.length > 6 ? '1fr 1fr' : '1fr', gap: 4 }}>
            {rows.map((d, i) => {
              const pct = total > 0 ? Math.round((Number(d.value) / total) * 100) : 0
              return (
                <li key={d.key || i}>
                  <button onClick={() => onSliceClick && onSliceClick(d)} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: onSliceClick ? 'pointer' : 'default', fontFamily: FONT, padding: '2px 0' }}>
                    <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: d.color || colorForKey(d.key || d.label), flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: INK.body, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: INK.title }}>{valueFormat(d.value)}</span>
                    <span style={{ fontSize: 11.5, color: INK.faint, width: 34, textAlign: 'right' }}>{pct}%</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <div style={{ height, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK.faint, fontSize: 13, fontFamily: FONT }}>
          {rows.length === 0 ? 'No records in this period.' : ''}
        </div>
      )}
    </div>
  )
}

export { PALETTE }
