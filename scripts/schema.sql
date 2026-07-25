-- Create runs table to track evolution runs
CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    status TEXT DEFAULT 'running',
    best_fitness DOUBLE PRECISION,
    best_genome JSONB
);

-- Create generation_logs table to track performance across generations
CREATE TABLE IF NOT EXISTS generation_logs (
    id BIGSERIAL PRIMARY KEY,
    run_id TEXT REFERENCES runs(run_id) ON DELETE CASCADE,
    generation_number INTEGER NOT NULL,
    best_fitness DOUBLE PRECISION NOT NULL,
    avg_fitness DOUBLE PRECISION NOT NULL,
    best_genome_json JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Disable Row-Level Security (RLS) for simple free-tier integrations
ALTER TABLE runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE generation_logs DISABLE ROW LEVEL SECURITY;

