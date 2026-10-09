import { useCallback, useEffect, useRef, useState } from 'react'
import { Brain, ChevronDown, Database, Eraser, Lock, MessageSquarePlus, Send, Sparkles, Trash2 } from 'lucide-react'
import { api } from '../api.js'
import { useApp, useRunDetail } from '../state.jsx'
import { PageHeader } from '../components/Layout.jsx'
import { Badge, Button, ErrorNote, Modal, Note } from '../components/ui.jsx'
import { RunSelect } from '../components/shared.jsx'
import { fmt, ms } from '../lib/format.js'

const STORAGE_KEY = 'grag.compareSessions'
const SUGGESTIONS = [
  "My dog's name is Rex, and my favorite color is blue.",
  "What is my dog's name and favorite color?",
  'I moved to Berlin last winter and I am learning German.',
  'Where do I live and what language am I learning?',
]

function loadIds() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {} } catch { return {} }
}
function saveIds(ids) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)) } catch { /* ignore */ }
}

function fromServerMessages(msgs) {
  return msgs.map((m) => ({ role: m.role, content: m.content, meta: m.meta || null }))
}

function Timings({ t }) {
  if (!t) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 text-[10.5px]">
      <span className="rounded bg-white/5 px-1.5 py-0.5 text-muted" title="Embedding + vector search + genome re-ranking">retrieval <b className="font-mono text-fg">{ms(t.retrieval_ms)}</b></span>
      <span className="rounded bg-white/5 px-1.5 py-0.5 text-muted" title="Groq completion">LLM <b className="font-mono text-fg">{ms(t.llm_ms)}</b></span>
      <span className="rounded bg-white/5 px-1.5 py-0.5 text-muted" title="Whole agent turn, including writing the new memory to Qdrant">total <b className="font-mono text-fg">{ms(t.total_ms)}</b></span>
    </div>
  )
}

function Details({ meta }) {
  const [open, setOpen] = useState(null)
  if (!meta) return null
  const mems = meta.memories || []
  return (
    <div className="mt-1.5">
      <div className="flex gap-3 text-[11px]">
        <button onClick={() => setOpen(open === 'mem' ? null : 'mem')} className="inline-flex items-center gap-1 text-muted hover:text-fg">
          <Database size={11} /> {mems.length} memor{mems.length === 1 ? 'y' : 'ies'} used <ChevronDown size={11} className={open === 'mem' ? 'rotate-180' : ''} />
        </button>
        {meta.logs?.length > 0 && (
          <button onClick={() => setOpen(open === 'log' ? null : 'log')} className="inline-flex items-center gap-1 text-muted hover:text-fg">
            trace <ChevronDown size={11} className={open === 'log' ? 'rotate-180' : ''} />
          </button>
        )}
      </div>
      {open === 'mem' && (
        <ul className="fade-in mt-2 space-y-1.5">
          {!mems.length && <li className="text-[11px] text-muted">No memory passed the genome’s similarity / confidence thresholds.</li>}
          {mems.map((m, i) => (
            <li key={i} className="rounded-md border border-line bg-bg/60 p-2 text-[11px]">
              <div className="mb-1 flex gap-2 text-muted">
                <span>{m.type}</span>
                <span className="ml-auto font-mono">sim {fmt(m.similarity, 3)}</span>
                <span className="font-mono">score {fmt(m.score, 3)}</span>
              </div>
              <p className="line-clamp-4 whitespace-pre-wrap text-slate-300">{m.text}</p>
            </li>
          ))}
        </ul>
      )}
      {open === 'log' && (
        <pre className="fade-in mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-bg/60 p-2 text-[10.5px] leading-relaxed text-slate-400">{meta.logs.join('\n')}</pre>
      )}
    </div>
  )
}

function ConfigSummary({ genome }) {
  if (!genome) return <span className="text-muted">no genome</span>
  return (
    <span className="font-mono">
      top_k {genome.retrieval_top_k} · sim≥{fmt(genome.similarity_threshold, 2)} · conf {fmt(genome.confidence_threshold, 2)} · forget {fmt(genome.forgetting_rate, 2)}
    </span>
  )
}

