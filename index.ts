import { defineAsyncComponent } from 'vue'
import type { Ability } from '../../main/ui/ability'
import { initClipboardWatcher } from './clipboard-source'

// 渲染端后台捕获：能力被加载时就装好监听（安卓 App 默认开，桌面可在设置里开）。
// 页面/外壳都跑同一份代码：只要 `?agent=` 独立视图之外的任一渲染端活着，复制就会被记下。
initClipboardWatcher()

export default {
  id: 'launcher-mobile-clipboard',
  name: '移动剪贴板',
  icon: 'default/clipboard/padding',
  category: '工具',
  keepAlive: true,
  component: defineAsyncComponent(() => import('./View.vue')),
  shortcuts: [
    { key: 'capture', label: '捕获当前剪贴板' },
    { key: 'search', label: '聚焦搜索' }
  ],
  settings: [
    {
      key: 'launcher-mobile-clipboard',
      label: '移动剪贴板设置',
      icon: 'mdi-clipboard-text-clock-outline',
      description: '后台捕获、两个水槽的容量与隐私行为',
      keywords: ['剪贴板', 'clipboard', 'clip', '历史', 'history', 'private', '隐私', 'mobile'],
      items: [
        {
          key: 'general',
          label: '剪贴板设置',
          icon: 'mdi-tune',
          description: '自动捕获、去重、容量、隐私与显示',
          fullWidth: true,
          component: defineAsyncComponent(() => import('./components/ClipboardSettingsSection.vue'))
        },
        {
          key: 'privacy',
          label: '隐私与 AI 访问',
          icon: 'mdi-shield-lock-outline',
          description: 'private 水槽对 AI 的授权规则',
          fullWidth: true,
          component: defineAsyncComponent(() => import('./components/ClipboardPrivacySection.vue'))
        }
      ]
    }
  ]
} satisfies Ability
