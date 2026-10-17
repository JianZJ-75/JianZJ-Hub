export function leaves(tree) { return !tree ? [] : tree.type === 'leaf' ? [tree.paneId] : [...leaves(tree.first), ...leaves(tree.second)] }
export function split(tree, paneId, nextId, axis) {
  if (!['right', 'down'].includes(axis) || nextId === paneId || leaves(tree).includes(nextId) || !leaves(tree).includes(paneId)) throw new Error('INVALID_SPLIT')
  const visit = node => node.type === 'leaf' ? node.paneId === paneId ? { type: 'split', id: nextId + '-split', axis, ratio: .5, first: node, second: { type: 'leaf', paneId: nextId } } : node : { ...node, first: visit(node.first), second: visit(node.second) }
  return visit(tree)
}
export function remove(tree, paneId) {
  if (!tree || tree.type === 'leaf') return tree?.paneId === paneId ? null : tree
  const first = remove(tree.first, paneId), second = remove(tree.second, paneId)
  return !first ? second : !second ? first : { ...tree, first, second }
}
export function minimum(tree, width = 220, height = 160) {
  if (!tree || tree.type === 'leaf') return { width, height }
  const a = minimum(tree.first, width, height), b = minimum(tree.second, width, height)
  return tree.axis === 'right' ? { width: a.width + b.width + 10, height: Math.max(a.height, b.height) } : { width: Math.max(a.width, b.width), height: a.height + b.height + 10 }
}
export function ratio(tree, id, value, span, cell = { width: 220, height: 160 }) {
  if (!tree || tree.type === 'leaf') return tree
  if (tree.id !== id) return { ...tree, first: ratio(tree.first, id, value, span, cell), second: ratio(tree.second, id, value, span, cell) }
  const dimension = tree.axis === 'right' ? 'width' : 'height', available = span - 10
  const a = minimum(tree.first, cell.width, cell.height)[dimension], b = minimum(tree.second, cell.width, cell.height)[dimension]
  if (!Number.isFinite(value) || available < a + b) return tree
  return { ...tree, ratio: Math.min(1 - b / available, Math.max(a / available, value)) }
}
export function validate(tree) {
  const ids = leaves(tree)
  if (new Set(ids).size !== ids.length) throw new Error('DUPLICATE_PANE')
  const visit = t => { if (!t) return; if (t.type === 'leaf') { if (typeof t.paneId !== 'string' || !t.paneId) throw new Error('INVALID_LEAF'); return } if (t.type !== 'split' || !['right', 'down'].includes(t.axis) || !Number.isFinite(t.ratio) || t.ratio <= 0 || t.ratio >= 1 || !t.first || !t.second) throw new Error('INVALID_TREE'); visit(t.first); visit(t.second) }
  visit(tree); return true
}
