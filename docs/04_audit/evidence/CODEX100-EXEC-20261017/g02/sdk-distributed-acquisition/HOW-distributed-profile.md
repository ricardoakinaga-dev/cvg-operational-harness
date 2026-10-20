# Perfil distribuído do SDK (DX100-G02) — HOW depois da aquisição 0.153.4

Este documento diz o que a aquisição deixou disponível e como deve ser a próxima unidade:
a SPECIFY do perfil distribuído em modo keyless. É proposta. Não registra execução de
nenhum binário e não concede BUILD. As 509 obrigações do catálogo seguem `NOT_RUN`.

## Decisões que valem

As respostas às perguntas Q1–Q5 estão na
[decisão do usuário](../sdk-batch-2b2-binding/user-decision-distributed-profile-20261019.json):

- **Q1:** a release 0.153.4 do Codex é um pin próprio do perfil distribuído. Não há prova
  de vínculo de build com o pin de fonte `8d9f6466`. Todo resultado deste perfil
  carrega a declaração `NO_BUILD_LINK_DECLARED`.
- **Q2:** uma única aquisição com rede, só da lista do Codex. Ela foi feita
  ([plano](acquisition-plan.json), [registro](acquisition-ledger.json)).
- **Q3:** só keyless. O Codex CLI publicado roda sem rede, sem provider e sem
  credencial. Login real e chamadas a modelo ficam para um gate T4 separado.
- **Q4:** capability nova negada. O término do filho pré-abortado do TS12 segue aberto.
- **Q5:** não autorizada. Outras versões de pydantic e de Node não entram.

## O que a aquisição deixou no cache

Os artefatos ficam no cache privado `/mnt/dados/cvg-work/cvg-codex100-distributed-cache-20261019`,
fora de `docs/`. A [conferência independente](digest-verification.json) recalculou cada
digest; os [metadados](artifact-metadata.json) foram lidos só como dados.

| Item | Artefato                                                                  | Digest conferido contra                                     | Resultado     |
| ---- | ------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------- |
| A1   | wheel `openai-codex-cli-bin` 0.153.4, `manylinux_2_17_x86_64`             | sha256 e tamanho do `uv.lock` do pin (e PyPI, como cruzada) | DIGEST_OK     |
| A2   | `@openai/codex` 0.153.4                                                   | integrity sha512 e shasum do registro npm                   | DIGEST_OK     |
| A3   | `@openai/codex-linux-x64` = `npm:@openai/codex@0.153.4-linux-x64`         | integrity sha512 e shasum do registro npm                   | DIGEST_OK     |
| A4   | `@openai/codex-responses-api-proxy` 0.153.4                               | integrity sha512 e shasum do registro npm                   | DIGEST_OK     |
| A5   | asset `codex-package-x86_64-unknown-linux-musl.tar.gz` de `rust-v0.153.4` | sha256 publicado pela release (assets[].digest)             | DIGEST_OK     |
| A6   | `openai-codex` 0.153.4 no PyPI                                            | —                                                           | NOT_AVAILABLE |
| A7   | `@openai/codex-sdk` 0.153.4                                               | integrity sha512 e shasum do registro npm                   | DIGEST_OK     |

Fatos que mudam o desenho da próxima unidade:

- **A6 não existe.** O PyPI devolve 404 para `openai-codex` 0.153.4, e nenhuma outra
  versão foi buscada. O SDK Python do perfil distribuído fica sendo a fonte do pin
  (versão `0.0.0-dev`) com o runtime `openai-codex-cli-bin` 0.153.4, que é o que o
  `uv.lock` prescreve. A identidade de um pacote `openai-codex` publicado fica fora do
  PY19.
- **`@openai/codex-linux-x64` é alias.** Não existe pacote npm próprio com esse nome
  (404). O manifesto de `@openai/codex@0.153.4` declara o alias
  `npm:@openai/codex@0.153.4-linux-x64`, e foi isso que se adquiriu.
- **Os mesmos binários nos três canais.** `bin/codex`, `codex-code-mode-host`, `rg`,
  `bwrap`, `zsh` e `codex-package.json` têm o mesmo sha256 no wheel (A1), no pacote npm
  de plataforma (A3) e no asset da release (A5). O `codex` é
  `56ef98ab4032d317ab26e9b5e5a175650717351edb16ed9cde0cb6d1734d62da`, diferente do
  executável compilado do pin atestado em
  [g02-reference-acceptance.json](../../g02-reference-acceptance.json).
- **O pacote traz `bwrap` próprio** em `codex-resources/`. O harness segue usando o
  `bwrap` do host para a contenção.

## Próxima unidade: SPECIFY do perfil distribuído keyless

Nome proposto: `DX100-G02:SPECIFY-SDK-DISTRIBUTED-PROFILE-KEYLESS`, T1 documental, sem
rede. Contratos: PY19, PY20 e PK01 a PK09, que estão `OPEN_REQUIRED_FUTURE_PROFILE` no
[v5](../sdk-batch-2b2-binding/coverage-observed-v5.json), e o ramo empacotado do PY02,
que é um braço aberto de um contrato já `OBSERVED_CLIENT_PARTIAL`.

