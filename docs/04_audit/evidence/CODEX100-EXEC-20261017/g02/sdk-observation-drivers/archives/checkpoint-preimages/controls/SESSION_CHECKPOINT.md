# Checkpoint para reinício da sessão — CODEX100

Registrado em 18/10/2026 por solicitação do usuário. Programa **IN_PROGRESS**;
a unidade de drivers está **parcial e não qualificada**. A meta continua sendo
incorporar ao Operational Harness todas as funções do Codex do pin
`8d9f6466ff0294785d56f55b1fe363d132fe4133`.

Para retomar, peça: **“Continue do checkpoint CODEX100 em
sdk-observation-drivers/SESSION_CHECKPOINT.md.”**

Ação canônica: `DX100-G02:IMPLEMENT-SDK-OBSERVATION-DRIVERS`.
Leia primeiro [a task de retomada](next-task.json), [o estado estruturado](checkpoint.json)
e [o checkpoint do builder Node](node/checkpoint.json). Confira hashes em
[checkpoint-manifest.json](checkpoint-manifest.json) e no [manifesto do programa](../../manifest.json)
antes de retomar, além das instruções e dos claims atuais. Não reinicie processos antigos.

## Entrega preservada

- HOW de referência SDK R2 aprovado, 39 snapshots e 19 casos propostos. Sete
  dependências autenticadas como dados; 301 arquivos extraídos e 169 cópias
  Python. Nenhuma importação de SDK/Pydantic ou execução do compilador.
- Quatro fontes Node parciais: channel.cjs, adapter-typescript, fixture-cli.mjs
  e ts-driver.mjs. Ainda sem syntax check, testes ou revisão independente.
- Python: somente admission-probe.py e bootstrap.py. Scripts privados de
  lançamento preservados em archives/. Canal, adapters, peers, drivers e
  supervisor Python ainda precisam ser implementados.
- Primeiro diagnóstico falhou pelo PWD acrescentado por bwrap; falha mantida.
  Segundo diagnóstico passou após bootstrap com execve e sete variáveis exatas.
  Esse PASS cobre apenas primitivas de isolamento/FIFOs/limites; não qualifica
  relays, protocolo completo, cleanup sob falhas ou os 19 casos SDK.
- 2.914 inputs anteriores imutáveis conferidos; nenhuma divergência. Seis
  controles próprios são mutáveis. Nenhuma fonte parcial foi descartada.

## Estado de execução e pendências

Mendel retornou handoff parcial e foi encerrado por close_agent. Consulta
atual de ambos os serviços: MainPID=0, inactive/dead, not-found; cgroups
removidos e inventário do prefixo sdkdiag vazio. Nenhum job próprio ativo.
[Recibo](checkpoint-resource-receipt.json). Os 12 FIFOs privados permanecem como
nós inativos, inventariados por stat; não foram lidos no checkpoint.

Na retomada, revisar as expectativas Node de fifo_stat/fifo_nodes, peer_argv,
configuração de admissão e catches de telemetria antes de integrar. Faltam
transpile.mjs, extension-loader.mjs, fixture-cases e metadados do perfil,
além de toda a composição Python/supervisor. O checklist completo está nos
JSONs acima. Preservar interface-v1 e HOW R2; não relaxar o contrato para
acomodar código incompleto.

Budget da unidade: 2/12 serviços consumidos, 0/2 críticas e 0/1 reparos
agrupados. Não resetar contadores após reiniciar. Novo uso de recursos exige
claim atual. Os 19 casos SDK seguem NOT_RUN; alvos SDK/compilador dependem de
admissão posterior separada. Caminhos /tmp são efêmeros: validar presença e
hashes antes de usar; ausência não autoriza reinstalação ou downloads.

SPEC0239 SHA `ccdf3a754c460e138307148f9eec79e0dce4a9b7ac5c9d10334716e5b5c0dd87`
continua REQUESTED_PENDING_USER, com oito anexos preservados. Não repetir a
pergunta já enviada nem inferir aprovação deste checkpoint. Aprovações
0221/0225/0231 resolvidas. Owners 0029 → 0030 → 0031 permanecem independentes.

Catálogo: 487 obrigações funcionais + 22 controles, todos NOT_RUN/null receipt.
Seis lacunas SDK continuam abertas. Nenhum crédito de paridade por este
checkpoint. Masters compartilhados 99/20/30/0190 ficam readonly por coordenação;
delta correspondente registrado no handoff próprio. Nenhum commit, push ou deploy.
