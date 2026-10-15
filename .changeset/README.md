# Changesets

패키지 버전·CHANGELOG 는 [changesets](https://github.com/changesets/changesets) 로 관리한다.

1. 변경을 만든 PR 에서 `pnpm changeset` 을 실행해 어느 패키지가 어떤 수준(patch/minor/major)으로 바뀌는지 적는다.
2. `main` 에 합쳐지면 release 워크플로가 "Version Packages" PR 을 연다.
3. 그 PR 을 합치면 CI 가 바뀐 버전을 npm 에 **스테이징**한다 — 토큰 없이 Trusted Publishing(OIDC), 아직 공개되지 않는다.
4. 사람이 2FA 로 승인해 공개하고 태그를 붙인다:

   ```bash
   pnpm stage list                  # 승인 대기 중인 버전과 stage-id
   pnpm stage view <stage-id>       # 필요하면 내용 확인
   pnpm stage approve <stage-id>    # 패키지마다 — 2FA 를 묻는다
   git pull && pnpm changeset tag && git push --tags
   ```

   잘못 올라간 버전은 `pnpm stage reject <stage-id>`. 스테이징된 버전도 그 번호를 점유하므로, 다시 올리려면 거절한 뒤 새 버전으로 간다.

### npm 쪽 설정 (패키지마다 한 번)

- Settings → Trusted Publisher: GitHub Actions · `sinsungworks` / `ssworks-admin-kit` / `release.yml`. **"Allow npm publish" 는 끈다**(stage only) — CI 가 뚫려도 승인 없이는 공개되지 않는다.
- Settings → Publishing access: "Require two-factor authentication and disallow tokens".
- **새 패키지**는 Trusted Publisher 를 등록할 화면이 없다. 첫 버전만 사람이 로컬에서 `pnpm --filter <패키지> publish` 로 올리고 위 설정을 한다. 여러 패키지를 한 번에 올리는 `changeset publish` 는 두 번째부터 2FA 브라우저 인증을 못 받아 `ERR_PNPM_OTP_NON_INTERACTIVE` 로 실패하니, 패키지마다 따로 올린다.

세 패키지는 `fixed` 로 묶여 있어 **항상 같은 번호로 함께** 오른다 — 소비 프로젝트가 "admin-kit 0.3" 한 숫자로 조합을 말할 수 있게 하기 위해서다. 변경이 없는 패키지도 번호가 올라 같이 발행된다(admin-server 는 Phase 2 까지 `private` 이라 번호만 오르고 발행되지 않는다).

## 0.x 동안의 peer 범위

admin-ui · admin-server 는 admin-shared 를 peer 로 둔다. **`workspace:^` 를 쓰지 않는다** — changesets 는 이것을 `^<현재 버전>` 으로 읽는데, 0.x 에서 `^0.2.0` 은 0.3.0 을 덮지 못한다. peer 가 범위를 벗어나면 changesets 는 의존 패키지를 **major** 로 올리므로, admin-shared 의 minor 한 번에 세 패키지가 1.0.0 이 된다(첫 Version Packages PR 에서 실제로 그랬다).

| 패키지       | peer `@ssworks/admin-shared` | 발행 시          |
| ------------ | ---------------------------- | ---------------- |
| admin-ui     | `workspace:^0`               | `^0`             |
| admin-server | `workspace:>=0.4.0 <1.0.0`   | `>=0.4.0 <1.0.0` |

둘 다 0.x 의 모든 minor 를 덮는다 — `config.json` 의 `onlyUpdatePeerDependentsWhenOutOfRange: true` 와 한 벌이다(범위 안이면 changesets 가 의존 패키지를 올리지도, 범위를 다시 쓰지도 않는다). `fixed` 가 세 패키지를 같은 번호로만 내보내므로 소비자는 같은 번호끼리 설치하면 된다. `workspace:` 뒤의 범위는 pnpm 이 pack · publish 때 그대로 꺼내 쓴다.

**admin-server 의 하한**은 admin-server 가 import 하는 admin-shared API 가 모두 처음 실린 버전이다(0.4.0 — 감사 카탈로그 · 사용자 · 팀 · 약관 · IP 액션 · IP 파서). 🔴 admin-server 가 admin-shared 의 **새 export** 를 쓰기 시작하는 PR 은 하한을 그 export 가 실릴 버전으로 올린다 — 아니면 옛 admin-shared 와 함께 설치돼 런타임에 `undefined` 가 된다(예: `@Audit({ action: CoreAuditActions.X })`). admin-ui 는 0.2.0 · 0.3.0 이 이미 `^0` 으로 나갔다 — 같은 규칙이 필요해지면 그때 하한을 둔다.

**1.0 으로 갈 때** peer 를 `workspace:^` 로 되돌린다. 1.x 에서는 `^1.0.0` 이 이후 minor 를 덮으므로 실험 옵션만으로 major 연쇄가 생기지 않고, 발행 범위도 그 시점 버전(`^1.x.y`)으로 좁혀진다.
