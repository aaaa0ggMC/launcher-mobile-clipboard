/**
 * 移动剪贴板的隐私 scope（隐私 SDK：src/main/process/privacy.ts）。
 *
 * - `private` sink 的内容能关联到真人（验证码 / 密码 / 私信 / 地址…）→ sensitive。
 *   **所有触碰 private 的命令在 agent 来源下都必须先 `guard(P.private)`**（见 commands.ts
 *   的 guardPrivate）；normal sink 不做限制。
 * - 界面上 private 卡片用 `v-privacy` 打标签，AI 快照 / 截图按标签脱敏；
 *   点击「显示」按钮带 `v-privacy-action`，AI 点击前同样需要许可。
 */
import { definePrivacyScopes, shield } from '../../main/process/privacy'
import type { ClipEntry } from './types'

export const P = definePrivacyScopes('launcher-mobile-clipboard', {
  private: {
    level: 'sensitive',
    label: 'launcher-mobile-clipboard.privacy.private',
    description: 'launcher-mobile-clipboard.privacy.private_desc'
  }
})

/** private sink 文本：agent 无许可 → 占位符；用户 / CLI 原样。 */
export function shieldClipText(sink: string, text: string): string {
  return sink === 'private' ? shield(P.private, text) : text
}

/** 结果出口统一脱敏（private 条目的 text 换成占位符）。 */
export function shieldClipEntry(entry: ClipEntry): ClipEntry {
  return { ...entry, text: shieldClipText(entry.sink, entry.text) }
}

export function shieldClipEntries(entries: ClipEntry[]): ClipEntry[] {
  return entries.map(shieldClipEntry)
}
