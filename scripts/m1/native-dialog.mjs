import koffi from 'koffi'
const user = koffi.load('user32.dll')
const callbackType = koffi.proto('int __stdcall M1WindowEnumerator(void *, intptr_t)')
const enumerate = user.func('int __stdcall EnumWindows(M1WindowEnumerator *callback, intptr_t)')
const children = user.func('int __stdcall EnumChildWindows(void *, M1WindowEnumerator *callback, intptr_t)')
const owner = user.func('uint32_t __stdcall GetWindowThreadProcessId(void *, _Out_ uint32_t *)')
const text = user.func('int __stdcall GetWindowTextW(void *, _Out_ void *, int)')
const post = user.func('int __stdcall PostMessageW(void *, uint32_t, uintptr_t, intptr_t)')
const setPosition = user.func('int __stdcall SetWindowPos(void *, void *, int, int, int, int, uint32_t)')
export function focusOwnWindow(handle) {
  if (handle.exited) throw new Error('WINDOW_OWNER_EXITED')
  const show = user.func('int __stdcall ShowWindow(void *, int)'), foreground = user.func('int __stdcall SetForegroundWindow(void *)')
  let found = false
  const inspect = koffi.register(hwnd => {
    const pid = new Uint32Array(1); owner(hwnd, pid)
    if (pid[0] !== handle.pid) return 1
    const buffer = Buffer.alloc(2048); text(hwnd, buffer, 1024)
    if (buffer.toString('utf16le').split('\0')[0] === '工作站') { show(hwnd, 6); show(hwnd, 9); foreground(hwnd); found = true }
    return 1
  }, koffi.pointer(callbackType))
  try { enumerate(inspect, 0) } finally { koffi.unregister(inspect) }
  if (!found) throw new Error('OWN_WINDOW_NOT_FOUND')
}
export function resizeOwnWindow(handle, width, height) {
  if (handle.exited) throw new Error('WINDOW_OWNER_EXITED')
  let changed = false
  const inspect = koffi.register(hwnd => {
    const pid = new Uint32Array(1); owner(hwnd, pid)
    if (pid[0] !== handle.pid) return 1
    const buffer = Buffer.alloc(2048); text(hwnd, buffer, 1024)
    if (buffer.toString('utf16le').split('\0')[0] === '工作站') { if (!setPosition(hwnd, null, 0, 0, width, height, 0x16)) throw new Error('WINDOW_RESIZE_FAILED'); changed = true }
    return 1
  }, koffi.pointer(callbackType))
  try { enumerate(inspect, 0) } finally { koffi.unregister(inspect) }
  if (!changed) throw new Error('OWN_WINDOW_NOT_FOUND')
}
export async function invokeOwnDialog(handle, buttonName) {
  const deadline = Date.now() + 15000, observed = []
  while (Date.now() < deadline) {
    if (handle.exited) throw new Error('DIALOG_OWNER_EXITED')
    let clicked = false
    const inspect = koffi.register(hwnd => {
      const pid = new Uint32Array(1); owner(hwnd, pid)
      if (pid[0] !== handle.pid) return 1
      const scan = koffi.register(child => {
        const buffer = Buffer.alloc(2048); text(child, buffer, 1024); const label = buffer.toString('utf16le').split('\0')[0]
        if (label && !observed.includes(label)) observed.push(label)
        if (label.replaceAll('&', '') === buttonName) { if (!post(child, 0x00f5, 0, 0)) throw new Error('DIALOG_CLICK_FAILED'); clicked = true }
        return 1
      }, koffi.pointer(callbackType))
      try { children(hwnd, scan, 0) } finally { koffi.unregister(scan) }
      return 1
    }, koffi.pointer(callbackType))
    try { enumerate(inspect, 0) } finally { koffi.unregister(inspect) }
    if (clicked) return { nativeConfirmation: true, observed }
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('OWN_DIALOG_BUTTON_NOT_FOUND:' + JSON.stringify(observed))
}
