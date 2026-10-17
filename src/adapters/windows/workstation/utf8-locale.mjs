// Bash readline echoes non-ASCII input as octal (\344\275\240) when the shell
// has no UTF-8 locale; a packaged app launched from Explorer inherits none.
// LC_ALL wins over LC_CTYPE/LANG, so a present non-UTF-8 LC_ALL would defeat
// any LC_CTYPE we add. Return the value to force, or null to leave the
// environment untouched when the effective locale is already UTF-8.
export function utf8Locale(env) {
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG
  if (locale && /utf-?8/i.test(String(locale))) return null
  return 'C.UTF-8'
}
