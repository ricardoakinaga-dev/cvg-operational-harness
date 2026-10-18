# Observação0223 R4

Dois lançamentos da fábrica pública fonte single_pass repetiram a perda de
sandboxWORKSPACE em capabilities: gate zero, corpo em memória uma vez e COMPLETED.
O controle direto WORKSPACE chamou o gate e foi bloqueado; capabilityNONE completou
um eco sem gate. Fingerprints das capabilities iguais. InvarianteFAIL, não GO de
segurança; nenhum efeito externo e nenhuma alteração de produção.

O modelo temporal é local: Node22/Linux, três casos sequenciais no mesmo processo,
Date com resolução1ms e sem descontinuidades. Duração da ferramenta não excede o
turno; cada turno cabe no spanmonotônico externo mais1ms de quantização; soma dos
três turnos cabe no span mais3ms. Auditorias/journals não retrocedem e seu intervalo
cabe na captura externa mais1ms. Anomalia invalida/inconclusiva a prova. Clocks
brutos preservados; nenhuma norma de relógios distribuídos é afirmada.

Passaram45negativos/1controlepositivo e4falhas de launcher com filhos próprios
recolhidos; os28negativos de payload também foram rejeitados pelo validate_run
completo com receipts exclusivamente de teste, nunca aceitos como captura real.
Authority1061paths e receipts com hashes externos ligam os bytes da captura
controlada; não provam host malicioso nem reconstroem toda duração de CPU.

Tipo/lint/formato focados passaram. Packet76b64bd9/24inputs+6constraints em crítica
frescaHume01a143e8, aceite da infraestruturaPENDING. SandboxOS, ABI, ML29, policy
real, outro perfil, dois motores e paridade integral permanecem sem prova.
Programa36critérios/oito fases/2DONE_LOCAL/34abertos intacto;T2global pendente.
Gates220/221/222humanosPENDINGsemreenvio; correção produção depende daSPEC0222.
