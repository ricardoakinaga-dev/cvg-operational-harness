# Prioridades de resolução RA24 — 24/09/2026

Fonte: [auditoria 0572](../04_audit/0572_repository_score_assessment_2026-09-24.md). Este plano organiza os quatro problemas destacados pelo usuário sem alterar a autoridade dos gates M07. Produção permanece `NO_GO`.

| Ordem | Task                                                                                            | Estado                                                                                                   | Dependência                                                                                                      | Critério de pronto                                                                                                                             |
| ----: | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | `A24-03-C1M-PACKET`: reconciliar o único tuple de baseline divergente e preparar novo candidato | `IN_PROGRESS / DOCUMENTARY` em [0344](0344_reaudit_m07_backlog.md)                                       | C1L `FAIL / OPEN`; decisão hash-bound nova antes de código, scanner ou testes                                    | Packet C1M com baseline de 973 inputs, preview limitado, quality bar, rollback e hashes reproduzíveis; execução posterior só sob gate próprio. |
|     2 | `RA24-02-DOC`: reconciliar os 165 artefatos vazios sem catálogo                                 | `COMPLETED_DOCUMENTARY` — [evidência](../04_audit/evidence/AUD-20260924/RA24-documentary-remediation.md) | Preservar bytes e registros de comando históricos                                                                | 231/231 vazios catalogados; checker de higiene exit 0.                                                                                         |
|     3 | `RA24-04-DOC`: reparar o link C1I realmente ausente                                             | `COMPLETED_DOCUMENTARY` — [evidência](../04_audit/evidence/AUD-20260924/RA24-documentary-remediation.md) | Arquivo arquivado C1I existente                                                                                  | Ponteiro histórico resolve para o artefato arquivado; checker dirigido ao runtime exit 0.                                                      |
|     4 | `RA24-04-CHECKER`: eliminar 5 falsos positivos da extração de links Markdown                    | `PROPOSED / SPEC_AND_BUILD_GATE_REQUIRED`                                                                | Task, SPEC e gate de BUILD próprios para `scripts/check-doc-links.mjs` e teste; SPEC L03 draft permanece intacta | Testes positivos/negativos distinguem exemplos de links reais; varredura `README.md docs` retorna exit 0 sem esconder link quebrado.           |

## Task documental RA24-02-DOC

- **O que/onde:** atualizar somente `docs/04_audit/evidence/empty-artifact-status.json` e evidência de resultado documental, sem alterar logs históricos ou `command-records.json`.
- **Como:** inventariar os 165 vazios por diretório; vincular cada arquivo ao stream de `command-records.json` por path, hash SHA-256 vazio e exit code. A inspeção inicial encontrou 164/165 vínculos diretos e nenhum hash/tamanho conflitante; `M07-S1-C1F/sanitization-final.stderr.log` não tem vínculo direto e deve conservar metadados desconhecidos. `expected_empty` descreve apenas stream observado vazio, nunca PASS do comando.
- **Dependência:** autorização documental dada pelo pedido do usuário para priorizar a resolução; nenhuma edição de produto ou mudança de gate. Se a proveniência não puder ser confirmada, registrar `capture_missing` e campos `null`.
- **Critério de pronto:** catálogo totaliza os vazios existentes, nenhuma informação de execução é inventada, JSON parseia e `node scripts/check-evidence-hygiene.mjs` retorna exit 0.

## Task documental RA24-04-DOC

- **O que/onde:** corrigir somente o link do registro histórico C1I em `docs/99_runtime_state.md` para o artefato preservado em `.gauntlet-archive/`.
- **Como:** confirmar target existente antes/depois; preservar texto e status histórico do registro. Não editar SPEC L03, código do checker ou evidências congeladas.
- **Dependência:** nenhuma dependência de M07; não modifica nenhum dos 973 inputs da baseline C1J.
- **Critério de pronto:** `node scripts/check-doc-links.mjs docs/99_runtime_state.md` retorna exit 0 para o documento; varredura global reduz a contagem de 6 para 5 ocorrências restantes, identificadas como casos de parser.

## Task proposta RA24-04-CHECKER

- **O que/onde:** corrigir a extração de links em `scripts/check-doc-links.mjs` e seus testes sem editar a SPEC L03 v0.4 nem a crítica histórica.
- **Como:** congelar exemplos reais e negativos para inline code, fences, exemplos Markdown em prosa e links relativos válidos/quebrados; exigir parsing por linha/contexto suficiente para não atravessar blocos e preservar a detecção de links reais. Inspecionar o diff e a varredura global após a mudança.
- **Dependência/gate:** registrar SPEC curta e obter o gate de BUILD aplicável antes de alterar script/testes. Esta priorização não é aprovação de código.
- **Critério de pronto:** os cinco falsos positivos deixam de aparecer, um link propositalmente quebrado continua rejeitado, `node scripts/check-doc-links.mjs README.md docs` retorna exit 0 e os gates de código exigidos pelo processo CVG passam.

## Sequência de gate M07

Concluir e validar estaticamente C1M; apresentar o pedido hash-bound concreto para decisão humana; somente após aprovação executar sob Node 22 o freeze, inventário, testes focados/completos, typecheck, lint, cobertura e pós-check do novo candidato. Revisões I1/Final Critic e os 11 findings de dependência continuam critérios separados. A correção documental RA24-02/04 não aceita M07-S1 por antecipação.

## Estado após a primeira remediação

O checker de higiene passou com 231/231 arquivos vazios catalogados. O link C1I foi corrigido; a varredura global de links caiu de seis para cinco ocorrências. A prioridade técnica continua C1M. As cinco ocorrências restantes dependem da task `RA24-04-CHECKER`; editar a SPEC L03 draft para silenciar o checker alteraria seu hash de revisão e não faz parte desta task.
