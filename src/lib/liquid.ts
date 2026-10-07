type Token = { t: 'text' | 'out' | 'tag'; v: string }

type IfBranch = { cond: string | null; negate?: boolean; body: Node[] }
type Node =
  | { type: 'text'; value: string }
  | { type: 'output'; expr: string }
  | { type: 'if'; branches: IfBranch[] }
  | { type: 'for'; varName: string; collExpr: string; body: Node[] }
  | { type: 'assign'; name: string; expr: string }
  | { type: 'capture'; name: string; body: Node[] }
  | { type: 'customtag'; name: string; args: string }

export type LiquidInput = {
  name: string
  contexts: string[]
  suggestedValues: string[]
}

type Ctx = Record<string, unknown>

const RESERVED = new Set([
  'if',
  'elsif',
  'else',
  'endif',
  'for',
  'in',
  'endfor',
  'unless',
  'endunless',
  'assign',
  'capture',
  'endcapture',
  'comment',
  'endcomment',
  'raw',
  'endraw',
  'and',
  'or',
  'not',
  'contains',
  'true',
  'false',
  'nil',
  'null',
  'limit',
  'offset',
  'reversed',
  'with',
  'by',
])

const FILTERS = new Set([
  'default',
  'upcase',
  'downcase',
  'capitalize',
  'strip',
  'size',
  'truncate',
  'escape',
  'replace',
  'prepend',
  'append',
  'first',
  'last',
  'date',
  'money',
  'json',
  'split',
  'join',
  'plus',
  'minus',
  'times',
  'divided_by',
])

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  const re = /\{\{-?\s*([\s\S]*?)\s*-?\}\}|\{%-?\s*([\s\S]*?)\s*-?%\}/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(src)) !== null) {
    if (match.index > last) tokens.push({ t: 'text', v: src.slice(last, match.index) })
    if (match[0].startsWith('{{')) tokens.push({ t: 'out', v: match[1] })
    else tokens.push({ t: 'tag', v: match[2] })
    last = re.lastIndex
  }
  if (last < src.length) tokens.push({ t: 'text', v: src.slice(last) })
  return tokens
}

function parse(tokens: Token[]): Node[] {
  let pos = 0

  function block(endTags: string[] | null): Node[] {
    const nodes: Node[] = []
    while (pos < tokens.length) {
      const tok = tokens[pos]
      if (tok.t === 'tag') {
        const trimmed = tok.v.trim()
        const tagName = trimmed.split(/\s+/)[0]
        if (endTags && endTags.includes(tagName)) return nodes
        pos++
        if (tagName === 'if' || tagName === 'unless') {
          const isUnless = tagName === 'unless'
          const branches: IfBranch[] = [
            {
              cond: trimmed.replace(/^(if|unless)\s+/, ''),
              negate: isUnless,
              body: block(['elsif', 'else', 'endif', 'endunless']),
            },
          ]
          while (pos < tokens.length && tokens[pos].t === 'tag') {
            const sub = tokens[pos].v.trim()
            const sname = sub.split(/\s+/)[0]
            if (sname === 'elsif') {
              pos++
              branches.push({ cond: sub.replace(/^elsif\s+/, ''), body: block(['elsif', 'else', 'endif']) })
            } else if (sname === 'else') {
              pos++
              branches.push({ cond: null, body: block(['endif', 'endunless']) })
            } else if (sname === 'endif' || sname === 'endunless') {
              pos++
              break
            } else break
          }
          nodes.push({ type: 'if', branches })
        } else if (tagName === 'for') {
          const fm = /^for\s+(\w+)\s+in\s+(.+)$/.exec(trimmed)
          if (fm) {
            const body = block(['endfor'])
            if (pos < tokens.length && tokens[pos].v.trim() === 'endfor') pos++
            nodes.push({ type: 'for', varName: fm[1], collExpr: fm[2].trim(), body })
          }
        } else if (tagName === 'assign') {
          const am = /^assign\s+(\w+)\s*=\s*(.+)$/.exec(trimmed)
          if (am) nodes.push({ type: 'assign', name: am[1], expr: am[2].trim() })
        } else if (tagName === 'capture') {
          const cm = /^capture\s+(\w+)$/.exec(trimmed)
          if (cm) {
            const body = block(['endcapture'])
            if (pos < tokens.length && tokens[pos].v.trim() === 'endcapture') pos++
            nodes.push({ type: 'capture', name: cm[1], body })
          }
        } else if (tagName === 'comment') {
          block(['endcomment'])
          if (pos < tokens.length && tokens[pos].v.trim() === 'endcomment') pos++
        } else if (tagName === 'raw') {
          let s = ''
          while (pos < tokens.length && !(tokens[pos].t === 'tag' && tokens[pos].v.trim() === 'endraw')) {
            const t = tokens[pos]
            if (t.t === 'text') s += t.v
            else if (t.t === 'out') s += `{{${t.v}}}`
            else s += `{%${t.v}%}`
            pos++
          }
          if (pos < tokens.length) pos++
          nodes.push({ type: 'text', value: s })
        } else {
          nodes.push({ type: 'customtag', name: tagName, args: trimmed.slice(tagName.length).trim() })
        }
      } else if (tok.t === 'out') {
        pos++
        nodes.push({ type: 'output', expr: tok.v.trim() })
      } else {
        pos++
        nodes.push({ type: 'text', value: tok.v })
      }
    }
    return nodes
  }

  return block(null)
}

