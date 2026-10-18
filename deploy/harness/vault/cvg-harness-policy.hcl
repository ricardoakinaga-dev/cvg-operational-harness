# C4 on premises (decided 2026-10-16): HashiCorp Vault on the hospital
# server. Read-only policy for the deploy identity (AppRole `cvg-harness-
# deploy`) that renders /etc/cvg-harness/*.env before `docker compose up`.
# Operators who rotate secrets use a separate, human, MFA-protected policy.

path "secret/data/cvg-harness/*" {
  capabilities = ["read"]
}

path "secret/metadata/cvg-harness/*" {
  capabilities = ["read", "list"]
}
