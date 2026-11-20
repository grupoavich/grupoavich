#!/bin/sh
# Arma la carpeta "dist" con SOLO lo público (así plugin/, tools/, functions/ y la guía no se publican).
set -e
rm -rf dist
mkdir dist
cp -r index.html 3d sistemas assets admin legal mi-cuenta _headers dist/
