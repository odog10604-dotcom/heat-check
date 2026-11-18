"""Build the deployable site into dist/.

    python3 build.py

Why this exists: the game is plain files with no bundler, and browsers and CDNs cache files one by one. If you
upload a new version in place, a returning player can end up running a new game.js against an old audio.js
(this froze a game during development). So every build puts ALL code and styles under one folder named after
the build:

    dist/index.html              tiny, never cached, points at the current build folder
    dist/v-<build>/css/...       cached forever: a new build is a new folder, so nothing is ever mixed
    dist/v-<build>/js/...
    dist/manifest.webmanifest    name, colours and icons for "Add to Home Screen"
    dist/site/...                icons and the link-preview image (stable addresses: other sites keep copies)
    dist/sw.js                   offline play (see OFFLINE below)
    dist/robots.txt, sitemap.xml, 404.html
    dist/_headers                cache + security headers (Netlify / Cloudflare Pages format; adapt for other hosts)

Upload the contents of dist/. Old build folders can stay online for players mid-game and be deleted later.

SITE DETAILS live in site.json: the public address, name, description and colours. This script turns them into
the <head> block of index.html and the manifest, so they are written in exactly one place. It also refreshes the
copies in the source folder (the block between the `site:head` markers, and manifest.webmanifest), without an
address, so local development shows the same title and icons.

ANALYTICS: the Google Analytics 4 measurement id comes from the GA4_MEASUREMENT_ID environment variable (set it in
Vercel: Project Settings > Environment Variables, then redeploy), or else from "ga4" in site.json. It is written into
dist/index.html only, as <meta name="hc-ga4">; without it analytics is off. The source folder never gets it, so local
development never sends anything. See docs/ANALYTICS.md.

Until "url" is set in site.json the build still works, but leaves out everything that needs a full address:
the canonical link, og:url, the preview image and the sitemap.

OFFLINE: with "offline": true the build writes a service worker that keeps one copy of this build on the device,
so the game opens with no connection. It exists only in dist/ and is never registered in development. The page
itself always comes from the network when there is one, and code lives in versioned folders, so it cannot serve a
stale mix. Set "offline": false and deploy to switch it off everywhere: sw.js then removes itself.
"""
import hashlib
import json
import os
import re
import shutil
import sys
from html import escape
from pathlib import Path

ROOT = Path(__file__).parent
DIST = ROOT / 'dist'
SOURCES = ['css', 'js']
HEAD_OPEN = '<!-- site:head (written by build.py from site.json: edit site.json, not this block) -->'
HEAD_CLOSE = '<!-- /site:head -->'
ICONS = ['favicon.ico', 'favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']


def load_site():
    site = json.loads((ROOT / 'site.json').read_text())
    url = (site.get('url') or '').strip().rstrip('/')
    if url and not url.startswith('https://'):
        sys.exit('build.py: "url" in site.json must start with https:// (or be empty until there is a domain)')
    site['url'] = url
    missing = [f for f in ICONS + [Path(site['shareImage']['path']).name] if not (ROOT / 'site' / f).is_file()]
    if missing:
        sys.exit(f'build.py: missing in site/: {", ".join(missing)} (run python3 tools/make_site_images.py)')
    return site


def ga4_id(site):
    """GA4 measurement id: GA4_MEASUREMENT_ID from the environment, else "ga4" in site.json, else '' (analytics off)."""
    gid = (os.environ.get('GA4_MEASUREMENT_ID') or site.get('ga4') or '').strip()
    if gid and not re.fullmatch(r'G-[A-Z0-9]{4,20}', gid):
        sys.exit(f'build.py: GA4 measurement id {gid!r} is not of the form G-XXXXXXXXXX')
    return gid


