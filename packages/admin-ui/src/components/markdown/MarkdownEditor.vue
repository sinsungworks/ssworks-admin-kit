<script setup lang="ts">
  import { history } from '@tiptap/pm/history'
  import { Editor } from '@tiptap/vue-3'
  import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
  import { VBtn, VBtnToggle, VDivider } from 'vuetify/components'
  import { createMarkdownEditorExtensions, normalizeLinkHref } from './editor-markdown.js'
  import {
    DEFAULT_MARKDOWN_EDITOR_MESSAGES,
    MARKDOWN_EDITOR_EMIT_DELAY_MS,
    type MarkdownEditorMessages,
    type MarkdownEditorMode,
  } from './markdown-editor.js'
  import MarkdownLinkDialog from './MarkdownLinkDialog.vue'

  // 마크다운 본문 편집기 — TipTap 3 + @tiptap/markdown WYSIWYG 와 「원문」(Markdown textarea) 전환을 `v-model` 하나로 감싼다.
  // v-model 은 Markdown 문자열이다(스펙 `docs/superpowers/specs/2026-11-01-admin-ui-wysiwyg-editor-design.md`).
  //
  // 정본: ssworks-ringside apps/web/app/components/ring/RingMarkdownEditor.vue(Nuxt UI UEditor 조립 · 도구 묶음)
  //       + 이 파일의 전 판(CodeMirror 6 — 3e D3 · D4 · D5 계약 · Vuetify 토큰 색)
  // 바꾼 점:
  //  - 엔진 TipTap(`@tiptap/vue-3` Editor 를 호스트 <div> 에 직접 마운트 — `EditorContent` 없이도 vue-3 Editor 의 반응성은 온다).
  //  - 충실도 어댑터는 editor-markdown.ts(화면과 시험 하니스가 같은 확장 묶음).
  //  - 「원문」 모드 — 평문 textarea, 같은 v-model, 값 변환 없음(약관 표기 보존 · IME 탈출구 — 결정 ①).
  //  - emit 디바운스 200ms(결정 ③) — 큰 본문에서 입력마다 전체 직렬화하지 않는다. 포커스 잃음 · 전환 · readonly · 언마운트에서 flush.
  //  - 링크는 BaseDialog(브라우저 prompt 금지). 도구 막대 문구는 `messages`.
  //
  // 🔴 받은 값(prop)이 마지막으로 합의한 값(`lastEmitted`)과 같으면 아무것도 하지 않는다(D3). 디바운스 뒤 부모가 돌려준 값은 그 사이 더
  //    친 글자 때문에 지금 문서와 다를 수 있어 문서와 비교하면 조합 중 치환이 일어난다 — 그래서 `lastEmitted` 와 비교한다(W4).
  // 🔴 외부 변경은 `setContent` 뒤 history 플러그인을 떼었다 다시 단다 — setContent 만으로는 history 에 남아 Ctrl+Z 가 앞 문서를
  //    되살린다(D4). `view.updateState(EditorState.create(…))` 로 직접 갈아 끼우면 @tiptap/vue-3 Editor 가 비추는 state(reactiveState)가
  //    낡아, 다음 dispatch 가 옛 state 에 적용돼 history 가 되살아난다(실측) — 공개 API(`unregisterPlugin` · `registerPlugin`)로만 만진다.
  // 🔴 도구 막대의 반응성은 `tick`(transaction 마다 +1)으로 — vue-3 Editor 의 reactiveState 는 rAF 두 번 뒤에 트리거되는 디바운스 ref 라
  //    단추 상태가 한 프레임 늦고 테스트가 잴 수 없다.
  // 🔴 첫 내용 · 외부 변경 · 모드 전환은 emit 하지 않는다 — 사용자 트랜잭션에서만(W6). StarterKit `trailingNode: false` 가 그 전제다.
  // 🔴 호스트 <div> 는 v-show 로만 가린다 — 편집기를 매번 새로 만들지 않는다(W2). 쓰는 쪽도 이 컴포넌트를 v-if 뒤에 두지 말고
  //    불러오는 동안 `readonly` 로 둔다(LegalDocumentEditor).
  // 개행은 `\n` 으로 정규화된다(marked · ProseMirror) — CRLF 본문은 첫 입력부터 LF 로 나간다(W17).

  const props = withDefaults(
    defineProps<{
      modelValue: string
      readonly?: boolean
      label?: string
      height?: string
      /** 처음 보일 편집 방식. 기본 'wysiwyg'(서식). 'source' 는 Markdown 원문 textarea */
      defaultMode?: MarkdownEditorMode
      messages?: Partial<MarkdownEditorMessages>
    }>(),
    {
      readonly: false,
      label: '본문',
      height: '420px',
      defaultMode: 'wysiwyg',
      messages: () => ({}),
    },
  )

  const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

  const text = computed<MarkdownEditorMessages>(() => ({
    ...DEFAULT_MARKDOWN_EDITOR_MESSAGES,
    ...props.messages,
  }))

  const host = ref<HTMLElement | null>(null)
  const editor = shallowRef<Editor>()
  /** 트랜잭션마다 +1 — 도구 막대 · 링크 상태가 다시 셈하게 하는 반응형 신호 */
  const tick = ref(0)
  const mode = ref<MarkdownEditorMode>(props.defaultMode)
  /** 이 컴포넌트가 마지막으로 부모와 합의한 값 — 초기 prop · emit 한 값 · 외부에서 받은 값 · 원문에서 친 값 */
  let lastEmitted = props.modelValue
  /** 원문 모드에서 값이 바뀌어 서식 편집기 문서가 낡았다 — 서식으로 돌아올 때 맞춘다 */
  let wysiwygStale = false
  let pending: ReturnType<typeof setTimeout> | null = null

  const linkOpen = ref(false)
  const linkHref = ref('')

  function contentAttributes(): Record<string, string> {
    const attributes: Record<string, string> = {
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': props.label,
    }
    if (props.readonly) attributes['aria-readonly'] = 'true'
    return attributes
  }

  function cancelPending(): void {
    if (pending == null) return
    clearTimeout(pending)
    pending = null
  }

  /** 대기 중인 emit 을 지금 보낸다 — 값이 합의한 값과 같으면 보내지 않는다(친 뒤 지운 경우) */
  function flush(): void {
    if (pending == null) return
    cancelPending()
    const instance = editor.value
    if (instance == null || instance.isDestroyed) return
    const markdown = instance.getMarkdown()
    if (markdown === lastEmitted) return
    lastEmitted = markdown
    emit('update:modelValue', markdown)
  }

  function scheduleEmit(): void {
    cancelPending()
    pending = setTimeout(flush, MARKDOWN_EDITOR_EMIT_DELAY_MS)
  }

  /** 외부 변경(D4) — 문서 치환 + 되돌리기 기록 비움. emit 하지 않는다 */
  function replaceExternal(value: string): void {
    const instance = editor.value
    if (instance == null) return
    cancelPending()
    instance.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
    // history 플러그인을 새 인스턴스로 — 플러그인 상태가 처음부터 다시 만들어져 되돌리기 기록이 빈다(StarterKit undoRedo 기본 옵션)
    instance.unregisterPlugin('history')
    instance.registerPlugin(history())
    lastEmitted = value
    wysiwygStale = false
  }

  onMounted(() => {
    const instance = new Editor({
      element: host.value!,
      extensions: createMarkdownEditorExtensions(),
      content: props.modelValue,
      contentType: 'markdown',
      editable: !props.readonly,
      injectCSS: false,
      editorProps: { attributes: contentAttributes() },
      onUpdate: scheduleEmit,
      onBlur: flush,
      onTransaction: () => {
        tick.value += 1
      },
    })
    editor.value = instance
  })

  onBeforeUnmount(() => {
    flush()
    editor.value?.destroy()
    editor.value = undefined
  })

  watch(
    () => props.modelValue,
    (value) => {
      if (value === lastEmitted) return
      if (mode.value === 'source') {
        lastEmitted = value
        wysiwygStale = true
        return
      }
      const instance = editor.value
      if (instance == null) return
      if (value === instance.getMarkdown()) {
        lastEmitted = value
        return
      }
      replaceExternal(value)
    },
  )

  watch(
    () => props.readonly,
    (readonly) => {
      if (readonly) flush()
      editor.value?.setEditable(!readonly, false)
      editor.value?.setOptions({ editorProps: { attributes: contentAttributes() } })
    },
  )

  watch(
    () => props.label,
    () => editor.value?.setOptions({ editorProps: { attributes: contentAttributes() } }),
  )

  function setMode(next: unknown): void {
    if ((next !== 'wysiwyg' && next !== 'source') || next === mode.value) return
    if (next === 'source') flush()
    mode.value = next
    if (next === 'wysiwyg' && wysiwygStale) replaceExternal(lastEmitted)
  }

  function onSourceInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value
    lastEmitted = value
    wysiwygStale = true
    emit('update:modelValue', value)
  }

  interface Tool {
    key: Exclude<
      keyof MarkdownEditorMessages,
      'modeWysiwyg' | 'modeSource' | 'modeToggle' | 'toolbar' | `link${string}`
    >
    icon: string
    active: boolean
    disabled: boolean
    run: () => void
  }

  type Chain = ReturnType<Editor['chain']>

  interface ToolSpec {
    key: Tool['key']
    icon: string
    /** 실행 · 가능 판정이 같은 체인이다 — `chain().focus()` 뒤에 붙인다 */
    command: (chain: Chain) => Chain
    /** 켜진 서식인가(선택) */
    active?: (editor: Editor) => boolean
    /** 기본 가능 판정(`can()`) 대신 쓸 판정(선택) */
    enabled?: (editor: Editor) => boolean
    /** 체인 대신 따로 실행할 것(선택 — 링크 대화상자) */
    run?: () => void
  }

  /** 도구 묶음 정의(W10) — 편집기가 없어도 단추는 그려진다(잠김). 상태는 `tools` 가 `tick` 마다 다시 셈한다 */
  const TOOL_GROUPS: readonly (readonly ToolSpec[])[] = [
    [
      { key: 'bold', icon: 'mdi-format-bold', command: (c) => c.toggleBold(), active: (e) => e.isActive('bold') },
      { key: 'italic', icon: 'mdi-format-italic', command: (c) => c.toggleItalic(), active: (e) => e.isActive('italic') },
      { key: 'strike', icon: 'mdi-format-strikethrough-variant', command: (c) => c.toggleStrike(), active: (e) => e.isActive('strike') },
    ],
    [
      { key: 'heading2', icon: 'mdi-format-header-2', command: (c) => c.toggleHeading({ level: 2 }), active: (e) => e.isActive('heading', { level: 2 }) },
      { key: 'heading3', icon: 'mdi-format-header-3', command: (c) => c.toggleHeading({ level: 3 }), active: (e) => e.isActive('heading', { level: 3 }) },
    ],
    [
      { key: 'blockquote', icon: 'mdi-format-quote-close', command: (c) => c.toggleBlockquote(), active: (e) => e.isActive('blockquote') },
      { key: 'bulletList', icon: 'mdi-format-list-bulleted', command: (c) => c.toggleBulletList(), active: (e) => e.isActive('bulletList') },
      { key: 'orderedList', icon: 'mdi-format-list-numbered', command: (c) => c.toggleOrderedList(), active: (e) => e.isActive('orderedList') },
    ],
    [
      {
        key: 'link',
        icon: 'mdi-link-variant',
        command: (c) => c,
        active: (e) => e.isActive('link'),
        enabled: (e) => !e.state.selection.empty || e.isActive('link'),
        run: () => openLink(),
      },
      { key: 'horizontalRule', icon: 'mdi-minus', command: (c) => c.setHorizontalRule() },
    ],
    [
      { key: 'undo', icon: 'mdi-undo', command: (c) => c.undo() },
      { key: 'redo', icon: 'mdi-redo', command: (c) => c.redo() },
    ],
  ]

  /** 도구 상태 — `tick`(트랜잭션) · `editor`(마운트) 에 반응한다 */
  const tools = computed<Tool[][]>(() => {
    void tick.value
    const instance = editor.value
    return TOOL_GROUPS.map((group) =>
      group.map((spec) => {
        if (instance == null) {
          return { key: spec.key, icon: spec.icon, active: false, disabled: true, run: () => {} }
        }
        const enabled = spec.enabled
          ? spec.enabled(instance)
          : spec.command(instance.can().chain().focus()).run()
        return {
          key: spec.key,
          icon: spec.icon,
          active: spec.active?.(instance) ?? false,
          disabled: !enabled,
          run: spec.run ?? (() => spec.command(instance.chain().focus()).run()),
        }
      }),
    )
  })

  const toolsDisabled = computed(() => props.readonly || mode.value === 'source')

  const hasLink = computed(() => {
    void tick.value
    return editor.value?.isActive('link') ?? false
  })

  function openLink(): void {
    const instance = editor.value
    if (instance == null) return
    const href = instance.getAttributes('link').href
    linkHref.value = typeof href === 'string' ? href : ''
    linkOpen.value = true
  }

  /** 적용 — 빈 값이면 링크를 지운다. 링크 확장이 주소를 거부하면(`javascript:` 등) 거짓 → 대화상자가 힌트를 보인다 */
  function applyLink(input: string): boolean {
    const instance = editor.value
    if (instance == null) return false
    const href = normalizeLinkHref(input)
    if (href == null) {
      removeLink()
      return true
    }
    return instance.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }

  function removeLink(): void {
    editor.value?.chain().focus().extendMarkRange('link').unsetLink().run()
  }

  defineExpose({ editor })
