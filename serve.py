"""Local dev server for HEAT CHECK!

Same as `python3 -m http.server`, but tells the browser never to cache, so after an update
the browser can't mix new and old copies of the game's files (which once froze a game).

    python3 serve.py          # http://localhost:5173
    python3 serve.py 8080     # another port

If a browser ever shows an old copy anyway, open http://localhost:5173/?clear once to wipe its cache for the site.
"""
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        # Opening the page with ?clear (e.g. http://localhost:5173/?clear) also wipes anything the browser cached
        # before this server existed. Only on request: Chrome holds the page until the clear finishes, which can
        # take 30+ seconds with a big cache, so sending it on every load made every reload crawl.
        path, _, query = self.path.partition('?')
        if (path.endswith('/') or path.endswith('.html')) and 'clear' in query.split('&'):
            self.send_header('Clear-Site-Data', '"cache"')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    print(f'HEAT CHECK! on http://localhost:{port}')
    http.server.ThreadingHTTPServer(('', port), NoCacheHandler).serve_forever()
