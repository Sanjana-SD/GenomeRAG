import React, { useState } from 'react';
import { Sliders, Cpu, Gauge, RefreshCw, Zap, Award, Sparkles, HelpCircle } from 'lucide-react';

const DEFAULT_BASELINE = {
  forgetting_rate: 0.2,
  episodic_weight: 0.5,
  semantic_weight: 0.5,
  confidence_threshold: 0.3,
  compression_ratio: 0.3,
  retrieval_top_k: 5,
  recency_bias: 0.3,
  consolidation_freq: 20,
  similarity_threshold: 0.6,
  memory_capacity: 200
};

const GENE_DESCRIPTIONS = {
  forgetting_rate: "Probability of pruning old, low-access memories during consolidation checkpoint.",
  episodic_weight: "Relative weight factor applied to raw episodic conversation logs during search.",
  semantic_weight: "Relative weight factor applied to consolidated semantic fact memories.",
  confidence_threshold: "Minimum confidence score required for an agent to formulate assertions.",
  compression_ratio: "Proportion of oldest episodic memories compressed into semantic summaries.",
  retrieval_top_k: "Number of top matching memories passed to the agent's LLM context window.",
  recency_bias: "Exponential time-decay penalty applied to favor fresher memories over older ones.",
  consolidation_freq: "Number of conversation steps between automatic memory consolidation passes.",
  similarity_threshold: "Cosine similarity cutoff below which memories are discarded from retrieval.",
  memory_capacity: "Maximum number of total vector memories stored before oldest are evicted."
};

