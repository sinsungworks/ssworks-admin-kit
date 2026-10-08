<script setup lang="ts">
  import { computed } from 'vue'
  import { renderMarkdown } from '@ssworks/admin-shared'

  // 마크다운 본문 보기 — 킷에서 `v-html` 을 쓰는 유일한 자리.
  //
  // 정본: ssworks-gise-home apps/admin/src/components/MarkdownView.vue
  //       (+ ssworks-axion-admin packages/frontend/src/components/common/MarkdownView.vue — 같은 골격)
  // 바꾼 점:
  //  - 렌더러를 admin-shared `renderMarkdown` 으로 — 서버 · 공개 웹과 같은 함수(3e ② R1 · D1).
  //  - `linkTarget="_blank"` 면 본문 링크 클릭을 가로채 새 탭으로 연다 — 미리보기에서 링크를 눌러 발행 전 초안을 잃지
  //    않게(3e D18). 렌더된 HTML 은 건드리지 않는다(공개 원문과 같아야 한다).
  //  - `#empty` 슬롯, 본문 타이포 스타일(Vuetify 토큰). `data-test` 속성은 뺐다.
  //
  // 🔴 `v-html` 안전 근거: `html` 은 `renderMarkdown`(markdown-it `html: false`)의 결과이고 원문 HTML 은 전부 이스케이프돼
  //    있다. 그 전제가 깨지면(= html: true) 이 `v-html` 이 곧바로 저장형 XSS 실행 지점이 된다. 다른 곳에 `v-html` 을
  //    더하지 말고 이 컴포넌트를 쓴다.

  const props = withDefaults(
    defineProps<{
      source?: string | null
      linkTarget?: '_self' | '_blank'
    }>(),
    { source: null, linkTarget: '_self' },
  )

  defineSlots<{ empty?(): unknown }>()

  const html = computed(() => renderMarkdown(props.source))

  function onClick(event: MouseEvent): void {
    if (props.linkTarget !== '_blank') return
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest('a[href]')
    if (anchor == null) return
    event.preventDefault()
    window.open(anchor.getAttribute('href') ?? '', '_blank', 'noopener,noreferrer')
  }
</script>

<template>
  <div v-if="html === ''" class="markdown-view markdown-view--empty"><slot name="empty" /></div>
  <!-- 🔴 v-html 안전 근거는 머리 주석 — html 은 renderMarkdown({ html: false }) 의 결과다 -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div v-else class="markdown-view" @click="onClick" v-html="html" />
</template>

<style scoped>
  .markdown-view {
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  .markdown-view--empty {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  }

  .markdown-view :deep(:is(h1, h2, h3, h4, h5, h6)) {
    margin: 1em 0 0.5em;
    font-weight: 600;
    line-height: 1.3;
  }

  .markdown-view :deep(h1) {
    font-size: 1.5rem;
  }

  .markdown-view :deep(h2) {
    font-size: 1.3rem;
  }

  .markdown-view :deep(h3) {
    font-size: 1.15rem;
  }

  .markdown-view :deep(:is(h4, h5, h6)) {
    font-size: 1rem;
  }

  .markdown-view > :deep(:first-child) {
    margin-top: 0;
  }

  .markdown-view :deep(:is(p, ul, ol, blockquote, pre, table)) {
    margin: 0 0 0.75em;
  }

  .markdown-view :deep(:is(ul, ol)) {
    padding-left: 1.5em;
  }

  .markdown-view :deep(li > :is(ul, ol)) {
    margin-bottom: 0;
  }

  .markdown-view :deep(table) {
    display: block;
    max-width: 100%;
    overflow-x: auto;
    border-collapse: collapse;
  }

  .markdown-view :deep(:is(th, td)) {
    padding: 6px 10px;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }

  .markdown-view :deep(blockquote) {
    padding-left: 12px;
    border-left: 3px solid rgba(var(--v-border-color), var(--v-border-opacity));
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  }

  .markdown-view :deep(code) {
    padding: 0 4px;
    border-radius: 4px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    font-family: monospace;
  }

  .markdown-view :deep(pre) {
    padding: 8px 12px;
    border-radius: 4px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    overflow-x: auto;
  }

  .markdown-view :deep(pre code) {
    padding: 0;
    background: none;
  }

  .markdown-view :deep(a) {
    color: rgb(var(--v-theme-primary));
  }

  .markdown-view :deep(img) {
    max-width: 100%;
  }

  .markdown-view :deep(hr) {
    margin: 1em 0;
    border: 0;
    border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }
</style>
