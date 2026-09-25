# AUD49-DOC-001 — Crítica lead-only e revisão da SPEC L03 v0.4

## Escopo e autoridade

- Task registrada antes da revisão: `A24-11-L03-SPEC-REVIEW`, em 0344.
- Alvo: SPEC-DOC-001 de geração de navegação documental interna, após a v0.3
  preparada no mesmo ciclo.
- Método: leitura estática lead-only; revisão documental sem executar o gerador,
  comandos de BUILD ou checks de produto.
- Revisor independente I1: `UNAVAILABLE`. A criação fresh-context foi recusada
  pelo serviço com `agent thread limit reached`; nenhum reviewer ou parecer foi
  criado. A revisão humana da SPEC também não ocorreu.
- Status após a revisão: v0.4 permanece `SPEC_DRAFT_FOR_REVIEW`; sem autoridade
  para código, teste ou execução. Não é gate de BUILD.

## Achados e correções

| ID | Achado na v0.3 | Correção na v0.4 |
| --- | --- | --- |
| L03-R3-01 | A varredura geral para fences/comments podia contradizer a regra de que o histórico posterior ao primeiro delimitador não é lido. | A leitura é uma varredura ordenada que para no primeiro delimitador elegível. Fences/comments incompletos só falham no prefixo corrente; a cauda histórica não é inspecionada. |
| L03-R3-02 | A invariante dizia que heading em blockquote/lista não encerraria a fonte, mas a regra line-oriented não definia containers Markdown nem todos os casos de continuação. | O matcher literal define o resultado: prefixo explícito `>`/`-` não corresponde; heading isolado com até três espaços sempre corresponde, inclusive em continuação de lista. Não há inferência de containers. |
| L03-R3-03 | O tratamento de backticks sem fechamento e de spans inline-code dentro de candidatos a link não era determinístico. | Runs não escapados pareiam somente na mesma linha e com tamanho igual; run sem par é literal. Span mascarado dentro de candidato inline-link causa `UNSUPPORTED_INLINE_CODE_IN_LINK`, sem extração parcial. |
| L03-R3-04 | `UNSUPPORTED_INDENTED_LINK` não definia o que conta como sintaxe link-like. | O candidato é um `[` não escapado seguido, na mesma linha, pelo primeiro `](` não escapado. A linha não é extraída e falha com arquivo/linha. |
| L03-R3-05 | Gramática de link não fixava whitespace permitido em torno de destination/title, fechamento de label ou escapes aceitos em titles. | A regra 6 fixa fronteiras de label, escapes, destino sem angle/entre angle, separador de title e whitespace antes do `)`, além de falhar para nesting/escape fora do subconjunto. |
| L03-R3-06 | A detecção de esquema explícito não dizia se operava no texto bruto ou no destination já interpretado. | A regra 7 define detecção no início do destination interpretado com `^[A-Za-z][A-Za-z0-9+.-]*:`. |
| L03-R3-07 | A leitura estrita de UTF-8 não deixava claro se também cobria o índice-alvo. | Inputs e índice-alvo exigem UTF-8 estrito sem BOM; os bytes originais permanecem a base para comparação. |

## Compatibilidade observada nas fontes atuais

Uma inspeção estática somente-leitura dos três prefixos correntes encontrou:

| Fonte | Primeira linha `## Histórico` | Linhas correntes | Padrões link-like em linhas indentadas | Padrões link-like com backtick no token |
| --- | ---: | ---: | ---: | ---: |
| `docs/99_runtime_state.md` | 28 | 27 | 0 | 0 |
| `docs/20_master_execution_log.md` | 28 | 27 | 0 | 0 |
| `docs/30_backlog_master.md` | 16 | 15 | 0 | 0 |

Esta inspeção foi uma contagem textual heurística, não uma implementação nem
uma prova do parser proposto; não validou a gramática completa dos links. O
`docs/99_operational_index.md` ainda contém zero
cópias dos dois marcadores gerados. A v0.4 mantém o bootstrap do par de
marcadores fora do gerador e exige delta/gate separado antes do primeiro
`--write`.

## Resultado documental

- SPEC corrente: [0129 — SPEC-DOC-001 v0.4](../../../../02_spec/0129_l03_operational_index_generator.md), SHA-256 `7a144a686d7a5ce7333efa50c7f476b662b9da4a6b97936f85a0bb07504bc0a9`.
- A v0.3 foi supersedida por esta revisão; a v0.2 e revisões anteriores permanecem como histórico em AUD39/AUD40.
- Não houve alteração de código, teste, configuração, índice gerado ou dado de produto. Nenhum comando de produto, typecheck, lint, coverage, scanner, CI ou runtime foi executado.
- Permanecem necessárias revisão independente disponível, revisão humana da v0.4 e um gate hash-bound próprio antes de qualquer BUILD.

## Tentativa independente adicional

- Em 2026-09-24 11:05:49 UTC, uma segunda solicitação fresh-context read-only para avaliar a mesma SPEC v0.4 e o mesmo SHA `7a144a686d7a5ce7333efa50c7f476b662b9da4a6b97936f85a0bb07504bc0a9` foi recusada pela ferramenta com `agent thread limit reached`.
- Nenhum reviewer foi criado, nenhum parecer foi produzido e nenhum arquivo do repositório mudou nesta tentativa. O estado continua `I1_UNAVAILABLE`; esta recusa não é evidência de aprovação ou reprovação da SPEC.
