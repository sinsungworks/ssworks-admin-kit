# Changesets

패키지 버전·CHANGELOG 는 [changesets](https://github.com/changesets/changesets) 로 관리한다.

1. 변경을 만든 PR 에서 `pnpm changeset` 을 실행해 어느 패키지가 어떤 수준(patch/minor/major)으로 바뀌는지 적는다.
2. `main` 에 합쳐지면 release 워크플로가 "Version Packages" PR 을 연다.
3. 그 PR 을 합치면 npm 에 발행된다 (`NPM_TOKEN` 시크릿 필요).

세 패키지는 `linked` 로 묶여 있어 함께 버전이 오른다 — 소비 프로젝트가 "admin-kit 1.3" 한 숫자로 조합을 말할 수 있게 하기 위해서다.
