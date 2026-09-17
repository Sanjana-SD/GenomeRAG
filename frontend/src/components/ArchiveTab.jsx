import React, { useState, useEffect } from 'react';
import { History, Sparkles, RefreshCw, ChevronRight, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function ArchiveTab({ onFetchRuns, onFetchRunDetails }) {
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [runDetails, setRunDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    loadRuns();
  }, []);

  const loadRuns = async () => {
    setIsLoading(true);
    try {
      const data = await onFetchRuns();
      setRuns(data?.runs || []);
      if (data?.runs?.length > 0 && !selectedRunId) {
        handleSelectRun(data.runs[0].run_id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectRun = async (runId) => {
    setSelectedRunId(runId);
    setIsLoadingDetails(true);
    try {
      const details = await onFetchRunDetails(runId);
      setRunDetails(details);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const chartData = (runDetails?.generations || []).map((gen) => ({
    generation: `Gen ${gen.generation_number !== undefined ? gen.generation_number : gen.generation}`,
    bestFitness: gen.best_fitness,
    avgFitness: gen.avg_fitness
  }));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '24px' }}>
      {/* Left: Runs List */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={18} color="#818cf8" />
            <h2 style={{ fontSize: '16px', fontWeight: '700' }}>Supabase Runs Archive</h2>
          </div>
          <button
            onClick={loadRuns}
            disabled={isLoading}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '550px' }}>
          {runs.length > 0 ? (
            runs.map((r) => {
              const isSelected = selectedRunId === r.run_id;
              return (
                <div
                  key={r.run_id}
                  onClick={() => handleSelectRun(r.run_id)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'rgba(15, 23, 42, 0.4)',
                    border: isSelected ? '1px solid #6366f1' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div className="font-mono" style={{ fontSize: '13px', fontWeight: '700', color: isSelected ? '#ffffff' : 'var(--text-main)' }}>
                      {r.run_id}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      <span style={{
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontWeight: '600',
                        textTransform: 'uppercase',
                        background: r.status === 'completed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                        color: r.status === 'completed' ? '#34d399' : '#818cf8'
                      }}>
                        {r.status}
                      </span>
                      {r.best_fitness !== undefined && r.best_fitness !== null && (
                        <span>Fit: <strong style={{ color: '#38bdf8' }}>{Number(r.best_fitness).toFixed(3)}</strong></span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} color={isSelected ? '#818cf8' : 'var(--text-dim)'} />
                </div>
              );
            })
          ) : (
            <div style={{ color: 'var(--text-dim)', fontSize: '12px', textAlign: 'center', padding: '30px 0' }}>
              No past runs found in database.
            </div>
          )}
        </div>
      </div>

      {/* Right: Selected Run Details & Curve */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {selectedRunId && runDetails ? (
          <>
            {/* Trajectory */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Run Telemetry: {selectedRunId}</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Historical fitness trajectory recorded in Supabase</p>
                </div>
                {runDetails.run?.best_fitness !== undefined && (
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Final Best Fitness</span>
                    <div className="font-mono" style={{ fontSize: '20px', fontWeight: '800', color: '#10b981' }}>
                      {Number(runDetails.run.best_fitness).toFixed(4)}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ width: '100%', height: '240px' }}>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="generation" stroke="var(--text-dim)" fontSize={12} />
                      <YAxis stroke="var(--text-dim)" fontSize={12} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(15, 23, 42, 0.95)',
                          borderColor: 'rgba(99, 102, 241, 0.3)',
                          borderRadius: '8px',
                          color: '#ffffff',
                          fontSize: '12px'
                        }}
                      />
                      <Line type="monotone" dataKey="bestFitness" name="Best Fitness" stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="avgFitness" name="Average Fitness" stroke="#6366f1" strokeWidth={2} strokeDasharray="3 3" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
                    No generation telemetry recorded for this run.
                  </div>
                )}
              </div>
            </div>

            {/* Best Genome Parameters */}
            {runDetails.run?.best_genome && (
              <div className="glass-panel" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Sparkles size={18} color="#f59e0b" />
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#fbbf24' }}>Evolved Champion Genome Snapshot</h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                  {Object.entries(runDetails.run.best_genome).map(([key, val]) => (
                    <div key={key} style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{key}</div>
                      <div className="font-mono" style={{ fontSize: '14px', fontWeight: '700', color: '#38bdf8', marginTop: '2px' }}>
                        {typeof val === 'number' && !Number.isInteger(val) ? val.toFixed(3) : val}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="glass-panel" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
            Select a run from the left panel to inspect telemetry.
          </div>
        )}
      </div>
    </div>
  );
}
