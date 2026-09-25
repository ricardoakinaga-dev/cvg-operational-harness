# 0200 — Política de retenção de evidência de auditoria

- ID: `POL-EVIDENCE-001`
- Estado: `POLICY_REGISTERED / APPLICATION_PENDING_HUMAN_APPROVAL`
- Origem: [RA25-10](../03_build/0351_audit0573_backlog.md), onda D4 de
  [0350](../03_build/0350_audit0573_roadmap.md).
- Escopo: `docs/04_audit/evidence/` e o catálogo
  `docs/04_audit/evidence/empty-artifact-status.json`.

## Números de referência (2026-09-25)

| Métrica                      | Valor |
| ---------------------------- | ----- |
| Tamanho                      | 45 MB |
| Arquivos                     | 2 889 |
| Artefatos vazios catalogados | 231   |

## Princípios

1. **Evidência citada por gate é imutável e permanece no lugar.** Qualquer
   arquivo referenciado por `docs/02_spec/0190_spec_validation.md`, por
   `docs/04_audit/evidence/**/sha256sums.txt`, por `docs/03_build/0344_*`,
   `docs/20_master_execution_log.md`, `docs/99_runtime_state.md` ou por um
   `manifest.json` de certificação **não** é movido, renomeado nem compactado.
2. **Hash e registro de comando auditado são preservados.** Mover um artefato
   permite atualizar o caminho no registro que o cita, mas nunca o SHA-256 nem
   o comando que o produziu. Rehash é proibido: um hash novo invalida o gate.
3. **Só sai do alcance da varredura o que não for referenciado.** A ordem é
   (a) citado por gate → imóvel; (b) citado apenas por prosa de auditoria →
   imóvel até o registro ser atualizado; (c) não referenciado → elegível.
4. **Artefato vazio é evidência, não lixo.** A distinção entre "arquivo ausente"
   e "arquivo presente e vazio" é ela própria um achado auditado. Nenhum dos
   231 vazios é apagado; o catálogo
   [empty-artifact-status.json](../04_audit/evidence/empty-artifact-status.json)
   permanece a fonte única dessa contagem.
5. **Nenhum dado real entra no acervo.** A trilha continua sintética e
   controlada; produção permanece `NO_GO`.

## Classes de retenção

| Classe | Definição                                | Ação permitida                                                               |
| ------ | ---------------------------------------- | ---------------------------------------------------------------------------- |
| R0     | Citado por gate, SPEC ou ledger mestre   | Nenhuma; imóvel                                                              |
| R1     | Citado por prosa de auditoria ou backlog | Nenhuma até o registro ser atualizado no mesmo commit                        |
| R2     | Não referenciado, com hash verificável   | Arquivamento externo ou remoção, com registro do caminho e do hash removidos |
| R3     | Vazio e catalogado                       | Nenhuma; permanece como contador de achado                                   |

## Procedimento de aplicação

1. Gerar o inventário de referências: `grep -rl` do caminho relativo de cada
   artefato em `docs/`, mais o cruzamento com os `sha256sums.txt` e
   `manifest.json` de certificação.
2. Classificar cada artefato em R0–R3 e publicar a lista proposta para
   aprovação humana explícita. **Sem essa aprovação não há movimento.**
3. Mover apenas itens R2, em um commit por classe, registrando origem, destino
   e SHA-256 no ledger da rodada.
4. Reexecutar, a cada movimento, `npm run evidence:check-hygiene` e
   `npm run docs:check-links`; ambos precisam sair com `exit 0`. Falha em
   qualquer um reverte o movimento.

## Critério de pronto

- Política registrada em `docs/` — **cumprido por este documento**.
- `npm run evidence:check-hygiene` → `exit 0` e `npm run docs:check-links` →
  `exit 0` antes e depois da aplicação — verificado nesta rodada sem aplicar
  movimento algum.

## Autorização

- Aplicação (passos 2–4) exige aprovação humana sobre a lista de itens R2.
  Esta política **não** autoriza remoção, compactação ou rehash por si só.
- Teste de linhagem: RA25-10 em `docs/03_build/0351_audit0573_backlog.md`.
