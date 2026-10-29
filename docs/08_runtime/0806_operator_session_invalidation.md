# 0806 — Invalidação global das sessões de um operador (SPEC 0262 §6.1)

Operação local, **não** é rota HTTP, tool de modelo nem comando despachável pelo serving.

```
tsx scripts/revoke-operator-sessions.ts --tenant <tenant_…> --operator-id <id> \
  --expected-revision <n> --proof <caminho absoluto da decisão aprovada> [--apply]
```

- Dry-run é o padrão e não conecta. `--apply` exige euid 0, a política fixa `/etc/cvg/operator-action-policy.json` (regular, sem symlink, root:0600, pais não graváveis por outros; **sem** flag ou variável para trocar o caminho), o artefato instalado, o perfil do datastore e a prova.
- O efeito é só `case_principals.revision + 1` (identidade intacta), com evento `policy_decision` (`operator_sessions_invalidated`: alvo, antes/depois, operador local, digests); todo cookie ligado à revisão anterior deixa de valer. Nenhuma escrita no schema Auth.
- A prova (JSON estrito ≤ 4 KiB, root:0600, no diretório de decisões root:0700, nome `<decisionId>.json`) vincula tenant, operador, revisão, artefato e perfil, com janela ≤ 30 min. A autoridade é a **atestação do administrador local do SO** que instala a política e a decisão; o programa não prova criptograficamente uma aprovação humana.
- Revisão desatualizada ou principal ausente: REFUSED (nada criado). COMMIT incerto: UNKNOWN; reconciliar por revisão, auditoria e digest da prova — **não** repetir com outra revisão.
- Evidência local: parser/bindings com fixtures e lançamento não-root recusado. Lançamento positivo como root e perfil real do datastore: NOT_RUN até o ambiente T4.
