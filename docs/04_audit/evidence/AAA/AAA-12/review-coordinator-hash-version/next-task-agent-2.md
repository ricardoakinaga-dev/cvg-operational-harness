# Próxima tarefa — Agente 2: AAA-12 / AAA12-C4-F01

Execute somente o rework pontual descrito em `docs/04_audit/evidence/AAA/AAA-12/review-coordinator-hash-version/REVIEW.md`. Leia AGENTS/runtime/log/backlog e preserve o candidato 8d49cb2a… e os manifestos anteriores. Mantém-se a autorização de correção local controlada, sem SQL, produção ou promoção automática.

Objetivo: diferenciar hashVersion ausente de hashVersion explícito inválido; nenhum registro inválido pode ganhar autorização de reserva/envio por ser rotulado como legado.

1. Reproduza `malformed-version-probe.mjs`: hoje null, número, string vazia, booleano e objeto são normalizados para legacy; reserve aceita, altera bytes e claimSend passa. Preserve RED com expectativa de rejeição e não mutação.
2. Faça somente propriedade ausente representar legacy-local-v1. Campo presente inválido ou versão desconhecida deve falhar fechado; remova o tratamento de null como ausência em decideReserve. Preserve compatibilidade com registro realmente sem campo e com legacy explícito válido. Não apague registros, não reescreva hashes/versões e não introduza migração automática.
3. Valide input de reserva e registro persistido antes de comparar hash, replay, takeover ou disponibilizar claim. Propague erro/resultado estável hash_algorithm_mismatch/version_mismatch, não retryável no gateway, conforme contrato. Não aceitar falha incidental de JSON/parser como teste suficiente da regra de versão.
4. Teste versões ausente, legacy válida, shared válida, desconhecida, null, número, booleano, objeto, array, vazia e whitespace. Nos registros inválidos, teste callers legacy e shared e estados PENDING/SENDING/CONFIRMED/FAILED/UNCERTAIN/EXPIRED: nada de replay/takeover/claim/envio ou mudança de bytes/revisão. Inclua controles positivos para legado sem campo e explícito na API do journal; ambos devem continuar bloqueados quando o gateway solicita shared. Paridade memory/file e input inválido não pode criar registro.
5. Rode regressões de canal e consumidores afetados, typecheck/lint e gates exigidos/disponíveis para rodada com código, preservando os logs de cobertura FAIL já declarados. Não diminuir limiar nem usar coverage global para ocultar falha do subset.

Ownership: packages/channel-gateway/src/effect-journal.ts, effect-journal-file.ts e testes do pacote; errors.ts/gateway.ts apenas se necessário para propagar o erro estável. Preserve os demais arquivos e alterações concorrentes; se ultrapassar o recorte/autoridade local, registre bloqueio preciso. Não editar @cvg/shared, persistence/, migrations, package.json/lockfile, contratos congelados ou registros compartilhados.

Entregue IMPLEMENTED ou BLOCKED com manifesto novo, digest reproduzível, diff, RED/GREEN, matriz requisito→teste e comandos/exit codes. O coordenador revisa e integra. Não iniciar outra task, SQL, actor ou AAA-21; não redistribuir outras frentes e não autoaprovar DONE.
