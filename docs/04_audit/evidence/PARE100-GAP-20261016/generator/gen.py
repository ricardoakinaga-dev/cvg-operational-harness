import json
import sys
from collections import defaultdict

sys.path.insert(0, sys.argv[1])
from cards import C  # noqa: E402

MID = {"P": 3, "M": 8, "G": 22, "GG": 45}
LOW = {"P": 2, "M": 5, "G": 15, "GG": 30}
HIGH = {"P": 3, "M": 10, "G": 30, "GG": 60}
PHASES = ["F0", "F1", "F2", "F3", "F4", "F5", "F6", "F7"]
PROOF = ["PAR-Q06", "PAR-Q07", "PAR-Q09"]

ids = {c["id"] for c in C}
assert len(ids) == len(C), "id duplicado"
for c in C:
    for d in c["deps"]:
        assert d in ids, (c["id"], d)
byid = {c["id"]: c for c in C}


def finish(scope, size=MID):
    memo = {}

    def f(i):
        if i in memo:
            return memo[i]
        c = byid[i]
        start = max([f(d) for d in c["deps"] if d in scope] or [0])
        memo[i] = start + size[c["tam"]]
        return memo[i]

    return max(f(i) for i in scope if i not in PROOF), memo


def path(scope, memo):
    end = max((i for i in scope if i not in PROOF), key=lambda i: memo[i])
    seq = [end]
    while True:
        c = byid[seq[-1]]
        ds = [d for d in c["deps"] if d in scope]
        if not ds:
            break
        seq.append(max(ds, key=lambda d: memo[d]))
    return list(reversed(seq))


def effort(scope, size):
    return sum(size[byid[i]["tam"]] for i in scope)


scopes = {
    "M1_motor_unificado": {c["id"] for c in C if c["fase"] in ("F0", "F1")},
    "M2_motor_equivalente": {c["id"] for c in C if c["fase"] in ("F0", "F1", "F2", "F3")},
    "M3_paridade_hospitalar": {c["id"] for c in C if c["fase"] != "F6"},
    "M4_paridade_integral": set(ids),
}
out = {"cards": len(C), "por_fase": {}, "marcos": {}}
for f in PHASES:
    cs = [c for c in C if c["fase"] == f]
    out["por_fase"][f] = {
        "cartoes": len(cs),
        "dias_mid": sum(MID[c["tam"]] for c in cs),
        "dias_low": sum(LOW[c["tam"]] for c in cs),
        "dias_high": sum(HIGH[c["tam"]] for c in cs),
        "prio": {p: sum(1 for c in cs if c["prio"] == p) for p in ("P0", "P1", "P2", "P3")},
    }
proof_days = sum(MID[byid[i]["tam"]] for i in PROOF)
for name, sc in scopes.items():
    cp, memo = finish(sc)
    tail = proof_days if name in ("M3_paridade_hospitalar", "M4_paridade_integral") else 0
    eff = {k: effort(sc, s) for k, s in (("low", LOW), ("mid", MID), ("high", HIGH))}
    cal = {}
    for lanes in (1, 3, 5):
        cap = lanes * 5 * 0.7
        cal[lanes] = {k: round(max((cp + tail) / 5, v / cap), 1) for k, v in eff.items()}
    out["marcos"][name] = {
        "cartoes": len(sc), "esforco_dias": eff, "caminho_critico_dias": cp + tail,
        "caminho": path(sc, memo) + ([*PROOF] if tail else []), "semanas_por_lanes": cal,
    }
out["prio_total"] = {p: sum(1 for c in C if c["prio"] == p) for p in ("P0", "P1", "P2", "P3")}
print(json.dumps(out, ensure_ascii=False, indent=1))

# ---------- markdown do backlog ----------
TIT = {
    "F0": "F0 — Medida, base e processo",
    "F1": "F1 — Kernel único e contenção",
    "F2": "F2 — Modelo, sessão e contexto",
    "F3": "F3 — Ferramentas, eventos e SDK",
    "F4": "F4 — Orquestração",
    "F5": "F5 — Console, operação e interação hospitalar",
    "F6": "F6 — Cauda integral (escopo a confirmar na decisão D2)",
    "F7": "F7 — Prova e aceite",
}
md = []
for f in PHASES:
    cs = [c for c in C if c["fase"] == f]
    pf = out["por_fase"][f]
    md.append(f"## {TIT[f]}\n")
    md.append(f"{pf['cartoes']} cartões, cerca de {pf['dias_mid']} dias de engenharia "
              f"(faixa {pf['dias_low']}–{pf['dias_high']}).\n")
    md.append("| Cartão | Título | Tam. | Prio. | Estado | Depende de |")
    md.append("| --- | --- | --- | --- | --- | --- |")
    for c in cs:
        deps = ", ".join(c["deps"]) or "—"
        md.append(f"| {c['id']} | {c['titulo']} | {c['tam']} | {c['prio']} | `{c['estado']}` | {deps} |")
    md.append("")
    for c in cs:
        deps = ", ".join(c["deps"]) or "nenhuma"
        md.append(f"### {c['id']} — {c['titulo']}\n")
        md.append(f"- Fase {c['fase']} · prioridade {c['prio']} · tamanho {c['tam']} · trilha {c['trilha']} · "
                  f"relevância hospitalar {c['rel']} · estado `{c['estado']}`.")
        md.append(f"- Origem: {c['ref']}. Absorve: {c['legado']}.")
        md.append(f"- Hoje: {c['hoje']}")
        md.append(f"- Entrega: {c['entrega']}")
        md.append(f"- Depende de: {deps}.")
        md.append(f"- Aceite: {c['aceite']}\n")
open(sys.argv[2], "w", encoding="utf-8").write("\n".join(md))

# mapa P100 -> PAR
m = defaultdict(list)
for c in C:
    for tok in c["legado"].replace(";", ",").split(","):
        tok = tok.strip()
        if tok.startswith("P100-"):
            m[tok.split(" ")[0]].append(c["id"])
open(sys.argv[3], "w", encoding="utf-8").write(json.dumps({k: m[k] for k in sorted(m)}, ensure_ascii=False, indent=1))
