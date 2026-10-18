# Execução da SPEC0228 — contenção dos falsos PASS da B6

Task: `B6-REMEDIATION-BUILD-0228`, filha de HISO-005/B1. Etapa BUILD/T3. O usuário aprovou a implementação local após o pedido explícito da SPEC0228, SHA `05fa3140bff99be3b4b91c2a0f0212bd01f6dd10509785867e84d3fcd64bddfe`. [Autoridade](../04_audit/evidence/B6-0228-BUILD-20261017/authority.json).

## Resultado e limites

Implementar e verificar os 14 aceites da [SPEC0228](../02_spec/0228_b6_boundary_fail_closed_remediation.md). Instalado sem prova não é verificado; nenhuma exceção antiga suprime diagnósticos. Preservar FAIL, expansão, drift e o comportamento dos consumidores. A fronteira final é INCOMPLETE por desenho; nenhum aceite B6/produção é concedido.

Candidata: `/home/ricardo/cvg-candidates/b6-0228-20261017`, branch `candidate/b6-0228-20261017`, base `5a199668`. Somente dois scripts de fronteira, testes correspondentes e bloco do runbook0803. A worktree compartilhada e a candidata estável são preservadas. O controlador nativo CVG usa 0370/99/20/30 e evidências próprias; não sobrescrever `.agent` de programas concorrentes para instalar outro controlador.

## Etapas e demonstrações

1. Capturar inventário dos 145 casos existentes e reproduzir os novos negativos contra a versão anterior. Provar que o instrumento detecta os falsos PASS.
2. Recusar confiança nominal e desativar a tabela, sem alterar a resolução e a precedência dos erros. Atualizar explicitamente expectativas antigas conforme o contrato aprovado.
3. Executar testes focados e todos os 14 aceites, checker normal/strict e consumidor compilado. Conferir que fontes de runtime e lock não mudaram.
4. Obter revisão independente do diff e dos controles; corrigir achados no mesmo escopo. Não conceder aceite ao próprio código.
5. Executar a certificação completa e gates T2/T3 em Node22, PostgreSQL descartável56228 e E2E3378/4378, em checkpoint local próprio. Capturar resultados e falhas sem retries cegos ou relaxamento de critérios.
6. Consolidar manifesto, patch seletivo, revisão, matriz por aceite e handoff. Atualizar o backlog e os ledgers, encerrar somente recursos próprios e auditar completude.

## Verificação e recuperação

Node: `/home/ricardo/.nvm/versions/node/v22.23.2/bin`. Dependências copiadas fisicamente de `core-fix/node_modules`, sem instalação ou alteração de lock. TMP próprio em `/tmp/cvg-b6-0228-20261017/tmp`. PostgreSQL `cvg-b6-0228-pg`, dados sintéticos. Certify/E2E/SBOM/licenças e artefatos somente na candidata própria, sem concorrência no mesmo diretório.

Procedimentos: `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:postgres`, `npm run test:e2e:prepare`/E2E, `npm run certify`, probes B6 arquivados e prova pública sem aliases. `boundary:products` deve sair1/INCOMPLETE; seu resultado nunca será convertido em PASS. O certificado mecânico local não substitui o gate independente de isolamento.

Em falha, preservar log/JSON e fonte, distinguir erro do instrumento de regressão e corrigir somente arquivos próprios. Não parar recursos alheios, descartar worktrees ou modificar a candidata certificada. Retomar o mesmo processo se ainda estiver vivo. Sem push/deploy/integração automática.

## Progresso

- 17/10/2026: autorização e claim registrados; worktree criada de5a199668; dependências locais copiadas. Próxima ação: first red e inventário de testes.
- Evidência corrente e pendências: [diretório desta execução](../04_audit/evidence/B6-0228-BUILD-20261017/).

- 17/10/2026: first red11casos (1PASS/10FAIL); implementação checkpointf11f762f;156focais/type/lint/formato verdes. Árvore real mantém165diagnósticos antigos,303instalados e468diagnósticos totais,semexceções; normal/strict idênticos. Consumo público fresco passou. Revisão independente ecertify em curso, sem aceitar resultados futuros.

- 17/10/2026: revisão independente APPROVE_SCOPED_DIFF/29probes próprios verdes; revisor encerrado. Certify vivo PID1365904/sessão11437 em unit, quatro gates préviosPASS. Handoff recuperável publicado; não há verificação de completude global enquanto o processo roda.

- 17/10/2026: certify tentativa1 NO_GO preservado (15PASS/E2EFAIL por dist ausente ao iniciar Vite). Preparação oficial e E2E vinculado separado12PASS/zero skips/flaky; consumidor revalidado PASS. Tentativa2 completa ativa na sessão2201/PID1429276, mesmo source/candidateId. Sem alteração de código ou critérios.

## Fechamento técnico — 17/10/2026

14/14aceites demonstrados; revisão independente APPROVE_SCOPED_DIFF,16/16gates locais PASS,3479unit/302PG/12E2E sem falhas/skips. `certification:verify` PASS/38hashes; fontes congeladas intactas; consumidor público final PASS. Normal/strict final INCOMPLETE idênticos,471diagnósticos/303instalados,12,04s/10,79s;3diagnósticos gerados novos explicados,nenhum perdido. Tentativa1 NO_GO preservada e recuperação ambiental comprovada antes da tentativa2. Recursos próprios encerrados. [Relatório e matriz](../04_audit/evidence/B6-0228-BUILD-20261017/REPORT.md). Última ação: conclusão técnica e documental da unidade; próxima: prova positiva futura no cartão pai HISO-005/B6. Nenhum aceiteB6/produção,integração,push/deploy.
