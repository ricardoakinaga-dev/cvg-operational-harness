# Plano executivo de remediação — auditoria de 19/09/2026

## Identidade e limite

- programa: `AUD-20260919-REMEDIATION`;
- origem: auditoria
  [`0564_full_construction_audit_2026-09-19.md`](../04_audit/0564_full_construction_audit_2026-09-19.md);
- estágio atual: `EVOLUTION / PLAN`;
- perfil: brownfield;
- risco: alto; blast radius potencial: sistema;
- status global após esta entrega: `WAITING_HUMAN_APPROVAL`;
- autorização concedida: **somente planejamento documental**;
- autorização não concedida: código, migrations, dependências, integração
  real, deploy, dados reais, efeitos sensíveis ou produção.

Este é um plano vivo de recuperação do candidato atual. Ele não substitui
Discovery, PRD ou SPEC existentes e não reabre decisões de produto
silenciosamente. Cada item deve ser roteado à etapa mais antiga necessária:
conflito de resultado/autoridade volta a PRD; contrato ou invariantes voltam a
SPEC; implementação aderente segue a BUILD; comprovação segue a AUDIT.

## Objetivo executivo

Transformar a base controlada atual em um candidato único, reproduzível e
auditável, removendo primeiro falsos positivos de gate e riscos de integridade,
depois fechando composição operacional e, por fim, executando qualificação
completa. O objetivo desta rodada não é liberar produção; é criar condições
objetivas para uma futura decisão humana de release.

## Resultados esperados

1. Uma cadeia de evidência que identifica exatamente o código testado.
2. Zero skip em todo gate marcado como obrigatório.
3. Aprovação, execução, auditoria e outbox com invariantes testáveis sob falha.
4. Isolamento tenant e proteção contra replay/SSRF válidos em múltiplas réplicas.
5. Worker, telemetria e recuperação compostos em ambiente de homologação.
6. Frontend conectado a identidade confiável, com falhas e acessibilidade
   qualificadas.
7. Candidato final executado no runtime alvo e submetido a crítica
   independente selada.

## Princípios de execução

- Preservar evidência histórica; corrigir por supersessão, nunca por reescrita.
- Congelar identidade do candidato antes dos testes finais.
- Tratar `SKIP`, `NOT_RUN`, timeout ou ausência de relatório como não aprovação.
- Separar reparo mecânico de mudança semântica.
- Falhar fechado em auth, tenant, policy, approval, audit e efeitos.
- Não usar dados reais. Todos os cenários permanecem sintéticos e descartáveis.
- Não habilitar confirmação, cancelamento ou reagendamento real de consulta,
  nem ação clínica, financeira ou de prontuário.
- Toda ação sensível exige approval ou handoff humano.
- Respostas RAG continuam proibidas sem fonte institucional aprovada.

## Frentes de trabalho

| Frente                      | Propósito                                                      | Itens                     | Saída executiva                                |
| --------------------------- | -------------------------------------------------------------- | ------------------------- | ---------------------------------------------- |
| A — Verdade do candidato    | Fechar format, skips, digests, estado e rastreabilidade.       | `AUD19-001`, `002`, `012` | Baseline verificável e sem contradição.        |
| B — Integridade e segurança | Fechar transações, idempotência, RLS, replay e egress.         | `AUD19-003` a `007`       | Invariantes provadas em falha/concor­rência.   |
| C — Composição operacional  | Entregar worker, telemetria, cliente confiável e modularidade. | `AUD19-008` a `011`       | Homologação sintética operável.                |
| D — Qualificação            | Executar UX, runtime alvo, supply chain, carga e recuperação.  | `AUD19-013` a `015`       | Dossiê completo de um candidato congelado.     |
| E — Decisão                 | Auditar com independência e produzir parecer humano.           | `AUD19-016`               | `GO`, `CONDITIONAL_GO` ou `NO_GO` justificado. |

## Gates de decisão

### G0 — Planejamento aceito

Exige aprovação humana deste pacote e registro da primeira task executável.
Até lá, todos os itens permanecem propostos.

### G1 — Baseline confiável

Exige `AUD19-001`, `002` e `012`: format verde; Phase 4A sem skip obrigatório;
digests reconciliados; estado, README, índices e links atuais. Nenhuma mudança
de produto relevante deve estar misturada ao reparo.

### G2 — SPEC de integridade aprovada

