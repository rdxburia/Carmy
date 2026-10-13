#!/usr/bin/env bash
set -euo pipefail
mkdir -p _site
while IFS= read -r -d '' source; do
  name="$(basename "$source")"
  case "$name" in api-test.html|logo-preview.html) continue ;; esac
  if [[ ! -f "_site/$name" ]]; then
    echo "ERROR: root HTML page is not published: $name" >&2
    exit 1
  fi
  if ! cmp -s "$source" "_site/$name"; then
    echo "ERROR: published page differs from source: $name" >&2
    exit 1
  fi
done < <(find . -maxdepth 1 -type f -name '*.html' -print0)
for dev_page in api-test.html logo-preview.html; do
  if [[ -e "_site/$dev_page" ]]; then
    echo "ERROR: developer-only page must not be deployed: $dev_page" >&2
    exit 1
  fi
done
echo "Pages output check passed."
