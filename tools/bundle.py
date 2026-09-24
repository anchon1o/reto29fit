#!/usr/bin/env python3
"""Genera UN solo HTML autocontenido en MODO DEMO (sin Supabase, router en memoria).
Sirve para probar la web dentro de una vista previa/iframe o abriendo el archivo con doble clic.
Uso: python3 tools/bundle.py  →  dist/reto29-demo.html"""
import re, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
orden = ['util', 'image', 'backend-vercel', 'backend-demo', 'store', 'ui', 'admin', 'main']   # dependencias primero
js = []
for m in orden:
    s = open(f'{R}/js/{m}.js', encoding='utf8').read()
    s = re.sub(r'^import .*?;\s*$', '', s, flags=re.M)          # todos los import son de una línea
    s = re.sub(r'^export (?=(async function|function|const|let|class)\b)', '', s, flags=re.M)
    assert 'import(' not in s and not re.search(r'^\s*(import|export) ', s, flags=re.M), m
    js.append(f'// ===== {m}.js =====\n{s}')
js = '\n'.join(js); assert '</script' not in js
css = open(f'{R}/css/app.css', encoding='utf8').read()
html = f'''<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><title>RETO 29 · FIT 2026 (demo)</title>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{css}</style></head>
<body><div id="app"><div class="boot">f!t</div></div><div id="toast" role="status" aria-live="polite"></div>
<script>window.RETO29_CONFIG = {{ MODO: "demo", ROUTER: "memory" }};</script>
<script>(() => {{
{js}
}})();</script></body></html>'''
os.makedirs(f'{R}/dist', exist_ok=True)
open(f'{R}/dist/reto29-demo.html', 'w', encoding='utf8').write(html)
print('dist/reto29-demo.html', len(html) // 1024, 'KB')
