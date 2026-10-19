#!/bin/bash
# P2: does `git ls-tree -r <commit> -- <name>` take a tree name literally?
set -u
W="$1"; rm -rf "$W"; mkdir -p "$W"; cd "$W"
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_COUNT=0 LANG=C LC_ALL=C TZ=UTC
G="/usr/bin/git -c core.hooksPath=/dev/null -c core.fsmonitor=false"
$G init -q .
mkdir -p ':x' 'x' 'a*' 'ab' ':(top)y' 'y'
echo colon > ':x/only-in-colon-x'; ln -s /etc/passwd ':x/link'
echo plain > 'x/only-in-x'
echo star > 'a*/f'; echo ab > 'ab/f'
echo t > ':(top)y/f1'; echo y > 'y/f2'
$G add -A . && $G -c user.name=s -c user.email=s@invalid commit -qm fixture
C=$($G rev-parse HEAD)
echo "### full ls-tree -r"; $G ls-tree -r --format='%(objectmode) %(path)' $C
for p in ':x' ':x/' 'a*' ':(top)y' 'nonexistent'; do
  echo "### ls-tree -r -- '$p' (exit follows)"; $G ls-tree -r --format='%(objectmode) %(path)' $C -- "$p"; echo "exit=$?"
done
echo "### with --literal-pathspecs -- ':x'"; $G --literal-pathspecs ls-tree -r --format='%(objectmode) %(path)' $C -- ':x'; echo "exit=$?"
echo "### with :(literal) prefix"; $G ls-tree -r --format='%(objectmode) %(path)' $C -- ':(literal):x'; echo "exit=$?"
echo "### non-recursive children of ':x/'"; $G ls-tree -l -z $C -- ':x/' | tr '\0' '\n'; echo "exit=$?"
