from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)

check_path = Path("scripts/check-html.mjs")
check = check_path.read_text()
check = replace_once(check, '"MAX_CANDLE_REQUESTS=3"', '"MAX_CANDLE_REQUESTS=1"', "HTML foreground concurrency contract")
check_path.write_text(check)

test_path = Path("scripts/test-runtime.mjs")
test = test_path.read_text()
test = replace_once(test, 'assert.match(html,/MAX_CANDLE_REQUESTS=3/);', 'assert.match(html,/MAX_CANDLE_REQUESTS=1/);', "runtime foreground concurrency contract")
test_path.write_text(test)

Path(__file__).unlink(missing_ok=True)
