# GREEN — correção contínua local — 04/10/2026

## Purpose / Big Picture

Entregar harness e consumidor separados com todos os gates locais obrigatórios verdes e revisão independente válida. Pedido atual revoga o orçamento de um ciclo NEXT. Preservar os failures anteriores, a baseline completa e as SPECs aprovadas. OpenAI/GPT‑6 Luna e chave privada no `.env`; emenda sintética aprovada para BUILD local, execução externa sujeita ao pacote T4 final. NO_MODEL clínico padrão permanece. Sem dados reais, push, piloto ou deploy de produção.

## Progress

- [x] Recuperar instruções, claims e failures; registrar claim antes de qualquer fonte.
- [x] Copiar baseline completa com quatro arquivos/23 testes ausentes e seus inputs, todos hash-bound, sem tocar originais.
- [ ] Corrigir C1 por reprodução discriminante, preservar positivos e recusar desconhecidos; validar fechamento físico.
- [ ] Corrigir preparação E2E/neutra e isolamento físico dos críticos, mantendo asserções.
- [ ] Configurar .env funcional/provider no escopo efetivamente decidido e subir programa local.
- [ ] Gates completos Node22, PostgreSQL, E2E, produto, neutro, segurança/higiene e revisões válidas do artefato final.
- [ ] Integrar somente fontes próprias após aceites, manter evidências/logs/backlog e estado atuais.

## Decision Log

O usuário pediu correção até todos os testes e aprovações, substituindo a interrupção por limite de ciclos do NEXT. Não reduzir barra, skips ou asserções. Nova crítica é autorizada quando há correção técnica/procedimental discriminante. Provider real pode ser configurado a pedido, sem inferir liberação de dados reais, CLINICAL ou produção. Donos de Root sujos permanecem preservados.

## Plan of Work

Lead mantém caminho crítico C1 e integração; Builder independente corrige o setup E2E em cópia disjunta. Revisores sempre novos e fonte congelada, com dependências próprias e cache/TMPDIR inteiramente dentro de seu output. Criar baseline com Git privado desde o início, flags PG=1 e anchor histórico. Reprodutores positivos/negativos existentes, mais os12 contraexemplos do último ciclo, são controles obrigatórios. Fonte do produto PV10 congelada anterior é input, não aceite.

## Validation and Acceptance

Typecheck/lint/build/smoke/full suíte com PG/PG dedicado/E2E zero retries/variante neutra sem products devem passar. Baseline histórica preservada por identidade, incluindo os23 testes antes ausentes. Critic exige fonte/inputs/dependências sem drift, original37/foundation40 e PV01–PV14 íntegros, zero clínica por modelo enquanto NO_MODEL. Installed scan INCOMPLETE não equivale a aceite de independência. Critérios humanos/ambiente real continuam separados da aprovação técnica local; não fabricar aprovação.

## Idempotence and Recovery

Copies novas, fontes antigas readonly, logs brutos no cache próprio, Root somente evidência compacta. Não limpar/restaurar/stash/reset alheio. Claims de banco/portas exclusivas. Não reexecutar suíte verde sem mudança/novo finding. Failure de setup deve ter mecanismo identificado e permanecer registrado.

## Outcomes / Remaining Work

IN_PROGRESS. A baseline anterior passou em 3.015 testes / 342 arquivos; PostgreSQL dedicado 288 / 35; E2E 12 sem retries; neutro 2.725 / 333 com products fisicamente ausente. Esses conjuntos se sobrepõem e não certificam o código novo. Audit npm na cópia corrigida: zero vulnerabilidades observadas. Tipos/lint da baseline passaram. Os 23 testes alheios antes ausentes continuam byte-preservados.

C1 R1–R3 tiveram críticas válidas REJECT preservadas. R4 corrige declarations TypeScript e raízes físicas, com 191 testes PASS e revisão independente restrita APPROVE. Installed scan R2 continua INCOMPLETE com 441 diagnósticos: não há aceite global de independência por esse resultado.

D011 R1: 396 testes verdes, crítica I1 REJECT por probe HALF_OPEN preso após cancelamento e DNS posterior a redirect cancelado. Lead corrigiu ambos, incluiu cancelamento de DNS em voo e controles de contagem neutra; R2 local passou em 403 testes / 38 arquivos, sem skips, typecheck e lint PASS. Novo crítico fresh-context em packet de 447 fontes próprias, sem caches de fonte, ainda em andamento. Nenhuma mudança de NO_MODEL, budget ou corpus.

PISO-005–006: Builder operacional continua na cópia própria; último conjunto selado indica 376 testes PASS e matriz com limites explícitos. Integração aguarda entrega/hash final. Lead implementou backup/restore por writer lock, inventário de todos os documentos e identidade/seq/chain do journal, originais preservados. Teste inicial: 19 PASS, um FAIL na guarda de hold pré-integração. Workflow real por webhook em preparação; falhas próprias de fixture e pausa pré-integração preservadas. Monitor separado: 12 PASS; alerta recebido e persistido 19,9 segundos após parada real de processo, usando poll10s/deadline2s. Host remoto e gestor real não qualificados.

Imagem scratch prévia passou em Node22/UID10001/sem shell/root readonly/data volume; precisa rebuild no source final e não qualifica egress da infraestrutura. Adaptador sintético ganhou comparação de referência proposta contra omissões, 56 testes / 2 arquivos PASS; expectativa humana continua NOT_RUN. Chave privada presente e modelo gpt-6-luna; console3501 baseline vivo NO_MODEL. Runner exige packet/receipt e reserva persistente contra replay; zero chamadas externas.

Próximos passos: integrar operações somente paths próprios, fechar workflow de restore e revisão nova produto/backup/monitor; aguardar crítica D011 R2; congelar fonte final e repetir gates exigidos. Preparar packet T4 concreto após certificação. Promoção condicionada, ledgers e aceites humanos pendentes são registrados sem inventar aprovação. Ledgers Root dirty preservados pela coordenação; entradas propostas serão anexadas no handoff próprio.
