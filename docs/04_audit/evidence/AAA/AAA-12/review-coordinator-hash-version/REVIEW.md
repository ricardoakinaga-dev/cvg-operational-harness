# AAA-12 canonicalização/versionamento — revisão independente

**REWORK pontual: AAA12-C4-F01 (P2)**. Candidato `8d49cb2ad7268a06bcaae6aaeebd53169c7d5db0e30a3b4dbed4a9d1f0b55492`; 13/13 hashes conferidos e digest canônico reproduzido. **6 arquivos / 51 testes de canal PASS**, exit 0, reexecutados pelo coordenador.

A parte principal está comprovada no recorte testado: algoritmo compartilhado para projeção completa, persistência de versão, bloqueio de versão diferente antes de hash/replay e erro de conteúdo separado. As provas anteriores de concorrência/fencing passam na suíte de canal. Isso não encerra cobertura crítica ou durabilidade física.

## Defeito restante: versão inválida interpretada como legado

`FileChannelEffectJournal.#readRecord` usa `typeof parsed.hashVersion !== 'string' || parsed.hashVersion === ''` para preencher `legacy-local-v1`. Isso confunde **campo ausente** (compatibilidade legítima) com **campo presente inválido** (registro sem versão confiável).

[Probe executado](malformed-version-probe.mjs): registra PENDING sintético com hashVersion `null`, `7`, `""`, `false` ou `{}`; chama reserve pela API pública com LEGACY_HASH_VERSION e o mesmo hash. Nos cinco casos: **reserved**, bytes modificados e **claimSend permitido**. Uma string de versão desconhecida retorna version_mismatch e preserva bytes, servindo como controle. [Resultado](malformed-version-probe.log). Sem envio externo.

O fallback `existing.hashVersion ?? LEGACY_HASH_VERSION` em decideReserve também considera null como ausência. Não normalizar valores explícitos inválidos para uma versão suportada; somente propriedade ausente pode representar legado. Versão malformada/desconhecida deve falhar fechado e preservar registro, inclusive sob caller legado suportado.

Limite importante da observação: o gateway atual sempre solicita a versão compartilhada e rejeita estes registros após a normalização para legado. O defeito comprovado está na fronteira pública do journal com caller legado, caminho que a própria suíte mantém suportado. Não foi demonstrado envio real nem bypass do gateway atual.

## Próxima ação e débitos preservados

[Única próxima tarefa do Agente 2](next-task-agent-2.md): corrigir validação de versão ausente versus explícita inválida e testar não mutação. Não refazer a canonicalização já correta nem iniciar SQL, actor, AAA-21 ou campanha ampla de cobertura nesta rodada.

O FAIL do subset de coverage (functions 78.21%) permanece registrado; PASS global não o compensa. Cobertura crítica, processos reais/restart, actor e composição continuam débitos distintos. Gates globais e PostgreSQL do executor são evidências históricas, não reexecutadas nesta auditoria focada. Nenhum código do produto ou evidência antiga foi alterado pelo coordenador; nenhum gate ou DONE concedido.
