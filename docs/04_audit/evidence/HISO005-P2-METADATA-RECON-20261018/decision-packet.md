# Decisão T3 — BUILD local da SPEC0240

Contrato concreto: [SPEC0240 — seleção Node exata com metadados inativos](../../../02_spec/0240_b6_node_metadata_resolution_scope.md).

SHA-256: `1c14d92852a6d33475a67b533aadfd22ce01e54b86252c404258d33ef0895161`.

## Resultado solicitado

Autorizar a implementação local `HISO005-P2-BUILD-0240` do delta finito: aceitar mapa imports elegível não requisitado e exports literal exato com pattern elegível inativo. Hoje esses casos são UNKNOWN por presença de metadado; depois poderão obter prova somente quando aquisição, corpo, sucessores, proveniência e todas as regras conservadoras forem satisfeitos.

O contrato mantém browser, imports/patterns ativos, reflexão opaca, módulos nativos, interop e dist sem proveniência correspondente como impedimentos. Preserva violações de produto já conhecidas, exige detectar os novos targets selecionados adquiríveis dentro dos limites e nunca ultrapassa caps para descobrir um alvo ainda desconhecido. Não existe dispensa por pacote Vitest, nome de arquivo de teste ou URL resolvida.

## Evidência e revisão

[Recon executado](REPORT.md):359 origens mantidas/358 arquivos físicos/360 recusas na guarda949; quatro oracles reais e28 casos privados de resolução;14 controles de corpo executados na v2. Uma origem sem arquivo físico continua sem atribuição. Nenhuma prova nova foi concedida à fronteira real.

[R2 final independente](review-r2/REPORT.md): APPROVE_SPEC/zero obrigatórios e opcionais,12 cenários documentais, após esclarecer um P2 de R1 sobre aquisição antes de conhecer o alvo. Lead verificou [35 artefatos/29 snapshots R2](lead-review-r2-verification-final.json) e45/34 R1; originais e pareceres permanecem congelados. Duas rodadas documentais encerradas; crítico fechado. Isso não substitui revisão da futura implementação.

[Reconciliação](lead-reconciliation.json):11 checks PASS, incluindo pacote0237 inteiro590/53.903.975bytes,20 fontes,Root7/índice/HEAD e bytes brutos dos controles. [Checks documentais](document-checks-final.json) e [aceites T1](ACCEPTANCE.md) completam este pacote; não são certificação de aplicação.

## Execução permitida após aprovação

[Plano0391](../../../03_build/0391_hiso005_semantic_proof_execution.md) define M0–M5: claim/candidata nova baseada em84d8; delta próprio e primeiras falhas v2 preservadas; controles MS01–09 e freeze; crítica fresca de código, até duas rodadas;16 gates Node22/verificador38 hashes da fonte atual, consumidor físico fresco e medição integral normal/strict; promoção só dos deltas próprios por pré-imagens e cleanup por identidade.

Todos MS01–12 estão **NOT_RUN**: não há implementação0240, certificação ou consumidor novos nesta preparação. B6 permanece INCOMPLETE1609=537 baseline abertas+1072 novas,303 MATCH/zero verified/zero provas. Metadados resolvidos não fecham os demais impedimentos de Vitest e não prometem queda de contagem. O ledger conserva as1721 tuplas históricas e1072 atuais sem crédito automático por migração de perfil.

## Por que a decisão é nova

Aprovações0236/0237 estão resolvidas e a construção0237 foi concluída. A0240 amplia as premissas positivas do kernel, além do contrato que explicitamente recusava esses metadados. A regra nativa [D-12/T3](../../../07_agents/AGENTS.md) exige **“revisão explícita da SPEC pelo usuário antes do BUILD”** para mudança de segurança/policy. Não há pedido para repetir aprovação anterior.

A decisão solicitada cobre somente BUILD local dessa SPEC/hash e seus gates/integração delimitados. Produção, release, dados reais, providers, ações clínicas/financeiras/de agenda, push e deploy continuam fora do escopo. Se não aprovada, preservar fonte84d8, evidências e baseline atuais; não iniciar código0240. Se aprovada, registrar autoridade em novo pacote de BUILD, sem editar este pacote T1 selado.