function evalAtom(s: string, ctx: Ctx): unknown {
  const trimmed = s.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'nil' || trimmed === 'null' || trimmed === '') return null
  const quoted = /^"([\s\S]*)"$/.exec(trimmed) || /^'([\s\S]*)'$/.exec(trimmed)
  if (quoted) return quoted[1]
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  const parts = trimmed.split('.')
  let value: unknown = ctx[parts[0]]
  for (let i = 1; i < parts.length && value != null; i++) {
    value = (value as Record<string, unknown>)[parts[i]]
  }
  return value
}

function splitTopLevel(s: string, sepRe: RegExp): string[] {
  const parts: string[] = []
  let cur = ''
  let inS: string | null = null
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (inS) {
      cur += c
      if (c === inS) inS = null
      i++
      continue
    }
    if (c === "'" || c === '"') {
      inS = c
      cur += c
      i++
      continue
    }
    const match = s.slice(i).match(sepRe)
    if (match && match.index === 0) {
      parts.push(cur)
      cur = ''
      i += match[0].length
    } else {
      cur += c
      i++
    }
  }
  parts.push(cur)
  return parts
}

function parseFilterArgs(s: string, ctx: Ctx): unknown[] {
  if (!s.trim()) return []
  return splitTopLevel(s, /,/).map((part) => evalAtom(part.trim(), ctx))
}

function applyFilter(value: unknown, filter: string, ctx: Ctx): unknown {
  const match = /^(\w+)(?:\s*:\s*([\s\S]*))?$/.exec(filter.trim())
  if (!match) return value
  const name = match[1]
  const args = parseFilterArgs(match[2] || '', ctx)
  switch (name) {
    case 'default':
      return value == null || value === '' || value === false ? args[0] : value
    case 'upcase':
      return String(value ?? '').toUpperCase()
    case 'downcase':
      return String(value ?? '').toLowerCase()
    case 'capitalize': {
      const s = String(value ?? '')
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
    }
    case 'strip':
      return String(value ?? '').trim()
    case 'size':
      return value == null ? 0 : (value as { length?: number }).length != null ? (value as { length: number }).length : 0
    case 'truncate':
      return String(value ?? '').slice(0, Number(args[0] || 50))
    case 'escape':
      return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c)
    case 'replace':
      return String(value ?? '').split(String(args[0] ?? '')).join(String(args[1] ?? ''))
    case 'prepend':
      return String(args[0] ?? '') + String(value ?? '')
    case 'append':
      return String(value ?? '') + String(args[0] ?? '')
    case 'first':
      return Array.isArray(value) ? value[0] : value
    case 'last':
      return Array.isArray(value) ? value[value.length - 1] : value
    case 'split':
      return String(value ?? '').split(String(args[0] ?? ''))
    case 'join':
      return Array.isArray(value) ? value.join(String(args[0] ?? '')) : value
    case 'plus':
      return Number(value) + Number(args[0])
    case 'minus':
      return Number(value) - Number(args[0])
    case 'times':
      return Number(value) * Number(args[0])
    case 'divided_by':
      return Number(value) / Number(args[0])
    default:
      return value
  }
}

