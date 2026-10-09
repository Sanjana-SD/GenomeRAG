import { useState } from 'react'
import {
  Activity, BarChart3, Dna, FlaskConical, History, Info, LayoutDashboard, Menu, MessagesSquare, RefreshCw, X,
} from 'lucide-react'
import { useApp } from '../state.jsx'
import { Badge } from './ui.jsx'

export const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, title: 'Evolution Dashboard' },
  { id: 'genome', label: 'Genome Explorer', icon: Dna, title: 'Genome Explorer' },
  { id: 'compare', label: 'Agent Comparison', icon: MessagesSquare, title: 'Agent Comparison' },
  { id: 'benchmarks', label: 'Benchmark Results', icon: BarChart3, title: 'Benchmark Results' },
  { id: 'history', label: 'Experiment History', icon: History, title: 'Experiment History' },
  { id: 'about', label: 'About / Architecture', icon: Info, title: 'About / Architecture' },
]

// Maps backend service status -> indicator state shown in the header.
const SERVICE_STATES = {
  ok: { tone: 'ok', text: 'Connected' },
  not_configured: { tone: 'warn', text: 'Configuration missing' },
  checking: { tone: 'muted', text: 'Checking' },
  missing_tables: { tone: 'error', text: 'Schema missing' },
  schema_outdated: { tone: 'error', text: 'Schema outdated' },
  permission_denied: { tone: 'error', text: 'Permission denied' },
  auth_error: { tone: 'error', text: 'Invalid credentials' },
  error: { tone: 'error', text: 'Error' },
}

function ServiceIndicator({ name, svc, backend }) {
  let state = SERVICE_STATES.checking
  let detail = 'Waiting for the first health check'
  if (backend === 'offline') {
    state = { tone: 'error', text: 'Disconnected' }
    detail = 'Backend unreachable'
  } else if (svc) {
    state = SERVICE_STATES[svc.status] || SERVICE_STATES.error
    detail = svc.detail || ''
  }
  return (
    <Badge tone={state.tone} dot title={`${name}: ${state.text}${detail ? ` — ${detail}` : ''}`}>
      {name}
      <span className="hidden font-normal opacity-80 xl:inline">· {state.text}</span>
    </Badge>
  )
}

function Sidebar({ open, onClose }) {
  const { page, navigate, activeJob } = useApp()
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-line bg-surface-2 transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-accent">
            <Dna size={17} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">GenomeRAG</div>
            <div className="text-[11px] text-muted">Evolutionary memory lab</div>
          </div>
          <button className="ml-auto text-muted lg:hidden" onClick={onClose} aria-label="Close menu"><X size={18} /></button>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { navigate(id); onClose() }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${page === id ? 'bg-primary/15 text-indigo-200' : 'text-muted hover:bg-white/5 hover:text-fg'}`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        {activeJob && (
          <button onClick={() => { navigate('dashboard'); onClose() }} className="m-2 rounded-lg border border-accent/30 bg-accent/10 p-3 text-left text-xs">
            <div className="flex items-center gap-1.5 font-medium text-accent"><FlaskConical size={13} /> {activeJob.kind === 'benchmark' ? 'Benchmark running' : 'Evolution running'}</div>
            <div className="mt-1 truncate font-mono text-[11px] text-sky-200/80">{activeJob.run_id}</div>
            {activeJob.phase && <div className="mt-0.5 text-[11px] text-muted">{activeJob.phase}</div>}
          </button>
        )}
        <div className="border-t border-line p-3 text-[11px] leading-relaxed text-muted">
          Results shown here come from real benchmark runs against the configured LLM.
        </div>
      </aside>
    </>
  )
}

function Header({ onMenu }) {
  const { page, health, backend, activeJob, refreshHealth } = useApp()
  const [refreshing, setRefreshing] = useState(false)
  const title = NAV.find((n) => n.id === page)?.title
  const s = health?.services
  return (
    <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-bg/85 px-4 py-2 backdrop-blur sm:px-6">
      <button className="text-muted lg:hidden" onClick={onMenu} aria-label="Open menu"><Menu size={20} /></button>
      <h1 className="truncate text-sm font-semibold sm:text-base">{title}</h1>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {activeJob ? (
          <Badge tone="running" dot title={activeJob.phase || ''}>
            <Activity size={11} /> {activeJob.kind === 'benchmark' ? 'Benchmarking' : 'Evolving'}
            {activeJob.kind === 'evolution' && activeJob.current_generation !== null && activeJob.current_generation !== undefined
              ? ` · gen ${activeJob.current_generation}/${activeJob.generations}` : ''}
          </Badge>
        ) : (
          backend === 'online' && <Badge tone="muted">No active experiment</Badge>
        )}
        <Badge tone={backend === 'online' ? 'ok' : backend === 'offline' ? 'error' : 'muted'} dot title="FastAPI backend">
          API <span className="hidden font-normal opacity-80 xl:inline">· {backend === 'online' ? 'Connected' : backend === 'offline' ? 'Disconnected' : 'Checking'}</span>
        </Badge>
        <ServiceIndicator name={`Groq${s?.groq?.model ? ` (${s.groq.model.split('/').pop()})` : ''}`} svc={s?.groq} backend={backend} />
        <ServiceIndicator name="Qdrant" svc={s?.qdrant} backend={backend} />
        <ServiceIndicator name="Supabase" svc={s?.supabase} backend={backend} />
        <button
          title="Re-check services now"
          onClick={async () => { setRefreshing(true); await refreshHealth(true); setRefreshing(false) }}
          className="rounded-md p-1 text-muted hover:bg-white/5 hover:text-fg"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>
    </header>
  )
}

export function PersistenceBanner() {
  const { health } = useApp()
  if (!health || health.persistence?.backend !== 'local') return null
  const sb = health.services?.supabase
  return (
    <div className="border-b border-warn/20 bg-warn/5 px-4 py-2 text-xs text-amber-100 sm:px-6">
      <b className="font-semibold">Supabase not in use</b> ({sb?.detail || sb?.status}). Runs, benchmarks and chat sessions are being saved to the
      local fallback file <code className="font-mono">{health.persistence.local_path}</code> instead. See README → “Database schema”.
      {sb?.key_kind === 'publishable' && <> Your SUPABASE_KEY is a <b>publishable</b> key — the backend needs the <b>secret</b> key.</>}
    </div>
  )
}

export function Layout({ children }) {
  const [open, setOpen] = useState(false)
  const { backend } = useApp()
  return (
    <div className="min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="min-w-0 lg:pl-60">
        <Header onMenu={() => setOpen(true)} />
        <PersistenceBanner />
        {backend === 'offline' && (
          <div className="border-b border-danger/30 bg-danger/10 px-4 py-2 text-xs text-rose-200 sm:px-6">
            Cannot reach the backend. Start it with <code className="font-mono">.\.venv\Scripts\python.exe -m uvicorn api.main:app --port 8000</code>. Retrying automatically…
          </div>
        )}
        <main className="mx-auto max-w-[1400px] p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
