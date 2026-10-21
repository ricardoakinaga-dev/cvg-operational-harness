Controles negativos do restore/backup (14) executados no commit 8a4d1d239;
backup.ts mudou depois só para recusar raiz symlink (source_symlink) e
exportar helpers de caminho, sem tocar no restore. Controles de posição da
sandbox e da raiz symlink: ../../r2-repair/sandbox-placement-controls/.
Os positivos (fixture e volume real) foram refeitos na árvore final do
reparo R2.
