import { definePermissions } from '@ssworks/admin-shared'
import { describe, expect, it } from 'vitest'
import { resolveAccountsConfig, resolveUsersConfig } from './options.js'

const catalog = definePermissions({
  USERS_READ: 'org.users:read',
  USERS_WRITE: 'org.users:write',
  ROLES_READ: 'org.roles:read',
  ROLES_WRITE: 'org.roles:write',
})

describe('resolveAccountsConfig', () => {
  it('카탈로그를 담고 reauth 기본 false — 얼린 설정', () => {
    const config = resolveAccountsConfig({ permissionCatalog: catalog }, 'AdminRolesModule')
    expect(config.catalog).toBe(catalog)
    expect(config.reauth).toBe(false)
    expect(Object.isFrozen(config)).toBe(true)
    expect(resolveAccountsConfig({ permissionCatalog: catalog, reauth: true }, 'M').reauth).toBe(
      true,
    )
  })

  it('🔴 카탈로그가 없거나 모양이 아니면 모듈 이름과 함께 멈춘다', () => {
    expect(() => resolveAccountsConfig({}, 'AdminRolesModule')).toThrow(
      'AdminRolesModule 은 permissionCatalog 옵션이 있어야 한다',
    )
  })

  it('🔴 카탈로그 모양이 다르면(normalize 없는 옛 admin-shared · 설치 둘) 모양이 다르다고 멈춘다', () => {
    expect(() =>
      resolveAccountsConfig({ permissionCatalog: { isPermission: () => true } as never }, 'M'),
    ).toThrow('M 의 permissionCatalog 모양이 다르다')
  })

  it('🔴 슬롯 맵의 키가 카탈로그에 없으면 모아서 멈춘다(B12 — 오타가 조용히 403 이 되지 않게)', () => {
    expect(() =>
      resolveAccountsConfig(
        {
          permissionCatalog: catalog,
          permissions: {
            'roles.read': 'org.roles:read',
            'roles.manage': 'org.role:write',
            'sessions.read': 'org.user:read',
          },
        },
        'M',
      ),
    ).toThrow(
      'permissions 의 키가 permissionCatalog 에 없다(오타?): roles.manage → org.role:write, sessions.read → org.user:read',
    )
  })

  it("'*' 키도 카탈로그 값이다", () => {
    expect(() =>
      resolveAccountsConfig(
        { permissionCatalog: catalog, permissions: { 'roles.read': '*' } },
        'M',
      ),
    ).not.toThrow()
  })

  it('reauth 가 boolean 이 아니면 멈춘다', () => {
    expect(() =>
      resolveAccountsConfig({ permissionCatalog: catalog, reauth: 'yes' as never }, 'M'),
    ).toThrow('reauth 는 true · false 여야 한다.')
  })
})

describe('resolveUsersConfig', () => {
  it('계정 설정 + 기준 시간대(기본 Asia/Seoul) — 얼린 설정', () => {
    const config = resolveUsersConfig({ permissionCatalog: catalog }, 'AdminUsersModule')
    expect(config).toEqual({ catalog, reauth: false, timeZone: 'Asia/Seoul' })
    expect(Object.isFrozen(config)).toBe(true)
    expect(
      resolveUsersConfig({ permissionCatalog: catalog, timeZone: 'UTC', reauth: true }, 'M'),
    ).toMatchObject({ reauth: true, timeZone: 'UTC' })
  })

  it('🔴 timeZone 이 IANA 이름이 아니면 멈춘다(B15) — 카탈로그 검사는 그대로', () => {
    expect(() =>
      resolveUsersConfig({ permissionCatalog: catalog, timeZone: '+09:00' }, 'AdminUsersModule'),
    ).toThrow('timeZone 은 IANA 시간대 이름이어야 한다')
    expect(() => resolveUsersConfig({}, 'AdminUsersModule')).toThrow(
      'AdminUsersModule 은 permissionCatalog 옵션이 있어야 한다',
    )
  })
})
