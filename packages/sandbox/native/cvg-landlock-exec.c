/*
 * cvg-landlock-exec — SPEC 0288 (PAR-X02). Applies a Landlock ruleset to itself and executes
 * the payload, or answers the ABI probe. Nothing comes from the environment: arguments and two
 * private file descriptors only. It never executes the payload without the ruleset applied.
 *
 *   cvg-landlock-exec --probe --status-fd F
 *   cvg-landlock-exec --status-fd F --rules-fd R -- /absolute/payload [args...]
 *
 * Rules (fd R, at most RULES_MAX_BYTES): one rule per line, "<hex access mask> <absolute path>".
 * Status (fd F): one JSON object, then F is closed before execve.
 */
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/landlock.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <unistd.h>

/* Compile-time only (tests build a copy with a higher floor); there is no runtime override. */
#ifndef MIN_ABI
#define MIN_ABI 3
#endif
#define RULES_MAX_BYTES 65536
#define RULES_MAX_COUNT 256

/* Fixed values from the kernel UAPI, so an older header cannot silently drop a right. */
#define FS_EXECUTE (1ULL << 0)
#define FS_WRITE_FILE (1ULL << 1)
#define FS_READ_FILE (1ULL << 2)
#define FS_READ_DIR (1ULL << 3)
#define FS_REMOVE_DIR (1ULL << 4)
#define FS_REMOVE_FILE (1ULL << 5)
#define FS_MAKE_CHAR (1ULL << 6)
#define FS_MAKE_DIR (1ULL << 7)
#define FS_MAKE_REG (1ULL << 8)
#define FS_MAKE_SOCK (1ULL << 9)
#define FS_MAKE_FIFO (1ULL << 10)
#define FS_MAKE_BLOCK (1ULL << 11)
#define FS_MAKE_SYM (1ULL << 12)
#define FS_REFER (1ULL << 13)
#define FS_TRUNCATE (1ULL << 14)
#define FS_IOCTL_DEV (1ULL << 15)
#define NET_BIND_TCP (1ULL << 0)
#define NET_CONNECT_TCP (1ULL << 1)
#define SCOPE_ABSTRACT_UNIX (1ULL << 0)
#define SCOPE_SIGNAL (1ULL << 1)
#define FILE_RIGHTS (FS_EXECUTE | FS_WRITE_FILE | FS_READ_FILE | FS_TRUNCATE | FS_IOCTL_DEV)

struct ruleset_attr {
  uint64_t handled_access_fs;
  uint64_t handled_access_net;
  uint64_t scoped;
};

static int status_fd = -1;

static void status_write(const char *json) {
  if (status_fd < 0) return;
  size_t left = strlen(json);
  const char *p = json;
  while (left > 0) {
    ssize_t n = write(status_fd, p, left);
    if (n < 0) {
      if (errno == EINTR) continue;
      return;
    }
    p += n;
    left -= (size_t)n;
  }
}

/* Reports the failure on the status channel and exits; the payload never runs. */
static void fail(const char *code, int err) {
  char buf[160];
  snprintf(buf, sizeof buf, "{\"applied\":false,\"error\":\"%s\",\"errno\":%d}\n", code, err);
  status_write(buf);
  _exit(125);
}

static long abi_version(void) {
  return syscall(SYS_landlock_create_ruleset, NULL, 0, LANDLOCK_CREATE_RULESET_VERSION);
}

static uint64_t fs_rights_for(long abi) {
  uint64_t rights = FS_EXECUTE | FS_WRITE_FILE | FS_READ_FILE | FS_READ_DIR | FS_REMOVE_DIR |
                    FS_REMOVE_FILE | FS_MAKE_CHAR | FS_MAKE_DIR | FS_MAKE_REG | FS_MAKE_SOCK |
                    FS_MAKE_FIFO | FS_MAKE_BLOCK | FS_MAKE_SYM;
  if (abi >= 2) rights |= FS_REFER;
  if (abi >= 3) rights |= FS_TRUNCATE;
  if (abi >= 5) rights |= FS_IOCTL_DEV;
  return rights;
}

static int parse_fd(const char *text) {
  char *end = NULL;
  errno = 0;
  long v = strtol(text, &end, 10);
  if (errno != 0 || end == text || *end != '\0' || v < 3 || v > 1023) return -1;
  return (int)v;
}

static size_t read_all(int fd, char *buf, size_t cap) {
  size_t used = 0;
  for (;;) {
    if (used == cap) {
      char extra;
      ssize_t n = read(fd, &extra, 1);
      if (n > 0) fail("rules_too_large", 0);
      return used;
    }
    ssize_t n = read(fd, buf + used, cap - used);
    if (n < 0) {
      if (errno == EINTR) continue;
      fail("rules_unreadable", errno);
    }
    if (n == 0) return used;
    used += (size_t)n;
  }
}

