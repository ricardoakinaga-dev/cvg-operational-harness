# SPEC 0314 — Tirar a evidência pesada do caminho do clone

Status: `DECISIONS_RECORDED_AWAITING_BUILD_GO`. Trilha **T3** (afeta evidência hash-bound e fluxo de clone). Data: 04/11/2026. Origem: achado P3 da [auditoria 0626](../04_audit/0626_repository_audit_2026-11-04.md). **Nada foi removido nem reescrito.**

## 1. Reconhecimento

- `docs/04_audit/evidence` ocupa ~4 GB no checkout e ~87 mil arquivos versionados; o pacote Git tem 1,32 GiB. Maiores: `HARNESS-ISO-EXEC-20261003` (1,4 GB), `PARE100-EXEC-20261014` (0,9 GB), `CLAUDE100-EXEC-20261017` e `CODEX100-EXEC-20261017` (~0,5 GB cada).
- `docs:check-links` e `check-evidence-hygiene` varrem a árvore (43.839 JSONs); `.gitleaks-reviewed.json`, `doc-link-policy.json` e manifestos de certificação referenciam caminhos e hashes de evidência.
- O remoto é clone parcial (`blob:none`), o que já alivia leitura, mas não busca nem o checkout.

## 2. Alternativas

| Opção                                       | O que faz                                                                                                                                                                  | Custo / risco                                                                                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Só poda do checkout                      | `sparse-checkout` e `.gitattributes` para o time não materializar `evidence/**` por padrão                                                                                 | Reversível, sem reescrever histórico; não reduz o servidor Git. **Recomendada como passo 1.**                                                                              |
| B. Mover para release/storage com índice    | Empacotar cada pasta antiga em `.tar.zst`, publicar (release GitHub/bucket), deixar no repo `INDEX.json` com SHA-256, tamanho e URL, e remover os arquivos num commit novo | Histórico continua com os blobs (sem ganho no `.git`); quebra links relativos e exceções do gitleaks/policy que apontam para os arquivos. Exige atualizar esses controles. |
| C. Reescrever histórico (`git filter-repo`) | Remove os blobs do histórico                                                                                                                                               | Invalida todos os SHAs de commit citados nos ledgers, tags de arquivo e PRs; só com decisão explícita e backup. **Não recomendada.**                                       |

## 3. Regras (valem para A e B)

R1. Antes de qualquer remoção: manifesto SHA-256 de todos os arquivos da pasta, pacote `.tar.zst` verificado por extração e comparação, e cópia em dois locais independentes.
R2. Pastas citadas por gate vigente (certificação ativa, barra 0373/0368, manifestos de release) ficam no repositório.
R3. O índice no repo traz: pasta de origem, SHA-256 do pacote, nº de arquivos, bytes, data e local de guarda. `docs:check-links` passa a reconhecer o índice como alvo válido.
R4. Nenhum `git filter-repo`, `reset`, force-push ou remoção de tag de arquivo sem decisão D1.

## 4. Critérios de pronto (opção A, depois B por pasta)

C1. Documento de clone enxuto (`sparse-checkout`) no README e teste de que `docs:check-links`/hygiene passam com e sem `evidence/**` materializada.
C2. Para cada pasta movida: pacote verificado, índice commitado, `docs:check-links`, `evidence:check-hygiene`, gitleaks e `npm test` verdes.
C3. Ledgers registram a movimentação; arquivos de política atualizados sem enfraquecer exceções.

## 5. Decisões para o usuário

- **D1:** autoriza a opção A agora? Autoriza B (e em quais pastas, sugestão: `HARNESS-ISO-EXEC-20261003` e `PARE100-EXEC-20261014` primeiro)? Confirma que C está fora?
- **D2:** onde guardar os pacotes (release privado do GitHub, bucket, disco `/mnt/dados`)? Precisa de duas cópias.
- **D3:** retenção: por quanto tempo manter a evidência recuperável (política `0801_evidence_retention_policy.md`)?

## 6. Decisões registradas (04/11/2026, usuário)

- **D1 = somente a opção A** (`sparse-checkout`). As opções B e C ficam fora; nada será movido, removido ou reescrito. Nenhum histórico, tag de arquivo ou SHA citado é alterado.
- D2 = não se aplica agora. Se a B for reaberta: release privado do GitHub (cópia 1) e `/mnt/dados` (cópia 2).
- D3 (retenção) = sem mudança; vale `0801_evidence_retention_policy.md`.
- Escopo do BUILD: documentar e testar o clone enxuto (C1). Os critérios C2 e C3 só se aplicam se a B for reaberta.
- **Pendente:** autorização explícita de BUILD.
