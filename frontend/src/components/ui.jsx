import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Copy, Loader2, X } from 'lucide-react'

export function Card({ title, subtitle, actions, children, className = '', bodyClass = 'p-4' }) {
  return (
    <section className={`rounded-xl border border-line bg-surface ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-fg">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

export function Metric({ label, value, sub, icon: Icon, tone = 'default', children }) {
  const toneClass = { default: 'text-fg', good: 'text-success', bad: 'text-danger', accent: 'text-accent' }[tone]
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        {Icon && <Icon size={15} className="text-muted/70" />}
      </div>
      <div className={`mt-2 font-mono text-2xl font-semibold tracking-tight ${toneClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
      {children}
    </div>
  )
}

export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, children, className = '', ...props }) {
  const v = {
    primary: 'bg-primary text-white hover:bg-indigo-500 border-transparent',
    secondary: 'bg-surface-2 text-fg hover:bg-white/5 border-line',
    ghost: 'bg-transparent text-muted hover:text-fg hover:bg-white/5 border-transparent',
    danger: 'bg-transparent text-danger hover:bg-danger/10 border-danger/40',
  }[variant]
  const s = size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm'
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${v} ${s} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : Icon && <Icon size={14} />}
      {children}
    </button>
  )
}

const BADGE = {
  ok: 'bg-success/10 text-success ring-success/30',
  running: 'bg-accent/10 text-accent ring-accent/30',
  warn: 'bg-warn/10 text-warn ring-warn/30',
  error: 'bg-danger/10 text-danger ring-danger/30',
  muted: 'bg-white/5 text-muted ring-line',
  primary: 'bg-primary/10 text-indigo-300 ring-primary/30',
}

export function Badge({ tone = 'muted', children, dot, title }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${BADGE[tone]}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full bg-current ${tone === 'running' ? 'animate-pulse' : ''}`} />}
      {children}
    </span>
  )
}

export const statusTone = (s) =>
  ({ done: 'ok', running: 'running', error: 'error', interrupted: 'warn', pending: 'muted', skipped: 'muted' })[s] || 'muted'

export function RunStatusBadge({ status }) {
  return <Badge tone={statusTone(status)} dot>{status || 'unknown'}</Badge>
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted">
      <Loader2 size={16} className="animate-spin" /> {label}
    </div>
  )
}

export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {Icon && <div className="mb-3 rounded-full border border-line bg-surface-2 p-3"><Icon size={20} className="text-muted" /></div>}
      <h3 className="text-sm font-semibold">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorNote({ children, onDismiss }) {
  if (!children) return null
  return (
    <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-rose-200">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {onDismiss && <button onClick={onDismiss} className="text-rose-300 hover:text-white" aria-label="Dismiss"><X size={14} /></button>}
    </div>
  )
}

export function Note({ tone = 'warn', children }) {
  const c = tone === 'warn' ? 'border-warn/30 bg-warn/10 text-amber-100' : 'border-accent/30 bg-accent/10 text-sky-100'
  return <div className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${c}`}>{children}</div>
}

export function Modal({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <div className="fade-in w-full max-w-lg rounded-xl border border-line bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-fg" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="space-y-4 px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function CopyButton({ text, label = 'Copy JSON' }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      size="sm"
      icon={done ? Check : Copy}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch { /* clipboard unavailable */ }
      }}
    >
      {done ? 'Copied' : label}
    </Button>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${value === t.value ? 'bg-primary/20 text-indigo-200' : 'text-muted hover:text-fg'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Progress({ value }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

export function KV({ k, v, mono = true }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 text-sm last:border-0">
      <dt className="text-muted">{k}</dt>
      <dd className={`min-w-0 truncate text-right ${mono ? 'font-mono text-[13px]' : ''}`}>{v}</dd>
    </div>
  )
}

export function ChartTooltip({ active, payload, label, labelPrefix = '', formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line bg-surface-2/95 px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-medium text-fg">{labelPrefix}{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-mono text-fg">{formatter ? formatter(p.value, p.dataKey) : p.value}</span>
        </div>
      ))}
    </div>
  )
}
