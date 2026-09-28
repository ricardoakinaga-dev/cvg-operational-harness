# SPEC 0159 — crítica técnica I1/I2

- Revisor: Carson, contexto independente, somente leitura; 28/09/2026.
- I1: `REJECT_FOR_REVISION`, sem P0. Dois P1: targets `paths` vazios (`TS5066`) não estavam cobertos; disposição dos alertas #6/#7 não exigia justificar orçamento de 300/IP/min. Três P2: corpus diferencial sem oráculo/semente/casos explícitos, `true` acima de 16.384 sem distinguir recusa por tamanho, e limite de 50 ms tratado como gate principal.
- Correção documental: A1–A3 exigem objeto, array não vazio e negativos; [TS5066 sintético](ts5066.json) confirmou o diagnóstico. A disposição #6/#7 exige prova autenticada/PG de limitação antes do efeito **e** orçamento justificado; senão fica aberta e requer adendo T3. B2/B3 especificam limite, oráculo anterior com hash, semente `0xC0DE0159`, corpus e medições múltiplas.
- I2: `ACCEPT_SPEC_FOR_HUMAN_T3_REVIEW`, sem P0/P1 remanescente. Aceite documental; não autoriza BUILD, fechamento de alerta, push, deploy ou produção.
- Revisão não alterou arquivos; os ajustes acima foram feitos pelo agente principal antes da I2.
