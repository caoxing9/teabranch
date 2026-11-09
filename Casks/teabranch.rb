# Homebrew cask for TeaBranch.
#
# This lives in the app's own repository rather than a `homebrew-tap` repo, so the tap has to be
# added by URL:
#
#     brew tap caoxing9/teabranch https://github.com/caoxing9/TeaBranch
#     brew trust --cask caoxing9/teabranch/teabranch
#     brew install --cask teabranch
#
# About the `postflight_steps` below, because it disables a real protection and should not be silent:
#
# This build is ad-hoc signed, not notarized — notarizing needs a paid Developer ID. The DMG
# arrives quarantined (macOS marks it as downloaded), the app copied out of it inherits that, and
# Gatekeeper then rejects it: `spctl -a` says "rejected" and the first launch needs right-click →
# Open. Homebrew does not change this. Its `--no-quarantine` flag no longer exists, and
# `Quarantine.available?` is hard-coded false in current versions, yet the attribute still comes in
# on the downloaded file itself.
#
# So the cask strips it explicitly. That is the same `xattr -dr` the README has always told people
# to run by hand, moved into the install so it happens once and correctly. It means Gatekeeper does
# not vet this app on your machine — which is a thing to accept knowingly, and the reason to
# eventually pay for a Developer ID instead.
#
# `version` and `sha256` are rewritten by the release workflow; don't hand-edit them.
cask "teabranch" do
  version "0.20.0"
  sha256 "a43cd9100d3910833cbfaec44676842ec3a647c8375ff295b5f8320a77f6017e"

  url "https://github.com/caoxing9/TeaBranch/releases/download/v#{version}/TeaBranch-#{version}-arm64.dmg"
  name "TeaBranch"
  desc "Run Teable branches in parallel worktrees and fix issues with local agents"
  homepage "https://github.com/caoxing9/TeaBranch"

  livecheck do
    url :url
    strategy :github_latest
  end

  # nsh's floor (AppKit host, macOS 14); there is no Intel slice. A bare symbol already means ">="
  # here — `macos=` parses with that comparator — and the string spelling is deprecated.
  depends_on macos: :sonoma
  depends_on arch: :arm64

  app "TeaBranch.app"

  # The declarative form Homebrew 7 asks for; `{{appdir}}` is expanded in the arguments.
  postflight_steps do
    run "/usr/bin/xattr",
        args:         ["-dr", "com.apple.quarantine", "{{appdir}}/TeaBranch.app"],
        must_succeed: false
  end

  uninstall quit: "com.teabranch.dev"

  zap trash: [
    "~/Library/Application Support/com.teabranch.dev",
    "~/Library/Application Support/TeaBranch",
    "~/Library/Caches/com.teabranch.dev",
    "~/Library/Logs/TeaBranch",
    "~/Library/Preferences/com.teabranch.dev.plist",
    "~/Library/Saved Application State/com.teabranch.dev.savedState",
  ]
end
