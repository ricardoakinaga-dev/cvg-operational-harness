# Notas de BUILD do PAR-X01 (não alteram a SPEC 0286)

A SPEC 0286 está vinculada ao recibo `human-decisions-19.json` pelo hash `6c15c089…fce` (commit `00bad5288`). Observações posteriores entram aqui, sem editar o corpo vinculado:

- XP06 (revisão do DF): teste explícito de que nomes em minúsculas (`http_proxy`, `https_proxy`, `no_proxy`) são recusados pelo próprio formato do regex do I2, para ninguém afrouxá-lo depois. Entra no teste da fatia 1.
