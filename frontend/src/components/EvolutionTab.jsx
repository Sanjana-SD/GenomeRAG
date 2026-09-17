import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Dna, Sparkles, TrendingUp, Terminal, ShieldAlert, CheckCircle2, Sliders } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function EvolutionTab({ evolutionState, onStartEvolution, onStopEvolution, championGenome }) {
  const [popSize, setPopSize] = useState(10);
  const [generations, setGenerations] = useState(6);
  const [cxpb, setCxpb] = useState(0.5);
  const [mutpb, setMutpb] = useState(0.2);
  const [evalMode, setEvalMode] = useState('dummy');
  const [runName, setRunName] = useState('');

  const terminalRef = useRef(null);

  // Auto-scroll terminal on new logs
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [evolutionState?.logs]);

  const isRunning = evolutionState?.status === 'running';

  const handleStart = (e) => {
    e.preventDefault();
    onStartEvolution({
      pop_size: Number(popSize),
      generations: Number(generations),
      cxpb: Number(cxpb),
      mutpb: Number(mutpb),
      eval_mode: evalMode,
      run_name: runName.trim() || undefined
    });
  };

  const chartData = (evolutionState?.generation_history || []).map((gen) => ({
    generation: `Gen ${gen.generation}`,
    bestFitness: gen.best_fitness,
    avgFitness: gen.avg_fitness
  }));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px' }}>
      {/* Left Column: Configuration Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
              <Sliders size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: '700' }}>Evolution Hyperparameters</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Configure genetic search operators</p>
            </div>
          </div>

          <form onSubmit={handleStart} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '600', marginBottom: '6px' }}>
                <span>Evaluation Mode</span>
                <span style={{ color: evalMode === 'benchmark' ? '#38bdf8' : '#a78bfa', fontWeight: '700' }}>
                  {evalMode === 'benchmark' ? 'Full LLM Benchmark' : 'Quick Optimizer'}
                </span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setEvalMode('dummy')}
                  disabled={isRunning}
                  style={{
                    padding: '8px',
                    fontSize: '12px',
                    fontWeight: '600',
                    borderRadius: '8px',
                    border: evalMode === 'dummy' ? '1px solid #8b5cf6' : '1px solid var(--border-subtle)',
                    background: evalMode === 'dummy' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(15, 23, 42, 0.4)',
                    color: evalMode === 'dummy' ? '#c4b5fd' : 'var(--text-muted)',
                    cursor: isRunning ? 'not-allowed' : 'pointer'
                  }}
                >
                  ⚡ Quick Mode
                </button>
                <button
                  type="button"
                  onClick={() => setEvalMode('benchmark')}
                  disabled={isRunning}
                  style={{
                    padding: '8px',
                    fontSize: '12px',
                    fontWeight: '600',
                    borderRadius: '8px',
                    border: evalMode === 'benchmark' ? '1px solid #06b6d4' : '1px solid var(--border-subtle)',
                    background: evalMode === 'benchmark' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(15, 23, 42, 0.4)',
                    color: evalMode === 'benchmark' ? '#67e8f9' : 'var(--text-muted)',
                    cursor: isRunning ? 'not-allowed' : 'pointer'
                  }}
                >
                  🧠 LLM Benchmark
                </button>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Generations</span>
                <span className="font-mono" style={{ fontWeight: '600', color: '#818cf8' }}>{generations}</span>
              </div>
              <input
                type="range"
                min="2"
                max="30"
                value={generations}
                disabled={isRunning}
                onChange={(e) => setGenerations(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Population Size</span>
                <span className="font-mono" style={{ fontWeight: '600', color: '#818cf8' }}>{popSize}</span>
              </div>
              <input
                type="range"
                min="4"
                max="40"
                value={popSize}
                disabled={isRunning}
                onChange={(e) => setPopSize(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Crossover Probability (cxpb)</span>
                <span className="font-mono" style={{ fontWeight: '600', color: '#818cf8' }}>{cxpb}</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.9"
                step="0.05"
                value={cxpb}
                disabled={isRunning}
                onChange={(e) => setCxpb(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Mutation Probability (mutpb)</span>
                <span className="font-mono" style={{ fontWeight: '600', color: '#818cf8' }}>{mutpb}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.5"
                step="0.05"
                value={mutpb}
                disabled={isRunning}
                onChange={(e) => setMutpb(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Run Label (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Experiment_FastDecay_TopK8"
                value={runName}
                disabled={isRunning}
                onChange={(e) => setRunName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid var(--border-subtle)',
                  color: '#ffffff',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ marginTop: '8px' }}>
              {!isRunning ? (
                <button
                  type="submit"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: '700',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 15px rgba(79, 70, 229, 0.4)',
                    transition: 'all 0.2s'
                  }}
                >
                  <Play size={16} fill="#ffffff" />
                  Launch Evolution Run
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onStopEvolution}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: '700',
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 15px rgba(225, 29, 72, 0.4)'
                  }}
                >
                  <Square size={16} fill="#ffffff" />
                  Halt Active Run
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Champion Genome Summary Card */}
        {championGenome && (
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Sparkles size={18} color="#f59e0b" />
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#fbbf24' }}>Current Champion Genome</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '6px 10px', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Top-K: </span>
                <strong className="font-mono" style={{ color: '#38bdf8' }}>{championGenome.retrieval_top_k}</strong>
              </div>
              <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '6px 10px', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Forgetting: </span>
                <strong className="font-mono" style={{ color: '#38bdf8' }}>{championGenome.forgetting_rate.toFixed(2)}</strong>
              </div>
              <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '6px 10px', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Sim Thresh: </span>
                <strong className="font-mono" style={{ color: '#38bdf8' }}>{championGenome.similarity_threshold.toFixed(2)}</strong>
              </div>
              <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '6px 10px', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Capacity: </span>
                <strong className="font-mono" style={{ color: '#38bdf8' }}>{championGenome.memory_capacity}</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Visual Charts & Live Terminal Logs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Fitness Progression Chart */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                <TrendingUp size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Fitness Progression Trajectory</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Best fitness vs generation average score</p>
              </div>
            </div>

            {evolutionState?.active_run && (
              <div className="font-mono" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Run ID: <span style={{ color: '#818cf8', fontWeight: '600' }}>{evolutionState.active_run.run_id}</span>
              </div>
            )}
          </div>

          <div style={{ width: '100%', height: '260px' }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="generation" stroke="var(--text-dim)" fontSize={12} />
                  <YAxis stroke="var(--text-dim)" fontSize={12} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      borderColor: 'rgba(99, 102, 241, 0.3)',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '12px'
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="bestFitness"
                    name="Best Fitness (Champion)"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={{ fill: '#10b981', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgFitness"
                    name="Average Fitness"
                    stroke="#6366f1"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ fill: '#6366f1', r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
                <Dna size={40} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <p style={{ fontSize: '13px' }}>Launch an evolution run to stream live fitness trajectories</p>
              </div>
            )}
          </div>
        </div>

        {/* Live Execution Terminal */}
        <div className="glass-panel" style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={18} color="#94a3b8" />
              <h3 style={{ fontSize: '14px', fontWeight: '700' }}>Live Evolution Log Terminal</h3>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }} className="font-mono">
              {evolutionState?.logs?.length || 0} events logged
            </span>
          </div>

          <div
            ref={terminalRef}
            className="font-mono"
            style={{
              background: '#07090e',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '10px',
              padding: '14px',
              height: '240px',
              overflowY: 'auto',
              fontSize: '12px',
              lineHeight: '1.6',
              color: '#94a3b8',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            {evolutionState?.logs && evolutionState.logs.length > 0 ? (
              evolutionState.logs.map((log, idx) => {
                let color = '#94a3b8';
                if (log.includes('Gen ') || log.includes('Generation')) color = '#38bdf8';
                if (log.includes('Best Fitness') || log.includes('successfully completed')) color = '#34d399';
                if (log.includes('Warning') || log.includes('cancelled')) color = '#fbbf24';
                if (log.includes('Error') || log.includes('failed')) color = '#f87171';

                return (
                  <div key={idx} style={{ color }}>
                    {log}
                  </div>
                );
              })
            ) : (
              <div style={{ color: 'var(--text-dim)' }}>
                [System Ready] Evolution runner idle. Click 'Launch Evolution Run' to begin optimization.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
