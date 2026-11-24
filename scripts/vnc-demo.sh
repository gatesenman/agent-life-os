#!/usr/bin/env bash
# 在 Linux 上启动一台“本机 VNC 演示电脑”：Xvfb 虚拟显示 + Chrome（打开演示网页）+ x11vnc
# 用法：bash scripts/vnc-demo.sh [显示号=57] [端口=5957] [密码(可选)]
# 依赖：Xvfb、x11vnc、google-chrome 或 chromium。停止：bash scripts/vnc-demo.sh stop [显示号=57]
set -e
if [ "$1" = "stop" ]; then S=${2:-57}; pkill -f "Xvfb :$S " || true; pkill -f "x11vnc -display :$S " || true; pkill -f "alos-vnc-chrome-$S" || true; exit 0; fi
D=${1:-57}; PORT=${2:-5957}; PASS=${3:-}
HERE=$(cd "$(dirname "$0")" && pwd)
Xvfb :$D -screen 0 1280x800x24 -nolisten tcp >/tmp/alos-xvfb-$D.log 2>&1 &
sleep 1
BROWSER=$(command -v google-chrome || command -v chromium || command -v chromium-browser)
DISPLAY=:$D "$BROWSER" --no-sandbox --no-first-run --disable-gpu --lang=zh-CN --disable-features=Translate,TranslateUI --disable-translate --user-data-dir=/tmp/alos-vnc-chrome-$D --window-position=0,0 --window-size=1280,800 --app="file://$HERE/vnc-demo/index.html" >/tmp/alos-chrome-$D.log 2>&1 &
sleep 2
if [ -n "$PASS" ]; then x11vnc -storepasswd "$PASS" /tmp/alos-vnc-$D.pass >/dev/null 2>&1; AUTH="-rfbauth /tmp/alos-vnc-$D.pass"; else AUTH="-nopw"; fi
x11vnc -display :$D -localhost -rfbport $PORT -forever -shared -quiet $AUTH >/tmp/alos-x11vnc-$D.log 2>&1 &
sleep 1
echo "VNC 演示电脑已启动：127.0.0.1:$PORT（显示 :$D）${PASS:+，密码已设置}"
