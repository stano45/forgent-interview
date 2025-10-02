from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from typing import List, AsyncGenerator
import tempfile, json, asyncio
from pathlib import Path

from config import load_config
from anthropic_client import AnthropicClient
from prompts import (
    DEFAULT_SYSTEM,
    JSON_ENFORCEMENT_HINT,
    build_question_prompt,
    build_condition_prompt,
)
from database import insert_file, get_file_paths, fetch_all_files, get_file_paths_by_ids

app = FastAPI(title="Forgent Checklist API", version="0.1.0")

@app.post("/upload")
async def upload(files: List[UploadFile] = File(...)):
    stored = []
    for uf in files:
        data = await uf.read()
        if not data:
            raise HTTPException(status_code=400, detail=f"Empty file: {uf.filename}")
        file_id = insert_file(uf.filename, data)
        stored.append({"id": file_id, "filename": uf.filename})
    return {"files": stored, "count": len(stored)}

@app.post("/ask")
async def ask(payload: dict):
    """Submit questions/conditions and stream structured JSONL results.

    Request body example:
    {"questions": ["..."], "conditions": ["..."], "file_ids": ["uuid1", "uuid2"]}
    """
    questions: List[str] = payload.get("questions") or []
    conditions: List[str] = payload.get("conditions") or []
    file_ids: List[str] = payload.get("file_ids") or []
    
    if not questions and not conditions:
        raise HTTPException(status_code=400, detail="Provide at least one question or condition")
    
    # If no file_ids specified, use all files (backward compatibility)
    if not file_ids:
        paths = get_file_paths()
    else:
        paths = get_file_paths_by_ids(file_ids)
        if not paths:
            raise HTTPException(status_code=400, detail="No valid files found for provided file_ids")

    config = load_config()
    system_prompt = DEFAULT_SYSTEM + "\n" + JSON_ENFORCEMENT_HINT
    client = AnthropicClient(
        api_key=config.api_key,
        model=config.model,
        temperature=config.temperature,
        max_tokens=config.max_output_tokens,
        system=system_prompt,
    )

    async def stream() -> AsyncGenerator[bytes, None]:
        # Use the paths we already resolved above
        anthropic_file_ids = client.upload_files(paths)
        # Questions
        for q in questions:
            prompt = build_question_prompt(q) + "\nNur das JSON Objekt. Keine Erklärungen, KEINE Backticks."
            res = client.ask_with_files([{"text": prompt}], anthropic_file_ids)
            raw_txt = extract_text_blocks(res)
            answer = parse_question_answer(raw_txt)
            yield json.dumps({
                "type": "question_result",
                "question": q,
                "answer": answer,
                "raw": raw_txt,
            }, ensure_ascii=False).encode() + b"\n"
            await asyncio.sleep(0)
        # Conditions
        for c in conditions:
            prompt = build_condition_prompt(c) + "\nNur das JSON Objekt. Keine Erklärungen, KEINE Backticks."
            res = client.ask_with_files([{"text": prompt}], anthropic_file_ids)
            raw_txt = extract_text_blocks(res)
            result = parse_condition_answer(raw_txt)
            yield json.dumps({
                "type": "condition_result",
                "condition": c,
                "result": result,
                "raw": raw_txt,
            }, ensure_ascii=False).encode() + b"\n"
            await asyncio.sleep(0)
        yield b"{\"type\": \"done\"}\n"

    return StreamingResponse(stream(), media_type="application/jsonl")

# Utility replicate from CLI script
def extract_text_blocks(msg) -> str:
    raw = "\n".join([
        (getattr(blk, "text", None).text if hasattr(getattr(blk, "text", None), "text") else getattr(blk, "text", None))
        for blk in getattr(msg, "content", [])
        if getattr(blk, "type", None) == "text"
    ]).strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        raw = "\n".join(lines).strip()
    if raw.lower().startswith("json\n"):
        raw = raw[5:].strip()
    return raw


def parse_question_answer(raw: str) -> str:
    """Extract the 'antwort' field if JSON, else fallback."""
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            val = parsed.get("antwort") or parsed.get("answer")
            if isinstance(val, str) and val.strip():
                return val.strip()
    except Exception:
        pass
    return "Unklar"


def parse_condition_answer(raw: str) -> bool:
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            if isinstance(parsed.get("result"), bool):
                return parsed["result"]
            if isinstance(parsed.get("answer"), bool):
                return parsed["answer"]
    except Exception:
        pass
    return False

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/files")
async def list_files():
    """List all uploaded files with their IDs."""
    files = fetch_all_files()
    return {"files": [{"id": fid, "filename": fname} for fid, fname, _ in files]}
