#!/usr/bin/env python3
"""AAA-02 builder documentation checks (read-only).

Verifies:
- all relative links in aaa_decision_brief.md resolve;
- claims in the brief match the canonical sources (contracts, backlog JSON, ledger, plan).

Deterministic output: no timestamps. Run from any directory.
"""

import json
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", "..", "..", "..", ".."))
BRIEF_REL = "docs/01_prd/aaa_decision_brief.md"

failures = 0
missing = []


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return fh.read()


def check(name, condition, detail=""):
    global failures
    status = "PASS" if condition else "FAIL"
    if not condition:
        failures += 1
    print(f"[{status}] {name}" + (f" :: {detail}" if detail else ""))


def collect_tasks(node, out):
    if isinstance(node, dict):
        tid = node.get("id")
        if isinstance(tid, str) and tid.startswith("AAA-"):
            out[tid] = node
        for value in node.values():
            collect_tasks(value, out)
    elif isinstance(node, list):
        for value in node:
            collect_tasks(value, out)


print("=== FILE ===")
brief_path = os.path.join(ROOT, BRIEF_REL)
print(f"brief={BRIEF_REL} exists={os.path.exists(brief_path)}")
check("brief exists", os.path.exists(brief_path))

brief = read(BRIEF_REL)

print("\n=== LINKS ===")
links = re.findall(r"\[[^\]]+\]\(([^)]+)\)", brief)
print(f"links_total={len(links)}")
for link in links:
    if link.startswith(("http://", "https://", "#")):
        continue
    target = os.path.normpath(os.path.join(os.path.dirname(BRIEF_REL), link.split("#")[0]))
    ok = os.path.exists(os.path.join(ROOT, target))
    if not ok:
        missing.append((link, target))
        print(f"[MISSING] {link} -> {target}")
check("all relative links resolve", not missing, f"missing={len(missing)}")

print("\n=== CLAIMS ===")

exec_contract = read("docs/02_spec/aaa_execution_contract.md")
check("D01/RF-011: 0013 exige workflow LangGraph", "executar workflow LangGraph correspondente" in read("docs/01_prd/0013_requisitos_funcionais.md"))
check("D02: confirm/reschedule sem grant -> DENY", "**sem grant → DENY**" in exec_contract)
check("D02: modify somente appointment_draft", "somente draft" in exec_contract and "appointment_draft" in exec_contract)
check("D02: cancel require_approval", "appointment.cancel" in exec_contract and "require_approval" in exec_contract)
check("D02: controlled_fake e real_effect_not_authorized", "controlled_fake" in exec_contract and "real_effect_not_authorized" in exec_contract)

quality = read("docs/02_spec/aaa_quality_contract.md")
check("D03: bounds propostos e pendentes de D03", "propostos e não aprovados" in quality and "pendentes de D03" in quality)
check("D03: coverage/mutacao congelados na v2", "Pisos obrigatórios" in quality and "congelad" in quality)

data_contract = read("docs/02_spec/aaa_data_api_contract.md")
check("D05: D05-1/D05-2 decididas no contrato de dados", "D05-1" in data_contract and "D05-2" in data_contract)
check("D05: D05-3/D05-4 pendentes no contrato de dados", "D05-3" in data_contract and "D05-4" in data_contract and "Pendente" in data_contract)
check("D05-3: retencao provisoria de 30 dias", "30 dias" in data_contract)

plan = read("docs/03_build/0324_aaa_executive_plan.md")
check("D01: nao paralisa F01-F05", "D01 não precisa paralisar F01–F05" in plan)
check(
    "D01-D05: autoridades registradas no plano",
    all(
        text in plan
        for text in [
            "Produto + responsável técnico humano",
            "Produto + segurança/operação",
            "Operação + dono do serviço",
            "Donos das integrações/dados + segurança",
        ]
    ),
)

tasks = {}
collect_tasks(json.loads(read("docs/03_build/tracking/aaa_program_backlog.json")), tasks)
check("D01: AAA-06 gate G_D01", tasks.get("AAA-06", {}).get("gate") == "G_D01")
check("D01: AAA-21 gate G_D01_SPEC", tasks.get("AAA-21", {}).get("gate") == "G_D01_SPEC")
local_ids = ["AAA-07", "AAA-08", "AAA-09", "AAA-10", "AAA-11"]
check(
    "D01: AAA-07..11 gate G_SPEC e sem dependencia de AAA-02/AAA-06",
    all(
        tasks.get(tid, {}).get("gate") == "G_SPEC"
        and "AAA-02" not in tasks.get(tid, {}).get("dependencies", [])
        and "AAA-06" not in tasks.get(tid, {}).get("dependencies", [])
        for tid in local_ids
    ),
)
check("D03: AAA-32 gate G_D03_SPEC", tasks.get("AAA-32", {}).get("gate") == "G_D03_SPEC")
check(
    "D04: AAA-37/38/39 gates externos",
    tasks.get("AAA-37", {}).get("gate") == "G_EXTERNAL"
    and tasks.get("AAA-38", {}).get("gate") == "G_HUMAN"
    and tasks.get("AAA-39", {}).get("gate") == "G_EXTERNAL_HUMAN",
)

ledger = json.loads(read("docs/03_build/tracking/aaa_execution_ledger.json"))
coordinator = {d.get("id"): d for d in ledger.get("coordinatorDecisions", [])}
check("D05: D05-1/D05-2 no coordinatorDecisions", {"D05-1", "D05-2"}.issubset(coordinator.keys()))
check(
    "D05: D05-1/D05-2 sao coordenacao tecnica (nao gate humano)",
    "lead coordination decision" in coordinator.get("D05-1", {}).get("authority", "")
    and "not a human business gate" in coordinator.get("D05-1", {}).get("authority", ""),
)

check("brief registra PENDING para D01-D04", all(s in brief for s in ["D01", "D02", "D03", "D04", "PENDING"]))
check("brief registra D05-1/D05-2 DECIDIDAS", "**DECIDIDA**" in brief and "coordinatorDecisions" in brief)
check("brief inclui regra 'nao aprovar por silencio'", "Não aprovar por silêncio" in brief)
check("brief nao inventa aprovacao humana", "PREPARED_PENDING_HUMAN_DECISION" in brief and "não é decisão" in brief)

print("\n=== SUMMARY ===")
print(f"links_missing={len(missing)} claims_failed={failures}")
print("RESULT=" + ("PASS" if not missing and failures == 0 else "FAIL"))
sys.exit(0 if not missing and failures == 0 else 1)
