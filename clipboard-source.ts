/**
 * 渲染端剪贴板读取适配 + 后台捕获。
 *
 * 读取分三档（宿主能力不同，统一成一个接口）：
 *   1. `window.cockpit.readText()` —— Electron 主进程 clipboard / 安卓原生 / 浏览器 navigator；
 *   2. `window.cockpit.client.call('clipboard.get')` —— 旧宿主兜底（安卓原生桥）；
 *   3. `window.CockpitAndroid.pasteText()` / `navigator.clipboard.readText()` —— 再兜底。
 *
 * 后台捕获：能力被加载时（index.ts）装一个定时器，页面可见时轮询系统剪贴板，
 * 内容变化就写进历史。手机上默认开（配置里可关）；桌面默认关。
 *
 * 页面自己「复制」某条记录后会调用 `markClipboardWritten`，避免刚写到系统剪贴板的
 * private 内容被后台捕获又落回 normal sink（隐私回灌）。
 */
import type { ClipSink, ClipboardConfig } from './types'

interface NativeClientLike {
  call<T = unknown>(method: string, args?: Record<string, unknown>): Promise<T>
}

interface CockpitLike {
  readText?: () => Promise<string>
  command: (name: string, args?: Record<string, unknown>) => Promise<unknown>
  on?: (channel: string, cb: (...args: unknown[]) => void) => () => void
  client?: NativeClientLike | null
}

function cockpit(): CockpitLike | null {
  const c = (window as unknown as { cockpit?: CockpitLike }).cockpit
  return c ?? null
}

/** 是否运行在 AI 独立视图里（`?agent=`）；那里不参与捕获，避免和用户视图重复。 */
function isAgentView(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('agent')
  } catch {
    return false
  }
}

let lastWritten = ''

/** 页面刚把某段文本写进系统剪贴板：让后台捕获忽略它。 */
export function markClipboardWritten(text: string): void {
  lastWritten = text
}

/** 读取系统剪贴板文本；宿主不支持时返回空串（不抛错）。 */
export async function readClipboardText(): Promise<string> {
  const c = cockpit()
  if (!c) return ''
  if (typeof c.readText === 'function') {
    try {
      const t = await c.readText()
      if (typeof t === 'string') return t
    } catch {
      /* 落到原生 / navigator 兜底 */
    }
  }
  if (c.client) {
    try {
      const r = await c.client.call<{ text?: string }>('clipboard.get')
      if (typeof r?.text === 'string') return r.text
    } catch {
      /* ignore */
    }
  }
  try {
    const w = window as unknown as { CockpitAndroid?: { pasteText?: () => string } }
    if (w.CockpitAndroid?.pasteText) return String(w.CockpitAndroid.pasteText() ?? '')
  } catch {
    /* ignore */
  }
  try {
    return (await navigator.clipboard?.readText()) ?? ''
  } catch {
    return ''
  }
}

/** 疑似凭据 → 自动归入 private（可在设置里关掉）。宁缺勿滥，只认很明显的模式。 */
export function looksSensitive(text: string): boolean {
  const s = text.trim()
  if (!s || s.length > 4000) return false
  if (/^https?:\/\//i.test(s)) return false
  if (/^\d{4,8}$/.test(s)) return true // 纯数字验证码
  if (
    /(password|passwd|pwd|secret|token|api[-_ ]?key|bearer|otp|密码|验证码|校验码|口令|身份证|银行卡|私钥)/i.test(
      s
    )
  ) {
    return true
  }
  // 长且无空格、字母 + 数字混合的串，多半是 token / 密钥
  if (s.length >= 24 && !/\s/.test(s) && /[A-Za-z]/.test(s) && /\d/.test(s)) return true
  return false
}

// ---------------------------------------------------------------------------
// 后台捕获
// ---------------------------------------------------------------------------
let timer: ReturnType<typeof setInterval> | null = null
let cfg: ClipboardConfig | null = null
let started = false

export function initClipboardWatcher(): void {
  if (started) return
  started = true
  if (typeof window === 'undefined' || isAgentView()) return
  const c = cockpit()
  if (!c) return
  c.on?.('cockpit:clipboard-config-changed', (next) => {
    if (next && typeof next === 'object') cfg = next as ClipboardConfig
    applyTimer()
  })
  window.addEventListener('visibilitychange', () => {
    if (!document.hidden) void tick(true)
  })
  window.addEventListener('focus', () => void tick(true))
  void refreshConfig()
}

async function refreshConfig(): Promise<void> {
  const c = cockpit()
  if (!c) return
  try {
    cfg = (await c.command('launcher-mobile-clipboard.config-get')) as ClipboardConfig | null
  } catch {
    cfg = null
  }
  applyTimer()
}

function applyTimer(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (!cfg?.autoCapture) return
  const ms = Math.max(500, Math.min(60_000, cfg.captureIntervalMs || 1500))
  timer = setInterval(() => void tick(false), ms)
  void tick(true)
}

async function tick(force: boolean): Promise<void> {
  if (!cfg?.autoCapture) return
  if (document.hidden && !force) return
  const text = await readClipboardText()
  if (!text || text === lastWritten) return
  lastWritten = text
  const c = cockpit()
  if (!c) return
  const sink: ClipSink =
    cfg.autoPrivate && looksSensitive(text) ? 'private' : (cfg.captureSink ?? 'normal')
  try {
    await c.command('launcher-mobile-clipboard.append', { text, sink, source: 'copy' })
  } catch {
    /* 命令未注册 / 失败：忽略 */
  }
}
