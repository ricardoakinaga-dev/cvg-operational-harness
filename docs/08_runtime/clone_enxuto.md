# Clone enxuto sem a evidência histórica

SPEC [0314](../02_spec/0314_evidence_archive_offrepo.md), opção A. A pasta `docs/04_audit/evidence/` concentra quase toda a massa do checkout (cerca de 4 GB e 87 mil arquivos). Ela continua versionada e intacta; este roteiro só evita materializá-la no disco. Nada é movido, apagado ou reescrito no histórico.

## Criar um clone enxuto

```bash
git clone --filter=blob:none --no-checkout https://github.com/ricardoakinaga-dev/cvg-operational-harness.git
cd cvg-operational-harness
git sparse-checkout init --no-cone
printf '/*\n!/docs/04_audit/evidence/\n' | git sparse-checkout set --no-cone --stdin
git checkout main
```

Medido em 04/11/2026: a árvore de trabalho fica com cerca de 56 MB em vez de 4,3 GB.

## Ler uma evidência quando precisar

```bash
git sparse-checkout add docs/04_audit/evidence/<PASTA>
```

Para voltar ao modo enxuto, repita o `set` acima.

## Verificações de documentação num clone enxuto

Os links para a evidência continuam válidos, mas os arquivos não existem no disco. Com `CVG_SPARSE_EVIDENCE=1`:

- `check-doc-links.mjs` aceita um alvo ausente **somente se o Git o rastreia**, e o lista em `sparseUnmaterialized`. Um alvo que nunca existiu continua sendo link quebrado.
- `check-evidence-hygiene.mjs` informa `SKIPPED_SPARSE_EVIDENCE` e termina com 0, mas **não verifica nada**: a higiene da evidência só vale com a pasta materializada.

```bash
CVG_SPARSE_EVIDENCE=1 node scripts/check-doc-links.mjs README.md AGENTS.md docs products
```

## Regras

- A CI e qualquer gate de release rodam **sem** `CVG_SPARSE_EVIDENCE` e com a evidência completa. O modo enxuto é só conveniência local e não substitui `docs:check-links` nem `evidence:check-hygiene` completos.
- Quem for validar ou citar uma evidência deve materializá-la antes.
- Mover pacotes para fora do repositório (opção B) e reescrever o histórico (opção C) continuam fora de escopo; exigem nova decisão do usuário.
