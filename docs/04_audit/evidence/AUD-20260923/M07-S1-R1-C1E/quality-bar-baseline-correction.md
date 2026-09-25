# Correção factual do baseline do quality bar C1E

Em `2026-09-24T05:17:58Z`, após o congelamento do bar e antes dos checks C1E, a inspeção direta do manifesto R1 encontrou `workspace_summary.hashed_input_count = 977` e quatro itens em `approved_additions`. O parágrafo de baseline em `quality-bar.json` diz “973 baseline inputs plus three R1 additions”; essa descrição não conta os quatro paths aprovados e é incompleta.

O bar congelado e seu SHA em `.gauntlet` foram preservados sem alteração. Esta nota corrige apenas a descrição histórica do baseline; o critério C1E-03 já exige 977 inputs e os quatro paths aprovados. Nenhuma meta, threshold, evidência de check ou critério de aceite foi alterado. O manifesto R1 continua sendo apenas evidência histórica, não evidência da execução C1E.

Fonte: `docs/04_audit/evidence/AUD-20260923/M07-S1-R1/execution-candidate-manifest.json`, SHA-256 `c558016e6debb6a16666b666ecc9cc97ca36adc2b68e85e178f6feafc5548a24`. O manifesto registra o fixture no hash anterior `264651255ebc7169dc03935a0981aff0b8ae229b9e3e26013b89ddfd0e8cef66`; o fixture corrigido preservado para C1E está em `ed11c801c19e5eb31f3997b8b202542cdde8593a29cea3587f1e16711601257c`.
