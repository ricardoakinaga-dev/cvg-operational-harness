const { Client } = require('/mnt/dados/cvg-work/aud0625-review-0262-s345-d9/node_modules/pg')
process.env.PGPASSWORD='from-shell'; process.env.PGSSLMODE='require'; process.env.PGOPTIONS='-c search_path=evil'; process.env.PGHOST='shell-host'; process.env.DATABASE_URL='postgres://x@shell/db'
for (const k of Object.keys(process.env)) if (process.argv[2]==='fix' && k.startsWith('PG')) delete process.env[k]
for (const url of ['postgres://svc@db.internal:5432/cvg','postgres://svc@db.internal:5432/cvg?host=other.example&options=-c%20search_path%3Devil','postgres://svc@db.internal:5432/cvg?port=6543&dbname=other&user=other']) {
  const c = new Client({connectionString:url}); const o=c.connectionParameters
  console.log(url.slice(0,60), JSON.stringify({host:o.host,port:o.port,database:o.database,user:o.user,pw:!!o.password,ssl:!!o.ssl,options:o.options}))
}
