import json,pathlib,hashlib,re,subprocess,datetime
from cryptography import x509
from cryptography.hazmat.primitives import hashes
r=pathlib.Path('/mnt/dados/cvg-work/aud0625-debian13-codex-20261028');load=lambda n:json.loads((r/n).read_text());candidate=load('final-inventory.stdout');reference=load('final-reference.stdout');scan=load('new-runtime-sealed-trivy.json');archive=load('archive-inventory.json')
assert candidate['node']==reference['node']
assert candidate['node']['sha256']==archive['node_binary_sha256']
assert candidate['uid']==candidate['gid']==10001
assert all(x['uid']==0 and x['gid']==0 and not x['mode']&0o002 for x in candidate['hardening']['codeOwners'].values())
assert not any(candidate['hardening']['forbidden'].values())
def certs(name):
 data=(r/'base-layer-evidence'/name).read_bytes();result={}
 for pem in re.findall(b'-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----',data):
  cert=x509.load_pem_x509_certificate(pem);result[cert.fingerprint(hashes.SHA256()).hex()]={'subject':cert.subject.rfc4514_string(),'issuer':cert.issuer.rfc4514_string()}
 return data,result
old,oc=certs('debian12-system-ca.pem');new,nc=certs('debian13-system-ca.pem');assert candidate['systemCa']['sha256']==hashlib.sha256(new).hexdigest();assert candidate['systemCa']['fingerprints']==sorted(nc)
assert candidate['systemCa']['mode']&0o004
os=next(x for x in scan['Results'] if x['Class']=='os-pkgs' and x['Type']=='debian')
def ver(x):return (str(x.get('Epoch'))+':' if x.get('Epoch') else '')+x['Version']+('-'+x['Release'] if x.get('Release') else '')
sc={(x['Name'],ver(x),x['Arch']) for x in os['Packages']};actual={(x['name'],x['version'],x['architecture']) for x in candidate['dpkg']};assert actual==sc
installed={(x['name'],x['version']) for x in candidate['packages'] if not x['private'] and not x['workspace']};sp={(x['Name'],x['Version']) for s in scan['Results'] if s['Class']=='lang-pkgs' and s['Type']=='node-pkg' for x in s['Packages']};assert not installed-sp
assert all((x['Name'],ver(x),x['Arch']) in sc for x in os['Packages']);assert ('libssl3t64','3.5.7-1~deb13u3','amd64') in actual
assert scan['Metadata']['OS']['Family']=='debian' and scan['Metadata']['OS']['Name'].startswith('13') and not scan['Metadata']['OS'].get('EOSL',False)
assert scan['Metadata']['ImageID']=='sha256:1751d6a8e4b88fd09e09f147a8cfa96534936a2edf8d79ce4dc10ea5ec495fcc'
for name in ['new-runtime-sealed-trivy.json','new-runtime-informational-sealed-trivy.json']:
 assert not [v for row in load(name)['Results'] for v in row.get('Vulnerabilities',[]) if v['Severity'] in ['HIGH','CRITICAL']]
oldscan=load('old-base-sealed-trivy.json');assert any(v['VulnerabilityID']=='CVE-2026-84782' and v['PkgName']=='libssl3' and v['Severity']=='HIGH' and v['InstalledVersion']=='3.0.20-1~deb12u2' and v['FixedVersion']=='3.0.22-1~deb12u2' for row in oldscan['Results'] for v in row.get('Vulnerabilities',[]))
assert load('trivy-db-final-post.json')['files']==load('trivy-db-pre.json')['files']
record={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'PASS_LOCAL_ORACLES','node_reference_exact':True,'node':{k:v for k,v in candidate['node'].items() if k!='bundledRoots'},'runtime_uid':candidate['uid'],'system_ca':{'runtime_readable':True,'mode':oct(candidate['systemCa']['mode']),'sha256':candidate['systemCa']['sha256'],'verified_pin_layer_bytes_equal':True,'debian12_count':len(oc),'debian13_count':len(nc),'added':{k:v for k,v in nc.items() if k not in oc},'removed':{k:v for k,v in oc.items() if k not in nc},'changed_subject':[]},'code_owners':candidate['hardening']['codeOwners'],'app_directory_owner':candidate['hardening']['appOwner'],'app_directory_note':'Distroless WORKDIR directory65532; copied code files root UID0/GID0/no other write; package.json is0664, group0 is not runtime GID10001. Directory ownership does not imply writable code. Runtime UID10001/read-only.','native_imports':candidate['nativeImports'],'os_inventory_exact':True,'os_count':len(actual),'installed_thirdparty_nameversions':len(installed),'thirdparty_missing':sorted(installed-sp),'db_pre_finalpost_same':True,'policy_new_exit':load('trivy-new-policy-sealed.json')['exit_code'],'policy_old_expected_exit':load('trivy-old-negative-sealed.json')['exit_code'],'no_unfixed_highcritical':True,'stock_distroless_ssl_cert_file':'/etc/ssl/certs/ca-certificates.crt; inherited stock path, no use-openssl-ca/use-system-ca/NODE_OPTIONS. Node bundled roots exactly same as original binary. TLS default rejects synthetic chain.'}
(r/'closed-local-oracles.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record,indent=2))
p=subprocess.run(['docker','ps','-a','--filter','label=cvg.task=AUD0625-DEBIAN13-CODEX-20261028','--format','{{.ID}} {{.Names}} {{.Status}}'],capture_output=True,timeout=10);assert p.returncode==0 and not p.stdout.strip();(r/'final-owned-container-absence.json').write_text(json.dumps({'exit':p.returncode,'stdout':p.stdout.decode(),'stderr':p.stderr.decode(),'status':'PASS','retained':'image1751 only; no containers'},indent=2))
