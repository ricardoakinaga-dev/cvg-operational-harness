#!/usr/bin/env python3
"""Capture one authorized C1E command and append its sanitized evidence record."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True)
    parser.add_argument("--cwd", required=True)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = list(args.command)
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        parser.error("a command is required after --")

    root = Path(__file__).resolve().parent
    records_path = root / "command-records.json"
    stdout_path = root / f"{args.name}.stdout.log"
    stderr_path = root / f"{args.name}.stderr.log"
    started_at = utc_now()
    start_ns = time.monotonic_ns()
    result = subprocess.run(command, cwd=args.cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    duration_ms = (time.monotonic_ns() - start_ns) / 1_000_000
    finished_at = utc_now()
    stdout_path.write_bytes(result.stdout)
    stderr_path.write_bytes(result.stderr)

    if records_path.exists():
        document = json.loads(records_path.read_text(encoding="utf-8"))
    else:
        document = {"run_id": "M07-S1-R1-C1E", "commands": []}
    document["commands"].append({
        "name": args.name,
        "argv": command,
        "cwd": args.cwd,
        "started_at_utc": started_at,
        "finished_at_utc": finished_at,
        "duration_ms": round(duration_ms, 3),
        "exit_code": result.returncode,
        "status": "PASS" if result.returncode == 0 else "FAIL",
        "skip_count": None,
        "sanitization": "captured local command output; manual secret/real-data inspection pending",
        "stdout": {"path": stdout_path.name, "sha256": sha256(result.stdout), "bytes": len(result.stdout)},
        "stderr": {"path": stderr_path.name, "sha256": sha256(result.stderr), "bytes": len(result.stderr)}
    })
    temporary = records_path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, records_path)
    sys.stdout.buffer.write(result.stdout)
    sys.stderr.buffer.write(result.stderr)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
