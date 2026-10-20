// CAP-DP-NODE-DRIVER preload_shim (DDP-03): loaded with --import file:///profile/dp-platform-shim.mjs?platform=<p>&arch=<a> into a
// wrapper process, before the wrapper's own module. It redefines process.platform and process.arch with Object.defineProperty
// (same descriptor shape as the original) and writes /work/shim/<pid>.json. The env is never used as a channel.
import fs from 'node:fs';

const u = new URL(import.meta.url);
const platform = u.searchParams.get('platform');
const arch = u.searchParams.get('arch');
if (!/^[a-z0-9]{2,12}$/.test(platform ?? '') || !/^[a-z0-9]{2,12}$/.test(arch ?? '')) throw new Error('dp-platform-shim: bad query');
const real = { platform: process.platform, arch: process.arch };
const pd = Object.getOwnPropertyDescriptor(process, 'platform');
const ad = Object.getOwnPropertyDescriptor(process, 'arch');
Object.defineProperty(process, 'platform', { ...pd, value: platform });
Object.defineProperty(process, 'arch', { ...ad, value: arch });
const rec = { pid: process.pid, platform, arch, real, applied: process.platform === platform && process.arch === arch,
  descriptor_platform: { writable: pd.writable, enumerable: pd.enumerable, configurable: pd.configurable, data: Object.hasOwn(pd, 'value') } };
fs.mkdirSync('/work/shim', { recursive: true });
fs.writeFileSync(`/work/shim/${process.pid}.json`, JSON.stringify(rec));
