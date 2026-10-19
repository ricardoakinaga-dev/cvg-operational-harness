# G01 — contratos de linguagem dos SDKs

Incremento T1 de fonte, não fechamento global de G01 ou paridade funcional.
[Contrato](contract.json), [recovery](recovery.json),
[integração](integration.json) e [verificação](verification.json).

- [Python](python/README.md): AST stdlib, 37 exports raiz, 63 candidatos
  históricos, 27 módulos, 1.542 declarações, 4.438 campos, 25 candidatos RPC
  (quatro dinâmicos), 85 registros de notificações e 216 corpos com tags
  lexicais de lifecycle. Declarações e tags não são funções qualificadas.
- [TypeScript](typescript/README.md): AST de sintaxe local 6.0.3 autenticada,
  dez módulos e 34 exports raiz vinculados a definições candidatas; 36
  funções/assinaturas, 129 campos e cinco grupos de regras de fonte. O
  analisador não executa o SDK nem substitui o compilador declarado pelo pin.
- [Referência e jornada nativa](reference/README.md): fatos CURRENT,
  proposta mínima PROPOSED e UNKNOWN explícitos. Rust 1.95.0, Cargo/lock/bin
  e três âncoras CVG documentados; nenhuma toolchain instalada ou compilação
  iniciada. G02/G03/G04 e seus gates continuam necessários.

Os 71 candidatos de export raiz têm dono da família SDK, sem inferência de
semântica de cada método por nome/proximidade. Joins Python preservam as
atribuições históricas e candidatos de escopo; as cinco regras TS apontam para
requisitos existentes. Tipos, campos, aliases, callbacks e suporte privado não
aumentam automaticamente o denominador funcional.

A integração preserva os dez pacotes anteriores: 460 payloads e dez manifestos
raiz, além do catálogo 487+22 e seus donos canônicos. O registro anterior
permanece imutável. Seis gaps SDK recebem progresso de fonte com status OPEN,
sem remover seus registros históricos. Cinco limites externos e 291
correlações privadas TUI permanecem abertos; detalhes privados são contexto,
enquanto resultados públicos continuam obrigatórios.

Diferença relevante: TypeScript usa JSONL headless com eventos pontuados;
Python usa RPC app-server. Sucesso num dialeto não qualifica o outro. Pydantic,
herança, geração, package artifacts, plataforma, Node/processo, cancelamento,
races, retries e efeitos exigem oráculos futuros. A contagem gerada Python
informada como 1.075 difere das 1.057 declarações de topo/1.061 incluindo
métodos observadas; a discrepância é preservada com dono, sem correção silenciosa.

## Verificação e limites

Os leitores possuem `--check` sem escrita. Rodar na raiz, nesta ordem:

```sh
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/sdk-language-contracts/python/reader.py --check
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/sdk-language-contracts/typescript/reader.mjs --check
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/sdk-language-contracts/reference/reader.py --check
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/sdk-language-contracts/integrate.py --check
```

Python entrega 34 controles de fonte, artefato, spans e manifesto. TypeScript
entrega dez mutações semânticas em memória (duas no corpus real), seis controles
de desigualdade do artefato e cinco controles de sintaxe. A integração tem
sete controles de desigualdade, não sete testes independentes de semântica.
Todos verificam o inventário; nenhum conta como teste funcional do Codex/CVG.
Falhas iniciais Python estão em [failures](python/failures.json); tentativas
Lead estão em [commands](lead-commands.json).

Próximo corte: auditoria de fechamento de escopo/variantes G01 e preparação
concreta da autenticação G02, com requisitos de acesso/containment e reuso G03.
Nenhum código nativo, aprovação futura, recibo funcional ou release foi concedido.
