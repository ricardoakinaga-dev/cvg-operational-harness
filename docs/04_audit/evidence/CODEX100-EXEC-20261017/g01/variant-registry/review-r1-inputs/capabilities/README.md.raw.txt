# Complemento dos 179 requisitos genéricos

Unidade T1 do [contrato pai](../contract.json), sem mudança do catálogo normativo.
O [leitor](reader.py) usa [regras explícitas](rules.txt) para vincular os 179 IDs
históricos a candidatos de contrato, comando, config, handler, idioma e suporte.
O [inventário](inventory.json) conserva cada objeto original por input,
JSONpointer RFC6901 e digest de JSON canônico. A [verificação](verification.json)
registra determinismo e negativos. Os objetos do catálogo continuam byte a byte
iguais; estes registros os complementam.

Cada regra tem oito colunas: ID, seletores de método RPC, variantes slash,
variantes CLI raiz, chaves de config, handlers, funções do arquivo semente e
dimensões de oráculo propostas. Globs são explícitos e case-sensitive; não há
busca aproximada por título, nome ou path. Seleção de método não transforma seu
owner de protocolo no owner de domínio. As ligações anteriores de idioma,
factories, TUI e exec-server são preservadas com suas limitações.

São 1.829 ligações candidatas, 124 ocorrências de corpos de função semente e
976 dimensões propostas de oráculos, distribuídas pelas 22 famílias. Zero
seletores ficaram sem correspondência. Isso comprova que as regras resolvem
objetos de fonte; não comprova que o objeto cobre toda a semântica do requisito.
Todos os 179 registros conservam `source_closure: OPEN...`, `NOT_RUN` e recibo
nulo. As dimensões são propostas a congelar na referência autenticada e na SPEC;
não são gramática observada, resultados esperados fabricados ou testes passados.

Metadados de pacote são suporte de distribuição, não funções públicas. Funções
semente podem ser privadas, defaults de trait ou testes. O [recon](source-recon.json)
não interpreta ausência de função no `lib.rs` como ausência de capacidade: vários
crates reexportam implementações. Escopo público completo e relações de efeito
continuam sujeitos a aceite específico. As seis lacunas SDK e os demais limites
herdados não são fechados por essas ligações.

Reprodução somente leitura:

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/variant-registry/capabilities/reader.py --check
```

O leitor usa stdlib, Git e um helper de auditoria aceito/autenticado do pacote
TUI; não importa o alvo. As 22 fontes semente são conferidas contra blobs Git do
pin. Duas reconstruções devem coincidir; seis negativos de artefato e seis
mutações semânticas em memória verificam payload RPC, cfg CLI, alias slash,
binding Python, dimensão de oráculo e seleção de função além de mudanças de hash.
A [primeira falha de validação de colunas](first-rules-disposition.json) e seu
[input exato](rules-first-input.txt) permanecem como evidência de preparação.

O manifesto estrito será validado pelo integrador pai. Nenhum BUILD, execução de
modelo, provider, conta, terminal, efeito externo, gate de aplicação, paridade
funcional, fechamento de G01 ou release foi concedido.
