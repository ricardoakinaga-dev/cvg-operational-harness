# HISO005 resolver conformance repair — FAILED_QUALITY_BAR

O reparo conservador0236 não está qualificado para integração. A segunda/última revisão independente confirmou as duas correções da primeira rodada, mas encontrou um P1 obrigatório na precedência de módulos nativos. [Veredito R2](review-r2/review.json), [relatório independente](review-r2/REPORT.md), [conferência do Lead](review-r2-lead-confirmation.json). HISO005/P2/P3/B6 permanece aberto; produção não autorizada.

## Resultado observado

Fonte congelada `7ad6d2f7a3da48786b0770f6cd7a259aab4cc20a`, base75df, somente `scripts/boundary-semantic-engine.mjs` e `tests/b6-0236-boundary-integration.test.js`; outras15fontes0236 inalteradas. [Freeze](source-freeze-r2.json). A aprovação humana0236/cf07fd5d continua válida para esse contrato; não falta nova autorização da mesma SPEC. Não existe autorização para BUILD0237.

Os primeiros falsosPASS de URL/whitespace e selfowner, e a verificação interna incorreta de exportsCJS inexato, foram preservados. O reparo acrescenta recusas conservadoras, incluindo controles de mainabsoluto e arquivosirmãosCJS. Resultado focal atual:44CLI+115engine/compiler PASS, zero falhas/skips; lint/formato/diff verdes. [CLI](cli-fixed-r2.json), [engine/compiler](engine-compiled-fixed-r2.json), [firstreds R1](review-r1-first-red.json). Isso não substitui o aceite independente.

R2:20cenários/54chamadas controladas,18atenderam, um P1 com dois testemunhos. `require.resolve('module')` seleciona `module`; `import.meta.resolve('fs')` seleciona `node:fs`. O kernel, com identidade física sintética MATCH, analisa os pacotes homônimos e emite PROVEN/duas provas. A CLI completa mantém INCOMPLETE/exit1 nos dois casos; não se afirma um novo falsoPASS global. Nenhum target foi importado/executado. A conferência verificou764arquivos vinculados de R2,759arquivos de R1 e17fontes intactas.

## Evidências e recursos

A projeção pré-gates revalidou45inputs/351fontes do compilador/304dependências/112saídas e repetiu o consumidor sem produto:207imports/76exports/zeroRede. Geração real1c preservada, sem renomear o evento como compilação7ad6. [Projeção](projection-revalidation-precert.json). Não houve certificação completa, verificador corrente, medição pós-gates ou promoção deste reparo. Os scripts preparados ficaram NOT_RUN. O preflight leu dois paths e78protegidos, sem escrita na fonte/índice compartilhados. [Preflight](promotion-readonly-preflight.json).

PG próprio ff04 foi removido por ID/label com zero outros clientes; portas56237/3396/4396 livres. Crítico encerrado e nenhum processo de revisão ativo; candidata, referências, consumidor e raw evidence retidos. [Limpeza](resource-cleanup-final.json).

## Impedimento e próxima ação

O ciclo encerra FAILED_QUALITY_BAR após duas revisões. A regra local limita duas revisões por mudança; o orçamento não será resetado nem haverá terceira crítica automática. A skill orchestrate (`/home/ricardo/.codex/skills/orchestrate/SKILL.md`) exige parar quando o trabalho excede o orçamento aprovado; o caminho operacional dessa skill pertence ao ambiente, não ao repositório. A autoridade0236 não foi revogada e não deve ser perguntada novamente.

Próximo reparo necessário: recusar identidades nativas não modeladas antes da aquisição de pacote/selfreference, em import e require, usando as regras do runtime confiável pinado; manter a recusa node: e não criar sumários positivos de nativos. Preservar S13/S20 e definir plano delimitado/aceites antes de código. Qualificação independente corrente e gates continuam necessários antes de integração. A preparação0237 permanece documental, sem submissão humana enquanto a v1 estiver reprovada.

## Documentação concorrente

Os34registrosHISO anteriores foram incorporados pelo owner e conferidos byteiguais. Novos vazios do reparo têm catálogo local e delta aditivo próprio; catálogo central continua reservado à frenteC100FND. Links globais observados:zeroquebrados/48absolutos de relatórios da outra frente. Não editar seus artefatos/allowlists para fabricar verde. [Conferência34](prior34-central-reconciliation.json), [observação global](documentation-global-precert.json).

Checagens T1 finais:links/formato/higiene própriosPASS após corrigir formato do rascunho0237; primeira tentativa preservada. [Resultados](documentation-final-checks.json). Os1592+526arquivos selados anteriores foram conferidos byteiguais. [Preservação](prior-sealed-preserved-final.json). Novos119vazios têm catálogo local e [delta central aditivo](empty-artifact-central-delta.json), sem escrita concorrente no central. [Matriz de aceites](acceptance-status.json) mantém o P1 reprovado e gates/promoçãoNOT_RUN.
