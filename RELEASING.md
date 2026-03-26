# Releasing TaskTone

## One-time setup

1. Ensure you can publish to npm:
   ```bash
   npm whoami --cache ./.npm-cache
   ```
2. Ensure the repository is clean:
   ```bash
   git status
   ```

## Release flow

1. Run checks:
   ```bash
   npm run release:check
   ```
2. Bump version (pick one):
   ```bash
   npm version patch
   npm version minor
   npm version major
   ```
3. Update `CHANGELOG.md` with the new version/date.
4. Push commit + tag:
   ```bash
   git push origin main
   git push origin --tags
   ```
5. Publish package:
   ```bash
   npm run release:publish
   ```
6. Create a GitHub release using the same tag and changelog notes.
