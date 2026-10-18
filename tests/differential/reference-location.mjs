// A location supplied by the test runner; native pins, hashes and alias
// checks remain enforced by the driver and independent inventory reader.
export const DEFAULT_REFERENCE_ROOT =
  '/home/ricardo/deepseek-harness-session-fixes'
export const REFERENCE_ROOT =
  process.env.CVG_DIFFERENTIAL_REFERENCE_ROOT || DEFAULT_REFERENCE_ROOT
