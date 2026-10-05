import { clipboard } from 'electron'
import type { CommandSpec } from '../../main/process/commands/types'
import { SCOPE_CONTROL, guard, shield } from '../../main/process/privacy'
import { P, shieldClipEntries, shieldClipEntry } from './privacy'
import {
  appendEntry,
  clearSink,
  deleteEntry,
  getConfig,
  getEntryRaw,
  getStats,
  listEntries,
  saveConfig,
  updateEntry
} from './service'
import type { ClipSink, ClipSource } from './types'

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : v === undefined || v === null ? undefined : String(v)
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : undefined
}

function bool(v: unknown): boolean | undefined {
  if (v === true || v === 'true' || v === '1') return true
  if (v === false || v === 'false' || v === '0') return false
  return undefined
}

function sinkOf(v: unknown, fallback: ClipSink = 'normal'): ClipSink {
  return v === 'private' ? 'private' : v === 'normal' ? 'normal' : fallback
}

function sourceOf(v: unknown): ClipSource {
  return v === 'manual' || v === 'import' || v === 'share' ? v : 'copy'
}

function has(named: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(named, key)
}

/**
 * agent 触碰 private sink 前的强制授权：没有许可 → 弹授权窗口并等待（用户来源直接放行）。
 * **所有会读 / 写 private 的命令都必须先调用它**（包括按 id 操作时先从库里回收 sink）。
 */
async function guardPrivate(reason: string): Promise<void> {
  await guard(P.private, reason)
}

export default [
  {
    name: 'launcher-mobile-clipboard.list',
    privacy: { reads: [P.private] },
    description:
      '列出剪贴板历史（瀑布流分页）(--sink normal|private [--before <seq>] [--limit N] [--query 文本] [--pinned-only])',
    usage: 'launcher-mobile-clipboard.list --sink private --limit 50',
    run: async (ctx) => {
      const sink = sinkOf(ctx.named.sink)
      if (sink === 'private') await guardPrivate('读取私密剪贴板历史')
      const res = listEntries({
        sink,
        beforeSeq: num(ctx.named.before),
        limit: num(ctx.named.limit),
        query: str(ctx.named.query),
        pinnedOnly: bool(ctx.named['pinned-only'] ?? ctx.named.pinnedOnly)
      })
      // 出口脱敏：即使 private 没有许可（理论上上面已 guard），也不会漏出明文
      return { ...res, entries: shieldClipEntries(res.entries) }
    }
  },
  {
    name: 'launcher-mobile-clipboard.append',
    // 剪贴板内容可能含凭据：参数一律不进日志；private 单独 guard
    logArgs: false,
    description:
      '新增一条剪贴板记录 (--text <文本> [--sink normal|private] [--source copy|manual|import|share])',
    usage: 'launcher-mobile-clipboard.append --text "hello" --sink normal',
    run: async (ctx) => {
      const text = str(ctx.named.text) ?? ''
      if (!text) return { ok: false, error: '需要 --text' }
      const sink = sinkOf(ctx.named.sink, getConfig().captureSink)
      if (sink === 'private') await guardPrivate('写入私密剪贴板')
      const entry = appendEntry({ text, sink, source: sourceOf(ctx.named.source) })
      if (!entry) return { ok: false, error: '文本为空' }
      return { ok: true, entry: shieldClipEntry(entry) }
    }
  },
  {
    name: 'launcher-mobile-clipboard.update',
    privacy: { reads: [P.private] },
    logArgs: false,
    description:
      '修改一条记录 (--id <id> [--text 文本] [--sink normal|private] [--pinned true|false])',
    usage: 'launcher-mobile-clipboard.update --id <id> --pinned true',
    run: async (ctx) => {
      const id = str(ctx.named.id)
      if (!id) return { ok: false, error: '需要 --id' }
      const current = getEntryRaw(id)
      if (!current) return { ok: false, error: '未找到记录' }
      const targetSink = has(ctx.named, 'sink') ? sinkOf(ctx.named.sink) : current.sink
      if (current.sink === 'private' || targetSink === 'private')
        await guardPrivate('修改私密剪贴板记录')
      const entry = updateEntry({
        id,
        text: has(ctx.named, 'text') ? str(ctx.named.text) : undefined,
        sink: has(ctx.named, 'sink') ? targetSink : undefined,
        pinned: bool(ctx.named.pinned)
      })
      return { ok: !!entry, entry: entry ? shieldClipEntry(entry) : undefined }
    }
  },
  {
    name: 'launcher-mobile-clipboard.delete',
    privacy: { reads: [P.private] },
    description: '删除一条记录 (--id <id>)',
    usage: 'launcher-mobile-clipboard.delete --id <id>',
    run: async (ctx) => {
      const id = str(ctx.named.id)
      if (!id) return { ok: false, error: '需要 --id' }
      const current = getEntryRaw(id)
      if (!current) return { ok: false, error: '未找到记录' }
      if (current.sink === 'private') await guardPrivate('删除私密剪贴板记录')
      return { ok: deleteEntry(id) }
    }
  },
  {
    name: 'launcher-mobile-clipboard.clear',
    privacy: { requires: [SCOPE_CONTROL] },
    description: '清空某个 sink (--sink normal|private [--keep-pinned true])',
    usage: 'launcher-mobile-clipboard.clear --sink normal',
    run: async (ctx) => {
      const sink = sinkOf(ctx.named.sink)
      if (sink === 'private') await guardPrivate('清空私密剪贴板')
      const removed = clearSink(
        sink,
        bool(ctx.named['keep-pinned'] ?? ctx.named.keepPinned) === true
      )
      return { ok: true, removed }
    }
  },
  {
    name: 'launcher-mobile-clipboard.config-get',
    description: '读取移动剪贴板配置',
    usage: 'launcher-mobile-clipboard.config-get',
    privacy: {},
    run: () => getConfig()
  },
  {
    name: 'launcher-mobile-clipboard.config-set',
    privacy: { requires: [SCOPE_CONTROL] },
    description: '保存移动剪贴板配置 (--config <json>)',
    usage: 'launcher-mobile-clipboard.config-set --config \'{"autoCapture":true}\'',
    run: (ctx) => {
      const raw = ctx.named.config
      let patch: Record<string, unknown> = {}
      if (typeof raw === 'string' && raw.trim()) {
        try {
          patch = JSON.parse(raw) as Record<string, unknown>
        } catch {
          return { ok: false, error: '--config 不是合法 JSON' }
        }
      } else if (raw && typeof raw === 'object') {
        patch = raw as Record<string, unknown>
      }
      return saveConfig(patch)
    }
  },
  {
    name: 'launcher-mobile-clipboard.stats',
    privacy: { reads: [P.private] },
    description: '各 sink 的条数统计',
    usage: 'launcher-mobile-clipboard.stats',
    run: () => {
      const s = getStats()
      // private 计数对 agent 也按 scope 脱敏（数量本身也是一种信息）
      return { ...s, private: shield(P.private, s.private) }
    }
  },
  {
    name: 'launcher-mobile-clipboard.system-read',
    privacy: { requires: [P.private], reads: [P.private] },
    description: '读取系统剪贴板当前文本（主进程 clipboard；agent 需 private 许可）',
    usage: 'launcher-mobile-clipboard.system-read',
    logArgs: false,
    run: () => ({ ok: true, text: clipboard.readText() ?? '' })
  }
] satisfies CommandSpec[]
