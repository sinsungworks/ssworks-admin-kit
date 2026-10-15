import { BusinessError } from '@ssworks/admin-shared'
import { expect } from 'vitest'

// 테스트 전용 — 거부를 기대하는 프로미스에서 BusinessError 를 꺼낸다. 🔴 빌드에서 빠진다(tsconfig.build.json 의 test-support 제외).
// 2f-2a(스펙 A17): db 테스트 여섯 곳의 같은 사본을 모았다.

export async function failure(promise: Promise<unknown>): Promise<BusinessError> {
  const error = await promise.then(
    () => {
      throw new Error('실패를 기대했다')
    },
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(BusinessError)
  return error as BusinessError
}
