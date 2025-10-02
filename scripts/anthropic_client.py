import os
import httpx
from typing import List
from anthropic import Anthropic

class AnthropicClient:
    def __init__(self, api_key: str, model: str, temperature: float, max_tokens: int, system: str | None = None):
        self.api_key = api_key
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.system = system
        self.client = Anthropic(
            api_key=api_key,
            default_headers={
                "anthropic-beta": "files-api-2025-04-14",
            },
        )

    def upload_files(self, paths: List[str]) -> List[str]:
        file_ids = []
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": FILES_BETA,
        }
        url = "https://api.anthropic.com/v1/files"
        for p in paths:
            with open(p, "rb") as f:
                resp = httpx.post(url, headers=headers, files={"file": (os.path.basename(p), f)})
            resp.raise_for_status()
            file_ids.append(resp.json()["id"])
        return file_ids

    def ask_with_files(self, prompts: List[dict], file_ids: List[str]) -> dict:
        content_blocks = []
        for pr in prompts:
            content_blocks.append({"type": "text", "text": pr["text"]})
        for fid in file_ids:
            content_blocks.append({"type": "document", "source": {"type": "file", "file_id": fid}})

        kwargs = dict(
            model=self.model,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            messages=[{"role": "user", "content": content_blocks}],
        )
        if self.system:
            kwargs["system"] = self.system

        msg = self.client.messages.create(**kwargs)
        return msg