export default function GenomeTab({ championGenome, onEvaluateGenome }) {
  const [customGenome, setCustomGenome] = useState({ ...(championGenome || DEFAULT_BASELINE) });
  const [evalResult, setEvalResult] = useState(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalMode, setEvalMode] = useState('dummy');

  const handleGeneChange = (gene, value) => {
    setCustomGenome((prev) => ({
      ...prev,
      [gene]: Number(value)
    }));
  };

  const handleEvaluate = async () => {
    setIsEvaluating(true);
    setEvalResult(null);
    try {
      const res = await onEvaluateGenome(customGenome, evalMode);
      setEvalResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsEvaluating(false);
    }
  };

  const resetToChampion = () => {
    if (championGenome) setCustomGenome({ ...championGenome });
  };

  const resetToBaseline = () => {
    setCustomGenome({ ...DEFAULT_BASELINE });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '24px' }}>
      {/* Left: 10 Parameter Sliders & Info */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '800' }}>Memory Genome Architecture Studio</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              10-parameter genetic blueprint controlling Qdrant vector retrieval & LangGraph memory dynamics
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={resetToBaseline}
              style={{
                padding: '6px 12px',
                fontSize: '11px',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                background: 'rgba(15, 23, 42, 0.6)',
                color: 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              Reset Baseline
            </button>
            {championGenome && (
              <button
                onClick={resetToChampion}
                style={{
                  padding: '6px 12px',
                  fontSize: '11px',
                  borderRadius: '6px',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#fbbf24',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Sparkles size={12} />
                Load Champion
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
          {/* Slider 1: forgetting_rate */}
          <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
              <span>Forgetting Rate</span>
              <span className="font-mono" style={{ color: '#818cf8' }}>{customGenome.forgetting_rate.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.01"
              value={customGenome.forgetting_rate}
              onChange={(e) => handleGeneChange('forgetting_rate', e.target.value)}
              style={{ width: '100%', marginBottom: '6px' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{GENE_DESCRIPTIONS.forgetting_rate}</p>
          </div>

          {/* Slider 2: episodic_weight */}
          <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
              <span>Episodic Weight</span>
              <span className="font-mono" style={{ color: '#38bdf8' }}>{customGenome.episodic_weight.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.01"
              value={customGenome.episodic_weight}
              onChange={(e) => handleGeneChange('episodic_weight', e.target.value)}
              style={{ width: '100%', marginBottom: '6px' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{GENE_DESCRIPTIONS.episodic_weight}</p>
          </div>

          {/* Slider 3: semantic_weight */}
          <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
              <span>Semantic Weight</span>
              <span className="font-mono" style={{ color: '#34d399' }}>{customGenome.semantic_weight.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.01"
              value={customGenome.semantic_weight}
              onChange={(e) => handleGeneChange('semantic_weight', e.target.value)}
              style={{ width: '100%', marginBottom: '6px' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{GENE_DESCRIPTIONS.semantic_weight}</p>
          </div>

          {/* Slider 4: confidence_threshold */}
          <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
              <span>Confidence Threshold</span>
              <span className="font-mono" style={{ color: '#f472b6' }}>{customGenome.confidence_threshold.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.01"
              value={customGenome.confidence_threshold}
              onChange={(e) => handleGeneChange('confidence_threshold', e.target.value)}
              style={{ width: '100%', marginBottom: '6px' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{GENE_DESCRIPTIONS.confidence_threshold}</p>
          </div>

          {/* Slider 5: compression_ratio */}
          <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
              <span>Compression Ratio</span>
              <span className="font-mono" style={{ color: '#fbbf24' }}>{customGenome.compression_ratio.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.01"
              value={customGenome.compression_ratio}
              onChange={(e) => handleGeneChange('compression_ratio', e.target.value)}
              style={{ width: '100%', marginBottom: '6px' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{GENE_DESCRIPTIONS.compression_ratio}</p>
          </div>

          {/* Slider 6: retrieval_top_k */}
          <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
              <span>Retrieval Top-K</span>
              <span className="font-mono" style={{ color: '#818cf8' }}>{customGenome.retrieval_top_k}</span>
            </div>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={customGenome.retrieval_top_k}
              onChange={(e) => handleGeneChange('retrieval_top_k', e.target.value)}
              style={{ width: '100%', marginBottom: '6px' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{GENE_DESCRIPTIONS.retrieval_top_k}</p>
          </div>

          {/* Slider 7: recency_bias */}
          <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
              <span>Recency Bias</span>
              <span className="font-mono" style={{ color: '#38bdf8' }}>{customGenome.recency_bias.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.01"
              value={customGenome.recency_bias}
              onChange={(e) => handleGeneChange('recency_bias', e.target.value)}
              style={{ width: '100%', marginBottom: '6px' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{GENE_DESCRIPTIONS.recency_bias}</p>
          </div>

          {/* Slider 8: consolidation_freq */}
          <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
              <span>Consolidation Frequency</span>
              <span className="font-mono" style={{ color: '#a78bfa' }}>{customGenome.consolidation_freq} turns</span>
            </div>
            <input
              type="range"
              min="5"
              max="100"
              step="5"
              value={customGenome.consolidation_freq}
              onChange={(e) => handleGeneChange('consolidation_freq', e.target.value)}
              style={{ width: '100%', marginBottom: '6px' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{GENE_DESCRIPTIONS.consolidation_freq}</p>
          </div>

          {/* Slider 9: similarity_threshold */}
          <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
              <span>Similarity Threshold</span>
              <span className="font-mono" style={{ color: '#34d399' }}>{customGenome.similarity_threshold.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.01"
              value={customGenome.similarity_threshold}
              onChange={(e) => handleGeneChange('similarity_threshold', e.target.value)}
              style={{ width: '100%', marginBottom: '6px' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{GENE_DESCRIPTIONS.similarity_threshold}</p>
          </div>

          {/* Slider 10: memory_capacity */}
          <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
              <span>Memory Capacity</span>
              <span className="font-mono" style={{ color: '#fb7185' }}>{customGenome.memory_capacity} items</span>
            </div>
            <input
              type="range"
              min="50"
              max="1000"
              step="10"
              value={customGenome.memory_capacity}
              onChange={(e) => handleGeneChange('memory_capacity', e.target.value)}
              style={{ width: '100%', marginBottom: '6px' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{GENE_DESCRIPTIONS.memory_capacity}</p>
          </div>
        </div>
      </div>

      {/* Right: Genome Evaluation & Comparison */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Evaluator Card */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4' }}>
              <Gauge size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Fitness Evaluator</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Score your configured genome</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              onClick={() => setEvalMode('dummy')}
              style={{
                flex: 1,
                padding: '8px',
                fontSize: '12px',
                fontWeight: '600',
                borderRadius: '8px',
                border: evalMode === 'dummy' ? '1px solid #8b5cf6' : '1px solid var(--border-subtle)',
                background: evalMode === 'dummy' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(15, 23, 42, 0.4)',
                color: evalMode === 'dummy' ? '#c4b5fd' : 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              Quick Test
            </button>
            <button
              onClick={() => setEvalMode('benchmark')}
              style={{
                flex: 1,
                padding: '8px',
                fontSize: '12px',
                fontWeight: '600',
                borderRadius: '8px',
                border: evalMode === 'benchmark' ? '1px solid #06b6d4' : '1px solid var(--border-subtle)',
                background: evalMode === 'benchmark' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(15, 23, 42, 0.4)',
                color: evalMode === 'benchmark' ? '#67e8f9' : 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              LLM Benchmark
            </button>
          </div>

          <button
            onClick={handleEvaluate}
            disabled={isEvaluating}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
              color: '#ffffff',
              border: 'none',
              fontWeight: '700',
              fontSize: '14px',
              cursor: isEvaluating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 15px rgba(6, 182, 212, 0.3)'
            }}
          >
            {isEvaluating ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Evaluating Genome...
              </>
            ) : (
              <>
                <Zap size={16} />
                Calculate Fitness Score
              </>
            )}
          </button>

          {evalResult && (
            <div style={{ marginTop: '16px', padding: '16px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <div style={{ fontSize: '12px', color: '#34d399', fontWeight: '600', marginBottom: '4px' }}>
                Evaluation Score ({evalResult.eval_mode.toUpperCase()})
              </div>
              <div className="font-mono" style={{ fontSize: '28px', fontWeight: '800', color: '#ffffff' }}>
                {evalResult.fitness}
              </div>
            </div>
          )}
        </div>

        {/* Genome Comparison Card */}
        <div className="glass-panel" style={{ padding: '24px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Award size={18} color="#f59e0b" />
            <h3 style={{ fontSize: '15px', fontWeight: '700' }}>Gene Archetype Comparison</h3>
          </div>

          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                <th style={{ textAlign: 'left', paddingBottom: '8px' }}>Gene</th>
                <th style={{ textAlign: 'right', paddingBottom: '8px' }}>Baseline</th>
                <th style={{ textAlign: 'right', paddingBottom: '8px', color: '#fbbf24' }}>Champion</th>
                <th style={{ textAlign: 'right', paddingBottom: '8px', color: '#38bdf8' }}>Custom</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {[
                { label: 'top_k', key: 'retrieval_top_k', format: (v) => v },
                { label: 'forget_rate', key: 'forgetting_rate', format: (v) => Number(v).toFixed(2) },
                { label: 'episodic_w', key: 'episodic_weight', format: (v) => Number(v).toFixed(2) },
                { label: 'semantic_w', key: 'semantic_weight', format: (v) => Number(v).toFixed(2) },
                { label: 'recency_bias', key: 'recency_bias', format: (v) => Number(v).toFixed(2) },
                { label: 'sim_thresh', key: 'similarity_threshold', format: (v) => Number(v).toFixed(2) },
                { label: 'capacity', key: 'memory_capacity', format: (v) => v }
              ].map((row) => (
                <tr key={row.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '6px 0', color: 'var(--text-main)' }}>{row.label}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-dim)' }}>{row.format(DEFAULT_BASELINE[row.key])}</td>
                  <td style={{ textAlign: 'right', color: '#fbbf24' }}>
                    {championGenome ? row.format(championGenome[row.key]) : '-'}
                  </td>
                  <td style={{ textAlign: 'right', color: '#38bdf8', fontWeight: '600' }}>
                    {row.format(customGenome[row.key])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
