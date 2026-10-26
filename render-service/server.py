#!/usr/bin/env python3
"""The cuisine render & copilot service — stdlib only, so it runs anywhere Python 3.10+ does.

Endpoints (the app's 3D view calls these):
  GET  /health   -> {"ok": true, "blender": bool, "copilot": bool}
  POST /render   <- {"scene": <cuisine-render-scene>, "quality": "fast"|"final"} -> {"images": {"hero": "<base64 png>", ...}}
  POST /copilot  <- {"question": str, "project": {...summary...}, "audit": [...]} -> {"answer": str}

Run modes (see README.md): local Blender, Docker, GPU cloud, own server.
Env: PORT (8787), BLENDER_BIN (blender), TEXTURES_DIR (the project's public/textures), ANTHROPIC_API_KEY, COPILOT_MODEL.
"""
import base64, json, os, shutil, subprocess, sys, tempfile, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BLENDER = os.environ.get('BLENDER_BIN', 'blender')
TEXTURES = os.environ.get('TEXTURES_DIR', '')
HERE = os.path.dirname(os.path.abspath(__file__))


def run_render(scene, quality):
    with tempfile.TemporaryDirectory() as tmp:
        scene_path = os.path.join(tmp, 'scene.json')
        outdir = os.path.join(tmp, 'out')
        with open(scene_path, 'w', encoding='utf-8') as fh:
            json.dump(scene, fh)
        cmd = [BLENDER, '-b', '--python', os.path.join(HERE, 'blender_render.py'), '--', scene_path, outdir, quality]
        if TEXTURES:
            cmd.append(TEXTURES)
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        images = {}
        if os.path.isdir(outdir):
            for name in sorted(os.listdir(outdir)):
                if name.endswith('.png'):
                    with open(os.path.join(outdir, name), 'rb') as fh:
                        images[name[:-4]] = base64.b64encode(fh.read()).decode()
        if not images:
            raise RuntimeError('Blender produced no image. Log tail: ' + (proc.stdout + proc.stderr)[-1500:])
        return images


def run_copilot(body):
    key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not key:
        raise RuntimeError('لم يُضبط مفتاح الذكاء الاصطناعي على الخادم (ANTHROPIC_API_KEY). التدقيق المحلي في التطبيق يعمل بدونه.')
    project = json.dumps(body.get('project', {}), ensure_ascii=False)[:24000]
    audit = json.dumps(body.get('audit', []), ensure_ascii=False)[:8000]
    prompt = (
        'أنت مهندس مطابخ محترف يراجع تصميمًا حقيقيًا من تطبيق تصميم. بيانات المشروع (JSON):\n' + project +
        '\nنتائج التدقيق الحتمي:\n' + audit + '\nسؤال المستخدم: ' + str(body.get('question', '')) +
        '\nأجب بالعربية، بدقة تقنية (مقاسات بالمليمتر)، وميّز بين حقيقة من البيانات واقتراح من عندك. لا تخترع خزائن غير موجودة.'
    )
    payload = json.dumps({
        'model': os.environ.get('COPILOT_MODEL', 'claude-sonnet-4-5'),
        'max_tokens': 1500,
        'messages': [{'role': 'user', 'content': prompt}],
    }).encode()
    req = urllib.request.Request('https://api.anthropic.com/v1/messages', data=payload, headers={
        'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json',
    })
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read())
    return ''.join(part.get('text', '') for part in data.get('content', []))


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(200, {})

    def do_GET(self):
        if self.path == '/health':
            self._send(200, {'ok': True, 'blender': shutil.which(BLENDER) is not None, 'copilot': bool(os.environ.get('ANTHROPIC_API_KEY'))})
        else:
            self._send(404, {'error': 'not found'})

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', '0'))
            body = json.loads(self.rfile.read(length) or b'{}')
            if self.path == '/render':
                self._send(200, {'images': run_render(body['scene'], body.get('quality', 'fast'))})
            elif self.path == '/copilot':
                self._send(200, {'answer': run_copilot(body)})
            else:
                self._send(404, {'error': 'not found'})
        except Exception as exc:  # one honest Arabic sentence beats a stack trace in the user's face
            self._send(500, {'error': str(exc)[:600]})

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8787'))
    print(f'cuisine render service on :{port} (blender={shutil.which(BLENDER)}, copilot={bool(os.environ.get("ANTHROPIC_API_KEY"))})')
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
