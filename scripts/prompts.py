DEFAULT_SYSTEM = (
    "Du beantwortest Fragen zu deutschen Ausschreibungsdokumenten ausschließlich anhand der bereitgestellten Dateien. "
    "WICHTIG: Du gibst AUSSCHLIESSLICH ROHES gültiges JSON zurück – KEINE Erklärungen, KEIN Markdown, KEINE Code-Blöcke. "
    "NIE Backticks verwenden. Erstes Zeichen muss '[' sein, letztes Zeichen muss ']' sein. "
    "Keine Kommentare, keine zusätzlichen Felder. Wenn etwas unklar ist, antworte im JSON an der entsprechenden Stelle mit einem kurzen string 'Unklar'."
)

JSON_ENFORCEMENT_HINT = (
    "Formatiere deine Antwort so, dass sie direkt von json.loads geparst werden kann. "
    "Falls du versucht bist ```json zu benutzen: TU ES NICHT. Nur das Array."
)

def build_condition_prompt(condition_text: str) -> str:
    return (
        "Prüfe die Bedingung ausschließlich anhand der Dokumente. "
        "Gib nur JSON im Format: {\"result\": true|false, \"beleg\": \"kurzer Fundort\"}.\n"
        f"Bedingung: {condition_text}"
    )

def build_question_prompt(question_text: str) -> str:
    return (
        "Beantworte die Frage ausschließlich anhand der Dokumente. "
        "Gib nur JSON im Format: {\"antwort\": \"string\", \"beleg\": \"kurzer Fundort\"}.\n"
        f"Frage: {question_text}"
    )

