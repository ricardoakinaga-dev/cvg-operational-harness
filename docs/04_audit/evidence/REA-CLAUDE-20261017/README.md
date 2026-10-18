# Evidências — REA-CLAUDE-20261017

Análise T1 do Operational Harness e das funcionalidades aproveitáveis do Claude Code. [Relatório 0618](../../0618_claude_code_capabilities_2026-10-17.md). Sem BUILD, release, chamada de modelo ou ensaio funcional das capacidades anunciadas.

## Artefatos

- [Bundle original REA](rea-evidence-bundle.json): 12 registros, incluindo oito capturas e quatro registros de desconhecidos gerados pelo REA. Exportado pelo MCP, preservado sem reformatar.
- [Inspeção e identidade](inspection.json): hashes de 34 insumos, IDs completos das capturas, exit codes, limites e desconhecidos. Executável Claude Code 2.1.302, SHA-256 `60d7eb7f12fbb28a52533fe8be5884097403562aa02dc73991a021c7067e29a5`.
- [Matriz das 16 oportunidades](capability-matrix.json): constatação delimitada, origem REA/documental, código, cartões canônicos e aceites propostos. Não é um novo backlog aprovado.
- [Layout ELF](elf-sections.txt): inspeção auxiliar `readelf -SW`; não é saída do REA nem descompilação.
- [Verificação documental](verification.json): resultados dos checks desta entrega; não representa testes funcionais do harness.

## Capturas de processo

As referências abaixo são prefixos; os IDs integrais estão em `inspection.json`. Todos os oito comandos encerraram com exit 0 e sem truncamento declarado pelo produtor. As transcrições de terminal derivam dos frames do bundle, mantendo escapes e quebras de linha do processo.

| Comando                     | Transcrição                                  | Evidence ID (prefixo) |
| --------------------------- | -------------------------------------------- | --------------------- |
| `claude --help`             | [help.txt](help.txt)                         | `ev_e4ec4400be80564d` |
| `claude --version`          | [version.txt](version.txt)                   | `ev_183dfba8230804b7` |
| `claude agents --help`      | [agents-help.txt](agents-help.txt)           | `ev_c1742d13fd635d8e` |
| `claude mcp --help`         | [mcp-help.txt](mcp-help.txt)                 | `ev_29212553873332cf` |
| `claude plugin --help`      | [plugin-help.txt](plugin-help.txt)           | `ev_ec185ab3c5be8b95` |
| `claude gateway --help`     | [gateway-help.txt](gateway-help.txt)         | `ev_f85f7097aa7a5c44` |
| `claude plugin eval --help` | [plugin-eval-help.txt](plugin-eval-help.txt) | `ev_48ae544bdba3392b` |
| `claude mcp add --help`     | [mcp-add-help.txt](mcp-add-help.txt)         | `ev_b57cd1ba873acc5b` |

## Limites

REA 6.5.0, provider de captura `rea-process` v3, Linux x64. `HOME` e `CLAUDE_CONFIG_DIR` temporários próprios; outras variáveis herdadas. Os detalhes de terminal, tempo e orçamento de saída são preservados em cada manifest. A amostra do digest antes do launch não prova vínculo atômico com a imagem carregada pelo SO.

O primeiro resumo nativo retornou `provider_unavailable`: Ghidra/IDA não configurados e Hopper ausente. Nenhum engine instalado ou configuração alterada. O processo do Claude respondeu à ajuda; os recursos descritos não foram usados em sessões reais. Rede e efeitos de filesystem não observados; isso permanece desconhecido. A documentação oficial complementa a interpretação, sem provar comportamento da build local.

Os ledgers 99/20/30 foram preservados por já estarem modificados na entrada. Deltas de continuidade em [handoff próprio](../../../08_runtime/handoffs/rea_claude_20261017.md). Não houve commit, push ou deploy.
