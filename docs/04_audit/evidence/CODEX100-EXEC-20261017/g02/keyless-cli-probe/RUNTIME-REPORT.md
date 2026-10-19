# G02 — nove observações reais da referência Linux/default

O build próprio do fonte oficial8d9f6466 terminou com sucesso e produziu o ELF original de1477793024bytes, SHA5cce726469af232c080355eff2a49ded7b6fbe26eaf7a702e6e15ce3e89f2605. [Atestado do build](../reference-compilation/build-provenance.json), [aceite Lead](../../g02-reference-Lead-acceptance.json) e [revisão independente](../reference-acceptance-review/review-r1/review.json). O revisor conferiu o SHA integral do ELF; sua rechecagem dos demais insumos foi por amostragem, sem alegar uma segunda verificação integral das árvores.

Sessão24933/tentativa keyless-b9ab371c1b terminou0, sem primeira falha ou erro secundário. Scope próprio inativo/cgroup removido, quatro comandos com exit0 e nenhum encerramento forçado. O ELF permaneceu byteidêntico. Nove observações em quatro comandos:

| Entrada | Observação real |
| --- | --- |
| --version | codex-cli0.0.0; não0.163.0 do instalado |
| --help | Help emitido pelo ELF do pin |
| app-server --help | Help do subcomando emitido pelo mesmo ELF |
| thread/list antes de initialize | -32600/Not initialized |
| initialize com nome contendo newline | -32600/Invalid clientInfo.name, sem consumir inicialização |
| initialize válido | userAgent próprio0.0.0, codexHome privado, platformFamilyunix/platformOslinux |
| initialize duplicado | -32600/Already initialized |
| thread/list inicializado | data vazio, readStates vazio, nextCursor/backwardsCursor null |
| método sintético desconhecido | -32600/Invalid request, com causa de variant desconhecida |

Os seis requests tiveram exatamente uma resposta correspondente cada; houve também uma notification real remoteControl/status/changed. As respostas não possuem campo jsonrpc. Não houve pedido de modelo/ferramenta/conta. A home/passwd eram sintéticas; os arquivos SQLite de startup são efeitos locais privados do ensaio, não dados institucionais.

Os [brutos da tentativa](keyless-b9ab371c1b/terminal.json) incluem argv, stdin JSON, stdout/stderr binários, capturas estruturadas, guardas pré-exec e provas de namespace/kernel/cleanup. O coletor ficou fora dos mounts graváveis do ELF; logs do coletor chegaram por pipes. Limites reais4GiB/2CPU/256tasks/0swap/180s foram conferidos antes da execução. A guarda estática do HOW e seus controles próprios não substituem estes brutos.

Este resultado aceita somente a referência Linux/default e os casos observados. Versões de SDK, instalado0.163, outros binários/plataformas/opt-ins, tool/model/approval/stream/restart e a comparação com a implementação CVG continuam abertos. O artefato é um build próprio, sem afirmação de assinatura de release oficial ou reprodução bit a bit independente. **Nenhum recibo de paridade funcional foi concedido.** O [README de preparo](README.md) e seu HOW-manifest preservam a etapa histórica anterior à execução.
