# Forgent Interview API

Simple FastAPI service for document Q&A using Anthropic's Claude with file uploads.

## Setup

```bash
cd api
pip install -r requirements.txt
```

Set environment variables:
```bash
export ANTHROPIC_API_KEY="your-key-here"
export MODEL="claude-3-5-sonnet-latest"
export MAX_OUTPUT_TOKENS="1024" 
export TEMPERATURE="0"
```

## Run

```bash
uvicorn app:app --reload
```

API runs on http://127.0.0.1:8000

## Usage

**Upload files:**
```bash
curl -F "files=@file1.pdf" -F "files=@file2.pdf" http://127.0.0.1:8000/upload
```
Returns file IDs.

**Ask questions:**
```bash
curl -N -H "Content-Type: application/json" \
  -d '{"questions":["What is the deadline?"],"conditions":["Is deadline before Dec 31?"],"file_ids":["uuid1","uuid2"]}' \
  http://127.0.0.1:8000/ask
```

**List files:**
```bash
curl http://127.0.0.1:8000/files
```

Streams JSONL responses. Omit `file_ids` to use all uploaded files.