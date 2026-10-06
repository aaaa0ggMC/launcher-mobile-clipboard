<script setup lang="ts">
defineOptions({ name: 'cockpit-clipboard-card' })

import { computed, inject, nextTick, ref } from 'vue'
import type { Ref } from 'vue'
import { translate, translateTemplate } from '@ui/i18n'
import type { ClipEntry } from '../types'

const props = defineProps<{
  entry: ClipEntry
  now: number
  previewLines: number
  blur: boolean
  revealed: boolean
}>()

const emit = defineEmits<{
  (e: 'copy', entry: ClipEntry): void
  (e: 'pin', entry: ClipEntry): void
  (e: 'move', entry: ClipEntry): void
  (e: 'edit', entry: ClipEntry): void
  (e: 'delete', entry: ClipEntry): void
  (e: 'reveal', entry: ClipEntry): void
}>()

const uiLang = inject('cockpit:lang', ref('zh')) as Ref<string>
const t = (key: string, fallback?: string): string => translate(uiLang.value, key, fallback)
const te = (key: string, vars: Record<string, string>, fallback?: string): string =>
  translateTemplate(uiLang.value, key, vars, fallback)

const PRIVACY_SCOPE = 'launcher-mobile-clipboard.private'

const expanded = ref(false)
const cardRef = ref<HTMLElement | null>(null)

function toggleExpand(): void {
  expanded.value = !expanded.value
  // 收起很长的一条时，页面可能停在它原来的下半截：把卡片头拉回视野
  if (!expanded.value)
    void nextTick(() => {
      const el = cardRef.value
      if (!el) return
      const top = el.parentElement?.closest('.clip-scroll')?.getBoundingClientRect().top ?? 0
      if (el.getBoundingClientRect().top < top) el.scrollIntoView({ block: 'start' })
    })
}
const isPrivate = computed(() => props.entry.sink === 'private')
const isLong = computed(
  () => props.entry.text.length > 260 || props.entry.text.split('\n').length > 6
)
const clamped = computed(() => !expanded.value && isLong.value)
const isUrl = computed(() => /^https?:\/\/\S+$/i.test(props.entry.text.trim()))
const needsReveal = computed(() => isPrivate.value && props.blur && !props.revealed)

const timeText = computed(() => {
  void props.now
  const diff = props.now - props.entry.createdAt
  if (diff < 60_000) return t('launcher-mobile-clipboard.time.just_now', '刚刚')
  const min = Math.floor(diff / 60_000)
  if (min < 60)
    return te('launcher-mobile-clipboard.time.minutes', { n: String(min) }, `${min} 分钟前`)
  const hours = Math.floor(min / 60)
  if (hours < 24)
    return te('launcher-mobile-clipboard.time.hours', { n: String(hours) }, `${hours} 小时前`)
  const days = Math.floor(hours / 24)
  if (days < 7)
    return te('launcher-mobile-clipboard.time.days', { n: String(days) }, `${days} 天前`)
  const d = new Date(props.entry.createdAt)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
})

const charText = computed(() =>
  te(
    'launcher-mobile-clipboard.chars',
    { n: String(props.entry.text.length) },
    `${props.entry.text.length} 字`
  )
)

function openLink(): void {
  void window.cockpit.openExternal(props.entry.text.trim())
}
</script>

