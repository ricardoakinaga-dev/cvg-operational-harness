# Auditoria do retorno Agente 3 — qualidade e certificação

**Próxima tarefa única: AAA-13 REWORK**, finding **AAA13-C3-F01 (P1)**. Revisão direta do coordenador; nenhum código de produto, certificado ou evidência anterior foi alterado.

## AAA-13 — critério de evidência não satisfeito

O [probe](qualification-probe.mjs) copia os arquivos reais do verificador para diretório temporário, cria um candidato sintético consistente e invoca o **CLI público**. Nenhum gate de produto é executado. Os gates são apenas declarados PASS/exit 0, sem logs; `manifest.artifacts=[]`. O verificador aceita os schemas, informa “verified 0 artifact hashes” e termina **exit 0 / current candidate qualified**. [Resultado executado](qualification-probe.log).

O self-test original N1–N9 também passa no mesmo ambiente, antes do contraexemplo. Ele modifica entradas específicas de helpers, mas não demonstra que o caminho público exige evidência completa. `verifyQualification` só percorre artefatos fornecidos; não exige os artefatos dos gates. `GateResultSchema` torna log/logSha256 opcionais. O status declarado não é recomputado de inventário/resultado bruto de cada runner. Isso mantém uma forma concreta de falso aceite e impede a janela de certificação final.

Correção: matriz de evidência obrigatória por gate com vínculo ao candidato/execução, validação de presença/integridade e veredicto derivado dos dados brutos. Incluir testes pelo CLI público para manifesto vazio, log removido, PASS incompatível com log, gate obrigatório ignorado e evidência antiga, além de controle positivo válido. Não basta exigir array não vazio ou acrescentar outro teste de helper.

## AAA-04 — APPROVE v2 e congelamento técnico por hash

Contrato `aec32401…`, barra `3c2ffe03…`; seis hashes conferidos; validador documental reexecutado PASS. As condições F01/F02 estão atendidas no texto e JSON: pisos 90/85/95, **100% das mutações selecionadas de guards críticos**, performance explicitamente PROPOSED_NOT_APPROVED_D03. Aprovação técnica e conjunto congelado registrados em `review.json`; AAA-04 VERIFIED no escopo documental. Alteração de bytes invalida a revisão.

Isso não comprova cobertura do produto, mutação executada, benchmark, holdout, G_SPEC humano ou produção. Metadados antigos do manifesto que ainda dizem “bar v1”/“coverage proposta por D03” são históricos e ficam superados por este registro explícito da v2; não foram reescritos.

## AAA-14 — parecer limitado, encerramento pendente

Hashes declarados conferem. Script de licenças reexecutado em fixture isolada com os manifests atuais: 372 pacotes, 21 internos, zero denied/unclassified/invalid exceptions. Lockfile e movimentação de tsx conferidos por inspeção. A leitura dos logs de Node 22 e do audit sustenta a entrega histórica; **não reexecutamos npm audit de rede nem install/full suite** nesta revisão. Docker build continua NOT_RUN. Aprovação limitada às verificações documentadas, sem certificar imagem ou operação; task continua REVIEW.

## AAA-15 — formatação do arquivo aprovada, gate global pendente

Hash atual de server.ts confere; prettier do arquivo PASS. Reexecutamos equivalência de AST com travessia completa contra `/tmp/opencode/server.ts.preformat`, cujo hash consta no manifesto. O helper antigo retorna o número produzido por `children.push` no callback de `forEachChild`, podendo encerrar a visita no primeiro filho; seu AST_EQUIVALENT sozinho era insuficiente. O novo [check](ast-check.mjs) visita todos os filhos e rejeita alteração no segundo statement: equivalência confirmada independentemente. O snapshot temporário é uma limitação de reprodução futura; preservar bytes antes/depois no fechamento definitivo.

A equivalência do arquivo não fecha `npm run format:check` global. Não editamos arquivos pinados de outras frentes nem ampliamos `.prettierignore` para obter PASS. Suíte API do executor permanece evidência histórica; não repetida para esta confirmação de formatação.

## Estado e limites

Pareceres AAA-01/03/05/12/16 citados no handoff são históricos onde já há revisão posterior. AAA-03 rev2 aprovado já foi integrado; AAA-05 continua REWORK/v3 atribuída ao Agente 2; errata AAA12-R3-F01 já fechada pelo coordenador; composição AAA12-R3-F02 segue aberta em AAA-21. Agente 1 continua rework AAA-08. Não há novas tarefas para essas frentes nesta rodada.

Artefatos detalhados e resultados: `checks.json`, logs de validação/barra/licenças/histórico/AST no mesmo diretório. Nenhuma alegação de State of Art, produção ou certificação atual foi aceita. A execução completa de certify deve aguardar correção AAA-13 e candidato estável; não é o próximo passo deste executor.
