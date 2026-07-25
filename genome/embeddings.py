import torch
from sentence_transformers import SentenceTransformer

# Force CPU execution for sentence transformers to keep resource usage predictable
device = "cpu"

# Load the sentence transformer model globally (cached)
_model = None

def get_model():
    global _model
    if _model is None:
        # Load model with cpu setting
        _model = SentenceTransformer("all-MiniLM-L6-v2", device=device)
    return _model

def get_embedding(text: str) -> list[float]:
    """Generates a 384-dimensional vector embedding for the input text."""
    model = get_model()
    # If text is empty or only whitespace, return a zero vector
    if not text.strip():
        return [0.0] * 384
    
    embedding = model.encode(text)
    return embedding.tolist()
