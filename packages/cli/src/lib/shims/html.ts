/** WIT html shim — document-handle API backed by cheerio for dev/validate/test. */
import { load as cheerioLoad, type CheerioAPI, type Cheerio, type Element } from 'cheerio'

interface ParsedDoc {
  $: CheerioAPI
  elements: Map<number, Cheerio<Element>>
  nodeToId: Map<any, number>
  nextElementId: number
}

const docs = new Map<number, ParsedDoc>()
let nextDocId = 1

function getDoc(docId: number): ParsedDoc {
  const doc = docs.get(docId)
  if (!doc) throw new Error(`html shim: unknown docId ${docId}`)
  return doc
}

function storeElement(doc: ParsedDoc, $el: Cheerio<Element>): number {
  const node = $el.get(0)
  if (node) {
    const existing = doc.nodeToId.get(node)
    if (existing !== undefined) return existing
  }
  const id = doc.nextElementId++
  doc.elements.set(id, $el)
  if (node) doc.nodeToId.set(node, id)
  return id
}

function getElement(doc: ParsedDoc, elementId: number): Cheerio<Element> {
  const el = doc.elements.get(elementId)
  if (!el) throw new Error(`html shim: unknown elementId ${elementId} in doc`)
  return el
}

// Document lifecycle

export function parseDocument(html: string): number {
  const id = nextDocId++
  docs.set(id, { $: cheerioLoad(html), elements: new Map(), nodeToId: new Map(), nextElementId: 1 })
  return id
}

export function freeDocument(docId: number): void {
  docs.delete(docId)
}

// Querying

export function select(docId: number, selector: string): number[] {
  const doc = getDoc(docId)
  const ids: number[] = []
  doc.$(selector).each((_, el) => {
    ids.push(storeElement(doc, doc.$(el)))
  })
  return ids
}

export function selectWithin(docId: number, elementId: number, selector: string): number[] {
  const doc = getDoc(docId)
  const $el = getElement(doc, elementId)
  const ids: number[] = []
  $el.find(selector).each((_, el) => {
    ids.push(storeElement(doc, doc.$(el)))
  })
  return ids
}

// Element data

export function text(docId: number, elementId: number): string {
  const doc = getDoc(docId)
  return getElement(doc, elementId).text()
}

export function html(docId: number, elementId: number): string {
  const doc = getDoc(docId)
  return getElement(doc, elementId).html() ?? ''
}

export function outerHtml(docId: number, elementId: number): string {
  const doc = getDoc(docId)
  const $el = getElement(doc, elementId)
  return doc.$.html($el) ?? ''
}

export function attr(docId: number, elementId: number, name: string): string | undefined {
  const doc = getDoc(docId)
  return getElement(doc, elementId).attr(name)
}

export function attrs(docId: number, elementId: number): [string, string][] {
  const doc = getDoc(docId)
  const $el = getElement(doc, elementId)
  const el = $el.get(0)
  if (!el || el.type !== 'tag') return []
  return Object.entries(el.attribs).map(([k, v]) => [k, v])
}

export function hasClass(docId: number, elementId: number, className: string): boolean {
  const doc = getDoc(docId)
  return getElement(doc, elementId).hasClass(className)
}

// Traversal

export function parent(docId: number, elementId: number): number | undefined {
  const doc = getDoc(docId)
  const $parent = getElement(doc, elementId).parent()
  if (!$parent.length || $parent.is('html') || $parent.is('body') || $parent.is('[_root]')) return undefined
  return storeElement(doc, $parent as Cheerio<Element>)
}

export function children(docId: number, elementId: number): number[] {
  const doc = getDoc(docId)
  const ids: number[] = []
  getElement(doc, elementId).children().each((_, el) => {
    ids.push(storeElement(doc, doc.$(el)))
  })
  return ids
}

export function nextSibling(docId: number, elementId: number): number | undefined {
  const doc = getDoc(docId)
  const $next = getElement(doc, elementId).next()
  if (!$next.length) return undefined
  return storeElement(doc, $next as Cheerio<Element>)
}

export function prevSibling(docId: number, elementId: number): number | undefined {
  const doc = getDoc(docId)
  const $prev = getElement(doc, elementId).prev()
  if (!$prev.length) return undefined
  return storeElement(doc, $prev as Cheerio<Element>)
}

export function siblings(docId: number, elementId: number): number[] {
  const doc = getDoc(docId)
  const ids: number[] = []
  getElement(doc, elementId).siblings().each((_, el) => {
    ids.push(storeElement(doc, doc.$(el)))
  })
  return ids
}

export function closest(docId: number, elementId: number, selector: string): number | undefined {
  const doc = getDoc(docId)
  const $closest = getElement(doc, elementId).closest(selector)
  if (!$closest.length) return undefined
  return storeElement(doc, $closest as Cheerio<Element>)
}

// Bulk extraction

interface ExtractQueryWire {
  name: string
  sel: string
  op?: 'text' | 'first-text' | 'attr' | 'first-attr' | 'html' | 'first-html' | 'count'
  attr?: string
}

function runQueries($: CheerioAPI, queries: ExtractQueryWire[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const q of queries) {
    const op = q.op ?? 'text'
    const attrName = q.attr ?? ''
    try {
      const els = $(q.sel)
      switch (op) {
        case 'text':
          result[q.name] = els.toArray().map((e) => $(e).text())
          break
        case 'first-text':
          result[q.name] = els.length ? $(els[0]).text() : null
          break
        case 'attr':
          result[q.name] = els.toArray()
            .map((e) => $(e).attr(attrName) ?? '')
            .filter((v) => v.length > 0)
          break
        case 'first-attr': {
          if (!els.length) { result[q.name] = null; break }
          const v = $(els[0]).attr(attrName) ?? ''
          result[q.name] = v.length > 0 ? v : null
          break
        }
        case 'html':
          result[q.name] = els.toArray().map((e) => $(e).html() ?? '')
          break
        case 'first-html':
          result[q.name] = els.length ? ($(els[0]).html() ?? '') : null
          break
        case 'count':
          result[q.name] = els.length
          break
        default:
          result[q.name] = null
      }
    } catch {
      result[q.name] = null
    }
  }
  return result
}

export function selectMany(docId: number, queries: ExtractQueryWire[]): Record<string, unknown> {
  const doc = getDoc(docId)
  return runQueries(doc.$, queries)
}

export function extractAll(html: string, queries: ExtractQueryWire[]): Record<string, unknown> {
  return runQueries(cheerioLoad(html), queries)
}
