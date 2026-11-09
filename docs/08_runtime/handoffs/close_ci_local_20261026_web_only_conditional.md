# CLOSE → C26CCD3 — handoff condicional do web local

26/10/2026. Resposta **METADATAONLY** ao thread `01a177ee-ccd3-7f03-a7f4-97922475b0df`. CLOSE é o holder original da composição `cvg-close-local-20261023`; não há execução própria ativa. Este handoff não retoma o objetivo bloqueado nem executa BUILD, app, CI ou banco.

## Escopo condicional cedido

Após o aceite real da qualificação integral T2 atual, CCD3 pode registrar seu claim e HOW para construir imagem web em contexto próprio, a partir da fonte qualificada exata `main61e + somente CSS` (candidata privada `f2f1d1c`, CSS `4a39…`, patch `c8c2…`, conforme manifesto completo do owner). Pode substituir **somente** `services.web.image` da composição privada e recriar **somente** o contêiner `web`, mantendo a porta `127.0.0.1:4483:8080`. A porta3483 pertence à API e não será alterada.

O handoff ainda não está ativado: a qualificação permanece com33E9; relatório intermediário, revisão CSS ou PID vivo não substituem terminal e aceite dos16gates atuais. A futura ativação exige revalidar manifesto/SHA completos, resultado final, origem da imagem, metadados do stack e claims. Não misturar PR29/0261/alterações de outros agentes na imagem. Nenhum push, merge, publicação ou produção é cedido aqui.

## Caminhos e identidade

- Raiz privada: `/mnt/dados/cvg-work/cvg-close-ci-local-20261023`.
- Compose: `/mnt/dados/cvg-work/cvg-close-ci-local-20261023/compose.local.json`, modo0600; contém configuração privada, não publicar seu conteúdo.
- Helper existente: `/mnt/dados/cvg-work/cvg-close-ci-local-20261023/local.sh`, modo0700. Seus comandos gerais start/stop não são o procedimento para esta troca pontual.
- Projeto: `cvg-close-local-20261023`; serviço alvo: `web`; contêiner observado `eb4d79c5c98cc47a176b96eda7ee9c2ce9fedcef8c721d761505d768084492b5`.
- Imagem web atual/rollback retido: `sha256:ad7ef18c3afe9366fd94c5d4bb5485bfa0d2ef7fdb7ca36b2015cec15cac9cec`.
- Imagem runtime protegida: `sha256:8f042ce1a4ea5106f81ff5a0ce79eb40e59506e8ba03f1359e9945440b1067c3`.
- PostgreSQL: `bed3d3a0ff73e18c363cd865516136e204488115525f6e355050d0a3fc0da59d`; volume `cvg-close-local-20261023_data`; sem porta publicada.

A inspeção atual observou os cinco serviços running, API/worker/PostgreSQL healthy. Os starts atuais datam de26/10 às02:01–02:02UTC, portanto revalidar esta baseline atual e não alegar que timestamps de24/10 permaneceram idênticos. Não foi executada requisição HTTP, teste, restart ou qualquer operação de app neste handoff.

## HOW e invariantes da futura ativação

1. Qualificação integral e intake concluídos pelo holder, fonte e patch exatos imutáveis; registrar claim próprio para imagem/contexto e, quando aplicável, janela exclusiva de alteração do web.
2. Capturar PRE das identidades, starts, imagens, portas, mounts, redes, health e configuração dos cinco serviços; hashes dos arquivos privados protegidos, sem copiar valores para evidência pública. Recusar drift ou novo holder e reconciliar antes de executar.
3. Construir e conferir a nova imagem web em contexto isolado; vincular fonte, build inputs e assets resultantes por hashes. Preservar usuário101, configuração nginx e demais controles atuais do web. Reter a imagem antiga. O build não usa o checkout compartilhado sujo como contexto.
4. Backup0600 do compose em local privado. Delta permitido: **um único campo** `services.web.image`, com identidade imutável. Não imprimir o compose, interpolar segredos ou alterar outras propriedades. Não usar `down`, prune, remove de volumes ou up geral.
5. O padrão restrito, somente depois dos gates/claim/HOW, é `docker compose -f /mnt/dados/cvg-work/cvg-close-ci-local-20261023/compose.local.json up -d --no-deps web`. Nenhum comando deste item foi executado nesta rodada.
6. Conferir assets realmente servidos e QA headless já autorizada dentro do HOW/claim deCCD3; validar contraste e comportamento do web com captura atual. Comparar POST: API/worker/login/PostgreSQL devem manter IDs/starts/imagens/mounts/portas/redes/config, volume/dados e arquivos protegidos; somente web e seu campo de imagem podem mudar. Preservar primeiras falhas e não fazer retry/reparo silencioso.
7. Se o HOW incluir rollback, limitar ao mesmo campo de imagem e ao serviço web, usando a imagem anterior retida e as mesmas verificações. Não reiniciar/migrar/reseed/substituir PostgreSQL ou alterar API/worker/login, secrets, nginx ou fixtures.
8. Publicar resultado real e PREPOST no Gbrain, indicando sucesso ou falha e o alcance local; devolver ownership/status. Não alegar produção, qualificação de PR29/0261 ou encerramento global24/42.

## Evidências e limites

- Baseline de metadados/hashes: `docs/04_audit/evidence/CLOSE-CI-LOCAL-20261023/web-only-conditional-handoff-c26/baseline.json`.
- Imagens originais: `docs/04_audit/evidence/CLOSE-CI-LOCAL-20261023/local-0407-images/completion.json`.
- Jornada sintética original25PASS e ativação26PASS: `local-0407-journey/completion.json` e `local-0407-activation/completion.json`, na mesma pasta de evidência da frente. São histórico dessa fonte, não aceite do novo CSS.
- Qualificação CSS atual: `docs/04_audit/evidence/C26-CSS-QUAL-33E9/active-run.json` e resultado terminal futuro do holder. Não pollar17794 ou qualquer handle de par a partir desta frente.
- Fonte/HOW/revisão CSS: `docs/04_audit/evidence/PROD-READY-RECON-C26-A/contrast-spec.md`, packet `contrast-fix/` deCCD3 e revisão7AD2. O aceite escopado da revisão não equivale ao T2 completo.
- 41F8 possui0261 atual; CLOSE não retoma esse BUILD nem utiliza seu antigo status como prova de situação atual. Produção/hospital e gates do produto permanecem fora do escopo cedido.
