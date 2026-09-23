#!/bin/sh
# Starts LoopBox, then open http://127.0.0.1:3000
cd "$(dirname "$0")" && exec node start.mjs
