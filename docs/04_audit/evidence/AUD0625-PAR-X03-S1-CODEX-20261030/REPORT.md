# 0294 — slice 1: contratos, compatibilidade e preflight

Codex AUD0625, BUILD atribuído pelo DF28367. Base imutável `9a8ab4c7a8980b8de61e2cfc5c56b1e6f902c5f2`, branch `codex/aud0625-par-x03-s1-20261030`. Gate humano: recibo 26 SHA `ae6a077850f8db3aa8d2b01f10055a1917814e9389677577f941a415245acef1`, ligado à SPEC0294R2 SHA `551f477ac2bcf1a531c719ac6a660b1dbaae3ef9ce7998ced9cbfef70465dc1e`. Esses documentos permanecem imutáveis.

Implementação concluída e verificada no escopo S1; CODE R2 **APPROVE_SCOPED_STATIC, zero mandatory**, após fechamento estático do P2 e P3. O parecer foi produzido em 139,423 s; a conferência de entrega terminou em 150,159 s, ambos dentro de 600 s. As 14 fontes e os inputs permaneceram iguais em PRE/POST; o revisor foi encerrado. O freeze técnico aprovado SHA `5ad836fe812aee7f43e6aa7393c68f26cc3f7d09d98dd046dd8cf2bb5fe78089` precedeu código. Não há qualificação ou execução do perfil B.

## Comportamento entregue

| Critério do freeze                                                           | Resultado                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1-01: união, mirrors e motivos coerentes; A nunca vira B                    | ProcessContainmentV1 versionado, recursos/contadores/seccomp e mirrors da mesma observação. A emite namespace-observed/owner/false, resources e seccomp not_required. Validação estrutural não autentica prova nativa.  |
| S1-02: pedido B não chega a preparo/spawn, não ocupa slot; cache não degrada | B sempre recusa admission_refused/qualification_missing antes da reserva. Adapter encaminha o requisito e recusa A para pedido B.                                                                                       |
| S1-03: unverified/cleanup_failed nunca viram sucesso; causa preservada       | Gate comum confere versão/limpeza/mirrors/limites/seis contadores/motivos/perfis/digest antes de projetar exit0. Recursos/contador desconhecidos continuam com motivo; não viram zero.                                  |
| S1-04: preflight falha fechado em requisitos/abort, sem escrita              | Diagnóstico readonly de root/unit/supervisor, cgroup2, ownership/controladores/arquivos/runtime tmpfs, leituras limitadas, symlinks e AbortSignal; qualified false sempre. Sem autoridade de launch ou promessa TOCTOU. |
| S1-05: unit/entry com caminhos/argumentos fechados e sem ativação            | Unit oneshot sem Install, entry JS e runbook para instalação futura com caminhos absolutos, Node22 e pins. Artefatos não instalados/ativados, sem interface de payload.                                                 |
| S1-06: regressores puros X01/X02 e mutantes de asserção                      | Seleção fechada de sete arquivos passa 170 casos; cinco mutantes atuais são detectados. Regressões nativas NOT_RUN por human26.                                                                                         |
| S1-07: fontes/pins/receipts e evidência honesta                              | 1766 fontes originais intactas, cinco alteradas intencionalmente, nove novas; 14 preimagens R1 preservadas e 14 inputs finais PRE/POST exatos. Artefatos, checks e commit próprio.                                      |

O diagnóstico falha de modo fechado se uma leitura não fecha o descritor: invalida a observação e não devolve erro bruto ou caminho do host; close não é repetido, pois o número do descritor pode já ter sido reutilizado no Linux.

## Testes e contraprovas

- Baseline anterior: três arquivos puros, 118 PASS. A seleção final de sete arquivos inclui essa baseline e os quatro arquivos S1: **170 PASS, zero skip**, sem somar campanhas sobrepostas como casos distintos.
- CODE R1 apontou um P2 de validação e um P3 de close. Antes de reparar, a seleção dirigida produziu 45 PASS e quatro falhas esperadas: três asserções do gate/adapter e uma exceção de close. Depois da única reparação coerente: 49 PASS; com limites adicionais e seleção completa: 170 PASS.
- Cinco mutantes da fonte final, em cópias isoladas: admissão B removida; adapter aceita relatório não verificado; preflight ignora checks; validação resources/seccomp removida; erro de close escapa. Todos mortos por testes anteriormente verdes, sem timeout ou falha de importação. A candidata permanece igual ao manifesto R2 durante as contraprovas e a revisão.
- Typecheck final, lint dirigido e skip-governance PASS. Prettier/checks de documentação e integridade no fechamento.
- Cobertura canônica da seleção pura: 170 testes passam, processo global exit1 por seleção parcial. `containment.ts`, `errors.ts` e `types.ts`: 100% em statements/branches/functions/lines. `cgroup-preflight.ts`: 97,33% statements / 95,52% branches / 100% functions / 98,55% lines. `service.ts` e adapter permanecem parciais pois execuções nativas estão fora da seleção autorizada. O gate configurado de 100% por arquivo cobre os quatro pacotes neutros (contracts, harness, orchestrator e conversation), não packages/sandbox. Nenhum threshold foi reduzido; o diagnóstico parcial do sandbox permanece explícito, sem afirmar full CI ou cobertura global 100%.
- Host real, somente leitura: recusa/cgroup_unavailable/qualified false; não existe raiz própria ativada nesta rodada. Smoke do entry compilado em diretório descartável, fora de unit: exit78 e relatório refused/qualified false. Não é instalação qualificada nem lançamento de payload.

## Falhas preservadas e revisão

A primeira seleção teve um erro de fixture de mock filesystem e uma asserção de caminho do artefato; a primeira checagem de tipos encontrou inferência de literal do acumulador de caminho. Corrigidos setup dos testes e anotação de tipo, com brutos e preimagens preservados. A tentativa inicial de smoke com strip-types recusou parameter property TypeScript: preservada, seguida de transform-types readonly e depois compilação descartável. Nenhum desses erros é apresentado como PASS.

Freeze R1 recebeu um P2: a seleção proposta incluía regressões com payload nativo. Foi removida antes da implementação; a conferência freeze R2 aprovou apenas o escopo puro/readonly. CODE R1 recebeu um P2 e um P3, reproduzidos e reparados como acima. CODE R2 é uma conferência final não autora fresca que conhece R1 por desenho; parecer e PRE/POST ficam no arquivo original lossless de `review/code-r2`, com texto e JSON de leitura disponíveis; o README e ARCHIVE.json explicam a representação, sem editar o parecer. Não se alega cegueira a R1 ou qualificação nativa pela inspeção.

## Integração e próximos gates

São 14 caminhos de código/artefatos mais documentação própria. As cinco fontes existentes alteradas e nove caminhos novos ficam apenas na branch privada até integração pelo DF; o pacote documental é espelhado byte a byte no checkout compartilhado. Ledgers 99/20/30 continuam com o DF, com deltas próprios.

O SHA final de integração da onda 5 ainda depende de publicação do DF. Este BUILD parte da base autorizada 9a8; não certifica a integração final. Fatias 2+ exigem seus freezes técnicos e provas autorizadas. Unit não foi instalada/ativada; zero cgroup writes, payloads, pressure, PG/Docker, provider, lockfile ou push nesta slice. Produção permanece sem liberação.
