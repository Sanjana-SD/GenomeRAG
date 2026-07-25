from typing import List, Dict, Any, TypedDict
from genome.genome import MemoryGenome

class AgentState(TypedDict):
    messages: List[Dict[str, str]]       # Conversation history: [{"role": "user"|"assistant", "content": str}]
    current_input: str                   # Latest user message
    retrieved_memories: List[Dict[str, Any]] # Memories retrieved from vector DB
    response: str                        # Final generated answer
    step: int                            # Step count for this session (for consolidation frequency checks)
    genome: MemoryGenome                 # The genome defining memory behaviors
    agent_logs: List[str]                # Audit log showing memory retrieval, consolidation, and forgetting details
