/**
 * Portable WIT html shim — document-handle API, pure JS, no DOM, no Node APIs.
 * Bundled into production ESM builds so extensions work in SpiderMonkey
 * without the html WIT interface in the shared engine.
 */

// ── Minimal HTML parser ─────────────────────────────────────────────

interface DomNode {
  tag: string
  attrs: Record<string, string>
  children: DomNode[]
  parent: DomNode | null
  text: string
  raw: string
  inner: string
}

function parseAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? ''
  }
  return attrs
}

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

function parseHtml(html: string): DomNode[] {
  const nodes: DomNode[] = []
  const stack: { children: DomNode[]; parent: DomNode | null }[] = [{ children: nodes, parent: null }]

  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^>]*?)?)(\s*\/?)>|([^<]+)/g
  let m: RegExpExecArray | null

  while ((m = re.exec(html)) !== null) {
    const isClose = m[1] === '/'
    const tagName = m[2]?.toLowerCase()
    const attrStr = m[3] || ''
    const selfClose = m[4]?.includes('/')
    const textContent = m[5]

    if (textContent) {
      const cur = stack[stack.length - 1]
      cur.children.push({
        tag: '#text', attrs: {}, children: [], parent: cur.parent,
        text: textContent, raw: textContent, inner: '',
      })
      continue
    }

    if (isClose) {
      if (stack.length > 1) stack.pop()
      continue
    }

    const cur = stack[stack.length - 1]
    const node: DomNode = {
      tag: tagName, attrs: parseAttrs(attrStr), children: [],
      parent: cur.parent, text: '', raw: '', inner: '',
    }
    cur.children.push(node)

    if (!selfClose && !VOID_TAGS.has(tagName)) {
      stack.push({ children: node.children, parent: node })
    }
  }

  function computeText(node: DomNode): string {
    if (node.tag === '#text') return node.text
    return node.children.map(computeText).join('')
  }

  function computeHtml(node: DomNode): string {
    if (node.tag === '#text') return node.text
    const attrStr = Object.entries(node.attrs)
      .map(([k, v]) => v === '' ? k : `${k}="${v}"`)
      .join(' ')
    const open = attrStr ? `<${node.tag} ${attrStr}>` : `<${node.tag}>`
    if (VOID_TAGS.has(node.tag)) return open
    const inner = node.children.map(computeHtml).join('')
    return `${open}${inner}</${node.tag}>`
  }

  function finalize(node: DomNode): void {
    for (const child of node.children) {
      child.parent = child.parent ?? node
      finalize(child)
    }
    node.text = computeText(node)
    node.inner = node.children.map(computeHtml).join('')
    node.raw = computeHtml(node)
  }

  for (const n of nodes) finalize(n)
  return nodes
}

// ── CSS selector matcher ────────────────────────────────────────────

interface SimpleSelector {
  tag?: string
  classes: string[]
  id?: string
  attrs: Array<{ name: string; op?: string; value?: string }>
}

