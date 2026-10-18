import { VUETIFY_LAYER_ORDER } from './vuetify/layer-order.js'

// @ssworks/admin-ui/vite — Vuetify CSS 레이어 순서를 <head> 맨 앞에서 선언하는 Vite 플러그인.
//
// 정본: Vuetify 문서 Styles › CSS Layers(레이어 순서를 다른 스타일시트보다 먼저 선언한다 — public/layers.css 를
//       head 맨 앞에서 link) + ringside 보고 2026-10-18 §1
// 바꾼 점: 프로젝트마다 layers.css 를 베끼지 않게 킷이 transformIndexHtml 로 넣는다(PR #3h 결정 ① ⓓ).
//
// 🔴 admin-ui 엔트리가 vuetify/components 를 들여서 부품 CSS(@layer vuetify-components)가 vuetify/styles 의 순서
//    선언보다 먼저 문서에 들어간다. 레이어 순서는 처음 나타난 순서라 reset 레이어가 <button> VBtn 의 size · 굵기를
//    이긴다(22px · 400). import 순서로는 못 고친다 — 개발 서버는 모듈 평가 순서, 운영 빌드는 청크 CSS 순서를 따른다.
// 🔴 head-prepend 는 <head> 바로 뒤, 빌드 CSS link 는 </head> 바로 앞에 들어간다(Vite 8 injectToHead) — 개발 · 빌드
//    모두 선언이 맨 앞이다. 우리 위에 올 수 있는 것은 다른 플러그인의 head-prepend 태그뿐이다(스펙 L2).
// 🔴 이 파일은 바깥 패키지를 import 하지 않는다 — 소비자의 vite.config 가 Node 에서 읽는다(vite.test.ts 그래프).
//    vite 타입도 들이지 않는다(peer-deps.test.ts 가 src 의 bare import 를 모두 필수 peer 로 요구한다). 반환 타입은
//    Vite Plugin 에 대입되는 구조 타입이다.

export interface VuetifyLayerOrderTag {
  tag: 'style'
  children: string
  injectTo: 'head-prepend'
}

export interface VuetifyLayerOrderPlugin {
  name: string
  transformIndexHtml: () => VuetifyLayerOrderTag[]
}

/** vite.config 의 plugins 맨 앞에 넣는다. index.html 은 고치지 않는다. */
export function vuetifyLayerOrder(): VuetifyLayerOrderPlugin {
  return {
    name: '@ssworks/admin-ui:vuetify-layer-order',
    transformIndexHtml: () => [
      { tag: 'style', children: VUETIFY_LAYER_ORDER, injectTo: 'head-prepend' },
    ],
  }
}
