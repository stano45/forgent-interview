import argparse, json, sys
from anthropic_client import AnthropicClient
from config import load_config
from prompts import (
    DEFAULT_SYSTEM,
    JSON_ENFORCEMENT_HINT,
    build_question_prompt,
    build_condition_prompt,
)

def main():
    config = load_config()
    
    ap = argparse.ArgumentParser()
    ap.add_argument("--files", nargs="+", required=True)
    ap.add_argument("--model", default=config.model)
    ap.add_argument("--temp", type=float, default=config.temperature)
    ap.add_argument("--max-tokens", type=int, default=config.max_output_tokens)
    ap.add_argument("--questions", nargs="*", default=[])
    ap.add_argument("--conditions", nargs="*", default=[])
    args = ap.parse_args()

    system_prompt = DEFAULT_SYSTEM + "\n" + JSON_ENFORCEMENT_HINT
    client = AnthropicClient(
        api_key=config.api_key,
        model=args.model,
        temperature=args.temp,
        max_tokens=args.max_tokens,
        system=system_prompt,
    )
    fids = client.upload_files(args.files)

    questions = list(args.questions or [])
    conditions = list(args.conditions or [])
    print(questions, conditions, fids)
    if not questions and not conditions:
        print("No questions or conditions provided.", file=sys.stderr)
        return

    def extract_text_blocks(msg) -> str:
        raw = "\n".join([
            (getattr(blk, "text", None).text if hasattr(getattr(blk, "text", None), "text") else getattr(blk, "text", None))
            for blk in getattr(msg, "content", [])
            if getattr(blk, "type", None) == "text"
        ]).strip()
        if raw.startswith("```"):
            lines = raw.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            raw = "\n".join(lines).strip()
        if raw.lower().startswith("json\n"):
            raw = raw[5:].strip()
        return raw

    question_results = []
    condition_results = []
    last_msg_meta = {"model": None, "stop_reason": None}
    for q in questions:
        print("Processing question: ", q)
        prompt = build_question_prompt(q) + "\nNur das JSON Objekt. Keine Erklärungen, KEINE Backticks."
        res_msg = client.ask_with_files([{"text": prompt}], fids)
        last_msg_meta["model"] = getattr(res_msg, "model", None)
        last_msg_meta["stop_reason"] = getattr(res_msg, "stop_reason", None)
        text_output = extract_text_blocks(res_msg)
        answer_text = "Unklar"
        try:
            parsed = json.loads(text_output)
            if isinstance(parsed, dict):
                val = parsed.get("antwort") if "antwort" in parsed else parsed.get("answer")
                if isinstance(val, str) and val.strip():
                    answer_text = val.strip()
        except Exception as e:
            print(e)
        print("Processed: ", {"question": q, "answer": answer_text})
        question_results.append({"question": q, "answer": answer_text})

    for c in conditions:
        print("Processing condition: ", c)
        prompt = build_condition_prompt(c) + "\nNur das JSON Objekt. Keine Erklärungen, KEINE Backticks."
        res_msg = client.ask_with_files([{"text": prompt}], fids)
        last_msg_meta["model"] = getattr(res_msg, "model", None)
        last_msg_meta["stop_reason"] = getattr(res_msg, "stop_reason", None)
        text_output = extract_text_blocks(res_msg)
        bool_answer: bool = False
        try:
            parsed = json.loads(text_output)
            if isinstance(parsed, dict):
                if isinstance(parsed.get("result"), bool):
                    bool_answer = parsed["result"]
                elif isinstance(parsed.get("answer"), bool):
                    bool_answer = parsed["answer"]
        except Exception as e:
            print(e)
        print("Processed: ", {"condition": c, "answer": bool_answer})
        condition_results.append({"condition": c, "result": bool_answer})

    output = {
        "questions": question_results,
        "conditions": condition_results,
        "model": last_msg_meta["model"],
        "stop_reason": last_msg_meta["stop_reason"],
    }

    print(json.dumps(output, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
