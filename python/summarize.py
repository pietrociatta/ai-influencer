#!/usr/bin/env python3
"""Summarize the X API traffic parsed into python/logs/calls.jsonl.

Usage:
    python3 python/summarize.py
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parent / "logs"
CALLS_FILE = LOG_DIR / "calls.jsonl"
AUTH_FILE = LOG_DIR / "auth.json"


def main() -> None:
    if not CALLS_FILE.exists():
        print(f"No log at {CALLS_FILE}. Run: python3 python/parse_har.py")
        return

    records = []
    for line in CALLS_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    if not records:
        print("Log file is empty.")
        return

    kinds = Counter(r.get("kind", "?") for r in records)
    statuses = Counter(str(r.get("status")) for r in records)
    ops: dict[str, Counter] = defaultdict(Counter)
    for r in records:
        if r.get("operation"):
            ops[r["operation"]][str(r.get("status"))] += 1

    print(f"X session summary  ({CALLS_FILE})")
    print("=" * 60)
    print(f"Total API calls : {len(records)}")
    print(f"Time span       : {records[0].get('ts')}  ->  {records[-1].get('ts')}")
    print()

    print("By kind:")
    for kind, n in kinds.most_common():
        print(f"  {kind:10s} {n}")
    print()

    print("By status:")
    for code, n in statuses.most_common():
        print(f"  {code:6s} {n}")
    print()

    if ops:
        print("GraphQL operations:")
        for op, sc in sorted(ops.items(), key=lambda kv: -sum(kv[1].values())):
            detail = ", ".join(f"{s}:{c}" for s, c in sc.items())
            print(f"  {op:40s} {sum(sc.values()):4d}  ({detail})")
        print()

    if AUTH_FILE.exists():
        auth = json.loads(AUTH_FILE.read_text(encoding="utf-8"))
        print("Auth on file:")
        print(f"  auth_type   : {auth.get('auth_type')}")
        print(f"  bearer      : {auth.get('bearer')}")
        print(f"  csrf_token  : {auth.get('csrf_token')}")
        print(f"  cookies     : {list(auth.get('cookies', {}).keys())}")


if __name__ == "__main__":
    main()
