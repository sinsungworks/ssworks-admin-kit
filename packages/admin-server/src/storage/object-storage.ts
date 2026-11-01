import type { Readable } from 'node:stream'

// 저장소 추상(스펙 S1) — 업로드 서비스 · 중계 · 정리가 이 셋만 부른다. 구현은 파일 시스템(file-system.ts) · S3 호환(s3.ts — 서브패스) ·
// 시험용 메모리(test-support/memory-storage.ts).
// 정본: ssworks-ringside packages/db/src/uploads/storage.ts `ObjectStorage`
// 바꾼 점: `list` 가 없다(고아 객체 대조는 비범위 — 스펙 §11). 키는 admin-shared UPLOAD_KEY_PATTERN 을 지난 것만 온다 — 구현은 그래도
//   경로 탐색을 한 번 더 막는다(저장소를 앱 코드가 직접 부를 수도 있다).
// 🔴 서비스가 호출을 감싼다(던지면 503 ERR_UPLOAD_UNAVAILABLE) — 구현은 자기 오류를 그대로 던지면 된다.

export interface StoredObject {
  body: Readable
  contentLength: number
}

export interface AdminObjectStorage {
  /** 같은 키에 다시 쓰면 덮는다 */
  put(key: string, body: Buffer, contentType: string): Promise<void>
  /** 없으면 null. 스트림은 부르는 쪽이 소비 · 파기한다 */
  get(key: string): Promise<StoredObject | null>
  /** 없어도 성공(멱등) */
  delete(key: string): Promise<void>
}
