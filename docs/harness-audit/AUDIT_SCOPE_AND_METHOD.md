# CVG Operational Harness — escopo e método da auditoria

## Registro da tarefa

- ID: `HA-20260913-001`
- estágio CVG: `AUDIT` (discovery arquitetural somente leitura)
- atividade: `RECOVER -> INSPECT -> REVIEW -> VERIFY`
- perfil/modo/tier: `BROWNFIELD`, `NORMAL` com overlay `SPIKE`, `T3_SYSTEM`
- autorização: escrita local restrita a `docs/harness-audit/`; nenhuma alteração de produto, extração, deploy, integração externa ou dado real
- candidato: `HEAD 512bc11e80fbf7c7b8baf6263aacc811ff829309` mais o worktree local observado em 2026-09-13
- pergunta: removido mentalmente o domínio Secretary, qual engine operacional existe, qual sua maturidade e qual o caminho de extração mais seguro?

## Fontes e precedência

As conclusões seguem `CODE > TESTS > CONFIGURATION > DOCUMENTATION > ASSUMPTIONS`. Documentação histórica é contexto, não prova do comportamento atual. Toda conclusão material deve indicar `CONFIRMED`, `INFERRED` ou `UNKNOWN` e apontar arquivo, símbolo/linha, teste, configuração ou relação de runtime.

## Método

1. Recuperar instruções, estado, log, backlog, gates, commit e worktree.
2. Inventariar apps, packages, scripts, testes, configuração, infraestrutura, deploy e certificação.
3. Seguir os caminhos públicos API/worker até runtime, policy, approval, model, tool, persistência, observabilidade e resposta.
4. Classificar componentes e separar domínio, infraestrutura genérica e responsabilidade mista.
5. Confrontar capacidades presentes com o modelo de Harness solicitado, sem implementar a extração.
6. Produzir os 40 artefatos requeridos e verificar links, coerência, evidências e JSON.
7. Congelar uma quality bar antes da crítica; submeter o candidato documental a crítico final novo, read-only e sem histórico herdado; verificar o sentinel de mutação.
8. Em caso de rejeição, corrigir os gaps materiais, invalidar a aprovação anterior e exigir outro crítico final de contexto novo.

## Coordenação

Modo `Scout-assisted`. Três scouts independentes, read-only, cobriram: (S1) runtime/cognição/contexto/modelo; (S2) ferramentas/governança/durabilidade/segurança; (S3) inventário/dependências/extração/testes. Apó a primeira rejeição, três builders receberam conjuntos de arquivos mutuamente exclusivos para aumentar granularidade; o Lead integrou e verificou os anchors. Builders e scouts não aprovam a auditoria. Cada crítico final recebe contexto novo, pacote selado e permissão somente leitura.

## Limites conhecidos no início

- O worktree contém muitas mudanças pré-existentes; elas integram o candidato observado e não serão revertidas.
- O estado `.gauntlet/` pertence a outra execução e não será reutilizado nem alterado.
- Nenhum provider, canal, MCP, RAG institucional, ambiente de produção ou dado real será acessado.
- Testes que escrevem caches ou artefatos só serão executados se puderem ser isolados ou se já forem parte segura e necessária da verificação documental.
- A instrução específica autoriza escrita apenas em `docs/harness-audit/`. Por isso `docs/99_runtime_state.md`, `docs/20_master_execution_log.md` e `docs/30_backlog_master.md` foram lidos, mas não alterados; o registro da tarefa e as evidências desta rodada permanecem neste diretório autorizado.
