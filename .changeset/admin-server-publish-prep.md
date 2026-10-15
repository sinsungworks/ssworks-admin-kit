---
'@ssworks/admin-server': minor
'@ssworks/admin-shared': patch
---

**쓰는 쪽이 할 일:** 없음. admin-server 는 이제 `@ssworks/admin-shared` `>=0.4.0 <1.0.0` 을 peer 로 요구한다(첫 발행 때 같은 번호끼리 설치한다). DB 를 TLS 로 붙이려면 `DB_SSL=true` 나 `DB_SSL_CA`, 유닉스 소켓이면 `DB_SOCKET_PATH`(선택 — README "DB TLS · 소켓").

admin-server 첫 발행 준비(Phase 2 PR 2f-2b): `AdminDbConnection` 에 TLS(`ssl` — mariadb 드라이버 옵션 그대로) · 유닉스 소켓(`socketPath`), `host` 는 선택(`host` 와 `socketPath` 중 하나만 — 아니면 기동 실패, 소켓은 `port` · `ssl` 과 함께 쓰지 않는다). `adminDbConnectionFromEnv` 가 `DB_SSL=true`(Node 기본 CA 묶음 · MariaDB 11.4.1+ 자체 서명은 드라이버 지문 검증) · `DB_SSL_CA`(PEM 파일 — 그 CA 로 체인 · 호스트 이름 검증) · `DB_SOCKET_PATH` 를 읽는다. 빠진 env 문구가 `DB_HOST(또는 DB_SOCKET_PATH)` 를 말한다. 검증 끄기 · 호스트 이름 생략 · 클라이언트 인증서는 코드로(README). 앱과 마이그레이션 러너가 같은 풀 옵션을 쓴다. 아직 `private` 이라 npm 에 나가지 않는다.

admin-shared: `skipLibCheck: false` 에서 `dist/pagination.d.ts` 의 TS2536 3건(`createQuerySchema`)을 없앴다 — 추론 결과는 같다. IP 파서: `::ffff:` 는 점 표기 IPv4 앞에서만 떼고(`::ffff:1::/120` 거부 · `::ffff:1:2:3:4:5:6` 받음), 내장 IPv4 는 마지막 그룹에만(`1.2.3.4::` 거부), `::1` 접기는 `/128` 에만(`::1/64` 는 IPv6 망 `::/64` · `::1/120` 은 더 이상 127.0.0.0/24 가 아니다), v4-mapped 영역은 `::ffff:a.b.c.d` 꼴만 받는다(`::ffff:7f00:1` · `0:0:0:0:0:ffff:1.2.3.4` 거부).
