# LOCAL-IMAGE-20261006 — última imagem disponível para teste

Pedido direto do usuário: subir a última imagem do programa localmente. Task operacional da implementação existente, sem alteração de código.

- `status`: `COMPLETED_LOCAL_SETUP / SANDBOX_RUNNING`.
- Candidato: `31dc1c389be8574c977ed8e85f664ed2851f67d6`, snapshot de HEAD; runtime/web reconstruídos. Dockerfile temporário com `VITE_CVG_WEB_IDENTITY_MODE=simulation` e `VITE_CVG_CONTROLLED_TEST=true` no build web. Fonte e lockfile do repositório preservados.
- Interface: http://127.0.0.1:3410. Identidade simulada: operador `admin.local`, papel `Admin`, tenant `tenant_00000000-0000-4000-8000-000000000001`. Agente fictício `teste-local` criado e dry-run validado no Control Center/Test Lab.
- Projeto: `cvg-harness-local-20261006`; contêineres próprios `secretary-api` e `web`, imagens `cvg-harness-local-runtime:31dc1c3` e `cvg-harness-local-web:31dc1c3`. API em rede interna, web também em rede frontend para publicar somente loopback. Ambos read-only, sem capabilities, no-new-privileges e tmpfs temporário.
- Perfil: API `NODE_ENV=test`, persistence memory, identidade simulation. Dados somem quando API reinicia. Modelo fake/deterministic, sem provider/canal real. Esta instância permite interface e dry-run; PostgreSQL durável e worker/background não compõem o teste.
- Estado persistente dos helpers/evidências: `/home/ricardo/.local/state/cvg-harness-local-20261006/`. Iniciar `start.sh`, parar `stop.sh`; Compose e chave de webhook sintética local em arquivo0600. Build/snapshot temporário em `/tmp/cvg-harness-local-20261006/`.
- Evidências locais: `source.json`, `runtime.json`, `build.log`, `verification.json`, `console.png`. Build exit0, dois contêineres healthy, `/live` e `/ready`200; Chromium criou rascunho e executou dry-run `externalCall: false`, zero erros JS e respostas API>=400 no fluxo exercitado. Readiness declara persistência/ingresso sem durabilidade, coerente com perfil.
- Ajustes de operação: bootstrap inicialmente recusou ausência de segredo de webhook e identidade simulada fora de NODE_ENV=test; configuração local corrigida. Docker29 não publicou porta em rede exclusivamente internal; frontend própria adicionada só ao web, API preservada na rede interna. Sem mudança de fonte para contornar gates.
- `next_action`: usuário testar interface; manter contêineres disponíveis. Produção continua `NO_GO`; nenhum certify/E2E completo/SBOM/licenças, commit/push, deploy produtivo ou recurso alheio alterado.

Referência: [coordenação](../agent_coordination.md), [ADR-010](../../architecture/adrs/ADR-010-harness-product-isolation.md).
