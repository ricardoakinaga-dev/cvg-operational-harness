# 0399 — Backlog de melhorias para produção após a auditoria0624

Data:23/10/2026. Task `PROD-PLAN-0624-20261023`. Recorte de execução do [plano executivo0397](0397_plano_executivo_producao_aud0624.md) e do [roadmap0398](0398_roadmap_producao_aud0624.md). Fonte de planejamento main`9a56a9c9`; auditoria de referência`1e96e365`.

## Como usar

As24 fichas são unidades de execução deste recorte, **não uma nova carteira de status**. U01–U24 apenas organizam contribuições aos cartões/itens existentes. O estado, a autoridade, o dono designado e as dependências completas permanecem em0367,0370,0374 e no backlogPISO. Concluir uma ficha não encerra automaticamente seu pai. Não copiar PROPOSED/TODO antigos como diagnóstico de ausência de código: ler os registros de progresso e a fonte atual.

Os links dos pais são pinados no snapshot publicado, pois o checkout compartilhado está atrás. [Snapshot dos cartões](../04_audit/evidence/PROD-PLAN-0624-20261023/canonical-card-snapshot.json) conserva os estados e dependências observados. `PLAN0374-Cn` é apenas alias de referência para o itemCn da tabela0374, não um novoID de backlog. A prioridade abaixo é a proposta de liberação deste recorte: P0-R significa impedir o aceite do perfil escolhido enquanto faltar o obrigatório; não reclassifica a gravidade da auditoria nem todos os P1 do repositório.

Antes de BUILD: ler o pai e seu fecho de dependências, conferir a fonte/gate/claim vigente e registrar a task concreta. PreparaçãoT1 pode avançar em caminho livre; segurança, schema, identidade e contrato público seguemT3, e efeito/ambiente real segueT4. Decisões já válidas não são solicitadas novamente; premissa/migração/escopo novos exigem a autoridade correspondente. As estimativas são dias-pessoa propostos, não prazos nem pontos de progresso.

## Índice priorizado