function evalExpr(expr: string, ctx: Ctx): unknown {
  const parts = splitTopLevel(expr, /\|/)
  let value = evalAtom(parts[0], ctx)
  for (let i = 1; i < parts.length; i++) value = applyFilter(value, parts[i], ctx)
  return value
}

function evalCondition(expr: string, ctx: Ctx): boolean {
  const orParts = splitTopLevel(expr, /\s+or\s+/)
  if (orParts.length > 1) return orParts.some((part) => evalCondition(part, ctx))
  const andParts = splitTopLevel(expr, /\s+and\s+/)
  if (andParts.length > 1) return andParts.every((part) => evalCondition(part, ctx))
  return evalSimple(expr.trim(), ctx)
}

function evalSimple(expr: string, ctx: Ctx): boolean {
  const opRe = /\s+(==|!=|<=|>=|<|>|contains)\s+/
  const match = opRe.exec(expr)
  if (match) {
    const lhs = evalExpr(expr.slice(0, match.index), ctx)
    const rhs = evalExpr(expr.slice(match.index + match[0].length), ctx)
    switch (match[1]) {
      case '==':
        return lhs == rhs
      case '!=':
        return lhs != rhs
      case '<':
        return Number(lhs) < Number(rhs)
      case '>':
        return Number(lhs) > Number(rhs)
      case '<=':
        return Number(lhs) <= Number(rhs)
      case '>=':
        return Number(lhs) >= Number(rhs)
      case 'contains':
        if (Array.isArray(lhs)) return lhs.includes(rhs)
        return lhs != null && String(lhs).includes(String(rhs))
    }
  }
  const value = evalExpr(expr, ctx)
  return !(value === null || value === undefined || value === false || value === '' || value === 0)
}

function renderNodes(nodes: Node[], ctx: Ctx, espStubs: Record<string, string>): string {
  let out = ''
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        out += node.value
        break
      case 'output': {
        const value = evalExpr(node.expr, ctx)
        out += value == null ? '' : String(value)
        break
      }
      case 'if':
        for (const branch of node.branches) {
          if (branch.cond == null) {
            out += renderNodes(branch.body, ctx, espStubs)
            break
          }
          let ok = evalCondition(branch.cond, ctx)
          if (branch.negate) ok = !ok
          if (ok) {
            out += renderNodes(branch.body, ctx, espStubs)
            break
          }
        }
        break
      case 'for': {
        const coll = evalExpr(node.collExpr, ctx)
        if (Array.isArray(coll)) {
          for (let i = 0; i < coll.length; i++) {
            const local = {
              ...ctx,
              [node.varName]: coll[i],
              forloop: {
                index: i + 1,
                index0: i,
                first: i === 0,
                last: i === coll.length - 1,
                length: coll.length,
              },
            }
            out += renderNodes(node.body, local, espStubs)
          }
        }
        break
      }
      case 'assign':
        ctx[node.name] = evalExpr(node.expr, ctx)
        break
      case 'capture':
        ctx[node.name] = renderNodes(node.body, ctx, espStubs)
        break
      case 'customtag':
        out += espStubs[node.name] != null ? espStubs[node.name] : ''
        break
    }
  }
  return out
}

