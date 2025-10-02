from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from typing import List, AsyncGenerator
import json, asyncio, os
import logging

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

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Allow local frontend dev (Next.js on port 3000). Can override with comma separated ALLOWED_ORIGINS env.
allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
if allowed_origins_env:
    allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
else:
    allowed_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/upload")
async def upload(files: List[UploadFile] = File(...)):
    logger.info("Received upload request with %d files", len(files))
    stored = []
    for uf in files:
        logger.info("Processing file: %s", uf.filename)
        data = await uf.read()
        if not data:
            logger.error("Empty file: %s", uf.filename)
            raise HTTPException(status_code=400, detail=f"Empty file: {uf.filename}")
        file_id = insert_file(uf.filename, data)
        logger.info("File %s stored with ID: %s", uf.filename, file_id)
        stored.append({"id": file_id, "filename": uf.filename})
    logger.info("Successfully stored %d files", len(stored))
    return {"files": stored, "count": len(stored)}

@app.post("/ask")
async def ask(payload: dict):
    logger.info("Received ask request with payload: %s", payload)
    questions: List[dict] = payload.get("questions") or []
    conditions: List[dict] = payload.get("conditions") or []
    file_ids: List[str] = payload.get("file_ids") or []

    if not questions and not conditions:
        logger.error("No questions or conditions provided")
        raise HTTPException(status_code=400, detail="Provide at least one question or condition")

    if not file_ids:
        logger.error("No file IDs provided")
        raise HTTPException(status_code=400, detail="Provide file IDs for processing")

    logger.info("Fetching file paths for provided file IDs")
    paths = get_file_paths_by_ids(file_ids)
    if not paths:
        logger.error("No valid files found for provided file_ids")
        raise HTTPException(status_code=400, detail="No valid files found for provided file_ids")

    logger.info("Initializing Anthropic client")
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
        logger.info("Uploading files to Anthropic")
        anthropic_file_ids = client.upload_files(paths)
        for q in questions:
            logger.info("Processing question: %s", q["text"])
            prompt = build_question_prompt(q["text"]) + "\nNur das JSON Objekt. Keine Erklärungen, KEINE Backticks."
            res = client.ask_with_files([{"text": prompt}], anthropic_file_ids)
            raw_txt = extract_text_blocks(res)
            answer = parse_question_answer(raw_txt)
            yield json.dumps({
                "type": "question_result",
                "id": q["id"],
                "question": q["text"],
                "answer": answer,
                "raw": raw_txt,
            }, ensure_ascii=False).encode() + b"\n"
            await asyncio.sleep(0)
        for c in conditions:
            logger.info("Processing condition: %s", c["text"])
            prompt = build_condition_prompt(c["text"]) + "\nNur das JSON Objekt. Keine Erklärungen, KEINE Backticks."
            res = client.ask_with_files([{"text": prompt}], anthropic_file_ids)
            raw_txt = extract_text_blocks(res)
            result = parse_condition_answer(raw_txt)
            yield json.dumps({
                "type": "condition_result",
                "id": c["id"],
                "condition": c["text"],
                "result": result,
                "raw": raw_txt,
            }, ensure_ascii=False).encode() + b"\n"
            await asyncio.sleep(0)
        logger.info("Streaming completed")
        yield b"{\"type\": \"done\"}\n"

    return StreamingResponse(stream(), media_type="application/jsonl")

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
    logger.info("Health check endpoint called")
    return {"status": "ok"}

@app.get("/files")
async def list_files():
    logger.info("List files endpoint called")
    files = fetch_all_files()
    logger.info("Fetched %d files", len(files))
    return {"files": [{"id": fid, "filename": fname} for fid, fname, _ in files]}
