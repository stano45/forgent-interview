"use client";

import React, { useState, useRef } from "react";

type StreamItem =
  | { type: "start" }
  | { type: "question_result"; id: string; question: string; answer: string; raw: string }
  | { type: "condition_result"; id: string; condition: string; result: boolean; raw: string }
  | { type: "error"; message: string }
  | { type: "done" };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

const DEFAULT_QUESTIONS = [
  'In welcher Form sind die Angebote/Teilnahmeanträge einzureichen?',
  'Wann ist die Frist für die Einreichung von Bieterfragen?',
].join("\n");

export default function Home() {
  const [uploading, setUploading] = useState(false);
  const [questionInputs, setQuestionInputs] = useState<string>(DEFAULT_QUESTIONS);
  const [conditionInputs, setConditionInputs] = useState<string>("");
  const [streamItems, setStreamItems] = useState<StreamItem[]>([]);
  const [loadingStream, setLoadingStream] = useState(false);
  const [fileIds, setFileIds] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("files") as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const formData = new FormData();
    [...input.files].forEach(f => formData.append("files", f));
    setUploading(true);
    try {
      const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      // Extract file IDs from the response and add to state
      const uploadedIds = data.files.map((f: { id: string; filename: string }) => f.id);
      setFileIds(prev => [...prev, ...uploadedIds]);
      input.value = "";
      // Brief visual feedback
      alert(`Upload erfolgreich: ${uploadedIds.length} Datei(en) hochgeladen`);
    } catch (err) {
      alert("Upload failed: " + (err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function parseMultiline(input: string) {
    return input.split(/\n+/).map(l => l.trim()).filter(Boolean);
  }

  async function handleAsk(ev: React.FormEvent) {
    ev.preventDefault();
    const questions = parseMultiline(questionInputs).map((text, i) => ({ id: `q${i+1}`, text }));
    const conditions = parseMultiline(conditionInputs).map((text, i) => ({ id: `c${i+1}`, text }));

    if (questions.length === 0 && conditions.length === 0) {
      alert("Add at least one question or condition.");
      return;
    }

    if (fileIds.length === 0) {
      alert("Please upload files first or provide file IDs.");
      return;
    }

    setStreamItems([]);
    setLoadingStream(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions, conditions, file_ids: fileIds }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffered.indexOf("\n")) !== -1) {
          const line = buffered.slice(0, idx).trim();
          buffered = buffered.slice(idx + 1);
          if (!line) continue;
          try {
            const obj: StreamItem = JSON.parse(line);
            setStreamItems(prev => [...prev, obj]);
            if (obj.type === "error") {
              console.error("Stream error:", obj.message);
            }
            if (obj.type === "done") {
              setLoadingStream(false);
              setQuestionInputs(DEFAULT_QUESTIONS);
              setConditionInputs("");
            }
          } catch (e) {
            console.warn("Bad line", line);
          }
        }
      }
    } catch (err) {
      console.error("Request failed:", err);
      alert("Request failed: " + (err as Error).message);
    } finally {
      setLoadingStream(false);
    }
  }

  function abortStream() {
    abortRef.current?.abort();
    setLoadingStream(false);
  }

  return (
    <div className="min-h-screen p-6 space-y-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold">Forgent Checklist Tester</h1>
      <section className="space-y-4">
        <h2 className="text-lg font-medium">1. Dokumente hochladen</h2>
        <form onSubmit={handleUpload} className="flex flex-col gap-2 md:flex-row md:items-center">
          <input name="files" type="file" multiple className="border p-2 rounded" />
          <button disabled={uploading} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">{uploading ? "Uploading..." : "Upload"}</button>
        </form>
        {fileIds.length > 0 && (
          <div className="mt-2">
            <h3 className="text-sm font-medium mb-1">Hochgeladene Dateien (IDs):</h3>
            <div className="flex flex-wrap gap-2">
              {fileIds.map((id) => (
                <div key={id} className="bg-blue-100 px-2 py-1 rounded text-xs flex items-center gap-2">
                  <span className="font-mono">{id}</span>
                  <button
                    type="button"
                    onClick={() => setFileIds(prev => prev.filter(fid => fid !== id))}
                    className="text-red-600 hover:text-red-800"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="text-xs text-gray-500">Die hochgeladenen Dateien werden bei den Anfragen verwendet.</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">2. Fragen & Bedingungen</h2>
        <form onSubmit={handleAsk} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Fragen (eine pro Zeile)</label>
              <textarea value={questionInputs} onChange={e => setQuestionInputs(e.target.value)} rows={6} className="border rounded p-2 font-mono text-sm" placeholder="In welcher Form sind die Angebote einzureichen?" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Bedingungen (eine pro Zeile)</label>
              <textarea value={conditionInputs} onChange={e => setConditionInputs(e.target.value)} rows={6} className="border rounded p-2 font-mono text-sm" placeholder="Ist die Abgabefrist vor dem 31.12.2025?" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={loadingStream} className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50">{loadingStream ? 'Läuft...' : 'Anfragen'}</button>
            {loadingStream && <button type="button" onClick={abortStream} className="px-4 py-2 rounded border">Abbrechen</button>}
          </div>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">3. Ergebnisse</h2>
        <div className="border rounded p-3 space-y-2 max-h-96 overflow-auto bg-gray-50">
          {streamItems.map((item, i) => (
            <div key={i} className="text-sm border-b pb-2 last:border-none">
              {item.type === 'question_result' && (
                <div>
                  <div className="font-semibold">Frage: {item.question}</div>
                  <div className="mt-1">Antwort: <span className="font-medium">{item.answer}</span></div>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-gray-600">Raw JSON</summary>
                    <pre className="text-xs whitespace-pre-wrap break-words">{item.raw}</pre>
                  </details>
                </div>
              )}
              {item.type === 'done' && (
                <div className="text-center text-xs text-gray-500">Fertig.</div>
              )}
            </div>
          ))}
          {streamItems.length === 0 && !loadingStream && (
            <p className="text-xs text-gray-500">Noch keine Ergebnisse.</p>
          )}
          {loadingStream && <p className="text-xs animate-pulse">Streaming...</p>}
        </div>
      </section>
      <footer className="pt-4 text-center text-xs text-gray-400">Backend: {API_BASE}</footer>
    </div>
  );
}
