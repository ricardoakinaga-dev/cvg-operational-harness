# SPEC0225 — proposta do journal de resultados completos

[Estado da candidata](candidate-r1.json): proposta T1 tecnicamente aceita para decisão humana por hash para mudança futura T3. Nenhum BUILD, SQL DDL, migração ou ativação foi autorizado por este pacote. J01–J16 estão NOT_RUN.

A falha públicaNUL foi preservada: o journal JSONB recusa a confirmação antes do checkpoint completo. A proposta usa discriminador externo ao output, payload ASCII/base64 separado, limite lógico8MiB, sem backfill/adopção de órfãos e cutover exclusivo de schema/credential em recurso novo sintético. Crítica frescaC1–C6PASS_SPEC e46artefatos/132checks deinputs conferidos pelo Lead; nenhuma autoridade de BUILD decorre desse aceite técnico. [Pacote humano](human-decision-packet.json) pronto para decisão, aprovação ainda não concedida.

A SPEC0224 já aprovada mantém seus bytes e autoridade local. Sua implementaçãoR3 passou156focos/905testes de pacotes/tipos/lint; a prova públicaPG teve7PASS/1NULFAIL, sem aceite global. Esses resultados são contexto observado, não execução dos testes futuros0225.

O draft original do autor e seu manifesto desatualizado após followup estão preservados com a [verificação do Lead](author-delivery-lead-verification.json). A candidata canônica e o novo packet têm hashes próprios. Raw Markdown termina em `.source.txt` para não ser interpretado como documentação ativa.
