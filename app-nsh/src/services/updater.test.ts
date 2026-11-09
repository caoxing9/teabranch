import { join } from 'path'
import { Fs } from 'teabranch/native'
import { describe, expect, test } from 'nsh/test'
import { swapBundle } from './updater'

/** A stand-in for an .app: a directory with a file naming its version. */
function fakeApp(path: string, version: string): void {
  Fs.mkdir(join(path, 'Contents'), true)
  Fs.writeFile(join(path, 'Contents', 'version'), version)
}

const versionIn = (path: string): string => Fs.readFile(join(path, 'Contents', 'version'))

describe('updater', () => {
  test("swaps the unpacked app into the running one's place and keeps the old one", async () => {
    const root = Fs.mkdtemp('teabranch-update-')
    const bundle = join(root, 'Applications', 'TeaBranch.app')
    const staged = join(root, 'updates', '0.19.0', 'TeaBranch.app')
    const previous = join(root, 'updates', 'previous-0.18.0.app')
    fakeApp(bundle, '0.18.0')
    fakeApp(staged, '0.19.0')
    // Something an earlier update left under the same name goes first.
    fakeApp(previous, '0.17.0')

    await swapBundle(bundle, staged, previous)

    expect(versionIn(bundle)).toBe('0.19.0')
    expect(versionIn(previous)).toBe('0.18.0')
    expect(Fs.exists(staged)).toBe(false)
    Fs.rm(root, true, true)
  })
})
