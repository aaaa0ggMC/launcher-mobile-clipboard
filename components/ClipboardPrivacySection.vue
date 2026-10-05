<script setup lang="ts">
defineOptions({ name: 'cockpit-clipboard-privacy' })

import { inject, ref } from 'vue'
import type { Ref } from 'vue'
import { translate } from '@ui/i18n'
import { useSettings } from '@ui/composables/settings'

const uiLang = inject('cockpit:lang', ref('zh')) as Ref<string>
const t = (key: string, fallback?: string): string => translate(uiLang.value, key, fallback)
const settings = useSettings()

const rows = [
  {
    icon: 'mdi-clipboard-text-outline',
    titleKey: 'launcher-mobile-clipboard.privacy.normal_title',
    titleFb: '普通水槽 normal',
    bodyKey: 'launcher-mobile-clipboard.privacy.normal_body',
    bodyFb: '对 AI 透明：可自由读取、写入与整理，不做额外限制。'
  },
  {
    icon: 'mdi-lock-outline',
    titleKey: 'launcher-mobile-clipboard.privacy.private_title',
    titleFb: '私密水槽 private',
    bodyKey: 'launcher-mobile-clipboard.privacy.private_body',
    bodyFb: '标记为「敏感」：AI 读取、修改、删除、清空前都必须经过授权窗口，你逐次批准。'
  }
]
</script>

<template>
  <v-card rounded="lg" variant="tonal">
    <v-card-title class="d-flex align-center ga-2">
      <v-icon start>mdi-shield-lock-outline</v-icon>
      {{ t('launcher-mobile-clipboard.privacy.title', '隐私与 AI 访问') }}
    </v-card-title>

    <v-divider />

    <v-card-text class="d-flex flex-column ga-4 py-4">
      <div class="text-body-2">
        {{
          t(
            'launcher-mobile-clipboard.privacy.intro',
            '剪贴板历史分两个互相隔离的水槽。界面上的「私密」内容用 v-privacy 打标签，AI 的快照与截图会按标签脱敏；点击「显示」按钮同样需要先获得许可。'
          )
        }}
      </div>

      <div v-for="row in rows" :key="row.titleKey" class="d-flex ga-3">
        <v-icon :icon="row.icon" size="22" class="mt-1" />
        <div>
          <div class="text-subtitle-2">{{ t(row.titleKey, row.titleFb) }}</div>
          <div class="text-caption text-medium-emphasis">{{ t(row.bodyKey, row.bodyFb) }}</div>
        </div>
      </div>

      <v-alert type="info" variant="tonal" density="comfortable" class="rounded-lg">
        <div class="text-caption font-family-mono mb-1">launcher-mobile-clipboard.private</div>
        <div class="text-caption">
          {{
            t(
              'launcher-mobile-clipboard.privacy.scope_hint',
              '授权档位与「AI 与远程」里的隐私策略联动；「允许本次」限时、会话结束即失效。'
            )
          }}
        </div>
      </v-alert>

      <div>
        <v-btn
          v-if="settings.has('agent')"
          variant="tonal"
          color="primary"
          prepend-icon="mdi-cog-outline"
          @click="settings.open('agent')"
        >
          {{ t('launcher-mobile-clipboard.privacy.open_agent_settings', '打开 AI 与远程设置') }}
        </v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>
