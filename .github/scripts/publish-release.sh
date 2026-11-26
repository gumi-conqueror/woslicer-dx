#!/usr/bin/env bash
# Publishes release-downloads/ as the GitHub release of $GITHUB_REF_NAME.
# Reruns are safe: an unpublished draft is completed, a published release is only verified.
set -euo pipefail

tag="$GITHUB_REF_NAME"
draft_metadata=(--title "$RELEASE_TITLE" --notes-file release-notes.md)
# A version with a prerelease part (2.0.0-alpha.1) is a prerelease and never becomes Latest.
# GitHub cannot mark a draft as Latest, so that flag is set when the draft is published.
if [[ "$tag" == *-* ]]; then
  draft_metadata+=(--prerelease)
  release_metadata=("${draft_metadata[@]}" --latest=false)
else
  draft_metadata+=(--prerelease=false)
  release_metadata=("${draft_metadata[@]}" --latest)
fi

# `gh release view` also finds drafts; the REST "release by tag" endpoint does not.
if ! draft=$(gh release view "$tag" --json isDraft --jq '.isDraft' 2> /dev/null); then
  gh release create "$tag" release-downloads/* --draft --verify-tag "${draft_metadata[@]}"
  draft=true
elif [[ "$draft" == true ]]; then
  gh release upload "$tag" release-downloads/* --clobber
fi

# The release must hold exactly the verified downloads before and after publication.
gh release view "$tag" --json assets > release-state.json
node scripts/release-downloads.mjs verify-published release-state.json

if [[ "$draft" == true ]]; then
  gh release edit "$tag" --draft=false "${release_metadata[@]}"
else
  # Published releases are immutable; their flags and notes stay as they are.
  echo 'The published release already contains the verified downloads.'
fi
