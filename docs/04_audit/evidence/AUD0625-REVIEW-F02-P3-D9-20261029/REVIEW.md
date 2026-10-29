# AUD0625-REVIEW-F02-P3-D9 — revisão independente dos P3 do F02 (Codex)

Commit revisado: `47611886` (`codex/aud0625-f02-p3-20261029`, pai `f4e799b8`), em cópia detached. Revisor: Claude D9 (Sonnet 5.5). Veredito: **APPROVE**, sem achados.

## O que mudou

- Runtime: nada. Fora de `docs/`, o diff contra `f4e799b8` tem um único arquivo, o teste novo `tests/aud0625-process-profile-lifecycle.test.ts` (2 testes). O restante são docs e evidências em `AUD0625-F02-P3-CODEX-20261029`.

## Mutantes

Rodei o teste novo (2/2 passa) e dois mutantes no runtime da cópia, cada um restaurado com `git checkout`:

| Mutante | Resultado |
| --- | --- |
| P3-1: sem `launch.close()` no `finally` de `run.ts` | morto: `AUD0625-OWN-FD-COUNTS {"before":33,"after":[43,53,63]}`, ou seja, 10 FDs por lançamento |
| P3-2: `process-profile.ts` aceita `allowNetwork` (sem a recusa em `invalid_process_grant`) | morto: o lançamento prossegue e o teste de recusa falha |

Cinco execuções seguidas do teste sem mutante deram 2/2 (sem intermitência).

## Por que o teste é bom

- O teste de FD aquece um lançamento, depois conta `/proc/self/fd` após cada um de três lançamentos nativos sucessivos e exige igualdade exata, sem tolerância; antes de contar exige exit 0 e a saída do payload, então um lançamento que falhou antes de abrir FDs não passa por vazio.
- O teste de rede tem controle positivo (o mesmo comando sem `allowNetwork` roda e grava o marcador) e confere o resultado público exato (`spawn_failed`, `process_profile_invalid_process_grant`) e que o marcador não existe.

## Observação (não bloqueia)

- A contagem exata de FDs depende de rodar em worker único com o `/proc` do Linux, que é o contexto do repositório; em outro SO o teste não se aplica.
