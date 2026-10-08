<script setup lang="ts">
  import { Annotation, Compartment, EditorState, Transaction } from '@codemirror/state'
  import { basicSetup, EditorView } from 'codemirror'
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useTheme } from 'vuetify'

  // 마크다운 본문 편집기 — CodeMirror 6 을 `v-model` 하나로 감싼다.
  //
  // 정본: ssworks-axion-admin packages/frontend/src/pages/settings/legal.vue:152-216
  //       (= ssworks-gise-home apps/admin/src/pages/settings/legal.vue:252-314 — gise 가 axion 을 옮겼다)
  // 바꾼 점:
  //  - 색을 Vuetify CSS 변수로 칠한다 — `@codemirror/theme-one-dark` 를 쓰지 않는다(3e ③ C1). 다크 판정
  //    `EditorView.darkTheme` 은 Vuetify 테마를 따른다(찾기 패널 같은 CodeMirror 기본 요소가 이 판정을 본다).
  //  - 긴 줄을 줄바꿈한다(`lineWrapping`) — 약관 문단은 한 줄이 아주 길다. 정본은 가로 스크롤이었다(D6).
  //  - `readonly`(편집만 막음 — 포커스 · 선택 · 복사 · 찾기는 됨, D5) · `label`(aria) · `height` props.
  //  - 외부 변경 표시를 모듈 플래그(`applyingExternalDraft`) 대신 트랜잭션의 `Annotation` 으로 한다(D4).
  //
  // 🔴 받은 값과 문서가 같으면 아무것도 하지 않는다. 입력 → emit → 부모 → prop 으로 돌아온 값이 같아야 한글 조합이
  //    이어진다. 부모가 값을 고쳐서(트림 · 개행 정규화) 돌려주면 조합 중에 문서가 치환돼 글자가 깨진다(D3).
  // 🔴 외부 변경은 문서 전체 치환 + 되돌리기 기록 제외다. 전체 치환이 이전 문서의 편집 기록을 흡수해 비우므로
  //    (`codemirror.render.test.ts`) 다른 종류의 본문으로 바뀐 뒤 Ctrl+Z 가 앞 문서의 편집을 되살리지 않는다(D4).
  // 🔴 루트 요소가 곧 호스트다. 호스트를 `v-if` 뒤에 두면 `new EditorView({ parent: null })` 이 예외 없이 붙지 않아
  //    편집기 자리가 조용히 빈다(gise 실측). 쓰는 쪽도 불러오는 동안 숨기지 말고 `readonly` 로 둔다.
  // 🔴 CodeMirror 는 개행을 `\n` 으로 정규화한다. CRLF 본문은 처음 그릴 때는 그대로 두지만(외부 변경은 emit 하지 않는다)
  //    첫 입력부터 LF 로 나간다.
  // Tab 은 묶지 않는다(`indentWithTab` 없음) — 키보드 사용자가 Tab 으로 편집기 밖으로 나갈 수 있어야 한다.

  const props = withDefaults(
    defineProps<{
      modelValue: string
      readonly?: boolean
      label?: string
      height?: string
    }>(),
    { readonly: false, label: '본문', height: '420px' },
  )

  const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

  const host = ref<HTMLElement | null>(null)
  const theme = useTheme()
  /** 이 트랜잭션은 바깥(prop)에서 왔다 — 되돌려 emit 하지 않는다 */
  const external = Annotation.define<boolean>()
  const readonlyCompartment = new Compartment()
  const labelCompartment = new Compartment()
  const darkCompartment = new Compartment()
  let view: EditorView | null = null

  const readonlyExtension = (readonly: boolean) => [
    EditorState.readOnly.of(readonly),
    EditorView.contentAttributes.of(readonly ? { 'aria-readonly': 'true' } : {}),
  ]
  const labelExtension = (label: string) => EditorView.contentAttributes.of({ 'aria-label': label })
  const darkExtension = (dark: boolean) => EditorView.darkTheme.of(dark)

  /** 색은 Vuetify 토큰 — 앱 테마가 바뀌면 CSS 변수가 바뀌어 저절로 따라온다 */
  const vuetifyTheme = EditorView.theme({
    '&': {
      height: '100%',
      backgroundColor: 'rgb(var(--v-theme-surface))',
      color: 'rgb(var(--v-theme-on-surface))',
      fontSize: '13px',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { overflow: 'auto', fontFamily: 'monospace' },
    '.cm-content': { caretColor: 'rgb(var(--v-theme-on-surface))' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'rgb(var(--v-theme-on-surface))' },
    '.cm-gutters': {
      backgroundColor: 'rgba(var(--v-theme-on-surface), 0.04)',
      color: 'rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity))',
      border: 'none',
    },
    '.cm-activeLine, .cm-activeLineGutter': {
      backgroundColor: 'rgba(var(--v-theme-on-surface), 0.04)',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: 'rgba(var(--v-theme-primary), 0.2)' },
  })

  onMounted(() => {
    view = new EditorView({
      parent: host.value!,
      state: EditorState.create({
        doc: props.modelValue,
        extensions: [
          basicSetup,
          EditorView.lineWrapping,
          readonlyCompartment.of(readonlyExtension(props.readonly)),
          labelCompartment.of(labelExtension(props.label)),
          darkCompartment.of(darkExtension(theme.current.value.dark)),
          vuetifyTheme,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            if (update.transactions.some((tr) => tr.annotation(external))) return
            emit('update:modelValue', update.state.doc.toString())
          }),
        ],
      }),
    })
  })

  watch(
    () => props.modelValue,
    (value) => {
      if (view == null) return
      const doc = view.state.doc.toString()
      if (value === doc) return
      view.dispatch({
        changes: { from: 0, to: doc.length, insert: value },
        annotations: [Transaction.addToHistory.of(false), external.of(true)],
      })
    },
  )

  watch(
    () => props.readonly,
    (readonly) => {
      view?.dispatch({ effects: readonlyCompartment.reconfigure(readonlyExtension(readonly)) })
    },
  )

  watch(
    () => props.label,
    (label) => {
      view?.dispatch({ effects: labelCompartment.reconfigure(labelExtension(label)) })
    },
  )

  watch(
    () => theme.current.value.dark,
    (dark) => {
      view?.dispatch({ effects: darkCompartment.reconfigure(darkExtension(dark)) })
    },
  )

  onBeforeUnmount(() => {
    view?.destroy()
    view = null
  })
</script>

<template>
  <div ref="host" class="markdown-editor" :style="{ height }" />
</template>

<style scoped>
  .markdown-editor {
    overflow: hidden;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-radius: 4px;
  }

  .markdown-editor:focus-within {
    border-color: rgb(var(--v-theme-primary));
  }
</style>
