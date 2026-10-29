# F05 /0276 — fio cooperativo e admissão de cancelamento

Implementação local da fatia explicitamente aprovada no recibo6: encaminhar a mesma referência de signal ao runner injetado e ao default, recusar pre-abort antes de executar, e não anunciar sucesso quando a conclusão vem depois do cancelamento.

- 2REDoriginais viraramGREEN; suíte ampliada inicial6FAIL/2PASSantesdafix. Depois:10controlesnovos+30regressões=40PASS/0skip/expectedfail. Inclui seamdefaultobservada por double de módulo, pre-abort de backend com marcador de lançamento próprio (backendfalso controlado, não prova de contenção), chamada legadasemsignal e conclusão tardia semretry.
- 7mutaçõesmortas: perder sinal no runner injetado/default, ignorar abortos, alterar causaestável, clonarSignal, ignorarpre-abort dobackend e permitir sucesso tardio real (este último produz2FAIL SUCCEEDEDversusFAILED). Fonteexatarestaurada.
- Node22: typecheck0/36.086s,lintfocal0/20.701s,testesfinais0/18.247s,format0. Nenhuma suíteglobal/PG/Docker/CI.

**Limite obrigatório:** runContained verifica pre-abort, mas não ganhou supervisor de aborto emvoo. O timeout existente continua o backstop. A0276 admite expressamente encaminhamento/pre-abort quando não há supervisãoX01qualificada. Resultado depois deabort é FAILED com effect_uncertain/cleanup_incomplete, nunca cancellednativo nem quiescênciacomprovada. Aunioncancelled/cleanup_incomplete no backend, árvore nativa, SIGSTOP/crash/PIDreuse, fechamento de waits globais e47oráculos K08 permanecem dependências, não resultados entregues por esta fatia.

Revisão independenteClaude eaceite do recorte pendentes comDF; F05global permaneceOPEN. Código afetado: shell-tool.ts/run.ts e três testes próprios; sem alteração de contratoscentrais ou de fontes de pares. Próximo:F02profile/mount/env no mesmo runner, commit separado e com controles de consumidor requalificados.
