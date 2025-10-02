"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

const API_BASE = "http://127.0.0.1:8000";

const DEFAULT_QUESTION_TEXTS = [
  "In welcher Form sind die Angebote/Teilnahmeanträge einzureichen?",
  "Wann ist die Frist für die Einreichung von Bieterfragen?",
];

const DEFAULT_CONDITION_TEXTS = [
  "Ist die Abgabefrist vor dem 31.12.2025?",
];

export default function Home() {
  interface FileInfo {
    id: string;
    name: string;
  }

  const [uploading, setUploading] = useState(false);
  const [questions, setQuestions] = useState<QAEntry[]>(() => DEFAULT_QUESTION_TEXTS.map((t, i) => ({ id: `q${i + 1}`, text: t })));
  const [conditions, setConditions] = useState<QAEntry[]>(() => DEFAULT_CONDITION_TEXTS.map((t, i) => ({ id: `c${i + 1}`, text: t })));
  const [newQuestion, setNewQuestion] = useState("");
  const [newCondition, setNewCondition] = useState("");
  const [loadingStream, setLoadingStream] = useState(false);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  interface QuestionStatus { received: boolean; answer?: string; raw?: string }
  interface ConditionStatus { received: boolean; result?: boolean; raw?: string }
  const [questionStatuses, setQuestionStatuses] = useState<Record<string, QuestionStatus>>({});
  const [conditionStatuses, setConditionStatuses] = useState<Record<string, ConditionStatus>>({});

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
  function removeQuestion(id: string) {
    setQuestions(qs => qs.filter(q => q.id !== id));
    setQuestionStatuses(prev => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  }
  function removeCondition(id: string) {
    setConditions(cs => cs.filter(c => c.id !== id));
    setConditionStatuses(prev => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  }

  const uploadFiles = async (fileList: FileList | File[]) => {
    if (fileList.length === 0) return;
    const formData = new FormData();
    const filesToUpload = [...fileList];
    filesToUpload.forEach(f => formData.append("files", f));
    setUploading(true);
    setUploadProgress(5);
    try {
      const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const uploadedFiles = data.files.map((f: { id: string }, index: number) => ({
        id: f.id,
        name: filesToUpload[index].name
      }));
      setFiles(prev => [...prev, ...uploadedFiles]);
      setUploadProgress(100);
      toast.success(`${uploadedFiles.length} Datei${filesToUpload.length !== 1 ? 'en' : ''} hochgeladen`);
    } catch (err) {
      toast.error(`Upload fehlgeschlagen: ${(err as Error).message}`);
    } finally {
      setTimeout(() => setUploadProgress(null), 600);
      setUploading(false);
    }
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(file => file.id !== id));
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = (e.currentTarget.elements.namedItem("files") as HTMLInputElement);
    if (!input.files || input.files.length === 0) return;
    await uploadFiles(input.files);
    input.value = ""; // Clear the input after upload
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files);
      e.target.value = ""; // Clear the input after upload
    }
  }

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (questions.length === 0 && conditions.length === 0) {
      toast.warning("Mindestens eine Frage oder Bedingung hinzufügen.");
      return;
    }
    if (files.length === 0) {
      toast.warning("Bitte zuerst Dokumente hochladen.");
      return;
    }
    setLoadingStream(true);
    setQuestionStatuses(Object.fromEntries(questions.map(q => [q.id, { received: false }])));
    setConditionStatuses(Object.fromEntries(conditions.map(c => [c.id, { received: false }])));

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const body = JSON.stringify({
        questions: questions.map(q => ({ id: q.id, text: q.text })),
        conditions: conditions.map(c => ({ id: c.id, text: c.text })),
        file_ids: files.map(file => file.id),
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
            if (obj.type === "question_result") {
              setQuestionStatuses(prev => ({
                ...prev,
                [obj.id]: { received: true, answer: obj.answer, raw: obj.raw }
              }));
            }
            if (obj.type === "condition_result") {
              setConditionStatuses(prev => ({
                ...prev,
                [obj.id]: { received: true, result: obj.result, raw: obj.raw }
              }));
            }
            if (obj.type === "error") toast.error(obj.message);
            if (obj.type === "done") {
              toast.success("Analyse erfolgreich abgeschlossen");
              setLoadingStream(false);
            }
          } catch { }
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

  function abortStream() {
    abortRef.current?.abort();
    setLoadingStream(false);
  }

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !loadingStream) {
        const form = document.getElementById("ask-form");
        form?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [loadingStream]);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Forgent Legal Tender Checklist</h1>
      </header>

      <div className="relative">
        <div className="space-y-6">
          <Card className="pl-0 sm:pl-8">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex h-7 w-7 items-center justify-center rounded-full border bg-background text-xs">1</div>
                <div>
                  <CardTitle>Dokumente</CardTitle>
                  <CardDescription>PDFs auswählen und hochladen</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Drag and drop area */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
                  uploading ? "bg-muted cursor-not-allowed" : "hover:bg-accent/50 cursor-pointer"
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!uploading && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    uploadFiles(e.dataTransfer.files);
                  }
                }}
                onClick={() => {
                  if (!uploading) {
                    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
                    fileInput?.click();
                  }
                }}
              >
                <input
                  id="file-upload"
                  name="files"
                  type="file"
                  multiple
                  disabled={uploading}
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="flex flex-col items-center gap-2">
                  <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="17 8 12 3 7 8"></polyline>
                      <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                  </div>
                  <div className="text-sm">
                    {uploading ? (
                      <p>Wird hochgeladen...</p>
                    ) : (
                      <>
                        <p className="font-medium">PDF-Dateien hier ablegen oder klicken zum Auswählen</p>
                        <p className="text-xs text-muted-foreground mt-1">Unterstützt werden PDF-Dokumente</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {uploadProgress !== null && (
                <div className="space-y-1">
                  <Progress value={uploadProgress} />
                  <p className="text-[10px] text-muted-foreground">{uploadProgress < 100 ? "Lade hoch..." : "Abgeschlossen"}</p>
                </div>
              )}

              {files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium">{files.length} PDF-Datei{files.length !== 1 ? 'en' : ''} bereit für die Analyse</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {files.map(file => (
                      <div key={file.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-accent/20 text-sm">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                            <path d="M14 3v4a1 1 0 0 0 1 1h4"></path>
                            <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"></path>
                            <path d="M9 9h1"></path>
                            <path d="M9 13h6"></path>
                            <path d="M9 17h6"></path>
                          </svg>
                          <span className="truncate" title={file.name}>{file.name}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFile(file.id)}
                          className="h-6 w-6 p-0 rounded-full"
                          aria-label="Datei entfernen"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="pl-0 sm:pl-8">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex h-7 w-7 items-center justify-center rounded-full border bg-background text-xs">2</div>
                <div>
                  <CardTitle>Fragen</CardTitle>
                  <CardDescription>Offene Fragen hinzufügen, die mit Text beantwortet werden</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Neue Frage eingeben..."
                  value={newQuestion}
                  onChange={e => setNewQuestion(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addQuestion(); } }}
                />
                <Button type="button" onClick={addQuestion} disabled={!newQuestion.trim()}>Hinzufügen</Button>
              </div>
              <ul className="space-y-3">
                {questions.map(q => {
                  const status = questionStatuses[q.id];
                  return (
                    <li key={q.id} className="rounded-md border p-3 bg-accent/30">
                      <div className="flex items-start gap-2">
                        <span className="flex-1 text-sm leading-snug">{q.text}</span>
                        <Button size="sm" variant="ghost" onClick={() => removeQuestion(q.id)} aria-label="Entfernen">✕</Button>
                      </div>
                      {loadingStream && status && !status.received && (
                        <div className="mt-2 space-y-1.5">
                          <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
                          <div className="h-3 w-5/12 rounded bg-muted animate-pulse" />
                        </div>
                      )}
                      {status?.received && (
                        <div className="mt-2">
                          <span className="text-xs text-muted-foreground">Antwort</span>
                          <div className="font-medium text-primary">{status.answer}</div>
                        </div>
                      )}
                    </li>
                  );
                })}
                {questions.length === 0 && <p className="text-xs text-muted-foreground">Noch keine Fragen.</p>}
              </ul>
            </CardContent>
          </Card>

          <Card className="pl-0 sm:pl-8">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex h-7 w-7 items-center justify-center rounded-full border bg-background text-xs">3</div>
                <div>
                  <CardTitle>Bedingungen</CardTitle>
                  <CardDescription>Ja/Nein Kriterien</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Neue Bedingung..."
                  value={newCondition}
                  onChange={e => setNewCondition(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCondition(); } }}
                />
                <Button type="button" onClick={addCondition} disabled={!newCondition.trim()}>Hinzufügen</Button>
              </div>
              <ul className="space-y-2">
                {conditions.map(c => {
                  const status = conditionStatuses[c.id];
                  return (
                    <li key={c.id} className="rounded-md border p-3 bg-accent/30">
                      <div className="flex items-start gap-2">
                        <span className="flex-1 text-sm leading-snug">{c.text}</span>
                        <Button size="sm" variant="ghost" onClick={() => removeCondition(c.id)} aria-label="Entfernen">✕</Button>
                      </div>
                      {loadingStream && status && !status.received && (
                        <div className="mt-2 space-y-1">
                          <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                        </div>
                      )}
                      {status?.received && (
                        <div className="mt-2 text-xs">
                          Ergebnis: {status.result ? (
                            <span className="font-medium text-green-600">Erfüllt</span>
                          ) : (
                            <span className="font-medium text-red-600">Nicht erfüllt</span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
                {conditions.length === 0 && <p className="text-xs text-muted-foreground">Keine Bedingungen definiert.</p>}
              </ul>
            </CardContent>
          </Card>

          <Card id="interaction" className={cn(
            "sticky bottom-4 pl-0 sm:pl-8 shadow-lg transition-colors",
            loadingStream && "border-primary/50"
          )}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "hidden sm:flex h-7 w-7 items-center justify-center rounded-full border text-xs transition-colors",
                  loadingStream ? "bg-primary/10 border-primary text-primary" : "bg-background"
                )}>
                  {loadingStream ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className="animate-pulse">
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
                      <path d="M12 9v4"></path>
                      <path d="M12 17h.01"></path>
                    </svg>
                  ) : "4"}
                </div>
                <div>
                  <CardTitle>
                    {loadingStream ? "Analyse läuft" : "Dokumente auswerten"}
                  </CardTitle>
                  <CardDescription>
                    {loadingStream ? "Bitte warten Sie, während Ihre Dokumente analysiert werden" : "KI-gestützte Analyse durchführen"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form id="ask-form" onSubmit={handleAsk} className="flex flex-wrap gap-3 items-center">
                {!loadingStream ? (
                  <Button type="submit" disabled={loadingStream} className="min-w-40">
                    Dokumente auswerten
                  </Button>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <Button type="button" variant="outline" onClick={abortStream} className="min-w-40">
                        Analyse abbrechen
                      </Button>
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                        <span className="text-sm">Dokumente werden analysiert...</span>
                      </div>
                    </div>
                  </>
                )}
                {Object.keys(questionStatuses).length > 0 && !loadingStream && (
                  <Button type="submit" variant="outline">
                    Erneut analysieren
                  </Button>
                )}
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      <footer className="pt-8 pb-4 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} • Cmd+Enter zum Starten der Analyse</footer>
    </main>
  );
}
