/**
 * 剪贴板历史存储（主进程）。
 *
 * 数据落盘在 `~/.config/LinuxCockpit/launcher-mobile-clipboard/history.json`：
 * 两个 sink 放在同一个文件里（都只在本机磁盘上），原子写（临时文件 + rename）。
 * 配置在 `abilityConfigPath('launcher-mobile-clipboard')`（`config.json`）。
 *
 * 本模块只负责数据；隐私脱敏在 privacy.ts / commands.ts 出口处做。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { USER_CONFIG_DIR, abilityConfigPath } from '../../main/process/paths'
import { getBroadcast } from '../../main/process/broadcast'
import { makeLogger } from '../../main/process/logger'
import { DEFAULT_CLIPBOARD_CONFIG } from './types'
import type {
  ClipEntry,
  ClipListResult,
  ClipSink,
  ClipSource,
  ClipStats,
  ClipboardConfig
} from './types'

const log = makeLogger('launcher-mobile-clipboard')

const DIR = join(USER_CONFIG_DIR, 'launcher-mobile-clipboard')
const HISTORY = join(DIR, 'history.json')
const CONFIG = abilityConfigPath('launcher-mobile-clipboard')

/** 单条文本上限（防止误存超大内容把文件撑爆） */
const MAX_TEXT = 1_000_000
/** 单次列表返回上限 */
const MAX_PAGE = 500

interface Store {
  version: number
  nextSeq: number
  entries: ClipEntry[]
}

// ---------------------------------------------------------------------------
// 原子写
// ---------------------------------------------------------------------------
function atomicWrite(file: string, data: string): void {
  const dir = dirname(file)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, data, 'utf8')
  renameSync(tmp, file)
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
let store: Store | null = null

function isEntry(v: unknown): v is ClipEntry {
  const e = v as Partial<ClipEntry> | null
  return (
    !!e &&
    typeof e.id === 'string' &&
    typeof e.text === 'string' &&
    (e.sink === 'normal' || e.sink === 'private') &&
    typeof e.seq === 'number'
  )
}

function loadStore(): Store {
  if (store) return store
  try {
    if (existsSync(HISTORY)) {
      const raw = JSON.parse(readFileSync(HISTORY, 'utf8')) as Partial<Store>
      const entries = (Array.isArray(raw.entries) ? raw.entries : [])
        .filter(isEntry)
        .map((e) => ({ ...e, pinned: e.pinned === true }))
      const maxSeq = entries.reduce((m, e) => Math.max(m, e.seq), 0)
      store = {
        version: 1,
        nextSeq: typeof raw.nextSeq === 'number' && raw.nextSeq > maxSeq ? raw.nextSeq : maxSeq + 1,
        entries
      }
      return store
    }
  } catch (e) {
    log.warn('history.json 解析失败，忽略并重建', {
      error: e instanceof Error ? e.message : String(e)
    })
  }
  store = { version: 1, nextSeq: 1, entries: [] }
  return store
}

function saveStore(): void {
  if (!store) return
  atomicWrite(HISTORY, JSON.stringify(store))
}

function notify(sink: ClipSink, action: string, id?: string): void {
  try {
    getBroadcast()('cockpit:clipboard-changed', { sink, action, id })
  } catch {
    /* broadcast 失败不影响写入 */
  }
}

/** 排序：置顶在前，其余按 seq 倒序（新→旧）。 */
function sorted(sink: ClipSink): ClipEntry[] {
  return loadStore()
    .entries.filter((e) => e.sink === sink)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.seq - a.seq)
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function enforceCap(s: Store, max: number): void {
  for (const sink of ['normal', 'private'] as ClipSink[]) {
    const list = s.entries.filter((e) => e.sink === sink)
    if (list.length <= max) continue
    const excess = list.length - max
    const droppable = list
      .filter((e) => !e.pinned)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, excess)
    if (!droppable.length) continue
    const drop = new Set(droppable.map((e) => e.id))
    s.entries = s.entries.filter((e) => !drop.has(e.id))
  }
}

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------
function platformDefaults(): ClipboardConfig {
  // 手机上默认开后台捕获（这正是这个能力存在的理由）；桌面默认关。
  return {
    ...DEFAULT_CLIPBOARD_CONFIG,
    autoCapture: process.platform === 'android' || DEFAULT_CLIPBOARD_CONFIG.autoCapture
  }
}

function normalizeConfig(raw: Partial<ClipboardConfig>): ClipboardConfig {
  return {
    version: 1,
    autoCapture: raw.autoCapture === true,
    captureIntervalMs: clampInt(raw.captureIntervalMs, 500, 60_000, 1500),
    captureSink: raw.captureSink === 'private' ? 'private' : 'normal',
    autoPrivate: raw.autoPrivate !== false,
    dedupe: raw.dedupe !== false,
    maxEntries: clampInt(raw.maxEntries, 50, 100_000, 2000),
    previewLines: clampInt(raw.previewLines, 1, 40, 8),
    columns: clampInt(raw.columns, 0, 5, 0),
    blurPrivate: raw.blurPrivate !== false,
    defaultSink: raw.defaultSink === 'private' ? 'private' : 'normal'
  }
}

