# G02 — ambiente da referência Rust

Preparação e instalação local de ferramentas para analisar/compilar a referência
pinada. Nenhum código Codex foi compilado ou executado nesta unidade; o motor
CVG e seus contratos públicos não foram alterados.

## Resultado observado

- [Preflight](preflight.json): quatro sondas confiáveis passaram em bubblewrap
  0.9.0: escrita própria, `/usr` somente leitura, sentinel externo inacessível
  e listener próprio do host inalcançável. Zero conexões e thread encerrada.
  Isso não certifica a sandbox pública CVG nem todos os limites do kernel.
- [Limites efetivos](resource-control-probe.json): o cgroup do kernel confirmou
  4 GiB, 128 tarefas e CPU equivalente a dois núcleos. Cada invocação de ferramenta
  repetiu essa guarda antes de entrar na contenção; tempo máximo de 300 s.
- [Manifesto](acquisition-metadata.json) Rust 1.95.0 e
  [archive principal](acquisition-download.json) autenticados por HTTPS e
  SHA-256 publicado. O archive tem197.584.988 bytes; não foi executado como pipe.
  [rust-src](rust-src-acquisition.json) foi adquirido separadamente do mesmo
  manifesto, pois o bundle não o inclui.
- [Inspeção](archive-inspection.json): 53.623 membros, sem path/tipo/link inseguro.
  Foram extraídos somente os componentes escolhidos e seus arquivos de suporte,
  com paths validados, diretório novo e cópia de arquivos regulares:2.498arquivos,
  689.100.062 bytes. [Inventário extraído](extracted-files.json).
- [Instalação](installation.json): prefixo exclusivo em
  `/tmp/cvg-codex100-exec-20261017/reference-environment/toolchain`, sob
  cgroup/bubblewrap, sem rede, configuração pessoal ou escrita global.
  `rustc 1.95.0` e `cargo 1.95.0` foram verificados dentro da contenção. Instalação
  inclui compiler, Cargo, std Linux x86_64, rustfmt, clippy e rust-src. PATH do
  host permaneceu inalterado.
- [Identidade instalada](toolchain-files.json): 2.480 entradas, seis componentes,
  binários requeridos presentes e árvore vinculada por SHA-256. Os dois
  instaladores oficiais diferem apenas no texto de sucesso; os argumentos
  definiram prefixo e todos os diretórios de destino privados e desabilitaram
  `ldconfig`.
- [Recursos encerrados](resource-cleanup.json): cinco scopes próprios inativos,
  nenhuma sessão executora viva, nenhum container iniciado ou imagem baixada.
  Docker foi consultado somente por metadata; imagem Rust solicitada não estava
  no cache. `image inspect` exit 1 é esse resultado, não falha de compilação.

## Fronteira de execução

[Contrato inicial](contract.json), [aquisição](acquisition-contract.json) e
[suplemento/instalação](component-acquisition-contract.json) precederam suas
ações. O instalador oficial foi lido e autenticado antes da execução confinada.
Nenhum provider, conta, modelo, dado real, serviço de produto, lockfile CVG,
contrato público, commit, push ou deploy foi usado/alterado.

Os manifestos registram autenticação HTTPS/hash, não atestação independente da
OpenAI ou reprodução bit a bit de um binário Codex. A referência executável
continua OPEN_G02 até sua compilação/vínculo e oráculos reais. A disponibilidade
das ferramentas não qualifica funções ou reduz o alvo integral.

## Próximo corte

[Recon de build](source-build-recon.json): fonte 8d9f6466 limpa e seis insumos
atestados contra Git; 1.473 entradas no lock (1.293 registry, 18 git, 162 path), oito
fontes Git pinadas. Esses números são dependências resolvidas, não funções ou
censo de todos os pacotes.

Registrar contrato próprio de cópia física, cache/vendor, aquisição autenticada
de dependências e compilação offline contida, com limites de memória/CPU/pids,
tempo e disco. Não executar build scripts antes desse contrato. Preservar
toolchain read-only, lock/pin e logs; ligar artefato/config/features/linker à
fonte e manter demais plataformas/capacidades pendentes. O binário de referência
não será o motor de produção do harness.

G01 global, os 54 eixos sem cenário, reuso G03, SPEC nativa G04 e gates T3/T4 continuam
necessários. Todos os recibos funcionais permanecem nulos.

## Verificação desta unidade

[Treze checks do Lead](verification.json) passaram: contratos, guards/limites,
manifesto/archives, instaladores/logs, arquivos extraídos/instalados, recursos
encerrados, fonte pinada e doze pacotes anteriores. As dezesseis checagens
documentais do programa também passaram. Esse resultado é autocheck de setup,
não revisão independente do executável Codex ou qualificação funcional.

Revalidar somente leitura, sem reinstalar ou executar ferramentas/target:

```sh
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/reference-environment/verify.py --check
```

[Observações das tentativas](observed-attempts.json) distinguem indisponibilidade
do leitor web de sucesso HTTP, cache Docker ausente e diferença esperada entre
mensagens dos instaladores. Nenhuma tentativa upstream foi iniciada.
