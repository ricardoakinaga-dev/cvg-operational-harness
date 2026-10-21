# Disposição dos P3 da revisão R2 (SPEC0250 r2 aprovada)

O texto aprovado da SPEC fica congelado no sha256 `f83d49788372b29909e15eaa68c6a91bf2ae51f0bf0e897bb858dc222a3727af`; os P3 são tratados assim:

1. `ledger-delta.md` e `spec-hashes.json` criados nesta pasta de evidência.
2. P9 já recarrega a página nova (sem init script); o `addInitScript` é da primeira página, fechada antes.
3. Comportamento registrado aqui e no `ledger-delta.md` como nota para a promoção da SPEC (§3.5): depois de 503 no caminho com token, o provider já consumiu o token de uso único; "Tentar novamente" segue pelo cookie e termina em "Autenticação necessária" ou restaura a identidade de um cookie anterior, que pode diferir da identidade do token. Nova autenticação pelo host resolve. Não amplia acesso: a identidade restaurada é a do cookie válido já emitido pelo servidor.
4. Role com nome único por execução (`cvg_aud0621_rt_<sufixo>`), removida no teardown; trigger e conexão que segura o lock usam a conexão administrativa.
5. P1 afirma que o número de respostas 200 é igual ao número de eventos de status.
