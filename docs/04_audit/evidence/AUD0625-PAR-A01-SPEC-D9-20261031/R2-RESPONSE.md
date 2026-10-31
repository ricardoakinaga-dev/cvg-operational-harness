# Resposta à conferência da sessão 07 sobre a SPEC 0296 R1 (`919ee9329`) — R2

Autor: Claude D9. R1 `b528a392a`. Só documentos e testes RED; sem BUILD.

| Achado | Resposta | Onde |
|---|---|---|
| P2-N1 A7 quebra a reconexão do `EventSource` | Regra trocada: o cabeçalho é a posição de retomada e `?after=` a inicial. Com os dois, vale o cabeçalho se for ≥ `after`; cabeçalho < `after` ⇒ `400`; só um ⇒ vale o presente; cabeçalho que não é inteiro ≥ 0 ⇒ `400`. RED-5 trocado (`after=1` com cabeçalho 2 ⇒ 200 e recebe 3 e 4; `after=2` com cabeçalho 1 ⇒ 400; além do fim ⇒ 409). Novo RED-11 com listener real: abre com `?after=2`, lê 3 a 5, reconecta com a mesma URL e `Last-Event-ID: 5` e recebe 6 a 8. Par do §9 trocado. | A7, §5.1, §7, §9, RED |
| P2-N2 saturação derruba streams e o recuo sincroniza a volta | (a) A espera pelo semáforo de uma conexão estabelecida **nunca encerra**: fila FIFO, o intervalo até o próximo quadro se alonga (`max(POLL_MIN_MS, espera observada)` com jitter) e `source_unavailable` fica para falha real da fonte; latência máxima declarada em 10 s com 200 conexões e 8 permissões. A pré-verificação de uma conexão nova que espera mais de 5 s recebe `503 Retry-After` com jitter antes dos cabeçalhos. (b) O servidor soma jitter (0 a 50%) ao `retry:` de cada conexão. (c) Prova da BUILD: 200 conexões ativas com 8 permissões, nenhuma encerrada e latência máxima abaixo de 10 s; `retry:` de 100 conexões encerradas juntas diferentes. | §4, §5.2, §6, §9, D4/D9 |
| P3-1 a vaga volta quando o laço termina | A vaga volta no evento `close` da resposta, desacoplada do gerador (medido: abort aos 24 ms, `finally` aos 3025 ms). O `AbortSignal` interrompe o recuo e a espera do semáforo; a leitura em voo termina por si (≤ 5 s) e só o `permit` do semáforo fica preso até lá. Par: cliente que aborta com leitura em voo de 3 s libera a vaga em muito menos. | A13, §9 |
| P3-2 posição do `retry:` | Imediatamente antes do `event: end`; o quadro de exemplo foi corrigido. | §5.2 |
| P3-3 HEAD 404 | `GET` com `exposeHeadRoute: false` e rota `HEAD` explícita que responde 405 com `Allow: GET`, depois do gancho de sessão. | §5.1 |
| P3-4 bytes em voo | Declarado: bytes de registro, não RSS; o RSS é medido à parte na fatia 3, como na 0295. | A9 |
| P3-5 sinal na leitura | Declarado: `SessionEventStore.read` não recebe sinal; o sinal vale para esperas e semáforo, a leitura em voo termina por si. | A13 |
| P3-6 modo de identidade | `simulation`: aceito sem revalidação, documentado, com vida máxima; só o modo confiável tem a garantia do A10. Na revalidação também se confere `identity.tenantId` igual ao do pré-voo e a permissão do papel para a rota. | A10, §9 |
| P3-7 ordem e texto velho | Ordem definida: autenticação, reserva da vaga (operador, tenant, global), pré-verificação, cabeçalhos; a recusa por limite vem antes de qualquer leitura. §8 sem o "registro de stores". | A8, §8, §9 |

D4 e D9 passam a depender do P2-N2 já fechado (saturação degrada, não derruba). RED: 2 controles e 11 `it.fails`.
