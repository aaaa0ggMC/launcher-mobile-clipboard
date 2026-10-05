<script setup lang="ts">
defineOptions({ name: 'cockpit-launcher-mobile-clipboard' })

import { ref, shallowRef, computed, inject, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import type { Ref } from 'vue'
import { translate, translateTemplate } from '@ui/i18n'
import { useShortcut } from '@ui/shortcuts'
import { useSettings } from '@ui/composables/settings'
import { markClipboardWritten, readClipboardText } from './clipboard-source'
import { DEFAULT_CLIPBOARD_CONFIG } from './types'
import type { ClipEntry, ClipListResult, ClipSink, ClipboardConfig } from './types'
import ClipboardCard from './components/ClipboardCard.vue'

const uiLang = inject('cockpit:lang', ref('zh')) as Ref<string>
const t = (key: string, fallback?: string): string => translate(uiLang.value, key, fallback)
const te = (key: string, vars: Record<string, string>, fallback?: string): string =>
  translateTemplate(uiLang.value, key, vars, fallback)
const settings = useSettings()

const CMD = 'launcher-mobile-clipboard'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const sink = ref<ClipSink>('normal')
const query = ref('')
const entries = shallowRef<ClipEntry[]>([])
const total = ref(0)
const hasMore = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
const capturing = ref(false)
const now = ref(Date.now())
const cfg = ref<ClipboardConfig>({ ...DEFAULT_CLIPBOARD_CONFIG })
const revealed = ref<Set<string>>(new Set())

const rootRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const searchRef = ref<{ focus: () => void } | null>(null)
const cols = ref(1)
const compact = ref(false)
const MAX_RENDER = 600
const PAGE = 60

const isPrivate = computed(() => sink.value === 'private')

const sinkLabel = (s: ClipSink): string =>
  s === 'private'
    ? t('launcher-mobile-clipboard.private', '私密')
    : t('launcher-mobile-clipboard.normal', '普通')

// ---------------------------------------------------------------------------
// Masonry columns: 把所有已加载条目按「当前最矮的列」分配，得到无限瀑布流。
// ---------------------------------------------------------------------------
const columns = computed<ClipEntry[][]>(() => {
  const n = cols.value
  const out: ClipEntry[][] = Array.from({ length: n }, () => [])
  const heights = new Array<number>(n).fill(0)
  const lines = Math.max(1, cfg.value.previewLines || 8)
  for (const e of entries.value) {
    let idx = 0
    for (let i = 1; i < n; i++) if (heights[i] < heights[idx]) idx = i
    out[idx].push(e)
    const est = 72 + Math.min(lines, Math.ceil(e.text.length / 26) || 1) * 21
    heights[idx] += est + 12
  }
  return out
})

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
async function loadFirst(): Promise<void> {
  loading.value = true
  try {
    const r = (await window.cockpit.command(`${CMD}.list`, {
      sink: sink.value,
      limit: PAGE,
      query: query.value || undefined
    })) as ClipListResult | null
    entries.value = r?.entries ?? []
    total.value = r?.total ?? entries.value.length
    hasMore.value = r?.hasMore ?? false
  } catch {
    entries.value = []
  } finally {
    loading.value = false
  }
  await nextTick()
}

async function loadMore(): Promise<void> {
  if (loadingMore.value || !hasMore.value || entries.value.length >= MAX_RENDER) return
  const minSeq = entries.value.reduce((m, e) => Math.min(m, e.seq), Number.POSITIVE_INFINITY)
  loadingMore.value = true
  try {
    const r = (await window.cockpit.command(`${CMD}.list`, {
      sink: sink.value,
      before: Number.isFinite(minSeq) ? minSeq : undefined,
      limit: PAGE,
      query: query.value || undefined
    })) as ClipListResult | null
    const more = (r?.entries ?? []).filter((e) => !entries.value.some((x) => x.id === e.id))
    entries.value = [...entries.value, ...more]
    hasMore.value = (r?.hasMore ?? false) && entries.value.length < MAX_RENDER
  } catch {
    hasMore.value = false
  } finally {
    loadingMore.value = false
  }
}

function onScroll(): void {
  const el = scrollRef.value
  if (!el) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 420) void loadMore()
}

// ---------------------------------------------------------------------------
// Own-action suppression: 本地乐观更新，忽略自己触发的广播（否则会整页重载）。
// ---------------------------------------------------------------------------
let suppressUntil = 0
function markOwn(): void {
  suppressUntil = Date.now() + 600
}

