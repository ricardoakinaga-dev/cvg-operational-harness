# REM21-017 — DISCOVERY

Data: 2026-09-22  
Finding: `A21-F19`, `A21-F22`, `A21-F23`, `A21-F26`  
Origem: `AUD20-017`, consolidada em
`docs/04_audit/0566_comprehensive_repository_audit_2026-09-21.md`  
Escopo: local, sintético, descartável; produção permanece `NO_GO`.

## Achados confirmados

O checker `scripts/check-doc-links.mjs` só escaneia um subconjunto de
documentação definido no package script e trata `arquivo:linha` como nome de
arquivo literal. No scan completo de `docs`, o RED reproduz `43` quebrados:
`41` são falsos positivos de localização e `2` são links relativos realmente
incorretos em `docs/04_audit/evidence/PROD-20260913/PROD-04/report.md`. O mesmo
scan encontra `12` referências absolutas; onze apontam para arquivos do próprio
checkout e uma aponta para uma skill fora do repositório.

O parser deve reconhecer fragmento `#anchor` e sufixo `:linha` como metadados de
localização, validar a existência do alvo sem incluir a linha no caminho e
continuar classificando caminhos absolutos como não portáteis. O package script
deve executar o scan completo de `README.md` e `docs`, incluindo a evidência
AUD/PROD histórica; a saída deve distinguir `broken` de
`nonPortableAbsolute` e falhar apenas por absolutos não classificados. Os doze
absolutos conhecidos ficam em uma allowlist explícita: onze pertencem ao
`critic-security.md` hash-bound e um ao relatório 0562 histórico com referência
de manifesto anterior; ambos são preservados byte-for-byte nesta rodada.

O inventário de evidência contém `66` arquivos vazios, dos quais `37` são
logs. O artefato histórico
`docs/04_audit/evidence/AAA/AAA-07/rework-fencing-c6/probe-after.json` tem zero
bytes; o stderr e o exit `1` preservam a falha de captura, mas o JSON não
parseia. Não é permitido fabricar o evento. A solução deve preservar o vazio
e registrar um catálogo/sidecar explícito com status, comando, exit code,
timestamp, ambiente e razão, usando `null` quando o histórico não fornece o
valor.

## Slices escolhidos

1. **Parser e cobertura do checker** — extrair o parsing de localização para
   uma função local testável, remover `:linha` do caminho apenas depois de
   reconhecer o sufixo numérico, e mudar o script para o escopo completo.
2. **Portabilidade documental** — corrigir os dois links relativos reais e
   classificar os doze absolutos históricos em uma allowlist verificável; não
   reescrever `critic-security.md` nem o relatório 0562, pois seus bytes são
   hash-bound. Referências novas ou não catalogadas continuam bloqueando o
   checker.
3. **Higiene de evidência** — adicionar um catálogo JSON central para todos os
   arquivos vazios históricos, validar JSONs não vazios, exigir registro para
   cada vazio e registrar explicitamente `capture_missing` quando a captura não
   permite inferir sucesso.
4. **Índice curto** — adicionar um índice derivado e pequeno para os masters
   `runtime state`, `execution log` e `backlog`, sem reescrever ou remover o
   histórico append-only. O índice aponta para a entrada corrente e para os
   diretórios de evidência, mas não vira uma segunda fonte mutável de status.

## Fora de escopo

- não alterar os 26 achados por inferência nem reescrever o histórico AUD20;
- não reescrever artefatos históricos hash-bound para remover referências
  absolutas; a política deve torná-las explícitas e detectáveis;
- não fabricar saída para o probe vazio, nem marcar captura ausente como PASS;
- não corrigir `A21-F24`/`A21-F25`, que pertencem ao `REM21-018`;
- não liberar produção, conectar serviços externos, usar dados reais ou tocar
  ações clínicas, financeiras, de prontuário ou consultas;
- não transformar referências absolutas externas à máquina em alegações de
  portabilidade; elas devem ser texto explícito ou permanecer classificadas
  como externas, nunca quebrados internos.

## Critério RED/GREEN

O RED é o log desta pasta: o scan completo falha com `43/12`, o JSON histórico
falha ao parsear e não existe catálogo de vazios. O GREEN deve mostrar zero
quebrados internos, zero absolutos não classificados, doze absolutos históricos
com `policy=historical-preserved`, todos os JSONs não vazios parseáveis e todos
os vazios cobertos por metadado explícito. Fixtures positivas e negativas devem
cobrir `:linha`, fragmento, caminho quebrado, absoluto não portátil, JSON vazio
e log vazio sem catálogo.

## Gate de saída

Discovery confirma o finding, limita o BUILD aos quatro slices e preserva a
fonte mutável de cada ledger. PRD e SPEC devem congelar o schema do catálogo,
o contrato de saída do checker, o escopo do índice e os comandos de fixture
antes de implementar.
