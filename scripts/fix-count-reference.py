from pathlib import Path

html_path = Path("public/index.html")
html = html_path.read_text()
old = 'const controller=new AbortController();state.chartController=controller,count=chartRequestCount(instrument,timeframe);'
new = 'const controller=new AbortController(),count=chartRequestCount(instrument,timeframe);state.chartController=controller;'
if html.count(old) != 1:
    raise SystemExit(f"expected one broken chart count declaration, found {html.count(old)}")
html = html.replace(old, new, 1)
html_path.write_text(html)

test_path = Path("scripts/test-runtime.mjs")
test = test_path.read_text()
needle = 'assert.match(html,/chartRequestCount/);'
replacement = 'assert.match(html,/chartRequestCount/);assert.match(html,/const controller=new AbortController\\(\\),count=chartRequestCount\\(instrument,timeframe\\);state\\.chartController=controller;/);assert.doesNotMatch(html,/state\\.chartController=controller,count=/);'
if test.count(needle) != 1:
    raise SystemExit(f"expected one chartRequestCount assertion, found {test.count(needle)}")
test = test.replace(needle, replacement, 1)
test_path.write_text(test)

Path(__file__).unlink(missing_ok=True)
