> Cópia de leitura: apenas links relativos foram redirecionados ao arquivo de evidências versionado. O relatório original byte-exato está no archive, com SHA-256 por arquivo no manifesto. Veredito e conteúdo técnico preservados.

# Revisão funcional independente — GATEWAY_FRESH_REVIEW_R9

**REJECT** no escopo funcional sintético do model-gateway. A revisão é válida na fronteira de conteúdo do packet. A colisão de chaves de circuito viola o requisito explícito de tuplas sem colisão. A emenda de admissibilidade de custo/identidade, os artefatos públicos e as regressões receberam ACCEPT nos respectivos escopos. Produção/release não foram avaliados.

## Finding único confirmado

**F01 · P2 — dois pares provider/model compartilham circuito.** `gateway.ts:421` e o JavaScript executado `dist/gateway.js:268` formam a chave por `provider.id + ':' + profile.model`. Os pares `['alpha','beta:gamma']` e `['alpha:beta','gamma']` geram `alpha:beta:gamma`. Com threshold1, a falha sintética do primeiro abre o circuito; a chamada saudável do segundo retorna `circuit_open`, com **zero chamadas ao segundo provider**. Isso permite interferência entre identidades distintas na falha, recuperação e admissão de probes.

Prova única: [observação pública congelada](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `final-frozen/public-probes.json`), caso `circuit-tuple-observation`; [reproducer dist-only](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `final-frozen/consumer/probe.mjs`), caso `circuit-tuple-collision`. A [recompilação privada](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `final-rebuilt/public-probes.json`) confirma a mesma falha, sem multiplicar findings. Correção indicada: serialização inequívoca da tupla e regressão com estes dois pares.

## Evidência executada

| Verificação | Resultado |
| --- | --- |
| Gateway original | 579 testes passaram em 26 arquivos |
| Shared original | 250 testes passaram em 17 arquivos |
| Produto original | 503 testes passaram em 24 arquivos |
| Total de regressões | **1332/1332**, zero pendentes; [JSON completo](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `regressions-runner-fixed.json`) |
| Probes próprios públicos | **38/39**; única falha F01; uma linha adicional é observação, não novo teste |
| HTTP real Node | OpenAI/Ollama, wire exato `color`, resposta igual/ausente aceita e contraditória recusada antes de normalizer/completed; sem authorization, `credentials:false`, loopback |
| Pricing inválido | input/output NaN, Infinity, negativo e ausência recusados antes de budget/provider; adapters reais também demonstram DNS/HTTP zero |
| Usage/cost | números inválidos/overflow recusados antes de normalização e publicação |
| Admission/fallback | mínimo dos tetos, máximo das estimativas, zero/menor/igual/maior/ausência; fallback recusa seu teto ou o request insuficiente, positivo conserva modelo efetivo |
| Cancel/retry/observer | pré-abort sem reserva/I/O; abort em voo conserva reserva; retry limitado; cancel na espera não inicia outra tentativa; exceptions de observer isoladas |
| Durabilidade | cinco processos Node distintos: primeiro0.6 admitido sob day1, quatro seguintes negados; reopen conserva gasto; falha de fsync no settlement impede completed e mantém lock/bytes incertos |
| Imutabilidade | prompt e tuplas de prompt, perfil/pricing e policy congelados; sete negativas readonly em declarations |
| Tipos | consumidores congelado e recompilado passam `strict:true`, `skipLibCheck:false`, sem paths/aliases de fonte |

[Probes congelados](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `final-frozen/public-probes.json`), [probes adicionais](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `final-frozen/extra-public-probes.json`), [probes recompilados](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `final-rebuilt/public-probes.json`). As cópias dos testes e fontes julgadas são byte-preservadas: [manifest](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `manifests/regression-source-identity.json`).

## Mesmo artefato e integridade

Inventário congelado SHA-256 `ea7bde1899a104ae50e256f524ecfb78d4f703e0f235d4b2bc768d6efaeb11e9`, sem divergência contra freeze. SPEC0180 e recibo da emenda têm digests coerentes: [inputs](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `manifests/authority-inputs.json`).

