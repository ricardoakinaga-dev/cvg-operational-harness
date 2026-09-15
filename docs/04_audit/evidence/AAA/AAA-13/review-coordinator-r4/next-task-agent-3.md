# Agente 3 — AAA-13: ensaio integrado de certificação local isolada

R4 aprovado pelo coordenador no recorte de correções; C5-F01/F02 fechados. Execute uma única tarefa: comprovar a integração **produtor phase10-certify → artefatos → phase10-verify** com gates locais reais em snapshot isolado, preservando a árvore compartilhada. AAA-13 continua REVIEW, sem DONE.

## Preparação e janela

Leia AGENTS, runtime/log/backlog e parecer adjacente. Esta instrução registra autorização para executar full certify **somente na cópia isolada sintética**, substituindo a proibição anterior apenas nesse recorte. Não interrompa as frentes 1/2. Faça cópia consistente do candidato atual incluindo alterações relevantes tracked/untracked; não use apenas HEAD e não faça reset/stash. Preserve relação de arquivos/hashes antes/depois da cópia e revalide os três scripts aprovados. Se houver drift durante captura, recapture antes do ensaio; depois fixe o snapshot. Não copie credenciais, .env operacional ou dados reais; declare qualquer diferença de escopo sanitizada, sem fingir identidade com a árvore original. Não compartilhe diretórios graváveis de reports/build/cache entre snapshot e origem. Nenhum commit/push/deploy.

## Execução

1. Registre candidato, scripts/contratos/lockfile, Node/npm, comandos, ambiente sintético, runId e paths privados. Use PostgreSQL descartável exclusivo do ensaio, banco/porta distintos da operacional 5432 e da instância 55432 das outras frentes; não mate sessões nem reaproveite banco ativo de outro agente. Se recurso indisponível, registre gate NOT_RUN/BLOCKED com motivo; não invente PASS. Sem fsync off como prova de durabilidade física.
2. Inspecione os scripts do runner antes de executar: integrações devem ser falsas/locais, sem provider/canal/IdP/dados reais. Execute `npm run certify` na cópia e capture resultado completo. Depois execute `npm run certification:verify` no mesmo snapshot. Execute o verificador mesmo após falha do produtor, preservando o primeiro resultado. Não edite relatórios para obter aceite, não remova achados conhecidos e não reduza limiares.
3. Entrega esperada é evidência honesta, não certificado verde a qualquer custo. Correlacione cada gate/exit com log bruto, resultado, hash, candidato/runId; diferencie falha real do produto, dependência de ambiente, incompatibilidade produtor/verificador e drift causado por artefatos gerados. Registre skips por gate. Barra AAA congelada e defeitos atuais continuam bloqueantes mesmo se o modo legado produzir rótulo AAA_CONTROLLED.
4. Preserve histórico byte a byte e comprove que certificados/manifestos da árvore compartilhada não foram escritos pelo ensaio. Não publique certificado corrente sobre as lanes em evolução. Testes de fixture 37/37 não substituem este ensaio. Docker e benchmark comparativo/signoff não fazem parte desta task.
5. Caso apareça incompatibilidade, entregue reprodução mínima e diagnóstico com paths e próximo ajuste proposto; não inicie correções no produto ou nova rodada ampla de parsers neste ensaio. Código dos três scripts deve permanecer no hash aprovado durante a execução.

## Entrega

Pacote próprio `docs/04_audit/evidence/AAA/AAA-13/integration-rehearsal/`: manifesto do snapshot, vínculo origem/cópia e eventuais exclusões, logs brutos e exit codes, matriz gate→artefato→resultado, relatório produtor/verificador e causas de bloqueio, hashes antes/depois. Para volumes grandes, registre arquivo local privado e seu hash sem copiar segredos. Devolva IMPLEMENTED_PENDING_INDEPENDENT_REVIEW para o ensaio concluído ou BLOCKED com causa; nunca autoaprove AAA-13/DONE. Não altere registros compartilhados. Aguarde auditoria para a próxima tarefa.
