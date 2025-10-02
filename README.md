# Forgent Interview Project

Full‑stack demo for document Q&A: a FastAPI backend that ingests PDF files and queries them using Anthropic Claude, plus a Next.js (React) UI for uploading documents and asking questions/conditions. Runs locally with Docker.

---
## 1. Prerequisites
You need:
1. Docker (https://docs.docker.com/get-docker/)
2. Docker Compose (comes bundled with modern Docker Desktop)
3. An Anthropic API key (set as an environment variable before starting or inject via Docker)

Environment variables (minimal – must match `api/config.py`):
```
ANTHROPIC_API_KEY=sk-ant-api03-XXXXXXXXXXXX # Required  
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929  # Model name - claude-sonnet-4-5-20250929 strongly recommended for best results
ANTHROPIC_MAX_TOKENS=10000                  # Max output tokens per response  
ANTHROPIC_TEMP=0.0                          # Sampling temperature  
```
To get started quickly, copy the example file and edit it:
```bash
cp api/.env.example api/.env
# Then edit api/.env to add your Anthropic API key and adjust settings if needed
```

---
## 2. Run (one command)
Build and start both backend (FastAPI) and frontend (Next.js):
```bash
docker compose up --build
```
First build can take a minute. Subsequent runs can omit `--build`.
---
## 3. Use the App
1. Open http://localhost:3000
2. Upload one or more PDF files
3. Enter questions and optional conditions
4. Submit and view streamed responses

---
## 4. Project Structure (high level)
```
docker-compose.yml   # Orchestrates backend + frontend services
api/                 # FastAPI service (file upload, Q&A endpoints, Claude client)
  app.py             # FastAPI app & routes
  anthropic_client.py# Thin Anthropic API wrapper
  database.py        # Simple SQLite (files + metadata)
  uploaded_files/    # Stored PDF uploads
frontend/            # Next.js 15 + Tailwind UI
  src/app/           # App router pages & layout
  src/components/    # Reusable UI components (buttons, inputs, progress, toast)
scripts/             # Standalone Python scripts (CLI experimentation)
data/                # Example PDF documents
```

---
## 5. Implementation Notes (brief)
Backend:
* FastAPI handles `POST /upload` (multipart PDFs) and `POST /ask` (JSON body with questions & conditions).
* Files saved to `api/uploaded_files/` and indexed minimally (filenames + IDs) in SQLite.
* Question answering delegates to Anthropic Claude (model configurable via env vars) with a simple prompt template.
* Responses streamed as JSON lines so the UI can show incremental progress.

Frontend:
* Next.js (App Router) with lightweight components (no heavy state management) and Tailwind-based styles.
* Uploads via fetch multipart form; listens to streaming response using `ReadableStream`.
* Presents progress and final structured answers.

Dev Experience:
* Live code reload via mounted volumes in both services.
* Minimal dependencies to keep build fast.

---
## 6. Direct API Examples (optional)
Upload files:
```bash
curl -F "files=@file1.pdf" -F "files=@file2.pdf" http://localhost:8000/upload
```

Ask questions (streaming):
```bash
curl -N -H "Content-Type: application/json" \
  -d '{"questions":["What is the deadline?"],"conditions":["Is deadline before Dec 31?"],"file_ids":["uuid1","uuid2"]}' \
  http://localhost:8000/ask
```

List uploaded files:
```bash
curl http://localhost:8000/files
```

---
## 7. Troubleshooting
* 401 / Anthropic errors: ensure `ANTHROPIC_API_KEY` is set in the environment visible to the backend container.
* Changes not reflecting: container may be caching deps; restart with `docker compose up --build`.
* Port in use: adjust `ports` mapping in `docker-compose.yml`.

---
## 8. Next Ideas (not implemented)
* Basic vector indexing per document
* Auth & per-user document segregation
* Richer UI for multi-turn chat
* Caching / dedupe of model calls

---
Feel free to extend or trim features as needed for the interview scenario.