Os **33 JS e 33 source maps** da closure gateway/shared são byte-idênticos à recompilação privada. Das 33 declarations, seis mudam apenas ordenação de propriedades/unions; comparação de AST, com essas ordens normalizadas, é equivalente. Não se declarou igualdade bruta dessas declarations. O build privado desativa composite/incremental e não regenera tsbuildinfo. [Comparação completa](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `manifests/rebuild-comparison.json`).

Consumers físicos finais têm package manifests, dist público, JS/dts do zod e probes próprios; **nenhum diretório src, symlink ou hardlink**, sem tsconfig paths. [Manifest congelado](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `manifests/final-frozen-consumer.json`) e [recompilado](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `manifests/final-rebuilt-consumer.json`). Imports executam exports de dist. `--listFiles` dos typechecks está nos logs.

**Delta de source/vendor/dist/links/inodes: zero.** [Before](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `integrity-before.json`), [after](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `integrity-after.json`), [delta](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `integrity-delta.json`). Vendor copiado: 17346 arquivos, hashes idênticos=True; [comparação](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `manifests/vendor-copy-identity.json`). Todos os manifests de distribuição incluem JS, declarations, maps, metadata e identidades físicas.

## Observação não bloqueante

**O01:** cancelamento durante retry-wait retorna `cancelled`, uma chamada ao provider, e eventos `started`/`retry.scheduled`, sem `failed`. A espera em `gateway.ts:647` rejeita antes do emit terminal. [Prova](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `final-frozen/extra-public-probes.json`), caso `cancel-during-retry-wait`. A SPEC não exige explicitamente evento terminal nessa espera; não é fundamento adicional do REJECT.

## Tentativas, limitações e higiene

A primeira compilação falhou **TS2688** por typeRoots na configuração própria; a configuração do runner foi corrigida, sem editar fonte. A primeira regressão terminou **1319 pass / 13 fail**, causada pela cópia privada sem dist do gateway e sem lockfile. A recompilação privada e o lockfile byte-preservado resolveram essas dependências; a segunda regressão completa passou. [Resultado inicial](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `regressions.json`) foi conservado.

Consumers iniciais mantinham o src publicado do vendor zod, sem importá-lo; consumers finais o omitem e repetem probes/typechecks. Ambos os estágios permanecem preservados. A primeira comparação AST só normalizava propriedades; a segunda normaliza também unions, conservando logs e a versão inicial do comparador.

[Comandos, ambientes, exits e tempos](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `commands.jsonl`), [runner](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `run.py`), [setup](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `setup.py`), logs completos de build/test/typecheck em `logs/`. As inspeções anteriores ao runner estão no transcript desta sessão e em [ledger de inspeção](gateway-review-r9-reject-evidence.tar.gz) (arquivo interno `inspection-ledger.json`), com limitação explícita: seus stdout brutos completos não foram copiados ao filesystem.

Leituras explícitas de conteúdo ficaram no packet; nenhuma coordenação, Root AGENTS/skills, outro scratch ou parecer anterior foi usado. Hash/lstat de arquivos históricos serviram apenas ao manifest completo. Escritas ficaram em output. Ambiente dos subprocessos foi construído sem credenciais herdadas. Nenhum .env/key real, provider/dado real, PG, Docker, subagente, push ou release foi utilizado. HTTP próprio só loopback e sem authorization; a regressão original TLS usa certificado sintético gerado e pin loopback. Nenhuma cobertura global foi executada.

Não há trace/sandbox por syscall: resolução normal do runtime e validação do FileCostBudgetStore consultam metadados de diretórios ancestrais; nenhum conteúdo externo de documento/arquivo foi utilizado. As provas não qualificam falha física de energia/kernel, concorrência distribuída, operação real, PG/E2E, imagens ou CI remoto. Não concedem aprovação de produção.

Próxima ação: corrigir F01 em candidato autorizado e repetir revisão independente pública. Root e ledgers do projeto continuam sob responsabilidade do Lead; o estado desta revisão foi persistido exclusivamente em output.