function sortLocal(): void {
  entries.value = [...entries.value].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.seq - a.seq
  )
}

function onChanged(payload: unknown): void {
  if (Date.now() < suppressUntil) return
  const p = payload as { sink?: string } | null
  if (p?.sink && p.sink !== sink.value) return
  void loadFirst()
}

function onConfigChanged(next: unknown): void {
  if (next && typeof next === 'object') cfg.value = { ...cfg.value, ...(next as ClipboardConfig) }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
const snackOpen = ref(false)
const snackText = ref('')
const snackColor = ref('success')
function notify(text: string, color = 'success'): void {
  snackText.value = text
  snackColor.value = color
  snackOpen.value = true
}

async function addText(text: string, target: ClipSink, source = 'manual'): Promise<void> {
  markOwn()
  try {
    const r = (await window.cockpit.command(`${CMD}.append`, {
      text,
      sink: target,
      source
    })) as { ok?: boolean; entry?: ClipEntry; error?: string } | null
    if (!r?.ok || !r.entry) {
      notify(r?.error ?? t('launcher-mobile-clipboard.add_failed', '写入失败'), 'error')
      return
    }
    if (r.entry.sink === sink.value) {
      entries.value = [r.entry, ...entries.value.filter((e) => e.id !== r.entry!.id)]
      total.value += 1
      sortLocal()
      if (scrollRef.value) scrollRef.value.scrollTop = 0
    } else {
      notify(te('launcher-mobile-clipboard.saved_to', { sink: sinkLabel(r.entry.sink) }, '已保存'))
    }
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), 'error')
  }
}

async function captureNow(): Promise<void> {
  if (capturing.value) return
  capturing.value = true
  try {
    const text = await readClipboardText()
    if (!text) {
      notify(t('launcher-mobile-clipboard.clipboard_empty', '剪贴板是空的'), 'warning')
      return
    }
    await addText(text, cfg.value.captureSink ?? 'normal', 'copy')
    notify(t('launcher-mobile-clipboard.captured', '已捕获剪贴板'))
  } finally {
    capturing.value = false
  }
}

async function copyEntry(entry: ClipEntry): Promise<void> {
  try {
    await window.cockpit.copyText(entry.text)
    markClipboardWritten(entry.text)
    markOwn()
    notify(t('launcher-mobile-clipboard.copied', '已复制到系统剪贴板'))
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e), 'error')
  }
}

async function togglePin(entry: ClipEntry): Promise<void> {
  markOwn()
  const pinned = !entry.pinned
  try {
    const r = (await window.cockpit.command(`${CMD}.update`, {
      id: entry.id,
      pinned
    })) as { ok?: boolean } | null
    if (r?.ok) {
      entries.value = entries.value.map((e) => (e.id === entry.id ? { ...e, pinned } : e))
      sortLocal()
    }
  } catch {
    /* ignore */
  }
}

async function moveEntry(entry: ClipEntry): Promise<void> {
  markOwn()
  const target: ClipSink = entry.sink === 'private' ? 'normal' : 'private'
  try {
    const r = (await window.cockpit.command(`${CMD}.update`, {
      id: entry.id,
      sink: target
    })) as { ok?: boolean } | null
    if (r?.ok) {
      entries.value = entries.value.filter((e) => e.id !== entry.id)
      total.value = Math.max(0, total.value - 1)
      notify(te('launcher-mobile-clipboard.moved', { sink: sinkLabel(target) }, '已移动'))
    }
  } catch {
    /* ignore */
  }
}