</script>

<template>
  <div class="markdown-editor" :style="{ height }">
    <div :aria-label="text.toolbar(label)" class="markdown-editor__toolbar" role="toolbar">
      <template v-for="(group, index) in tools" :key="index">
        <VDivider v-if="index > 0" class="markdown-editor__divider" vertical />
        <VBtn
          v-for="tool in group"
          :key="tool.key"
          :active="tool.active"
          :aria-label="text[tool.key]"
          :aria-pressed="tool.active ? 'true' : undefined"
          :disabled="toolsDisabled || tool.disabled"
          :icon="tool.icon"
          size="small"
          :title="text[tool.key]"
          variant="text"
          @click="tool.run"
        />
      </template>
      <VBtnToggle
        :aria-label="text.modeToggle"
        class="markdown-editor__mode"
        density="compact"
        mandatory
        :model-value="mode"
        variant="outlined"
        @update:model-value="setMode"
      >
        <VBtn size="small" value="wysiwyg">{{ text.modeWysiwyg }}</VBtn>
        <VBtn size="small" value="source">{{ text.modeSource }}</VBtn>
      </VBtnToggle>
    </div>
    <div class="markdown-editor__body">
      <div v-show="mode === 'wysiwyg'" ref="host" class="markdown-editor__wysiwyg" />
      <textarea
        v-show="mode === 'source'"
        :aria-label="label"
        class="markdown-editor__source"
        :readonly="readonly"
        spellcheck="false"
        :value="modelValue"
        @input="onSourceInput"
      />
    </div>
    <MarkdownLinkDialog
      v-model="linkOpen"
      :apply="applyLink"
      :has-link="hasLink"
      :href="linkHref"
      :messages="text"
      :remove="removeLink"
    />
  </div>
