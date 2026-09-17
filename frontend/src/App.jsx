import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import EvolutionTab from './components/EvolutionTab';
import GenomeTab from './components/GenomeTab';
import ChatTab from './components/ChatTab';
import ArchiveTab from './components/ArchiveTab';

const API_BASE = '/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('evolution');
  const [health, setHealth] = useState({ qdrant: true, groq: true, supabase: true, status: 'healthy' });
  const [evolutionState, setEvolutionState] = useState({
    status: 'idle',
    active_run: null,
    generation_history: [],
    logs: []
  });
  const [championGenome, setChampionGenome] = useState(null);

  // Fetch health and evolution status on mount
  useEffect(() => {
    fetchHealth();
    fetchEvolutionStatus();
  }, []);

  // Poll evolution status every 1.5s when running, or 5s when idle
  useEffect(() => {
    const intervalTime = evolutionState.status === 'running' ? 1500 : 5000;
    const interval = setInterval(() => {
      fetchEvolutionStatus();
    }, intervalTime);
    return () => clearInterval(interval);
  }, [evolutionState.status]);

  const fetchHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (e) {
      console.warn("Health check error:", e);
    }
  };

  const fetchEvolutionStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/evolution/status`);
      if (res.ok) {
        const data = await res.json();
        setEvolutionState(data);
        if (data.active_run?.best_genome) {
          setChampionGenome(data.active_run.best_genome);
        } else if (data.generation_history?.length > 0) {
          const lastGen = data.generation_history[data.generation_history.length - 1];
          if (lastGen?.best_genome) {
            setChampionGenome(lastGen.best_genome);
          }
        }
      }
    } catch (e) {
      console.warn("Status fetch error:", e);
    }
  };

  const handleStartEvolution = async (payload) => {
    try {
      const res = await fetch(`${API_BASE}/evolution/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to start evolution');
      fetchEvolutionStatus();
      return data;
    } catch (e) {
      alert(e.message);
      throw e;
    }
  };

  const handleStopEvolution = async () => {
    try {
      const res = await fetch(`${API_BASE}/evolution/stop`, { method: 'POST' });
      const data = await res.json();
      fetchEvolutionStatus();
      return data;
    } catch (e) {
      console.error(e);
    }
  };

  const handleEvaluateGenome = async (genome, evalMode) => {
    const res = await fetch(`${API_BASE}/agent/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genome, eval_mode: evalMode })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Evaluation failed');
    }
    return await res.json();
  };

  const handleSendMessage = async (payload) => {
    const res = await fetch(`${API_BASE}/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Chat request failed');
    }
    return await res.json();
  };

  const handleFetchMemories = async () => {
    const res = await fetch(`${API_BASE}/memories`);
    if (!res.ok) throw new Error('Failed to fetch vector memories');
    return await res.json();
  };

  const handleClearMemories = async () => {
    const res = await fetch(`${API_BASE}/memories`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to clear memories');
    return await res.json();
  };

  const handleFetchRuns = async () => {
    const res = await fetch(`${API_BASE}/runs`);
    if (!res.ok) throw new Error('Failed to fetch runs');
    return await res.json();
  };

  const handleFetchRunDetails = async (runId) => {
    const res = await fetch(`${API_BASE}/runs/${runId}`);
    if (!res.ok) throw new Error('Failed to fetch run details');
    return await res.json();
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 20px' }}>
      <Header
        health={health}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        evolutionStatus={evolutionState.status}
        onRefreshHealth={fetchHealth}
      />

      <main>
        {activeTab === 'evolution' && (
          <EvolutionTab
            evolutionState={evolutionState}
            onStartEvolution={handleStartEvolution}
            onStopEvolution={handleStopEvolution}
            championGenome={championGenome}
          />
        )}

        {activeTab === 'genome' && (
          <GenomeTab
            championGenome={championGenome}
            onEvaluateGenome={handleEvaluateGenome}
          />
        )}

        {activeTab === 'chat' && (
          <ChatTab
            championGenome={championGenome}
            onSendMessage={handleSendMessage}
            onClearMemories={handleClearMemories}
            onFetchMemories={handleFetchMemories}
          />
        )}

        {activeTab === 'archive' && (
          <ArchiveTab
            onFetchRuns={handleFetchRuns}
            onFetchRunDetails={handleFetchRunDetails}
          />
        )}
      </main>
    </div>
  );
}
