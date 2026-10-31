# Reparo da fatia 1 — DF34008

Implementado, aguardando conferência não autora da Claude 07 e integração do DF. Base f1abe62945b3ac4dd8b34dffaebd4dbc0878f49a; crítica imutável 9e125d027. Gate human26 / SPEC0294 R2 SHA551f477ac2bcf1a531c719ac6a660b1dbaae3ef9ce7998ced9cbfef70465dc1e permanece o da fatia; não há capacidade B nova.

P2-1: separada consistência de contenção da prova de cleanup. `verifiedProcessOutcome` continua estrito; o adapter classifica contenção coerente sem cleanup provado como `cleanup_failed`, preserva causa e saídas. O `shell.run` real, pelo wrapper padrão e adapter real, recebe `effect_uncertain: cleanup_incomplete`. O serviço é dublê sintético: estes testes provam mapeamento, não processos nativos residuais. Causas exit/0, exit/7, timeout e cancelled cobertas; recusa de lançamento continua com mensagem de spawn.

P3 baratos: relatório recusado é omitido de `containment`; documentada a barreira do adapter posterior à execução; diagnóstico removido do índice público, import profundo preservado; RuntimeDirectoryPreserve=no e NoNewPrivileges=yes no artefato; import de erro no topo. O diagnóstico não foi instalado nem ativado.

P3 diferidos explicitamente para fatia 2 antes de B real: marca nominal/construtor exclusivo do guardião e âncora RuntimeDirectory/identidade do manager. README reconhece que a entrada deriva o esperado do observado, `ownerInSupervisor` é conferência de forma e as leituras síncronas são limitadas. Não atribui prova de identidade ou qualificação ao diagnóstico.

[Resultados](test-summary.json): primeiro RED 1 PASS/5 falhas por asserção; seleção focada 98 PASS; seleção final ampliada com serviço X01, landlock e fronteira de spawn PASS. Mutante do adapter para spawn_failed morto em quatro casos; mutante do ramo shell morto em cinco, quatro deles no shell real. Mutantes próprios restaurados byte a byte. Brutos preservam a chamada noEmit não canônica e typecheck intermediário que coincidiu com mutações; somente o typecheck final, após restauração, serve ao aceite técnico. [Brutos](raw-archive.json).

1.765 inputs fora do escopo próprio permaneceram byteiguais à baseline anterior, sem restauração. Fonte compartilhada, índice de main e ledgers DF não alterados; código só no branch privado. Sem cobertura global, qualificação B ou produção presumida. Próximo: Claude 07 confere este commit novo; DF integra após parecer. [Deltas](LEDGER-DELTAS.md).
