export function isImeKey(event, composing = false) {
  return composing || event.isComposing === true || event.keyCode === 229 || event.which === 229
}

// Pinned xterm 6 assumes composition appends at value.length. Windows TSF can
// instead insert at selection 0. Present the helper with an append-only read
// view of the same native edit range; never change the DOM value or caret.
// Keeping the virtual prefix also preserves xterm's overlapping commit slices.
export function installCompositionInput(helper, textarea) {
  let base = '', prefix = '', suffix = '', active = false, edited = true, anchorText = '', selected = false
  const value = () => {
    const text = textarea.value
    if (!edited) return base
    if (text.length < prefix.length + suffix.length || !text.startsWith(prefix) || !text.endsWith(suffix)) return text
    return base + text.slice(prefix.length, text.length - suffix.length)
  }
  const anchor = () => {
    const text = textarea.value
    if (!text && !helper.isComposing && !helper._isSendingComposition) { base = prefix = suffix = ''; edited = true }
    const previous = value()
    const start = textarea.selectionStart ?? text.length, end = textarea.selectionEnd ?? start
    base = previous; prefix = text.slice(0, start); suffix = text.slice(end); edited = false
    anchorText = text; selected = end > start
  }
  helper._textarea = new Proxy(textarea, {
    get(target, key) {
      if (key === 'value') return value()
      const result = Reflect.get(target, key, target)
      return typeof result === 'function' ? result.bind(target) : result
    },
    set(target, key, next) { return Reflect.set(target, key, next, target) }
  })
  return {
    get active() { return active },
    start() { anchor(); active = true },
    end(event) {
      active = false
      // A cancelled native replacement can restore the selected old scratch.
      // Equal non-empty commits still count as new input; never deduplicate them.
      if (event?.data === '' && selected && textarea.value === anchorText) edited = false
    },
    input() { edited = true },
    keydown(event) {
      // xterm's non-composition 229 path also reads a deferred textarea delta.
      if (event.keyCode === 229 && !helper.isComposing && !helper._isSendingComposition) anchor()
    }
  }
}
