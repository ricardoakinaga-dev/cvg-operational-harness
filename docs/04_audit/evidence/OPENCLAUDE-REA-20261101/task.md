# OPENCLAUDE-REA-20261101

Etapa DISCOVERY/AUDIT; trilha T1; autorização local documental pelo pedido do usuário.

## Contrato

O quê: extrair com MCP REA o Open-ClaudeCode/main e converter achados em estabilização rastreável do harness genérico. Onde: este pacote e handoff exclusivo; nenhuma fonte de aplicação alterada. Como: fixar revisão, inventariar subsistemas, analisar artefatos com REA, ler fontes e comparar com baseline CVG fixada. Dependência: GBrain e claims reconciliados; respeitar ADR-010 e carteiras existentes.

## Aceite

- A1: revisão externa e CVG identificadas; arquivos relevantes e hashes registrados.
- A2: chamada MCP REA real com Evidence IDs, cobertura e bundle exportado.
- A3: runtime, orquestração, ferramentas/MCP, contexto/sessões, segurança, recovery e observabilidade mapeados; ausências e desconhecidos explícitos.
- A4: prioridades reconciliadas com tarefas existentes; critérios positivos/negativos e gate para cada recomendação.
- A5: links/formato e integridade documental conferidos; GBrain END/readback e deltas99/20/30 próprios.

Modo scout-assisted: dois scouts readonly reduzem incertezas independentes de arquitetura upstream e estado CVG. Lead executa REA e integra. Nenhuma revisão independente de aplicação ou aceite de produção. Sem executar código upstream, instalar dependências ou credenciais.

Próximo BUILD depende de SPEC concreta e gate da trilha correspondente, sem reabrir aprovações resolvidas nem tomar ownership dos pares.
