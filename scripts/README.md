# Forgent Checklist

Minimal Prototype for Tender Checklist (Anthropic API)

## Setup
```bash
python3 -m venv .venv
source .venv/bin/activate
pip3 install -r requirements.txt # alternatively use pip instead of pip3
cp .env.example .env        # add your API key
```

## Run

```bash
python main.py --files ../data/Bewerbungsbedingungen.pdf "../data/Fragebogen zur Eignungspruefung.pdf"  ../data/KAT5.pdf --questions "In welcher Form sind die Angebote/Teilnahmeanträge einzureichen?" "Wann ist die Frist für die Einreichung von Bieterfragen?" --conditions "Ist die Abgabefrist vor dem 31.12.2025?"
```