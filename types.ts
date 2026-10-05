/** 剪贴板历史分两个「水槽」：normal 对 AI 透明，private 读取 / 修改都必须授权。 */
export type ClipSink = 'normal' | 'private'

/** 记录来源（仅作展示 / 审计，不参与逻辑）。 */
export type ClipSource = 'copy' | 'manual' | 'import' | 'share'

export interface ClipEntry {
  id: string
  /** 单调递增序号：排序与分页游标都用它（时间戳会撞毫秒） */
  seq: number
  sink: ClipSink
  text: string
  createdAt: number
  updatedAt: number
  pinned: boolean
  source: ClipSource
}

export interface ClipboardConfig {
  version: number
  /** 后台自动捕获：外壳在页面可见时轮询系统剪贴板（安卓 App 默认开） */
  autoCapture: boolean
  /** 轮询间隔（ms） */
  captureIntervalMs: number
  /** 自动捕获落到哪个 sink */
  captureSink: ClipSink
  /** 疑似凭据（验证码 / 密码 / token）自动归入 private */
  autoPrivate: boolean
  /** 相同内容移到最前而不是新增一条 */
  dedupe: boolean
  /** 每个 sink 最多保留多少条（置顶条目不参与淘汰） */
  maxEntries: number
  /** 卡片默认预览行数 */
  previewLines: number
  /** 瀑布流列数；0 = 按容器宽度自适应 */
  columns: number
  /** private 内容默认模糊，点击查看 */
  blurPrivate: boolean
  /** 页面默认打开的 sink */
  defaultSink: ClipSink
}

export const DEFAULT_CLIPBOARD_CONFIG: ClipboardConfig = {
  version: 1,
  autoCapture: false,
  captureIntervalMs: 1500,
  captureSink: 'normal',
  autoPrivate: true,
  dedupe: true,
  maxEntries: 2000,
  previewLines: 8,
  columns: 0,
  blurPrivate: true,
  defaultSink: 'normal'
}

export interface ClipListResult {
  entries: ClipEntry[]
  /** 当前 sink 中符合查询条件的总条数 */
  total: number
  hasMore: boolean
  sink: ClipSink
}

export interface ClipStats {
  normal: number
  private: number
  pinned: number
}

export interface ClipOpResult {
  ok: boolean
  entry?: ClipEntry
  error?: string
}
