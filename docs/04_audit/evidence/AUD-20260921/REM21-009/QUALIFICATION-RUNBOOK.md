# REM21-009 — Runbook de qualificação

Status atual: `OFFLINE_PREPARATION_COMPLETE_PENDING_VALIDATION`  
Gate atual: `BLOCKED_BY_G21-5_FOR_EXTERNAL_EXECUTION`  
Runbook não autoriza rede, credencial, dado real, piloto, cutover ou dispatch.

## Pré-condições obrigatórias

Antes de qualquer qualificação externa futura, a autoridade deve preencher e
aceitar a matriz de `authority-matrix.json` para identidade, provider, canal,
fonte institucional, egress, privacidade e rollback. A decisão precisa ter
escopo, validade, evidência hashada, operador e mecanismo de revogação.

Também são obrigatórios, fora deste BUILD offline:

- ambiente nomeado e isolado, com janela e owner;
- inventário de endpoint e capability, sem segredo em texto;
- política de dados, minimização, retenção, residência e recipients;
- referência a secret manager com rotação/revogação testadas;
- allowlist de egress, DNS, certificados e observabilidade;
- plano de abort, kill switch, reconciliação de efeitos incertos e rollback;
- critérios de sucesso/fracasso e handoff humano;
- aprovação separada para qualquer ação sensível.

Sem todos os itens, o resultado é `BLOCKED`, não uma tentativa parcial.

## Fase 0 — validação offline (permitida agora)

1. Ler o schema, fixture base e matriz sem rede.
2. Parsear JSON e validar campos desconhecidos, referências `pending://`,
   `synthetic=true` e `externalExecution=false`.
3. Executar as mutações negativas: owner ausente, endpoint/secret
   materializado, tenant mismatch, replay, fonte revogada, output sensível,
   retry sem limite e rollback não demonstrado.
4. Confirmar que cada caso retorna a decisão prevista e que nenhum caso cria
   efeito, chamada, receipt ou dispatch.
5. Hashar os artefatos e registrar runtime, comando, timestamp, exit code e
   escopo neste diretório.

## Fase 1 — revisão de autoridade (futura, bloqueada)

1. Abrir uma revisão explícita do `DECISION-PACKET.md`.
2. Preencher somente slots verificáveis; não inferir owner, fornecedor,
   endpoint, budget, SLA ou aprovação a partir de defaults.
3. Recalcular hashes e verificar expiry, revogação e correspondência de
   candidate/run.
4. Se qualquer slot continuar `PENDING`, encerrar com `BLOCKED`.

## Fase 2 — qualificação controlada (futura, somente após G21-5)

1. Confirmar que o ambiente é homologação isolada e que os dados continuam
   sintéticos ou aprovados para o caso específico.
2. Verificar identidade, tenant/audience, correlation e idempotency.
3. Verificar provider e canal com payload mínimo redigido, sem ação sensível.
4. Verificar fonte institucional; ausência, revogação ou stale deve produzir
   handoff, não resposta.
5. Verificar egress por allowlist e falhas de DNS/certificado/redirect.
6. Exercitar timeout, retry limitado, replay, duplicação, backpressure e
   abort. Não repetir fora da janela aprovada.
7. Confirmar observabilidade, redaction, receipts e reconciliação sem
   mensagens ou efeitos reais.
8. Parar e produzir evidência antes de qualquer mudança de estado.

## Stop conditions e resultados

| Condição | Resultado obrigatório |
| --- | --- |
| autoridade/owner/evidência ausente | `BLOCKED` |
| segredo ou endpoint materializado | `REJECTED` |
| boundary de tenant/audience falha | `DENY` |
| egress fora da allowlist ou retry ilimitado | `ABORT` |
| fonte ausente/revogada/stale | `HANDOFF` |
| output clínico, financeiro, agenda ou prontuário | `HANDOFF + ABORT` |
| efeito externo sem receipt/reconciliação | `ABORT` |
| rollback não demonstrado | `BLOCKED` |
| todos os testes aprovados | `QUALIFIED_FOR_SCOPED_REVIEW`, nunca production GO |

## Evidência mínima

Cada rodada deve guardar o pacote imutável, hashes, versão do runtime, janela,
autoridade, comandos, resultados por caso, logs redigidos, abort/rollback,
incidentes, limitações e decisão humana. O relatório deve separar claramente
`local-synthetic`, `external-homolog` e `production`.

