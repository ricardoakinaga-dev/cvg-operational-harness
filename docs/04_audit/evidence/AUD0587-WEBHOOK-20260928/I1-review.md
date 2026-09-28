# AUD-0587 — crítica independente I1

- Revisor: Linnaeus, somente leitura do candidato isolado `7ef74e7`; 28/09/2026.
- Veredito inicial: nenhum P0; dois P1 de replay e um P2 condicional de seleção de tenant por header não assinado. Não encontrou bypass direto de HMAC antes do resolver de tenant.
- P1 1: lease PostgreSQL pode ser retomado após 30 segundos antes do commit tardio no handler; fencing impede commit velho, não desfaz passos prévios. O teste anterior de store não exercia duas requisições lentas. [Sonda HTTP+PG posterior](lease-takeover.json) confirmou segunda entrada no resolver antes da primeira terminar, resposta 200 da segunda e 500 da primeira, sem demonstrar duplicação de efeito externo.
- P1 2: `expiresAtMs` parte da primeira recepção, embora timestamp assinado futuro permaneça válido após essa expiração. [Relógio controlado posterior](future-replay.json) confirmou aceitação duas vezes da mesma assinatura; [repetição PostgreSQL](future-replay-pg.json) confirmou o mesmo com linha de expiração sinteticamente envelhecida.
- P2: resolver de tenant pode receber headers que não participam do HMAC. O resolver produtivo atual usa tenant fixo; risco condicionado à próxima integração de canal.
- O revisor inspecionou fonte e testes, sem reexecutá-los nem alterar arquivos. Os negativos adicionais foram executados pelo agente principal após o parecer.
