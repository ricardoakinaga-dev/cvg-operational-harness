# Pedido de decisão humana — M07-S1-R1-C1L

**Estado:** `WAITING_HUMAN_APPROVAL`  
**M07-S1:** `FAIL / OPEN`  
**Produção:** `NO_GO`

## Decisão solicitada

C1J passou sua matriz local. O gate continua `FAIL / OPEN` porque as revisões independentes I1 e Final Critic ficaram indisponíveis. As duas tentativas C1K autorizadas também foram recusadas pelo limite de criação de agentes, sem produzir pareceres.

Este pedido abre um run local novo, C1L, para corrigir o binding de evidência que ainda aponta para C1J e repetir a matriz local em uma pasta própria, mantendo C1J/C1K históricos intactos. A resposta genérica anterior não autoriza esta execução. Para autorizar somente este escopo, responda **“Aprovo M07-S1-R1-C1L — SHA-256 <hash integral mostrado junto à pergunta>”**. A aprovação não aceita M07-S1 nem libera etapas posteriores.

## Correção proposta

O patch inicial exato está em `correction-preview.patch`, SHA-256 `910f076883f247877845c32fd7b516275789004e145cb63f8112dbf2a53ba44f`. Ele:

- vincula o arquivo de versão do npm à evidência C1L;
- permite a nova pasta C1L para outputs do scanner, preservando a pasta histórica C1J e as demais pastas aprovadas;
- atualiza as expectativas dos testes e adiciona casos C1L permitido e nome C1L não aprovado;
- mantém o baseline de 973 entradas e SHA-256 `ea28a36f156bda03fa6da930443feea21a873fd451775d86f43150bc15c8d67d`.

A diferença toca somente os três paths de produto listados abaixo. A inspeção estática confirma que o diff não remove lógica de traversal/symlink. `git apply --check`, aplicação do patch e testes de produto ainda não foram executados.

## Escopo autorizado se aprovado

Paths de produto que podem mudar:

- `config/workspace-dependency-policy.json`
- `scripts/workspace-dependency-audit.mjs`
- `tests/workspace-dependency-audit.test.js`

O arquivo `packages/conversation/src/__tests__/postgres-store.unit.test.ts` é apenas snapshot e precisa permanecer byte-idêntico. O candidato C1L esperado tem 977 entradas, incluindo os quatro additions já aceitos na baseline C1J.

Na preparação, `git status` já mostrava alterações e arquivos não rastreados preexistentes fora do allowlist C1L. Este gate não os edita, reverte ou prepara para commit; os testes rodam sobre a worktree existente, e o freeze candidate deve parar se a identidade/base esperada não conferir.

A matriz congelada está em `command-plan.json`: 36 passos capturados individualmente, mais o verificador de integridade. Inclui preflight do hash de aprovação, Node `v22.23.2`, TypeScript `6.0.3`, npm `10.9.8`, freeze/verificação de candidate, inventário, testes focados e suíte completa, typecheck, lint, coverage e pós-check. Os thresholds permanecem statements ≥90%, branches ≥85%, functions ≥90% e lines ≥90%.

O npm roda em modo offline; variáveis de conexão PostgreSQL são removidas. As saídas, snapshots de rollback, logs e coverage ficam em `docs/04_audit/evidence/AUD-20260924/M07-S1-C1L/`. Nenhuma evidência C1J/C1K será alterada.

### Correção condicional

Se a matriz inicial mostrar falha corrigível dentro do escopo, o gate permite **um único** patch adicional. Antes de aplicar, ele deve ser criado na pasta C1L, ter seu SHA capturado, passar pelo validador de paths e por `git apply --check`, e limitar-se aos mesmos três arquivos. Não pode relaxar assertions, thresholds, inventário, identidade de candidate, controles fail-closed, traversal ou symlink. Se a causa estiver fora desses paths, se a correção não passar ou surgir uma segunda falha, parar e preservar as evidências; qualquer edição adicional requer outro gate.

## Limites do gate

- C1L é uma execução local sintética e não altera dados, serviços, banco, rede externa, ações clínicas/financeiras, prontuário ou produção.
- Não autoriza novas tentativas de reviewer, substituição de parecer, fechamento/aceitação de M07-S1, M07-S2/S3/S4, M05 ou qualquer downstream.
- Mesmo com todos os critérios locais aprovados, M07-S1 permanece `FAIL / OPEN` até que I1 e Final Critic tenham evidência independente válida e disposição própria.
- Falha em qualquer critério mantém `FAIL / OPEN`; o resultado será registrado sem declarar PASS por inferência.

## Validação estática do pacote

`packet-validation.json` registra PASS em 16 verificações documentais e estruturais. Essa validação não executou código de produto, scanner, `git apply --check`, testes, typecheck, lint ou coverage. `decision-record.json` está `WAITING_HUMAN_APPROVAL` e `command-records.json` está `NOT_STARTED`.

## Arquivos imutáveis do pacote

Os hashes abaixo vinculam escopo, fontes, critérios, plano de comandos, patch e helpers. `decision-record.json` e `command-records.json` são ledgers mutáveis, inicialmente pendentes/vazios; a execução somente poderá alterá-los após esta decisão específica. O próprio pedido fica identificado pelo SHA-256 integral incluído na pergunta.

| Arquivo | SHA-256 | Bytes |
| --- | --- | ---: |
| `scope-manifest.json` | `0594d7d5ff218c05960cec3900189faa1bfabf37a263b14f8f1b4cbcab57d3db` | 3170 |
| `source-evidence.json` | `f3e19e66a126976a041412c3a4fb11fc6ff8a259bb644b6dfb02cb87af2fe6b6` | 2958 |
| `quality-bar.json` | `9adf7435e7aa5272885634486cfdad610629d0d7e2949f3a84cc0772b557b89f` | 2500 |
| `command-plan.json` | `7456e901212b6528c912cd1d84686daaaa979c63c66abd2ffe21ed95fa374eb7` | 17639 |
| `correction-preview.patch` | `910f076883f247877845c32fd7b516275789004e145cb63f8112dbf2a53ba44f` | 7197 |
| `capture_command.py` | `d194857a341bff66af8c780a6b8da67833f3ddf3f1f60b52052e13854a08dad3` | 10407 |
| `inventory_semantic_check.py` | `a69fdd001ca1776a4a6de142e866e9105f5bd42504c2e5e8f51ed95836c79786` | 2804 |
| `sanitization_scan.py` | `8d2932726084fb6a0b5d785afaa7cb6bc901f2f2e15eac17a136b7407cb096ff` | 1049 |
| `validate_repair_patch.py` | `236cd4313e2637ed4d91ca46fe1ceecd8afbbd336ef9e15a5641d9a839cce605` | 4093 |
| `packet-validation.json` | `af9d6ea3f75fabf81b6e45d9a693745094d03202550c5921c46c0c660df2ab4c` | 2974 |
