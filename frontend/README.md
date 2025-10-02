Minimal Next.js UI for testing the Forgent Checklist FastAPI backend.

Features:
* Upload multiple PDF (or other) documents to `/upload`.
* List stored files (auto refresh + manual refresh).
* Select subset of files (or none = all) to scope queries.
* Enter multiple questions and/or conditions (one per line) and stream structured JSONL results from `/ask`.
* Abort in-flight streaming request.
* Inspect raw JSON lines returned by the backend.

## Running

Backend (from `api/`): ensure FastAPI server is running on 127.0.0.1:8000

Frontend:
```bash
cd frontend
npm install # first time
npm run dev
```
Open http://localhost:3000

If your backend runs elsewhere set env before start:
```bash
NEXT_PUBLIC_API_BASE=http://localhost:8001 npm run dev
```

## Code Overview
* `src/app/page.tsx` – main UI (client component) with upload, selection, ask form, streaming parser.
* Uses simple `fetch` with streaming reader (JSONL newline separated objects).

## Notes
The backend `/ask` endpoint returns newline-delimited JSON objects terminated by a `{ "type": "done" }` marker. The UI appends each parsed object to the results panel. Malformed lines are ignored but logged to console.

This UI is intentionally minimal—no global state library, design system, or routing complexity—so it can be extended rapidly during development.
