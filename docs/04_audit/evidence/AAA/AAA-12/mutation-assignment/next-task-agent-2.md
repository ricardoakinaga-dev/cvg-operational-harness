# Agente 2 — AAA-12: mutação dirigida dos guards críticos

A cobertura do canal foi aprovada. Execute somente a verificação de que os testes detectam regressões nos guards críticos do AAA-12. Base normativa: AAA-04 v2 §9.1 exige 100% das mutações selecionadas detectadas, com seleção antes da execução. Isso não equivale a 100% de mutações arbitrárias nem fecha G_QUALITY.

## Preparação e escopo

Leia AGENTS, runtime/log/backlog, AAA-03/AAA-05 congelados e `docs/04_audit/evidence/AAA/coordinator-batch-review/REVIEW.md`. Confira os 14 hashes do candidato C4 e os quatro testes de coverage-hardening. Capture cópia consistente isolada com os bytes atuais e dependências locais; não use apenas HEAD. Preserve a árvore compartilhada. Nenhuma escrita de mutantes em arquivos de produto da origem.

Antes de executar qualquer mutante, publique `docs/04_audit/evidence/AAA/AAA-12/mutation-hardening/selection-v1.json` e seu hash com matriz guard→invariante→mutação exata→teste discriminante esperado, arquivos/linhas e hashes, comandos e timeout. Selecione ao menos uma mutação válida para cada família abaixo; diferencie implementações memory/file quando houver guards próprios:

1. Versão inválida/desconhecida deixa de falhar fechado (incluindo null como legado).
2. Colisão mesma identidade/payload diferente deixa de rejeitar.
3. Reserva/claim deixa de ocorrer antes do envio.
4. Token/owner obsoleto consegue completar ou renovar lease de outro owner.
5. Estado SENDING expirado ou resultado incerto permite retry cego.
6. Replay CONFIRMED volta a enviar ou FAILED volta a ser retryável.
7. Identidade deixa de isolar tenant/canal.
8. Gateway reporta sucesso apesar de perda de confirmação ou journal indisponível.

Mutação deve ser alteração pequena, compilável e alcançável que viole o contrato; não basta deletar código aleatoriamente. Justifique ausência de um guard em implementação específica antes da execução. Preserve versão inicial, sem trocar sobreviventes por mutantes fáceis.

## Execução e aceite

- Baseline original deve passar. Cada mutante roda em cópia limpa, sem acumular mutações. Registre patch/hash, comando, teste/assertion que detectou a violação, stdout/stderr, exit e duração. Um controle original deve passar ao remover a mutação.
- Só conte KILLED quando assertion comportamental pertinente falhar; erro de sintaxe, importação, infraestrutura, timeout ou teste não executado são INVALID/BLOCKED, não detecção válida. Registre SURVIVED honestamente. Equivalência exige justificativa verificável e não pode retirar um sobrevivente do denominador silenciosamente.
- Se sobreviver, acrescente teste comportamental pela API pública que passe no original e falhe no mutante. Autorizados na origem apenas `packages/channel-gateway/src/__tests__/` e evidências próprias; produto/config/package/lockfile permanecem inalterados. Se identificar defeito do original, preserve RED e entregue diagnóstico antes de ampliar correção.
- Meta: 100% dos mutantes válidos selecionados detectados; publicar denominador original, inválidos, sobreviventes e resultado final, sem alegar abrangência além da seleção. Reexecute o conjunto fixado após alterações de testes. Preserve os 105 testes do canal e pisos de coverage já aprovados. Gates apropriados para testes alterados, relatórios em destino privado.

Sem SQL, migrations, AAA-21, @cvg/shared, runtime, banco operacional/55432, env real, rede de provider, certificação compartilhada ou registros comuns. Não instalar tooling/alterar lockfile; harness local simples nas evidências é suficiente. Sem commit/push/deploy ou delegação adicional.

Entregue IMPLEMENTED_PENDING_INDEPENDENT_REVIEW ou BLOCKED com manifesto, seleção imutável/hash, resultados por mutante, logs, patches, novos testes se necessários, hashes de produto antes/depois, cobertura/regressões e limitações. Não marque DONE nem inicie outra task. O coordenador revisa e integra.