def head_block(site, url, ga4=''):
    """Everything in <head> that describes the site. `url` empty = no absolute addresses (local development)."""
    a = lambda v: escape(str(v), quote=True)
    img = site['shareImage']
    lines = [
        HEAD_OPEN,
        f'<title>{escape(site["title"])}</title>',
        f'<meta name="description" content="{a(site["description"])}">',
        f'<meta name="application-name" content="{a(site["name"])}">',
        f'<meta name="theme-color" content="{a(site["themeColor"])}">',
        '<meta name="mobile-web-app-capable" content="yes">',
        '<meta name="apple-mobile-web-app-capable" content="yes">',
        f'<meta name="apple-mobile-web-app-title" content="{a(site["shortName"])}">',
        '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
        '<meta name="format-detection" content="telephone=no">',
        '<link rel="manifest" href="manifest.webmanifest">',
        '<link rel="icon" href="site/favicon.ico" sizes="48x48">',
        '<link rel="icon" href="site/favicon.png" type="image/png" sizes="96x96">',
        '<link rel="apple-touch-icon" href="site/apple-touch-icon.png">',
        '<meta property="og:type" content="website">',
        f'<meta property="og:site_name" content="{a(site["name"])}">',
        f'<meta property="og:title" content="{a(site["title"])}">',
        f'<meta property="og:description" content="{a(site["description"])}">',
        f'<meta property="og:locale" content="{a(site["locale"])}">',
    ]
    if ga4:
        lines.append(f'<meta name="hc-ga4" content="{a(ga4)}">')
    if url:
        lines += [
            f'<link rel="canonical" href="{a(url)}/">',
            f'<meta property="og:url" content="{a(url)}/">',
            f'<meta property="og:image" content="{a(url)}/{a(img["path"])}">',
            f'<meta property="og:image:width" content="{a(img["width"])}">',
            f'<meta property="og:image:height" content="{a(img["height"])}">',
            f'<meta property="og:image:alt" content="{a(img["alt"])}">',
            '<meta name="twitter:card" content="summary_large_image">',
        ]
        if site.get('twitterSite'):
            lines.append(f'<meta name="twitter:site" content="{a(site["twitterSite"])}">')
    else:
        lines.append('<meta name="twitter:card" content="summary">')
    return '\n'.join(lines + [HEAD_CLOSE])


def with_head(html, block):
    try:
        i, j = html.index(HEAD_OPEN), html.index(HEAD_CLOSE) + len(HEAD_CLOSE)
    except ValueError:
        sys.exit('build.py: index.html has lost its <!-- site:head --> … <!-- /site:head --> markers')
    return html[:i] + block + html[j:]


