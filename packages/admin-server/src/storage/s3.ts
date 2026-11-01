import { Readable } from 'node:stream'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3'
import type { AdminObjectStorage, StoredObject } from './object-storage.js'

// S3 호환 저장소(스펙 S3) — 서브패스 `@ssworks/admin-server/storage/s3`. 🔴 `.` 진입점(index.ts)은 이 파일을 import 하지 않는다 —
//   `@aws-sdk/client-s3` 는 선택 peer 라 SDK 없는 앱이 기동해야 한다(storage/s3-isolation.test.ts 가 지킨다).
// 정본: ssworks-ringside packages/db/src/uploads/storage.ts createS3ObjectStorage(시간 제한 · 키 가림 · NoSuchKey 판정 · 체크섬 옵션)
// 바꾼 점: 설정을 SDK 모양 그대로 받는다(endpoint · region · credentials · forcePathStyle) · prefix · list · ensureBucket 없음 ·
//   시험용 client 주입. 🔴 공개 d.ts 에 SDK 타입을 내지 않는다(S3ClientLike) — check:dts 가 SDK 의 d.ts 를 skipLibCheck:false 로 읽지 않게.

export interface S3StorageOptions {
  bucket: string
  /** 기본 'us-east-1' — S3 호환 공급자는 대개 아무 값이면 된다 */
  region?: string
  /** S3 호환 공급자(R2 · MinIO · NCP …)의 엔드포인트. AWS 면 생략 */
  endpoint?: string
  credentials?: { accessKeyId: string; secretAccessKey: string }
  /** 경로형 주소(MinIO · 일부 공급자) */
  forcePathStyle?: boolean
  /** 키 앞에 붙일 접두사 — 버킷을 나눠 쓸 때. 끝 `/` 까지 적는다(`'admin/'`) */
  prefix?: string
  /** 호출 하나의 시간 제한(ms). 기본 10000 */
  timeoutMs?: number
  /** 시험용 — SDK 클라이언트 대신 쓸 것 */
  client?: S3ClientLike
}

/** SDK 클라이언트의 쓰는 면만 — 공개 d.ts 가 SDK 타입을 끌어오지 않게 */
export interface S3ClientLike {
  send(command: unknown, options?: { abortSignal?: AbortSignal }): Promise<unknown>
  destroy(): void
}

export interface S3ObjectStorage extends AdminObjectStorage {
  /** keep-alive 소켓을 닫는다 — 앱 종료 때 */
  destroy(): void
}

const DEFAULT_TIMEOUT_MS = 10_000
const CONNECT_TIMEOUT_MS = 3_000

function errorFacts(error: unknown): { name: string | null; status: number | null } {
  if (typeof error !== 'object' || error === null) return { name: null, status: null }
  const { name, $metadata } = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } }
  const status = $metadata?.httpStatusCode
  return {
    name: typeof name === 'string' ? name : null,
    status: typeof status === 'number' ? status : null,
  }
}

/**
 * 객체가 없다(NoSuchKey · 404). 버킷 없음(NoSuchBucket)은 설정 오류라 덮지 않는다.
 * 이름 없는 404 도 "없음" 으로 읽는다 — 일부 S3 호환 공급자가 NoSuchKey 이름 없이 404 만 준다. 대가로 잘못된 엔드포인트 · 프록시의
 * 맨 404 가 get 에서는 null(중계 404)로 보인다(delete 는 반대로 이름 있는 NoSuchKey 만 삼킨다 — 지우기 실패를 숨기지 않게).
 */
function isMissingObject(error: unknown): boolean {
  const { name, status } = errorFacts(error)
  return name !== 'NoSuchBucket' && (name === 'NoSuchKey' || status === 404)
}

/**
 * 던질 오류의 문구 · 스택 · 자기 문자열 속성에서 접근 키 · 비밀 키를 '***' 로 가린다(제자리) — 서버 로그가 오류 원문을 싣는다.
 * 긴 값부터 가린다(짧은 값이 긴 값의 일부일 때 반쯤 남지 않게). 바꿀 수 없는 속성은 건너뛴다
 */