static void add_rules(int ruleset, char *text, size_t len, uint64_t handled) {
  size_t count = 0;
  char *line = text;
  char *end = text + len;
  while (line < end) {
    char *nl = memchr(line, '\n', (size_t)(end - line));
    if (!nl) fail("rules_unterminated", 0);
    *nl = '\0';
    if (++count > RULES_MAX_COUNT) fail("rules_too_many", 0);
    char *space = strchr(line, ' ');
    if (!space || space == line) fail("rule_malformed", 0);
    *space = '\0';
    const char *mask_text = line;
    const char *path = space + 1;
    size_t plen = strlen(path);
    if (path[0] != '/' || strstr(path, "/../") || strstr(path, "/./") ||
        (plen >= 3 && strcmp(path + plen - 3, "/..") == 0) ||
        (plen >= 2 && strcmp(path + plen - 2, "/.") == 0))
      fail("rule_path_not_absolute", 0);
    char *mask_end = NULL;
    errno = 0;
    unsigned long long mask = strtoull(mask_text, &mask_end, 16);
    if (errno != 0 || *mask_end != '\0' || mask == 0) fail("rule_mask_malformed", 0);
    if ((mask & ~handled) != 0) fail("rule_mask_unknown_right", 0);
    int fd = open(path, O_PATH | O_CLOEXEC);
    if (fd < 0) fail("rule_path_unavailable", errno);
    struct stat st;
    if (fstat(fd, &st) != 0) fail("rule_path_unavailable", errno);
    /* A file can only carry file rights; directory rights on it would be refused by the kernel. */
    if (!S_ISDIR(st.st_mode)) mask &= FILE_RIGHTS;
    if (mask != 0) {
      struct landlock_path_beneath_attr beneath = {.allowed_access = mask, .parent_fd = fd};
      if (syscall(SYS_landlock_add_rule, ruleset, LANDLOCK_RULE_PATH_BENEATH, &beneath, 0) != 0)
        fail("rule_add_failed", errno);
    }
    close(fd);
    line = nl + 1;
  }
}

int main(int argc, char **argv) {
  int probe = 0, rules_fd = -1, payload = -1;
  for (int i = 1; i < argc; i++) {
    if (strcmp(argv[i], "--probe") == 0) probe = 1;
    else if (strcmp(argv[i], "--status-fd") == 0 && i + 1 < argc) status_fd = parse_fd(argv[++i]);
    else if (strcmp(argv[i], "--rules-fd") == 0 && i + 1 < argc) rules_fd = parse_fd(argv[++i]);
    else if (strcmp(argv[i], "--") == 0) {
      payload = i + 1;
      break;
    } else {
      fail("usage", 0);
    }
  }
  if (status_fd < 0) return 125;
  long abi = abi_version();
  if (probe) {
    char buf[64];
    snprintf(buf, sizeof buf, "{\"abi\":%ld}\n", abi > 0 ? abi : 0);
    status_write(buf);
    return abi >= 1 ? 0 : 3;
  }
  if (rules_fd < 0 || payload < 0 || payload >= argc || argv[payload][0] != '/') fail("usage", 0);
  if (abi < MIN_ABI) fail("abi_too_low", abi < 0 ? errno : 0);

  static char rules[RULES_MAX_BYTES];
  size_t len = read_all(rules_fd, rules, sizeof rules);
  if (len == 0) fail("rules_empty", 0);
  if (memchr(rules, '\0', len)) fail("rule_malformed", 0);

  struct ruleset_attr attr = {.handled_access_fs = fs_rights_for(abi)};
  size_t attr_size = sizeof(uint64_t);
  if (abi >= 4) {
    /* No network rule is ever added: every TCP bind and connect is denied. */
    attr.handled_access_net = NET_BIND_TCP | NET_CONNECT_TCP;
    attr_size = 2 * sizeof(uint64_t);
  }
  if (abi >= 6) {
    attr.scoped = SCOPE_ABSTRACT_UNIX | SCOPE_SIGNAL;
    attr_size = 3 * sizeof(uint64_t);
  }
  int ruleset = (int)syscall(SYS_landlock_create_ruleset, &attr, attr_size, 0);
  if (ruleset < 0) fail("ruleset_create_failed", errno);
  add_rules(ruleset, rules, len, attr.handled_access_fs);
  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) fail("no_new_privs_failed", errno);
  if (syscall(SYS_landlock_restrict_self, ruleset, 0) != 0) fail("restrict_self_failed", errno);
  close(ruleset);
  close(rules_fd);

  char buf[200];
  snprintf(buf, sizeof buf,
           "{\"applied\":true,\"abi\":%ld,\"handledFs\":%llu,\"handledNet\":%llu,\"scoped\":%llu}\n",
           abi, (unsigned long long)attr.handled_access_fs,
           (unsigned long long)attr.handled_access_net, (unsigned long long)attr.scoped);
  status_write(buf);
  close(status_fd);
  execv(argv[payload], &argv[payload]);
  _exit(127);
}
