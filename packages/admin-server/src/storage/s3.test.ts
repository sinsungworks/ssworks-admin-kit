import { Readable } from 'node:stream'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { describe, expect, it, vi } from 'vitest'
import { createS3ObjectStorage, type S3ClientLike } from './s3.js'

const KEY = 'legal/2026/11/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.webp'
const SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
const ACCESS = 'AKIAIOSFODNN7EXAMPLE'

/** 명령마다 답을 정하는 가짜 클라이언트 — 받은 명령을 모은다 */
function fakeClient(answer: (command: unknown) => unknown) {
  const sent: unknown[] = []
  const client: S3ClientLike = {
    send: vi.fn(async (command: unknown) => {
      sent.push(command)
      return answer(command)
    }),
    destroy: vi.fn(),
  }
  return { client, sent }
}

const s3Error = (name: string, status?: number, message = `${name} happened`) =>
  Object.assign(new Error(message), { name, $metadata: { httpStatusCode: status } })

async function drain(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

describe('createS3ObjectStorage(스펙 S3)', () => {
  it('put — Bucket · prefix 붙은 Key · Body · ContentType · ContentLength', async () => {
    const { client, sent } = fakeClient(() => ({}))
    const storage = createS3ObjectStorage({ bucket: 'b', prefix: 'admin/', client })
    await storage.put(KEY, Buffer.from('abc'), 'image/webp')
    expect(sent[0]).toBeInstanceOf(PutObjectCommand)
    expect((sent[0] as PutObjectCommand).input).toEqual({
      Bucket: 'b',
      Key: `admin/${KEY}`,
      Body: Buffer.from('abc'),
      ContentType: 'image/webp',
      ContentLength: 3,
    })
  })

  it('get — Node 스트림 · ContentLength 를 돌려주고, NoSuchKey · 404 는 null', async () => {
    const { client, sent } = fakeClient(() => ({
      Body: Readable.from([Buffer.from('xy')]),
      ContentLength: 2,
    }))
    const storage = createS3ObjectStorage({ bucket: 'b', client })
    const got = await storage.get(KEY)
    expect(sent[0]).toBeInstanceOf(GetObjectCommand)
    expect((sent[0] as GetObjectCommand).input).toEqual({ Bucket: 'b', Key: KEY })
    expect(got?.contentLength).toBe(2)
    expect((await drain(got!.body)).toString()).toBe('xy')

    const missing = createS3ObjectStorage({
      bucket: 'b',
      client: fakeClient(() => {
        throw s3Error('NoSuchKey', 404)
      }).client,
    })
    expect(await missing.get(KEY)).toBeNull()
    const notFound = createS3ObjectStorage({
      bucket: 'b',
      client: fakeClient(() => {
        throw s3Error('Unknown', 404)
      }).client,
    })
    expect(await notFound.get(KEY)).toBeNull()
  })

  it('🔴 NoSuchBucket 은 null 이 아니라 던진다(설정 오류를 덮지 않는다)', async () => {
    const storage = createS3ObjectStorage({
      bucket: 'b',
      client: fakeClient(() => {
        throw s3Error('NoSuchBucket', 404)
      }).client,
    })
    await expect(storage.get(KEY)).rejects.toThrow('NoSuchBucket')
  })

  it('delete — 명령을 보내고 NoSuchKey 는 삼킨다, 다른 오류는 던진다', async () => {
    const { client, sent } = fakeClient(() => ({}))
    await createS3ObjectStorage({ bucket: 'b', client }).delete(KEY)
    expect(sent[0]).toBeInstanceOf(DeleteObjectCommand)
    await expect(
      createS3ObjectStorage({
        bucket: 'b',
        client: fakeClient(() => {
          throw s3Error('NoSuchKey', 404)
        }).client,
      }).delete(KEY),
    ).resolves.toBeUndefined()
    await expect(
      createS3ObjectStorage({
        bucket: 'b',
        client: fakeClient(() => {
          throw s3Error('AccessDenied', 403)
        }).client,
      }).delete(KEY),
    ).rejects.toThrow('AccessDenied')
  })

  it('🔴 던지는 오류의 문구 · 속성에서 접근 키 · 비밀 키를 가린다', async () => {
    const error = Object.assign(new Error(`signature failed for ${ACCESS} with ${SECRET}`), {
      name: 'SignatureDoesNotMatch',
      $metadata: { httpStatusCode: 403 },
      StringToSign: `AWS4-HMAC ${SECRET}`,
    })
    const storage = createS3ObjectStorage({
      bucket: 'b',
      credentials: { accessKeyId: ACCESS, secretAccessKey: SECRET },
      client: fakeClient(() => {
        throw error
      }).client,
    })
    const caught = (await storage
      .put(KEY, Buffer.from('x'), 'image/webp')
      .catch((e: unknown) => e)) as Error & { StringToSign: string }
    expect(caught.message).toBe('signature failed for *** with ***')
    expect(caught.StringToSign).toBe('AWS4-HMAC ***')
    expect(caught.name).toBe('SignatureDoesNotMatch')
  })

  it('시간 제한 — timeoutMs 안에 답이 없으면 던진다', async () => {
    const client: S3ClientLike = {
      send: (_command, options) =>
        new Promise((_resolve, reject) => {
          options?.abortSignal?.addEventListener('abort', () => reject(options.abortSignal?.reason))
        }),
      destroy: vi.fn(),
    }
    const storage = createS3ObjectStorage({ bucket: 'b', client, timeoutMs: 20 })
    await expect(storage.get(KEY)).rejects.toThrow('20ms 안에 답하지 않았다')
  })

  it('prefix 는 get · delete 의 Key 에도 붙는다', async () => {
    const { client, sent } = fakeClient(() => ({
      Body: Readable.from([Buffer.from('x')]),
      ContentLength: 1,
    }))
    const storage = createS3ObjectStorage({ bucket: 'b', prefix: 'admin/', client })
    await storage.get(KEY)
    await storage.delete(KEY)
    expect((sent[0] as GetObjectCommand).input.Key).toBe(`admin/${KEY}`)
    expect((sent[1] as DeleteObjectCommand).input.Key).toBe(`admin/${KEY}`)
  })

  it('🔴 응답에 Content-Length 가 없으면 본문을 파기하고 던진다', async () => {
    const body = Readable.from([Buffer.from('x')])
    const storage = createS3ObjectStorage({
      bucket: 'b',
      client: fakeClient(() => ({ Body: body })).client,
    })
    await expect(storage.get(KEY)).rejects.toThrow('Content-Length 가 없다')
    expect(body.destroyed).toBe(true)
  })

  it('destroy 는 클라이언트를 닫는다', () => {
    const { client } = fakeClient(() => ({}))
    createS3ObjectStorage({ bucket: 'b', client }).destroy()
    expect(client.destroy).toHaveBeenCalledTimes(1)
  })
})
