"""Exact environment and rlimits before the selected helper/target exec."""
import os, sys, resource

assert len(sys.argv)>=2 and sys.argv[1] in ['/runtime/python','/runtime/node']
resource.setrlimit(resource.RLIMIT_NOFILE,(128,128))
resource.setrlimit(resource.RLIMIT_FSIZE,(8388608,8388608))
resource.setrlimit(resource.RLIMIT_CORE,(0,0))
env={'HOME':'/work/home','TMPDIR':'/work/tmp','PATH':'/runtime','LANG':'C.UTF-8',
     'LC_ALL':'C.UTF-8','TZ':'UTC','PYTHONDONTWRITEBYTECODE':'1'}
os.execve(sys.argv[1],sys.argv[1:],env)