function maskSecrets<T>(error: T, secrets: readonly string[]): T {
  if (!(error instanceof Error)) return error
  const ordered = secrets.filter((secret) => secret !== '').sort((a, b) => b.length - a.length)
  if (ordered.length === 0) return error
  const mask = (text: string) =>
    ordered.reduce((out, secret) => out.replaceAll(secret, '***'), text)
  const fields = error as unknown as Record<string, unknown>
  for (const name of new Set(['message', 'stack', ...Object.keys(error)])) {
    const value = fields[name]
    if (typeof value !== 'string') continue
    try {
      fields[name] = mask(value)
    } catch {
      // 읽기 전용 — 그대로 둔다
    }
  }
  return error
}

/**
 * 호출 하나에 시간 제한 — AbortSignal.timeout() 대신 타이머를 send 가 끝나면 지운다(흐르는 본문까지 끊지 않게).
 * get 은 응답 머리가 오면 제한이 풀리고 본문은 socketTimeout(쉬는 시간)만 본다 — 전체 다운로드 시간은 일부러 재지 않는다.
 * 실 SDK 는 abort 를 자기 AbortError 로 던질 수 있어 이 문구는 보장이 아니다(가짜 클라이언트 테스트만 문구를 잰다)
 */
async function withTimeout<T>(
  timeoutMs: number,
  run: (abortSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error(`저장소가 ${timeoutMs}ms 안에 답하지 않았다`)),
    timeoutMs,
  )
  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

function sdkClient(options: S3StorageOptions, timeoutMs: number): S3ClientLike {
  return new S3Client({
    region: options.region ?? 'us-east-1',
    ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
    ...(options.credentials === undefined ? {} : { credentials: options.credentials }),
    forcePathStyle: options.forcePathStyle ?? false,
    // S3 호환 공급자가 모두 받는 체크섬만 — SDK 기본(WHEN_SUPPORTED)은 CRC 머리글을 더해 일부 공급자가 거부한다
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: {
      connectionTimeout: Math.min(CONNECT_TIMEOUT_MS, timeoutMs),
      socketTimeout: timeoutMs,
    },
  }) as unknown as S3ClientLike
}

export function createS3ObjectStorage(options: S3StorageOptions): S3ObjectStorage {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const client = options.client ?? sdkClient(options, timeoutMs)
  const bucket = options.bucket
  const prefix = options.prefix ?? ''
  const secrets = options.credentials
    ? [options.credentials.accessKeyId, options.credentials.secretAccessKey]
    : []
  const masked = <T>(error: T) => maskSecrets(error, secrets)
  const keyOf = (key: string) => `${prefix}${key}`

  return {
    async put(key, body, contentType) {
      try {
        await withTimeout(timeoutMs, (abortSignal) =>
          client.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: keyOf(key),
              Body: body,
              ContentType: contentType,
              ContentLength: body.length,
            }),
            { abortSignal },
          ),
        )
      } catch (error) {
        throw masked(error)
      }
    },

    async get(key): Promise<StoredObject | null> {
      let output: GetObjectCommandOutput
      try {
        output = (await withTimeout(timeoutMs, (abortSignal) =>
          client.send(new GetObjectCommand({ Bucket: bucket, Key: keyOf(key) }), { abortSignal }),
        )) as GetObjectCommandOutput
      } catch (error) {
        if (isMissingObject(error)) return null
        throw masked(error)
      }
      const body = output.Body
      if (!(body instanceof Readable)) {
        // 웹 스트림이면 취소해 소켓을 돌려준다
        if (body instanceof ReadableStream) void body.cancel().catch(() => {})
        throw new Error('저장소 응답 본문이 Node 스트림이 아니다')
      }
      if (output.ContentLength === undefined) {
        body.destroy()
        throw new Error('저장소 응답에 Content-Length 가 없다')
      }
      return { body, contentLength: output.ContentLength }
    },

    async delete(key) {
      try {
        await withTimeout(timeoutMs, (abortSignal) =>
          client.send(new DeleteObjectCommand({ Bucket: bucket, Key: keyOf(key) }), {
            abortSignal,
          }),
        )
      } catch (error) {
        // S3 의 DeleteObject 는 없는 키에도 204 다 — 이름 있는 NoSuchKey 만 삼킨다. 이름 없는 404(프록시 · 잘못된 엔드포인트)는 던진다
        if (errorFacts(error).name !== 'NoSuchKey') throw masked(error)
      }
    },

    destroy() {
      client.destroy()
    },
  }
}
