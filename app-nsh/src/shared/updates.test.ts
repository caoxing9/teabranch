import { describe, expect, test } from 'nsh/test'
import { changelogSince, compareVersions, parseCask } from './updates'

const CASK = `# Homebrew cask for TeaBranch.
cask "teabranch" do
  version "0.18.0"
  sha256 "e91739973cd3066c98e3a2f57ea77d33846b1cd9dd37e77b31ed383ce52b0203"

  url "https://github.com/caoxing9/TeaBranch/releases/download/v#{version}/TeaBranch-#{version}-arm64.dmg"
  name "TeaBranch"
end
`

const CHANGELOG = `# [0.18.0](https://github.com/caoxing9/TeaBranch/compare/v0.17.0...v0.18.0) (2026-11-07)


### Features

* settings as a section, with a model rule per scene ([#16](https://github.com/caoxing9/TeaBranch/issues/16)) ([908765f](https://github.com/caoxing9/TeaBranch/commit/908765f))

## [0.17.1](https://github.com/caoxing9/TeaBranch/compare/v0.17.0...v0.17.1) (2026-11-06)


### Bug Fixes

* a patch

# [0.17.0](https://github.com/caoxing9/TeaBranch/compare/v0.16.0...v0.17.0) (2026-11-06)


### Features

* TeaBranch on nsh replaces the Electron app ([#15](https://github.com/caoxing9/TeaBranch/issues/15))

# 0.1.0 (2026-09-01)

First.
`

describe('updates', () => {
  test('orders versions numerically', () => {
    expect(compareVersions('0.18.0', '0.17.2')).toBe(1)
    expect(compareVersions('0.9.0', '0.10.0')).toBe(-1)
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    // A build with no version is older than any release.
    expect(compareVersions('dev', '0.1.0')).toBe(-1)
  })

  test('reads the release from the cask', () => {
    expect(parseCask(CASK)).toEqual({
      version: '0.18.0',
      sha256: 'e91739973cd3066c98e3a2f57ea77d33846b1cd9dd37e77b31ed383ce52b0203',
      url: 'https://github.com/caoxing9/TeaBranch/releases/download/v0.18.0/TeaBranch-0.18.0-arm64.dmg',
    })
    expect(() => parseCask('cask "x" do\nend')).toThrow()
  })

  test('keeps the changelog sections after the running version', () => {
    const notes = changelogSince(CHANGELOG, '0.17.0', '0.18.0')
    expect(notes).toContain('### v0.18.0  ·  2026-11-07')
    expect(notes).toContain('### v0.17.1  ·  2026-11-06')
    expect(notes).toContain('settings as a section')
    expect(notes).not.toContain('replaces the Electron app')
    expect(notes).not.toContain('First.')
    expect(notes.indexOf('v0.18.0')).toBeLessThan(notes.indexOf('v0.17.1'))
  })

  test('takes everything for a build with no version, up to the limit', () => {
    expect(changelogSince(CHANGELOG, 'dev', '0.18.0')).toContain('First.')
    expect(changelogSince(CHANGELOG, 'dev', '0.18.0', 1)).not.toContain('v0.17.1')
  })
})
