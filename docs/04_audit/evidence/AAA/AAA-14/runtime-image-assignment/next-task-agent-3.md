# Agente 3 — AAA-14: verificar imagem runtime no Node 22

Execute uma única tarefa: fechar a lacuna de evidência da imagem runtime de AAA-14. O ensaio AAA-13 em Node24 foi aprovado no snapshot, mas não substitui o alvo Node22 do Dockerfile. Não repita o full certify nem altere a certificação atual.

Leia AGENTS, runtime/log/backlog, AAA-14/evidências anteriores, barra AAA-04 v2 e `docs/04_audit/evidence/AAA/coordinator-batch-review/REVIEW.md`.

## Ownership e ambiente

Atividade de verificação local autorizada, em cópia consistente e isolada dos bytes atuais relevantes (tracked/untracked). Congele hashes de fontes, Dockerfile, .dockerignore, lockfile, manifests e configurações antes da execução; revalide a cópia e registre candidato/diferenças. Não copie .env operacional, credenciais ou dados reais. Na origem, escreva apenas em `docs/04_audit/evidence/AAA/AAA-14/runtime-image-verification/`; não altere código, Dockerfile, package/lockfile, workflows, contratos ou registros compartilhados.

Verifique disponibilidade do engine Docker/compatível sem reiniciar serviços, instalar daemon ou mudar privilégios do host. Se indisponível, registre Docker NOT_RUN/BLOCKED com evidência; prossiga com validação Node22/prod-only possível em diretório privado, explicitando que não substitui imagem. Não use banco operacional/portas5432/55432 nem recursos das outras frentes. Cleanup somente dos containers/redes/volumes próprios identificados.

## Verificação concreta

1. Registre versão exata Node22/npm, plataforma e digests das bases utilizadas. O Dockerfile tem estágio final `web`: construir só o default não prova a API. Execute build explícito `--target runtime` usando o Dockerfile aprovado, com tag local exclusiva e logs. Não publique/push a imagem.
2. Inspecione imagem resultante: Node22, UID/GID10001 não-root, entrypoint/CMD real, tsx disponível como dependência de produção, inventário de dependências sem dependências exclusivamente de desenvolvimento, ausência de credenciais/arquivos operacionais copiados. Avalie metadados e arquivos efetivos; não imprima segredos eventualmente encontrados, apenas localização sanitizada e bloqueio.
3. Inicie pelo CMD padrão, com configuração sintética documentada e integrações externas desabilitadas. Use porta localhost exclusiva e dependências descartáveis próprias apenas se necessárias. Prove startup, `/live`, healthcheck e encerramento limpo; diferencie liveness de readiness e não force readiness com mocks ocultos. Use read-only/cap-drop/no-new-privileges conforme notas do Dockerfile quando compatível, registrando o comando real.
4. Compare `npm ci --omit=dev --ignore-scripts` e execução tsx no Node22 da imagem. Não permita que npx baixe silenciosamente ferramenta ausente: demonstre resolução local e rode o smoke sem egress externo após preparar dependências. Nenhum provider/canal/IdP real.
5. Preserve RED de qualquer falha. Se build/startup/inventário falhar, entregue reprodução, causa e proposta mínima com paths; não implemente fix sem próximo recorte registrado. Não reduza requisitos, não troque Node22 por Node24 e não declare imagem aprovada usando só instalação local.
6. Verifique hashes antes/depois e preserve certificados históricos/atuais e as lanes1/2. Registre resultados PASS/FAIL/NOT_RUN por critério. Este recorte não prova RPO/RTO, qualificação AAA global ou segurança operacional em produção.

## Entrega

Manifesto da cópia/imagem com digests, versões, comandos/exit codes, build log, inventário, inspeção de usuário/configuração, logs de startup/health/shutdown, limitações e limpeza dos recursos próprios. Entregue IMPLEMENTED_PENDING_INDEPENDENT_REVIEW para verificação concluída ou BLOCKED com causa objetiva; não marque AAA-14 DONE. Não inicie outra task nem publique imagem/commit/push/deploy. O coordenador audita e integra.
