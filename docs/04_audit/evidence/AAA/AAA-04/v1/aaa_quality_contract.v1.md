# aaa_quality_contract — Barra de qualidade congelada, vínculo de certificação e protocolo comparativo

- Task: `AAA-04`. Programa: `AAA-20260912`. Fonte canônica de status: `docs/03_build/tracking/aaa_program_backlog.json` (entrada `AAA-04`) e ledger vivo `docs/03_build/tracking/aaa_execution_ledger.json`.
- Versão da barra: `v1` — congelada por autoria em `2026-09-12T20:42:11Z`; qualquer alteração de texto, critério, tolerância, comando ou protocolo incrementa a versão e invalida evidências, selos e revisões anteriores (ver §11).
- Status do contrato: `FROZEN_PENDING_INDEPENDENT_REVIEW`. Esta autoria **não** é aprovação; o revisor fresco (§12) e o registro humano/coordenação permanecem obrigatórios. Nenhum BUILD é autorizado por este documento.
- Autoridade: a solicitação atual autoriza correções locais controladas e preparação de artefatos, com dados sintéticos e recursos descartáveis. Não aprova D01/RF-011, ação real, integração externa, egress, homologação, custo real, deploy ou produção.
- Dependência: `AAA-01` (candidato pinado e 15 findings revalidados; revisão independente `APPROVE` registrada em `docs/04_audit/evidence/AAA/AAA-01/review-agent-3/`).
- Anexos normativos (mesma versão `v1`; hash no manifesto):
  - `docs/04_audit/evidence/AAA/AAA-04/quality-bar.json` — 80 critérios testáveis das 20 áreas com os nove campos exigidos (27 `BLOCKING`).
  - `docs/04_audit/evidence/AAA/AAA-04/comparator-protocol.json` — protocolo comparativo congelado antes do holdout.
  - `docs/04_audit/evidence/AAA/AAA-04/dataset-freeze.sha256` — hashes de datasets, runners e artefatos de avaliação.
  - `docs/04_audit/evidence/AAA/AAA-04/manifest.json` — manifesto de evidência, revisão solicitada e limitações.

## 1. Invariantes da barra

| ID  | Invariante                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I1  | Nenhuma nota, média ou rótulo substitui gate de segurança, integridade ou operação. Gate obrigatório `FAIL`/`NOT_RUN`/`SKIPPED`/`UNKNOWN`/`BLOCKED` impede o selo correspondente.                            |
| I2  | Toda evidência vincula-se a um `candidateId` (§4). Evidência antiga é histórica, nunca atual.                                                                                                                |
| I3  | Nenhum limiar, exclusão, skip ou amostra pode ser alterado para produzir PASS. Duas tentativas da mesma hipótese sem progresso exigem revisão de causa/contrato antes de repetir.                            |
| I4  | Resultado do builder é alegação; a qualificação exige revisão independente do candidato congelado, e produção exige autorização humana registrada.                                                           |
| I5  | “Qualidade controlada demonstrada”, “candidato AAA”, “qualificação externa/operacional” e “State of Art no escopo comparado” são estados distintos; nenhum decorre do anterior sem seus próprios critérios.  |
| I6  | O protocolo comparativo (§7) e a partição de dados estão congelados antes de qualquer observação de holdout; escolher métricas, alternativas ou subconjuntos depois de ver resultados invalida a comparação. |

## 2. Modelo da barra (rubrica A01–A20)

Cada área `A01–A20` recebe cinco subnotas `0–20`:

1. comportamento correto no fluxo integrado;
2. falhas, ataques e casos negativos;
3. integração pública e persistente (HTTP/worker/PostgreSQL/efeito falso);
4. observabilidade, recuperação e operação apropriadas ao item;
5. rastreabilidade, manutenção e evidência vinculada ao candidato.

- Total da área = soma das cinco subnotas (0–100). **Meta: ≥97/100 em cada área**, sem compensação entre áreas.
- Âncoras: `0` ausente; `5` declaração/plano; `10` implementação parcial com teste isolado; `15` comportamento integrado testado com lacunas; `18` evidência atual positiva/negativa e revisão independente; `20` critérios completos, reprodução independente e adequação operacional ao escopo.
- Notas intermediárias exigem justificativa do crítico; nota `≥97` exige todos os critérios `BLOCKING` e `HIGH` da área com evidência atual, revisão independente e nenhuma limitação aberta que afete o critério.
- Critério não aplicável exige justificativa congelada; ausência de banco, operador ou integração **não** torna um critério não aplicável.

