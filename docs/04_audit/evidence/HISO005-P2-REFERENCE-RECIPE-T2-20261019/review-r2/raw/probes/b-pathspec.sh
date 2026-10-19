#!/bin/bash
# B: semântica do git para as páginas literais (--literal-pathspecs) usadas em d6203875.
set -u
W="$1"; rm -rf "$W"; mkdir -p "$W"; cd "$W"
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null LANG=C LC_ALL=C TZ=UTC
G="/usr/bin/git -c core.hooksPath=/dev/null -c core.fsmonitor=false"
$G init -q .
mkdir -p ':x' 'x' 'a*' 'ab' ':(top)y' 'y' ':!z' 'z' 'q?' 'qq' '[ab]' 'a' 'b' 'sp ' 'nest/:in' 'nest/in'
echo c > ':x/f'; ln -s /etc/passwd ':x/link'; echo p > 'x/f'
echo s > 'a*/f'; echo ab > 'ab/f'; echo t > ':(top)y/f'; echo y > 'y/f'
echo n > ':!z/f'; echo z > 'z/f'; echo q > 'q?/f'; echo qq > 'qq/f'
echo br > '[ab]/f'; echo a > 'a/f'; echo b > 'b/f'; echo sp > 'sp /f'
echo ni > 'nest/:in/f'; echo n2 > 'nest/in/f'
$G --literal-pathspecs add -f -- . && $G -c user.name=s -c user.email=s@invalid commit -qm fixture
C=$($G rev-parse HEAD)
echo "### ls-tree -r completo"; $G ls-tree -r --format='%(objectmode) %(path)' $C
for p in ':x' ':(top)y' ':!z' 'a*' 'q?' '[ab]' 'sp ' 'nest/:in' 'nonexistent'; do
  echo "### SEM literal: ls-tree -r -- '$p'"; $G ls-tree -r --format='%(objectmode) %(path)' $C -- "$p" 2>&1; echo "exit=$?"
  echo "### COM --literal-pathspecs: ls-tree -r -- '$p'"; $G --literal-pathspecs ls-tree -r --format='%(objectmode) %(path)' $C -- "$p" 2>&1; echo "exit=$?"
  echo "### COM --literal-pathspecs: filhos ls-tree -- '$p/'"; $G --literal-pathspecs ls-tree --format='%(objecttype) %(objectmode) %(path)' $C -- "$p/" 2>&1; echo "exit=$?"
done
echo "### git archive (sem literal, como a receita instalada) -- ':x/f'"; $G archive --format=tar $C -- ':x/f' 2>&1 >/dev/null; echo "exit=$?"
echo "### git archive (sem literal) -- ':(top)y/f'"; $G archive --format=tar $C -- ':(top)y/f' 2>&1 | tar -t 2>&1; echo "exit=${PIPESTATUS[0]}"
echo "### git archive (sem literal) -- ':!z/f' 'a/f'"; $G archive --format=tar $C -- ':!z/f' 'a/f' 2>&1 | tar -t 2>&1; echo "exit=${PIPESTATUS[0]}"
