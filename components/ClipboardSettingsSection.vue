<script setup lang="ts">
defineOptions({ name: 'cockpit-clipboard-settings' })

import { ref, watch, onMounted, inject } from 'vue'
import type { Ref } from 'vue'
import { translate, translateTemplate } from '@ui/i18n'
import { DEFAULT_CLIPBOARD_CONFIG } from '../types'
import type { ClipStats, ClipboardConfig } from '../types'

const CMD = 'launcher-mobile-clipboard'

const uiLang = inject('cockpit:lang', ref('zh')) as Ref<string>
const t = (key: string, fallback?: string): string => translate(uiLang.value, key, fallback)
const te = (key: string, vars: Record<string, string>, fallback?: string): string =>
  translateTemplate(uiLang.value, key, vars, fallback)

const cfg = ref<ClipboardConfig>({ ...DEFAULT_CLIPBOARD_CONFIG })
const stats = ref<ClipStats>({ normal: 0, private: 0, pinned: 0 })
const saving = ref(false)
const savedFlash = ref(false)
const busy = ref(false)
let loaded = false

const sinkItems = [
  { title: translate(uiLang.value, 'launcher-mobile-clipboard.normal', '普通'), value: 'normal' },
  { title: translate(uiLang.value, 'launcher-mobile-clipboard.private', '私密'), value: 'private' }
]

async function refreshStats(): Promise<void> {
  try {
    const s = (await window.cockpit.command(`${CMD}.stats`)) as ClipStats | null
    if (s) stats.value = s
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
  try {
    const c = (await window.cockpit.command(`${CMD}.config-get`)) as ClipboardConfig | null
    if (c) cfg.value = { ...DEFAULT_CLIPBOARD_CONFIG, ...c }
  } catch {
    /* ignore */
  }
  loaded = true
  void refreshStats()
})

let saveTimer: ReturnType<typeof setTimeout> | null = null
watch(
  cfg,
  (v) => {
    if (!loaded) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      saving.value = true
      try {
        await window.cockpit.command(`${CMD}.config-set`, {
          config: JSON.parse(JSON.stringify(v))
        })
        savedFlash.value = true
        setTimeout(() => (savedFlash.value = false), 1200)
      } catch {
        /* keep last saved state */
      } finally {
        saving.value = false
      }
    }, 350)
  },
  { deep: true }
)

function resetAll(): void {
  cfg.value = { ...DEFAULT_CLIPBOARD_CONFIG }
}

