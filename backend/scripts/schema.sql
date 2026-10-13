-- GenomeRAG database schema (Supabase / PostgreSQL).
-- Idempotent: safe to run again after upgrades. Run it in Supabase -> SQL Editor.
--
-- Security model: the FastAPI backend talks to Supabase with the SECRET key
-- (sb_secret_... or the legacy service_role JWT), which bypasses Row Level Security.
-- RLS is enabled with no policies, so the public/publishable (anon) key cannot
-- read or write these tables. Never ship the secret key to the browser.

-- ---------------------------------------------------------------- runs
CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    status TEXT DEFAULT 'running',
    best_fitness DOUBLE PRECISION,
    best_genome JSONB
);
ALTER TABLE runs ADD COLUMN IF NOT EXISTS pop_size INTEGER;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS generations INTEGER;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS current_generation INTEGER DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS evaluations INTEGER DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS phase TEXT;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS benchmark_status TEXT;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP WITH TIME ZONE;

-- ---------------------------------------------------------------- generation_logs
CREATE TABLE IF NOT EXISTS generation_logs (
    id BIGSERIAL PRIMARY KEY,
    run_id TEXT REFERENCES runs(run_id) ON DELETE CASCADE,
    generation_number INTEGER NOT NULL,
    best_fitness DOUBLE PRECISION NOT NULL,
    avg_fitness DOUBLE PRECISION NOT NULL,
    best_genome_json JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE generation_logs ADD COLUMN IF NOT EXISTS worst_fitness DOUBLE PRECISION;
ALTER TABLE generation_logs ADD COLUMN IF NOT EXISTS best_accuracy DOUBLE PRECISION;
ALTER TABLE generation_logs ADD COLUMN IF NOT EXISTS best_latency DOUBLE PRECISION;
ALTER TABLE generation_logs ADD COLUMN IF NOT EXISTS avg_latency DOUBLE PRECISION;
ALTER TABLE generation_logs ADD COLUMN IF NOT EXISTS evaluations INTEGER;
ALTER TABLE generation_logs ADD COLUMN IF NOT EXISTS task_errors INTEGER;
CREATE INDEX IF NOT EXISTS generation_logs_run_id_idx ON generation_logs(run_id);

-- ---------------------------------------------------------------- benchmark_results
-- One row per (run, agent) benchmark execution; tasks holds the per-task records.
CREATE TABLE IF NOT EXISTS benchmark_results (
    id BIGSERIAL PRIMARY KEY,
    run_id TEXT REFERENCES runs(run_id) ON DELETE CASCADE,
    agent TEXT NOT NULL CHECK (agent IN ('evolved', 'baseline')),
    genome JSONB NOT NULL,
    accuracy DOUBLE PRECISION,
    avg_latency DOUBLE PRECISION,
    avg_retrieval_ms DOUBLE PRECISION,
    avg_llm_ms DOUBLE PRECISION,
    fitness DOUBLE PRECISION,
    num_tasks INTEGER,
    errors INTEGER DEFAULT 0,
    tasks JSONB,
    model TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS benchmark_results_run_id_idx ON benchmark_results(run_id);

-- ---------------------------------------------------------------- chat sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id TEXT PRIMARY KEY,
    agent TEXT NOT NULL DEFAULT 'evolved',
    genome JSONB,
    genome_source TEXT,
    step INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    meta JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages(session_id, id);

-- ---------------------------------------------------------------- access control
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmark_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE
            ON runs, generation_logs, benchmark_results, chat_sessions, chat_messages TO service_role;
        GRANT USAGE, SELECT ON SEQUENCE generation_logs_id_seq, benchmark_results_id_seq, chat_messages_id_seq
            TO service_role;
    END IF;
END $$;

-- Ask PostgREST to reload its schema cache so the API sees the tables immediately.
NOTIFY pgrst, 'reload schema';
