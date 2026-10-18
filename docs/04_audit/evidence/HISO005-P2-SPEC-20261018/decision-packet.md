# Decisão concreta — BUILD local SPEC0236

Contrato revisado: [SPEC0236](../../../02_spec/0236_b6_semantic_boundary_proof.md), SHA-256 **cf07fd5dd87220cd3c41704a64d2bd294a8b972bfbf230e38fb6c3453fbffa49**. [Revisão técnica final](review/r2/REPORT.md): APPROVE_SPEC, zero achados obrigatórios; R1 e suas correções preservados. O corpo da SPEC fica congelado; aprovação será registrada fora dele.

O pedido “resolva essas outras pendencias” está sendo executado na mesma frente HISO005/B6. A P1 já aprovada está em integração local própria, sob task separada e seus gates; não depende desta nova decisão e sua aprovação anterior não é reaberta. Este pacote decide somente o HOW semântico que a0234 explicitamente não autorizou.

## O que será implementado

Kernel estático conservador K0–K7: rastrear bindings, receptor, corpo efetivo, configuração/resolução e sucessores, permitindo prova somente para construções suportadas. Entrada externa, alias mutável, getter/Proxy/call/bind não coberto, ciclo de prova ou capacidade de execução aberta continua UNKNOWN. A tabela antiga permanece inativa; MATCH sem semântica não gera confiança. Cada ocorrência recebe origem real no emissor, sem confundir diagnósticos idênticos da mesma linha.

Há18aceites SP01–18, todos **NOT_RUN para a implementação0236**: positivo fechado, negativos físicos de produto/receptor/aliases/mutação, espelho compilado novo, erros/limites, contabilidade integral, regressões/gates e revisão independente. Receita compilada usa variante limpa, Node/compiler/config pinados e `tsc -b packages/shared/tsconfig.json --force`, com recibo externo revisado; nenhum script de instalação/aplicação.

O objetivo inteiro continua303nós instalados e168ocorrências históricas de primeira parte, mais todas as obrigações novas. O censo não prova semântica:42arquivos próprios,8.036JS instalados,62relações AST ambíguas. Nativos, bootstrap global e comandos abertos podem impedir fechamento real mesmo após mecanismo correto. **Aprovar este BUILD não aprova aceitar UNKNOWN nem promete B6 verde.** Sua persistência exigirá resolver o caso/regra concreta dentro da mesma frente, com deltaT3 se ampliar confiança ou alterar runtime.

## Escopo autorizado pela decisão proposta

Nova candidata física, scripts internos/testes focais, recursos/cache/config/PG sintéticos próprios, gates Node22 completos e consumidor compilado fresco; integração somente após revisão/gates e pré-imagens conferidas. Sem lock/dependências novos, efeitos reais, mudança pública do sandbox/bootstrap, push/deploy ou produção. O inventário público deve ser regenerado integralmente da API vigente:198imports/72exports são a referência histórica b703; a composição atual já tem207imports/76exports, todos exercitados na prova separada de integração. Contagens históricas não limitam o inventário novo.

## Decisão pendente e fundamento

Decisão solicitada: **aprovar BUILD local sintético da SPEC0236 no hash acima**, ou indicar ajustes no contrato. Pela [constituição operacional D-12/T3](../../../07_agents/AGENTS.md), mudança de segurança/critério de confiança exige **“revisão explícita da SPEC pelo usuário antes do BUILD”**. A pergunta se refere a este contrato agora concreto/revisado; não é uma nova confirmação da0234, da integração mecânica ou de ações já autorizadas.

O catálogo central de artefatos vazios tem dependência operacional independente:23entradas próprias prontas, writerClaude100 ainda ativo. O [patch aditivo](integration/central-catalog-additive.review-only.patch) e o [preflight de fonte](integration/REPORT.md) estão preparados. Não cancelar claim alheio nem aplicar referência de lock antigo na candidata integrada.