function extractRefs(expr: string, forVars: string[]): Set<string> {
  const sansStr = String(expr).replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '')
  const refs = new Set<string>()
  const re = /\b([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)*)\b/g
  let match: RegExpExecArray | null
  while ((match = re.exec(sansStr)) !== null) {
    const name = match[1]
    if (RESERVED.has(name) || FILTERS.has(name) || /^-?\d+(\.\d+)?$/.test(name)) continue
    const root = name.split('.')[0]
    if (forVars.includes(root)) continue
    refs.add(name)
  }
  return refs
}

function detectInputs(template: string): { inputs: LiquidInput[]; customTags: string[] } {
  const ast = parse(tokenize(template))
  const assigned = new Set<string>()
  const referenced = new Set<string>()
  const refCtx = new Map<string, string[]>()
  const tags = new Set<string>()
  const condValues = new Map<string, string[]>()

  function addCtx(name: string, context: string) {
    if (!refCtx.has(name)) refCtx.set(name, [])
    const arr = refCtx.get(name)!
    if (!arr.includes(context) && arr.length < 5) arr.push(context)
  }

  function captureCondPattern(cond: string) {
    const re =
      /([a-zA-Z_][\w.]*)\s*(==|!=|contains|<=|>=|<|>)\s*(?:'([^']*)'|"([^"]*)"|(-?\d+(?:\.\d+)?))/g
    let match: RegExpExecArray | null
    while ((match = re.exec(cond)) !== null) {
      const name = match[1]
      const val = match[3] ?? match[4] ?? match[5]
      if (!condValues.has(name)) condValues.set(name, [])
      const arr = condValues.get(name)!
      if (val != null && !arr.includes(val)) arr.push(val)
    }
  }

  function walk(nodes: Node[], forVars: string[]) {
    for (const node of nodes) {
      switch (node.type) {
        case 'output':
          extractRefs(node.expr, forVars).forEach((ref) => {
            referenced.add(ref)
            addCtx(ref, `{{ ${node.expr.slice(0, 60)} }}`)
          })
          break
        case 'if':
          for (const branch of node.branches) {
            if (branch.cond) {
              extractRefs(branch.cond, forVars).forEach((ref) => {
                referenced.add(ref)
                addCtx(ref, `{% if ${branch.cond?.slice(0, 60)} %}`)
              })
              captureCondPattern(branch.cond)
            }
            walk(branch.body, forVars)
          }
          break
        case 'for':
          extractRefs(node.collExpr, forVars).forEach((ref) => {
            referenced.add(ref)
            addCtx(ref, `{% for ... in ${node.collExpr} %}`)
          })
          walk(node.body, [...forVars, node.varName])
          break
        case 'assign':
          extractRefs(node.expr, forVars).forEach((ref) => referenced.add(ref))
          assigned.add(node.name)
          break
        case 'capture':
          assigned.add(node.name)
          walk(node.body, forVars)
          break
        case 'customtag':
          tags.add(node.name)
          break
      }
    }
  }

  walk(ast, [])

  const inputs: LiquidInput[] = []
  referenced.forEach((name) => {
    const root = name.split('.')[0]
    if (assigned.has(root) || assigned.has(name) || root === 'forloop') return
    inputs.push({
      name,
      contexts: refCtx.get(name) || [],
      suggestedValues: condValues.get(name) || [],
    })
  })
  inputs.sort((a, b) => a.name.localeCompare(b.name))
  return { inputs, customTags: Array.from(tags).sort() }
}

function setByPath(obj: Ctx, path: string, value: unknown) {
  const parts = path.split('.')
  let cur: Ctx = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]]
    if (next == null || typeof next !== 'object') cur[parts[i]] = {}
    cur = cur[parts[i]] as Ctx
  }
  cur[parts[parts.length - 1]] = value
}

export const Liquid = {
  render(template: string, ctx: Ctx = {}, espStubs: Record<string, string> = {}): string {
    const ast = parse(tokenize(template))
    const localCtx = JSON.parse(JSON.stringify(ctx || {})) as Ctx
    return renderNodes(ast, localCtx, espStubs || {})
  },
  detectInputs,
  hasLiquid(value?: string | null): boolean {
    return /\{\{|\{%/.test(value || '')
  },
  setByPath,
}
