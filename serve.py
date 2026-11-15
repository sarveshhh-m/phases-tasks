#!/usr/bin/env python3
"""Static server for the graph, plus read/write of ONE attached JSON file.

    python3 serve.py [--port 8765] [--file path/to/phases.json]

With --file, the app loads that file and writes every change (status, comments,
layout) back into it. Without --file it just serves the app (changes stay in the
browser). Listens on 127.0.0.1 only and rejects requests from other origins.
"""
import argparse, http.server, json, os, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8765)))
ap.add_argument("--file", default=os.environ.get("PHASES_FILE"))
args = ap.parse_args()
FILE = os.path.abspath(args.file) if args.file else None
PORT = args.port
ALLOWED_HOSTS = {f"localhost:{PORT}", f"127.0.0.1:{PORT}"}
os.chdir(HERE)


class Handler(http.server.SimpleHTTPRequestHandler):
    def _same_origin(self):
        if self.headers.get("Host", "") not in ALLOWED_HOSTS:      # blocks DNS rebinding
            return False
        origin = self.headers.get("Origin")
        return origin is None or origin.replace("http://", "") in ALLOWED_HOSTS

    def _send(self, code, body=b"", ctype="application/json", extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/phases":
            if not FILE or not self._same_origin():
                return self._send(404, b'{"error":"no file attached"}')
            try:
                with open(FILE, "rb") as f:
                    data = f.read()
            except OSError as e:
                return self._send(500, json.dumps({"error": str(e)}).encode())
            return self._send(200, data, extra={"X-File-Name": os.path.basename(FILE)})
        if path == "/favicon.ico":
            return self._send(204)
        return super().do_GET()

    def do_PUT(self):
        if self.path.split("?")[0] != "/api/phases" or not FILE or not self._same_origin():
            return self._send(404, b'{"error":"no file attached"}')
        try:
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            json.loads(body)                                          # refuse to write invalid JSON
        except Exception:
            return self._send(400, b'{"error":"invalid JSON"}')
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(FILE), prefix=".phases-", suffix=".tmp")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(body)
            os.replace(tmp, FILE)                                     # atomic: never a half-written file
        except OSError as e:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            return self._send(500, json.dumps({"error": str(e)}).encode())
        return self._send(200, b'{"ok":true}')

    def log_message(self, fmt, *a):
        if "/api/phases" in (a[0] if a else ""):                     # keep the console quiet
            return
        super().log_message(fmt, *a)


if __name__ == "__main__":
    if FILE and not os.path.isfile(FILE):
        sys.exit(f"File not found: {FILE}")
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Serving http://localhost:{PORT}" + (f"  — attached file: {FILE}" if FILE else "  — no file attached"))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
