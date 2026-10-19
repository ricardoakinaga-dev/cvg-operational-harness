# P01 — retomada pública opt-in em recurso privado

Continuação da mesma implementação0225 aprovada; original e cópia ajustada
intactos. Core WIP7e4ed139:165codec/45preclaimunit e7native journal passaram;
tipagem/lint0. Não qualifica a matriz inteira. Scout8inputs aceito como mapa
estático, não aprovação. Nenhum novo gate humano inferido ou solicitado.

Primeiro incremento: NUL4096 e null, cada um em dois crashpoints separados.
Após CAS APPLIED completo (J09), ou após retorno de confirm nativo antes do
checkpoint completo (J10), estacionar o writer em wrapper privado. O parent
verifica o estado real por outra conexão service, então SIGKILL apenas esse
PID filho, aguarda exit/close e PG sem sessão do writer. Reader em PID novo
usa a mesma identidade, composição/fingerprint e recursos; corpo total1.
Isso não é a janela de commit/préackJ08, nem teste boundJ13.

Extrair o lifecycle do perfil journal já executado para helper privado
`journal-result-resource.ts` (14º path reclamado). Mantém schemas/roles
novos/dedicados, crypto/checksum/RLS/ACL/semDDL/memberships, old42501 e sessões
antigas0 antes de ativar; cleanup snapshotdurável→fechar clientes→DROP somente
ownschema/roles. Perfil público recebe grants diretos necessários em
operational_executions/steps/checkpoints, sem alterar permissões de metadata.

Fixture de processo permanece separada de produção: modo/perfil e argv
finitos, case IDs fechados, binding físico0600/UID/mode/nofollow, CWD real,
hashes de fonte/emits/config e ID/name/image/loopbackDocker conferidos antes
de importtarget. Não executar helpers antigos com CID/paths incompatíveis,
não alterar detector/pins e não aceitar roots/SQL/argv arbitrários.

A composição usa APIs públicas createOperationalHarness, HybridOrchestrator,
createCapabilityRegistry, journal opt-in1 e stores PostgreSQL reais. Só a
ferramenta pura produz o output controlado; o próximo modelo responde por
hash/bytes/tipo extraídos do frame real TOOL_RESULT, sem resposta escondida
fora da ferramenta. Provider e contador são sintéticos toy64, sem alegação de
tokenizer/modelo real. Reserva de saída512 e todos budgets anteriores mantidos.

Registrar por PID chamadas reais de modelo, contagens da ferramenta, medições,
CAS, journal, receipts e uso. Comparar output/tipo/bytes/SHA, journal físico1
com resultSQLNULL, checkpointV2 íntegro e frame observado; receipts distintos
SETTLED e usage somado das respostas reais sem débito duplicado. Rejeitar
trace parcial, mesmoPID, novo corpo, marcador genérico ou pré-condição durável
ausente. Artefatos e erro/cleanup nunca autorizam PASS por contagem de testes.

Perfil fonte/runtime e procedimentos executáveis serão congelados antes de
rodar. Primeiro quatro cenários são incremento, não redução dos demaisJ09/J10:
expandir depois para todas as fixtures e J11/J12. J01–J13/J16 permanecem
obrigatórios e J14/drillJ15 adiados exatamente como aprovado. Crítica fresca
de código, regressões/gates/cert atuais antes de encerramento/promoção. Os43reds
de fronteira/qualificação global continuamP0, nenhum repin ou crédito134.
