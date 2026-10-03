# SPEC 0178 — Extração do consumidor do Operational Harness

Data: 03/10/2026. Tasks: HISO-001–009, parte estrutural T2. Fonte de WHAT: pedido explícito de implementar integralmente [0369](../03_build/0369_harness_product_isolation_roadmap.md)/[0370](../03_build/0370_harness_product_isolation_backlog.md), com direção [ADR-010](../architecture/adrs/ADR-010-harness-product-isolation.md). Discovery/PRD existentes são reconciliados nesta fatia: problema é acoplamento de localização/tooling/missão; resultado é harness reutilizável e consumidor independente. Nenhum requisito clínico novo.

## Gate e autorização

Continuação C1 autorizada pelo usuário em 03/10/2026, decisão B1 do plano de ações: resolver separadamente a closure física de runtime e de tipos, propagar namespaces/capacidades Node de require, module e resolve por aliases locais ou recusar usos desconhecidos. Não aceitar declaração neutra como prova sobre runtime diferente. Incerteza produz diagnóstico e recusa, nunca PASS. Reproduzir os 17 casos R2 arquivados, recusar os sete negativos antes falsamente aceitos e preservar controles positivos; verificar os gates T2 em Node22 com PG sintético. Uma única revisão posterior desta correção; problema remanescente retorna à sessão semanal. Sem mudança de APIs públicas ou comportamento do consumidor. Task/claim `AUDIT_ACTIONS_EXEC_20261003`; ExecPlan próprio em `.agent/plans/harness-isolation-audit-actions-execplan.md`.

Gate proporcional D-12: **T2 para relocação sem mudança de comportamento**, com task/claim HARNESS-ISO-EXEC, SPEC curta anterior à movimentação e gates de verificação obrigatórios. Pedido atual autoriza a implementação local do plano e o layout nele proposto. Não afirmar revisão humana de contratos T3 ainda não apresentados. CI/limites/persistência/identidade/approval/hardening novos ficam em SPECs 0179/0180, sem BUILD até sua revisão específica.

HISO-002 possui integração documental nos ledgers/índices bloqueada pela regra 5 de coordenação. A identidade atual está confirmada no pedido, ADR-010, README/AGENTS e claim da execução. Ajuste de sequência, sem reduzir o aceite: HISO-003/004 podem executar com essa fronteira congelada e HISO-002 permanece parcial até os ponteiros compartilhados serem integrados. Integração final de HISO-014 continua exigindo a reconciliação. Nenhum arquivo dirty de outro agente é substituído.

## Fronteira e arquivos

Workspace privado `@cvg/shift-assistant`, versão 1.0.0, tipo module; fonte `products/shift-assistant/src`, mantendo os 17 arquivos, inclusive `src/__tests__` e `src/sandbox`. Entry `src/main.ts`; artefato bundle `dist/shift-assistant.mjs`. Dependências runtime declaradas: `@cvg/model-gateway` 1.0.0 e `zod` ^4.3.6; dev tools são esbuild/tsx/Vitest já disponíveis e versões do lock atual, sem atualização de segurança nesta fatia.

- Move `apps/worker/src/shift-assistant/**` → `products/shift-assistant/src/**`, byte a byte.
- Move `deploy/shift-assistant/**` → `products/shift-assistant/deploy/**`, ajustando somente caminhos/contexto/comentários do build e operação.
- Build do consumidor compila a closure model-gateway/shared com exports efetivos; aliases TypeScript vazios nessa compilação. Bundle resolve packages construídos, não seus sources por `paths`. Sem mover regra do consumidor para pacote compartilhado.
- Root workspaces/typecheck/Vitest/coverage/política de discovery incluem `products/*`. Root scripts expõem test/build/demo/chat do consumidor e teste core separado; suíte agregada inclui os dois. Root project references incluem o consumidor, sem mudar APIs exportadas.
- `scripts/check-product-boundary.mjs`: gate de grafo por AST TypeScript e resolução de módulos; imports/exports literais, require/import dinâmico literal, aliases e caminhos relativos são tratados. Dependências de manifesto são arestas também; tipos não liberam domínio para core. Não tratar resolução desconhecida como PASS. Resolução não literal exige inventário/revisão, sem exception ampla.
- `scripts/build-public-workspace.mjs`: gera configs descartáveis exclusivas por execução, resolve closure de dependências de workspaces e compila com paths vazios/references corretas. Saída em dist dos workspaces, apenas em snapshot sob claim no teste. Não apagar dist alheio nem usar temp global de outro build.
- Deploy próprio mantém processo/env/volume do consumidor; contexto de Docker continua monorepo para dependências, com novo entrypoint. Hardening de shell/rede é pendência PISO-007, não benefício falsamente atribuído ao move.

Docs/backlog do produto terão raiz `products/shift-assistant/docs`. Transferência PISO é atômica e conserva IDs/aceites; aqui ficam links. Relatórios e evidências antigos permanecem byte a byte. Resolver links históricos a fontes movidas por mapa antigo→novo explícito, validado contra ambos os paths: origem deve estar ausente e destino existir; regra aplicável somente àquele prefixo de origem conhecido. Não criar wrappers de import no worker. Mudança no checker tem positivos e negativos próprios.

