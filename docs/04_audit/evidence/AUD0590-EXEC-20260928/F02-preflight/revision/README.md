# F02 — revisão após I1

O manifesto [i1-proof.json](.evidence/i1-proof.json) preserva a revisão do
builder no commit isolado `b73fc47cf520605fb4f800285872d007beee76cc`.
Os caminhos `.evidence/*` do manifesto são relativos a este diretório. Os
logs foram copiados sem normalização para preservar seus SHA-256. O
`i1-proof.sha256` verifica o próprio manifesto; os hashes de fonte e logs
constam dentro dele.

O [parecer I2](../I2-review.md) aceitou a fatia local sem P0/P1/P2. Esta
evidência não qualifica o root nem release; os gates do root são registrados
separadamente após integração.
