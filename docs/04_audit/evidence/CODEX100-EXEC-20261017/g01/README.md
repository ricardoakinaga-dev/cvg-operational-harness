# DX100-G01 — expansão inicial do catálogo

O objetivo integral CODEX100 permanece ativo. Este incremento corrige omissões do inventário inicial; G01 e a qualificação funcional continuam abertos.

## Resultados

- Preservados os 401 registros iniciais: 379 funcionais e 22 controles, sem alteração dos campos normativos.
- Adicionadas 106 obrigações funcionais: 74 contratos app-server e 32 operações exec-server. Denominador candidato: 485 funcionais e 22 controles. Nenhum comprovante funcional adicionado.
- A fonte pinada declara 175 ClientRequests, 11 ServerRequests, 87 ServerNotifications e uma ClientNotification. O export experimental do executável instalado tem 172/11/85/1, totalizando 269 entradas.
- Os cinco contratos ausentes nesse export têm [disposição baseada em fonte](source-only-dispositions.json): três chamadas legadas possuem dispatch ativo; dois eventos internos exigem opção experimental. Permanecem obrigatórios. Tipos transitivos e comportamento executável ainda exigem provas.
- A [comparação posterior dos exports](entrypoints/exports/README.md) identificou exclusões deliberadas desses cinco contratos na geração JSON. Também encontrou 29 schemas estruturalmente diferentes entre pin e companheiro, com 423 idênticos. A matriz inicial mantém sua autoridade limitada ao companheiro; a reconciliação com tipos Rust e dados do pin é a próxima ação.
- A matriz corrigida reúne 10.911 registros de schema app-server e 4.617 de configuração, com referências recursivas explícitas. Inclui 186 obrigações de resposta e 30.707 registros de projeções das respostas. Três respostas legadas não têm schema exportado e permanecem abertas. As contagens não medem cobertura de comportamentos.
- Exec-server possui 32 constantes de operação em dialeto que omite o campo `jsonrpc`. Compatibilidade com o protocolo CVG depende de decisão e implementação próprias.
- Inventariados 162 manifests Cargo, 34 exports SDK, atributos CLI em 30 arquivos e fontes de ferramentas em 19 arquivos. Enumeração e contagens lexicais não fecham alcance público ou semântica.

## Artefatos e reprodução

Os scripts tratam a fonte como dados e escrevem evidência própria; o primeiro também atualiza o catálogo aditivamente.

```text
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/extract_contracts.py
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/review_source_only.py
node docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/inventory_sdk.mjs
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/inventory_entrypoints.py
```

[Contratos](protocol-source-inventory.json), [matriz inicial](variant-matrix.json), [exec-server](exec-server-contracts.json), [delta](catalog-delta.json) e [superfícies](surface-inventory-r2.json) preservam declarações e vínculos estruturais. Usos estáticos candidatos não provam execução. As disposições posteriores complementam a matriz inicial, sem reescrever sua origem.

A [primeira revisão independente](../review-r1.md) encontrou duas omissões P2: restrições/tipos aninhados e cobertura das respostas. Os inputs originais estão preservados em [review-r1-inputs](../review-r1-inputs). A versão corrigida conserva e percorre esses construtos e explicita resposta, emissor e pendências para todos os requests. A revalidação do incremento não equivale à revisão de todo G01.

A [revisão R2](../review-r2.md) aceitou o incremento corrigido e fechou os dois achados P2. Conferiu os inputs congelados e o catálogo, preservados antes da formatação. Seu aceite abrange apenas este incremento estático; CLI/SDK, paridade funcional, G01 completo e gates permanecem fora desse parecer.

[SDK](sdk-public-inventory.json) conserva exports, membros, campos, uniões e fontes usando o parser TypeScript local. [CLI](cli-attribute-inventory.json) preserva atributos sem inferir um grafo de comandos. [Ferramentas](tool-reachability-inventory.json) distingue registro, exposição e acesso efetivo; a resolução das cadeias ainda está pendente.

O [recorte posterior de grafos](entrypoints/README.md) liga os 30 comandos raiz da CLI a dispatch e 39 registros textuais de ferramentas a 36 implementações, preservando um registro exclusivo de teste. Ambos receberam revisão independente limitada ao recorte, com as demais relações e variantes explicitamente abertas. Os inventários iniciais continuam históricos de sua enumeração, sem promover seus itens a capacidade funcional comprovada.

A [matriz vinculada ao pin](pinned-variants/README.md) reconcilia as 29 diferenças por quatro grupos de fonte e conserva os 452 schemas públicos, configuração e dois payloads raw em representação sem perda. Após duas correções P2, recebeu [aceite independente do recorte](pinned-variants/review-r2.md): 34.400 posições, 6.002 referências, 274 contratos, 186 respostas e onze controles negativos rejeitados. Os dados do companheiro permanecem separados; o catálogo e a qualificação funcional não mudaram. A próxima ação é expandir os tipos e caminhos exec-server.

A [captura REA](rea-experimental-schema-generation.json) terminou com exit 0, sem truncamento. Usou ambiente isolado e gerou 452 schemas sem iniciar servidor ou chamar modelo. O manifesto identifica o launcher `env`; o hash do binário Codex é conferido separadamente. Os quatro [envelopes](reference) e o [índice](schema-snapshot-index.json) estão preservados. Fonte e binário ainda não têm vínculo autenticado.

A [primeira falha de extração](source-only-first-run-failure.txt) registra uma âncora ambígua rejeitada pelo script; a correção usa a guarda única dos eventos experimentais.

## Pendências de fechamento

Faltam payloads exec-server, tipos transitivos, resolução dos comandos/aliases/flags/cfg e suas plataformas, alcance dos componentes e ferramentas dinâmicas, oráculos por variante e revisão independente de todo G01. Não atribuir `PASS_CURRENT` com base em identidade, JSON ou hash.

O scout G03 localizou trabalho aproveitável, sem provar os sete pré-requisitos PAR da primeira jornada integrados e qualificados. O kit da SPEC0230 pertence a CLAUDE100-EXEC. Aprovações anteriores continuam restritas aos escopos efetivamente revisados.
