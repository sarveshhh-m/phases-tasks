#!/usr/bin/env python3
"""Static server for the graph, plus read/write of ONE attached JSON file.

    python3 serve.py [--port 8765] [--file path/to/phases.json]

The attached file can be given on the command line OR chosen later from the page
(works in every browser, including Safari, which has no file-picker API):
  POST /api/pick    macOS: opens the native file chooser and attaches the chosen .json
  POST /api/attach  {"path": "~/proj/phases.json"} attaches that file
  DELETE /api/attach  detaches
Every change the app makes is written back into the attached file.
Listens on 127.0.0.1 only, rejects other origins, and only attaches existing .json
files inside your home folder.
"""
import argparse, http.server, json, os, subprocess, sys, tempfile, threading

HERE = os.path.dirname(os.path.abspath(__file__))
HOME = os.path.realpath(os.path.expanduser("~"))
ap = argparse.ArgumentParser()
ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8765)))
ap.add_argument("--file", default=os.environ.get("PHASES_FILE"))
args = ap.parse_args()
PORT = args.port
ALLOWED_HOSTS = {f"localhost:{PORT}", f"127.0.0.1:{PORT}"}
CAN_PICK = sys.platform == "darwin"
os.chdir(HERE)
_lock = threading.Lock()
FILE = None


def resolve(path):
    """Return a safe absolute path or raise ValueError."""
    p = os.path.realpath(os.path.expanduser((path or "").strip().strip("\"'")))
    if not p.lower().endswith(".json") or not os.path.isfile(p):
        raise ValueError("that is not an existing .json file")
    if p != HOME and not p.startswith(HOME + os.sep):
        raise ValueError("the file must be inside your home folder")
    return p


def set_file(p):
    global FILE
    with _lock:
        FILE = p


def native_pick():
    """macOS file chooser. Returns a path, '' if cancelled, raises on error."""
    script = [
        'tell application "System Events"',
        "activate",                                           # otherwise the dialog can open behind other windows
        'set f to choose file with prompt "Choose the phases JSON file" of type {"public.json"}',
        "POSIX path of f",
        "end tell",
    ]
    cmd = ["osascript"] + [x for line in script for x in ("-e", line)]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if r.returncode == 0:
        return r.stdout.strip()
    if "-128" in r.stderr or "User canceled" in r.stderr:
        return ""
    raise RuntimeError(r.stderr.strip() or "file chooser failed")


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

    def _json(self, code, obj):
        self._send(code, json.dumps(obj).encode())

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _body(self):
        n = int(self.headers.get("Content-Length", 0) or 0)
        return self.rfile.read(n) if n else b""

    # ---- GET
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/info":
            if not self._same_origin():
                return self._json(404, {"error": "not found"})
            return self._json(200, {"attached": bool(FILE), "name": os.path.basename(FILE) if FILE else None, "pick": CAN_PICK})
        if path == "/api/phases":
            if not FILE or not self._same_origin():
                return self._json(404, {"error": "no file attached"})
            try:
                with open(FILE, "rb") as f:
                    data = f.read()
            except OSError as e:
                return self._json(500, {"error": str(e)})
            return self._send(200, data, extra={"X-File-Name": os.path.basename(FILE)})
        if path == "/favicon.ico":
            return self._send(204)
        return super().do_GET()

    # ---- PUT: save changes into the attached file
    def do_PUT(self):
        if self.path.split("?")[0] != "/api/phases" or not FILE or not self._same_origin():
            return self._json(404, {"error": "no file attached"})
        try:
            body = self._body()
            json.loads(body)                                          # refuse to write invalid JSON
        except Exception:
            return self._json(400, {"error": "invalid JSON"})
        target = FILE
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(target), prefix=".phases-", suffix=".tmp")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(body)
            os.replace(tmp, target)                                   # atomic: never a half-written file
        except OSError as e:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            return self._json(500, {"error": str(e)})
        return self._json(200, {"ok": True})

    # ---- POST: choose / attach a file
    def do_POST(self):
        path = self.path.split("?")[0]
        if path not in ("/api/pick", "/api/attach") or not self._same_origin():
            return self._json(404, {"error": "not found"})
        try:
            if path == "/api/pick":
                if not CAN_PICK:
                    return self._json(501, {"error": "the native file chooser is only available on macOS; use attach by path"})
                chosen = native_pick()
                if not chosen:
                    return self._send(204)                            # cancelled
            else:
                chosen = (json.loads(self._body() or b"{}")).get("path", "")
            p = resolve(chosen)
        except ValueError as e:
            return self._json(400, {"error": str(e)})
        except subprocess.TimeoutExpired:
            return self._json(408, {"error": "file chooser timed out"})
        except Exception as e:
            return self._json(500, {"error": str(e)})
        set_file(p)
        return self._json(200, {"name": os.path.basename(p)})

    def do_DELETE(self):
        if self.path.split("?")[0] != "/api/attach" or not self._same_origin():
            return self._json(404, {"error": "not found"})
        set_file(None)
        return self._json(200, {"ok": True})

    def log_message(self, fmt, *a):
        if "/api/" in (a[0] if a else ""):                           # keep the console quiet
            return
        super().log_message(fmt, *a)


if __name__ == "__main__":
    if args.file:
        try:
            set_file(resolve(args.file))
        except ValueError as e:
            sys.exit(f"{args.file}: {e}")
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Serving http://localhost:{PORT}" + (f"  — attached file: {FILE}" if FILE else "  — no file attached"))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
