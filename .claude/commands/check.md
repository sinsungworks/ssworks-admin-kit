---
description: pnpm check(lint → typecheck → test → build)를 돌리고 실패한 것만 요약합니다. 코드를 고치지 않습니다.
---

`pnpm check` 를 실행해줘.

- 실패하면 **어느 단계**(lint / typecheck / test / build)에서 **어느 파일·테스트**가 왜 실패했는지만 추려서 보고한다. 전체 로그를 다시 붙이지 않는다.
- 통과하면 테스트 수와 빌드 산출물 크기(`packages/admin-ui/dist/index.js`, `style.css`)만 한 줄로 적는다.
- 고치지 않는다. 고칠지는 사용자가 정한다.
