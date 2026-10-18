# Tipos transitivos internos do exec-server

Leitor T1 de fontes no pin `8d9f6466ff0294785d56f55b1fe363d132fe4133`.
Os 137 tipos e 20 registros desconhecidos anteriores permanecem intactos;
este pacote acrescenta vínculos sem reescrever os inventários aceitos.

Os 11 símbolos internos iniciais expandem-se em **31 declarações**, incluindo
intermediários privados de codecs: 46 campos/payloads, 45 variantes e 68
referências de campos/aliases. Dezenove vínculos relacionam codecs com tipos
privados; 64 corpos de impls/helpers retêm defaults, conversões e validações.
As 20 referências históricas recebem vínculo a tipo selecionado ou ao contrato
externo de JSON/URL/UUID; a integração posterior autentica esses contratos.

Diferenças preservadas na fonte:

- `PermissionProfile` serializa um enum com tag e desserializa também formas
  legadas por `PermissionProfileDe`. No legado, rede omitida/falsa resulta em
  rede restrita; a forma canônica inclui variantes managed/disabled/external.
- `ManagedFileSystemPermissions` projeta entradas por um enum privado
  `SerializedManagedFileSystemPermissions`. `FileSystemPermissions` conserva
  formatos canônico e legado e suas conversões; derives de schema não
  substituem esses codecs.
- `FileSystemAccessMode::Deny` mantém o alias de entrada `none`;
  `FileSystemSpecialPath` preserva o alias `current_working_directory` e a
  representação de tokens futuros em `Unknown`.
- `NetworkDomainPermissions` serializa o mapa efetivo, com precedência
  `None < Allow < Deny` para padrões repetidos. A representação interna de
  entradas não é a forma serializada. Sockets usam mapa achatado e regras de
  caminho próprias do executor, ainda sem qualificação de plataforma.
- O campo de capability root possui desserializador próprio que tenta URI e
  depois a conversão de caminho legado. `AbsolutePathBuf` conserva o codec e
  contexto de base, sem executar o filesystem ou inferir gramática por nome.

Reprodução a partir da raiz:

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/exec-transitive/internal/reader.py --check
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/exec-transitive/internal/join_flows.py --check
```

Sem `--check`, o leitor grava somente inventory.json e verification.json desta
lane. Usa stdlib e o parser de auditoria anterior, autenticado por seu manifest;
nenhum módulo do alvo é importado. Cada fonte regular é comparada ao blob Git.
Geração dupla determinística e 15 negativos incluem alterações somente em
memória de alias serde, marcador de default e corpo do default legado. As
projeções desses três controles exigem mudança no conteúdo extraído, além de
digests de arquivo. Remover declaração/import ou introduzir cfg no import de
uma referência histórica falha sem emitir novo inventário.

O join conserva as 32 operações com donos/IDs do catálogo: 13 atingem os tipos
novos e 17 atravessam contratos externos. As quatro referências a Value do
transporte JSON-RPC têm disposição própria, além do alcance de payloads. O
payload Value de `initialized`, chamado builtin no vínculo histórico, recebe
agora limite explícito de biblioteca externa; o arquivo antigo é preservado.
Seis negativos do join rejeitam omissões de operação, dono, codec ou contrato.

O grafo cobre campos/aliases selecionados e intermediários serde do mesmo módulo.
Não é prova de callgraph arbitrário, compilação Cargo, cfg, macros, features,
enforcement, tipos genéricos em funções ou semântica de plataforma. Corpos
associados podem mencionar um tipo como entrada/saída de conversão, além do
receiver. A ausência de referências abertas neste recorte lexical não fecha
esses limites, os contratos externos, G01 ou a paridade funcional. Defaults
lexicais não concedem grant CVG nem provam nulabilidade/coerção/extra fields.

A primeira falha, por ausência do módulo de um owner no mapa, está preservada
em [first-internal-failure.txt](../first-internal-failure.txt). Os módulos foram
vinculados por manifests e imports reais; nenhum desconhecido foi removido por
uma busca global de nomes.
