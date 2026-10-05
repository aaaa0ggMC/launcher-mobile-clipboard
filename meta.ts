// 前后端共享能力元数据 — 主进程命令加载器与渲染端能力加载器共同消费。
// 无 platforms = 全平台可用：桌面 Electron 走主进程剪贴板，手机（安卓 App / 网页）
// 走原生桥或 navigator.clipboard，能力本身不挑平台（但在手机上才真正有用）。
export const platforms: string[] = []
export const provides: string[] = []
export const dependencies: string[] = []
