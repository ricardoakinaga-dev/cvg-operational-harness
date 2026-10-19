# Revisão independente — componentes

Mencius: **ACCEPT_BOUNDED_COMPONENT_SOURCE_CLASSIFICATION**. Parecer integral
preservado em [review-r1.raw.txt](review-r1.raw.txt); inputs em
[review-r1-inputs.json](review-r1-inputs.json). Agente encerrado; nenhum arquivo
foi alterado por ele. Aceite somente da classificação estática, sem fechar G01,
qualificar runtime ou conceder BUILD/release.

A revisão confirmou por fontes Git todos os 164 manifests Cargo/163 pacotes e
oito manifests não Cargo; comparou metadados/features/targets e 2.757 declarações
de dependência. Conferiu separadamente os 334 candidatos por diretório dentro
dos 527 registros, sem tratá-los como targets compilados. A conferência AST
independente cobriu 1.421 declarações Python e 4.431 campos/atribuições. A
amostragem manual incluiu o linter independente, exec/TUI, proc-macro, APIs
síncronas/assíncronas, modelos gerados, bootstrap, empacotamento e executor TS.

Os quatro leitores documentados passaram, com 45 controles negativos dos
geradores rejeitados e oito controles adicionais do crítico. Todos os24inputs e
o catálogo permaneceram intactos. Identidade de 681 blobs/20.505 ocorrências de
spans foi conferida; isso não representa inspeção semântica manual integral.

## Correção aditiva do achado P3

A nota `PY-ASYNC-OFFLOAD` do leitor/inventário congelado usa a expressão
imprecisa “shielded turn start”. A leitura correta da fonte é:

- `start_goal_operation` aguarda `asyncio.shield(asyncio.wrap_future(operation))`;
- `_start_turn` aguarda `asyncio.wrap_future(operation)` sem `shield` e, ao
  capturar cancelamento, registra callback que fecha a subscription retornada.

O [adendo com spans exatos](review-clarification.json) vincula essa correção ao
blob Git e aos hashes dos dois inputs revisados. A nota descritiva acima
substitui a frase imprecisa; os arquivos congelados e o parecer permanecem
byte-exatos. Nenhum comportamento de cancelamento é declarado funcionalmente
qualificado. GAP-PY-API/GAP-PY-RPC continuam obrigatórios OPEN.

Não houve achado bloqueante ou necessidade de retrabalho semântico. O próximo
recorte está em [next-exec-transitive-recon.json](../../next-exec-transitive-recon.json):
20 referências/14 símbolos, com 11 definições internas candidatas e três
contratos externos ainda abertos. As seis lacunas de SDK/RPC/distribuição,
parsers/cfg/TUI/plataformas/efeitos e G02/G03/G04 permanecem no caminho crítico.
