# SPEC — AUD19-016 — Freeze, auditoria independente e adjudicacao

- programa: `AUD-20260919-REMEDIATION`; onda: `W4`.
- dependencias: `AUD19-013` verificada; `AUD19-014` gates tecnicos PASS;
  `AUD19-015` verificada.
- escopo: candidato local/sintetico/descartavel; sem producao, credenciais,
  providers ou efeitos externos.

## Quality bar

1. O candidato deve ter um unico `candidateId`, manifesto e logs de gates
   vinculados por hash e `runId`.
2. Gates obrigatorios devem estar PASS, sem skip obrigatorio e com qualquer
   skip condicional explicitamente justificado.
3. A critica final deve ser fresh/read-only, nao herdada do builder, e deve
   inspecionar o artefato real; mutacao invalida a critica.
4. Sentinel pos-critica deve confirmar que o candidato e as evidencias nao
   mudaram durante a janela de adjudicacao.
5. Decisao, findings, riscos residuais e limites de producao devem apontar para
   o mesmo digest.

## Procedimento

1. Executar `npm run certify` com PostgreSQL descartavel.
2. Executar `npm run certification:verify` no candidato produzido.
3. Obter critica nova, read-only, contra o pacote congelado.
4. Rerodar `certification:verify`/sentinel apos a critica.
5. Registrar adjudicacao final sem reparar durante a janela critica.

## Evidencia

`docs/04_audit/evidence/AUD-20260919/AUD19-016/` e o pacote de certificacao.
