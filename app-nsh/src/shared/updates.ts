/**
 * What the updater reads, kept pure: version order, the Homebrew cask (the release's version,
 * checksum and download), and the changelog's sections for the versions since the one running.
 *
 * The cask and CHANGELOG.md are read raw from the repository rather than through GitHub's API,
 * which allows an unauthenticated address only sixty calls an hour — shared by everyone behind the
 * same NAT.
 */

/** `a` against `b` as dotted numbers (`0.18.0` > `0.17.2`); a part that isn't a number (`dev`) sorts before 0. */
export function compareVersions(a: string, b: string): number {
  const parts = (version: string): number[] =>
    version
      .replace(/^v/, '')
      .split('.')
      .map((part) => (/^\d+$/.test(part) ? Number(part) : -1))
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const difference = (x[i] ?? 0) - (y[i] ?? 0)
    if (difference) return difference < 0 ? -1 : 1
  }
  return 0
}

export interface CaskRelease {
  version: string
  sha256: string
  /** The DMG, with the cask's `#{version}` filled in. */
  url: string
}

/** The release `Casks/teabranch.rb` points at; throws on anything that isn't that file. */
export function parseCask(text: string): CaskRelease {
  const field = (name: string): string | undefined => new RegExp(`^\\s*${name}\\s+"([^"]+)"`, 'm').exec(text)?.[1]
  const version = field('version')
  const sha256 = field('sha256')
  const url = field('url')
  if (!version || !sha256 || !url) throw new Error('not a cask: version, sha256 or url is missing')
  return { version, sha256, url: url.replaceAll('#{version}', version) }
}

interface Section {
  version: string
  date?: string
  body: string
}

/**
 * CHANGELOG.md as semantic-release writes it: a heading per version (`# [0.17.0](compare…) (2026-11-06)`,
 * `## [0.17.1]…` for a patch), then `### Features` / `### Bug Fixes` lists.
 */
function sections(markdown: string): Section[] {
  const list: Section[] = []
  let current: Section | undefined
  for (const line of markdown.split('\n')) {
    const heading = /^#{1,2} \[?v?(\d+\.\d+\.\d+)\]?(?:\([^)]*\))?\s*(?:\((\d{4}-\d{2}-\d{2})\))?\s*$/.exec(line)
    if (heading) {
      current = { version: heading[1], date: heading[2], body: '' }
      list.push(current)
    } else if (current) {
      current.body += `${line}\n`
    }
  }
  return list
}

/** The changelog for the versions after `from` up to `to`, newest first, as markdown; at most `limit` of them. */
export function changelogSince(markdown: string, from: string, to: string, limit = 12): string {
  return sections(markdown)
    .filter((section) => compareVersions(section.version, from) > 0 && compareVersions(section.version, to) <= 0)
    .slice(0, limit)
    .map((section) => `### v${section.version}${section.date ? `  ·  ${section.date}` : ''}\n\n${section.body.trim()}\n`)
    .join('\n')
}
