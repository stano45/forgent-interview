import sqlite3
import uuid
from pathlib import Path
from typing import Iterable

DB_PATH = Path(__file__).parent / "files.db"
FILES_DIR = Path(__file__).parent / "uploaded_files"

# Create uploads directory
FILES_DIR.mkdir(exist_ok=True)

SCHEMA = """
CREATE TABLE IF NOT EXISTS uploaded_files (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn

with get_conn() as c:
    c.executescript(SCHEMA)

def insert_file(filename: str, content: bytes) -> str:
    """Store file on disk and return generated ID."""
    file_id = str(uuid.uuid4())
    file_extension = Path(filename).suffix
    disk_filename = f"{file_id}{file_extension}"
    file_path = FILES_DIR / disk_filename
    
    # Write to disk
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Store metadata in DB
    with get_conn() as c:
        c.execute(
            "INSERT INTO uploaded_files (id, filename, file_path) VALUES (?, ?, ?)",
            (file_id, filename, str(file_path)),
        )
    return file_id

def fetch_all_files() -> list[tuple[str, str, str]]:
    """Return (id, filename, file_path) for all files."""
    with get_conn() as c:
        cur = c.execute("SELECT id, filename, file_path FROM uploaded_files ORDER BY id ASC")
        return cur.fetchall()

def get_file_paths() -> list[str]:
    """Return list of file paths on disk for all uploaded files."""
    with get_conn() as c:
        cur = c.execute("SELECT file_path FROM uploaded_files ORDER BY id ASC")
        return [row[0] for row in cur.fetchall()]

def get_file_paths_by_ids(file_ids: list[str]) -> list[str]:
    """Return list of file paths on disk for specific file IDs."""
    if not file_ids:
        return []
    
    placeholders = ",".join(["?" for _ in file_ids])
    with get_conn() as c:
        cur = c.execute(
            f"SELECT file_path FROM uploaded_files WHERE id IN ({placeholders}) ORDER BY id ASC",
            file_ids
        )
        return [row[0] for row in cur.fetchall()]
