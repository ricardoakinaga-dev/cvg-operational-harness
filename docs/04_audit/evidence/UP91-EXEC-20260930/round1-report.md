# Rodada UP91-EXEC-1 — implementação e verificação

Estado: **programa em execução, não concluído; produção NO_GO**. O objetivo permanece implementar os 52 cartões, preservando os 83 aceites de origem e os 13 gates. O Gauntlet conserva 149 critérios obrigatórios; nenhum foi dispensado. Este relatório registra uma rodada limitada, sem declarar qualidade AAA integral.

## Implementação realizada

UP91-021-R1/R2: extração interna da recuperação de efeitos e da solicitação de approval. `runtime.ts` passou de 2.636 para 1.498 linhas; quatro módulos internos receberam os corpos preservados. Prova estrutural de 29 comparações e sentinelas known-good/bad PASS. Contratos públicos, barrel, package e lockfile preservados.

UP91-004-R1: os quatro módulos entram no denominador crítico do kernel. Paths anteriores, grupos e piso de 95% permanecem. Crítica independente favorável ao refactor e ao delta de medição. As subfatias continuam VERIFY; isso não encerra os cartões pais ou suas outras dependências.

## Verificação executada

Candidato de código: `d16b83eec6ac1f31c45c63398f90fac8f0906a476bcc3e4bb805e2ba697e32e9`; runtime SHA-256 `0f4ca214e94ca554da2cc590a392f8bf2b737acac3281f9fb2b6092700a18e85`. Node 22.23.2, PostgreSQL 16 sintético e recursos loopback exclusivos.

| Verificação              | Resultado observado                            |
| ------------------------ | ---------------------------------------------- |
| Unitários                | 2.481/2.481 PASS, zero skips                   |
| PostgreSQL               | 288/288 PASS, zero skips                       |
| E2E simulado             | 12/12 PASS, zero skips/flaky                   |
| E2E trusted              | 15/15 PASS, três browsers, retries 0           |
| Typecheck, lint, build   | PASS                                           |
| Cobertura crítica kernel | 504/526 branches, 95,82%; piso 95%             |
| Mutation guard           | 10/10 killed, zero sobreviventes/timeout/erros |
| Certificação nativa      | 14/16 gates PASS; resultado integral FAIL      |

Load/restore/evals desta rodada são sintéticos; não qualificam ambiente alvo, PITR ou provider real. Evidências e candidatos anteriores não são automaticamente provas do checkout compartilhado atual. Ver [manifesto nativo](native-certification/manifest.json), [log completo](checks/certify.log) e [crítica integrada](integrated-round1-critic.json).

## Falhas preservadas

O gate security encontrou três dependências HIGH: brace-expansion, fast-uri e undici. O gate format encontrou três documentos preexistentes e duas configurações próprias de browser. Depois, a emissão do resultado falhou com `metrics.unit=null` rejeitado pelo schema. A reprodução isolou a interpretação do resumo Vitest com ANSI. **Nenhum certificado foi emitido**.

Após registrar a rodada, as duas configurações próprias receberam somente formatação. Novo check de formato ainda FAIL nos três documentos preexistentes; nenhum arquivo de outro agente foi reformatado. Não houve nova emissão de certificado. O fingerprint do snapshot mudou de `fc3e7040dd8cd9a4ed99f1d7f5961c4be9d55edee12cd66660639a933e7bce89` para `28f944caab4dd3059589d722ebcf78469d8161b21ec1a877e519df1632db4541`, com rebaseline explícita e evidências anteriores preservadas.

Gauntlet round1: **REJECT global / REVISE**, apoiando o escopo T2 observado e recusando PASS dos 149 critérios integrais. Sentinela integral pré/pós crítica inalterada. Native state validado; estado permanece ACTIVE/FIX_RETEST. Ver [registro](gauntlet-round1-record.json) e [resumo atual](gauntlet-current-state-summary.json).

## Pacotes revisáveis e decisões pendentes

- **UP91-012**, SPEC0167: crítica independente ACCEPT_FOR_HUMAN_REVIEW. Módulo `7012a5d171998eff15ffd0d7d00f2bfd9881598dc4b5f09fce6e5009d001590a`: pisos não redutíveis, versão efetiva/binding, identidade server-side, testes públicos positivos/negativos. Integração final depende de UP91-014. Pedido de revisão humana explícita enviado; BUILD sintético ainda não autorizado. [Parecer](policy-review-v2.json).
- **SPEC0170**: crítica independente ACCEPT_FOR_HUMAN_REVIEW. Hash `755f1cbde3c13ba1cea546896d505506482e90600be52799e4c974f51a76dc9d`: parser ANSI, reporter vinculado à execução, projeção log/JSON, FAIL/NO_GO válido quando métricas faltam. Preserva SPEC0157, gates, skips, closures e pisos. Pedido de revisão explícita enviado; BUILD ainda não autorizado. [Parecer](cert-parser-review-v2.json).
- **Discovery0097/PRD0014/G03**: crítica independente favorável à prontidão documental; 52/83/13 preservados. Reconciliação confirmou critérios/dependências/rastreio atuais idênticos após mudanças de notas em0364. A opção B propõe corrigir o ciclo entre zero P0/P1 e auditoria P1 de 30 dias após GA; não foi aplicada. **G03 original permanece vigente.** [Parecer](product-review-v1.json), [reconciliação](product-source-reconciliation.json), [proposta](product-packets/g03-decision-options.md).

D-12/T3 exige “T2 + revisão explícita da SPEC pelo usuário antes do BUILD”. Parecer técnico, objetivo amplo ou tempo decorrido não registram essa revisão. O ledger de autoridade continua vazio para as candidatas novas.

## Continuidade

Retomar pelos pedidos pendentes e hashes exatos, pelo controller `.agent` e pelo claim UP91-EXEC. Quando vier a revisão, registrar seu escopo real antes de BUILD, atualizar claim/task e executar os gates pertinentes. Sem aprovação, continuar trabalho independente autorizado.

SPEC0164 já possui aprovação sintética registrada em outro pacote, condicionada à liberação do lockfile por PR-L04; não solicitar novamente essa decisão nem ignorar sua condição. Infraestrutura, identidade institucional, fontes, retenção, pentest, UAT, piloto e GO mantêm suas decisões e provas próprias. Não encerrar o objetivo na primeira rodada.

Ledgers compartilhados permanecem sob seus holders; atualização preparada no [handoff](../../../08_runtime/handoffs/up91_execution_20260930.md). Sem dados/efeitos reais, push, deploy ou commit nesta rodada.