function AgentPanel({ kind, title, badge, genome, sourceLabel, conv, memCount, collection, onWipe }) {
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [conv.messages.length, conv.loading])
  const accent = kind === 'evolved' ? 'border-t-primary' : 'border-t-accent'
  return (
    <section className={`flex min-h-[520px] flex-col rounded-xl border border-line border-t-2 bg-surface ${accent}`}>
      <header className="space-y-1.5 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          {kind === 'evolved' ? <Sparkles size={15} className="text-primary" /> : <Lock size={15} className="text-accent" />}
          <h3 className="text-sm font-semibold">{title}</h3>
          {badge}
          <button onClick={onWipe} className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted hover:text-danger" title="Delete this agent's long-term memory">
            <Trash2 size={12} /> wipe memory
          </button>
        </div>
        <div className="text-[11px] text-muted">{sourceLabel}</div>
        <div className="text-[11px] text-slate-300"><ConfigSummary genome={genome} /></div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted">
          <Brain size={11} /> {memCount ?? '—'} long-term memories in <code className="font-mono">{collection}</code>
        </div>
      </header>
      <div className="max-h-[60vh] min-h-[260px] flex-1 space-y-3 overflow-y-auto p-4">
        {!conv.messages.length && !conv.loading && (
          <p className="py-10 text-center text-sm text-muted">No messages in this conversation yet.</p>
        )}
        {conv.messages.map((m, i) => (
          <div key={i} className={`fade-in flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[92%] rounded-2xl px-3.5 py-2 text-sm ${m.role === 'user' ? 'bg-primary/90 text-white' : 'bg-surface-2 ring-1 ring-line'}`}>
              <div className="whitespace-pre-wrap break-words">{m.content}</div>
              {m.role === 'assistant' && <><Timings t={m.meta?.timings} /><Details meta={m.meta} /></>}
            </div>
          </div>
        ))}
        {conv.loading && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 120}ms` }} />)}</span>
            retrieving memories and reasoning…
          </div>
        )}
        {conv.error && <ErrorNote>{conv.error}</ErrorNote>}
        <div ref={endRef} />
      </div>
    </section>
  )
}

const emptyConv = () => ({ id: null, messages: [], loading: false, error: null })

export default function AgentComparison() {
  const { meta, runs, selectedRunId, customGenome, navigate, backend } = useApp()
  const { data } = useRunDetail(selectedRunId)
  const evolvedGenome = data?.run?.best_genome || null
  const [source, setSource] = useState('evolved')
  const [convs, setConvs] = useState({ evolved: emptyConv(), baseline: emptyConv() })
  const [input, setInput] = useState('')
  const [stats, setStats] = useState(null)
  const [wipe, setWipe] = useState(null)
  const [wipeBusy, setWipeBusy] = useState(false)
  const [restoreNote, setRestoreNote] = useState(null)

  const effectiveSource = source === 'evolved' && !evolvedGenome ? 'custom' : source
  const leftGenome = effectiveSource === 'evolved' ? evolvedGenome : customGenome || meta?.genome
  const leftSourceLabel = effectiveSource === 'evolved'
    ? `Best evolved genome · ${data?.run?.run_id} · fitness ${fmt(data?.run?.best_fitness, 4)}`
    : customGenome ? 'Custom genome from the Genome Explorer editor (not an evolved result)' : 'Default genome (no evolved genome selected yet)'

  const refreshStats = useCallback(() => api.memoryStats().then(setStats).catch(() => {}), [])

  // Restore persisted conversations.
  useEffect(() => {
    if (backend !== 'online') return
    refreshStats()
    const ids = loadIds()
    for (const agent of ['evolved', 'baseline']) {
      if (!ids[agent]) continue
      api.session(ids[agent])
        .then((r) => setConvs((c) => ({ ...c, [agent]: { ...emptyConv(), id: ids[agent], messages: fromServerMessages(r.messages) } })))
        .catch((e) => {
          if (e.status === 404) {
            delete ids[agent]
            saveIds(ids)
          } else setRestoreNote(`Could not restore the saved ${agent} conversation: ${e.message}`)
        })
    }
  }, [backend])

  const patch = (agent, fn) => setConvs((c) => ({ ...c, [agent]: fn(c[agent]) }))

  async function sendTo(agent, text, sessionId) {
    patch(agent, (c) => ({ ...c, loading: true, error: null, messages: [...c.messages, { role: 'user', content: text }] }))
    try {
      const body = { message: text, agent, session_id: sessionId || undefined }
      if (agent === 'evolved') {
        body.genome = leftGenome
        body.genome_source = effectiveSource === 'evolved' ? `run:${data?.run?.run_id}` : 'custom'
      }
      const r = await api.chat(body)
      const ids = loadIds()
      ids[agent] = r.session_id
      saveIds(ids)
      patch(agent, (c) => ({
        ...c, id: r.session_id, loading: false,
        error: r.persisted ? null : `Reply not saved: ${r.persist_error}`,
        messages: [...c.messages, { role: 'assistant', content: r.response, meta: { timings: r.timings, memories: r.retrieved_memories, logs: r.logs } }],
      }))
    } catch (e) {
      patch(agent, (c) => ({ ...c, loading: false, error: e.message }))
    }
  }

  async function send(text) {
    const msg = (text ?? input).trim()
    if (!msg || busy) return
    setInput('')
    // Both agents receive exactly the same message, in parallel.
    await Promise.all([sendTo('evolved', msg, convs.evolved.id), sendTo('baseline', msg, convs.baseline.id)])
    refreshStats()
  }

  async function newConversation() {
    const ids = loadIds()
    await Promise.all(['evolved', 'baseline'].map((a) => ids[a] && api.resetSession(ids[a]).catch(() => {})))
    saveIds({})
    setConvs({ evolved: emptyConv(), baseline: emptyConv() })
  }

  async function confirmWipe() {
    setWipeBusy(true)
    try {
      await api.clearMemory(wipe)
      await refreshStats()
      setWipe(null)
    } catch (e) {
      patch(wipe, (c) => ({ ...c, error: e.message }))
      setWipe(null)
    } finally {
      setWipeBusy(false)
    }
  }

  const busy = convs.evolved.loading || convs.baseline.loading
  const hasEvolvedRuns = (runs || []).some((r) => r.best_genome)

  return (
    <>
      <PageHeader title="Agent Comparison" subtitle="One message, two agents: the evolved memory genome versus the fixed-memory baseline — each with its own isolated long-term memory."
        actions={<>
          {hasEvolvedRuns && source === 'evolved' && <RunSelect filter={(r) => r.best_genome} />}
          <select value={effectiveSource} onChange={(e) => setSource(e.target.value)} aria-label="Left agent genome source"
            className="h-9 rounded-lg border border-line bg-surface-2 px-2.5 text-xs outline-none focus:border-primary">
            <option value="evolved" disabled={!evolvedGenome}>Left agent: best evolved genome{evolvedGenome ? '' : ' (none yet)'}</option>
            <option value="custom">Left agent: custom genome</option>
          </select>
          <Button icon={MessageSquarePlus} onClick={newConversation} disabled={busy}>New conversation</Button>
        </>} />

      <div className="space-y-4">
        <ErrorNote onDismiss={() => setRestoreNote(null)}>{restoreNote}</ErrorNote>
        {!evolvedGenome && (
          <Note tone="info">
            No evolved genome is available for the selected run, so the left agent uses {customGenome ? 'your custom' : 'the default'} genome.
            {' '}<button className="underline" onClick={() => navigate('dashboard')}>Run an evolution</button> to compare a real evolved genome.
          </Note>
        )}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AgentPanel kind="evolved" title={effectiveSource === 'evolved' ? 'Evolved Memory Agent' : 'Custom Memory Agent'}
            badge={<Badge tone="primary">{effectiveSource === 'evolved' ? 'evolved' : 'custom'}</Badge>}
            genome={leftGenome} sourceLabel={leftSourceLabel} conv={convs.evolved}
            memCount={stats?.evolved?.count} collection={stats?.evolved?.collection || 'genomerag_memories'} onWipe={() => setWipe('evolved')} />
          <AgentPanel kind="baseline" title="Fixed-Memory Baseline Agent" badge={<Badge tone="muted">fixed</Badge>}
            genome={meta?.baseline} sourceLabel="The shipped default genome. It never changes and is never evolved."
            conv={convs.baseline} memCount={stats?.baseline?.count}
            collection={stats?.baseline?.collection || 'genomerag_baseline_memories'} onWipe={() => setWipe('baseline')} />
        </div>

        <div className="rounded-xl border border-line bg-surface p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} disabled={busy}
                className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs text-slate-300 hover:border-primary/50 hover:text-fg disabled:opacity-40">
                {s}
              </button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send() }} className="flex gap-2">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} placeholder="Message both agents…"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              className="min-h-10 flex-1 resize-y rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary" />
            <Button variant="primary" icon={Send} type="submit" disabled={busy || !input.trim() || !leftGenome} loading={busy}>Send</Button>
          </form>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            To test long-term memory, tell both agents a fact, click <b>New conversation</b> (this clears chat history but keeps
            each agent’s Qdrant memories), then ask about it. Within one conversation both agents also see the chat history.
          </p>
        </div>
      </div>

      <Modal open={!!wipe} onClose={() => !wipeBusy && setWipe(null)} title="Wipe long-term memory?"
        footer={<>
          <Button variant="ghost" onClick={() => setWipe(null)} disabled={wipeBusy}>Cancel</Button>
          <Button variant="danger" icon={Eraser} onClick={confirmWipe} loading={wipeBusy}>Delete {stats?.[wipe]?.count ?? ''} memories</Button>
        </>}>
        <p className="text-sm text-muted">
          This permanently deletes every memory in <code className="font-mono text-fg">{stats?.[wipe]?.collection}</code> (the {wipe} agent).
          The other agent’s memory and all experiment results are not affected.
        </p>
      </Modal>
    </>
  )
}
