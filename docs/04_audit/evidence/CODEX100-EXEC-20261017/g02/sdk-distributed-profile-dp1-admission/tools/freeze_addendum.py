"""Refresh of freeze-addendum-dp1.json#/tools (grouped repair R1, R1-F09): sha256 of the post-freeze tools, after their last change.
Usage: python3 -I -B tools/freeze_addendum.py   (cwd = unit folder). The rest of the addendum is declarative and is not regenerated."""
import hashlib
import json
from pathlib import Path

U = Path(__file__).resolve().parent.parent
TOOLS = ('tools/preflight_dp1.py', 'tools/collect_results.py', 'tools/close_dp1.py', 'tools/post_review_checks.py', 'tools/freeze_addendum.py',
         'selftests/selftest_dp1_caps.py', 'selftests/selftest_dp1_caps_driver.mjs')
doc = json.loads((U / 'freeze-addendum-dp1.json').read_text())
doc['tools'] = {p: hashlib.sha256((U / p).read_bytes()).hexdigest() for p in TOOLS}
(U / 'freeze-addendum-dp1.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(doc['tools'], indent=1))
