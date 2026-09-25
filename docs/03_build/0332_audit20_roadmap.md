# Roadmap — AUD-20260920-REAUDIT

## Leitura

As janelas são classes de esforço, não datas prometidas. `G20-1` foi autorizado
para BUILD interno; W1 está verificada localmente, W2 está em execução e as demais ondas aguardam seus gates
técnicos. Cada onda exige atualização de runtime, log, backlog e evidência.

```text
W0 Verdade e planejamento (concluída)
  -> W1 Autoridade de qualidade
    -> W2 Integridade do runtime
      -> W3 Composição operacional
        -> W4 Qualificação e recuperação
          -> W5 Freeze, crítica e decisão
            -> W6 Externo/piloto (autorização separada)
```

## W0 — Verdade e planejamento

- status: `COMPLETED_DOCUMENTATION_ONLY`;
- entregas: auditoria `0565`, plano `0331`, roadmap `0332`, backlog `0333` e
  reconciliação dos registros mestres;
- decisão: `REJECT` QAUD20, produção `NO_GO`;
- gate de saída: `G20-0` concluído;
- decisão: `G20-1` autorizado para BUILD interno no escopo controlado.

## W1 — Autoridade de qualidade

- esforço indicativo: 3–5 dias úteis;
- tasks: `AUD20-001` a `004`;
- objetivo: tornar o contrato executável e impedir certificação abaixo da
  barra;
- entregas: eval 97% bloqueante, holdout selado, thresholds de coverage,
  mutation guard, inventário de skips e identidade Phase 4A exata;
- estado atual: `AUD20-001`–`AUD20-006` verificados localmente; `AUD20-007` e os
  controles negativos restantes mantêm `G20-2` fechado;
- gate `G20-2`: testes negativos provam que qualquer redução de barra falha;
- bloqueia: todas as ondas seguintes.

## W2 — Integridade do runtime

- esforço indicativo: 1–2 semanas;
- tasks: `AUD20-005` a `010`;
- objetivo: fechar composição PostgreSQL, concorrência, causalidade e egress;
- entregas: grants/preflight do rate limiter, migration 0021 fail-closed,
  causalidade imutável de approvals, fencing de leases, replay após auth e
  conexão SSRF segura;
- gate `G20-3A`: fault injection e concorrência em PostgreSQL descartável,
  zero achado alto nessas fronteiras.
- progresso: `AUD20-005` verificou tabela, constraints, indices, grants DML e
  request ordinaria do rate limiter com role runtime separada; `AUD20-006`
  verificou migration 0021, preflight semantico e concorrencia; proxima task:
  `AUD20-007`.

## W3 — Composição operacional

- esforço indicativo: 1–2 semanas;
- tasks: `AUD20-011` a `013`;
- objetivo: provar o caminho usado por operador e worker, não apenas seams;
- entregas: login/token confiável no bootstrap, worker homologado com
  preflight/readiness/health corretos, telemetria exportável e decomposição
  incremental dos hotspots;
- gate `G20-3B`: E2E sintético API → PostgreSQL → worker → web, sem
  autoridade simulada no perfil qualificado.

## W4 — Qualificação e recuperação

- esforço indicativo: 1 semana;
- tasks: `AUD20-014` e `015`;
- objetivo: validar dados, carga, rollback, browsers e acessibilidade;
- entregas: restore por checksum/linhas/roles/RLS/outbox/journals, rollback de
  migration, carga PostgreSQL repetida, authz/tenant/recovery E2E e decisão de
  suporte Chromium/Firefox/WebKit;
- gate `G20-4A`: catálogo obrigatório completo no Node 22.

## W5 — Freeze, evidência, crítica e decisão

- esforço indicativo: 3–5 dias úteis;
- tasks: `AUD20-016` a `018`;
- objetivo: produzir um único candidato e uma cadeia de evidência integral;
- entregas: CI/imagem/certificação ligadas, manifesto com artefatos brutos,
  freeze, crítica `I1` e sentinel;
- gate `G20-4`: qualificação mecânica completa;
- gate `G20-6`: parecer independente e decisão humana separados;
- regra: nenhuma correção durante a janela crítica.

## W6 — Validação externa e piloto

- status inicial: `BLOCKED_BY_AUTHORITY`;
- tasks: `AUD20-019` e `020`;
- objetivo: IdP, provider, canais, RPO/RTO e piloto limitado;
- gate de entrada `G20-5`: nova autorização humana, owners, credenciais,
  ambiente, plano de dados e rollback;
- limite: W6 nunca é liberada automaticamente pelo sucesso de W1–W5.

## Marcos

| Marco                   | Evidência mínima                                      |
| ----------------------- | ----------------------------------------------------- |
| M20-1 — barra honesta   | negativos de eval/coverage/skips/identidade           |
| M20-2 — runtime íntegro | testes PG de role, corrida, crash e egress            |
| M20-3 — composição real | trusted auth + homolog worker + health/telemetria     |
| M20-4 — recuperação     | carga, restore e rollback com conteúdo                |
| M20-5 — candidato       | Node 22, imagem, manifesto, hashes e zero skip oculto |
| M20-6 — decisão         | crítico I1, sentinel e signoff humano                 |

## Critérios de pausa

Pausar e atualizar os ledgers diante de conflito PRD/SPEC, ampliação para
dados/serviços reais, migration irreversível sem recovery, candidato alterado
depois do freeze, ambiente obrigatório indisponível ou necessidade de nova
autoridade. O backlog executável está em
[`0333_audit20_backlog.md`](0333_audit20_backlog.md).
