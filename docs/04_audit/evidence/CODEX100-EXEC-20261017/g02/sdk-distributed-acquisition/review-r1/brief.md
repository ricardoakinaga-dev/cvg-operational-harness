# Revisão independente R1 — DX100-G02:ACQUIRE-DISTRIBUTED-PROFILE-0.153.4

Você é o crítico independente desta unidade, numa rodada única. Não herdou contexto.
Você é **somente leitura** no repositório e no cache: não crie, edite, mova nem apague
nada em nenhum dos dois. Sondas próprias ficam no seu diretório temporário e usam só a
stdlib (Python com `-I`, ou Node 22 em `/home/ricardo/.nvm/versions/node/v22.23.2/bin`).

Proibido: qualquer acesso à rede, executar ou carregar qualquer arquivo do cache
(binário, script, wheel ou pacote npm), extrair arquivos do cache para o disco,
`npm install`, `pip install`, importar o SDK, Pydantic ou packaging, rodar serviço,
Docker ou PG, commit, branch ou worktree. Ler os arquivos compactados do cache em
memória para calcular hashes é permitido.

## Assunto

- Pasta: `docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-distributed-acquisition/`
  (raiz do repositório: `/home/ricardo/Área de trabalho/cvg-operational-harness`).
- Cache: `/mnt/dados/cvg-work/cvg-codex100-distributed-cache-20261019`.
- Congelamento: `review-freeze-r1.json` na pasta, sha256
  `f1af997be853bdc01565a98dab70f69edb14ebdbe5e812683b207b2390f5a1a3`. Confira o sha
  de cada arquivo listado antes e depois da revisão.

## Pedido da unidade

O usuário decidiu as perguntas do perfil distribuído, registradas em
`../sdk-batch-2b2-binding/user-decision-distributed-profile-20261019.json`:

- Q1: a release 0.153.4 vira pin próprio, sem vínculo de build com `8d9f6466`, e isso é
  declarado;
- Q2: uma única aquisição com rede, só da lista do Codex;
- Q3: só keyless;
- Q4: capability nova negada;
- Q5: não autorizada.

A unidade devia:

1. antes de qualquer rede, registrar em `acquisition-plan.json`:
   - a lista exata dos sete itens da release 0.153.4;
   - a URL de cada um;
   - a fonte do digest esperado: o wheel contra o `uv.lock` do pin, os demais pelo
     digest publicado pelo registro;
   - o destino no cache;
2. não substituir item ausente ou ambíguo por outra versão;
3. baixar cada artefato uma vez, sem retry, só por leitura HTTP, sem credencial, sem
   instalador e sem executar nada;
4. registrar bytes, sha256 e sha512/integrity, e conferir o digest;
5. mandar divergência para quarentena como `DIGEST_MISMATCH`;
6. extrair metadados só como dados;
7. escrever `HOW-distributed-profile.md` com a próxima unidade (SPECIFY keyless de PY19,
   PY20, PK01–PK09 e do ramo empacotado do PY02);
8. não deixar binário em `docs/`.

## O que verificar

1. **Plano antes da rede.** O plano tem a lista exata e só os sete itens, com URL,
   fonte do digest e destino? O `written_at` do plano precede o `started_at` do
   `acquisition-ledger.json`? O sha do plano no registro confere?
2. **Digests.** Recalcule o sha256, o sha512 (em integrity base64) e o sha1 de cada
   arquivo em `artifacts/` e compare com:
   - para o A1, o `uv.lock` do pin (`../sdk-reference-profile/inputs/sdk/python/uv.lock`);
   - para os npm, o `dist` da versão nas respostas guardadas em `metadata/`;
   - para o A5, o `assets[].digest` da release em `metadata/`.

   Os resultados de `acquisition-ledger.json` e de `digest-verification.json` estão
   corretos?

3. **Regras da lista.**
   - O A3 é de fato o alias declarado pelo manifesto de `@openai/codex@0.153.4`?
   - O A6 (`openai-codex` 0.153.4 no PyPI) ficou `NOT_AVAILABLE` sem substituto?
   - A escolha do wheel `manylinux_2_17_x86_64` para o host tem justificativa?
   - Houve algum pedido fora do plano, repetido ou sem HTTPS?
4. **Metadados.** `artifact-metadata.json` confere com o conteúdo dos arquivos
   compactados (listas, sha256 dos membros e `package.json`)? A identidade dos binários
   entre A1, A3 e A5 e a diferença para o executável compilado do pin
   (`../../g02-reference-acceptance.json`) estão corretas?
5. **Limites.**
   - Não há binário, zip ou gzip na pasta da unidade, e o cache fica fora de `docs/`.
   - Nada foi executado nem instalado (confira os scripts `.py.txt`).
   - Não há credencial, token nem segredo nos registros.
6. **HOW.** A próxima unidade proposta está coerente com Q1–Q5, com os fatos da
   aquisição (A6 ausente, alias do A3, binários idênticos) e com o modo keyless?

## Formato da resposta

Devolva **apenas** um bloco JSON, sem texto fora dele:

```json
{
  "kind": "INDEPENDENT_REVIEW",
  "round": 1,
  "task": "DX100-G02:ACQUIRE-DISTRIBUTED-PROFILE-0.153.4",
  "reviewer": "subagente novo, sem contexto herdado; somente leitura",
  "reviewed_at": "<ISO 8601>",
  "subject": "review-freeze-r1.json",
  "subject_sha256": "<sha conferido>",
  "subject_hash_check": { "before": "<ok|lista>", "after": "<ok|lista>" },
  "digests_recomputed": { "<id>": "<ok|divergência>" },
  "verdict": "APPROVE | REVISE",
  "summary_counts": "<n P1, n P2, n P3>",
  "mandatory_findings": ["<ids P1/P2>"],
  "findings": [
    {
      "id": "R1-F01",
      "severity": "P1 | P2 | P3",
      "area": "<arquivo ou item>",
      "title": "<uma linha>",
      "evidence": ["<arquivo:linha ou ponteiro JSON>"],
      "detail": "<o problema>",
      "required_action": "<o que corrigir>"
    }
  ],
  "checks_run": ["<o que você conferiu>"],
  "limits": "<o que não foi possível conferir>",
  "functional_receipts": 0,
  "parity_credit": 0
}
```

Severidade: P1 bloqueia (digest errado aceito, artefato fora da lista ou de outra
versão, execução, instalação, credencial ou binário em `docs/`); P2 deve ser corrigido
antes de usar os artefatos; P3 é melhoria. APPROVE só com zero P1 e zero P2. Escreva
em português.