export function getConfig(): ClipboardConfig {
  try {
    if (existsSync(CONFIG)) {
      const raw = JSON.parse(readFileSync(CONFIG, 'utf8')) as Partial<ClipboardConfig>
      return normalizeConfig({ ...platformDefaults(), ...raw })
    }
  } catch (e) {
    log.warn('config.json 解析失败，回落默认', {
      error: e instanceof Error ? e.message : String(e)
    })
  }
  return normalizeConfig(platformDefaults())
}

export function saveConfig(patch: Partial<ClipboardConfig>): ClipboardConfig {
  const next = normalizeConfig({ ...getConfig(), ...patch })
  atomicWrite(CONFIG, JSON.stringify(next, null, 2))
  try {
    getBroadcast()('cockpit:clipboard-config-changed', next)
  } catch {
    /* ignore */
  }
  return next
}

// ---------------------------------------------------------------------------
// 查询 / 写入
// ---------------------------------------------------------------------------
export interface ListOptions {
  sink: ClipSink
  beforeSeq?: number
  limit?: number
  query?: string
  pinnedOnly?: boolean
}

export function listEntries(opts: ListOptions): ClipListResult {
  const sink: ClipSink = opts.sink === 'private' ? 'private' : 'normal'
  const limit = clampInt(opts.limit, 1, MAX_PAGE, 60)
  const q = (opts.query ?? '').trim().toLowerCase()
  let items = sorted(sink)
  if (opts.pinnedOnly) items = items.filter((e) => e.pinned)
  if (q) items = items.filter((e) => e.text.toLowerCase().includes(q))
  const total = items.length
  const afterCursor =
    opts.beforeSeq === undefined ? items : items.filter((e) => e.seq < opts.beforeSeq!)
  const page = afterCursor.slice(0, limit)
  return { entries: page, total, hasMore: afterCursor.length > page.length, sink }
}

export function getEntryRaw(id: string): ClipEntry | undefined {
  return loadStore().entries.find((e) => e.id === id)
}

export function appendEntry(input: {
  text: string
  sink?: ClipSink
  source?: ClipSource
}): ClipEntry | null {
  let text = typeof input.text === 'string' ? input.text : ''
  if (!text) return null
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT)
  const cfg = getConfig()
  const sink: ClipSink = input.sink ?? cfg.captureSink
  const s = loadStore()

  if (cfg.dedupe) {
    const existing = s.entries.find((e) => e.sink === sink && e.text === text)
    if (existing) {
      existing.updatedAt = Date.now()
      existing.seq = s.nextSeq++
      saveStore()
      notify(sink, 'update', existing.id)
      return existing
    }
  }

  const now = Date.now()
  const entry: ClipEntry = {
    id: randomUUID(),
    seq: s.nextSeq++,
    sink,
    text,
    createdAt: now,
    updatedAt: now,
    pinned: false,
    source: input.source ?? 'copy'
  }
  s.entries.push(entry)
  enforceCap(s, cfg.maxEntries)
  saveStore()
  notify(sink, 'append', entry.id)
  return entry
}

export function updateEntry(input: {
  id: string
  text?: string
  sink?: ClipSink
  pinned?: boolean
}): ClipEntry | null {
  const entry = getEntryRaw(input.id)
  if (!entry) return null
  if (typeof input.text === 'string') {
    const text = input.text.length > MAX_TEXT ? input.text.slice(0, MAX_TEXT) : input.text
    if (text) {
      entry.text = text
      entry.updatedAt = Date.now()
    }
  }
  if (input.sink === 'normal' || input.sink === 'private') entry.sink = input.sink
  if (typeof input.pinned === 'boolean') entry.pinned = input.pinned
  const cfg = getConfig()
  enforceCap(loadStore(), cfg.maxEntries)
  saveStore()
  notify(entry.sink, 'update', entry.id)
  return entry
}

export function deleteEntry(id: string): boolean {
  const s = loadStore()
  const entry = s.entries.find((e) => e.id === id)
  if (!entry) return false
  s.entries = s.entries.filter((e) => e.id !== id)
  saveStore()
  notify(entry.sink, 'delete', id)
  return true
}

export function clearSink(sink: ClipSink, keepPinned = false): number {
  const s = loadStore()
  const before = s.entries.length
  s.entries = s.entries.filter((e) => e.sink !== sink || (keepPinned && e.pinned))
  const removed = before - s.entries.length
  if (removed > 0) {
    saveStore()
    notify(sink, 'clear')
  }
  return removed
}

export function getStats(): ClipStats {
  const entries = loadStore().entries
  return {
    normal: entries.filter((e) => e.sink === 'normal').length,
    private: entries.filter((e) => e.sink === 'private').length,
    pinned: entries.filter((e) => e.pinned).length
  }
}