Antes de código em `AUD19-003` a `007`, exige SPEC revisada para unidade
transacional, payload-bound idempotency, cobertura RLS, replay distribuído e
política de egress/DNS. Requer revisão humana por envolver segurança e dados.

### G3 — BUILD controlado concluído

Exige implementação pequena por task, testes negativos/fault injection,
PostgreSQL descartável e revisão do diff. Não autoriza serviço externo.

### G4 — Homologação sintética qualificada

Exige worker e observabilidade compostos, web com identidade confiável de
homologação, Node 22, E2E, imagem, security/SBOM, carga e restore no mesmo
candidato. Produção ainda permanece `NO_GO`.

### G5 — Auditoria e decisão humana

Exige crítico independente fresco, pacote selado e sentinel pós-crítica. A
decisão técnica não substitui aprovação humana, privacidade, segurança,
operação ou negócio.

## Indicadores de controle

| Indicador                                       | Baseline                    | Alvo de saída                            |
| ----------------------------------------------- | --------------------------- | ---------------------------------------- |
| Gate agregado                                   | Vermelho no format          | Verde no candidato congelado             |
| Skips obrigatórios                              | Phase 4A PostgreSQL skipped | Zero                                     |
| Drift de certificação                           | Presente                    | Zero                                     |
| Digests Phase 4A                                | Divergentes                 | Uma autoridade canônica                  |
| Findings P0 abertos                             | 7                           | Zero antes de G4                         |
| Cobertura de tabelas tenant-scoped no preflight | Parcial                     | 100% do inventário canônico              |
| Idempotência de outbox                          | Chave apenas                | Chave + tipo/versão/hash                 |
| Replay de identidade                            | Processo local              | Autoridade distribuída/contrato aprovado |
| Runtime alvo                                    | Node 24 observado           | Node 22 executado                        |
| Qualificação operacional atual                  | Parcial/NOT_RUN             | Todos os gates exigidos executados       |

## Riscos e respostas

| Risco                                           | Resposta obrigatória                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| “Arrumar” hashes para fazer o gate passar       | Regerar somente depois de congelar e executar o candidato; preservar artefatos antigos. |
| Misturar refatoração ampla com correção crítica | Uma task/hipótese por diff, contrato e evidência.                                       |
| Transação distribuída impossível                | Formalizar autoridade, outbox/journal e estados incertos na SPEC antes de BUILD.        |
| Teste PostgreSQL dependente de ambiente         | Fixture descartável, preflight explícito e falha quando obrigatório.                    |
| SSRF por DNS rebinding/redirect                 | Resolução e validação por hop, IP e protocolo; testes com servidor controlado.          |
| Falso GO por evidência antiga                   | Manifesto com hashes de fonte/config/lockfile e freshness verificável.                  |
| Crescimento do escopo para produção real        | Gate humano separado; nenhuma credencial ou dado real neste programa.                   |

## Modelo operacional

Cada task deve declarar: o que, onde, como, dependências, owner por papel,
locks, critérios de pronto, comandos e destino de evidência. Builders podem
marcar apenas implementação; a verificação e o fechamento pertencem ao
integrador/auditor. Em caso de duas tentativas corretivas sem fechar a mesma
hipótese, parar e replanejar em vez de reduzir a barra.

Ordem de atualização ao fim de cada task:

1. artefato e evidência da task;
2. backlog do programa;
3. execution log;
4. runtime state por último.

## Rollback e recuperação

- Mudanças de gate/documentação: reverter apenas o artefato novo, preservando o
  registro da tentativa.
- Migrations: forward-fix preferencial, backup/restore ensaiado e procedimento
  específico por versão; nenhuma reversão destrutiva automática.
- Auth/replay/egress: feature flag fail-closed e retorno ao modo controlado.
- Worker/telemetria: desativação por composição/configuração sem perder journal
  ou fila.
- Frontend: rollback independente, sem relaxar autenticação da API.
- Qualquer perda de rastreabilidade ou identidade do candidato bloqueia a
  rodada e força novo freeze.

## Próxima decisão

Após aprovação humana do plano, registrar e executar `AUD19-001`. Nenhuma task
de implementação posterior deve começar apenas porque aparece no roadmap ou no
backlog. O detalhamento operacional está em
[`0330_audit_20260919_backlog.md`](0330_audit_20260919_backlog.md).
