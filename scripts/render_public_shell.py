#!/usr/bin/env python3
"""Render shared Torq Desk header/footer into public HTML at build time (no client layout shift)."""
from pathlib import Path
import re, sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else "_site")
repo_root = Path(__file__).resolve().parents[1]
header = (repo_root / "partials" / "public-header.html").read_text(encoding="utf-8").strip()
footer = (repo_root / "partials" / "public-footer.html").read_text(encoding="utf-8").strip()
pages = ["index.html", "features.html", "how-it-works.html", "pricing.html",
         "for-workshops.html", "faq.html", "about.html", "terms.html",
         "privacy.html", "contact.html", "garage-login.html", "garage-portal.html"]
for name in pages:
    path = root / name
    if not path.exists():
        raise SystemExit(f"Missing public page: {name}")
    html = path.read_text(encoding="utf-8")
    html = html.replace("<!-- TD_SHARED_HEADER -->", header)
    html = html.replace("<!-- TD_SHARED_FOOTER -->", footer)
    active = name
    html = re.sub(r'(<a\b[^>]*data-nav-page="' + re.escape(active) + r'"[^>]*)>', r'\1 aria-current="page">', html)
    if "<!-- TD_SHARED_HEADER -->" in html or "<!-- TD_SHARED_FOOTER -->" in html:
        raise SystemExit(f"Unrendered shared shell marker in {name}")
    path.write_text(html, encoding="utf-8")
print("Shared public header/footer rendered for " + ", ".join(pages))
