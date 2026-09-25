"""Bounded credential-pattern scan over C1F command logs; never prints matches."""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parent
PATTERNS = {
    "openai_style_key": re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b"),
    "bearer_credential": re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}"),
    "credential_assignment": re.compile(
        r"(?i)\b(?:password|secret|token|api[_-]?key)\b\s*[:=]\s*['\"]?[^\s'\"]{8,}"
    ),
    "url_userinfo": re.compile(r"(?i)\b[a-z][a-z0-9+.-]*://[^\s/:@]+:[^\s/@]+@"),
}

logs = sorted(ROOT.glob("*.log"))
hits: list[dict[str, object]] = []
for log in logs:
    text = log.read_text(encoding="utf-8", errors="replace")
    matched = [name for name, pattern in PATTERNS.items() if pattern.search(text)]
    if matched:
        hits.append({"file": log.name, "pattern_ids": matched})

print(json.dumps({"scanned_log_count": len(logs), "files_with_matches": hits}, ensure_ascii=False))
sys.exit(1 if hits else 0)
