# Evidências AUD0593

Leia o [relatório](../../0593_repository_score_audit_2026-10-01.md) e o [resumo](audit-summary.json). Os JSON/logs copiados preservam os resultados originais das execuções na área isolada. `checks.json` consolida comandos e saídas; `scores.json` contém a rubrica, componentes e cálculos. `source-integrity.json` compara os 821 arquivos não documentais da captura com o checkout compartilhado.

## Reprodução das sondas

O arquivo `probes.mts` é uma cópia do script efetivamente executado em `/tmp/cvg-aud0593-20261001/probes.mts`. Seus imports relativos esperam o subdiretório `snapshot/` ao lado do script. Não executá-lo diretamente de dentro deste diretório de evidências.

Com a captura original ainda disponível:

```bash
cd /tmp/cvg-aud0593-20261001/snapshot
env PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/local/bin:/usr/bin:/bin \
  TMPDIR=/tmp/cvg-aud0593-20261001/tmp \
  node_modules/.bin/tsx ../probes.mts
```

Uma nova execução cria somente dados sintéticos em subdiretórios próprios e regrava os resultados temporários; os resultados desta pasta no repositório não são alterados pelo script. Para outra máquina, reconstruir uma captura conforme `source-baseline.json`, ajustar o diretório-base do script e usar Node 22. Não copiar `.env` ou dados do hospital. Ausência de hashes iguais invalida a alegação de reproduzir exatamente o mesmo candidato.

P01–P08 exercitam código original com falhas e entradas sintéticas controladas. `outcome: VIOLATED` é falha ou limitação da invariante avaliada; o exit 0 do script significa que a coleta terminou. Não transforma os oito achados em testes aprovados.

## Escopo de integridade e independência

`docs-inventory.json` é inventário por bytes/hash e títulos, não alegação de revisão semântica de cada log histórico. `bundle-metafile.json` identifica inputs do bundle de aplicação, não componentes da imagem-base ou dependências embutidas no Node. `source-integrity.json` não cobre dados externos nem arquivos fora do manifesto.

Não houve parecer final de revisor independente. As reproduções e o relatório foram verificados pelo auditor principal. `audit-summary.json` registra as tentativas de revisão e os bloqueios de chamadas auxiliares, sem atribuir a eles resultados de execução.
