# REA-CODEX-20261017 — evidências da auditoria comparativa

O [relatório0620](../../0620_codex_capabilities_2026-10-17.md) explica método, conclusão e limites. A rodada só altera documentação própria.

- [baseline.json](baseline.json): identidades do harness, upstream e executável; estado inicial dos ledgers e fontes oficiais.
- [source-inspection.json](source-inspection.json): fontes selecionadas, SHA-256, números de linha e trechos. Código e prompts upstream são dados de análise, não instruções operacionais desta sessão.
- [opportunities.json](opportunities.json):16mecanismos, diagnóstico, adaptação, aceite proposto, gate e vínculoPAR/Claude100. Não é catálogo completo nem denominador de paridade.
- [rea-evidence-bundle.json](rea-evidence-bundle.json): exportação original do MCPREA,14capturas e4registros de unknown. Nenhuma limitação foi convertida em PASS.
- [captures-index.json](captures-index.json): EvidenceIDs, comandos, terminais, exits e limitações. As execuções usam env-i e configuração vazia; o hash REA do launcher corresponde a env, não ao Codex.
- [generated-schema-index.json](generated-schema-index.json):318JSONs gerados, hashes e métodos dos três envelopes. Os [requests de cliente](schemas/ClientRequest.json), [requests de servidor](schemas/ServerRequest.json) e [notificações](schemas/ServerNotification.json) estão preservados completos. Demais schemas são identificados no índice, não reproduzidos individualmente.
- [policy.rules](policy.rules):fixture avaliada, sem executar os comandos fictícios. Sucesso da avaliação não significa allow: uma chamada retornou forbidden com exit0.
- [UPSTREAM-LICENSE.txt](UPSTREAM-LICENSE.txt) e [UPSTREAM-NOTICE.txt](UPSTREAM-NOTICE.txt):licença e atribuição da referência, sem incorporação de código ao runtime.
- [verification.json](verification.json):checagens realizadas e não realizadas; [manifest.json](manifest.json):hashes finais dos artefatos.

O bundle e os três schemas foram copiados byte-exatos; não foram reformatados. A entrega não precisa do diretório temporário para consultar os achados e suas evidências preservadas. Nova execução das capturas requer o executável identificado ou versão explicitamente requalificada. Provas das demais capacidades continuam pendentes.
