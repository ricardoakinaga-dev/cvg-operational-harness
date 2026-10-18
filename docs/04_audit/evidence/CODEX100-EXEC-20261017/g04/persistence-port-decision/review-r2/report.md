# Revisão documental R2 — segunda e última rodada

**APPROVE_BOUNDED_SOURCE_DECISION — mandatory_count: 0.** R1-01 fechado documentalmente. O reparo transporta as restrições conhecidas para as portas e o handoff, rastreia a elegibilidade ainda UNKNOWN e impede BUILD dos caminhos não resolvidos. Aprovação limitada ao mapa de reuso de fontes; não aprova solução runtime, SPEC completa, implementação ou release.

Task `DX100-G04:RESOLVE-CANONICAL-PERSISTENCE-PORTS`, SHA-256 `a0b1d5bc6e4dda34a08e2b6829bc8c5aea7c45a66723d85c22e115a720275953`. [Freeze R2](../review-freeze-r2.json): `9dcf3fb87b29360380909aeaaa0adddb0a15aecd9ec4ab227bc20ec54c0fdbc0`,50inputs. [DECISION.md](../DECISION.md): `c13054416e95d50fe9926d308896d25671b88fc157dffa83523e68c4ef983db9`. O [plano de reparo](../R1-01-repair-plan.json) declara um único reparo agrupado, com pré-imagens vinculadas; seu registro antecede o freeze R2.

## Fechamento do R1-01

Severidade anterior P2/MEDIUM; status **CLOSED_DOCUMENTARY**, sem finding obrigatório remanescente.

| Critério da R1                                                                                                                                                                  | Prova primária                                                                                          | Correção no sujeito R2                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| CAS não cria autoridade de worker ou ACK externo; reserva alheia pendente permanece UNKNOWN, sem settle/cancel/nova chamada                                                     | [A05](../inputs/A05.source.txt), linhas368–403, especialmente391–403; reserva/admissão também em321–332 | DECISION, linha49; PP03.standalone_restrictions e CP03                                                                   |
| Standalone isolado não mistura writers antigos/novos; compartilhamento, integração de host e versões mistas requerem gate; acesso direto legado não é contido por contrato novo | A05, linhas396–403                                                                                      | DECISION, linhas49 e81; PP03 e CP09                                                                                      |
| Guard opcional unbound sem fence retorna null; CAS não deve ser promovido a guarda genérica                                                                                     | [G01](../inputs/G01.source.txt), linhas127–152; [S02](../inputs/S02.source.txt), linhas319–350          | DECISION, linha55; PP04.path_eligibility e CP04                                                                          |
| Elegibilidade de epoch/owner standalone e claim/lease/dispatch/settlement genéricos de worker deve estar comprovada ou explicitamente UNKNOWN, com owner e próximo passo        | Ausência de prova nesses vínculos não é ausência de mecanismo no sistema                                | PP04 e CP09: UNKNOWN, bloqueio de BUILD por caminho, owner Codex+PAR, obrigação na SPEC seguinte; DECISION, linhas55 e81 |

Os quatro ranges adicionados coincidem exatamente com bytes, linhas, paths e hashes dos inputs anteriores. A05: `f3bc9a6115d17abb4185644cfc998f7aef39164774afff00042a64202b2c49ea`; G01: `c73c3fa055fb5ad385da86c445dce4a360f262dd179450277a8489713787ce7c`; S02: `e110ee06553b5612a798f8b8966516d3f7c4e416b4850a764e052db0f7c14cbd`.

Não foi exigido resolver epoch, wire, terminal/entrega ou implementar uma guarda nesta task. CP09 é a disposição explícita da lacuna e sua condição de entrada futura, não prova de runtime nem ampliação de autoridade. A restrição do operationKey bound permanece; generalizar seu matcher não recebe crédito de admissão genérica.

## Integridade e suficiência mantidas

A comparação com as pré-imagens confirma alterações somente em DECISION, port-bindings e source-spans entre os38inputs R1. No JSON das portas, o delta fica em PP03/PP04, CP03/CP04, CP09 e metadata do reparo. Os76registros de spans anteriores estão preservados; quatro foram acrescentados, total80. Os31arquivos primários arquivados, source-inputs, contratos e decisões humanas permanecem iguais. A autoridade original+reduções revisadas0221/0225 aceita na R1 não é reaberta nem ampliada.

O [recovery R1](../R1-subject-recovery.json) foi conferido contra o freeze R1:35inputs nos paths originais e três pré-imagens reconstruem os38bytes/hash-bound inputs. Os seis outputs do [manifesto R1](../review-r1/manifest.json) e o próprio manifesto conferem com os hashes anteriores. O veredito histórico REVISE foi preservado.

Permanecem válidos no escopo documental: cinco portas para CQ07/09/10/11/12; CQ01–14 obrigatório; alternativa mínima de reuso sem stores/migrations duplicados; distinção Root/desenho/WIP; journal, checkpoint, sessão, terminal e entrega como fronteiras separadas; limites1MiB/8MiB independentes; tickets0221 adiados; restrições de cutover; nenhum certificado0231 ou observação44casos do owner transferido à jornada. O reparo não muda esses fatos ou concede BUILD.

A maior lacuna residual é CP09, agora explicitamente rastreada e bloqueante para BUILD do caminho, sem impedir este aceite documental. CP01–CP08 e os contratos wire/cursor/pressão/cancel/terminal/ACK continuam para a SPEC completa e suas provas futuras.

## Controles realizados e limites

[Inputs antes](inputs-before.json) e [depois](inputs-after.json):110registros idênticos, sem mismatch —50inputs R2, dois freezes,31fontes primárias e27projeções R3. G01/G02 também conferidos por objeto Git e blob ID declarados. Reconstrução38R1, manifesto+seis outputs R1,80excerpts e referências de portas/gaps foram revalidados. Diff textual/JSON inspecionado; não houve execução de código-alvo.

[Checks locais](checks.json): JSON estrito, links relativos com destinos locais existentes e formato do próprio relatório via Node22/Prettier `--ignore-path /dev/null`. O [manifesto R2](manifest.json) vincula outputs, sujeito e task, sem selfhash. Lead fará a revalidação independente e o aceite dos outputs.

Mesmo crítico independente da R1, agora R2 final; duas rodadas e um reparo agrupado consumidos. Escrita somente nesta pasta nova e no TMP permitido. Sem descendentes, mutação de R1/sujeito/fontes/coordenação/ledgers, import de app, probes, rede, PG, Docker, build, gates ou testes. **Full runtime: NOT_RUN; functional_receipts: 0.** Hash e inspeção de texto não certificam comportamento ou qualificação operacional.

Próxima ação após aceite do Lead: `DX100-G04:SPECIFY-FULL-NATIVE-JOURNEY`, preservando CP09 e demais gates de entrada. Não há terceira revisão ou novo reparo automático autorizado nesta unidade.
