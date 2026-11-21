---
'@ssworks/admin-shared': minor
'@ssworks/admin-server': minor
'@ssworks/admin-ui': minor
---

IP 접근 제어에 확장 범위(관리자 밖 주체 — 장치 토큰 · 외부 API 키)를 더한다.

- admin-shared: `evaluateScopedIpAccess`(두 층 판정 — 대상 → 범위 전체 → 거부) · `isIpExtraScopeTypeName` · `isCoreIpScopeType` · `ipRuleScopeTypeSchema` · `IP_EXTRA_SCOPE_TYPE_PATTERN` · 타입 `IpScopedSubject`. 규칙 응답 · 본문 스키마의 `scopeType` 이 확장 이름을 받는다(`AdminIpRule['scopeType']` 은 `string`).
- admin-server: 코어 옵션 `ipAccess.extraScopes`(`type` · `wholeScope` · `target.lock` · `target.names` — 타입 `AdminIpAccessOptions` · `AdminIpExtraScope` · `AdminIpScopeTarget`), `AdminIpExtraScopeService`(`allows` · `rulesOf` · `countRulesOf` · `clientIpOf`). 확장 규칙은 관리자 판정 · 잔존 · 자기 잠금 · 미리보기에 쓰이지 않고, 코어 규칙은 확장 판정에 쓰이지 않는다. 모르는 `scopeType` 의 400 칸 문구가 「등록되지 않은 범위입니다.」 로 바뀐다(상태 · 코드 · 칸은 그대로).
- admin-ui: `useIpAccessRules` 의 `extraScopes` · `focus` · `openCreate(prefill)`, 타입 `IpExtraScopeOption` · `IpTargetOption` · `IpRuleFocus` · `IpRulePrefill` · `IpExtraTargetView` · `IpScopeCatalog`, 미리보기 상태 `'unrelated'`. 화면이 모르는 범위의 행은 삭제만 된다. `openCreate` · `openEdit` 는 버리기 확인 뒤 권한 · 진행 중을 다시 본다.
- peer: admin-server · admin-ui 의 `@ssworks/admin-shared` 하한 `>=0.15.0` — 세 패키지를 함께 올린다.

소비자: 확장 범위를 쓰지 않으면 새 장도 옵션도 없다. 다만 둘을 확인한다.

- `AdminIpRule['scopeType']` 을 `'global' | 'team' | 'user'` 로 좁혀 쓰던 코드는 이제 `string` 을 받는다 — admin-shared `isCoreIpScopeType` 으로 좁힌다.
- 모르는 `scopeType` 의 400 칸 오류를 옛 zod enum 문구로 맞추던 시험은 새 문구 「등록되지 않은 범위입니다.」 로 고친다(상태 · 코드 · 칸은 그대로).

확장 범위를 쓰려면 서버 옵션 `ipAccess.extraScopes` · 화면 옵션 `extraScopes` 를 한 상수에서 만들고, 쓰는 쪽 가드에서 `AdminIpExtraScopeService.allows` 를 부른다(admin-server README 「확장 범위」).
