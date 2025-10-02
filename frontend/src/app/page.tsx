"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type StreamItem =
  | { type: "start" }
  | { type: "question_result"; id: string; question: string; answer: string; raw: string }
  | { type: "condition_result"; id: string; condition: string; result: boolean; raw: string }
  | { type: "error"; message: string }
  | { type: "done" };

interface QAEntry { id: string; text: string }

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

const DEFAULT_QUESTION_TEXTS = [
  "In welcher Form sind die Angebote/Teilnahmeanträge einzureichen?",
  "Wann ist die Frist für die Einreichung von Bieterfragen?",
];

const DEFAULT_CONDITION_TEXTS = [
  "Ist die Abgabefrist vor dem 31.12.2025?",
];

export default function Home() {
  const [uploading, setUploading] = useState(false);
  const [questions, setQuestions] = useState<QAEntry[]>(() => DEFAULT_QUESTION_TEXTS.map((t,i)=>({id:`q${i+1}`, text:t})));
  const [conditions, setConditions] = useState<QAEntry[]>(() => DEFAULT_CONDITION_TEXTS.map((t,i)=>({id:`c${i+1}`, text:t})));
  const [newQuestion, setNewQuestion] = useState("");
  const [newCondition, setNewCondition] = useState("");
  const [streamItems, setStreamItems] = useState<StreamItem[]>([]);
  const [loadingStream, setLoadingStream] = useState(false);
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Generate incremental IDs
  const nextId = useCallback((prefix: string, list: QAEntry[]) => {
    const nums = list.map(q => Number(q.id.replace(prefix, ""))).filter(n => !Number.isNaN(n));
    const max = nums.length ? Math.max(...nums) : 0;
    return `${prefix}${max + 1}`;
  }, []);

  function addQuestion() {
    const text = newQuestion.trim();
    if (!text) return;
    setQuestions(qs => [...qs, { id: nextId("q", qs), text }]);
    setNewQuestion("");
  }
  function addCondition() {
    const text = newCondition.trim();
    if (!text) return;
    setConditions(cs => [...cs, { id: nextId("c", cs), text }]);
    setNewCondition("");
  }
  function removeQuestion(id: string){ setQuestions(qs=>qs.filter(q=>q.id!==id)); }
  function removeCondition(id: string){ setConditions(cs=>cs.filter(c=>c.id!==id)); }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = (e.currentTarget.elements.namedItem("files") as HTMLInputElement);
    if (!input.files || input.files.length === 0) return;
    const formData = new FormData();
    [...input.files].forEach(f => formData.append("files", f));
    setUploading(true);
    setUploadProgress(5);
    try {
      const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const uploadedIds = data.files.map((f: { id: string }) => f.id);
      setFileIds(prev => [...prev, ...uploadedIds]);
      input.value = "";
      setUploadProgress(100);
      toast.success(`${uploadedIds.length} Datei(en) hochgeladen`);
    } catch (err) {
      toast.error(`Upload fehlgeschlagen: ${(err as Error).message}`);
    } finally {
      setTimeout(()=> setUploadProgress(null), 600);
      setUploading(false);
    }
  }

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (questions.length === 0 && conditions.length === 0) {
      toast.warning("Mindestens eine Frage oder Bedingung hinzufügen.");
      return;
    }
    if (fileIds.length === 0) {
      toast.warning("Bitte zuerst Dokumente hochladen.");
      return;
    }
    setStreamItems([]);
    setLoadingStream(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const body = JSON.stringify({
        questions: questions.map(q=>({id:q.id, text:q.text})),
        conditions: conditions.map(c=>({id:c.id, text:c.text})),
        file_ids: fileIds,
      });
      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
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
            if (obj.type === "error") toast.error(obj.message);
            if (obj.type === "done") {
              toast.success("Fertig");
              setLoadingStream(false);
            }
          } catch {
            // ignore invalid line
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        toast("Anfrage abgebrochen");
      } else {
        toast.error(`Fehler: ${(err as Error).message}`);
      }
    } finally {
      setLoadingStream(false);
    }
  }

  function abortStream(){
    abortRef.current?.abort();
    setLoadingStream(false);
  }

  // Keyboard shortcut: Enter to add when focused new input with meta/cmd+Enter add & submit?
  useEffect(()=>{
    function handler(e: KeyboardEvent){
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !loadingStream){
        // submit ask
        const form = document.getElementById("ask-form");
        form?.dispatchEvent(new Event("submit", { cancelable:true, bubbles:true }));
      }
    }
    window.addEventListener("keydown", handler);
    return ()=> window.removeEventListener("keydown", handler);
  }, [loadingStream]);

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Forgent Checklist Tester</h1>
          <p className="text-sm text-muted-foreground">Dokumente hochladen · Fragen & Bedingungen definieren · Antworten streamen</p>
        </div>
        <div className="text-xs text-muted-foreground">Backend: {API_BASE}</div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>1. Dokumente</CardTitle>
              <CardDescription>PDFs auswählen und hochladen. IDs werden intern verwaltet.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <form onSubmit={handleUpload} className="space-y-3">
                <Input name="files" type="file" multiple disabled={uploading} />
                {uploadProgress !== null && (
                  <div className="space-y-1">
                    <Progress value={uploadProgress} />
                    <p className="text-[10px] text-muted-foreground">{uploadProgress < 100 ? "Lade hoch..." : "Fertig"}</p>
                  </div>
                )}
                <Button disabled={uploading} className="w-full" type="submit">
                  {uploading ? "Hochladen..." : "Upload"}
                </Button>
              </form>
              {fileIds.length > 0 && (
                <p className="text-xs text-muted-foreground">{fileIds.length} Datei(en) bereit.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Fragen</CardTitle>
              <CardDescription>Individuelle Fragen hinzufügen oder entfernen.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Neue Frage eingeben..."
                  value={newQuestion}
                  onChange={e=>setNewQuestion(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); addQuestion(); } }}
                />
                <Button type="button" onClick={addQuestion} disabled={!newQuestion.trim()}>Hinzufügen</Button>
              </div>
              <ul className="space-y-2 max-h-56 overflow-auto pr-1">
                {questions.map(q => (
                  <li key={q.id} className="group rounded border px-3 py-2 text-sm flex items-start gap-2 bg-accent/30">
                    <span className="font-mono text-[10px] pt-0.5 text-muted-foreground">{q.id}</span>
                    <span className="flex-1 leading-snug">{q.text}</span>
                    <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 transition" onClick={()=>removeQuestion(q.id)} aria-label="Entfernen">✕</Button>
                  </li>
                ))}
                {questions.length===0 && <p className="text-xs text-muted-foreground">Noch keine Fragen.</p>}
              </ul>
            </CardContent>
            <CardFooter className="text-[10px] text-muted-foreground">Cmd+Enter sendet Anfrage</CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. Bedingungen</CardTitle>
              <CardDescription>Optionale Kriterien prüfen lassen.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Neue Bedingung..."
                  value={newCondition}
                  onChange={e=>setNewCondition(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); addCondition(); } }}
                />
                <Button type="button" onClick={addCondition} disabled={!newCondition.trim()}>Hinzufügen</Button>
              </div>
              <ul className="space-y-2 max-h-48 overflow-auto pr-1">
                {conditions.map(c => (
                  <li key={c.id} className="group rounded border px-3 py-2 text-sm flex items-start gap-2 bg-accent/30">
                    <span className="font-mono text-[10px] pt-0.5 text-muted-foreground">{c.id}</span>
                    <span className="flex-1 leading-snug">{c.text}</span>
                    <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 transition" onClick={()=>removeCondition(c.id)} aria-label="Entfernen">✕</Button>
                  </li>
                ))}
                {conditions.length===0 && <p className="text-xs text-muted-foreground">Keine Bedingungen definiert.</p>}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card id="interaction">
            <CardHeader className="pb-2">
              <CardTitle>4. Anfrage senden</CardTitle>
              <CardDescription>Startet die Analyse & liefert Antworten als Stream.</CardDescription>
            </CardHeader>
            <CardContent>
              <form id="ask-form" onSubmit={handleAsk} className="flex flex-wrap gap-3">
                <Button type="submit" disabled={loadingStream} className="min-w-40">
                  {loadingStream ? "Läuft..." : "Anfrage starten"}
                </Button>
                {loadingStream && (
                  <Button type="button" variant="outline" onClick={abortStream}>Abbrechen</Button>
                )}
              </form>
            </CardContent>
          </Card>

          <Card className="flex-1">
            <CardHeader className="pb-2">
              <CardTitle>5. Ergebnisse</CardTitle>
              <CardDescription>Echtzeit Rückmeldungen der Pipeline</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative h-[480px] rounded border bg-muted/30 overflow-auto p-3 text-sm">
                {streamItems.length === 0 && !loadingStream && (
                  <div className="text-xs text-muted-foreground">Noch keine Ergebnisse.</div>
                )}
                {loadingStream && (
                  <div className="text-xs animate-pulse mb-2 text-muted-foreground">Streaming...</div>
                )}
                <ul className="space-y-3">
                  {streamItems.map((item, idx) => (
                    <li key={idx} className={cn("rounded-md border p-3 bg-background/70 shadow-sm", item.type==='error' && 'border-destructive text-destructive')}>
                      {item.type === 'question_result' && (
                        <div className="space-y-1">
                          <div className="font-medium leading-snug">Frage: {item.question}</div>
                          <div className="text-sm">Antwort: <span className="font-semibold text-primary">{item.answer}</span></div>
                          <details className="pt-1">
                            <summary className="cursor-pointer text-xs text-muted-foreground">Rohdaten</summary>
                            <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-[10px] whitespace-pre-wrap break-words">{item.raw}</pre>
                          </details>
                        </div>
                      )}
                      {item.type === 'condition_result' && (
                        <div className="space-y-1">
                          <div className="font-medium leading-snug">Bedingung: {item.condition}</div>
                          <div className="text-sm">Ergebnis: <span className={cn("font-semibold", item.result ? 'text-green-600' : 'text-red-600')}>{item.result ? 'Erfüllt' : 'Nicht erfüllt'}</span></div>
                          <details className="pt-1">
                            <summary className="cursor-pointer text-xs text-muted-foreground">Rohdaten</summary>
                            <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-[10px] whitespace-pre-wrap break-words">{item.raw}</pre>
                          </details>
                        </div>
                      )}
                      {item.type === 'error' && (
                        <div className="font-medium">Fehler: {item.message}</div>
                      )}
                      {item.type === 'done' && (
                        <div className="text-xs text-muted-foreground text-center">Fertig.</div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <footer className="pt-8 pb-4 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Forgent • Cmd+Enter zum Senden</footer>
    </main>
  );
}
