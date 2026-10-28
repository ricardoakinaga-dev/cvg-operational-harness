from pathlib import Path
import tarfile,json,hashlib,re,io
r=Path('/mnt/dados/cvg-work/aud0625-debian13-codex-20261028');fs={};packages={};symlinks={};nodehash=None;layerrows=[]
with tarfile.open(r/'runtime-image.tar') as image:
 manifest=json.load(image.extractfile('manifest.json'));assert len(manifest)==1
 config=json.load(image.extractfile(manifest[0]['Config']));(r/'runtime-saved-config.json').write_text(json.dumps(config,indent=2)+'\n')
 for layer in manifest[0]['Layers']:
  raw=image.extractfile(layer).read();assert hashlib.sha256(raw).hexdigest()==layer.rsplit('/',1)[1]
  count=0
  with tarfile.open(fileobj=io.BytesIO(raw),mode='r:*') as t:
   for m in t:
    n=m.name.lstrip('./')
    if m.issym():symlinks[n]=m.linkname
    if '/.wh.' in n:
     target=n.replace('/.wh.','/');fs={k:v for k,v in fs.items() if k!=target and not k.startswith(target+'/')};packages={k:v for k,v in packages.items() if k!=target and not k.startswith(target+'/')};continue
    if not m.isfile():continue
    if n=='usr/local/bin/node':nodehash=hashlib.sha256(t.extractfile(m).read()).hexdigest()
    selected=n.startswith('var/lib/dpkg/status.d/') and not n.endswith('.md5sums') or n=='etc/ssl/certs/ca-certificates.crt'
    npm=bool(re.fullmatch(r'app/node_modules/(?:@[^/]+/)?[^/]+(?:/node_modules/(?:@[^/]+/)?[^/]+)*/package\.json',n))
    workspace=bool(re.fullmatch(r'app/(?:packages|apps|legacy/packages)/[^/]+/package\.json',n))
    if selected or npm or workspace:
     assert m.size<2097152;data=t.extractfile(m).read();count+=1
     if selected:fs[n]=data
     if npm or workspace:
      d=json.loads(data);packages[n]={'name':d['name'],'version':d['version'],'private':d.get('private',False),'workspace':workspace,'path':n}
  layerrows.append({'layer':layer,'selected':count})
dpkg=[]
for n,data in fs.items():
 if not n.startswith('var/lib/dpkg/status.d/'):continue
 text=data.decode();field=lambda k:(re.search('^'+k+': (.+)$',text,re.M).group(1) if re.search('^'+k+': (.+)$',text,re.M) else None)
 if field('Package'):dpkg.append({'name':field('Package'),'version':field('Version'),'arch':field('Architecture')})
scan=json.loads((r/'new-runtime-trivy.json').read_text());osrows=[p for x in scan['Results'] if x['Class']=='os-pkgs' and x['Type']=='debian' for p in x.get('Packages',[])];noderows=[p for x in scan['Results'] if x['Class']=='lang-pkgs' and x['Type']=='node-pkg' for p in x.get('Packages',[])]
def tv(p):return (str(p['Epoch'])+':' if p.get('Epoch') else '')+p['Version']+('-'+p['Release'] if p.get('Release') else '')
os_expected={(p['name'],p['version'],p['arch']) for p in dpkg};os_actual={(p['Name'],tv(p),p.get('Arch')) for p in osrows}
node_expected={(p['name'],p['version']) for p in packages.values() if not p['workspace']};node_actual={(p['Name'],p['Version']) for p in noderows}
ca=fs['etc/ssl/certs/ca-certificates.crt'];(r/'runtime-system-ca.pem').write_bytes(ca);ssl=next(p for p in dpkg if p['name']=='libssl3t64');assert ssl['version']=='3.5.7-1~deb13u3'
record={'kind':'same-image-filesystem-via-docker-save-not-runtime-execution','image_index':'sha256:1751d6a8e4b88fd09e09f147a8cfa96534936a2edf8d79ce4dc10ea5ec495fcc','config_sha256':manifest[0]['Config'].rsplit('/',1)[1],'node_binary_sha256':nodehash,'system_ca_sha256':hashlib.sha256(ca).hexdigest(),'system_ca_matches_verified_base_layer':hashlib.sha256(ca).hexdigest()==hashlib.sha256((r/'base-layer-evidence/debian13-system-ca.pem').read_bytes()).hexdigest(),'dpkg':dpkg,'os_missing':sorted(os_expected-os_actual),'os_extra':sorted(os_actual-os_expected),'npm_packages':list(packages.values()),'npm_missing':sorted(node_expected-node_actual),'npm_extra':sorted(node_actual-node_expected),'workspaces':[p for p in packages.values() if p['workspace']],'layer_checks':layerrows,'limitation':'Filesystem/image inventory only; does not prove Node ABI, TLS, API or worker execution.'};(r/'archive-inventory.json').write_text(json.dumps(record,indent=2)+'\n');print({k:v for k,v in record.items() if k not in ['dpkg','npm_packages','workspaces','layer_checks']})