</template>

<style scoped>
  .markdown-editor {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-radius: 4px;
    background: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
  }

  .markdown-editor:focus-within {
    border-color: rgb(var(--v-theme-primary));
  }

  .markdown-editor__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }

  .markdown-editor__divider {
    align-self: stretch;
    height: auto;
    margin: 4px;
  }

  .markdown-editor__mode {
    margin-left: auto;
  }

  .markdown-editor__body {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .markdown-editor__wysiwyg {
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }

  .markdown-editor__source {
    display: block;
    width: 100%;
    height: 100%;
    padding: 12px 16px;
    border: 0;
    outline: none;
    resize: none;
    background: transparent;
    color: inherit;
    font-family: monospace;
    font-size: 13px;
    line-height: 1.5;
  }

  /* injectCSS: false — ProseMirror 기본 규칙 중 필요한 것만 */
  .markdown-editor__wysiwyg :deep(.ProseMirror) {
    flex: 1;
    padding: 12px 16px;
    outline: none;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.6;
    caret-color: rgb(var(--v-theme-on-surface));
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror ::selection) {
    background: rgba(var(--v-theme-primary), 0.2);
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror-selectednode) {
    outline: 2px solid rgba(var(--v-theme-primary), 0.6);
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror-gapcursor) {
    position: relative;
    display: none;
    pointer-events: none;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror-gapcursor::after) {
    content: '';
    position: absolute;
    top: -2px;
    display: block;
    width: 20px;
    border-top: 1px solid rgb(var(--v-theme-on-surface));
    animation: markdown-editor-blink 1.1s steps(2, start) infinite;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror-focused .ProseMirror-gapcursor) {
    display: block;
  }

  @keyframes markdown-editor-blink {
    to {
      visibility: hidden;
    }
  }

  /* 본문 타이포 — MarkdownView 와 같은 규칙 */
  .markdown-editor__wysiwyg :deep(.ProseMirror :is(h1, h2, h3, h4, h5, h6)) {
    margin: 1em 0 0.5em;
    font-weight: 600;
    line-height: 1.3;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror h1) {
    font-size: 1.5rem;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror h2) {
    font-size: 1.3rem;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror h3) {
    font-size: 1.15rem;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror :is(h4, h5, h6)) {
    font-size: 1rem;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror > :first-child) {
    margin-top: 0;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror :is(p, ul, ol, blockquote, pre)) {
    margin: 0 0 0.75em;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror :is(ul, ol)) {
    padding-left: 1.5em;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror li > :is(ul, ol)) {
    margin-bottom: 0;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror li > p) {
    margin-bottom: 0;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror blockquote) {
    padding-left: 12px;
    border-left: 3px solid rgba(var(--v-border-color), var(--v-border-opacity));
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror code) {
    padding: 0 4px;
    border-radius: 4px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    font-family: monospace;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror pre) {
    padding: 8px 12px;
    border-radius: 4px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    overflow-x: auto;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror pre code) {
    padding: 0;
    background: none;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror a) {
    color: rgb(var(--v-theme-primary));
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror img) {
    display: block;
    max-width: 100%;
  }

  .markdown-editor__wysiwyg :deep(.ProseMirror hr) {
    margin: 1em 0;
    border: 0;
    border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }
</style>
