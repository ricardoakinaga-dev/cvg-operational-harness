# Recon estático da futura captura nativa

Unidade documental, sem BUILD ou execução de driver. Não qualifica a referência,
M1 ou qualquer requisito funcional.

O artefato instalado2.1.302 conserva SHA-256
`60d7eb7f12fbb28a52533fe8be5884097403562aa02dc73991a021c7067e29a5`.
A leitura suplementar dos mesmos bytes encontrou nomes de configuração de URL,
API key e modo simples, inclusive oito ocorrências literais de
`process.env.ANTHROPIC_BASE_URL`. Os offsets, trechos limitados e seus hashes
estão nos JSONs deste diretório. Presença de texto ou código empacotado não
prova execução do ramo, protocolo aceito ou ausência de outras chamadas.

A ajuda já capturada pelo REA declara `--bare`, autenticação explícita e redução
de descoberta/prefetch. Isso continua declaração observada; não é prova de
contenção. As três ocorrências de `keyless` encontradas nos bytes tratam de
atestações remotas e não estabelecem uma API local sem conta.

O MCP REA foi consultado sem abrir alvo ou executar processo. Ghidra/IDA não
estão configurados e Hopper está ausente. Nenhum engine foi instalado ou
configuração alterada. Os scans de bytes são complemento Python, sem atribuição
indevida de descompilação ao MCP.

Uma hipótese a especificar é executar o cliente nativo contra um endpoint
Anthropic sintético local, com mensagens controladas, para observar o loop e as
ferramentas reais do cliente. Isso poderia medir comportamentos do harness sob
respostas controladas; não mediria qualidade de um modelo real. A hipótese ainda
precisa demonstrar que a porta existe e funciona na build pinada.

Antes desse ensaio, um contrato próprio precisa congelar:

- Binário/driver/config/fixture por hash, argumentos finitos e env allowlist;
  HOME, config e workspace sintéticos, sem herdar credenciais ou perfis reais.
- Contenção efetiva de rede/filesystem/processos, limites de tempo/bytes/filhos,
  cleanup e falhas; flags de configuração sozinhas não substituem essa prova.
- Protocolo nativo realmente observado, endpoints locais fechados e mensagens
  sintéticas de entrada/saída, sem upstream, modelo, conta ou token real.
- Captura bruta de requests, eventos, execução, efeitos e estado; receipt e
  índice do coletor separados da fixture e conferidos pelo Lead.
- Regra e adapter de cenário aprovados. Formatos nativos incompatíveis com CVG
  não passam pela SPEC0229 atual, que só aceita igualdade de documentos completos
  ou bytes. Nova projeção requer seu próprio contrato e gate.

A aprovação do mecanismo0229 permanece limitada àquele comparador. Este recon
não autoriza iniciar um cliente com modelo, instrumentar M1, criar novas
projeções, usar contas remotas ou produzir uma atestação funcional.
