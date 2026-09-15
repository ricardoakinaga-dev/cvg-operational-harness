# AAA-12 — Errata de evidência: reprodução do `candidateDigest` e composição do journal

- Task: `AAA-12`. Autor: agent-2 (implementador). Data: 2026-09-12.
- Motivo: findings `AAA12-R3-F01` (digest não reproduzível pela definição documentada) e `AAA12-R3-F02` (journal durável não composto fora de testes) do parecer independente `docs/04_audit/evidence/AAA/AAA-12/review-agent-3/REVIEW.md`.
- Natureza: **correção de evidência/registro**. Nenhum arquivo de código do candidato foi alterado; os 12 hashes de arquivo do `manifest.json` permanecem idênticos e o parecer `APPROVE` do código continua válido para esse mesmo conjunto.

## F01 — definição exata e reprodução

A definição anterior ("sha256 of sorted path\0sha256 lines") era imprecisa: o digest foi calculado na **ordem de declaração** da lista de arquivos do manifesto, unidos por `\n`, sem newline final, com separador `\0` entre path e hash — não em ordem lexicográfica.

Reprodução exata (a partir do próprio manifesto em revisão):

```bash
python3 - <<'EOF'
import hashlib, json
m = json.load(open('docs/04_audit/evidence/AAA/AAA-12/manifest.json'))
h = m['candidate']['hashes']  # ordem de declaração preservada pelo JSON
payload = '\n'.join(f'{p}\0{v}' for p, v in h.items())
print(hashlib.sha256(payload.encode()).hexdigest())
EOF
```

Resultado: `33aa280785c149253dec5b42491ffea930d3424ee7a0095b8b8791b983122605` — confere com o `candidateDigest` do manifesto.

Identidade canônica para uso futuro (ordem lexicográfica de path, mesma serialização):

```bash
python3 - <<'EOF'
import hashlib, json
m = json.load(open('docs/04_audit/evidence/AAA/AAA-12/manifest.json'))
h = m['candidate']['hashes']
payload = '\n'.join(f'{p}\0{h[p]}' for p in sorted(h))
print(hashlib.sha256(payload.encode()).hexdigest())
EOF
```

Resultado canônico: `ae9c2b606a83ef3c5f2e77bc5378065fd8324d15d10d968f0d64ebb3812291c0`.

Decisão de registro: manter `candidateDigest: 33aa2807…` (valor efetivamente revisado e aprovado) e adotar `ae9c2b60…` como identidade canônica em novas revisões. O `manifest.json` **não** foi reescrito para preservar o hash recebido e o escopo do review.

## F02 — composição do journal durável (registro para AAA-21)

- Confirmado: `ChannelGateway` usa `InMemoryChannelEffectJournal` por padrão; nenhum caminho não-teste injeta `FileChannelEffectJournal`. A garantia de reserva durável só existe com injeção explícita.
- Encaminhamento (não implementado aqui, fora do ownership de AAA-12 nesta rodada): **AAA-21 deve injetar o journal durável e falhar fechado quando ele não estiver configurado** para envios automáticos; até o adapter SQL (D05-1/D05-2), a cobertura é host-local e o adapter em arquivo não é cross-host.
- Este item vira critério de aceite/composição em AAA-21, não uma promessa deste candidato.

## Limites

- Errata documental; não reexecuta a suíte do produto nesta rodada (o parecer independente já reexecutou 8 arquivos/62 testes PASS e a reprodução F04 `sends=1`).
- Nenhum gate concedido; `APPROVE` técnico não é signoff humano.
