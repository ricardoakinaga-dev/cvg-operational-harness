"""Constant infrastructure diagnostic. Imports no SDK or acquired dependency."""
import os, sys, json, stat, socket, resource, select, time

resource.setrlimit(resource.RLIMIT_NOFILE,(128,128))
resource.setrlimit(resource.RLIMIT_FSIZE,(8388608,8388608))
resource.setrlimit(resource.RLIMIT_CORE,(0,0))
host_net,host_home,host_bus=sys.argv[1:4]
net=os.readlink('/proc/self/ns/net');assert net!=host_net
nodes={}
for role in ['driver','adapter','peer']:
    for suffix in ['events','control']:
        name=f'/observer/{role}.{suffix}';s=os.lstat(name)
        assert stat.S_ISFIFO(s.st_mode) and s.st_uid==os.geteuid() and s.st_mode&0o777==0o600
        nodes[name]={'dev':str(s.st_dev),'ino':str(s.st_ino),'uid':s.st_uid,'mode':oct(s.st_mode&0o777)}
fd=os.open('/observer/driver.events',os.O_WRONLY|os.O_NONBLOCK|os.O_NOFOLLOW|os.O_CLOEXEC)
assert os.fpathconf(fd,'PC_PIPE_BUF')>=4096
os.write(fd,b'BWRAP_FIFO_READY\n')
control=os.open('/observer/driver.control',os.O_RDONLY|os.O_NONBLOCK|os.O_NOFOLLOW|os.O_CLOEXEC)
deadline=time.monotonic()+15;received=b''
while b'GO\n' not in received:
    assert time.monotonic()<deadline,'no supervisor barrier release'
    if select.select([control],[],[],min(.2,deadline-time.monotonic()))[0]:
        try:received+=os.read(control,64)
        except BlockingIOError:pass
assert received==b'GO\n'
denied={}
for label,path,write in [('outside_write','/must-not-write',True),('host_sentinel',host_home,False),('host_bus',host_bus,False)]:
    try:
        if write:
            with open(path,'wb') as f:f.write(b'constant')
        else:
            with open(path,'rb') as f:f.read(1)
    except OSError as exc:denied[label]={'errno':exc.errno,'type':type(exc).__name__}
    else:raise AssertionError(label+' was unexpectedly accessible')
with open('/work/positive','w') as f:f.write('constant-private-write')
sock=socket.socket();sock.settimeout(.5)
try:sock.connect(('198.51.100.1',9))
except OSError as exc:denied['network']={'errno':exc.errno,'type':type(exc).__name__}
else:raise AssertionError('network unexpectedly reachable')
finally:sock.close()
assert set(os.environ)<=set(['HOME','TMPDIR','PATH','LANG','LC_ALL','TZ','PYTHONDONTWRITEBYTECODE','LC_CTYPE']),sorted(os.environ)
os.write(fd,b'BWRAP_FIFO_END\n');os.close(fd);os.close(control)
print(json.dumps({'kind':'CONSTANT_NAMESPACE_FIFO_PRIMITIVE_DIAGNOSTIC','netns':net,'pid':os.getpid(),'uid':os.geteuid(),'nodes':nodes,'denied':denied,'private_write':'PASS','env_keys':sorted(os.environ),'rlimits':{'nofile':resource.getrlimit(resource.RLIMIT_NOFILE),'fsize':resource.getrlimit(resource.RLIMIT_FSIZE),'core':resource.getrlimit(resource.RLIMIT_CORE)},'SDK_imports':0,'compiler_imports':0}),flush=True)
