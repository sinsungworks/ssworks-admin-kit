import 'reflect-metadata'
import { Injectable } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { expect, it } from 'vitest'

@Injectable()
class Dependency {
  readonly name = 'dependency'
}

@Injectable()
class Consumer {
  constructor(readonly dependency: Dependency) {}
}

it('🔴 vitest 변환이 design:paramtypes 를 낸다 — 없으면 클래스 생성자 주입이 조용히 undefined 가 된다', async () => {
  expect(Reflect.getMetadata('design:paramtypes', Consumer)).toEqual([Dependency])
  const ref = await Test.createTestingModule({ providers: [Dependency, Consumer] }).compile()
  expect(ref.get(Consumer).dependency.name).toBe('dependency')
  await ref.close()
})
