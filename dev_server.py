#!/usr/bin/env python3
"""Servidor local de pruebas con fallback SPA (como vercel.json).  Uso: python3 dev_server.py [puerto]"""
import http.server, os, sys
class H(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        p = self.translate_path(self.path.split('?')[0])
        if not os.path.isfile(p): self.path = '/index.html'
        return super().send_head()
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def log_message(self, *a): pass
os.chdir(os.path.dirname(os.path.abspath(__file__)))
http.server.ThreadingHTTPServer(('0.0.0.0', int(sys.argv[1]) if len(sys.argv) > 1 else 5173), H).serve_forever()
