#!/usr/bin/env bash
set -euo pipefail

metadata=(
  --prerelease
  --latest=false
  --title "$RELEASE_TITLE"
  --notes-file release-notes.md
)

if draft=$(gh release view "$GITHUB_REF_NAME" --json isDraft --jq '.isDraft'); then
  if [[ "$draft" == false ]]; then
    # Published releases can be immutable. Reruns verify without changing assets or release status.
    gh api "repos/$GITHUB_REPOSITORY/releases/tags/$GITHUB_REF_NAME" > release-state.json
    node scripts/release-downloads.mjs verify-published release-state.json
    echo 'The published release already contains the verified downloads.'
    exit 0
  fi
  gh release upload "$GITHUB_REF_NAME" release-downloads/* --clobber
else
  gh release create "$GITHUB_REF_NAME" release-downloads/* --draft --verify-tag "${metadata[@]}"
fi

# Verify the replacement before removing legacy metadata from an unpublished draft.
verification=(release-downloads/*-verification.zip)
test "${#verification[@]}" = 1
gh release download "$GITHUB_REF_NAME" --pattern "$(basename "${verification[0]}")" --dir verification-download
cmp "${verification[0]}" "verification-download/$(basename "${verification[0]}")"
assets=$(gh release view "$GITHUB_REF_NAME" --json assets --jq '.assets[].name')
for file in release-assets/manifest-*.json release-assets/SHA256SUMS; do
  asset=$(basename "$file")
  if grep -Fxq -- "$asset" <<< "$assets"; then
    gh release delete-asset "$GITHUB_REF_NAME" "$asset" --yes
  fi
done

gh api "repos/$GITHUB_REPOSITORY/releases/tags/$GITHUB_REF_NAME" > release-state.json
node scripts/release-downloads.mjs verify-published release-state.json
gh release edit "$GITHUB_REF_NAME" --draft=false "${metadata[@]}"
