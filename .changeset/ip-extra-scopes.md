---
'@ssworks/admin-shared': minor
'@ssworks/admin-server': minor
'@ssworks/admin-ui': minor
---

IP 접근 제어에 확장 범위(관리자 밖 주체 — 장치 토큰 · 외부 API 키)를 더한다.

- admin-shared: `evaluateScopedIpAccess`(두 층 판정 — 대상 → 범위 전체 → 거부) · `isIpExtraScopeTypeName` · `isCoreIpScopeType` · `ipRuleScopeTypeSchema` · `IP_EXTRA_SCOPE_TYPE_PATTERN` · 타입 `IpScopedSubject` · 문구 `IP_ACCESS_SCHEMA_MESSAGES.scopeTypeInvalid`. 규칙 응답 · 본문 스키마의 `scopeType` 이 확장 이름을 받는다.
- admin-server: 코어 옵션 `ipAccess.extraScopes`(`type` · `wholeScope` · `target.lock` · `target.names` — 타입 `AdminIpAccessOptions` · `AdminIpExtraScope` · `AdminIpScopeTarget`), `AdminIpExtraScopeService`(`allows` · `rulesOf` · `countRulesOf` · `clientIpOf` — `countRulesOf` 의 셋째 인자에 쓰는 쪽 `Transaction<Database>` 를 형변환 없이 넘긴다). 확장 규칙은 관리자 판정 · 잔존 · 자기 잠금 · 미리보기에 쓰이지 않고, 코어 규칙은 확장 판정에 쓰이지 않는다. 옵션에서 지운 범위의 행은 삭제만 된다(수정은 재인증 앞 400).
- admin-ui: `useIpAccessRules` 의 `extraScopes` · `focus` · `openCreate(prefill)`, 타입 `IpExtraScopeOption` · `IpTargetOption` · `IpRuleFocus` · `IpRulePrefill` · `IpExtraTargetView` · `IpScopeCatalog`, 미리보기 상태 `'unrelated'`. 화면이 모르는 범위의 행은 삭제만 된다. `openCreate` · `openEdit` 는 버리기 확인 뒤 권한 · 진행 중을 다시 본다. 한 범위 모드(`focus`)는 접속 카드를 그리지 않고, 마운트 · 편집 · 저장 · 삭제에서 서버 미리보기를 부르지 않으며, 범위 밖 규칙을 열지 않는다(`openEdit` → `false`).
- peer: admin-server · admin-ui 의 `@ssworks/admin-shared` 하한 `>=0.15.0` — 세 패키지를 함께 올린다.

소비자: 확장 범위를 쓰지 않으면 새 장도 옵션도 없다. 다만 셋을 확인한다.

- `scopeType` 이 `string` 으로 넓어졌다 — admin-shared `IpRule.scopeType` · `AdminIpRule['scopeType']` · `AdminIpRuleCreate['scopeType']` · `AdminIpRuleUpdate['scopeType']`, admin-server 표 타입 `AdminIpAccessRulesTable.scopeType`(`interface Database extends AdminDatabase` 로 받는 `ipAccessRules`). `'global' | 'team' | 'user'` 로 좁혀 쓰던 코드는 admin-shared `isCoreIpScopeType` 으로 좁힌다. admin-ui `IpRuleForm.scopeType` 은 이제 선택지 키다 — 확장 범위의 범위 전체는 `<이름>:*` 일 수 있다(서버 이름이 아니다).
- 모르는 `scopeType` 의 400 칸 오류(`issues[scopeType]`)를 옛 zod enum 문구로 맞추던 시험은 고친다 — 형식은 맞는데 등록되지 않은 이름은 「등록되지 않은 범위입니다.」, 형식 밖 이름(`Global` · `a_b` · 17자 이상)은 「범위 이름이 형식에 맞지 않습니다.」(상태 · 코드 · 칸은 그대로).
- `IpAccessMessages` 에 필수 키 열 개가 더해졌다(`scopeWhole` · `previewUnrelated` · `hintExtraScopes` · `gateImpactUnrelated` · `targetLabel` · `targetNumberLabel` · `targetSearchHint` · `targetSearchEmpty` · `targetSearchFailed` · `targetNoPermissionHint`). `messages`(`Partial`)로 일부만 덮는 쪽은 고칠 것이 없고, `IpAccessMessages` 를 통째로 만드는 쪽은 그 열 개를 더한다 — `{ ...DEFAULT_IP_ACCESS_MESSAGES, … }` 로 펼치면 된다.

확장 범위를 쓰려면 서버 옵션 `ipAccess.extraScopes` · 화면 옵션 `extraScopes` 를 한 상수에서 만들고, 쓰는 쪽 가드에서 `AdminIpExtraScopeService.allows` 를 부른다(admin-server README 「확장 범위」).
