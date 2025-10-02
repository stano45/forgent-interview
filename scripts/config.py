import os
from dataclasses import dataclass
from dotenv import load_dotenv

@dataclass(frozen=True)
class Config:
    api_key: str
    model: str
    max_output_tokens: int
    temperature: float

def load_config() -> Config:
    load_dotenv()
    return Config(
        api_key=os.getenv("ANTHROPIC_API_KEY", ""),
        model=os.getenv("MODEL", ""),
        max_output_tokens=int(os.getenv("MAX_OUTPUT_TOKENS", "")),
        temperature=float(os.getenv("TEMPERATURE", "")),
    )
