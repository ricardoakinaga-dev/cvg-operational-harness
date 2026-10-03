import hashlib, json, os, pathlib, stat, sys
root = pathlib.Path(sys.argv[1])
records = []
for directory, dirs, names in os.walk(root, followlinks=False):
    for name in sorted(dirs + names):
        file = pathlib.Path(directory) / name
        info = file.lstat()
        row = {'path': file.relative_to(root).as_posix(), 'mode': stat.S_IMODE(info.st_mode)}
        if file.is_symlink():
            row.update(type='symlink', target=os.readlink(file))
        elif file.is_file():
            row.update(type='file', size=info.st_size, sha256=hashlib.sha256(file.read_bytes()).hexdigest())
        elif file.is_dir():
            row.update(type='directory')
        else:
            row.update(type='special')
        records.append(row)
records.sort(key=lambda row: row['path'])
digest = hashlib.sha256(json.dumps(records, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
pathlib.Path(sys.argv[2]).write_text(json.dumps({'digest': digest, 'entries': records}, indent=2) + '\n')
print(json.dumps({'wholeArtifactDigest': digest, 'entries': len(records)}))
