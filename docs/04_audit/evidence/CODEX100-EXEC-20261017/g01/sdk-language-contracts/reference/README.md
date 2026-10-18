# Referência executável e primeira jornada nativa

Preparação T1, anterior à SPEC e aos BUILD G02/G04. Os comandos abaixo são uma
receita proposta, não um histórico de execução nem uma autorização.
[Inventário](inventory.json) e [leitor](reader.py) fixam os insumos de fonte e
três fatos do CVG. Nenhum compilador, SDK, build hook ou binário alvo foi executado.

## CURRENT

- O pin Rust declara 1.95.0, com clippy/rustfmt/rust-src. O pacote `codex-cli`
  declara o binário `codex` em `src/main.rs` e possui `build.rs`.
- O SDK Python declara `openai-codex-cli-bin==0.153.4`; o companheiro instalado
  anteriormente inspecionado declara 0.163.0. Versão, manifesto, help e schema
  não autenticam vínculo entre esses artefatos e o pin. G02 continua aberto.
- Na observação local desta rodada, `rustc`, `cargo`, `rustup` e `clang` não
  estavam no PATH; havia `bwrap`, `unshare`, `cc` e `pkg-config`. Presença do
  executável não prova isolamento disponível ou dependência suficiente.
- O servidor SDK CVG seleciona `single_pass`; `ModelGateway` oferece
  `complete(request): Promise<ModelResult>`. A composição iterativa depende de
  `iterativeOrchestrator` e `stepStore`. Isso não prova stream incremental,
  loop de ferramentas, cancelamento e retomada pela superfície SDK pública.
- Dez pacotes anteriores e seus desconhecidos permanecem preservados.
  Identificação de fonte não equivale a observação de comportamento.

## PROPOSED: G02

1. Abrir claim exclusivo de referência em snapshot físico do pin; reservar
   diretórios de toolchain, cache, dependências, build, logs e artefatos sem
   reutilizar recursos dos programas HISO/Claude/PAR. Registrar target triple,
   SO, arquitetura, linker, bibliotecas nativas, features e perfil exatos.
2. Preparar Rust 1.95.0 e dependências autenticadas pelo `Cargo.lock` sob uma
   task própria. Registrar origens e hashes, inclusive dependências Git e
   ferramentas de build. Instalação e download não ocorreram nesta rodada.
3. Separar aquisição de dependências do build. Compilar sem credenciais,
   configuração pessoal ou rede, em contenção validada com negativos reais
   de filesystem/processo/rede. Build scripts são código não confiável;
   `--locked` sozinho não fornece essa contenção.
4. Dentro do snapshot e ambiente isolados, candidato de comando:
   `cargo +1.95.0 build --locked --offline --release -p codex-cli --bin codex`.
   Flags/features/target e dependências precisam ser validados antes da
   execução; esta linha não atesta que o build funciona nesta estação.
5. Selar fonte, lock, configuração Cargo, toolchain, compilador/linker,
   ambiente permitido, logs e artefato por hash. Manter o companheiro instalado
   como identidade separada. A referência executável é a saída autenticada
   dessa receita, nunca um binário escolhido pelo nome no PATH.
6. Executar referência em fixtures sintéticas controladas. O servidor modelo
   pode controlar respostas do provider; eventos, erros e efeitos observados
   devem vir da referência real. Falso transcript fabricado não é oráculo.
   Comparar os dialetos TypeScript JSONL e Python app-server separadamente.

## PROPOSED: primeira jornada G04

O corte mínimo usa a composição iterativa, o armazenamento de passos e o
journal existentes. Uma porta incremental deve fornecer chunks reais antes do
evento final. O runtime nativo governa tool calls, reinjeta resultados e emite
eventos ordenados. Não introduzir broker, serviço separado ou Saga sem um
requisito que justifique essa fronteira.

Invariantes propostas para a futura SPEC:

- Contexto confiável de tenant/identidade e policy precede cada efeito; a
  entrada pública não escolhe grant, perfil privilegiado ou binding de retomada.
- Persistência de checkpoint e identidade idempotente precedem o despacho de
  efeito; tentativa duplicada não duplica o efeito. Resultado externo incerto
  interrompe e exige reconciliação ou handoff, sem retry cego.
- Cancelamento, deadline e orçamento atravessam stream, tool e retomada.
  Cancelamento concorrente com conclusão tem ordem persistida e observável.
- Retomada em processo novo usa estado durável com controle de concorrência;
  não depende de memória do processo anterior. Eventos e cursor pertencem à
  execução/tenant autenticados, com regra explícita de replay.
- Falha parcial de stream não fabrica sucesso final. Chunks derivados de uma
  resposta já completa não comprovam streaming. Referência Codex e candidato
  CVG são processos distintos; o candidato implementa o motor nativamente.

## UNKNOWN e gates

G01 ainda precisa consolidar variantes obrigatórias sem transformar tipos
privados em exigência de ABI Rust. G02 precisa de recursos/receita/proveniência
executada. G03 precisa de aceite próprio do reuso físico. G04 depende dos três.
Contrato de eventos públicos, cursor/replay, cancelamento versus conclusão,
limites de buffering, schema do journal e política de retomada ainda precisam
de SPEC concreta e revisão. Alterações públicas, de schema, identidade e policy
são T3: a constituição exige revisão explícita do usuário antes do BUILD.
Esta preparação não substitui esse gate, não concede release e não autoriza
efeitos reais. Todos os oráculos funcionais permanecem `NOT_RUN`.

Reproduzir somente a observação estática, sem escrever:

```sh
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/sdk-language-contracts/reference/reader.py --check
```
