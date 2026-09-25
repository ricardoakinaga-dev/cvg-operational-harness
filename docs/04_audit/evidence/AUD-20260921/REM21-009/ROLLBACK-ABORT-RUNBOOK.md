# REM21-009 — Runbook de rollback e abort

Estado: `LOCAL_RUNBOOK_ONLY`  
Autoridade de rollback: `PENDING`  
Efeitos externos: não executados e não autorizados.

## Gatilhos

Abortar imediatamente diante de qualquer uma destas condições:

- authority, owner, expiry ou evidência inválida;
- endpoint fora da allowlist, DNS/certificado inesperado ou redirect não
  permitido;
- segredo exposto, referência materializada, rotação/revogação incerta;
- tenant, audience, correlation ou idempotency mismatch;
- replay, duplicação, timeout sem limite, backpressure ou receipt ausente;
- fonte institucional ausente, revogada ou stale;
- output clínico, financeiro, de agenda ou prontuário sem approval/handoff;
- divergência de versão, hash, imagem, adapter ou política de dados;
- qualquer comportamento não previsto pelo contrato.

## Ordem de abortar

1. Marcar o run como `ABORTED` e impedir novos retries/dispatch.
2. Acionar o kill switch local do adapter/fixture; não tentar contornar o
   bloqueio com outro endpoint ou credencial.
3. Isolar o contexto lógico (tenant, correlation e idempotency) e preservar
   somente evidência redigida.
4. Capturar estado, hashes, hora, causa, último efeito conhecido e incertezas.
5. Encaminhar a decisão ao slot de autoridade e abrir handoff humano.
6. Reconciliar efeitos incertos antes de qualquer repetição; ausência de
   receipt é estado desconhecido, não sucesso.
7. Somente após aprovação separada, executar rollback no ambiente autorizado.

## Rollback local permitido

No slice atual, rollback significa descartar a fixture, restaurar o diretório
de evidência a partir de uma cópia hashada e retornar o estado documental para
`PENDING`. Isso não altera serviços externos nem certifica rollback produtivo.

O rollback futuro deverá indicar explicitamente versão anterior, autoridade,
janela, comando reversível, teste de restauração, efeito sobre outbox/journal,
reconciliação de mensagens e critério de encerramento. Sem essa prova, o gate
é `BLOCKED`.

## Incidente de credencial ou dado

Se uma credencial ou dado não sintético aparecer: interromper o processo,
evitar copiar ou exibir o valor, registrar apenas um identificador redigido,
isolar/remover o artefato conforme a política aprovada, notificar o slot de
privacidade e solicitar revogação ao responsável autorizado. Não usar a
credencial para “confirmar” o incidente e não apagar evidência de auditoria
sem preservar seu hash e cadeia de custódia.

## Critério de encerramento

O incidente só pode ser encerrado com causa, escopo, efeitos conhecidos,
reconciliação, autoridade, evidência e decisão explícita. `ABORTED`,
`BLOCKED` e `HANDOFF` não são convertidos em `PASS` por ausência de erro
observado.