// -- clear ------------------------------------------------------------------
const confirmClear = ref<null | 'normal' | 'private'>(null)
async function doClear(): Promise<void> {
  const target = confirmClear.value
  confirmClear.value = null
  if (!target) return
  busy.value = true
  try {
    await window.cockpit.command(`${CMD}.clear`, { sink: target })
    await refreshStats()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <v-card rounded="lg" variant="tonal">
    <v-card-title class="d-flex align-center ga-2">
      <v-icon start>mdi-clipboard-text-clock-outline</v-icon>
      {{ t('launcher-mobile-clipboard.settings_title', '移动剪贴板设置') }}
      <v-spacer />
      <v-btn variant="text" color="primary" prepend-icon="mdi-backup-restore" @click="resetAll">
        {{ t('launcher-mobile-clipboard.reset', '恢复默认') }}
      </v-btn>
    </v-card-title>

    <v-divider />

    <v-card-text class="d-flex flex-column ga-5 py-4">
      <!-- 捕获 -->
      <div>
        <div class="text-subtitle-2 mb-1">
          {{ t('launcher-mobile-clipboard.section_capture', '捕获') }}
        </div>
        <div class="text-caption text-medium-emphasis mb-2">
          {{
            t(
              'launcher-mobile-clipboard.section_capture_hint',
              '开启后，界面在可见时轮询系统剪贴板，复制的内容会自动进入历史（安卓 App 默认开启）'
            )
          }}
        </div>
        <v-row dense>
          <v-col cols="12" md="6">
            <v-switch
              v-model="cfg.autoCapture"
              color="primary"
              hide-details
              density="compact"
              :label="t('launcher-mobile-clipboard.auto_capture', '后台自动捕获')"
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-select
              v-model="cfg.captureSink"
              :items="sinkItems"
              variant="outlined"
              density="compact"
              hide-details
              :label="t('launcher-mobile-clipboard.capture_sink', '自动捕获写入')"
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-slider
              v-model.number="cfg.captureIntervalMs"
              :min="500"
              :max="10000"
              :step="250"
              color="primary"
              hide-details
              :label="t('launcher-mobile-clipboard.interval', '轮询间隔')"
              :thumb-label="true"
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-switch
              v-model="cfg.autoPrivate"
              color="primary"
              hide-details
              density="compact"
              :label="t('launcher-mobile-clipboard.auto_private', '疑似验证码 / 密码自动归入私密')"
            />
          </v-col>
        </v-row>
      </div>

      <v-divider />

      <!-- 存储 -->
      <div>
        <div class="text-subtitle-2 mb-2">
          {{ t('launcher-mobile-clipboard.section_storage', '容量与去重') }}
        </div>
        <v-row dense>
          <v-col cols="12" md="4">
            <v-text-field
              v-model.number="cfg.maxEntries"
              type="number"
              min="50"
              max="100000"
              variant="outlined"
              density="compact"
              hide-details
              :label="t('launcher-mobile-clipboard.max_entries', '每个水槽最多保留')"
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-switch
              v-model="cfg.dedupe"
              color="primary"
              hide-details
              density="compact"
              :label="t('launcher-mobile-clipboard.dedupe', '相同内容移到最前')"
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-select
              v-model="cfg.defaultSink"
              :items="sinkItems"
              variant="outlined"
              density="compact"
              hide-details
              :label="t('launcher-mobile-clipboard.default_sink', '默认打开')"
            />
          </v-col>
        </v-row>
        <div class="text-caption text-medium-emphasis mt-3">
          {{
            te(
              'launcher-mobile-clipboard.stats_hint',
              {
                normal: String(stats.normal),
                private: String(stats.private),
                pinned: String(stats.pinned)
              },
              '当前：普通 {normal} 条 · 私密 {private} 条 · 置顶 {pinned} 条'
            )
          }}
        </div>
        <div class="d-flex ga-2 flex-wrap mt-3">
          <v-btn
            variant="tonal"
            color="warning"
            prepend-icon="mdi-delete-sweep-outline"
            :loading="busy"
            @click="confirmClear = 'normal'"
          >
            {{ t('launcher-mobile-clipboard.clear_normal', '清空普通水槽') }}
          </v-btn>
          <v-btn
            variant="tonal"
            color="error"
            prepend-icon="mdi-lock-off-outline"
            :loading="busy"
            @click="confirmClear = 'private'"
          >
            {{ t('launcher-mobile-clipboard.clear_private', '清空私密水槽') }}
          </v-btn>
        </div>
      </div>

      <v-divider />

      <!-- 显示 -->
      <div>
        <div class="text-subtitle-2 mb-2">
          {{ t('launcher-mobile-clipboard.section_display', '显示') }}
        </div>
        <v-row dense>
          <v-col cols="12" md="4">
            <v-text-field
              v-model.number="cfg.previewLines"
              type="number"
              min="1"
              max="40"
              variant="outlined"
              density="compact"
              hide-details
              :label="t('launcher-mobile-clipboard.preview_lines', '卡片预览行数')"
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-text-field
              v-model.number="cfg.columns"
              type="number"
              min="0"
              max="5"
              variant="outlined"
              density="compact"
              hide-details
              :label="t('launcher-mobile-clipboard.columns', '瀑布流列数（0 = 自适应）')"
            />
          </v-col>
          <v-col cols="12" md="4">
            <v-switch
              v-model="cfg.blurPrivate"
              color="primary"
              hide-details
              density="compact"
              :label="t('launcher-mobile-clipboard.blur_private', '私密内容默认模糊')"
            />
          </v-col>
        </v-row>
      </div>
    </v-card-text>

    <v-card-actions class="px-4 pb-4 pt-0">
      <v-chip v-if="saving" size="small" variant="tonal">
        {{ t('launcher-mobile-clipboard.saving', '保存中…') }}
      </v-chip>
      <v-chip v-else-if="savedFlash" size="small" variant="tonal" color="success">
        {{ t('launcher-mobile-clipboard.saved', '已保存') }}
      </v-chip>
    </v-card-actions>

    <v-dialog
      :model-value="confirmClear !== null"
      max-width="420"
      @update:model-value="confirmClear = null"
    >
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center ga-2 text-subtitle-1">
          <v-icon color="warning">mdi-alert-outline</v-icon>
          {{ t('launcher-mobile-clipboard.clear_confirm_title', '清空该水槽？') }}
        </v-card-title>
        <v-card-text class="text-body-2">
          {{
            t(
              'launcher-mobile-clipboard.clear_confirm_body',
              '将删除该水槽的全部记录（含置顶），不可撤销。'
            )
          }}
        </v-card-text>
        <v-card-actions class="px-4 pb-4 pt-0 ga-2">
          <v-spacer />
          <v-btn variant="text" @click="confirmClear = null">
            {{ t('launcher-mobile-clipboard.cancel', '取消') }}
          </v-btn>
          <v-btn color="error" variant="flat" @click="doClear">
            {{ t('launcher-mobile-clipboard.confirm', '确认') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>
