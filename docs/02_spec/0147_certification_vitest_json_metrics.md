# 0147 — PR-010: métricas de Vitest do relatório JSON

- Task: [PR-010](../03_build/0356_production_backlog_2026-09-26.md); trilha T2, certificação interna sem mudança de contrato público ou efeito externo.
- Estado: `BUILD_LOCAL_AUTHORIZED`; produção `NO_GO`.

## Recon

O Verify remoto `36298961234` do SHA `5ee02e8` passou os gates até
`Gate certification`. Dentro do certificador, 16 comandos retornaram exit 0,
mas `Phase10ResultSchema.parse` falhou em `metrics.unit`: era `null`, pois o
parser de texto não encontrou o resumo unitário esperado. A execução local
sobre o mesmo código produziu `metrics.unit` válido. O artefato JSON unitário
é gerado pelo próprio comando e já é usado pela governança de skips; não há
prova de que o formato textual do runner remoto seja estável. O certificador
não pode concluir `CONDITIONAL_GO` sem métricas unitárias verificáveis.

## Regra e aceite

1. Derivar as contagens de arquivos e testes de `certification/unit-test-report.json`,
   `postgres-test-report.json` e `chaos-report.json` quando válidos. Somar
   status dos arquivos em `testResults`; usar contagens numéricas de testes
   do JSON. Rejeitar relatório vazio, contador inválido ou inconsistência
   entre totais e itens; não converter ausência de evidência em zero.
2. Conservar parsing textual apenas como compatibilidade para registros
   históricos sem JSON, e registrar falha explícita se a unidade obrigatória
   continuar sem métricas. Um `ZodError` genérico no fim não é diagnóstico
   suficiente.
3. Testar JSON real e casos negativos com texto sem resumo/ANSI. `typecheck`,
   `lint`, suítes afetadas, certificação e Verify remoto devem passar no
   mesmo SHA. Security permanece obrigatório no SHA final.