def manifest(site):
    return json.dumps({
        'name': site['name'], 'short_name': site['shortName'], 'description': site['description'],
        'id': './', 'start_url': './', 'scope': './', 'display': 'standalone',
        'background_color': site['backgroundColor'], 'theme_color': site['themeColor'],
        'lang': site['lang'], 'categories': ['games', 'sports'],
        'icons': [
            {'src': 'site/icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
            {'src': 'site/icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
            {'src': 'site/icon-maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
        ],
    }, indent=2, ensure_ascii=False) + '\n'


def write_if_changed(path, text):
    if not path.exists() or path.read_text() != text:
        path.write_text(text)
        return True
    return False


def sync_source(site):
    """Keep the source folder's own copies (no public address) in step with site.json."""
    changed = [p.name for p, text in (
        (ROOT / 'index.html', with_head((ROOT / 'index.html').read_text(), head_block(site, ''))),
        (ROOT / 'manifest.webmanifest', manifest(site)),
    ) if write_if_changed(p, text)]
    if changed:
        print(f'updated from site.json: {", ".join(changed)}')


def build_id():
    h = hashlib.sha1()
    files = sorted(p for d in SOURCES + ['site'] for p in (ROOT / d).rglob('*') if p.is_file() and p.name != '.DS_Store')
    for p in files + [ROOT / 'index.html', ROOT / 'site.json']:
        h.update(str(p.relative_to(ROOT)).encode())
        h.update(p.read_bytes())
    return h.hexdigest()[:10]


SW_ON = """// Written by build.py. Offline play for build %(build)s. Do not edit: change build.py.
// The page always comes from the network when there is one. Code is in a folder named after the build, so a cached
// file can never be an old version of itself.
const CACHE = 'heatcheck-%(build)s';
const FILES = %(files)s;
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('heatcheck-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;   // never touch API calls or other sites
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.open(CACHE).then((c) => c.match('./')).then((r) => r || Response.error())));
    return;
  }
  e.respondWith(caches.open(CACHE).then((c) => c.match(req)).then((r) => r || fetch(req)));
});
"""

SW_OFF = """// Written by build.py with "offline": false. Removes the offline copy from browsers that have one.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('heatcheck-')).map((k) => caches.delete(k))))
    .then(() => self.registration.unregister()));
});
"""

NOT_FOUND = """<!doctype html>
<html lang="%(lang)s"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Airball — %(name)s</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:%(bg)s;color:#fff;text-align:center;
font:900 18px "Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif}h1{font-size:64px;margin:0;color:#ffd23f}
a{display:inline-block;margin-top:18px;padding:12px 22px;border-radius:18px;background:#ff7a1a;color:#fff;text-decoration:none}</style>
</head><body><div><h1>AIRBALL.</h1><p>That page isn't here.</p><a href="%(home)s">Play %(name)s</a></div></body></html>
"""


def main():
    site = load_site()
    sync_source(site)
    url, build = site['url'], build_id()
    folder = f'v-{build}'
    if DIST.exists():
        shutil.rmtree(DIST)
    (DIST / folder).mkdir(parents=True)
    for d in SOURCES:
        shutil.copytree(ROOT / d, DIST / folder / d, ignore=shutil.ignore_patterns('.DS_Store'))
    shutil.copytree(ROOT / 'site', DIST / 'site', ignore=shutil.ignore_patterns('.DS_Store'))

    ga4 = ga4_id(site)
    html = with_head((ROOT / 'index.html').read_text(), head_block(site, url, ga4))
    for ref in ('href="css/style.css"', 'src="js/boot.js"', 'src="js/main.js"'):
        if ref not in html:
            sys.exit(f'build.py: expected {ref} in index.html')
        html = html.replace(ref, ref.replace('="', f'="{folder}/'))
    if 'data-build="dev"' not in html:
        sys.exit('build.py: expected data-build="dev" on <html>')
    offline = bool(site.get('offline'))
    html = html.replace('data-build="dev"', f'data-build="{build}"' + (' data-offline="1"' if offline else ''))
    (DIST / 'index.html').write_text(html)
    (DIST / 'manifest.webmanifest').write_text(manifest(site))

    code = sorted(str(p.relative_to(DIST)) for p in (DIST / folder).rglob('*') if p.is_file())
    precache = ['./', 'manifest.webmanifest', 'site/favicon.ico', 'site/favicon.png', 'site/icon-192.png'] + code
    (DIST / 'sw.js').write_text(SW_ON % {'build': build, 'files': json.dumps(precache, indent=1)} if offline else SW_OFF)

    home = f'{url}/' if url else '/'
    (DIST / '404.html').write_text(NOT_FOUND % {'lang': site['lang'], 'name': escape(site['name']), 'bg': site['backgroundColor'], 'home': home})
    (DIST / 'robots.txt').write_text('User-agent: *\nAllow: /\n' + (f'Sitemap: {url}/sitemap.xml\n' if url else ''))
    if url:
        (DIST / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                          f'  <url><loc>{escape(url)}/</loc></url>\n</urlset>\n')
    (DIST / 'version.json').write_text(json.dumps({'build': build}) + '\n')
    (DIST / '_headers').write_text("""# Cache + security headers (Netlify / Cloudflare Pages syntax).
/
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/version.json
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
/manifest.webmanifest
  Cache-Control: no-cache
  Content-Type: application/manifest+json
/site/*
  Cache-Control: public, max-age=86400
/v-*
  Cache-Control: public, max-age=31536000, immutable
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
""")
    size = sum(p.stat().st_size for p in DIST.rglob('*') if p.is_file())
    print(f'built dist/  build {build}  {size / 1024:.0f} KB  offline {"on" if offline else "off"}  analytics {ga4 or "off (no GA4_MEASUREMENT_ID)"}')
    if not url:
        print('note: "url" in site.json is empty, so the canonical link, og:url, the link-preview image and sitemap.xml were left out')


if __name__ == '__main__':
    main()
