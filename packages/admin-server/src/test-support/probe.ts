import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  Module,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common'
import { BusinessError } from '@ssworks/admin-shared'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { RawResponse } from '../http/envelope.interceptor.js'
import { ParseBigIntPipe, ZodValidationPipe } from '../http/pipes.js'

// 테스트 전용 프로브 — 응답 · 오류 · 검증 계약을 HTTP 로 잰다. 🔴 빌드에서 빠진다(tsconfig.build.json).

export const probeBodySchema = z.object({
  name: z.string().min(2),
  count: z.coerce.number().int().default(1),
  members: z.array(z.object({ name: z.string().min(1, '이름을 입력하세요.') })).default([]),
})

type ProbeBody = z.infer<typeof probeBodySchema>

@Controller('probe')
export class ProbeController {
  @Get('value')
  value() {
    // text 는 래퍼와 충돌하는 일반 문자열 — 코덱이 역슬래시로 이스케이프하고 되돌린다(B9)
    return {
      n: 12345678901234567890n,
      at: new Date('2026-01-02T03:04:05.000Z'),
      text: 'BigInt(7)',
      label: '한글 값',
    }
  }

  @Get('nothing')
  nothing(): void {}

  @Get('raw')
  @RawResponse()
  raw() {
    return { plain: true }
  }

  @Get('file')
  file() {
    return new StreamableFile(Buffer.from('hello'), { type: 'text/plain' })
  }

  @Post('echo')
  echo(@Body() body: Record<string, unknown>) {
    return { type: typeof body.n, body }
  }

  @Get('query')
  query(@Query() query: Record<string, unknown>) {
    return query
  }

  @Get('cookie')
  cookie(@Req() request: Request) {
    return { cookies: request.cookies as unknown }
  }

  @Get('business/:code')
  business(@Param('code') code: string) {
    throw new BusinessError(
      code,
      `업무 오류 ${code}`,
      { field: 'x', n: 3n },
      { cause: new Error('내부 원인') },
    )
  }

  @Get('business-weird')
  businessWeird() {
    const details: Record<string, unknown> = { ok: 1 }
    details.self = details
    Object.defineProperty(details, 'bad', {
      enumerable: true,
      get() {
        throw new Error('getter')
      },
    })
    throw new BusinessError('ERR_COMMON_CONFLICT', '이상한 details', details)
  }

  @Get('http-forbidden')
  forbidden() {
    throw new ForbiddenException('이 작업을 할 권한이 없습니다.')
  }

  @Get('http-502')
  badGateway() {
    throw new HttpException('upstream down', 502)
  }

  @Get('string-throw')
  stringThrow() {
    throw 'boom'
  }

  @Get('half')
  half(@Res() response: Response) {
    response.status(200).type('text/plain').write('partial')
    throw new Error('늦은 예외')
  }

  @Post('validate')
  validate(@Body(new ZodValidationPipe(probeBodySchema)) body: ProbeBody) {
    return body
  }

  @Get('teams/:teamNo')
  team(@Param('teamNo', ParseBigIntPipe) teamNo: bigint) {
    return { teamNo, type: typeof teamNo }
  }
}

@Module({ controllers: [ProbeController] })
export class ProbeModule {}