Regras de execução que a SPECIFY deve congelar:

- só artefatos do cache, ligados por sha256 ao
  [registro da aquisição](acquisition-ledger.json); nenhum download novo;
- execução dentro da contenção admitida (bwrap com `--unshare-all`, o que inclui o
  namespace de rede, e tmpfs em `/work`), nunca no host; sem provider, sem credencial,
  sem variável de chave;
- o cache da aquisição é só leitura; o staging dos pacotes, feito por leitura dos
  arquivos compactados, vai para um diretório de trabalho em `/mnt/dados/cvg-work`,
  fora de `docs/`, ligado por sha256 aos membros de
  [artifact-metadata.json](artifact-metadata.json), sem `npm install`, `pip install` nem
  instalação global; a SPECIFY declara esse staging como mecanismo e o justifica;
- o wheel escolhido é o `manylinux_2_17_x86_64`, porque o host é x86_64 com
  `ldd (Ubuntu GLIBC 2.39-0ubuntu8.9) 2.39` e CPython 3.12.3 (observado em
  19/10/2026 nesta unidade);
- todo resultado carrega `NO_BUILD_LINK_DECLARED`;
- só linux-x64; as outras plataformas e a chave PATH do Windows seguem como limite.

O que cada contrato pode observar keyless, para a SPECIFY detalhar:

| Contrato | Observável keyless com o cache                                                                                         | Fica fora                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PY19     | `codex_bin` explícito ausente e presente; `codex_cli_bin` com `codex-package.json` e `bin/codex` do A1                 | identidade de um `openai-codex` publicado (A6 não existe)                                                                                                                                         |
| PY20     | mapeamento de plataforma para linux-x64; reaproveitamento de runtime instalado igual; tag do wheel do A1               | download do bootstrap pela rede; um servidor de loopback que imite o GitHub, mesmo só no namespace da execução, substitui a rede e vai como pergunta ao usuário (Q3), não como escolha da SPECIFY |
| PY02     | ramo empacotado: argv com `--config` e `app-server --listen stdio://`, prefixo de PATH do pacote, `initialize` keyless | PATH no Windows; filho lento real sem modelo                                                                                                                                                      |
| PK01     | triple `x86_64-unknown-linux-musl` e pacote de plataforma no host                                                      | as outras cinco plataformas                                                                                                                                                                       |
| PK02     | resolvedor do SDK TS com o layout novo do A3 (`vendor/<triple>/bin/codex` e `codex-package.json`)                      | layout legado sem artefato                                                                                                                                                                        |
| PK03     | prefixo de PATH com os `pathDirs` existentes do pacote                                                                 | chave PATH do Windows                                                                                                                                                                             |
| PK04     | wrapper `bin/codex.js` do A2 com o vendor do A3, e o erro de dependência opcional ausente                              | dicas de outros gerenciadores além do detectado                                                                                                                                                   |
| PK05     | detecção do gerenciador com a árvore montada (sem marcadores, npm)                                                     | pnpm, vite-plus e bun reais                                                                                                                                                                       |
| PK06     | env gerenciado, repasse de sinal e saída do filho pelo wrapper                                                         | —                                                                                                                                                                                                 |
| PK07     | caminho do proxy para linux-x64 no A4                                                                                  | outras plataformas                                                                                                                                                                                |
| PK08     | lançamento do proxy e repasse de sinal sem chave (só o erro ou a espera de configuração)                               | proxy com chave real e encaminhamento ao provider (gate T4)                                                                                                                                       |
| PK09     | declarações dos manifestos 0.153.4 (A2, A3, A4, A7) contra a fonte `0.0.0-dev`                                         | equivalência de build com o pin                                                                                                                                                                   |

Fora desta SPECIFY, com o motivo:

- bundle, typecheck e declarações do SDK TypeScript publicado: unidade posterior do
  perfil distribuído;
- braços de "CLI real" do v5 (PY01, PY05, PY06, PY08, PY09, PY11, PY13, PY14, TS05, TS09
  e TS12): unidade posterior do perfil distribuído; os que pedem turn real ou chamada a
  modelo vão ao gate T4 separado;
- PY18 com outras versões da pydantic e TS12 com outras versões de Node: bloqueados
  pela Q5, não autorizada;
- término do filho pré-abortado do TS12: bloqueado pela Q4 (capability negada).

## Ordem proposta

1. SPECIFY do perfil distribuído keyless (T1, sem rede), com sub-lotes se passar de 24
   vagas ou 12 serviços.
2. IMPLEMENT-AND-ADMIT do perfil, com os binários do cache só dentro da contenção.
3. BIND do perfil distribuído (mapa v6 ou seguinte).

## Limites

Observação de cliente não é paridade: recibos funcionais e crédito de paridade seguem
em 0. Nenhum binário foi executado nesta unidade. O BUILD nativo segue fora desta
trilha.