| Unidade     | Entrega                                                     | Pais canônicos/itens                                            | Marco | Perfil      | Prioridade de liberação | Dias-pessoa |
| ----------- | ----------------------------------------------------------- | --------------------------------------------------------------- | ----- | ----------- | ----------------------- | ----------: |
| [U01](#u01) | Reconciliar candidato, escopo e decisões já tomadas         | HISO-002, HISO-008, UP91-018                                    | M0    | comum       | P0-R                    |       0,5–1 |
| [U02](#u02) | Concluir CI e controles de publicação já implementados      | UP91-035, UP91-045, HISO-010                                    | M1    | harness     | P0-R                    |         1–2 |
| [U03](#u03) | Criar task e approval junto com sua auditoria               | UP91-018                                                        | M2    | harness     | P0-R                    |         2–4 |
| [U04](#u04) | Vincular grant e escrita; completar revogação da sessão     | UP91-018, UP91-026                                              | M2    | harness     | P0-R                    |         2–4 |
| [U05](#u05) | Concluir prova da fronteira no perfil declarado             | HISO-005, HISO-006                                              | M3    | harness     | P0-R                    |        4–10 |
| [U06](#u06) | Cobrir DNS e hops pelo cancelamento e prazo                 | HISO-011                                                        | M3    | harness     | P0-R                    |         1–2 |
| [U07](#u07) | Aceitar núcleo independente e consumo público               | HISO-006, HISO-009, HISO-010, HISO-013, HISO-014                | M3    | harness     | P0-R                    |         1–2 |
| [U08](#u08) | Concluir console OIDC em hosts HTTPS distintos              | UP91-025, UP91-043                                              | M2    | harness     | P0-R                    |         2–4 |
| [U09](#u09) | Qualificar identidade corporativa no destino                | UP91-025, UP91-026                                              | M4    | harness     | P0-R                    |         3–5 |
| [U10](#u10) | Disponibilizar servidor e fundação do ambiente              | PLAN0374-C1, PLAN0374-C2, PLAN0374-C3, PLAN0374-C4, PLAN0374-C5 | M4    | harness     | P0-R                    |         2–4 |
| [U11](#u11) | Restringir egress e fixar imagens de apoio                  | SRV-04, SRV-05                                                  | M4    | harness     | P0-R                    |         1–2 |
| [U12](#u12) | Automatizar recuperação e privilégios do Vault              | SRV-03                                                          | M4    | harness     | P0-R                    |         1–3 |
| [U13](#u13) | Detectar queda de host/API de outra máquina                 | SRV-01                                                          | M4    | harness     | P0-R                    |         1–2 |
| [U14](#u14) | Provar backup e alertar quando ele falhar                   | SRV-02, PLAN0374-C6                                             | M4    | harness     | P0-R                    |         1–2 |
| [U15](#u15) | Publicar, admitir e reverter a mesma imagem                 | UP91-035, SRV-06, PLAN0374-C9                                   | M5    | harness     | P0-R                    |         2–3 |
| [U16](#u16) | Qualificar o candidato e o destino como conjunto            | UP91-045, PLAN0374-C10                                          | M5    | harness     | P0-R                    |         2–3 |
| [U17](#u17) | Decidir GO do harness e operar com recuperação              | PLAN0374-C10                                                    | M6    | harness     | P0-R                    |       0,5–1 |
| [U18](#u18) | Completar confirmação, preview e fidelidade do consumidor   | PISO-001, PISO-002                                              | M2    | produto     | P0-R                    |         2–4 |
| [U19](#u19) | Completar durabilidade, escritor único e entrega incerta    | PISO-003, PISO-004, PISO-005                                    | M3    | produto     | P0-R                    |         3–6 |
| [U20](#u20) | Revalidar limites de transporte e pausa do produto          | PISO-006, HISO-011                                              | M3    | produto     | P0-R                    |         1–2 |
| [U21](#u21) | Qualificar hardening, restore e monitor do consumidor       | PISO-007, PISO-008                                              | M4    | produto     | P0-R                    |         1–2 |
| [U22](#u22) | Homologar o fluxo de uso e treinar a equipe                 | PISO-009                                                        | M5    | produto     | P0-R                    |         2–3 |
| [U23](#u23) | Autorizar e acompanhar piloto próprio do Assistente         | PISO-010                                                        | M6    | produto     | P0-R                    |       0,5–1 |
| [U24](#u24) | Reduzir concentração e custo de manutenção após estabilizar | UP91-018                                                        | M7    | pós-entrada | P2                      |         2–4 |

## Regras comuns de encerramento

1. Mostrar entrada e saída pela fronteira pública, com controle bom e negativo conhecido; conservar o caso que falhava antes e a prova após o reparo.
2. Preservar contrato de role/tenant/caso, policy→approval→efeito, binding, estado incerto, fontesRAG, budgets, integridade e isolamentoADR010. Não aceitar um PASS de parser/fixture como prova operacional.
3. Rodar os checks proporcionais da constituição e do perfil vigente emNode22, com PG/E2E/coverage/certificação quando aplicáveis; somente em candidata/recursos próprios e com os claims exigidos. Não inventar resultado.
4. Vincular SHA, configuração saneada, imagem/digest, comandos/exit, bruto, limites e parecer. Publicação/merge/deploy só com a autorização pertinente ao resultado concreto.
5. Atualizar o cartão canônico e os ledgers disponíveis; quando ocupados, produzir handoff específico. Não editar o claim ou o artefato de outro agente nem usar gitadd amplo.

## Fichas de execução

<a id="u01"></a>

### U01 — Reconciliar candidato, escopo e decisões já tomadas

**Pais/itens:** [HISO-002](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0370_harness_product_isolation_backlog.md), [HISO-008](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0370_harness_product_isolation_backlog.md), [UP91-018](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0367_program_backlog_reaudit_2026-09-30.md#up91-018). **Origem:** S10. **Marco/perfil:** M0 / comum. **Prioridade:** P0-R. **Esforço:** 0,5–1 dias-pessoa.

- **Responsável de função:** Integrador técnico; Ricardo valida apenas decisões ainda abertas.
- **O quê/onde:** README, ledgers, claims, barras0373/0368 e registros de candidato.
- **Como:** Conferir SHA remoto, fontes/receipts e integrações; registrar versão de processo e escopo funcional do primeiro uso. Reusar a reconciliação publicada no PR23; preparar só os deltas ainda faltantes.
- **Dependências neste recorte:** Nenhuma unidade anterior; reconciliação das fontes é a própria entrega.
- **Pré-requisitos externos/canônicos:** Conferir dependências, gate e claim dos cartões pais antes de BUILD; o grafo deste recorte não os substitui.
- **Gate:** T1; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Mapa aprovado dos dois artefatos, responsáveis e gates; cada comprovante aponta bytes/configuração; pais não são encerrados por este documento.
- **Prova esperada:** Inventário de fontes/decisões e comparação entre audit1e96 e main atual.
- **Próxima ação concreta:** Abrir o inventário do candidato e listar apenas deltas ainda não cobertos por main9a56.

<a id="u02"></a>

### U02 — Concluir CI e controles de publicação já implementados

**Pais/itens:** [UP91-035](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0367_program_backlog_reaudit_2026-09-30.md#up91-035), [UP91-045](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0367_program_backlog_reaudit_2026-09-30.md#up91-045), [HISO-010](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0370_harness_product_isolation_backlog.md). **Origem:** S06. **Marco/perfil:** M1 / harness. **Prioridade:** P0-R. **Esforço:** 1–2 dias-pessoa.

- **Responsável de função:** Holder de CI e integrador; reusar claimGITLEAKS-STABLE.
- **O quê/onde:** verify/security/release-image, scripts/ci-bar\*, teste nativo de segredos e0396.
- **Como:** Acompanhar Verify atual; medir duração e recibos. Budget300min já integrado. Reusar0396 para fixtures determinísticas, sem editar a frente do par. Corrigir apenas falha discriminada; conservar regras, denominadores e proveniência.
- **Dependências neste recorte:** [U01](#u01)
- **Pré-requisitos externos/canônicos:** Permissão GHCR no claim do holder; não pedir ou conceder Write de novo por inferência. Novas execuções amplas exigem claim.
- **Gate:** T2; T3 se alterar contrato de evidência; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Todos os checks exigidos, atestações e verificação independente aprovam no mesmo SHA; controles negativos continuam recusados. Gate wait não vale como publish.
- **Prova esperada:** Run/jobs, tempos, logs originais, scanner nativo e receipts; fonte/artefato identificados.
- **Próxima ação concreta:** Ler o resultado de Verify da main pinada e o handoff0396 antes de propor patch.

<a id="u03"></a>

### U03 — Criar task e approval junto com sua auditoria

**Pais/itens:** [UP91-018](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0367_program_backlog_reaudit_2026-09-30.md#up91-018). **Origem:** S02. **Marco/perfil:** M2 / harness. **Prioridade:** P0-R. **Esforço:** 2–4 dias-pessoa.

- **Responsável de função:** API/persistência.
- **O quê/onde:** POST /v1/tasks, POST /v1/approvals e portas memória/PostgreSQL.
- **Como:** Especificar criação, evento e idempotência na mesma unidade. Reusar as operações atômicas de transição/decisão existentes, preservando seus contratos.
- **Dependências neste recorte:** [U01](#u01)
- **Pré-requisitos externos/canônicos:** Conferir dependências, gate e claim dos cartões pais antes de BUILD; o grafo deste recorte não os substitui.
- **Gate:** T3; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Falha de auditoria deixa zero recurso novo; sucesso deixa um recurso e evento; retry após commit converge e não duplica. Mesma semântica em memória e PG.
- **Prova esperada:** First red da sonda0624, testes de rollback/crash/commit incerto, concorrência e regressão de0250/0251.
- **Próxima ação concreta:** Preparar delta curto de contrato de criação+audit e confirmar o gate aplicável.

<a id="u04"></a>

### U04 — Vincular grant e escrita; completar revogação da sessão

**Pais/itens:** [UP91-018](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0367_program_backlog_reaudit_2026-09-30.md#up91-018), [UP91-026](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0367_program_backlog_reaudit_2026-09-30.md#up91-026). **Origem:** S01, S02. **Marco/perfil:** M2 / harness. **Prioridade:** P0-R. **Esforço:** 2–4 dias-pessoa.

- **Responsável de função:** Autorização/identidade/persistência.
- **O quê/onde:** case authority, mutações de task/approval, sessão e preflights PG.
- **Como:** Fechar a janela entre leitura do grant e commit, sem mudar os papéis aprovados. Avaliar revogação de sessão nas rotas fora de caso; a fatiaA registra até15min de validade residual.
- **Dependências neste recorte:** [U03](#u03)
- **Pré-requisitos externos/canônicos:** Conferir dependências, gate e claim dos cartões pais antes de BUILD; o grafo deste recorte não os substitui.
- **Gate:** T3; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Revogação concorrente ao write respeita ordem de commit; ator sem grant não grava; identidade/tenant falsos são recusados; troca/revogação de sessão obedece ao contrato, com crash seguro.
- **Prova esperada:** Matriz de atores/casos, barreiras concorrentes em PG, old-cookie/new-cookie e queda entre etapas.
- **Próxima ação concreta:** Reconciliar os aceites já provados de026 e registrar os resíduos exatos antes da SPEC.

<a id="u05"></a>

### U05 — Concluir prova da fronteira no perfil declarado

**Pais/itens:** [HISO-005](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0370_harness_product_isolation_backlog.md). **Contribuição adicional:** HISO-006, pré-requisito de build/denominadores antes deU06. **Origem:** S08. **Marco/perfil:** M3 / harness. **Prioridade:** P0-R. **Esforço:** 4–10 dias-pessoa.

- **Responsável de função:** Mantenedor do analisador e revisor do isolamento.
- **O quê/onde:** boundary-semantic-engine, WORKSPACE-MAP, SPEC0246 e receitas instaladas.
- **Como:** AnnexB/SPEC0252 já integrado; não reimplementar. Delimitar o perfil finito do candidato e tratar WORKSPACE-MAP/escopos restantes. Não converter UNKNOWN/INCOMPLETE em PASS por exceção genérica. Conferir/fechar o pré-requisitoHISO006 aplicável antes deU06; aceite finalHISO014 continua emU07.
- **Dependências neste recorte:** [U01](#u01)
- **Pré-requisitos externos/canônicos:** Fase mais incerta;4–10dias é envelope provisório, não promessa de completar um analisador genérico. Gates semânticos atuais continuam válidos apenas no seu escopo.
- **Gate:** T2; T3 nas mudanças semânticas; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Prova positiva reproduzível no perfil e negativos de import direto/transitivo/alias/dinâmico; sem falsas provas conhecidas. Se persistir lacuna material, reportar INCOMPLETE e replanejar.
- **Prova esperada:** Grafo/manifesto, controles conhecidos bons/ruins, medição da raiz atual e revisão técnica.
- **Próxima ação concreta:** Fazer recon de até2dias sobre o saldo real WORKSPACE-MAP/SPEC0246 e recalibrar a faixa.

<a id="u06"></a>

### U06 — Cobrir DNS e hops pelo cancelamento e prazo

**Pais/itens:** [HISO-011](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0370_harness_product_isolation_backlog.md). **Origem:** S03. **Marco/perfil:** M3 / harness. **Prioridade:** P0-R. **Esforço:** 1–2 dias-pessoa.

- **Responsável de função:** Transporte/model-gateway.
- **O quê/onde:** packages/shared/src/ssrf.ts, providers e adapters consumidores.
- **Como:** Propagar prazo absoluto/sinal pela resolução e redirects; impedir dispatch tardio e limpar recursos, preservando pinning/Host/SNI e limites0248.
- **Dependências neste recorte:** [U05](#u05)
- **Pré-requisitos externos/canônicos:** HISO-011 depende de HISO-005/HISO-006. Fatia isolada anterior só é executável se a autoridade existente cobrir expressamente esse recorte; não inferir exceção do cronograma.
- **Gate:** T3; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** DNS pendente não prende a operação após prazo/abort; resolver tardiamente não dispara fetch; positivos e recusa de destino privado permanecem corretos; nenhum retry de efeito incerto.
- **Prova esperada:** Sonda0624 antes/depois, relógio/lookup injetados e transportes locais reais com limites de bytes/cleanup.
- **Próxima ação concreta:** Preparar contrato do resíduo DNS e conferir aceites/dependências HISO005/006 antes do BUILD.

<a id="u07"></a>

### U07 — Aceitar núcleo independente e consumo público

**Pais/itens:** [HISO-006](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0370_harness_product_isolation_backlog.md), [HISO-009](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0370_harness_product_isolation_backlog.md), [HISO-010](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0370_harness_product_isolation_backlog.md), [HISO-013](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0370_harness_product_isolation_backlog.md), [HISO-014](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0370_harness_product_isolation_backlog.md). **Origem:** S08. **Marco/perfil:** M3 / harness. **Prioridade:** P0-R. **Esforço:** 1–2 dias-pessoa.

- **Responsável de função:** Integrador do harness e responsável pelo aceite HISO014.
- **O quê/onde:** Variante limpa, exports, exemplo neutro, suites/coverage por dono e ADR010.
- **Como:** Reusar builds públicos e workflows existentes; executar sem fontes/env/volumes/processo do produto, com lock coerente. Demonstrar jornada neutra, startup/shutdown e denominadores separados.
- **Dependências neste recorte:** [U05](#u05), [U06](#u06)
- **Pré-requisitos externos/canônicos:** Conferir dependências, gate e claim dos cartões pais antes de BUILD; o grafo deste recorte não os substitui.
- **Gate:** T2; T3 se mudar contrato/barra; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Build/teste/smoke independentes aprovam; negativo de dependência falha; produto continua compilável pelo próprio comando; aceite HISO014 documentado sem liberar produto.
- **Prova esperada:** Manifesto da variante, logs por escopo, import público e parecer de independência.
- **Próxima ação concreta:** Reconciliar fecho dos pais HISO005/007/008/010/013; executar a variante só com claim próprio.

<a id="u08"></a>

### U08 — Concluir console OIDC em hosts HTTPS distintos

**Pais/itens:** [UP91-025](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0367_program_backlog_reaudit_2026-09-30.md#up91-025), [UP91-043](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0367_program_backlog_reaudit_2026-09-30.md#up91-043). **Origem:** S01. **Marco/perfil:** M2 / harness. **Prioridade:** P0-R. **Esforço:** 2–4 dias-pessoa.

- **Responsável de função:** Frontend/API de identidade.
- **O quê/onde:** SPEC0254-B/0150, console, cookies/CORS/CSP/NGINX.
- **Como:** Reusar login/principals da fatiaA. Implementar apenas a ponte de navegador/hosts distintos, origem fixa e sessão por cookie, sem transportar token em storage/URL.
- **Dependências neste recorte:** [U04](#u04)
- **Pré-requisitos externos/canônicos:** Conferir dependências, gate e claim dos cartões pais antes de BUILD; o grafo deste recorte não os substitui.
- **Gate:** T3; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Login, reload cookie-only, logout e expiração funcionam; CSRF/origin/redirect incorretos e tenant/role indevidos recusam; UI distingue indisponível de sem permissão.
- **Prova esperada:** Navegador real em três hosts HTTPS sintéticos, teclado/acessibilidade e matriz de auth.
- **Próxima ação concreta:** Preparar SPEC própria da fatiaB e conferir decisão0150 aplicável; não repetir a fatiaA.

<a id="u09"></a>

### U09 — Qualificar identidade corporativa no destino

**Pais/itens:** [UP91-025](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0367_program_backlog_reaudit_2026-09-30.md#up91-025), [UP91-026](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0367_program_backlog_reaudit_2026-09-30.md#up91-026). **Origem:** S01. **Marco/perfil:** M4 / harness. **Prioridade:** P0-R. **Esforço:** 3–5 dias-pessoa.

- **Responsável de função:** Identidade + TI do hospital; Ricardo decide o perfil ainda pendente.
- **O quê/onde:** SPEC0254-C/0152, IdP e cofre do destino.
- **Como:** Resolver a escolha/integração real quando o servidor existir, conforme decisão posterior da0254. Usar ambiente de staging autorizado; qualificar discovery, TLS, MFA, grupos e revogação.
- **Dependências neste recorte:** [U08](#u08), [U10](#u10), [U12](#u12)
- **Pré-requisitos externos/canônicos:** Servidor e IdP autorizado, responsáveis IAM e material de cofre entregues pelo mecanismo aprovado. A referência a Keycloak em0374 não cancela o adiamento específico da escolha/qualificação da0254.
- **Gate:** T3 para contrato; T4 para IdP/conta/destino reais; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** NODE_ENV=production recebe composição qualificada; login/caso permitido200, negados401/403/404 conforme contrato; indisponibilidade503; revogação e papel/tenant corretos; sem credencial em logs.
- **Prova esperada:** Pacote IAM/config saneada, logs de login/recusa, revogação e outage no destino autorizado.
- **Próxima ação concreta:** Preparar delta da fatiaC e pacote da decisão do IdP; não contornar o guard usando NODE_ENV=test.

<a id="u10"></a>

### U10 — Disponibilizar servidor e fundação do ambiente

**Pais/itens:** [C1 do0374](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0374_plano_producao_harness.md), [C2 do0374](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0374_plano_producao_harness.md), [C3 do0374](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0374_plano_producao_harness.md), [C4 do0374](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0374_plano_producao_harness.md), [C5 do0374](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0374_plano_producao_harness.md). **Origem:** S04. **Marco/perfil:** M4 / harness. **Prioridade:** P0-R. **Esforço:** 2–4 dias-pessoa.

- **Responsável de função:** TI do hospital + operação; Ricardo responde por compra/acesso.
- **O quê/onde:** Roteiro0393, compose on-prem, banco, migrations, proxy/TLS e TrueNAS.
- **Como:** Executar a receita já escolhida: hospital/Compose/PG local, consoleLAN/VPN e webhook assinado via túnel. Preparar volumes separados, papéis de serving/migration e inventário.
- **Dependências neste recorte:** [U01](#u01)
- **Pré-requisitos externos/canônicos:** Compra/entrega/acesso não medidos: tempo de espera fica fora dos dias de engenharia. Requisitos já estão em0393; não escolher outra hospedagem por este plano.
- **Gate:** T2/T3 conforme mudança; T4 para operar destino real; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Destino inventariado; serving sem DDL/SUPERUSER/BYPASSRLS; RLS e probes corretos; HTTPS/proxy validados; credenciais/volumes separados; produto não depende do processo do core.
- **Prova esperada:** Checklist0393 preenchido com host/config/digest e sondas positivas/negativas saneadas.
- **Próxima ação concreta:** Conferir disponibilidade efetiva de servidor, DNS/certificado, rede, TrueNAS, UPS e segunda máquina.

<a id="u11"></a>

### U11 — Restringir egress e fixar imagens de apoio

**Pais/itens:** [SRV-04](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0374_plano_producao_harness.md#srv-04), [SRV-05](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0374_plano_producao_harness.md#srv-05). **Origem:** S04. **Marco/perfil:** M4 / harness. **Prioridade:** P0-R. **Esforço:** 1–2 dias-pessoa.

- **Responsável de função:** Operação/rede.
- **O quê/onde:** compose, nftables, referências PG/cloudflared e mirror.
- **Como:** Aplicar escopo por origem: saída do relay/túnel não libera API/worker/PG. Resolver fonte autorizada das imagens e piná-las por digest.
- **Dependências neste recorte:** [U10](#u10)
- **Pré-requisitos externos/canônicos:** Conferir dependências, gate e claim dos cartões pais antes de BUILD; o grafo deste recorte não os substitui.
- **Gate:** T2; T3 se mudar política; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Destino não autorizado é bloqueado da API/worker/PG e permitido só da origem aprovada; pull funciona nas origens liberadas; config não usa digest fictício ou tag móvel.
- **Prova esperada:** Config renderizada saneada, contadores nft e sondas de rede por contêiner; digests/pull no destino.
- **Próxima ação concreta:** Reusar as regras medidas em0393 e preparar delta de origem/egress sem ampliar allowlist.

<a id="u12"></a>

### U12 — Automatizar recuperação e privilégios do Vault

**Pais/itens:** [SRV-03](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0374_plano_producao_harness.md#srv-03). **Origem:** S04. **Marco/perfil:** M4 / harness. **Prioridade:** P0-R. **Esforço:** 1–3 dias-pessoa.

- **Responsável de função:** Operação/Vault + guardiões designados.
- **O quê/onde:** deploy/harness/vault, timer/políticas e datasets externos.
- **Como:** Snapshot diário com principal só de snapshot; recuperação e unseal conforme receita. Qualificar política humana/MFA e rotação no mecanismo aprovado.
- **Dependências neste recorte:** [U10](#u10)
- **Pré-requisitos externos/canônicos:** Conferir dependências, gate e claim dos cartões pais antes de BUILD; o grafo deste recorte não os substitui.
- **Gate:** T3; T4 para segredos reais; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Snapshot atual restaurado em Vault descartável com quorum válido; principal não lê secret/; administração não usa root permanente; mecanismo de recuperação tem dono/substituto.
- **Prova esperada:** Timer, hashes, ACL negativa, restore e instrução de recuperação sem valores secretos.
- **Próxima ação concreta:** Preparar políticas/timer e cenários de recuperação para revisão do gateSRV03.

<a id="u13"></a>

### U13 — Detectar queda de host/API de outra máquina

**Pais/itens:** [SRV-01](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0374_plano_producao_harness.md#srv-01). **Origem:** S04. **Marco/perfil:** M4 / harness. **Prioridade:** P0-R. **Esforço:** 1–2 dias-pessoa.

- **Responsável de função:** Operação/observabilidade; Ricardo é receptor já escolhido.
- **O quê/onde:** Monitor externo, relay e recibos do núcleo.
- **Como:** Reusar a referência do produto sem importá-lo pelo core. Monitorar /ready de outra máquina, correlacionar episódio e validar receiptId/payloadSha256.
- **Dependências neste recorte:** [U10](#u10), [U12](#u12)
- **Pré-requisitos externos/canônicos:** Conferir dependências, gate e claim dos cartões pais antes de BUILD; o grafo deste recorte não os substitui.
- **Gate:** T2 no código; T4 para receptor/envio real; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Parada de worker, API, host e caminho de rede gera alerta recebido; retorno resolve episódio sem tempestade/duplicata; alvo e limiares registrados.
- **Prova esperada:** Ensaio de falha e retorno com horários/IDs/hash e recibo; prova da segunda máquina.
- **Próxima ação concreta:** Especificar contrato monitor–receptor e os limiares de operação ainda faltantes.

<a id="u14"></a>

### U14 — Provar backup e alertar quando ele falhar

**Pais/itens:** [SRV-02](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0374_plano_producao_harness.md#srv-02), [C6 do0374](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0374_plano_producao_harness.md). **Origem:** S04, S05. **Marco/perfil:** M4 / harness. **Prioridade:** P0-R. **Esforço:** 1–2 dias-pessoa.

- **Responsável de função:** Operação de backup + responsável receptor.
- **O quê/onde:** backup/restore-drill, unidadesOnFailure e TrueNAS.
- **Como:** Reusar dump/âncoras já implementados; adicionar notificador onde falta, sem tokens em argv. Ensaiar falha de NFS/backup/restore e recuperação.
- **Dependências neste recorte:** [U10](#u10), [U12](#u12)
- **Pré-requisitos externos/canônicos:** Conferir dependências, gate e claim dos cartões pais antes de BUILD; o grafo deste recorte não os substitui.
- **Gate:** T2 nos scripts; T4 para destino/alerta real; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Backup e âncoras externos íntegros; restore em destino vazio valida cadeia e detecta adulteração; falha avisa com unidade/horário, sucesso não alerta; retenção já aprovada preservada.
- **Prova esperada:** Hashes/inventário, logs de restore, receipts de falha e runbook medindo duração/perda observada.
- **Próxima ação concreta:** Definir ensaioSRV02 e conferir a unidade notificadora/OnFailure antes da implementação.

<a id="u15"></a>

### U15 — Publicar, admitir e reverter a mesma imagem

**Pais/itens:** [UP91-035](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0367_program_backlog_reaudit_2026-09-30.md#up91-035), [SRV-06](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0374_plano_producao_harness.md#srv-06), [C9 do0374](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0374_plano_producao_harness.md). **Origem:** S06, S04. **Marco/perfil:** M5 / harness. **Prioridade:** P0-R. **Esforço:** 2–3 dias-pessoa.

- **Responsável de função:** Release/CI + operação.
- **O quê/onde:** release-image0253, GHCR, verificador de admissão e rollback.
- **Como:** Workflow já existe; provar publicação efetiva e release-verify. Implementar a recusa operacional de imagem sem attestations, além do runbook atual. Usar digest do CI; não rebuildar no servidor.
- **Dependências neste recorte:** [U02](#u02), [U07](#u07), [U09](#u09), [U11](#u11), [U12](#u12)
- **Pré-requisitos externos/canônicos:** SRV06: registrar decisão válida entre reprodutibilidade byte a byte e identidade pelo digest/proveniência; não impor build reproduzível como novo gate nem aceitar limite sem autoridade.
- **Gate:** T3 para admissão; T4 para publicação/deploy; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Tagsha corresponde ao digest/commit; proveniência eSBOM verificadas; digest/attestation inválidos recusados; rollback ensaiado com compatibilidade de schema e pendências, sem repetir efeito.
- **Prova esperada:** Receipts de publish/verify, digest instalado e negativos de admissão; ensaio de rollback.
- **Próxima ação concreta:** Ler saldo de GHCR/0396 e primeira publicação; preparar apenas o delta faltante de admissão/rollback.

<a id="u16"></a>

### U16 — Qualificar o candidato e o destino como conjunto

**Pais/itens:** [UP91-045](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0367_program_backlog_reaudit_2026-09-30.md#up91-045), [C10 do0374](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0374_plano_producao_harness.md). **Origem:** S01, S02, S03, S04, S05, S06, S08. **Marco/perfil:** M5 / harness. **Prioridade:** P0-R. **Esforço:** 2–3 dias-pessoa.

- **Responsável de função:** Integrador + revisor do aceite do harness.
- **O quê/onde:** Barra0373, contrato de gates e pacote do candidato.
- **Como:** Conferir dez condições no mesmo SHA/imagem/configuração. Revalidar runtime/policy/RAG/fontes, sessão/tenant, PG, E2E, segredo/imagem, restore/alerta e pausa/restart. Aplicar gates vigentes e exceções proporcionais válidas.
- **Dependências neste recorte:** [U03](#u03), [U04](#u04), [U06](#u06), [U07](#u07), [U09](#u09), [U11](#u11), [U12](#u12), [U13](#u13), [U14](#u14), [U15](#u15)
- **Pré-requisitos externos/canônicos:** Este aceite proporcional não encerra UP91-045 enterprise nem reintroduz seus44prérequisitos/13gates legados por inferência. Obrigações adicionais só valem quando ainda aplicáveis ao perfil decidido.
- **Gate:** T4 no candidato/ambiente; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Todos os obrigatórios do perfil têm prova atual; falha/NOT_RUN/INCOMPLETE não viramPASS. Drift invalida só a prova afetada e reabre o candidato quando necessário.
- **Prova esperada:** Matriz0373 completa, manifesto e hashes, comandos/exit, relatórios e parecer de resíduos.
- **Próxima ação concreta:** Montar a matriz de evidências do candidato; conferir dependências e autorização dos pais antes de reservar gates amplos.

<a id="u17"></a>

### U17 — Decidir GO do harness e operar com recuperação

**Pais/itens:** [C10 do0374](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0374_plano_producao_harness.md). **Origem:** S04, S06. **Marco/perfil:** M6 / harness. **Prioridade:** P0-R. **Esforço:** 0,5–1 dias-pessoa.

- **Responsável de função:** Ricardo/responsável do harness + operação.
- **O quê/onde:** Pacote de decisão, deploy e runbook de pausa/rollback.
- **Como:** Apresentar candidato pronto para decisão específica, incluindo resíduos, responsáveis e retorno à imagem anterior. Após GO registrado, instalar o digest autorizado e acompanhar probes/alertas na janela acordada.
- **Dependências neste recorte:** [U16](#u16)
- **Pré-requisitos externos/canônicos:** Conferir dependências, gate e claim dos cartões pais antes de BUILD; o grafo deste recorte não os substitui.
- **Gate:** T4; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Decisão vinculada aSHA/digest/config; instalação lida de volta; operador consegue pausar/retomar/reverter; dados/pendências preservados. Se nãoGO, registrar falta objetiva e rota de retorno.
- **Prova esperada:** Decisão humana, readback do deploy, registro de operação e eventual rollback.
- **Próxima ação concreta:** Preparar o pacote de aceite somente apósU16; nunca solicitar GO para uma proposta sem evidência.

<a id="u18"></a>

### U18 — Completar confirmação, preview e fidelidade do consumidor

**Pais/itens:** [PISO-001](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/products/shift-assistant/docs/backlog.md), [PISO-002](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/products/shift-assistant/docs/backlog.md). **Origem:** S09. **Marco/perfil:** M2 / produto. **Prioridade:** P0-R. **Esforço:** 2–4 dias-pessoa.

- **Responsável de função:** Engenharia e owner do Assistente.
- **O quê/onde:** assistant/store, preview/receipt/token e fixtures sintéticas.
- **Como:** Reusar confirmação/homônimos já corrigidos. Ligar confirmação à revisão exata e preview aceito, preservando vínculo ao autor e à fonte.
- **Dependências neste recorte:** [U01](#u01)
- **Pré-requisitos externos/canônicos:** Se o primeiro uso exigir organização clínica por modelo, decisãoD2 é bloqueio desse escopo; texto bruto não pode ser apresentado como extração clínica pronta.
- **Gate:** T3; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Preview perdido/alterado não ativa tarefa; duplicata não duplica; correção exige nova confirmação; homônimo não herda ID. Parte clínica dependente deD2 permanece bloqueada enquantoNO_MODEL.
- **Prova esperada:** Casos positivos/negativos por identidade/revisão, receipt sintético e regressão de fonte por campo no escopo permitido.
- **Próxima ação concreta:** ReconciliarPISO001/002 e especificar só o saldo de preview/revisão; explicitar a experiência possível comNO_MODEL.

<a id="u19"></a>

### U19 — Completar durabilidade, escritor único e entrega incerta

**Pais/itens:** [PISO-003](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/products/shift-assistant/docs/backlog.md), [PISO-004](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/products/shift-assistant/docs/backlog.md), [PISO-005](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/products/shift-assistant/docs/backlog.md). **Origem:** S09. **Marco/perfil:** M3 / produto. **Prioridade:** P0-R. **Esforço:** 3–6 dias-pessoa.

- **Responsável de função:** Persistência/runtime do produto.
- **O quê/onde:** journal, media, fila, lembretes e recibos.
- **Como:** Ordenar subtarefasPISO004→003→005; reusar recuperaçãoV1 e provas existentes. Definir migração/journalV2 e lock de escritor, retries limitados e entrega incerta sem exactly-once fictício.
- **Dependências neste recorte:** [U18](#u18)
- **Pré-requisitos externos/canônicos:** Conferir dependências, gate e claim dos cartões pais antes de BUILD; o grafo deste recorte não os substitui.
- **Gate:** T3; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Truncamento final recupera prefixo, corrupção central recusa; dois escritores não corrompem; restart/SIGKILL não duplica ativação/lembrete; efeito externo incerto pede reconciliação; originais preservados.
- **Prova esperada:** Backup/migração sintéticos, quedas em processo real, concorrência de ticks e recibos do adapter em fixtures.
- **Próxima ação concreta:** Fechar HOW de writer lock/journal e dependências dos pais antes de abrir subtarefa de outbox.

<a id="u20"></a>

### U20 — Revalidar limites de transporte e pausa do produto

**Pais/itens:** [PISO-006](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/products/shift-assistant/docs/backlog.md), [HISO-011](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0370_harness_product_isolation_backlog.md). **Origem:** S03, S09. **Marco/perfil:** M3 / produto. **Prioridade:** P0-R. **Esforço:** 1–2 dias-pessoa.

- **Responsável de função:** Adapters/operação do Assistente.
- **O quê/onde:** whatsapp/transcriber, fila, health e shutdown.
- **Como:** Reusar limites/monitor existentes; integrar saldo deHISO011 sem acoplar processos. Revalidar pausa fora da fila bloqueada e antes do efeito.
- **Dependências neste recorte:** [U06](#u06), [U19](#u19)
- **Pré-requisitos externos/canônicos:** Conferir dependências, gate e claim dos cartões pais antes de BUILD; o grafo deste recorte não os substitui.
- **Gate:** T3; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Provider lento/corpo excessivo não impede pausa; após pausa reconhecida não começa novo efeito; health detecta fila parada; shutdown é limitado e conserva entrada.
- **Prova esperada:** Fixtures HTTP locais lentas/travadas, abort/cleanup e processos reais sintéticos com retomada.
- **Próxima ação concreta:** Comparar aceitesPISO006 com a remediação integrada e executar apenas faltantes.

<a id="u21"></a>

### U21 — Qualificar hardening, restore e monitor do consumidor

**Pais/itens:** [PISO-007](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/products/shift-assistant/docs/backlog.md), [PISO-008](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/products/shift-assistant/docs/backlog.md). **Origem:** S04, S09. **Marco/perfil:** M4 / produto. **Prioridade:** P0-R. **Esforço:** 1–2 dias-pessoa.

- **Responsável de função:** Operação do produto.
- **O quê/onde:** Imagem/volume próprios, backup e monitorPISO008.
- **Como:** Reusar backup/restore/monitor já entregues. Instalar em domínio/processo/volume próprio, provar egress e segunda máquina com receptor autorizado.
- **Dependências neste recorte:** [U11](#u11), [U12](#u12), [U20](#u20)
- **Pré-requisitos externos/canônicos:** Conferir dependências, gate e claim dos cartões pais antes de BUILD; o grafo deste recorte não os substitui.
- **Gate:** T2/T3 nos artefatos; T4 no destino; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Não-root/read-only/sem shell; destino indevido bloqueado; restore de journal/mídia e hashes conferido; host parado gera receipt externo; execução do core não inicia nem para o produto.
- **Prova esperada:** Inspeção de imagem/rede, hashes/restart e receipts com IDs separados dos do harness.
- **Próxima ação concreta:** ReconciliarPISO007/008 e adaptar a receita ao destino sem reconstruir o que já foi aceito localmente.

<a id="u22"></a>

### U22 — Homologar o fluxo de uso e treinar a equipe

**Pais/itens:** [PISO-009](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/products/shift-assistant/docs/backlog.md). **Origem:** S09. **Marco/perfil:** M5 / produto. **Prioridade:** P0-R. **Esforço:** 2–3 dias-pessoa.

- **Responsável de função:** Owner do produto + dois plantonistas designados + operação.
- **O quê/onde:** Corpus20casos/10áudios, Whisper local, canal e guia.
- **Como:** Reusar corpus e guia, exercitar o fluxo efetivamente autorizado com canal/transcrição qualificados; conferir fontes institucionais para qualquerRAG e restrições de dados.
- **Dependências neste recorte:** [U18](#u18), [U19](#u19), [U20](#u20), [U21](#u21)
- **Pré-requisitos externos/canônicos:** Validações administrativas/canal/provider permanecem humanas quando exigidas; este plano não concede conformidade por checklist.
- **Gate:** T1/T2 sintético; T4 para integração real; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Resultados por caso/áudio com esperados/reais; usuário entende confirmação/pausa/apoio; erros não somem; requisitos administrativos aplicáveis têm dono/registro; limitaçõesNO_MODEL são visíveis.
- **Prova esperada:** Matriz de homologação, transcrições sintéticas/fixture, guia lido e aceite dos usuários.
- **Próxima ação concreta:** Completar critérios esperados do escopo escolhido e agendar homologação só após as dependências.

<a id="u23"></a>

### U23 — Autorizar e acompanhar piloto próprio do Assistente

**Pais/itens:** [PISO-010](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/products/shift-assistant/docs/backlog.md). **Origem:** S09. **Marco/perfil:** M6 / produto. **Prioridade:** P0-R. **Esforço:** 0,5–1 dias-pessoa.

- **Responsável de função:** Ricardo/owner e dois plantonistas; operação acompanha.
- **O quê/onde:** Barra0368, candidato do produto e registro de piloto.
- **Como:** Conferir oito condições no mesmo deploy; HIS éN/A na fase1 já decidida. Obter decisão específica e só então iniciar2semanas com2plantonistas; medir resultados por turno e decidir continuar/ajustar/parar.
- **Dependências neste recorte:** [U07](#u07), [U22](#u22)
- **Pré-requisitos externos/canônicos:** Estimativa .5–1dia é preparação/fechamento de engenharia, além das2semanas de observação e tempo dos plantonistas. Não libera outra organização/internet/HISescrita.
- **Gate:** T4; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Sete condições aplicáveis provadas eHISN/A justificado; D1–D4 preservadas; aprovação do candidato registrada; falha sensível pausa e reconcilia; decisão final documentada.
- **Prova esperada:** Pacote0368/recibos; registros de turnos, incidentes, pausas e revisão final.
- **Próxima ação concreta:** Preparar a matriz0368 e critérios mensuráveis do piloto; não pedir novamente decisões já tomadas.

<a id="u24"></a>

### U24 — Reduzir concentração e custo de manutenção após estabilizar

**Pais/itens:** [UP91-018](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0367_program_backlog_reaudit_2026-09-30.md#up91-018). **Origem:** S11. **Marco/perfil:** M7 / pós-entrada. **Prioridade:** P2. **Esforço:** 2–4 dias-pessoa.

- **Responsável de função:** Mantenedor API/runtime; frontend conforme fronteira.
- **O quê/onde:** server.ts, runtime iterativo e console de plataforma.
- **Como:** Selecionar uma fronteira por vez e extrair módulos por responsabilidade com regressões antes/depois; medir diffs/tempo e preservar respostas públicas.
- **Dependências neste recorte:** [U23](#u23)
- **Pré-requisitos externos/canônicos:** Conferir dependências, gate e claim dos cartões pais antes de BUILD; o grafo deste recorte não os substitui.
- **Gate:** T2; T3 se mudar contrato; regras comuns e autoridade vigente do pai.
- **Critério de pronto:** Mesmos contratos/guards/ordem de efeitos e provas de falha; sem mudança noRC que sustenta o piloto. Nova versão passa por seus gates.
- **Prova esperada:** Diff focado e regressões; métrica de tamanho/custo de revisão usada como diagnóstico, não alvo numérico arbitrário.
- **Próxima ação concreta:** Após o piloto, registrar subtarefa de manutenção no pai apropriado e escolher a primeira extração.

## Cobertura dos achados0624

| Achado | Tratamento neste recorte                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| S01    | [U04](#u04), [U08](#u08), [U09](#u09)                                                                                                            |
| S02    | [U03](#u03), [U04](#u04)                                                                                                                         |
| S03    | [U06](#u06), [U20](#u20)                                                                                                                         |
| S04    | [U10](#u10), [U11](#u11), [U12](#u12), [U13](#u13), [U14](#u14), [U15](#u15), [U21](#u21)                                                        |
| S05    | [U14](#u14)                                                                                                                                      |
| S06    | [U02](#u02), [U15](#u15), [U16](#u16)                                                                                                            |
| S07    | ENCERRADO para o advisory da revisão auditada. Não reimplementar a correção; monitoramento de novas dependências permanece no gate do candidato. |
| S08    | [U05](#u05), [U07](#u07)                                                                                                                         |
| S09    | [U18](#u18), [U19](#u19), [U20](#u20), [U21](#u21), [U22](#u22), [U23](#u23)                                                                     |
| S10    | [U01](#u01)                                                                                                                                      |
| S11    | [U24](#u24)                                                                                                                                      |

## Preservação das24 áreas da auditoria

Áreas fortes não viram projetos novos para aumentar a nota: entram como invariantes/regressões do candidato. O mapa abaixo indica onde a melhoria ou a preservação é verificada.

| Áreas0624                        | Cobertura                                                 |
| -------------------------------- | --------------------------------------------------------- |
| A01/A02 arquitetura/isolamento   | U05/U07; contratos e variante independente                |
| A03/A04 contratos/qualidade      | U03/U04/U07 eU24posterior; regressão pública              |
| A05/A06 identidade/autorização   | U04/U08/U09; ator→caso→tenant e revogação                 |
| A07 policy/approval              | U03/U04/U16; ordem e binding preservados                  |
| A08/A09 segurança/privacidade    | U06/U09/U11/U12/U16/U22; configuração, redação e acesso   |
| A10/A11 persistência/recuperação | U03/U04/U14/U19/U21; commit, replay e restore             |
| A12/A13 runtime/modelos          | U06/U16/U20; budgets, cancelamento e transporte           |
| A14/A15 RAG/canais               | U16/U20/U22; fonte aprovada ou handoff e recibos do canal |
| A16/A17 console/produto          | U08/U18–U23; browser e piloto no perfil correto           |
| A18/A19 testes/CI                | U02/U07/U15/U16; evidência e denominadores atuais         |
| A20/A21 dependências/deploy      | U02/U10–U12/U15/U16/U21; scan, imagem e rede              |
| A22/A23 operação/backup          | U13/U14/U16/U21; falha, alerta recebido e restauração     |
| A24 documentação                 | U01 efechamento de cada ficha; links/estado porSHA        |

## Cobertura das barras de entrada

A numeração é a dos contratos canônicos; a tabela indica quem prepara a prova. Não é uma nova lista de condições nem registro de PASS.

| Barra0373 do harness                       | Unidades que entregam/consolidam a prova |
| ------------------------------------------ | ---------------------------------------- |
| 1 — Conformidade I1–I12                    | U07/U16                                  |
| 2 — Suítes, PostgreSQL e análise estática  | U02/U07/U16                              |
| 3 — Pilha em modo produção                 | U10/U15/U16                              |
| 4 — Operadores entram com sessão funcional | U04/U08/U09/U16                          |
| 5 — CI e proteção no mesmo SHA             | U02/U15/U16                              |
| 6 — Segredos e dependências                | U02/U12/U15/U16                          |
| 7 — Imagem endurecida                      | U10/U11/U15/U16                          |
| 8 — Backup restaurado e cadeia íntegra     | U14/U16                                  |
| 9 — Falha detectada e alerta recebido      | U13/U16                                  |
| 10 — Pausa e retomada sem perda            | U16/U17                                  |

| Barra0368 do Assistente                                          | Unidades que entregam/consolidam a prova                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1 — Lista de equipe permitida                                    | U22/U23                                                            |
| 2 — Poder zero, ferramentas e rede restritas                     | U18/U20/U21/U23                                                    |
| 3 — HIS somente leitura                                          | N/A na fase1 já decidida; justificar emU23, não simular integração |
| 4 — Segredos fora de código/imagem                               | U12/U21/U23                                                        |
| 5 — Tratamento/retenção, acesso e transcrição no escopo aprovado | U19/U21/U22/U23; D4 e decisões aplicáveis preservadas              |
| 6 — Backup testado                                               | U21/U23                                                            |
| 7 — Alerta recebido                                              | U21/U23                                                            |
| 8 — Desligamento e retomada                                      | U20/U23                                                            |

## O que este backlog não conclui

S07Fastify, AnnexB0252, OIDC0254-A ebudget300min são entregas anteriores, não novas tasks. A preparação deste pacote não implementa as fichas, não fechaHISO/PISO/UP91, não promove notas e não autoriza piloto/deploy. O saldo da fila permanece nos pais e no [handoff](../08_runtime/handoffs/prod_plan_0624_20261023.md).