function parseSelector(sel: string): SimpleSelector[][] {
  return sel.split(',').map(group => {
    return group.trim().split(/\s+/).map(part => {
      const s: SimpleSelector = { classes: [], attrs: [] }
      const re = /^([a-zA-Z][a-zA-Z0-9]*)|([#.])([a-zA-Z_-][\w-]*)|\[([a-zA-Z_:][\w:.-]*)(?:([~|^$*]?=)"?([^"\]]*)"?)?\]/g
      let m: RegExpExecArray | null
      while ((m = re.exec(part)) !== null) {
        if (m[1]) s.tag = m[1].toLowerCase()
        else if (m[2] === '#') s.id = m[3]
        else if (m[2] === '.') s.classes.push(m[3])
        else if (m[4]) s.attrs.push({ name: m[4], op: m[5], value: m[6] })
      }
      return s
    })
  })
}

function matchesSimple(node: DomNode, sel: SimpleSelector): boolean {
  if (node.tag === '#text') return false
  if (sel.tag && node.tag !== sel.tag) return false
  if (sel.id && node.attrs['id'] !== sel.id) return false
  const nodeClasses = (node.attrs['class'] || '').split(/\s+/)
  for (const cls of sel.classes) {
    if (!nodeClasses.includes(cls)) return false
  }
  for (const a of sel.attrs) {
    const val = node.attrs[a.name]
    if (val === undefined) return false
    if (a.op === '=' && val !== a.value) return false
    if (a.op === '~=' && !val.split(/\s+/).includes(a.value!)) return false
    if (a.op === '|=' && val !== a.value && !val.startsWith(a.value + '-')) return false
    if (a.op === '^=' && !val.startsWith(a.value!)) return false
    if (a.op === '$=' && !val.endsWith(a.value!)) return false
    if (a.op === '*=' && !val.includes(a.value!)) return false
  }
  return true
}

function querySelectorAll(roots: DomNode[], selectorStr: string): DomNode[] {
  const groups = parseSelector(selectorStr)
  const results: DomNode[] = []
  const seen = new Set<DomNode>()

  function walk(nodes: DomNode[], chain: SimpleSelector[], depth: number) {
    for (const node of nodes) {
      if (node.tag === '#text') continue
      if (depth === chain.length - 1) {
        if (matchesSimple(node, chain[depth]) && !seen.has(node)) {
          results.push(node)
          seen.add(node)
        }
      }
      if (depth < chain.length - 1 && matchesSimple(node, chain[depth])) {
        walk(node.children, chain, depth + 1)
      }
      walk(node.children, chain, depth)
    }
  }

  for (const chain of groups) {
    if (chain.length === 1) {
      function findAll(nodes: DomNode[]) {
        for (const n of nodes) {
          if (n.tag !== '#text' && matchesSimple(n, chain[0]) && !seen.has(n)) {
            results.push(n)
            seen.add(n)
          }
          findAll(n.children)
        }
      }
      findAll(roots)
    } else {
      walk(roots, chain, 0)
    }
  }

  return results
}

function matchesSelector(node: DomNode, selectorStr: string): boolean {
  const groups = parseSelector(selectorStr)
  return groups.some(chain => chain.length === 1 && matchesSimple(node, chain[0]))
}

// ── Document-handle API ─────────────────────────────────────────────

interface ParsedDoc {
  roots: DomNode[]
  elements: Map<number, DomNode>
  nodeToId: Map<DomNode, number>
  nextElementId: number
}

const docs = new Map<number, ParsedDoc>()
let nextDocId = 1

function getDoc(docId: number): ParsedDoc {
  const doc = docs.get(docId)
  if (!doc) throw new Error(`html-portable shim: unknown docId ${docId}`)
  return doc
}

function storeElement(doc: ParsedDoc, node: DomNode): number {
  const existing = doc.nodeToId.get(node)
  if (existing !== undefined) return existing
  const id = doc.nextElementId++
  doc.elements.set(id, node)
  doc.nodeToId.set(node, id)
  return id
}

function getElement(doc: ParsedDoc, elementId: number): DomNode {
  const el = doc.elements.get(elementId)
  if (!el) throw new Error(`html-portable shim: unknown elementId ${elementId}`)
  return el
}

// Document lifecycle

export function parseDocument(html: string): number {
  const id = nextDocId++
  docs.set(id, { roots: parseHtml(html), elements: new Map(), nodeToId: new Map(), nextElementId: 1 })
  return id
}

export function freeDocument(docId: number): void {
  docs.delete(docId)
}

// Querying

export function select(docId: number, selector: string): number[] {
  const doc = getDoc(docId)
  return querySelectorAll(doc.roots, selector).map(n => storeElement(doc, n))
}

export function selectWithin(docId: number, elementId: number, selector: string): number[] {
  const doc = getDoc(docId)
  const el = getElement(doc, elementId)
  return querySelectorAll(el.children, selector).map(n => storeElement(doc, n))
}

// Element data

export function text(docId: number, elementId: number): string {
  return getElement(getDoc(docId), elementId).text
}

export function html(docId: number, elementId: number): string {
  return getElement(getDoc(docId), elementId).inner
}

export function outerHtml(docId: number, elementId: number): string {
  return getElement(getDoc(docId), elementId).raw
}

export function attr(docId: number, elementId: number, name: string): string | undefined {
  const node = getElement(getDoc(docId), elementId)
  return node.attrs[name]
}

export function attrs(docId: number, elementId: number): [string, string][] {
  const node = getElement(getDoc(docId), elementId)
  return Object.entries(node.attrs)
}

export function hasClass(docId: number, elementId: number, className: string): boolean {
  const node = getElement(getDoc(docId), elementId)
  return (node.attrs['class'] || '').split(/\s+/).includes(className)
}

// Traversal

export function parent(docId: number, elementId: number): number | undefined {
  const doc = getDoc(docId)
  const node = getElement(doc, elementId)
  if (!node.parent || node.parent.tag === '#text') return undefined
  return storeElement(doc, node.parent)
}

export function children(docId: number, elementId: number): number[] {
  const doc = getDoc(docId)
  const node = getElement(doc, elementId)
  return node.children
    .filter(c => c.tag !== '#text')
    .map(c => storeElement(doc, c))
}

export function nextSibling(docId: number, elementId: number): number | undefined {
  const doc = getDoc(docId)
  const node = getElement(doc, elementId)
  if (!node.parent) return undefined
  const sibs = node.parent.children.filter(c => c.tag !== '#text')
  const idx = sibs.indexOf(node)
  if (idx < 0 || idx >= sibs.length - 1) return undefined
  return storeElement(doc, sibs[idx + 1])
}

export function prevSibling(docId: number, elementId: number): number | undefined {
  const doc = getDoc(docId)
  const node = getElement(doc, elementId)
  if (!node.parent) return undefined
  const sibs = node.parent.children.filter(c => c.tag !== '#text')
  const idx = sibs.indexOf(node)
  if (idx <= 0) return undefined
  return storeElement(doc, sibs[idx - 1])
}

export function siblings(docId: number, elementId: number): number[] {
  const doc = getDoc(docId)
  const node = getElement(doc, elementId)
  if (!node.parent) return []
  return node.parent.children
    .filter(c => c.tag !== '#text' && c !== node)
    .map(c => storeElement(doc, c))
}

export function closest(docId: number, elementId: number, selector: string): number | undefined {
  const doc = getDoc(docId)
  let current: DomNode | null = getElement(doc, elementId)
  while (current) {
    if (current.tag !== '#text' && matchesSelector(current, selector)) {
      return storeElement(doc, current)
    }
    current = current.parent
  }
  return undefined
}