<template>
  <div ref="cardRef" class="clip-card" :class="{ 'clip-card--private': isPrivate }">
    <div class="clip-card__head">
      <v-icon
        v-if="isPrivate"
        size="14"
        color="warning"
        :title="t('launcher-mobile-clipboard.private', '私密')"
        >mdi-lock</v-icon
      >
      <v-icon
        v-else
        size="14"
        class="clip-card__pin"
        :title="t('launcher-mobile-clipboard.normal', '普通')"
        >mdi-clipboard-text-outline</v-icon
      >
      <v-icon
        v-if="entry.pinned"
        size="14"
        color="primary"
        :title="t('launcher-mobile-clipboard.pinned', '已置顶')"
        >mdi-pin</v-icon
      >
      <span class="clip-card__meta">{{ timeText }}</span>
      <span class="clip-card__dot">·</span>
      <span class="clip-card__meta">{{ charText }}</span>
      <v-spacer />
      <v-btn
        v-if="isUrl"
        icon="mdi-open-in-new"
        size="x-small"
        variant="text"
        :aria-label="t('launcher-mobile-clipboard.open_link', '打开链接')"
        :title="t('launcher-mobile-clipboard.open_link', '打开链接')"
        @click="openLink"
      />
    </div>

    <div class="clip-card__body">
      <div
        v-privacy="isPrivate ? PRIVACY_SCOPE : null"
        class="clip-text"
        :class="{ 'clip-text--clamped': clamped, 'clip-text--blurred': needsReveal }"
        :style="{ '--clamp': previewLines }"
      >
        {{ entry.text }}
      </div>
      <button
        v-if="needsReveal"
        v-privacy-action="PRIVACY_SCOPE"
        type="button"
        class="clip-reveal"
        :aria-label="t('launcher-mobile-clipboard.reveal', '点击查看')"
        :title="t('launcher-mobile-clipboard.reveal', '点击查看')"
        @click="emit('reveal', entry)"
      >
        <v-icon size="18">mdi-eye-outline</v-icon>
        <span>{{ t('launcher-mobile-clipboard.reveal', '点击查看') }}</span>
      </button>
    </div>

    <div v-if="isLong" class="clip-card__expand">
      <v-btn
        variant="text"
        size="small"
        :prepend-icon="expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
        @click="toggleExpand"
      >
        {{
          expanded
            ? t('launcher-mobile-clipboard.collapse', '收起')
            : t('launcher-mobile-clipboard.expand', '展开全部')
        }}
      </v-btn>
    </div>

    <div class="clip-card__actions">
      <v-btn
        icon="mdi-content-copy"
        size="small"
        variant="text"
        :aria-label="t('launcher-mobile-clipboard.copy', '复制')"
        :title="t('launcher-mobile-clipboard.copy', '复制')"
        @click="emit('copy', entry)"
      />
      <v-btn
        :icon="entry.pinned ? 'mdi-pin-off' : 'mdi-pin-outline'"
        size="small"
        variant="text"
        :aria-label="
          entry.pinned
            ? t('launcher-mobile-clipboard.unpin', '取消置顶')
            : t('launcher-mobile-clipboard.pin', '置顶')
        "
        :title="
          entry.pinned
            ? t('launcher-mobile-clipboard.unpin', '取消置顶')
            : t('launcher-mobile-clipboard.pin', '置顶')
        "
        @click="emit('pin', entry)"
      />
      <v-btn
        :icon="isPrivate ? 'mdi-lock-open-variant-outline' : 'mdi-lock-outline'"
        size="small"
        variant="text"
        :aria-label="
          isPrivate
            ? t('launcher-mobile-clipboard.to_normal', '移到普通')
            : t('launcher-mobile-clipboard.to_private', '移到私密')
        "
        :title="
          isPrivate
            ? t('launcher-mobile-clipboard.to_normal', '移到普通')
            : t('launcher-mobile-clipboard.to_private', '移到私密')
        "
        @click="emit('move', entry)"
      />
      <v-spacer />
      <v-btn
        icon="mdi-pencil-outline"
        size="small"
        variant="text"
        :aria-label="t('launcher-mobile-clipboard.edit', '编辑')"
        :title="t('launcher-mobile-clipboard.edit', '编辑')"
        @click="emit('edit', entry)"
      />
      <v-btn
        icon="mdi-delete-outline"
        size="small"
        variant="text"
        color="error"
        :aria-label="t('launcher-mobile-clipboard.delete', '删除')"
        :title="t('launcher-mobile-clipboard.delete', '删除')"
        @click="emit('delete', entry)"
      />
    </div>
  </div>
</template>

<style scoped>
.clip-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px 8px;
  border-radius: 14px;
  border: 1px solid rgba(var(--v-theme-surface-bright), 0.18);
  background: rgba(var(--v-theme-surface), var(--glass-a, 0.55));
  transition:
    border-color 0.15s ease,
    transform 0.15s ease;
}

.clip-card:hover {
  border-color: rgba(var(--v-theme-primary), 0.45);
}

.clip-card--private {
  border-color: rgba(var(--v-theme-warning), 0.4);
  background: linear-gradient(
    180deg,
    rgba(var(--v-theme-warning), 0.08),
    rgba(var(--v-theme-surface), var(--glass-a, 0.55))
  );
}

.clip-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 20px;
}

.clip-card__meta {
  font-size: 0.72rem;
  color: rgba(var(--v-theme-on-surface), 0.62);
  white-space: nowrap;
}

.clip-card__dot {
  color: rgba(var(--v-theme-on-surface), 0.35);
  font-size: 0.7rem;
}

.clip-card__pin {
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.clip-card__body {
  position: relative;
}

.clip-text {
  font-size: 0.85rem;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: rgb(var(--v-theme-on-surface));
  /* 不设 max-height：展开后整条内容都排出来，由外层列表滚动（原来 40rem 封顶会把长文截断） */
  overflow: hidden;
}

.clip-text--clamped {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--clamp, 8);
  overflow: hidden;
}

.clip-text--blurred {
  /* 短内容（验证码一行）也要给「点击查看」留出高度，不然遮罩会压在模糊文字上挤成一团 */
  min-height: 56px;
  filter: blur(5px);
  user-select: none;
}

.clip-reveal {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: none;
  border-radius: 10px;
  background: rgba(var(--v-theme-surface), 0.45);
  color: rgba(var(--v-theme-on-surface), 0.85);
  font-size: 0.78rem;
  cursor: pointer;
}

.clip-card__expand {
  display: flex;
  justify-content: center;
  margin-top: -6px;
}

.clip-card__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 2px;
  opacity: 0.45;
  transition: opacity 0.15s ease;
}

.clip-card:hover .clip-card__actions,
.clip-card:focus-within .clip-card__actions {
  opacity: 1;
}

@media (pointer: coarse) {
  .clip-card__actions {
    opacity: 1;
  }
  .clip-card__actions :deep(.v-btn) {
    min-width: 44px;
    min-height: 44px;
  }
}
</style>
