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
  if grep -q 'TD_SHARED_HEADER\|TD_SHARED_FOOTER' "_site/$name"; then
    echo "ERROR: shared shell marker was not rendered in $name" >&2
    exit 1
  fi
done < <(find . -maxdepth 1 -type f -name '*.html' -print0)
for page in index.html features.html how-it-works.html pricing.html for-workshops.html faq.html about.html terms.html privacy.html contact.html garage-login.html garage-portal.html; do
  if ! grep -q 'td-shared-header' "_site/$page"; then
    echo "ERROR: shared header missing from deployed $page" >&2
    exit 1
  fi
  if ! grep -q 'td-shared-footer' "_site/$page"; then
    echo "ERROR: shared footer missing from deployed $page" >&2
    exit 1
  fi
done
for dev_page in api-test.html logo-preview.html; do
  if [[ -e "_site/$dev_page" ]]; then
    echo "ERROR: developer-only page must not be deployed: $dev_page" >&2
    exit 1
  fi
done
echo "Pages output check passed."
