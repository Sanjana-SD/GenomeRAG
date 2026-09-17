from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class GenomeSchema(BaseModel):
    forgetting_rate: float = Field(0.2, ge=0.0, le=1.0)
    episodic_weight: float = Field(0.5, ge=0.0, le=1.0)
    semantic_weight: float = Field(0.5, ge=0.0, le=1.0)
    confidence_threshold: float = Field(0.3, ge=0.0, le=1.0)
    compression_ratio: float = Field(0.3, ge=0.0, le=1.0)
    retrieval_top_k: int = Field(5, ge=1, le=20)
    recency_bias: float = Field(0.3, ge=0.0, le=1.0)
    consolidation_freq: int = Field(20, ge=5, le=100)
    similarity_threshold: float = Field(0.6, ge=0.0, le=1.0)
    memory_capacity: int = Field(200, ge=50, le=1000)

class StartEvolutionRequest(BaseModel):
    pop_size: int = Field(10, ge=4, le=100)
    generations: int = Field(5, ge=1, le=50)
    cxpb: float = Field(0.5, ge=0.0, le=1.0)
    mutpb: float = Field(0.2, ge=0.0, le=1.0)
    eval_mode: str = Field("dummy", pattern="^(dummy|benchmark)$")
    run_name: Optional[str] = None

class ChatMessage(BaseModel):
    role: str
    content: str

class AgentChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = Field(default_factory=list)
    genome: Optional[GenomeSchema] = None
    step: Optional[int] = 0

class AgentChatResponse(BaseModel):
    response: str
    retrieved_memories: List[Dict[str, Any]]
    step: int
    agent_logs: List[str]

class EvaluateGenomeRequest(BaseModel):
    genome: GenomeSchema
    eval_mode: str = Field("dummy", pattern="^(dummy|benchmark)$")

class HealthResponse(BaseModel):
    status: str
    qdrant: bool
    groq: bool
    supabase: bool
    message: str
