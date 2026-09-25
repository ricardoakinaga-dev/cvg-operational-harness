# REM21-009 — Threat-model addendum para qualificação externa

Status: `OFFLINE_PREPARATION_ONLY`  
Escopo: `G21-1`, fixtures sintéticas e referências abstratas  
Execução externa: `BLOCKED_BY_G21-5`  
Dados: `synthetic / local-disposable / realDataAllowed=false`

Este addendum complementa o threat model da Phase 10. Ele não transforma
controles locais em prova de disponibilidade, segurança ou rollback de um
serviço externo. Os slots de autoridade são referências de decisão, não nomes
ou aprovações.

## Trust boundaries

1. operador confiável e resolver de identidade local;
2. gateway de canal e envelope canônico;
3. provider/model gateway controlado;
4. catálogo de fonte institucional aprovado;
5. guard de egress e transporte bound;
6. handoff/approval sem dispatch automático;
7. ambiente externo hipotético, ainda não autorizado.

Somente os seis primeiros limites são exercitados por fixtures locais. O
sétimo permanece uma fronteira não qualificada.

## Ameaças, controles e evidência exigida

| ID | Ameaça | Controle esperado | Prova offline | Evidência externa ainda exigida |
| --- | --- | --- | --- | --- |
| T-01 | issuer, audience ou claim de tenant incorreto | validação explícita e `DENY` | mutation de tenant/audience | contrato de claims, revogação e owner de identidade |
| T-02 | segredo materializado em documento, log ou fixture | somente `pending://secret/...`, redaction antes da fronteira | rejeição de referência fora do padrão | secret manager, rotação e revogação aprovados |
| T-03 | provider/canal fora da allowlist ou SSRF | allowlist, DNS/certificado e transporte bound | caso `endpoint-not-allowlisted` em `ABORT` | inventário de destino e política de egress assinados |
| T-04 | replay, duplicação ou retry sem limite | correlation, idempotency e limite de retry | caso de replay sem dispatch | comportamento do serviço, rate limit e reconciliação |
| T-05 | mistura de tenant ou vazamento de campo sensível | tenant boundary, minimização e redaction | `DENY`/`HANDOFF_ABORT` | DPIA, residência, retenção e recipient aprovados |
| T-06 | fonte institucional ausente, revogada ou stale | resposta sem RAG e handoff | caso `source-missing-or-revoked` | catálogo aprovado, freshness/TTL e owner institucional |
| T-07 | ação clínica, financeira ou de agenda induzida pelo output | approval/handoff e ausência de dispatch | saída sensível abortada | autoridade de negócio e revisão humana por ação |
| T-08 | rollback impossível ou efeito externo incerto | kill switch, abort e reconciliação | `rollback.proofStatus=PENDING` bloqueia | plano de retorno, janela, operador e RPO/RTO aprovados |
| T-09 | evidência alterada entre revisão e execução | hashes, candidate/run binding e expiry | hash/estado divergente interrompe | cadeia de custódia e aceite humano |
| T-10 | supply chain ou adapter inesperado | versão, capability e fonte de build registradas | adapter fake deterministic-only | SBOM, provenance e owner de release |

## Regras RED

- autoridade ausente, owner ausente ou evidência expirada: `BLOCKED`;
- endpoint ou segredo materializado: `REJECTED`;
- egress fora da allowlist, tenant mismatch, replay ou idempotency mismatch:
  `ABORT`/`DENY`, sempre sem dispatch;
- fonte institucional não aprovada: `HANDOFF`, nunca resposta RAG;
- output sensível: `HANDOFF + ABORT`, nunca confirmação, cancelamento,
  reagendamento ou ação clínica/financeira/prontuário;
- qualquer divergência de hash, versão ou escopo invalida a transição.

## Limitações residuais

Os fixtures não medem disponibilidade, latência, custo, residência, retenção,
RPO/RTO, suporte, rate limit real, revogação real ou comportamento de um
provider/canal/IdP. Também não autorizam segredo, tráfego, piloto ou produção.
Essas lacunas são entradas do pacote de decisão e permanecem `PENDING` até
G21-5 e autoridade explícita.

