# Changesets

패키지 버전·CHANGELOG 는 [changesets](https://github.com/changesets/changesets) 로 관리한다.

1. 변경을 만든 PR 에서 `pnpm changeset` 을 실행해 어느 패키지가 어떤 수준(patch/minor/major)으로 바뀌는지 적는다.
2. `main` 에 합쳐지면 release 워크플로가 "Version Packages" PR 을 연다.
3. 그 PR 을 합치면 npm 에 발행된다 — 토큰 없이 Trusted Publishing(OIDC). 패키지마다 npmjs.com 설정에 이 저장소의 `release.yml` 이 Trusted Publisher 로 등록돼 있어야 한다. **새 패키지**는 등록할 화면이 없으니 첫 버전만 사람이 로컬에서 `pnpm --filter <패키지> publish` 로 올리고 등록한다.

세 패키지는 `fixed` 로 묶여 있어 **항상 같은 번호로 함께** 오른다 — 소비 프로젝트가 "admin-kit 0.3" 한 숫자로 조합을 말할 수 있게 하기 위해서다. 변경이 없는 패키지도 번호가 올라 같이 발행된다(admin-server 는 Phase 2 까지 `private` 이라 번호만 오르고 발행되지 않는다).

## 0.x 동안의 peer 범위

admin-ui · admin-server 는 admin-shared 를 peer 로 `workspace:^0`(발행 시 `^0`) 으로 둔다. `workspace:^` 로 되돌리지 않는다 — changesets 는 이것을 `^<현재 버전>` 으로 읽는데, 0.x 에서 `^0.2.0` 은 0.3.0 을 덮지 못한다. peer 가 범위를 벗어나면 changesets 는 의존 패키지를 **major** 로 올리므로, admin-shared 의 minor 한 번에 세 패키지가 1.0.0 이 된다(첫 Version Packages PR 에서 실제로 그랬다).

`^0` 과 `config.json` 의 `onlyUpdatePeerDependentsWhenOutOfRange: true` 가 한 벌이다. 범위가 넓어진 대신 `fixed` 가 세 패키지를 같은 번호로만 내보내므로, 소비자는 같은 번호끼리 설치하면 된다.

**1.0 으로 갈 때** peer 를 `workspace:^` 로 되돌린다. 1.x 에서는 `^1.0.0` 이 이후 minor 를 덮으므로 실험 옵션만으로 major 연쇄가 생기지 않고, 발행 범위도 그 시점 버전(`^1.x.y`)으로 좁혀진다.
