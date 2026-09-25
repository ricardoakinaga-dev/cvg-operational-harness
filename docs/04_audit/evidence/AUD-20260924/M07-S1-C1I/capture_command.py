#!/usr/bin/env python3
"""Run one allowlisted C1I command and durably capture its provenance."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
PLAN = HERE / "command-plan.json"
RECORDS = HERE / "command-records.json"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_atomic(path: Path, value: dict) -> None:
    encoded = (json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode()
    with tempfile.NamedTemporaryFile(dir=HERE, prefix=f".{path.name}.", delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(encoded)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def inside_evidence(relative: str) -> Path:
    candidate = (HERE / relative).resolve()
    if Path(relative).is_absolute() or ".." in Path(relative).parts or not candidate.is_relative_to(HERE):
        raise ValueError(f"evidence path escapes C1I directory: {relative}")
    return candidate


def verify_records() -> int:
    start_utc = utc_now()
    start = time.monotonic_ns()
    records = load_json(RECORDS)
    if any(record.get("id") == "command-record-integrity" for record in records.get("records", [])):
        raise ValueError("final command-record integrity check is already recorded")
    problems: list[str] = []
    for record in records.get("records", []):
        for stream in ("stdout", "stderr"):
            evidence = record.get(stream, {})
            path = inside_evidence(evidence.get("path", ""))
            if not path.is_file():
                problems.append(f"{record.get('id')}:{stream}:missing")
                continue
            payload = path.read_bytes()
            if len(payload) != evidence.get("bytes") or sha256(payload) != evidence.get("sha256"):
                problems.append(f"{record.get('id')}:{stream}:hash-mismatch")
        for copied in record.get("copied_stdout", []):
            path = inside_evidence(copied["path"])
            if not path.is_file():
                problems.append(f"{record.get('id')}:copy:missing")
                continue
            payload = path.read_bytes()
            if len(payload) != copied.get("bytes") or sha256(payload) != copied.get("sha256"):
                problems.append(f"{record.get('id')}:copy:hash-mismatch")
    exit_code = 1 if problems else 0
    stdout = (json.dumps({"record_count_before_verifier": len(records.get("records", [])),
                          "problems": problems}, sort_keys=True) + "\n").encode()
    stderr = b""
    finish_utc = utc_now()
    duration_ms = (time.monotonic_ns() - start) / 1_000_000
    stdout_path = inside_evidence("command-record-integrity.stdout.log")
    stderr_path = inside_evidence("command-record-integrity.stderr.log")
    if stdout_path.exists() or stderr_path.exists():
        raise FileExistsError("refusing to overwrite final integrity logs")
    stdout_path.write_bytes(stdout)
    stderr_path.write_bytes(stderr)
    plan = load_json(PLAN)
    removed = sorted(plan.get("environment", {}).get("unset", []))
    records.setdefault("records", []).append({
        "id": "command-record-integrity",
        "argv": ["python3", str(Path(__file__).relative_to(REPO)), "--verify"],
        "cwd": ".",
        "started_at_utc": start_utc,
        "finished_at_utc": finish_utc,
        "duration_ms": round(duration_ms, 3),
        "actual_exit_code": exit_code,
        "expected_exit_codes": [0],
        "result": "EXPECTED_EXIT" if exit_code == 0 else "UNEXPECTED_EXIT",
        "environment_unset": [],
        "environment_set_names": sorted(plan.get("environment", {}).get("set", {}).keys()),
        "stdout": {"path": stdout_path.name, "bytes": len(stdout), "sha256": sha256(stdout)},
        "stderr": {"path": stderr_path.name, "bytes": len(stderr), "sha256": sha256(stderr)},
        "copied_stdout": [],
        "declared_side_effects": ["docs/04_audit/evidence/AUD-20260924/M07-S1-C1I/command-records.json"]
    })
    records["state"] = "INTEGRITY_PASS" if exit_code == 0 else "INTEGRITY_FAIL"
    write_json_atomic(RECORDS, records)
    sys.stdout.buffer.write(stdout)
    return exit_code


def run_step(step_id: str) -> int:
    plan = load_json(PLAN)
    records = load_json(RECORDS)
    steps = {step["id"]: step for step in plan["steps"]}
    if step_id not in steps:
        raise ValueError(f"step is not in the frozen command plan: {step_id}")
    if any(record.get("id") == step_id for record in records.get("records", [])):
        raise ValueError(f"step already has a command record: {step_id}")
    step = steps[step_id]
    previous = {record["id"]: record for record in records.get("records", [])}
    for dependency in step.get("depends_on", []):
        if dependency not in previous or previous[dependency].get("result") != "EXPECTED_EXIT":
            raise ValueError(f"dependency not satisfied for {step_id}: {dependency}")

    argv = step["argv"]
    if not isinstance(argv, list) or not argv or not all(isinstance(part, str) for part in argv):
        raise ValueError(f"invalid argv in frozen plan: {step_id}")
    cwd = (REPO / step.get("cwd", ".")).resolve()
    if not cwd.is_relative_to(REPO):
        raise ValueError(f"working directory escapes repository: {step_id}")
    stdout_path = inside_evidence(f"{step_id}.stdout.log")
    stderr_path = inside_evidence(f"{step_id}.stderr.log")
    if stdout_path.exists() or stderr_path.exists():
        raise FileExistsError(f"refusing to overwrite command logs: {step_id}")

    environment = os.environ.copy()
    removed = sorted(set(plan.get("environment", {}).get("unset", [])) | set(step.get("unset", [])))
    for key in removed:
        environment.pop(key, None)
    prepend = plan.get("environment", {}).get("prepend_path", [])
    if prepend:
        environment["PATH"] = os.pathsep.join([*prepend, environment.get("PATH", "")])
    for key, value in plan.get("environment", {}).get("set", {}).items():
        environment[key] = value

    start_utc = utc_now()
    start = time.monotonic_ns()
    completed = subprocess.run(argv, cwd=cwd, env=environment, stdin=subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False, check=False)
    duration_ms = (time.monotonic_ns() - start) / 1_000_000
    finish_utc = utc_now()
    stdout_path.write_bytes(completed.stdout)
    stderr_path.write_bytes(completed.stderr)
    copied_stdout: list[dict] = []
    copy_target = step.get("stdout_copy_to")
    if copy_target:
        destination = inside_evidence(copy_target)
        if destination.exists():
            raise FileExistsError(f"refusing to overwrite stdout copy: {copy_target}")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(completed.stdout)
        copied_stdout.append({"path": copy_target, "bytes": len(completed.stdout), "sha256": sha256(completed.stdout)})

    expected = step.get("expected_exit_codes", [0])
    result = "EXPECTED_EXIT" if completed.returncode in expected else "UNEXPECTED_EXIT"
    record = {
        "id": step_id,
        "argv": argv,
        "cwd": str(cwd.relative_to(REPO)),
        "started_at_utc": start_utc,
        "finished_at_utc": finish_utc,
        "duration_ms": round(duration_ms, 3),
        "actual_exit_code": completed.returncode,
        "expected_exit_codes": expected,
        "result": result,
        "environment_unset": removed,
        "environment_set_names": sorted(plan.get("environment", {}).get("set", {}).keys()),
        "stdout": {"path": stdout_path.name, "bytes": len(completed.stdout), "sha256": sha256(completed.stdout)},
        "stderr": {"path": stderr_path.name, "bytes": len(completed.stderr), "sha256": sha256(completed.stderr)},
        "copied_stdout": copied_stdout,
        "declared_side_effects": step.get("declared_side_effects", []),
    }
    records.setdefault("records", []).append(record)
    records["state"] = "RUNNING"
    write_json_atomic(RECORDS, records)
    print(json.dumps({"id": step_id, "exit_code": completed.returncode, "result": result,
                      "stdout_sha256": sha256(completed.stdout), "stderr_sha256": sha256(completed.stderr)}, sort_keys=True))
    return 0 if result == "EXPECTED_EXIT" else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("step_id", nargs="?")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if args.verify:
        return verify_records()
    if not args.step_id:
        parser.error("provide one frozen command-plan step id or --verify")
    return run_step(args.step_id)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"capture-command error: {type(error).__name__}: {error}", file=sys.stderr)
        raise SystemExit(64)
