# SPEC0238 — decisão de BUILD local

**Pronta para revisão humana T3; BUILD ainda não autorizado.**

A [SPEC0238](../../../../02_spec/0238_claude_scripted_reference_capture.md) propõe capturar o cliente Claude Code 2.1.302 real em três cenários locais fixos:

1. Receber texto por streaming SSE/HTTP200.
2. Executar Read de uma fixture sintética somente leitura e conservar seu callback completo.
3. Tentar Write sem aprovação e exigir a negação de permissão registrada pelo cliente, além da ausência do efeito. Um erro de filesystem não substitui essa prova.

As respostas são programadas, com chave sintética e endpoint local; nenhum modelo ou conta real é usado. O perfil mantém dois containers próprios, workspace somente leitura, ambiente fechado e rede isolada. O coletor preserva requests, respostas/segmentos, stdout/stderr, estado dos arquivos e origem física. Captura interrompida permanece falha/parcial; não é completada a partir da resposta esperada.

O BUILD ficará em candidata própria: novoCLI privado e `tests/claude100/reference-capture`. Somente o bootstrap privado compartilhado e seu teste podem ser refatorados para o segundo perfil literal, preservando os250testes e o comportamento0235. Código congelado/revisto antes do alvo; auditoria dos brutos e gates atuais antes de integração seletiva. Compatibilidade nativa dos três casos aindaNOT_RUN; incompatibilidade não autoriza trocar script, binário ou perfil silenciosamente.

Não inclui M1, adapterCVG/equivalência, novos contratosPAR, modelo/conta real, instalação, produção, push ou deploy. Resultado continua REFERENCE_CAPTURE_ONLY/reviewPENDING, sem crédito às117funcionalidades/17controles.

## Revisão e identidade

- SPEC SHA-256: `48b270842ec83b422ecafeff2a4e802abd2194838ad3669becd2ebf825c464e6`.
- [Revisão independenteR2](review-r2/REPORT.md): APPROVE_SPEC, zero obrigatórios;43/43conferências do freeze. [Resultado](review-r2/result.json).
- Manifesto da revisão SHA-256: `d598dfa0767cc7232ac28335119b4cf17aee288871e87798b7425b0973834680`; [selo conferido pelo Lead](lead-review-seal-check.json).
- [R1 preservada](../spec0237-decision/review-r1/REPORT.md): os três grupos foram corrigidos no primeiro de até dois retrabalhos, com o mesmo crítico.
- [Renumeração](identifier-migration.json): a propostaClaude não aprovada mudou de0237 para0238 por colisão comHISO. A SPEC237HISO e os selos antigos permaneceram intactos. Nenhum pedido humano foi enviado para a numeração anterior.

## Decisão solicitável

Aprovar somente o BUILD local e a execução contida dos três cenários acima, conforme a SPEC exata. A constituição em `docs/07_agents/AGENTS.md`, D-12/T3, exige revisão explícita da SPEC pelo usuário antes desse BUILD de segurança/processo. As aprovações0229/0235 já foram cumpridas e não são estendidas a HTTP200/ferramentas.

RC01–RC11runtime permanecemNOT_RUN. Uma aprovação futura será registrada como decisão real separada; este pacote e o parecer técnico não a substituem. A [reconciliação da fundação](../functional-capture-recon/m1-foundation-authority-reconciliation.json) conserva sete dependênciasM1 sem qualificação integrada e as aprovações com ajustes já existentes, sem reconsultá-las.
