export function isImeKey(event, composing = false) {
  return composing || event.isComposing === true || event.keyCode === 229 || event.which === 229
}
