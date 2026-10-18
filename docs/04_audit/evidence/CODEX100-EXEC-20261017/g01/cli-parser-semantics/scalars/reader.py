#!/usr/bin/env python3
"""Offline source evidence. Imports reviewed audit lexer only, never target code."""
import argparse
import collections
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import tomllib

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
BASE = HERE.parents[2]
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
CONTRACT_SHA = '56c28025ceaa75ad1ed5fde49304df4614a8fd35b5c821208d43e116baeb829b'
HELPER = BASE/'g01/entrypoints/cli/generate.py'
HELPER_SHA = 'e67f47dc4e7e2ff52d2e0630bf93eacf2bbf7484bb76b9ba2cdeccac2fc1f53e'
PARENT = HERE.parent/'scalars-contract.json'
GLOB_ROUTES = {
    ('codex-rs/app-server-protocol/src/lib.rs','CyberAccessProgram'): 'protocol::v2::CyberAccessProgram',
    ('codex-rs/app-server-protocol/src/protocol/v2/mod.rs','CyberAccessProgram'): 'turn::CyberAccessProgram',
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2)+'\n'


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def load_helper():
    baseline = json.loads((HERE/'baseline.json').read_text())
    require(sha(HELPER.read_bytes()) == baseline['helper']['sha256'] == HELPER_SHA, 'reviewed helper drift')
    spec = importlib.util.spec_from_file_location('reviewed_cli_audit_lexer', HELPER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    # Exercise comments, raw strings, Unicode bytes, attribute and delimiter ownership.
    sample = module.Source('synthetic', '/* enum Decoy {} */\n#[derive(Debug)]\nstruct Réel;\nstruct Real { a: String, b: Vec<(String, String)> }\nconst X: &str = r#"enum Fake {}"#;')
    require('Decoy' not in sample.defs and 'Fake' not in sample.defs and 'Real' in sample.defs, 'lexer atomicity')
    utf = module.Source('synthetic', '// ação\nstruct Real { a: String }')
    a = utf.anchor(0, len(utf.t))
    require(a['start_byte'] == len('// ação\n'.encode()), 'lexer UTF8 byte offset')
    return module


LEX = None


class Reader:
    def __init__(self, upstream=UP, overrides=None):
        self.upstream = upstream
        self.overrides = overrides or {}
        self.raw = {}
        self.sources = {}
        self.nodes = {}
        self.active = set()
        self.workspace = self.toml('codex-rs/Cargo.toml')

    def read(self, path):
        if path not in self.raw:
            self.raw[path] = self.overrides.get(path, (self.upstream/path).read_bytes())
            if isinstance(self.raw[path], str):
                self.raw[path] = self.raw[path].encode()
        return self.raw[path]

    def toml(self, path):
        return tomllib.loads(self.read(path).decode())

    def source(self, path):
        if path not in self.sources:
            self.sources[path] = LEX.Source(path, self.read(path).decode())
        return self.sources[path]

    def full(self, path):
        data = self.read(path)
        text = data.decode()
        lines = text.splitlines()
        excerpt = [dict(line=i+1, text=t) for i, t in enumerate(lines)]
        return dict(path=path, start_byte=0, end_byte=len(data), start_line=1,
                    end_line=data.count(b'\n')+1, sha256=sha(data),
                    excerpt=excerpt if len(lines)<=18 else excerpt[:12]+excerpt[-6:],
                    excerpt_truncated=len(lines)>18)

    def package(self, path):
        parent = Path(path).parent
        while str(parent) != '.':
            manifest = (parent/'Cargo.toml').as_posix()
            if (self.upstream/manifest).is_file():
                return manifest, self.toml(manifest)
            parent = parent.parent
        raise ValueError('no Cargo owner '+path)

    def root(self, path, crate=False):
        manifest, data = self.package(path)
        folder = Path(manifest).parent
        if not crate and path.startswith('codex-rs/cli/src/') and path != 'codex-rs/cli/src/lib.rs':
            return 'codex-rs/cli/src/main.rs'
        return (folder/data.get('lib', {}).get('path', 'src/lib.rs')).as_posix()

    def uses(self, s):
        """Top-level use trees only. No textual/global type-name index."""
        result = []

        def expand(a, b, prefix):
            brace = next((i for i in range(a,b) if s.t[i][0]=='{'), None)
            if brace is not None:
                lead = ''.join(v for v,_,_ in s.t[a:brace]).rstrip(':')
                for x,y in s.split(brace+1, s.pairs[brace]):
                    expand(x,y, prefix+lead+'::')
            else:
                vals = [v for v,_,_ in s.t[a:b]]
                alias = None
                if 'as' in vals:
                    j = vals.index('as'); alias = vals[j+1]; vals=vals[:j]
                qualified = prefix+''.join(vals)
                if qualified.endswith('::self'):
                    qualified=qualified[:-6]
                result.append((alias or qualified.split('::')[-1], qualified))

        for i,(v,_,_) in enumerate(s.t):
            if v != 'use' or s.depths[i] != 0:
                continue
            end=i+1
            while s.t[end][0]!=';':
                end+=1
            start=s.before_attrs(i)
            old=len(result)
            expand(i+1,end,'')
            for n in range(old,len(result)):
                result[n] = (*result[n], s.anchor(start,end+1))
        return result

    def module(self, path, name):
        s=self.source(path)
        hits=[i for i,(v,_,_) in enumerate(s.t) if v=='mod' and s.depths[i]==0 and
              i+2<len(s.t) and s.t[i+1][0]==name and s.t[i+2][0]==';']
        require(len(hits)<=1, 'ambiguous module '+path+'::'+name)
        if not hits:
            return None
        i=hits[0]; attrs,_=s.attrs(s.before_attrs(i),i)
        explicit=[re.fullmatch(r'#\[path\s*=\s*"([^"]+)"\]',a['text']) for a in attrs]
        explicit=[m[1] for m in explicit if m]
        folder=Path(path).parent if Path(path).name in ('lib.rs','main.rs','mod.rs') else Path(path).with_suffix('')
        candidates=[Path(path).parent/explicit[0]] if explicit else [folder/(name+'.rs'),folder/name/'mod.rs']
        candidates=[p.as_posix() for p in candidates if (self.upstream/p).is_file()]
        require(len(candidates)==1, 'module source missing/ambiguous '+path+'::'+name)
        return candidates[0], s.anchor(s.before_attrs(i),i+3)

    def dependency(self, path, crate):
        manifest,data=self.package(path)
        deps=list(data.get('dependencies',{}).items())
        for cfg,table in data.get('target',{}).items():
            deps += list(table.get('dependencies',{}).items())
        matches=[(k,v) for k,v in deps if k.replace('-','_')==crate]
        if not matches:
            return None
        # Retain all original TOML bytes, including target cfg; no cfg evaluation.
        key,dep=matches[0]; proofs=[self.full(manifest)]
        if isinstance(dep,dict) and dep.get('workspace'):
            dep=self.workspace['workspace']['dependencies'][key]
            base=Path('codex-rs'); proofs.append(self.full('codex-rs/Cargo.toml'))
        else:
            base=Path(manifest).parent
        if isinstance(dep,dict) and 'path' in dep:
            target=(base/dep['path']).as_posix()
            target=Path(__import__('posixpath').normpath(target))
            targetmanifest=(target/'Cargo.toml').as_posix()
            package=self.toml(targetmanifest)
            identity=package.get('lib',{}).get('name',package['package']['name'].replace('-','_'))
            expected=dep.get('package',key).replace('-','_')
            require(identity==expected or identity==crate, 'Cargo crate identity mismatch '+crate)
            proofs.append(self.full(targetmanifest))
            return (target/package.get('lib',{}).get('path','src/lib.rs')).as_posix(),proofs,dep
        return None,proofs,dep

    def resolve(self, path, name, trail=None, seen=None):
        trail=[] if trail is None else trail
        seen=set() if seen is None else seen
        name=re.sub(r'\s+','',name)
        key=(path,name)
        if key in seen:
            return dict(kind='OPEN',name=name,reason='cyclic lexical route',resolution_sources=trail)
        seen=seen|{key}
        s=self.source(path)
        if name in s.defs:
            defs=s.defs[name]
            require(len(defs)==1, 'conditional definition needs historical parent edge '+path+'::'+name)
            d=defs[0]
            return dict(kind='REPOSITORY',id=path+'::'+name,path=path,name=name,
                        declaration=s.anchor(d['start'],d['end']+1),resolution_sources=trail)
        # Explicit lexical imports take precedence over prelude names.
        parts=name.split('::')
        for alias,qualified,proof in self.uses(s):
            if parts[0]==alias and qualified!=name:
                return self.resolve(path,qualified+('::'+'::'.join(parts[1:]) if len(parts)>1 else ''),trail+[proof],seen)
        curated=GLOB_ROUTES.get((path,name))
        if curated:
            route=curated.rsplit('::',1)[0]+'::*'
            proofs=[proof for alias,qualified,proof in self.uses(s) if qualified==route]
            require(len(proofs)==1,'curated glob reexport missing '+path+'::'+name)
            return self.resolve(path,curated,trail+proofs,seen)
        standard={'String':'std::string::String','From':'std::convert::From','TryFrom':'std::convert::TryFrom',
                  'Default':'std::default::Default','AsRef':'std::convert::AsRef'}
        standard.update({n:'std::primitive::'+n for n in ('bool','u16','u64','usize','i64','str')})
        if name in standard:
            return dict(kind='STANDARD',id=standard[name],name=name,resolution_sources=trail,
                        grammar='OPEN_STANDARD_LIBRARY_AND_CLAP_SELECTION_NOT_EXECUTED')
        if name.startswith('std::') or name.startswith('core::'):
            return dict(kind='STANDARD',id=name,name=name,resolution_sources=trail,
                        grammar='OPEN_STANDARD_LIBRARY_AND_CLAP_SELECTION_NOT_EXECUTED')
        if parts[0]=='crate':
            return self.resolve(self.root(path), '::'.join(parts[1:]),trail,seen)
        if parts[0]=='self':
            return self.resolve(path,'::'.join(parts[1:]),trail,seen)
        if parts[0]=='super':
            folder=Path(path).parent
            possible=[folder/'mod.rs',folder.with_suffix('.rs'),folder/'lib.rs']
            possible=[p.as_posix() for p in possible if p.as_posix()!=path and (self.upstream/p).is_file()]
            if len(possible)==1:
                return self.resolve(possible[0],'::'.join(parts[1:]),trail,seen)
        if len(parts)>1:
            module=self.module(path,parts[0])
            if module:
                target,proof=module
                return self.resolve(target,'::'.join(parts[1:]),trail+[proof],seen)
            dependency=self.dependency(path,parts[0])
            if dependency:
                target,proofs,dep=dependency
                if target:
                    return self.resolve(target,'::'.join(parts[1:]),trail+proofs,seen)
                return dict(kind='EXTERNAL',id=name,name=name,resolution_sources=trail+proofs,
                            dependency=dep,grammar='OPEN_EXTERNAL_DEPENDENCY_GRAMMAR')
        return dict(kind='OPEN',name=name,reason='no unique concrete local/import/module/dependency route',resolution_sources=trail)

    def attrs(self, s, start, stop):
        return s.attrs(start,stop)[0]

    def type_node(self, binding):
        tid=binding['id']
        if tid in self.nodes:
            return tid
        s=self.source(binding['path']); d=s.defs[binding['name']][0]
        attrs=self.attrs(s,d['start'],d['keyword'])
        node=dict(id=tid,name=d['name'],kind=d['kind'],attributes=attrs,
                  source=s.anchor(d['start'],d['end']+1),variants=[],fields=[],impls=[],
                  parser_mechanisms=[],qualification='SOURCE_ONLY',effective_clap_grammar='OPEN')
        if d['kind']=='struct':
            node['struct_shape']='TUPLE_NEWTYPE' if s.t[d['body']][0]=='(' else 'NAMED_FIELDS'
        node['scope_imports']=[dict(alias=a,qualified=q,source=p) for a,q,p in self.uses(s)]
        self.nodes[tid]=node
        if any(re.search(r'\bValueEnum\b',a['text']) for a in attrs):
            vb=self.resolve(s.path,'clap::ValueEnum' if any('clap::ValueEnum' in a['text'] for a in attrs) else 'ValueEnum')
            require(vb['kind']=='EXTERNAL' and vb.get('id')=='clap::ValueEnum','unbound ValueEnum derive '+tid)
            node['parser_mechanisms'].append('ValueEnum_DERIVE_SOURCE')
            node['value_enum_binding']=vb
        if d['kind']=='enum':
            for a,b in s.split(d['body']+1,d['end']):
                va,p=s.attrs(a,b); name=s.t[p][0]
                props=value_properties(va)
                v=dict(id=tid+'::'+name,name=name,attributes=va,source=s.anchor(a,b),value_properties=props,
                       rust_default_marker=any(x['text']=='#[default]' for x in va),cfg=[x for x in va if re.match(r'#\[cfg',x['text'])],
                       name_projection=project_name(name,attrs,props) if 'ValueEnum_DERIVE_SOURCE' in node['parser_mechanisms'] else dict(origin='NOT_VALUE_ENUM; consult exact parser impl'),payload=s.raw(p+1,b))
                node['variants'].append(v)
                if p+1<b and s.t[p+1][0] in ('{','('):
                    node['fields'] += self.payload(s,tid+'::'+name,p+1,s.pairs[p+1])
        elif d['kind']=='struct' and s.t[d['body']][0] in ('{','('):
            node['fields']=self.payload(s,tid,d['body'],d['end'])
        elif d['kind']=='type':
            node['alias_target']=s.raw(d['body']+1,d['end'])
        # Every top-level impl involving this exact local type; never a global name match.
        for i,(v,_,_) in enumerate(s.t):
            if v!='impl' or s.depths[i]!=0:
                continue
            j=i+1
            while j<len(s.t) and s.t[j][0] not in ('{',';'):
                j+=1
            if j==len(s.t) or s.t[j][0]!='{':
                continue
            header=s.raw(i,j)
            if not re.search(r'(?<![\w])'+re.escape(d['name'])+r'\b',header):
                continue
            end=s.pairs[j]+1
            ia=self.attrs(s,s.before_attrs(i),i)
            mechanisms=[x for x in ('FromStr','TryFrom','From','Default','TypedValueParser','ValueEnum') if re.search(r'\b'+x+r'\b',header)]
            methodrows=[]
            for k in range(j+1,end):
                if s.t[k][0]=='fn' and s.depths[k]==s.depths[j]+1:
                    q=k+1
                    while q<end and s.t[q][0] not in ('{',';'):
                        q+=1
                    if q<end and s.t[q][0]=='{':
                        methodrows.append(dict(name=s.t[k+1][0],source=s.anchor(s.before_attrs(k),s.pairs[q]+1)))
            names=re.findall(r'(?<![\w:])(?:[a-z_][\w]*::)*[A-Z][\w]*(?:::[\w]+)*',header)
            refs=[]
            for name in sorted(set(names)-{d['name'],'Self'}):
                ref=self.resolve(s.path,name)
                refs.append(dict(expression=name,binding=ref))
            associated=[]
            for m in re.finditer(r'\btype\s+(Err|Error|Target)\s*=\s*([^;]+);',s.raw(j+1,end-1)):
                expression=m[2].strip()
                ref=self.resolve(s.path,expression)
                associated.append(dict(name=m[1],expression=expression,binding=ref))
                if ref['kind']=='REPOSITORY' and m[1] in ('Err','Error'):
                    self.type_node(ref)
            node['impls'].append(dict(header=header,attributes=ia,source_text=s.raw(s.before_attrs(i),end),source=s.anchor(s.before_attrs(i),end),
                                      mechanisms=mechanisms,methods=methodrows,header_bindings=refs,associated_types=associated))
            node['parser_mechanisms']+=mechanisms
        node['parser_mechanisms']=sorted(set(node['parser_mechanisms']))
        # Supporting local functions called by captured impls, recursively; dependencies remain OPEN.
        called=set()
        bodies='\n'.join(span_text(x['source'],self.raw) for x in node['impls'])
        for m in re.finditer(r'(?<![.\w:])([a-z_]\w*)\s*\(',bodies):
            called.add(m[1])
        support=[]
        for i,(v,_,_) in enumerate(s.t):
            if v=='fn' and s.depths[i]==0 and s.t[i+1][0] in called:
                j=i+1
                while s.t[j][0] not in ('{',';'):
                    j+=1
                if s.t[j][0]=='{':
                    support.append(dict(name=s.t[i+1][0],source_text=s.raw(s.before_attrs(i),s.pairs[j]+1),source=s.anchor(s.before_attrs(i),s.pairs[j]+1)))
        node['local_support_functions']=support
        # Resolve imports actually named inside scalar parsing/conversion impls.
        # These are dependency boundaries, not expansion or execution of their code.
        parser_bodies='\n'.join(x['source_text'] for x in node['impls'] if x['mechanisms'])
        tokens={v for v,_,_ in LEX.Source('impl-dependencies',parser_bodies).t}
        node['parser_import_bindings']=[dict(alias=a,qualified=q,binding=self.resolve(s.path,a))
                                       for a,q,p in self.uses(s) if a in tokens and a!='*']
        return tid

    def payload(self,s,owner,opening,closing):
        result=[]
        for index,(a,b) in enumerate(s.split(opening+1,closing)):
            attrs,p=s.attrs(a,b)
            if s.t[p][0]=='pub':
                p+=1
                if s.t[p][0]=='(':
                    p=s.pairs[p]+1
            named=s.t[opening][0]=='{'
            name=s.t[p][0] if named else str(index)
            rawtype=s.raw(p+2 if named else p,b)
            leaves=[]
            for leaf in leaf_types(rawtype)[1]:
                binding=self.resolve(s.path,leaf)
                leaves.append(binding)
                if binding['kind']=='REPOSITORY':
                    self.type_node(binding)
            result.append(dict(id=owner+'.'+name,name=name,rust_type=rawtype,attributes=attrs,source=s.anchor(a,b),leaves=leaves))
        return result

    def build(self):
        graph=json.loads((BASE/'g01/entrypoints/cli/graph.json').read_text())
        recon=json.loads((BASE/'next-cli-parser-recon.json').read_text())
        adapter_path=BASE/'g01/cli-adapters/schema/inventory.json'
        windows=json.loads(adapter_path.read_text())['windows_setup']
        recon_fields={f['id']:f for f in recon['fields']}
        parent_ids={t['id'] for t in graph['types']}
        edges={e['owner']:e for e in graph['edges'] if e['relation'] in ('flatten','subcommand')}
        fields=[]
        for f in graph['fields']:
            s=self.source(f['source']['path'])
            historical=copy.deepcopy(f)
            wrappers,leaves=leaf_types(f['rust_type'])
            explicit=recon_fields[f['id']]['explicit_value_parser']
            bindings=[]
            if f['id'] in edges and edges[f['id']]['targets']:
                bindings=[dict(kind='PARENT_CONTAINER',id=t['type'],resolution_sources=t['resolution_sources'],cfg=t['cfg']) for t in edges[f['id']]['targets']]
            else:
                for leaf in leaves:
                    binding=self.resolve(s.path,leaf)
                    if binding['kind']=='REPOSITORY':
                        if binding['id'] in parent_ids:
                            binding['kind']='PARENT_CONTAINER'
                        else:
                            self.type_node(binding)
                    bindings.append(binding)
            # Independently re-extract fields from the pinned declaration span, not recon hashes.
            actual=self.current_field(s,f)
            fragment=LEX.Source(s.path,actual)
            attrs,p=fragment.attrs(0,len(fragment.t))
            if f['name'].isdigit():
                if fragment.t[p][0]=='pub':
                    p+=1
                    if fragment.t[p][0]=='(':
                        p=fragment.pairs[p]+1
                actual_type=fragment.raw(p,len(fragment.t))
            else:
                while p<len(fragment.t) and fragment.t[p][0]!=':':
                    p+=1
                require(p<len(fragment.t),'field colon '+f['id'])
                actual_type=fragment.raw(p+1,len(fragment.t))
            actual_props=LEX.properties(attrs)
            require(actual_type==f['rust_type'] and actual_props==f['argument']['properties'], 'historical field semantics changed '+f['id'])
            candidates=[]
            if not explicit and f['binding']=='arg':
                for b in bindings:
                    candidates.append(dict(leaf_id=b.get('id'),kind=b['kind'],mechanisms=self.nodes.get(b.get('id'),{}).get('parser_mechanisms',[]),
                                           qualification='SOURCE_CANDIDATES_ONLY_SELECTION_OPEN'))
            kinds={b['kind'] for b in bindings}
            disposition='LEAD_EXPLICIT' if explicit else 'PARENT_CONTAINER' if kinds=={'PARENT_CONTAINER'} else 'NON_ARG_DATA' if f['binding']!='arg' else 'EXTERNAL_OPEN' if 'EXTERNAL' in kinds else 'SCALAR_SOURCE' if 'REPOSITORY' in kinds else 'STANDARD_OPEN' if kinds=={'STANDARD'} else 'OPEN'
            fields.append(dict(id=f['id'],owner=f['owner'],rust_type=f['rust_type'],binding=f['binding'],
                               historical=historical,recon=recon_fields[f['id']],wrappers=wrappers,leaf_bindings=bindings,
                               disposition=disposition,implicit_candidates=candidates,
                               parser_owner='LEAD_EXPLICIT' if explicit else 'SCALARS_IMPLICIT_SOURCE',
                               explicit_value_parser=explicit,implicit_parser_applicability='SUPPRESSED_EXPLICIT_PARSER' if explicit else 'ARG_ONLY' if f['binding']=='arg' else 'NON_ARG_NO_IMPLICIT_CLI_GRAMMAR',
                               effective_clap_grammar='OPEN',runtime_qualification='NOT_RUN'))
        result=dict(schema='cvg.cli-scalar-source-inventory.v1',task='DX100-G01:CLI-SCALAR-TYPES',status='IMPLEMENTED',
                    pin=PIN,contract_sha256=CONTRACT_SHA,fields=fields,scalar_types=sorted(self.nodes.values(),key=lambda n:n['id']),
                    parent_container_ids=sorted(parent_ids),
                    manual_windows=dict(disposition='LEAD_OWNED_PARENT_DATA',parent_path='g01/cli-adapters/schema/inventory.json',parent_sha256=sha(adapter_path.read_bytes()),
                                        parent_key='windows_setup',owner=windows['owner'],fields=copy.deepcopy(windows['fields']),
                                        note='Four additional fields are not members of historical305. Lead binds their own sources and effective rules.'),
                    functional_receipts=0,full_g01_closure=False,limitations=LIMITS)
        result['counts']=dict(fields=len(fields),bindings=dict(sorted(collections.Counter(f['binding'] for f in fields).items())),
                              explicit_lead_fields=sum(f['parser_owner']=='LEAD_EXPLICIT' for f in fields),
                              scalar_types=len(self.nodes),variants=sum(len(n['variants']) for n in self.nodes.values()),
                              impls=sum(len(n['impls']) for n in self.nodes.values()),parent_types=len(parent_ids),
                              dispositions=dict(sorted(collections.Counter(f['disposition'] for f in fields).items())),
                              leaf_kinds=dict(sorted(collections.Counter(b['kind'] for f in fields for b in f['leaf_bindings']).items())))
        return result

    def current_field(self,s,f):
        """Locate existing owner/field, without expanding any command/container edges."""
        parts=f['owner'].split('::')[1:]
        defs=s.defs.get(parts[0],[])
        require(len(defs)==1,'field owner missing/ambiguous '+f['id'])
        d=defs[0]; opening,closing=d['body'],d['end']
        if len(parts)>1:
            variants=[]
            for a,b in s.split(opening+1,closing):
                _,p=s.attrs(a,b)
                if s.t[p][0]==parts[1]:
                    variants.append(p+1)
            require(len(variants)==1,'field variant owner missing '+f['id'])
            opening=variants[0]; closing=s.pairs[opening]
        matches=[]
        for index,(a,b) in enumerate(s.split(opening+1,closing)):
            _,p=s.attrs(a,b)
            if s.t[p][0]=='pub':
                p+=1
                if s.t[p][0]=='(':
                    p=s.pairs[p]+1
            name=str(index) if s.t[opening][0]=='(' else s.t[p][0]
            if name==f['name']:
                matches.append(s.raw(a,b))
        require(len(matches)==1,'historical field missing '+f['id'])
        return matches[0]


LIMITS=[
    'Pinned lexical source evidence only. No target execution/import/compile, Clap macro expansion, accepted grammar or runtime qualification.',
    'Standard library, url/reqwest::Url reexport, clap_complete::Shell and other external dependency grammars OPEN. No global type-name matching. Cargo target cfg retained symbolically in exact manifests.',
    'ValueEnum names are source projections; derive/default parser precedence/effective Clap behavior and platform cfg remain OPEN. Explicit parsers always Lead-owned.',
    'Impl and local support function bodies retained exactly; runtime/dependency calls and transitive callees are not certified. No CVG policy authority follows from upstream scalar acceptance.',
    'Parent105containers referenced, command graph not reexpanded. Four manual Windows fields, rules/properties/config overrides/join belong to Lead. Independent critic pending; G01/G02/G03/G04 and functional parity remain OPEN.'
]


def leaf_types(raw):
    raw=raw.strip(); wrappers=[]
    match=re.fullmatch(r'(Option|Vec|Box)\s*<(.*)>',raw,re.S)
    if match:
        inner,leaves=leaf_types(match[2]); return [match[1]]+inner,leaves
    if raw.startswith('(') and raw.endswith(')'):
        src=LEX.Source('tuple',raw)
        leaves=[]
        for a,b in src.split(1,len(src.t)-1):
            ws,ls=leaf_types(src.raw(a,b)); wrappers+=ws; leaves+=ls
        return ['tuple']+wrappers,leaves
    return wrappers,[raw]


def value_properties(attrs):
    result={}
    for a in attrs:
        src=LEX.Source('value-attribute',a['text'])
        if len(src.t)<5 or src.t[2][0]!='value' or src.t[3][0]!='(':
            continue
        for x,y in src.split(4,src.pairs[3]):
            key=src.t[x][0]
            result.setdefault(key,[]).append(src.raw(x+2,y) if x+1<y and src.t[x+1][0]=='=' else src.raw(x,y))
    return result


def project_name(name,attrs,props):
    container=value_properties(attrs)
    if 'name' in props:
        return dict(expression=props['name'],origin='EXPLICIT_VALUE_ATTRIBUTE_NOT_RUNTIME')
    mode=container.get('rename_all',['"kebab-case"'])[-1]
    value=LEX.word_name(name)
    if mode=='"snake_case"':
        value=value.replace('-','_')
    elif mode!='"kebab-case"':
        value=None
    return dict(value=value,rename_all=mode,origin='LEXICAL_DERIVE_PROJECTION_NOT_ACCEPTED_GRAMMAR')


def span_text(a,raw):
    return raw[a['path']][a['start_byte']:a['end_byte']].decode()


def semantic(obj):
    if isinstance(obj,dict):
        return {k:semantic(v) for k,v in obj.items() if k not in ('source','declaration','resolution_sources','sha256','excerpt','start_byte','end_byte','start_line','end_line')}
    if isinstance(obj,list):
        return [semantic(v) for v in obj]
    return obj


def verify_equal(actual,expected):
    require(actual==expected,'source/artifact semantic inventory drift')
    require(len(actual['fields'])==305 and len(set(f['id'] for f in actual['fields']))==305,'305 field identity')
    require(actual['counts']['explicit_lead_fields']==14,'explicit parser ownership')
    require(actual['functional_receipts']==0 and not actual['full_g01_closure'],'false qualification')
    require(all(not f['implicit_candidates'] for f in actual['fields'] if f['explicit_value_parser']),'explicit/implicit false equivalence')


def verify_spans(inventory,reader):
    seen=set()
    def walk(obj):
        if isinstance(obj,dict):
            if {'path','start_byte','end_byte','excerpt','sha256'}<=obj.keys():
                key=(obj['path'],obj['start_byte'],obj['end_byte'])
                data=reader.read(obj['path']); a,b=obj['start_byte'],obj['end_byte']
                piece=data[a:b]; start=data[:a].count(b'\n')+1
                numbered=[dict(line=start+i,text=t) for i,t in enumerate(piece.decode().splitlines())]
                require(0<=a<b<=len(data) and sha(piece)==obj['sha256'],'span identity '+str(key))
                require(obj['start_line']==start and obj['end_line']==data[:b].count(b'\n')+1,'span lines '+str(key))
                require(obj['excerpt']==(numbered if len(numbered)<=18 else numbered[:12]+numbered[-6:]) and obj['excerpt_truncated']==(len(numbered)>18),'span excerpt '+str(key))
                seen.add(key)
            for v in obj.values(): walk(v)
        elif isinstance(obj,list):
            for v in obj: walk(v)
    walk(inventory)
    return len(seen)


def git_sources(reader,upstream):
    require(subprocess.check_output(['git','-C',str(upstream),'rev-parse','HEAD'],text=True).strip()==PIN,'Git HEAD pin')
    rows=[]
    for path,data in sorted(reader.raw.items()):
        blob=subprocess.check_output(['git','-C',str(upstream),'show',PIN+':'+path])
        require(data==blob,'working tree differs from pinned blob '+path)
        oid=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
        rows.append(dict(path=path,sha256=sha(data),git_blob_oid=oid,bytes=len(data)))
    return rows


def main():
    global LEX
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--check',action='store_true')
    ap.add_argument('--upstream',type=Path,default=UP)
    args=ap.parse_args()
    require(sha(PARENT.read_bytes())==CONTRACT_SHA,'scalar contract hash drift')
    contract=json.loads(PARENT.read_text())
    require(sha((HERE.parent/'contract.json').read_bytes())==contract['parent_contract_sha256'],'parent contract drift')
    for row in contract['inputs']:
        require(sha((BASE/row['path']).read_bytes())==row['sha256'],'historical input drift '+row['path'])
    LEX=load_helper()
    r=Reader(args.upstream); inventory=r.build()
    verify_equal(inventory,inventory)
    require(dump(Reader(args.upstream).build())==dump(inventory),'double generation nondeterminism')
    spans=verify_spans(inventory,r)
    sources=git_sources(r,args.upstream)
    negatives=negative_controls(inventory,args.upstream)
    verification=dict(schema='cvg.cli-scalar-verification.v1',status='IMPLEMENTED',pin=PIN,contract_sha256=CONTRACT_SHA,
                      counts=inventory['counts'],source_blobs=len(sources),unique_spans=spans,
                      checks=['contract/input hashes','reviewed helper hash and lexer controls','deterministic double generation','Git pinned blob identity','UTF8 spans/lines/excerpts','all305IDs and14explicit ownership','artifact and semantic source negatives','strict manifest'],
                      negative_controls=negatives,functional_receipts=0,independent_review='PENDING_LEAD',runtime_qualification='NOT_RUN')
    if args.check:
        verify_equal(json.loads((HERE/'inventory.json').read_text()),inventory)
        require(json.loads((HERE/'verification.json').read_text())==verification,'verification drift')
        manifest=json.loads((HERE/'manifest.json').read_text())
        verify_manifest(manifest,sources)
        print(dump(dict(result='PASS_STATIC_ONLY',counts=inventory['counts'],sources=len(sources),spans=spans,negatives=len(negatives),manifest_sha256=sha((HERE/'manifest.json').read_bytes()))),end='')
    else:
        (HERE/'inventory.json').write_text(dump(inventory))
        (HERE/'verification.json').write_text(dump(verification))
        manifest=make_manifest(sources,inventory['counts'])
        (HERE/'manifest.json').write_text(dump(manifest))
        print(dump(dict(result='IMPLEMENTED',counts=inventory['counts'],sources=len(sources),spans=spans,negatives=len(negatives))),end='')


def artifact_rows():
    rows=[]
    for p in sorted(HERE.iterdir()):
        require(not p.is_symlink() and p.is_file(),'unexpected lane directory/symlink '+p.name)
        if p.name!='manifest.json':
            rows.append(dict(path=p.name,sha256=sha(p.read_bytes()),bytes=p.stat().st_size))
    return rows


def verify_manifest(manifest,sources):
    require(set(manifest)=={'schema','task','status','pin','contract_sha256','parent_contract_sha256','artifacts','sources','counts','strict'},'strict manifest keys')
    require(manifest['schema']=='cvg.cli-scalar-manifest.v1' and manifest['status']=='IMPLEMENTED' and manifest['pin']==PIN and manifest['contract_sha256']==CONTRACT_SHA,'manifest header')
    require(manifest['parent_contract_sha256']==json.loads(PARENT.read_text())['parent_contract_sha256'],'manifest parent contract')
    require(manifest['artifacts']==artifact_rows() and manifest['sources']==sources,'strict manifest artifact/source drift')
    require(manifest['counts']==json.loads((HERE/'inventory.json').read_text())['counts'],'manifest counts')
    compare_manifest(manifest,make_manifest(sources,manifest['counts']))


def compare_manifest(actual,expected):
    require(actual==expected,'strict manifest metadata/artifact drift')


def make_manifest(sources,counts):
    return dict(schema='cvg.cli-scalar-manifest.v1',task='DX100-G01:CLI-SCALAR-TYPES',status='IMPLEMENTED',pin=PIN,
                contract_sha256=CONTRACT_SHA,parent_contract_sha256=json.loads(PARENT.read_text())['parent_contract_sha256'],
                artifacts=artifact_rows(),sources=sources,counts=counts,
                strict='All regular lane files except manifest.json; no directories or symlinks; SHA256+bytes; manifest self hash reported externally')


def negative_controls(inventory,upstream):
    # Implemented below; every mutation must defeat semantics independently of hashes.
    rows=[]
    mutations=[
        ('omitted-field',lambda d:d['fields'].pop()),
        ('omitted-type',lambda d:d['scalar_types'].pop()),
        ('omitted-variant',lambda d:next(n for n in d['scalar_types'] if n['variants'])['variants'].pop()),
        ('field-alias',lambda d:d['fields'][0]['historical']['argument']['properties'].update(alias=['"bogus"'])),
        ('field-default',lambda d:d['fields'][0]['historical']['argument']['properties'].update(default_value=['"bogus"'])),
        ('field-cfg',lambda d:d['fields'][0]['historical'].update(cfg=['#[cfg(windows)]'])),
        ('field-name',lambda d:d['fields'][0]['historical'].update(name='wrong')),
        ('owner',lambda d:d['fields'][0].update(owner='wrong')),
        ('import',lambda d:next(b for f in d['fields'] for b in f['leaf_bindings'] if b['resolution_sources'])['resolution_sources'].clear()),
        ('explicit-parser-ownership',lambda d:next(f for f in d['fields'] if f['explicit_value_parser']).update(parser_owner='SCALARS_IMPLICIT_SOURCE')),
        ('false-qualification',lambda d:d.update(functional_receipts=1,full_g01_closure=True)),
    ]
    for name,mutate in mutations:
        damaged=copy.deepcopy(inventory); mutate(damaged)
        try:
            verify_equal(damaged,inventory)
        except ValueError:
            rows.append(dict(name='artifact-'+name,result='REJECTED',in_memory_only=True))
        else:
            raise ValueError('artifact negative escaped '+name)
    cases=[
        ('enum-variant','codex-rs/utils/cli/src/approval_mode_cli_arg.rs','    Never,','    NeverChanged,'),
        ('enum-variant-omission','codex-rs/utils/cli/src/approval_mode_cli_arg.rs','    Never,',''),
        ('enum-alias','codex-rs/utils/cli/src/approval_mode_cli_arg.rs','    Never,','    #[value(alias = "n")]\n    Never,'),
        ('enum-default','codex-rs/cli/src/exec_server_command.rs','    #[default]\n    Noise,','    Noise,'),
        ('enum-cfg','codex-rs/utils/cli/src/approval_mode_cli_arg.rs','    Never,','    #[cfg(windows)]\n    Never,'),
        ('value-name','codex-rs/utils/cli/src/approval_mode_cli_arg.rs','    Never,','    #[value(name = "never-changed")]\n    Never,'),
        ('profile-parser','codex-rs/protocol/src/config_types.rs','if value.is_empty()','if value.len() == 999'),
        ('profile-error','codex-rs/protocol/src/config_types.rs','invalid --profile value','changed --profile value'),
        ('import-route','codex-rs/utils/cli/src/lib.rs','pub use codex_protocol::config_types::ProfileV2Name;','pub use codex_protocol::config_types::Unbound as ProfileV2Name;'),
        ('field-type','codex-rs/app-server/src/code_mode_host.rs','pub code_mode_host: Option<Url>','pub code_mode_host: Option<String>'),
        ('field-id','codex-rs/app-server/src/code_mode_host.rs','pub code_mode_host: Option<Url>','pub removed_field: Option<Url>'),
        ('field-default','codex-rs/cli/src/main.rs','default_value_t = Shell::Bash','default_value_t = Shell::Zsh'),
    ]
    for name,path,old,new in cases:
        text=(upstream/path).read_bytes().decode()
        require(text.count(old)==1,'negative mutation not unique '+name)
        try:
            changed=Reader(upstream,{path:text.replace(old,new,1)}).build()
            require(semantic(changed)!=semantic(inventory),'semantic mutation escaped '+name)
            reason='semantic inventory differs, ignoring hashes/spans'
        except ValueError as exc:
            if str(exc).startswith('semantic mutation escaped'):
                raise
            reason=str(exc)
        rows.append(dict(name='source-'+name,result='REJECTED',reason=reason,in_memory_only=True,hash_independent=True))
    # Strict manifest algorithms on an in-memory model, no disk/source mutation.
    expected=make_manifest([],inventory['counts'])
    for name,mutate in [
        ('artifact-omission',lambda d:d['artifacts'].pop()),
        ('extra-file',lambda d:d['artifacts'].append(dict(path='unexpected',sha256='0'*64,bytes=0))),
        ('hash',lambda d:d['artifacts'][0].update(sha256='0'*64)),
        ('false-status',lambda d:d.update(status='DONE')),
        ('extra-key',lambda d:d.update(approved=True)),
    ]:
        damaged=copy.deepcopy(expected); mutate(damaged)
        try:
            compare_manifest(damaged,expected)
        except ValueError:
            pass
        else:
            raise ValueError('manifest negative escaped '+name)
        rows.append(dict(name='manifest-'+name,result='REJECTED',in_memory_only=True))
    return rows


if __name__=='__main__':
    try:
        main()
    except (ValueError,KeyError,IndexError,OSError,AssertionError) as exc:
        print('FAIL: '+str(exc),file=sys.stderr)
        sys.exit(1)
