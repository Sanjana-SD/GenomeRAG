from dataclasses import dataclass, fields
import json

@dataclass
class MemoryGenome:
    forgetting_rate: float = 0.2         # 0.0 - 1.0
    episodic_weight: float = 0.5         # 0.0 - 1.0
    semantic_weight: float = 0.5         # 0.0 - 1.0
    confidence_threshold: float = 0.3    # 0.0 - 1.0
    compression_ratio: float = 0.3       # 0.0 - 1.0
    retrieval_top_k: int = 5             # 1 - 20 (integer)
    recency_bias: float = 0.3            # 0.0 - 1.0
    consolidation_freq: int = 20         # 5 - 100 (integer)
    similarity_threshold: float = 0.6    # 0.0 - 1.0
    memory_capacity: int = 200           # 50 - 1000 (integer)

    def __post_init__(self):
        # Validation and clamping
        self.forgetting_rate = max(0.0, min(1.0, float(self.forgetting_rate)))
        self.episodic_weight = max(0.0, min(1.0, float(self.episodic_weight)))
        self.semantic_weight = max(0.0, min(1.0, float(self.semantic_weight)))
        self.confidence_threshold = max(0.0, min(1.0, float(self.confidence_threshold)))
        self.compression_ratio = max(0.0, min(1.0, float(self.compression_ratio)))
        
        # Ensure integers for top_k, consolidation_freq, and memory_capacity
        self.retrieval_top_k = max(1, min(20, int(round(self.retrieval_top_k))))
        self.recency_bias = max(0.0, min(1.0, float(self.recency_bias)))
        self.consolidation_freq = max(5, min(100, int(round(self.consolidation_freq))))
        self.similarity_threshold = max(0.0, min(1.0, float(self.similarity_threshold)))
        self.memory_capacity = max(50, min(1000, int(round(self.memory_capacity))))

    def to_dict(self) -> dict:
        return {f.name: getattr(self, f.name) for f in fields(self)}

    def to_json(self) -> str:
        return json.dumps(self.to_dict())

    @classmethod
    def from_dict(cls, data: dict) -> 'MemoryGenome':
        return cls(**{f.name: data[f.name] for f in fields(cls) if f.name in data})

    @classmethod
    def from_list(cls, genes: list) -> 'MemoryGenome':
        """Constructs a MemoryGenome from a 10-gene list for GA representation."""
        if len(genes) != 10:
            raise ValueError("Genes list must have exactly 10 parameters.")
        return cls(
            forgetting_rate=genes[0],
            episodic_weight=genes[1],
            semantic_weight=genes[2],
            confidence_threshold=genes[3],
            compression_ratio=genes[4],
            retrieval_top_k=genes[5],
            recency_bias=genes[6],
            consolidation_freq=genes[7],
            similarity_threshold=genes[8],
            memory_capacity=genes[9]
        )

    def to_list(self) -> list:
        """Converts the MemoryGenome to a 10-gene list."""
        return [
            self.forgetting_rate,
            self.episodic_weight,
            self.semantic_weight,
            self.confidence_threshold,
            self.compression_ratio,
            self.retrieval_top_k,
            self.recency_bias,
            self.consolidation_freq,
            self.similarity_threshold,
            self.memory_capacity
        ]
