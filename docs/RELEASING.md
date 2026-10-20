# Releasing

Releases are cut by the `Release` GitHub Actions workflow. It bumps the version in
`package.json`, tags the commit, builds the Windows installer and the Linux AppImage/deb in
parallel, and attaches all three to a GitHub release.

Trigger it from the **Actions** tab (**Release** → **Run workflow**) or from the CLI:

```bash
gh workflow run release.yml -f version=0.2.0   # no leading v, the workflow adds it
gh run watch                                   # follow it live
```

It always builds the default branch, so merge first. If a run fails partway, delete the tag
before retrying the same version (`git push --delete origin v0.2.0`) or the tag step will hit
the existing tag and fail.

The `.deb` maintainer lives in `electron-builder.yml` under `linux.maintainer`, because
`package.json`'s `author` has no email and fpm requires one. The Windows installer is unsigned,
so SmartScreen will warn until a certificate is wired up.

