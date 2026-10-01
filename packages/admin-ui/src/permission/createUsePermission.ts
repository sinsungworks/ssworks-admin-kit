import { createPermissionCheck, type PermissionCheck } from '@ssworks/admin-shared'

/**
 * 권한 판정 훅 팩토리.
 *
 * 정본: hangang-home `composables/usePermission.ts`(`PermissionCheck` export) + gise(판정 로직은
 * shared 에 두고 훅은 위임만 한다). 네 사본의 규칙은 같다 — `'*'` 정확 일치 단락 + AND/OR.
 *
 * 🔴 **저장소에 권한 판정 훅은 하나뿐이다. 사본을 만들지 마라** — 화면과 가드가 다른 규칙으로
 *    판정하는 순간 메뉴는 보이는데 라우트는 403 이 된다. 그래서 훅이 스토어를 직접 import 하지
 *    않고 `granted` 게터를 주입받는다. 프로젝트의 `composables/usePermission.ts` 는 한 줄이다:
 *
 * ```ts
 * export const usePermission = createUsePermission<Permission>(
 *   () => useAppStore().userInfo?.permissions ?? [],
 * )
 * ```
 *
 * 메뉴 필터·라우트 가드에는 `usePermission()` 의 반환값(`PermissionCheck`)을 그대로 넘긴다.
 */
export function createUsePermission<P extends string = string>(
  granted: () => readonly string[],
): () => PermissionCheck<P> {
  // 게터는 호출마다 평가되므로 로그인 전후가 같은 판정기로 갈린다. 인스턴스를 하나만 만든다.
  const check = createPermissionCheck<P>(granted)
  return () => check
}
