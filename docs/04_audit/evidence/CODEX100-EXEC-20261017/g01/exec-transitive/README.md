# G01 — tipos transitivos do exec-server

Unidade T1 `DX100-G01:RESOLVE-EXEC-TRANSITIVE-TYPES`, fonte pinada em
`8d9f6466ff0294785d56f55b1fe363d132fe4133`. O catálogo permanece em
487 obrigações funcionais e 22 controles, sem recibos funcionais. G01 e a
implementação nativa integral continuam em andamento.

Os 137 tipos, 32 operações e 20 referências desconhecidas do pacote anterior
permanecem intactos. Os vínculos desta unidade são aditivos: 14 referências
históricas apontam a definições internas, e seis apontam aos três contratos
externos JSON/URL/UUID. Nenhuma referência é removida para aparentar fechamento.

O [grafo interno](internal/README.md) acrescenta 31 declarações, incluindo
intermediários privados serde, 46 campos/payloads, 45 variantes, 68 arestas de
campo/alias, 19 vínculos a intermediários e 64 corpos de impls/helpers. Não há
nome de campo/alias sem disposição neste recorte lexical. Isso não fecha o
callgraph arbitrário, cfg/macros/features, compilação ou comportamento em runtime.

O join conserva 168 tipos selecionados e os donos das 32 operações. Treze
operações atingem tipos novos; 17 alcançam um contrato externo. Quatro vínculos
Value pertencem ao transporte JSON-RPC compartilhado; CapabilityRootLocation
fica explicitamente preservado fora do alcance dos payloads do grafo atual.
O Value de `initialized`, descrito como builtin no inventário histórico,
recebe disposição aditiva de contrato externo, mantendo o arquivo anterior.

A [frente externa](external/README.md) vincula as versões declaradas pelo
Cargo.lock — serde_json1.0.149, url2.5.8 e uuid1.20.0 — aos seus arquivos de
fonte, features declaradas e codecs usados localmente. O contrato permite
somente leitura de três archives oficiais static.crates.io, autenticados pelo
SHA-256 do lock antes de inspecionar membros regulares. Nenhuma crate é
extraída automaticamente, instalada, importada ou executada. Leitores de
verificação funcionam offline; a autenticidade dos bytes não qualifica a
semântica de serialização ou a resolução Cargo.

Diferenças que precisam chegar à implementação e aos futuros oráculos:

- PermissionProfile aceita representações canônica e legada; managed filesystem
  usa tipos privados de serialização. Defaults do legado, formatos de caminho,
  aliases e tags não podem ser inferidos apenas dos schemas públicos.
- O mapa efetivo de permissões de domínio possui precedência para duplicatas;
  a estrutura interna de entradas difere da forma serializada.
- JSON possui limites numéricos, wrappers e branches de features; URLs e UUIDs
  possuem parse/codec próprios. PathUri impõe regras adicionais de URI de arquivo
  e contexto/plataforma. Gramática, erros e limites continuam sujeitos a provas.
- Descrever ou aceitar um pedido Codex de bypass não concede autorização CVG.
  O harness mantém policy, approval, containment e journal antes do efeito.

Os contratos de aceitação estão em [contract.json](contract.json) e
[external-contract.json](external-contract.json). A evidência e o parecer de
revisão ficam neste pacote; source checks não são recibos de equivalência.

Reprodução offline a partir da raiz:

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/exec-transitive/internal/reader.py --check
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/exec-transitive/internal/join_flows.py --check
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/exec-transitive/external/reader.py --check
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/exec-transitive/integrate.py --check
```

A integração autentica os manifests das duas frentes, os três archives contra
o Cargo.lock, os vínculos aos 20 registros históricos, 582 spans internos e a
preservação de 244 arquivos nos seis pacotes anteriores. A frente externa
confere 2.677 spans, 24 membros selecionados e 246 declarações locais de
features/dependências; não calcula ativação de features. Os 68 negativos dos
leitores/join/integração são controles da evidência, nunca testes do runtime.

Permanecem obrigatórias as seis lacunas de linguagem/SDK/RPC/distribuição do
[recorte de componentes](../component-surfaces/review-r1.md), parsers escalares,
cfg/TUI, plataformas/efeitos, autenticação da referência G02, aceite de reuso G03
e primeira SPEC G04 antes do BUILD dependente. Paridade literal e equivalências
de governança continuam separadas.
