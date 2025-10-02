# Forgent Interview API

Very small FastAPI wrapper exposing endpoints to:

1. POST /upload  - multipart form files; stores raw bytes in sqlite `files.db` inside api folder.
2. POST /ask     - JSON body: {"questions": [...], "conditions": [...]} -> streams JSONL with per-item results.

Streaming format (one JSON object per line):
{"type":"question_result","question":"...","raw":"<model raw JSON>"}
{"type":"condition_result","condition":"...","raw":"<model raw JSON>"}
{"type":"done"}

## Run
Create a virtualenv (or reuse existing) and install requirements:

```bash
pip install -r api/requirements.txt
```

Set environment variables (or .env) as before for ANTHROPIC_API_KEY, MODEL, MAX_OUTPUT_TOKENS, TEMPERATURE.

```bash
uvicorn api.app:app --reload
```

Upload then ask:

```bash
curl -F "files=@data/Bewerbungsbedingungen.pdf" -F "files=@data/KAT5.pdf" http://127.0.0.1:8000/upload

curl -N -H "Content-Type: application/json" -d '{"questions":["Wann ist die Frist?"], "conditions":["Ist die Abgabefrist vor dem 31.12.2025?"]}' http://127.0.0.1:8000/ask
```

Note: Each streamed line is standalone JSON; consumer should parse incrementally.
