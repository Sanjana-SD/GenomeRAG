import React from 'react';
import { Dna, Activity, Database, Cpu, HardDrive, RefreshCw } from 'lucide-react';

export default function Header({ health, activeTab, setActiveTab, evolutionStatus, onRefreshHealth }) {
  return (
    <header className="glass-panel" style={{ padding: '16px 24px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
      {/* Brand & Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)'
        }}>
          <Dna size={26} color="#ffffff" className={evolutionStatus === 'running' ? 'animate-spin-slow' : ''} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '-0.02em', background: 'linear-gradient(to right, #ffffff, #cbd5e1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              GenomeRAG
            </h1>
            <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '6px', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.4)' }}>
              v1.0
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Evolutionary Memory Architecture for LLM Agents
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.6)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
        {[
          { id: 'evolution', label: '🧬 Evolution Engine' },
          { id: 'genome', label: '⚙️ Genome Studio' },
          { id: 'chat', label: '💬 Agent Playground' },
          { id: 'archive', label: '📊 Runs Archive' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: activeTab === tab.id ? '600' : '500',
              color: activeTab === tab.id ? '#ffffff' : 'var(--text-muted)',
              background: activeTab === tab.id ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: activeTab === tab.id ? '0 4px 12px rgba(79, 70, 229, 0.3)' : 'none'
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Health & Status Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Status Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: '600',
          background: evolutionStatus === 'running' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.15)',
          color: evolutionStatus === 'running' ? '#34d399' : '#94a3b8',
          border: `1px solid ${evolutionStatus === 'running' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(100, 116, 139, 0.3)'}`
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: evolutionStatus === 'running' ? '#10b981' : '#64748b',
            boxShadow: evolutionStatus === 'running' ? '0 0 8px #10b981' : 'none'
          }} className={evolutionStatus === 'running' ? 'animate-pulse-glow' : ''} />
          {evolutionStatus === 'running' ? 'EVOLVING' : 'IDLE'}
        </div>

        {/* System telemetry badges */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <div title="Qdrant Vector DB" style={{ padding: '6px', borderRadius: '8px', background: health?.qdrant ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: health?.qdrant ? '#10b981' : '#ef4444', border: '1px solid rgba(255,255,255,0.05)' }}>
            <Database size={16} />
          </div>
          <div title="Groq LLM Llama 3.1" style={{ padding: '6px', borderRadius: '8px', background: health?.groq ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: health?.groq ? '#10b981' : '#ef4444', border: '1px solid rgba(255,255,255,0.05)' }}>
            <Cpu size={16} />
          </div>
          <div title="Supabase DB" style={{ padding: '6px', borderRadius: '8px', background: health?.supabase ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: health?.supabase ? '#10b981' : '#ef4444', border: '1px solid rgba(255,255,255,0.05)' }}>
            <HardDrive size={16} />
          </div>
        </div>

        <button
          onClick={onRefreshHealth}
          title="Refresh connection status"
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
        >
          <RefreshCw size={15} />
        </button>
      </div>
    </header>
  );
}
