# Forgent Interview API

FastAPI wrapper with two endpoints:
- POST /upload - Upload PDF files
- POST /ask - Ask questions/conditions about uploaded files

## Usage

```bash
pip install -r requirements.txt
uvicorn app:app --reload

# Upload files
curl -F "files=@file.pdf" http://127.0.0.1:8000/upload

# Ask questions
curl -N -H "Content-Type: application/json" \
  -d '{
    "questions": [{"id": "q1", "text": "What is the deadline?"}],
    "conditions": [{"id": "c1", "text": "Is deadline before 2025?"}]
  }' \
  http://127.0.0.1:8000/ask
```

Requires ANTHROPIC_API_KEY environment variable.
