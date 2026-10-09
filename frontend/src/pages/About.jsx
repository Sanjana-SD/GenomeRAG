import { ArrowDown, ArrowRight, Brain, Database, Dna, Cpu, Server, Monitor, Sparkles, HardDrive } from 'lucide-react'
import { useApp } from '../state.jsx'
import { PageHeader } from '../components/Layout.jsx'
import { Badge, Card } from '../components/ui.jsx'

function Box({ icon: Icon, title, children, tone = 'line' }) {
  const ring = { line: 'border-line', primary: 'border-primary/50', accent: 'border-accent/50' }[tone]
  return (
    <div className={`rounded-xl border ${ring} bg-surface-2 p-3`}>
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><Icon size={15} className="text-indigo-300" />{title}</div>
      <div className="text-xs leading-relaxed text-muted">{children}</div>
    </div>
  )
}

const Arrow = () => (
  <div className="flex items-center justify-center text-muted">
    <ArrowRight size={18} className="hidden lg:block" /><ArrowDown size={18} className="lg:hidden" />
  </div>
)

const LIFECYCLE = [
  ['Retrieve', 'Embed the message (all-MiniLM-L6-v2, 384-d), cosine search in the agent’s collection, drop matches below similarity_threshold, re-rank by type weight × recency, drop memories below confidence_threshold × best score, keep retrieval_top_k.'],
  ['Reason', 'Send the recalled memories plus the conversation to the Groq model (GROQ_MODEL) for the reply.'],
  ['Act', 'Finalise the turn.'],
  ['Write', 'Store “User: … / Assistant: …” as an episodic memory. Failed LLM calls are never stored.'],
  ['Consolidate', 'Every consolidation_freq turns: forget older memories with probability forgetting_rate, summarise the oldest compression_ratio share of episodic memories into one semantic memory, prune to memory_capacity.'],
]

export default function About() {
  const { health, meta } = useApp()
  const s = health?.services
  return (
    <>
      <PageHeader title="About GenomeRAG" subtitle="An evolutionary memory framework for autonomous AI agents." />
      <div className="space-y-5">
        <Card title="What it does">
          <div className="space-y-2 text-sm leading-relaxed text-slate-300">
            <p>Most retrieval-augmented chatbots use hand-picked memory settings. GenomeRAG treats ten memory settings — how much to retrieve,
              how strict relevance is, how fast to forget, when to summarise — as a <b className="text-fg">genome</b>, and uses a
              <b className="text-fg"> genetic algorithm</b> to evolve genomes that recall facts more accurately and quickly.</p>
            <p>Evolved genomes are compared against a <b className="text-fg">fixed-memory baseline</b> (the default genome the project shipped
              with) on the same recall benchmark, and you can chat with both side by side.</p>
          </div>
        </Card>

        <Card title="Architecture">
          <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
            <Box icon={Monitor} title="React UI" tone="primary">React 18 · Vite 6 · Tailwind 4 · Recharts. Talks only to the backend; holds no credentials.</Box>
            <Arrow />
            <Box icon={Server} title="FastAPI backend" tone="primary">REST API, background evolution thread, chat sessions, health probes.</Box>
            <Arrow />
            <div className="grid grid-cols-1 gap-3">
              <Box icon={Brain} title="LangGraph agent">retrieve → reason → act → write memory</Box>
              <Box icon={Dna} title="DEAP genetic algorithm">blend crossover · Gaussian mutation · tournament selection</Box>
            </div>
          </div>
          <div className="my-3 flex justify-center text-muted"><ArrowDown size={18} /></div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Box icon={Cpu} title="Embeddings">sentence-transformers all-MiniLM-L6-v2, on CPU, inside the backend.</Box>
            <Box icon={Database} title="Qdrant Cloud" tone="accent">
              Isolated collections: <code className="font-mono">genomerag_memories</code> (evolved/custom chat),{' '}
              <code className="font-mono">genomerag_baseline_memories</code> (baseline chat),{' '}
              <code className="font-mono">genomerag_benchmark</code> (evolution scratch space, wiped per task).
            </Box>
            <Box icon={Sparkles} title="Groq LLM" tone="accent">Model from GROQ_MODEL (currently <span className="font-mono">{s?.groq?.model || '…'}</span>).</Box>
            <Box icon={HardDrive} title="Supabase Postgres" tone="accent">runs, generation_logs, benchmark_results, chat_sessions, chat_messages. Falls back to a local JSON file when unavailable.</Box>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {['groq', 'qdrant', 'supabase'].map((k) => (
              <Badge key={k} tone={s?.[k]?.status === 'ok' ? 'ok' : s ? 'error' : 'muted'} dot title={s?.[k]?.detail}>{k}: {s?.[k]?.status || 'checking'}</Badge>
            ))}
            {health && <Badge tone={health.persistence.backend === 'supabase' ? 'ok' : 'warn'}>persistence: {health.persistence.backend}</Badge>}
          </div>
        </Card>

        <Card title="Memory lifecycle (one agent turn)">
          <ol className="grid grid-cols-1 gap-3 md:grid-cols-5">
            {LIFECYCLE.map(([t, d], i) => (
              <li key={t} className="rounded-xl border border-line bg-surface-2 p-3">
                <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><span className="grid h-5 w-5 place-items-center rounded-full bg-primary/20 font-mono text-[11px] text-indigo-200">{i + 1}</span>{t}</div>
                <p className="text-xs leading-relaxed text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </Card>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card title="The genome">
            <ul className="space-y-2 text-xs">
              {(meta?.params || []).map((p) => (
                <li key={p.name}><code className="font-mono text-indigo-200">{p.name}</code> <span className="text-muted">({p.min}–{p.max}, {p.unit})</span> — <span className="text-slate-300">{p.description}</span></li>
              ))}
            </ul>
          </Card>
          <Card title="Evolution & fitness">
            <div className="space-y-2 text-sm leading-relaxed text-slate-300">
              <p>Each candidate genome is scored on 10 recall tasks. For every task the benchmark collection is wiped, two facts are stored, and the
                agent answers a question with no chat history.</p>
              <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-xs">fitness = mean keyword accuracy − 0.02 × mean end-to-end latency (s)</p>
              <p>Generation 0 is a random population; each following generation uses tournament selection (size 3), blend crossover (p = 0.5) and Gaussian
                mutation (p = 0.2, σ = 15% of range), with all genes clamped to their bounds.</p>
            </div>
          </Card>
        </div>

        <Card title="Known limitations">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
            <li>Accuracy is keyword matching, not semantic evaluation; paraphrased correct answers can score 0.</li>
            <li>Fitness comes from a single pass with a non-deterministic LLM and real network latency — small differences are noise. Latency is dominated by the LLM and Qdrant network round-trips.</li>
            <li>The benchmark only tests short-horizon recall of two facts; forgetting, consolidation and capacity genes are rarely exercised by it (they act at consolidation checkpoints during longer chats).</li>
            <li>Evolution is slow and rate-limited: every genome evaluation is 10 LLM calls. Runs are bounded (≤ {health?.limits?.max_pop_size ?? 12} genomes × {health?.limits?.max_generations ?? 6} generations) and only one job runs at a time; a backend restart marks a running run as interrupted.</li>
            <li>Long-term chat memory is per agent, shared across that agent’s conversations (single-user demo; no authentication).</li>
          </ul>
        </Card>
      </div>
    </>
  )
}