function reveal(entry: ClipEntry): void {
  revealed.value = new Set([...revealed.value, entry.id])
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------
const editOpen = ref(false)
const editEntry = ref<ClipEntry | null>(null)
const editText = ref('')
const editSink = ref<ClipSink>('normal')

function openEdit(entry: ClipEntry): void {
  editEntry.value = entry
  editText.value = entry.text
  editSink.value = entry.sink
  editOpen.value = true
}

async function saveEdit(): Promise<void> {
  const entry = editEntry.value
  if (!entry) return
  markOwn()
  try {
    const r = (await window.cockpit.command(`${CMD}.update`, {
      id: entry.id,
      text: editText.value,
      sink: editSink.value
    })) as { ok?: boolean; entry?: ClipEntry } | null
    if (r?.ok) {
      const updated = r.entry
      if (updated && updated.sink === sink.value) {
        entries.value = entries.value.map((e) => (e.id === entry.id ? updated : e))
        sortLocal()
      } else {
        entries.value = entries.value.filter((e) => e.id !== entry.id)
        total.value = Math.max(0, total.value - 1)
      }
      notify(t('launcher-mobile-clipboard.edit_saved', '已保存'))
    }
  } finally {
    editOpen.value = false
    editEntry.value = null
  }
}

const newOpen = ref(false)
const newText = ref('')
const newSink = ref<ClipSink>('normal')

function openNew(): void {
  newText.value = ''
  newSink.value = sink.value
  newOpen.value = true
}

async function saveNew(): Promise<void> {
  const text = newText.value
  newOpen.value = false
  if (!text) return
  await addText(text, newSink.value, 'manual')
}

const confirmOpen = ref(false)
const confirmTitle = ref('')
const confirmBody = ref('')
let confirmRun: (() => Promise<void> | void) | null = null

function askConfirm(title: string, body: string, run: () => Promise<void> | void): void {
  confirmTitle.value = title
  confirmBody.value = body
  confirmRun = run
  confirmOpen.value = true
}

async function runConfirm(): Promise<void> {
  const run = confirmRun
  confirmRun = null
  confirmOpen.value = false
  if (run) await run()
}

function askDelete(entry: ClipEntry): void {
  askConfirm(
    t('launcher-mobile-clipboard.delete_title', '删除这条记录？'),
    entry.text.slice(0, 80),
    async () => {
      markOwn()
      try {
        const r = (await window.cockpit.command(`${CMD}.delete`, { id: entry.id })) as {
          ok?: boolean
        } | null
        if (r?.ok) {
          entries.value = entries.value.filter((e) => e.id !== entry.id)
          total.value = Math.max(0, total.value - 1)
        }
      } catch {
        /* ignore */
      }
    }
  )
}

function askClear(target: ClipSink): void {
  askConfirm(
    te('launcher-mobile-clipboard.clear_title', { sink: sinkLabel(target) }, '清空该水槽？'),
    t('launcher-mobile-clipboard.clear_body', '该操作不可撤销，置顶记录也会一并删除。'),
    async () => {
      markOwn()
      try {
        await window.cockpit.command(`${CMD}.clear`, { sink: target })
        if (target === sink.value) {
          entries.value = []
          total.value = 0
          hasMore.value = false
        }
      } catch (e) {
        notify(e instanceof Error ? e.message : String(e), 'error')
      }
    }
  )
}

// ---------------------------------------------------------------------------
// Config quick toggles (menu)
// ---------------------------------------------------------------------------
async function patchConfig(patch: Partial<ClipboardConfig>): Promise<void> {
  try {
    const r = (await window.cockpit.command(`${CMD}.config-set`, {
      config: JSON.parse(JSON.stringify(patch))
    })) as ClipboardConfig | null
    if (r) cfg.value = { ...cfg.value, ...r }
  } catch {
    /* ignore */
  }
}

const revealAll = ref(false)
function toggleRevealAll(): void {
  revealAll.value = !revealAll.value
  if (!revealAll.value) revealed.value = new Set()
}

// ---------------------------------------------------------------------------
// Shortcuts
// ---------------------------------------------------------------------------
useShortcut(`${CMD}.capture`, () => void captureNow())
useShortcut(`${CMD}.search`, () => searchRef.value?.focus())

// ---------------------------------------------------------------------------
// Layout measurement
// ---------------------------------------------------------------------------
let ro: ResizeObserver | null = null
function measure(): void {
  const w = rootRef.value?.clientWidth ?? 800
  compact.value = w < 700
  if (w < 720) {
    cols.value = 1
    return
  }
  const c = cfg.value.columns > 0 ? cfg.value.columns : Math.floor(w / 330)
  cols.value = Math.max(1, Math.min(5, c))
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
let queryTimer: ReturnType<typeof setTimeout> | null = null
let nowTimer: ReturnType<typeof setInterval> | null = null
let unsubChanged: (() => void) | null = null
let unsubConfig: (() => void) | null = null

onMounted(async () => {
  try {
    const c = (await window.cockpit.command(`${CMD}.config-get`)) as ClipboardConfig | null
    if (c) cfg.value = { ...DEFAULT_CLIPBOARD_CONFIG, ...c }
  } catch {
    /* ignore */
  }
  sink.value = cfg.value.defaultSink ?? 'normal'
  await nextTick()
  measure()
  if (rootRef.value) {
    ro = new ResizeObserver(() => measure())
    ro.observe(rootRef.value)
  }
  scrollRef.value?.addEventListener('scroll', onScroll, { passive: true })
  unsubChanged = window.cockpit.on('cockpit:clipboard-changed', onChanged)
  unsubConfig = window.cockpit.on('cockpit:clipboard-config-changed', onConfigChanged)
  nowTimer = setInterval(() => (now.value = Date.now()), 30_000)
  await loadFirst()
})

onBeforeUnmount(() => {
  if (queryTimer) clearTimeout(queryTimer)
  if (nowTimer) clearInterval(nowTimer)
  ro?.disconnect()
  scrollRef.value?.removeEventListener('scroll', onScroll)
  unsubChanged?.()
  unsubConfig?.()
})

watch(sink, () => {
  revealed.value = new Set()
  void loadFirst()
})

watch(query, () => {
  if (queryTimer) clearTimeout(queryTimer)
  queryTimer = setTimeout(() => void loadFirst(), 250)
})
</script>

<template>
  <div ref="rootRef" class="clip-root">
    <div class="clip-toolbar" :class="{ 'clip-toolbar--compact': compact }">
      <div class="clip-title">
        <div class="d-flex align-center ga-2">
          <span class="text-h6 font-weight-medium">{{
            t('launcher-mobile-clipboard.title', '移动剪贴板')
          }}</span>
          <v-chip size="small" variant="tonal" class="clip-chip">{{ total }}</v-chip>
        </div>
        <div class="text-caption text-medium-emphasis mt-1">
          {{
            isPrivate
              ? t('launcher-mobile-clipboard.subtitle_private', '私密水槽 · AI 读取需你授权')
              : t('launcher-mobile-clipboard.subtitle', '普通水槽 · 无限瀑布流')
          }}
        </div>
      </div>

      <v-btn-toggle
        v-model="sink"
        mandatory
        divided
        density="comfortable"
        variant="tonal"
        class="clip-sink"
      >
        <v-btn value="normal" prepend-icon="mdi-clipboard-text-outline">
          {{ t('launcher-mobile-clipboard.normal', '普通') }}
        </v-btn>
        <v-btn value="private" prepend-icon="mdi-lock-outline">
          {{ t('launcher-mobile-clipboard.private', '私密') }}
        </v-btn>
      </v-btn-toggle>

      <v-text-field
        ref="searchRef"
        v-model="query"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        prepend-inner-icon="mdi-magnify"
        :placeholder="t('launcher-mobile-clipboard.search', '搜索历史…')"
        class="clip-search"
      />

      <div class="clip-actions">
        <v-btn
          v-if="!compact"
          variant="tonal"
          prepend-icon="mdi-content-paste"
          :loading="capturing"
          @click="captureNow"
        >
          {{ t('launcher-mobile-clipboard.capture', '捕获') }}
        </v-btn>
        <v-btn
          v-else
          icon="mdi-content-paste"
          variant="tonal"
          size="small"
          :loading="capturing"
          :aria-label="t('launcher-mobile-clipboard.capture', '捕获')"
          :title="t('launcher-mobile-clipboard.capture', '捕获')"
          @click="captureNow"
        />
        <v-btn
          variant="flat"
          color="primary"
          :prepend-icon="compact ? undefined : 'mdi-plus'"
          :icon="compact ? 'mdi-plus' : undefined"
          :size="compact ? 'small' : undefined"
          :aria-label="t('launcher-mobile-clipboard.create', '新建')"
          :title="t('launcher-mobile-clipboard.create', '新建')"
          @click="openNew"
        >
          <span v-if="!compact">{{ t('launcher-mobile-clipboard.create', '新建') }}</span>
        </v-btn>
        <v-menu location="bottom end">
          <template #activator="{ props: menuProps }">
            <v-btn
              v-bind="menuProps"
              icon="mdi-dots-vertical"
              variant="text"
              size="small"
              :aria-label="t('launcher-mobile-clipboard.more', '更多')"
              :title="t('launcher-mobile-clipboard.more', '更多')"
            />
          </template>
          <v-list density="compact" min-width="220">
            <v-list-item @click="toggleRevealAll">
              <template #prepend>
                <v-icon>{{ revealAll ? 'mdi-eye-off-outline' : 'mdi-eye-outline' }}</v-icon>
              </template>
              <v-list-item-title>
                {{
                  revealAll
                    ? t('launcher-mobile-clipboard.hide_all', '遮挡私密内容')
                    : t('launcher-mobile-clipboard.reveal_all', '显示私密内容')
                }}
              </v-list-item-title>
            </v-list-item>
            <v-list-item @click="patchConfig({ blurPrivate: !cfg.blurPrivate })">
              <template #prepend>
                <v-icon>{{ cfg.blurPrivate ? 'mdi-blur' : 'mdi-blur-off' }}</v-icon>
              </template>
              <v-list-item-title>
                {{
                  cfg.blurPrivate
                    ? t('launcher-mobile-clipboard.blur_off', '关闭私密模糊')
                    : t('launcher-mobile-clipboard.blur_on', '开启私密模糊')
                }}
              </v-list-item-title>
            </v-list-item>
            <v-list-item @click="loadFirst">
              <template #prepend><v-icon>mdi-refresh</v-icon></template>
              <v-list-item-title>{{
                t('launcher-mobile-clipboard.refresh', '刷新')
              }}</v-list-item-title>
            </v-list-item>
            <v-divider class="my-1" />
            <v-list-item @click="askClear(sink)">
              <template #prepend><v-icon color="error">mdi-delete-sweep-outline</v-icon></template>
              <v-list-item-title class="text-error">
                {{
                  te(
                    'launcher-mobile-clipboard.clear_menu',
                    { sink: sinkLabel(sink) },
                    '清空当前水槽'
                  )
                }}
              </v-list-item-title>
            </v-list-item>
            <v-list-item @click="settings.open('launcher-mobile-clipboard')">
              <template #prepend><v-icon>mdi-cog-outline</v-icon></template>
              <v-list-item-title>{{
                t('launcher-mobile-clipboard.settings', '设置')
              }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
    </div>

    <v-alert
      v-if="isPrivate"
      type="warning"
      variant="tonal"
      density="compact"
      class="mb-3 clip-alert"
      icon="mdi-shield-lock-outline"
    >
      {{
        t(
          'launcher-mobile-clipboard.private_notice',
          'private 水槽对 AI 不透明：读取、修改、删除都必须先获得你的授权。'
        )
      }}
    </v-alert>

    <div ref="scrollRef" class="clip-scroll">
      <div v-if="entries.length" class="clip-columns">
        <div v-for="(col, ci) in columns" :key="ci" class="clip-col">
          <ClipboardCard
            v-for="entry in col"
            :key="entry.id"
            :entry="entry"
            :now="now"
            :preview-lines="cfg.previewLines"
            :blur="cfg.blurPrivate && !revealAll"
            :revealed="revealed.has(entry.id)"
            @copy="copyEntry"
            @pin="togglePin"
            @move="moveEntry"
            @edit="openEdit"
            @delete="askDelete"
            @reveal="reveal"
          />
        </div>
      </div>

      <v-empty-state
        v-else-if="!loading"
        :icon="isPrivate ? 'mdi-lock-outline' : 'mdi-clipboard-text-clock-outline'"
        :title="t('launcher-mobile-clipboard.empty_title', '还没有记录')"
        :text="
          query
            ? t('launcher-mobile-clipboard.empty_search', '没有匹配的记录')
            : t('launcher-mobile-clipboard.empty_text', '复制一段文字，或点右上角「捕获」试试')
        "
        class="align-self-center mt-8"
      />

      <div v-if="loadingMore" class="d-flex justify-center py-4">
        <v-progress-circular indeterminate size="26" />
      </div>
      <div v-else-if="hasMore && entries.length" class="d-flex justify-center py-4">
        <v-btn variant="text" prepend-icon="mdi-chevron-down" @click="loadMore">
          {{ t('launcher-mobile-clipboard.load_more', '加载更多') }}
        </v-btn>
      </div>
      <div
        v-else-if="entries.length >= MAX_RENDER"
        class="text-caption text-medium-emphasis text-center py-4"
      >
        {{ t('launcher-mobile-clipboard.render_limit', '已显示足够多，滚动查看的只是当前窗口') }}
      </div>
    </div>

    <!-- 编辑 -->
    <v-dialog v-model="editOpen" max-width="620" scrollable>
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center ga-2">
          <v-icon>mdi-pencil-outline</v-icon>
          {{ t('launcher-mobile-clipboard.edit_title', '编辑记录') }}
        </v-card-title>
        <v-divider />
        <v-card-text class="py-4">
          <v-btn-toggle
            v-model="editSink"
            mandatory
            divided
            density="comfortable"
            variant="tonal"
            class="mb-4"
          >
            <v-btn value="normal" prepend-icon="mdi-clipboard-text-outline">
              {{ t('launcher-mobile-clipboard.normal', '普通') }}
            </v-btn>
            <v-btn value="private" prepend-icon="mdi-lock-outline">
              {{ t('launcher-mobile-clipboard.private', '私密') }}
            </v-btn>
          </v-btn-toggle>
          <v-textarea
            v-model="editText"
            variant="outlined"
            auto-grow
            rows="6"
            :label="t('launcher-mobile-clipboard.content', '内容')"
          />
        </v-card-text>
        <v-card-actions class="px-4 pb-4 pt-0 ga-2">
          <v-spacer />
          <v-btn variant="text" @click="editOpen = false">
            {{ t('launcher-mobile-clipboard.cancel', '取消') }}
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            prepend-icon="mdi-content-save-outline"
            @click="saveEdit"
          >
            {{ t('launcher-mobile-clipboard.save', '保存') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 新建 -->
    <v-dialog v-model="newOpen" max-width="620" scrollable>
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center ga-2">
          <v-icon>mdi-plus-circle-outline</v-icon>
          {{ t('launcher-mobile-clipboard.new_title', '新增记录') }}
        </v-card-title>
        <v-divider />
        <v-card-text class="py-4">
          <v-btn-toggle
            v-model="newSink"
            mandatory
            divided
            density="comfortable"
            variant="tonal"
            class="mb-4"
          >
            <v-btn value="normal" prepend-icon="mdi-clipboard-text-outline">
              {{ t('launcher-mobile-clipboard.normal', '普通') }}
            </v-btn>
            <v-btn value="private" prepend-icon="mdi-lock-outline">
              {{ t('launcher-mobile-clipboard.private', '私密') }}
            </v-btn>
          </v-btn-toggle>
          <v-textarea
            v-model="newText"
            variant="outlined"
            auto-grow
            autofocus
            rows="6"
            :label="t('launcher-mobile-clipboard.content', '内容')"
            :placeholder="t('launcher-mobile-clipboard.new_placeholder', '粘贴或输入要保存的文本…')"
          />
        </v-card-text>
        <v-card-actions class="px-4 pb-4 pt-0 ga-2">
          <v-spacer />
          <v-btn variant="text" @click="newOpen = false">
            {{ t('launcher-mobile-clipboard.cancel', '取消') }}
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            prepend-icon="mdi-content-save-outline"
            @click="saveNew"
          >
            {{ t('launcher-mobile-clipboard.save', '保存') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 确认 -->
    <v-dialog v-model="confirmOpen" max-width="420">
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center ga-2 text-subtitle-1">
          <v-icon color="warning">mdi-alert-outline</v-icon>
          {{ confirmTitle }}
        </v-card-title>
        <v-card-text class="text-body-2">{{ confirmBody }}</v-card-text>
        <v-card-actions class="px-4 pb-4 pt-0 ga-2">
          <v-spacer />
          <v-btn variant="text" @click="confirmOpen = false">
            {{ t('launcher-mobile-clipboard.cancel', '取消') }}
          </v-btn>
          <v-btn color="error" variant="flat" prepend-icon="mdi-check" @click="runConfirm">
            {{ t('launcher-mobile-clipboard.confirm', '确认') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackOpen" :timeout="2200" :color="snackColor" location="top">
      {{ snackText }}
    </v-snackbar>
  </div>
</template>

<style scoped>
.clip-root {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 240px;
}

.clip-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 14px;
  margin-bottom: 14px;
}

.clip-title {
  flex: 1 1 auto;
  min-width: 0;
}

.clip-chip {
  padding-block: 4px;
  min-height: 24px;
}

.clip-sink :deep(.v-btn) {
  padding-inline: 14px;
}

.clip-search {
  width: 260px;
  flex: 0 1 260px;
}

.clip-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.clip-toolbar--compact .clip-search {
  flex: 1 1 100%;
  width: auto;
}

.clip-toolbar--compact .clip-sink {
  flex: 1 1 auto;
}

.clip-alert {
  border-radius: 12px;
}

.clip-scroll {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
}

.clip-columns {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.clip-col {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
