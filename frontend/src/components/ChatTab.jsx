import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Brain, Trash2, Sparkles, RefreshCw, Cpu, Database, ChevronRight, Layers } from 'lucide-react';

export default function ChatTab({ championGenome, onSendMessage, onClearMemories, onFetchMemories }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hello! I am GenomeRAG, an autonomous agent powered by an evolving memory architecture. Tell me facts about yourself, or ask questions to test my memory retrieval and consolidation.",
      retrieved_memories: [],
      agent_logs: []
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [genomeMode, setGenomeMode] = useState('champion'); // baseline, champion, custom
  const [selectedTurnData, setSelectedTurnData] = useState(null);
  const [memoriesList, setMemoriesList] = useState([]);
  const [isRefreshingMemories, setIsRefreshingMemories] = useState(false);
  const [stepCount, setStepCount] = useState(0);

  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    loadMemories();
  }, []);

  const loadMemories = async () => {
    setIsRefreshingMemories(true);
    try {
      const data = await onFetchMemories();
      setMemoriesList(data?.memories || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshingMemories(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    
    // Add user message to UI
    const updatedMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const selectedGenome = genomeMode === 'champion' && championGenome ? championGenome : undefined;
      const historyPayload = messages.map((m) => ({ role: m.role, content: m.content }));

      const res = await onSendMessage({
        message: userMessage,
        history: historyPayload,
        genome: selectedGenome,
        step: stepCount
      });

      const assistantMsg = {
        role: 'assistant',
        content: res.response,
        retrieved_memories: res.retrieved_memories || [],
        agent_logs: res.agent_logs || []
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setSelectedTurnData(assistantMsg);
      setStepCount(res.step || (stepCount + 1));
      loadMemories();
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${e.message || 'Failed to generate response'}`,
          retrieved_memories: [],
          agent_logs: []
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    if (confirm("Are you sure you want to clear all stored vector memories from Qdrant?")) {
      await onClearMemories();
      loadMemories();
      setSelectedTurnData(null);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', height: 'calc(100vh - 160px)' }}>
      {/* Left: Chat Window */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Chat Header & Genome Switcher */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 23, 42, 0.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Bot size={20} color="#818cf8" />
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '700' }}>Agent Dialogue Playground</h3>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Step {stepCount} | LangGraph Architecture</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Active Genome:</span>
            <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.8)', padding: '2px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setGenomeMode('baseline')}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: '600',
                  borderRadius: '6px',
                  border: 'none',
                  background: genomeMode === 'baseline' ? '#475569' : 'transparent',
                  color: genomeMode === 'baseline' ? '#ffffff' : 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                Baseline
              </button>
              <button
                onClick={() => setGenomeMode('champion')}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: '600',
                  borderRadius: '6px',
                  border: 'none',
                  background: genomeMode === 'champion' ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 'transparent',
                  color: genomeMode === 'champion' ? '#ffffff' : 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Sparkles size={11} />
                Champion
              </button>
            </div>
          </div>
        </div>

        {/* Chat Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                  gap: '10px',
                  maxWidth: '85%',
                  alignSelf: isUser ? 'flex-end' : 'flex-start'
                }}
              >
                {!isUser && (
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Bot size={18} color="#818cf8" />
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: isUser ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' : 'rgba(30, 41, 59, 0.7)',
                      border: isUser ? 'none' : '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '14px',
                      lineHeight: '1.5',
                      boxShadow: isUser ? '0 4px 12px rgba(79, 70, 229, 0.2)' : 'none'
                    }}
                  >
                    {msg.content}
                  </div>

                  {!isUser && msg.retrieved_memories && msg.retrieved_memories.length > 0 && (
                    <button
                      onClick={() => setSelectedTurnData(msg)}
                      style={{
                        alignSelf: 'flex-start',
                        background: 'transparent',
                        border: 'none',
                        color: '#38bdf8',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}
                    >
                      <Brain size={12} />
                      Recalled {msg.retrieved_memories.length} memories
                    </button>
                  )}
                </div>

                {isUser && (
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(14, 165, 233, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={18} color="#38bdf8" />
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && (
            <div style={{ display: 'flex', gap: '10px', alignSelf: 'flex-start' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={18} color="#818cf8" />
              </div>
              <div style={{ padding: '12px 16px', borderRadius: '16px 16px 16px 4px', background: 'rgba(30, 41, 59, 0.7)', border: '1px solid var(--border-subtle)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span className="animate-pulse-glow" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Retrieving from Qdrant & reasoning...</span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Chat Input */}
        <form onSubmit={handleSend} style={{ padding: '16px 20px', borderTop: '1px solid var(--border-subtle)', background: 'rgba(15, 23, 42, 0.4)', display: 'flex', gap: '12px' }}>
          <input
            type="text"
            placeholder="Tell me a fact or query my memory (e.g. 'My favorite coffee is Espresso')..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: '10px',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid var(--border-subtle)',
              color: '#ffffff',
              fontSize: '14px',
              outline: 'none'
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            style={{
              padding: '0 20px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              color: '#ffffff',
              border: 'none',
              cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
              opacity: isLoading || !input.trim() ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontWeight: '600'
            }}
          >
            <Send size={16} />
            Send
          </button>
        </form>
      </div>

      {/* Right: Real-time Memory Recall & Vector Store Inspector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
        {/* Turn Recall Inspector */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Brain size={18} color="#38bdf8" />
            <h3 style={{ fontSize: '15px', fontWeight: '700' }}>Recalled Memories Drawer</h3>
          </div>

          {selectedTurnData && selectedTurnData.retrieved_memories && selectedTurnData.retrieved_memories.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {selectedTurnData.retrieved_memories.map((mem, i) => (
                <div key={i} style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      background: mem.metadata?.type === 'semantic' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                      color: mem.metadata?.type === 'semantic' ? '#34d399' : '#38bdf8'
                    }}>
                      {mem.metadata?.type || 'episodic'}
                    </span>
                    <span className="font-mono" style={{ color: '#a78bfa' }}>
                      score: {mem.final_score ? mem.final_score.toFixed(3) : 'N/A'}
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-main)', lineHeight: '1.4' }}>{mem.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-dim)', fontSize: '12px', textAlign: 'center', padding: '20px 0' }}>
              Send a query or click 'Recalled memories' under an agent turn to inspect retrieved embeddings.
            </div>
          )}
        </div>

        {/* Vector DB Memory Store */}
        <div className="glass-panel" style={{ padding: '20px', flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={18} color="#10b981" />
              <h3 style={{ fontSize: '15px', fontWeight: '700' }}>Qdrant Vector Store</h3>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={loadMemories}
                disabled={isRefreshingMemories}
                title="Refresh memories"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              >
                <RefreshCw size={14} className={isRefreshingMemories ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={handleClear}
                title="Clear all memories"
                style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '10px' }}>
            Total Memories: <strong style={{ color: '#ffffff' }}>{memoriesList.length}</strong>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
            {memoriesList.length > 0 ? (
              memoriesList.map((m, idx) => (
                <div key={idx} style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '8px 10px', borderRadius: '6px', fontSize: '11px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-dim)', marginBottom: '2px' }}>
                    <span>Step {m.metadata?.step || '-'}</span>
                    <span style={{ textTransform: 'capitalize' }}>{m.metadata?.type || 'episodic'}</span>
                  </div>
                  <div style={{ color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.text}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--text-dim)', fontSize: '12px', textAlign: 'center', padding: '16px 0' }}>
                No memories currently stored in Qdrant.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