Rótulos de resultado permitidos:

| Rótulo                            | Condição mínima                                                                                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QUALITY_CONTROLLED_DEMONSTRATED` | Critérios controlados com falsos/sintéticos passam; skips obrigatórios = 0; evidência atual e revisão independente; sem alegação externa.                              |
| `AAA_CANDIDATE`                   | Barra técnica ≥97 em cada área no escopo qualificado, revisões independentes concluídas e pendências externas declaradas.                                              |
| `EXTERNAL_OPERATIONAL_QUALIFIED`  | `AAA_CANDIDATE` + D03/D04 aprovadas + medições no ambiente relevante + homologação autorizada + signoff humano.                                                        |
| `STATE_OF_ART_SCOPED`             | `AAA_CANDIDATE` + comparação pré-registrada (§7) reproduzível com holdout intocado e vantagem/trade-offs declarados; nunca “Triplo AAA” por média ou volume de testes. |

## 3. Critérios por área (resumo; detalhe normativo no `quality-bar.json`)

Criticidade `B` = `BLOCKING` (obrigatório e impeditivo), `H` = `HIGH` (obrigatório para a área), `M` = `MEDIUM` (exigido para nota 20). Todos os critérios possuem, no anexo, `invariant`, `boundary`, `testMethod`, `sample`, `environment`, `limitations`, `evidence`, `rejectedCase`, `closure`, `revalidation`.

| Área                 | Critérios (ID — invariante resumido)                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 Arquitetura      | `Q-A01-01 B` entrypoint compõe identidade→policy→approval→runtime→persistência→canal falso sem bypass; `Q-A01-02 B` runtime canônico decidido e único; `Q-A01-03 H` pacotes novos compostos ou exclusão justificada; `Q-A01-04 H` fronteiras de módulo sem import profundo.                                                                                                                             |
| A02 Manutenibilidade | `Q-A02-01 H` hotspots divididos por responsabilidade com paridade HTTP/UX; `Q-A02-02 H` módulos extraídos com contrato e testes próprios; `Q-A02-03 M` orçamento de tamanho/complexidade documentado; `Q-A02-04 M` sem código morto/comentado.                                                                                                                                                          |
| A03 Tipagem          | `Q-A03-01 B` typecheck zero com strict preservado; `Q-A03-02 H` input de rede/modelo/outbox validado em runtime; `Q-A03-03 H` sem cast novo em fronteira de confiança; `Q-A03-04 M` tipos públicos exportados/coerentes.                                                                                                                                                                                |
| A04 HTTP             | `Q-A04-01 B` rotas críticas com matriz válido/inválido/auth/tenant/conflito/limite/replay/abuso e erros redigidos; `Q-A04-02 H` limites de corpo/parâmetro; `Q-A04-03 H` envelope de erro estável com correlação; `Q-A04-04 M` CORS/proxy testado.                                                                                                                                                      |
| A05 Identidade       | `Q-A05-01 B` resolver confiável no entrypoint e falha ao iniciar em produção sem ele; `Q-A05-02 B` token inválido/revogado/expirado/replay negado; `Q-A05-03 H` role/tenant adulterados negados; `Q-A05-04 H` rotação e console sem autoridade simulada no perfil qualificado.                                                                                                                          |
| A06 Tenant           | `Q-A06-01 B` PostgreSQL com FORCE RLS e papéis distintos sem skips obrigatórios; `Q-A06-02 B` duas conexões/processos sem vazamento e contexto limpo após erro; `Q-A06-03 H` papel de migração não usado em runtime; `Q-A06-04 H` tenant apenas de contexto confiável.                                                                                                                                  |
| A07 Approval         | `Q-A07-01 B` payload executado = proposta aprovada (F01); `Q-A07-02 B` nenhum `EXECUTED` sem efeito confirmado (F02); `Q-A07-03 B` matriz de crash com efeito ≤1 e reconciliação explícita (F03); `Q-A07-04 H` incerteza sem retry cego.                                                                                                                                                                |
| A08 Policy           | `Q-A08-01 B` matriz perfil×role×capability×tipo de recurso com draft separado de real (F15); `Q-A08-02 B` confirmação/remarcação reais negadas no escopo; `Q-A08-03 H` fail-closed para desconhecido/erro; `Q-A08-04 H` mudança de policy/policyVersion invalida aprovação.                                                                                                                             |
| A09 Runtime          | `Q-A09-01 B` orçamento impede início de etapa excedente (F05); `Q-A09-02 H` deadline/cancelamento descartam resposta tardia e fecham spans; `Q-A09-03 H` custo controlado; `Q-A09-04 M` relógio injetável.                                                                                                                                                                                              |
| A10 Assíncrono       | `Q-A10-01 B` intenção durável antes do efeito e recuperação honesta após crash (F03); `Q-A10-02 B` duas instâncias/restart sem duplicar; consumidor contínuo e DLQ exercitados; `Q-A10-03 H` envio concorrente único e conflito de chave detectado (F04); `Q-A10-04 H` outbox com lease/retry/dead-letter medidos.                                                                                      |
| A11 Persistência     | `Q-A11-01 B` jornadas com paridade HTTP em PostgreSQL, TTL/tenant/auditoria, sem confirmação real; `Q-A11-02 H` migrações aditivas, checksumadas e testadas com dados anteriores; `Q-A11-03 H` restore íntegro com papéis/outbox; RPO/RTO somente medidos quando autorizados; `Q-A11-04 M` credenciais fora de logs.                                                                                    |
| A12 RAG              | `Q-A12-01 B` resposta factual somente com fonte institucional aprovada/versionada; ausência → handoff; `Q-A12-02 H` fonte revogada/conflitante → handoff; conteúdo recuperado não amplia autoridade; `Q-A12-03 H` citação/versão registradas e reproduzíveis; `Q-A12-04 M` corpus sintético marcado.                                                                                                    |
| A13 Integrações      | `Q-A13-01 B` sucesso/429/5xx/timeout/payload inválido/replay no percurso integrado; SSRF/egress/orçamento testados; `Q-A13-02 H` homologação externa separada e autorizada; `Q-A13-03 H` segredos fora de imagem/log; `Q-A13-04 M` timeouts coerentes ponta a ponta.                                                                                                                                    |
| A14 Observabilidade  | `Q-A14-01 B` correlação completa webhook→worker→efeito e logs redigidos; `Q-A14-02 B` `/ready` com probe real e 503 sob indisponibilidade; `/live` independente (F06); `Q-A14-03 H` ledger durável + alerta/runbook comprovados; `Q-A14-04 M` retenção testada.                                                                                                                                         |
| A15 Testes           | `Q-A15-01 B` gates obrigatórios 100% executados, zero skips obrigatórios, denominador auditado e mutação dos guards detectada (F14); `Q-A15-02 H` reproduções F01–F05/F15 convertidas em regressões; `Q-A15-03 H` inventário executado/ignorado publicado; `Q-A15-04 M` flakes tratados com causa, não retry silencioso.                                                                                |
| A16 Evals            | `Q-A16-01 B` harness chama runtime integrado e holdout independente por categoria (F14); `Q-A16-02 H` zero ação proibida, sucesso ≥97% no conjunto proposto, tempo/custo reais com incerteza; `Q-A16-03 H` adversariais não derivados apenas das regras; `Q-A16-04 M` dataset/versão/hash registrados.                                                                                                  |
| A17 Frontend         | `Q-A17-01 H` fluxos completos em teclado e 375/768/1440 sem bloqueador de acessibilidade; `Q-A17-02 H` nenhuma ação sensível sem approval/handoff; `Q-A17-03 M` avaliação com operador autorizado em cenário sintético; `Q-A17-04 M` E2E de viewports.                                                                                                                                                  |
| A18 Supply chain     | `Q-A18-01 B` Node alvo reproduzível; lockfile/CI/imagem verdes; zero high/critical; moderadas resolvidas ou exceção humana explícita com prazo; `Q-A18-02 H` `npm ci` determinístico em ambiente isolado no Node alvo; inventário = artefato; `Q-A18-03 H` imagem não-root, health/startup, sem segredo, runtime sem tooling de dev; `Q-A18-04 H` licenças desconhecidas classificadas individualmente. |
| A19 Evidência        | `Q-A19-01 B` cadeia RF→SPEC→task→teste→artefato vinculada ao `candidateId`; alteração de fonte/config/lockfile invalida (F11); `Q-A19-02 B` histórico, atual e autorização humana nunca se confundem; `Q-A19-03 H` evidência bruta sanitizada + manifesto com timestamp/hashes; não rastreados relevantes incluídos; `Q-A19-04 H` testes negativos de adulteração (§5.3) rejeitam qualificação.         |
| A20 Operação         | `Q-A20-01 B` metas aprovadas medidas no ambiente relevante com identidade/TLS/fontes/canais autorizados e signoff; `Q-A20-02 H` RPO/RTO medidos e aprovados (propostas Phase 10 não contam); `Q-A20-03 H` alarmes/rollback/restore exercitados com runbook; `Q-A20-04 M` capacidade/rampa conforme D03.                                                                                                 |

### 3.1 Rastreabilidade de achados da auditoria

| Achado                                                                                     | Critérios da barra                                                                 | Seção deste contrato |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------- |
| `AUD-20260912-F11` (certificação x candidato)                                              | `Q-A19-01`, `Q-A19-02`, `Q-A19-03`, `Q-A19-04`                                     | §4, §5               |
| `AUD-20260912-F12` (dependências moderadas, licenças desconhecidas, dev tooling na imagem) | `Q-A18-01`, `Q-A18-02`, `Q-A18-03`, `Q-A18-04`                                     | §6                   |
| `AUD-20260912-F14` (evidência de testes/IA/operação insuficiente)                          | `Q-A15-01`, `Q-A15-02`, `Q-A15-03`, `Q-A16-01`, `Q-A16-02`, `Q-A16-03`, `Q-A06-01` | §7, §9               |

## 4. Identidade do candidato e modelo de evidência

Um **candidato** é o conjunto determinístico de bytes qualificado, não um commit.

- **Escopo do manifesto**: arquivos rastreados + arquivos não rastreados relevantes ao produto/configuração/contratos — incluindo `deploy/`, `apps/`, `packages/`, `scripts/`, `tests/`, `docs/02_spec/` e `docs/03_build/tracking/` vigentes; `.github/workflows/`; `package.json`, `package-lock.json`, `Dockerfile`, configurações (`tsconfig*`, `vitest.config.mts`, `vite.config.mts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`).
- **Exclusões explícitas**: `.git/`, `node_modules/`, `coverage/`, `test-results/`, `playwright-report/`, `certification/logs/`, `docs/04_audit/evidence/**` (a própria evidência não se autoqualifica), artefatos temporários fora do repositório. Exclusão nova exige justificativa congelada.
- **Registro por arquivo**: `{path, sha256, size, tracked: boolean}`.
- `candidateId = sha256(JSON canônico de {schemaVersion:'aaa-candidate-v1', files:[...ordenado por path]})`.
- Todo log/gate/evidência registra `candidateId` **no início da execução** e o reexecuta apenas se o candidato não mudou; mudança de qualquer byte do escopo invalida imediatamente a qualificação (`CANDIDATE_DRIFT`).
- Linha do tempo de cada evidência: `observedAt` (UTC), `environment {os, node, npm, ci/docker}` e `scope` (controlado/sintético/externo).
- Evidência bruta sanitizada: logs são mantidos, mas segredos, payloads reais e PII são redigidos antes da gravação; a redação nunca altera exit code, contagem de testes ou hashes de fonte.

## 5. Certificação (AAA-13) — vínculo ao candidato

O certificado passa a ter três modos separados:

1. **`HISTORICAL_COHERENCE`** — verifica que os artefatos registrados conferem com os hashes gravados no momento da observação. Não qualifica o candidato atual; pode ser reproduzido indefinidamente e nunca é reescrito.
2. **`CURRENT_CANDIDATE`** — verifica que o `candidateId` gravado no início dos testes é idêntico ao candidato no momento da verificação e que todos os gates obrigatórios passaram para esse candidato. Assetor de qualificação; expira na primeira alteração de byte.
3. **`HUMAN_RELEASE_AUTHORIZATION`** — decisão humana registrada sobre o candidato e escopo concretos. Nenhum script pode produzi-la ou inferi-la.

### 5.1 Requisitos de vínculo

Fontes relevantes (incluindo não rastreadas), configuração, manifests/lockfile, versões de ferramentas/runtime, comandos e resultados, ambiente/escopo, contratos/critérios congelados (esta barra e `aaa_execution_contract`), evidências brutas sanitizadas, `observedAt` e hashes.

### 5.2 Modo histórico

O verificador lê o manifesto antigo e confirma os hashes dos artefatos gravados, reportando `HISTORICAL_COHERENCE`. Não compara com o working tree e não emite juízo sobre o candidato atual.

### 5.3 Testes negativos obrigatórios

Todos devem impedir a qualificação `CURRENT_CANDIDATE` (o histórico pode permanecer verificável, sem reescrever passado):

| ID  | Ataque                                        | Resultado exigido                                           |
| --- | --------------------------------------------- | ----------------------------------------------------------- |
| N1  | alteração de fonte após os testes             | `CANDIDATE_DRIFT`, qualificação negada                      |
| N2  | alteração de configuração ou lockfile         | `CANDIDATE_DRIFT`, qualificação negada                      |
| N3  | omissão de fonte relevante (rastreada ou não) | manifesto incompleto detectado, negado                      |
| N4  | relatório ou log adulterado                   | hash/estrutura divergente, negado                           |
| N5  | gate obrigatório ausente                      | `MISSING_REQUIRED_GATE`, negado                             |
| N6  | teste obrigatório ignorado                    | skip obrigatório não satisfaz, negado                       |
| N7  | exit code não zero apresentado como PASS      | incoerência detectada, negado                               |
| N8  | evidência antiga reaproveitada como atual     | `STALE_EVIDENCE`, negado                                    |
| N9  | mudança de contrato após a revisão            | hash do contrato divergente, negado e dependentes reabertos |

### 5.4 Regras anti-fraude

- Não usar apenas `HEAD` como identidade quando o working tree tem mudanças.
- Não descartar mudanças do usuário para obter candidato “limpo”; o candidato sujo é identificado pelo manifesto.
- Recomputação de hashes pelo próprio candidato é coerência interna, não aprovação independente.
- Relatório, manifesto e veredicto são artefatos distintos; o veredicto referencia os hashes dos dois.

## 6. Supply chain (AAA-14)

- Node alvo do projeto: `22` (CI/Docker). Node 24 local pode ser usado para diagnóstico, nunca como substituto do alvo; o runtime alvo só muda por decisão registrada.
- Atualizações apenas do necessário, compatíveis; lockfile regenerado exclusivamente pelo gerenciador (`npm install`), nunca editado à mão.
- `npm audit`: high/critical = 0; moderadas corrigidas ou exceção formal com autoridade, justificativa, prazo, impacto e mitigação. Proibido elevar o limiar de audit ou marcar moderada como aceita sem autoridade.
- Licenças: cada desconhecida é classificada individualmente (workspace interno × terceiro). “Desconhecida” nunca vira “aprovada”; licença negada bloqueia.
- Instalação determinística: `npm ci --ignore-scripts` em checkout isolado no Node alvo; comparar inventário de dependências do lockfile com o artefato produzido (`certification/sbom.cyclonedx.json`, `certification/license-report.json`) e com a imagem.
- Imagem: multi-stage, `USER` não-root, healthcheck, ausência de segredos incorporados, e o entrypoint não pode depender de tooling classificado como desenvolvimento (por exemplo `tsx`) sem que isso seja explicitado e minimizado. Build de imagem só é evidência quando o ambiente permitir; caso contrário `NOT_RUN/BLOCKED` registrado, jamais presumido.
- Exceções de vulnerabilidade/licença ficam pendentes até autoridade humana; nenhuma exceção é criada por este contrato.

## 7. Protocolo comparativo (congelado antes do holdout)

Normativo em `comparator-protocol.json`; resumo:

- **Alternativas elegíveis** (fixadas): `C1` candidato integrado AAA; `C2` runtime legado/`@cvg/platform` atual; `C3` variante de provider quando D04 autorizar; cada alternativa tem hash e configuração registrados. Nenhuma alternativa nova pode entrar após o holdout.
- **Partição**: `dev` (tuning), `validation` (seleção de configuração) e `holdout` (avaliação final). Holdout selado por hash antes do tuning; nenhum ajuste após abrir o holdout; runner de tuning não lê o arquivo do holdout (controle por permissão/flag e revisão do comando).
- **Datasets**: corpus atual `phase10-core-v1` (56 cenários, `packages/agent-evals/src/datasets/core.ts` sha256 `503c2449…`) é candidato a `dev/validation`; o `holdout` deve ser criado e selado antes de AAA-27/AAA-40, com hashes registrados neste diretório. Amostra mínima e estratificação por categoria definidas no anexo.
- **Métricas fixas**: sucesso de tarefa por categoria; taxa de ação proibida; correção de escalonamento/handoff; taxa de schema inválido; p50/p95 de latência; custo por tarefa; determinismo (variância entre seeds); erros por tipo. Nenhuma métrica pode ser adicionada, removida ou redefinida depois de observar o holdout.
- **Ambiente**: mesmo hardware/limites, versões idênticas de Node/ferramentas, providers falsos/determinísticos ou aprovados, três seeds quando estocástico; divergência de ambiente invalida comparação.
- **Regra de decisão**: superioridade só pode ser declarada se o intervalo de confiança (95%) do delta no holdout excluir zero a favor do candidato e a taxa de ação proibida não piorar; caso contrário declarar “equivalente/no escopo observado” ou “inconclusivo”. Sem holdout válido, declarar apenas o nível técnico observado — nunca State of Art.
- **Trade-offs**: custo, latência e segurança reportados junto; nenhuma média compensa violação de segurança.
- **Preservação**: rodadas, falhas e resultados negativos são mantidos; repetição exige motivo técnico e novo registro.

## 8. Gate de formatação (AAA-15)

- Formatação é mudança exclusivamente sintática: sem refatoração, sem alteração de comportamento, sem renomear símbolos, sem reordenar imports que altere lógica.
- Janela exclusiva reservada pelo coordenador; confirmar que o arquivo não mudou desde o início da operação (`sha256` antes/depois).
- Aplicar somente o necessário (`prettier --write` no arquivo alvo); inspecionar o diff linha a linha e provar equivalência semântica.
- Fechamento: `npm run format:check` verde, `git diff --check` limpo, `npm run typecheck` verde e teste focado da API preservado.
- Se o arquivo estiver sob outra lane ativa, não formatar; registrar `BLOCKED` e reagendar.

## 9. Orçamento de regressão e matriz de gates

| Contexto                        | Gates mínimos                                                                                                                                                 | Reexecução                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Documento/contrato (AAA-04)     | validador do plano, `git diff --check`, revisão independente                                                                                                  | na mudança de bytes                 |
| Higiene/formatação (AAA-15)     | `format:check`, `typecheck`, testes focados da API, `git diff --check`                                                                                        | não repetir sem mudança             |
| Supply chain (AAA-14)           | `npm ci --ignore-scripts` isolado no Node alvo, `audit:security`, `licenses:check`, `sbom`, `npm test`, `typecheck`, `lint`, build de imagem quando permitido | após qualquer alteração de lockfile |
| Certificação (AAA-13)           | testes negativos N1–N9, `certification:verify`, `npm test`, `typecheck`, `lint`                                                                               | por candidato                       |
| Fechamento de sprint com código | `npm test`, `typecheck`, `lint`, `test:coverage`, `test:postgres` sem skips obrigatórios, E2E, worker, evals, chaos, audit, imagem, `git diff --check`        | candidato congelado                 |

Regras: `exit 0` não basta — publicar inventário de executados/ignorados; coverage não é cobertura integral do produto; teste unitário não substitui integração pública; memória não substitui PostgreSQL; imagem construída não é operação qualificada. `NOT_RUN`, `SKIPPED`, `UNKNOWN`, `BLOCKED` nunca satisfazem critério obrigatório.

## 10. Proibições explícitas

- Reduzir threshold, excluir teste, aceitar skip ou “ajustar” amostra para produzir PASS.
- Reaproveitar evidência antiga, certificado histórico ou nota como qualificação do candidato atual.
- Tratar média ≥97 como aprovação de release ou como resolução de P0/P1.
- Declarar produção, State of Art ou Triplo AAA sem os gates correspondentes.
- Editar evidência de builder, runtime state, log mestre ou backlog canônico fora da alçada de publicação.

## 11. Congelamento, versionamento e revalidação

- Esta barra `v1` congela texto, critérios, anexos e hashes. Mudança de qualquer item incrementa `v2` e exige: registro de motivo, reavaliação de impacto, nova revisão independente e reabertura das evidências afetadas.
- Evidência emitida sob `v1` não é válida sob `v2`; o histórico permanece preservado.
- Revalidação obrigatória quando: fonte/config/lockfile muda; contrato muda; limiar ou comando muda; gate falha; finding novo; ambiente alvo muda; holdout é aberto.

## 12. Revisão independente e handoff

- Revisor: agente que não redigiu `AAA-04`; revisa critérios, anexos e o desafio documental do aceite (“fonte alterada, skip e evidência antiga devem impedir veredicto atual”).
- Pacote de handoff: task, contrato/hash, `candidateId`, arquivos alterados, comandos e exit codes, inventário de testes executados/ignorados, logs sanitizados + manifesto, resultado da revisão independente, vulnerabilidades/licenças e exceções pendentes, limitações e próxima ação.
- Nenhuma aprovação de agente substitui aprovação humana obrigatória.
