export const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

export const fmt = (v, digits = 3) => (isNum(v) ? v.toFixed(digits) : '—')
export const pct = (v, digits = 1) => (isNum(v) ? `${(v * 100).toFixed(digits)}%` : '—')
export const ms = (v) => (isNum(v) ? (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`) : '—')
export const secs = (v) => (isNum(v) ? `${v.toFixed(2)} s` : '—')
export const signed = (v, digits = 3) => (isNum(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(digits)}` : '—')

export function dateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function duration(fromIso, toIso) {
  if (!fromIso) return '—'
  const start = new Date(fromIso).getTime()
  const end = toIso ? new Date(toIso).getTime() : Date.now()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '—'
  let s = Math.max(0, Math.round((end - start) / 1000))
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  s -= m * 60
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`
}

export const label = (k) => k.replace(/_/g, ' ')

export const formatGene = (name, v, integer) =>
  isNum(v) ? (integer ? String(Math.round(v)) : v.toFixed(name === 'similarity_threshold' ? 2 : 2)) : '—'

/** Relative change (b -> a) as a fraction, or null when undefined (missing data / zero denominator). */
export function relChange(a, b) {
  if (!isNum(a) || !isNum(b) || b === 0) return null
  return (a - b) / Math.abs(b)
}

export function downloadCsv(filename, rows) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}
