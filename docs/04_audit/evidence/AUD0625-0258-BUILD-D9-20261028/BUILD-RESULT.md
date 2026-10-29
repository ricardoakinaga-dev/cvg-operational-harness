# AUD0625-0258-BUILD-D9 — SPEC 0258 R1 (WORKSPACE-MAP, U05)

Base `a69030d3f` (`candidate/aud0625-wave-20261028`). BUILD T3 local e sintético, aprovado pelo Ricardo em 28/10 às 19:50. SPEC copiada byte a byte, sha256 `67e1e8e09aba1838ae0f3c01c7f63475c8035b08e9a3d5542d9fe44f215b5767` (conferido). Sem push, sem dados reais, produção `NO_GO`. Não fecha HISO-005/014 nem U05 por associação.

## Mudança

`scripts/boundary-semantic-resolution.mjs`, função `workspaces()`: o tipo da entrada vem do `inspect` (lstat sem follow que já grava a premissa de stat). Arquivo regular verdadeiro (`s.isFile()`) é ignorado **antes** da validação do nome e nunca é aberto; link, tipo especial, diretório sem manifesto, nome inválido e nome duplicado seguem recusados com `UNKNOWN_WORKSPACE_CONFIG`. Nada mais muda: tetos, namespaces, `packages/*` para links npm e hash de versão ficam como estão.

## Provas

- **Corpus físico real** (árvore de `package.json`/`README.md` do repositório, com o `legacy/packages/README.md` verdadeiro): antes `THREW UNKNOWN_WORKSPACE_CONFIG:legacy/packages/README.md`; depois `RESOLVED packages/platform/dist/index.js`, `workspaces 28`, `revalidate true` ([antes](proofs/corpus-before.txt), [depois](proofs/corpus-after.txt), [sonda](proofs/real-corpus-probe.mjs)). WM08: o arquivo ignorado não conta como workspace (28 no corpus).
- **Testes novos** `tests/b6-0258-workspace-regular-entries.test.js` (17): WM01 (mesmo arquivo, owner e digest com e sem README; ignorados não contam), WM02 (nome inválido, conteúdo nunca lido), WM03 (link com nome README, link de diretório, FIFO, link pendente continuam recusados), WM04 (sem manifesto, nome inválido, duplicado, manifesto por link, ao lado de um README), WM05 (README trocado por diretório, por link, reescrito com mesmo nome, removido, ou criado depois: a revalidação invalida), WM06 (arquivos ignorados pagam o teto `maxFiles` e não viram workspaces). Sem a correção: 8 falham.
- **Mutações** ([mutations.txt](proofs/mutations.txt)), todas mortas: M0 sem correção (8), M1 ignorar qualquer não-diretório (4), M2 seguir link como regular (1), M3 pular o nome (1), M4 pular o diretório (4), M5 deduplicar nome conflitante (1), M6 contar ignorado como workspace (2), M7 ignorar sem gravar a premissa de stat (5).
- **Regressões do resolvedor** (Node 22.23.2, `--maxWorkers=2`, 11 arquivos b6-*): 599 passam, 9 falham, todos em `b6-0241-integral-body` (C2×3, C3×2, C4, C5, G4, H2). **As mesmas 9 falham na base sem a minha mudança** (rodado nos dois lados com `-t`): `out.blocked` diferente de 0 no executor de teste, nesta worktree com `node_modules` em link simbólico para outra worktree. Não vêm da 0258; devem ser reconferidos numa worktree com `node_modules` próprio. `b6-0236-semantic-engine` estourou o hook sob carga na rodada conjunta e passa isolado (101/101).
- typecheck, eslint e prettier nos arquivos tocados: sem erros.

## Observações

- Nomes inválidos agora passam pelo `inspect` antes da recusa (gravam uma premissa de stat a mais); a recusa continua a mesma.
- Medição do teto `maxContexts` 256 no root (SPEC, WM08): não repetida aqui; precisa do root completo na candidata da integração.
