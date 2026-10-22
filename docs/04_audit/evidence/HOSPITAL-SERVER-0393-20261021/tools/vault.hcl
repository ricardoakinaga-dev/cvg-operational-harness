# HOSPITAL-SERVER-0393 measurement only: single-node raft with local TLS.
storage "raft" {
  path    = "/vault/data"
  node_id = "cvg-d9ef-sizing-vault"
}
listener "tcp" {
  address       = "0.0.0.0:8200"
  tls_cert_file = "/vault/tls/fullchain.pem"
  tls_key_file  = "/vault/tls/privkey.pem"
}
api_addr      = "https://127.0.0.1:8200"
cluster_addr  = "https://127.0.0.1:8201"
disable_mlock = true
ui            = false
