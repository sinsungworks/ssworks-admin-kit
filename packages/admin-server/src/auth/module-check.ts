import type { Type } from '@nestjs/common'
import type { ModulesContainer } from '@nestjs/core'
import { AdminAuthModule } from './admin-auth.module.js'

// 정본: 없음 — 2b AdminAuthModule.onModuleInit 의 ModulesContainer 훑기(최종 리뷰 F3)와 같은 방식.
// 🔴 세션 · 감사 모듈은 인증 · 권한 가드(AdminAuthModule 의 APP_GUARD)에 기댄다 — 인증 모듈 없이 붙으면 라우트가 그대로
//    열린다. 그래서 import 유무를 기동에서 본다(2c 스펙 §5-8, §14 R1-3 실측).
// 🔴 이 파일은 permission-slots.ts 와 따로 둔다 — 권한 가드(admin-auth.module 이 import)가 슬롯 파일을 import 하므로,
//    여기서 AdminAuthModule 을 부르면 순환이 된다.
// 2h: 업로드 모듈이 약관 모듈 유무로 legal 용도를 자동 등록한다 — 같은 훑기를 isModuleRegistered 로 일반화했다.

/** 그 모듈 클래스가 앱에 등록돼 있는가(동적 모듈도 metatype 이 같은 클래스다) */
export function isModuleRegistered(modules: ModulesContainer, type: Type): boolean {
  return [...modules.values()].some((ref) => ref.metatype === type)
}

export function assertAuthModuleRegistered(modules: ModulesContainer, moduleName: string): void {
  if (!isModuleRegistered(modules, AdminAuthModule)) {
    throw new Error(
      `${moduleName} 은 AdminAuthModule 이 있어야 한다 — 인증 · 권한 가드 없이 라우트가 열린다. AppModule 에 AdminAuthModule 을 import 한다.`,
    )
  }
}
