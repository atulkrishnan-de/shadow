#!/usr/bin/env python3
"""Dev server that refuses to let the browser cache anything.

Chrome will heuristically cache game.js when only Last-Modified is sent, which
during rapid iteration means you can be staring at a bug that was already fixed.

Also backs the level builder (builder.html): POST /api/save-levels writes the
body straight to levels.json in this directory, so the builder can save
without any other backend.
"""
import http.server, socketserver, sys, json, os, shutil, time

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    def log_message(self, *a): pass

    def do_POST(self):
        if self.path != '/api/save-levels':
            self.send_error(404); return
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length <= 0 or length > 8 * 1024 * 1024:
                raise ValueError('bad content length')
            body = self.rfile.read(length)
            data = json.loads(body)  # validate it's well-formed JSON before touching disk
            if not isinstance(data, dict) or 'rooms' not in data or 'hub' not in data:
                raise ValueError('expected {rooms, hub}')
            path = os.path.join(os.getcwd(), 'levels.json')
            if os.path.exists(path):
                shutil.copyfile(path, path + '.bak.' + str(int(time.time())))
            with open(path, 'w') as f:
                json.dump(data, f, indent=2)
            body_out = b'{"ok":true}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body_out)))
            self.end_headers()
            self.wfile.write(body_out)
        except Exception as e:
            msg = json.dumps({'ok': False, 'error': str(e)}).encode()
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8932
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", port), NoCache) as httpd:
    print(f"serving {port} with no-store")
    httpd.serve_forever()