## Contratos preservados

### Gramática verificável do gate de fronteira

Após a primeira crítica T2, o gate visita a closure local resolvida por AST,
incluindo intermediários em scripts/tools, declarations e reference paths.
Manifests incluem dependências runtime, opcionais, peer e dev. Reconhece require,
module.require e createRequire importado/namespace/desestruturado, aliases locais,
resolve e chamada imediata, com base ancorada em import.meta.url ou \_\_filename.
Argumento não literal, base desconhecida, export/escape do loader ou primitive
Node module sem gramática suportada reprova. Namespace dinâmico de node:module
também reprova; builtinModules/isBuiltin podem ser lidos de namespace conhecido.
Método do domínio chamado require não é presumido como loader. Origem física
resolvida deve permanecer dentro do repositório. Positivos/negativos cobrem esses
casos e os escapes reproduzidos pelo crítico. Este gate verifica referências de
módulo nessa gramática e não substitui sandbox de execução de JavaScript arbitrário.

Config/env/portas e autenticação de webhook, schemas JSON/eventos JSONL, D1–D4, comandos, identidade, intervalo/limite de lembretes, comportamento de confirmação e recovery **não mudam durante a extração**. Defeitos F01–F11 continuam abertos até suas correções T3: a extração não os mascara. Não mover dados/volumes, reiniciar o sandbox existente 3400/3401 ou criar aliases de processo de produção.

Exports de modelo atuais são entrada de integração, não prova de uso da factory: o assistente executa provider diretamente. HISO-009 revisa a compatibilidade com ADR-004 antes de declarar esse contrato definitivamente aceito. Public smoke nesta fatia só prova que imports construídos são resolvidos sem sources privados.

## Verificação e critérios de pronto

Em Node 22 no snapshot próprio:

1. Comparar hash de cada fonte antiga/nova e eventos/fixtures sintéticos antes/depois; todos os 17 moves preservam bytes.
2. `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:postgres`, E2E com PG/portas/snapshots próprios. SKIP não satisfaz gate de integração.
3. `npm run test:shift-assistant`: preservar os 37 testes iniciais e dois arquivos; executar demo real com simuladores HTTP próprios e limpar somente recursos criados pelo teste.
4. Build do consumidor por exports construídos e execução da demo/entry sintético. Build sem consumidor em variante descartável com manifests/lockfile ajustados. A ausência deve ocorrer em sources e dados/env, não apenas ignorar testes.
5. Gate de fronteira positivo e casos negativos de import direto/alias/dinâmico literal/transitivo/manifests; caso proibido deve sair não zero. Não declarar graph completeness para módulo desconhecido.
6. Inventários de suites/coverage antes/depois: nenhum teste existente some; denominadores são explicitados por core/consumidor e agregados, sem reduzir pisos para passar.
7. Build/smoke da imagem efetiva separada, links/higiene/formato e revisão fresh-context I1 da fatia. CI remoto/release não são inferidos de execução local.

HISO-004–009 só passam a DONE após evidência integral de seus respectivos aceites. Os resultados serão anexados à evidência HARNESS-ISO-EXEC; esta SPEC não antecipa PASS.

## Recuperação

### Task de verificação T2 — TEST-HOMOLOG-SHUTDOWN

A primeira regressão agregada falhou no teste de drenagem do worker. Diagnóstico
readonly comparou main/snapshot/HEAD (9/9 MATCH): o teste selecionava qualquer
primeiro not_ready, inclusive dependency_health_failed antes do SIGTERM, e então
rejeitava a recuperação legítima. Seis focais sem atraso passaram; atraso sintético
de50ms reproduziu a asserção com exit0 e sem ready após shutdown_started. O log da
primeira regressão não registrou os motivos; seu gatilho exato permanece desconhecido.

Correção autorizada T2 do oracle, registrada antes do patch: no teste existente,
selecionar not_ready com motivo shutdown_started e manter asserção de sua presença,
exit0, proibição de ready posterior e ausência de homolog_completed. Nenhum arquivo
de produção muda. Verificar focal com PG descartável próprio, preservar reprodução
do controle conhecido ruim e retestar agregado; não substituir o gate por exclusão
ou retry sem diagnóstico. Evidência em HARNESS-ISO-EXEC/homolog-diagnosis.

Primeiro capturar baseline/hash/dirty status e reservar lockfile. Moves são reversíveis apenas pelo patch próprio em snapshot/branch. Não usar reset/restore/stash/clean no checkout compartilhado. Se teste falhar, manter reprodução, diagnosticar e corrigir estrutura, sem alterar comportamento para compensar o move. Formato de eventos e volumes permanecem intocados. Integração final verifica novamente os hashes dos arquivos alheios contra baseline; divergência é investigada, nunca sobrescrita.
