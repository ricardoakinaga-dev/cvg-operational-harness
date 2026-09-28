# PR-302 synthetic HTTPS browser proof

The [result](result.json) belongs to isolated commit `ed012a4` and local image
digest `sha256:e6d0f2574fc9d1f18e949baa5da8524aef98239285d511bce6368f893528ab19`.
The probe used Node 22.23.2 and Chromium 147. Only generated identities,
cookies and TLS keys were used. The private key is intentionally absent from
this evidence directory.

To reproduce, check out that commit in its isolated worktree, install its
lockfile with `npm ci --ignore-scripts`, and build the web image with the two
origins recorded in [proof.json](proof.json). Generate a disposable self-signed
certificate with SAN entries for `console.example.test`, `api.example.test`,
`idp.other.test`, `sibling.example.test` and `evil.other.test` into the paths
`key.pem` and `cert.pem` expected by [probe.mjs](probe.mjs). Run the image at
`127.0.0.1:4217:8080`, then run `node --experimental-strip-types probe.mjs`
under Node 22. The script resolves test hosts to loopback inside Chromium,
starts synthetic TLS API/IdP/sibling servers, and checks the browser result.

The probe uses the real web bundle, NGINX image, API HTTP security hook and
cookie parser/serializer. Its API session and IdP handlers are synthetic.
The corporate OIDC entrypoint, PostgreSQL, MFA and public HTTPS staging are
separate gates and remain `NOT_RUN` in this proof.
