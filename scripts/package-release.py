#!/usr/bin/env python3
"""Build the Marble Overload release ZIP from the current Git commit."""

import argparse
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[1]
ENTRY = "demo/v1/"
RELEASE = "1.0.0-rc.2"
SERVER_FILES = ("dashboard.html", "dashboard.js", "start.mjs", "storage.mjs")
ASSET_TYPES = {".html", ".js", ".css", ".png", ".svg", ".wav", ".ogg", ".m4a"}
ROOT_HTML = """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0; url=./demo/v1/">
  <link rel="icon" href="./demo/v1/assets/icon-192.png">
  <title>弹珠超载 · Marble Overload</title>
</head>
<body><a href="./demo/v1/">开始试玩 / Play Marble Overload</a></body>
</html>
"""

README = """# 弹珠超载 · Marble Overload

候选版本 1.0.0-rc.2。正式试玩入口为 `/demo/v1/`，发行包根地址会跳转至此。

## 本地启动

解包后在目录中运行 `node server/start.mjs`（Node.js 24 LTS）。默认监听
`127.0.0.1:4181`，用浏览器打开 `http://127.0.0.1:4181/`。
也可把解包目录放到静态 HTTP 主机，保留 `demo/v1/` 路径和音频 MIME。
默认关闭统计和广告。静态站点只需发布 `index.html` 和 `demo/v1/`。

启用统计需要 Node 服务，并设置 `PINBALL_ANALYTICS=1`、
`PINBALL_ORIGIN`（公开站点 origin）、`PINBALL_DASHBOARD_TOKEN`（至少 24 字符）、
`PINBALL_OPERATOR`、`PINBALL_PRIVACY_CONTACT`、`PINBALL_STORAGE_REGION` 和
`PINBALL_DB`（解包目录外的绝对路径）。后台入口是 `/analytics/`。
反向代理应支持 HTTPS、同源 API 和音频 Range。Token 和数据库应独立存放。

## 校验与回滚

解包后执行 `shasum -a 256 -c SHA256SUMS`。部署前保存当前版本目录和配置，
将新包解到独立目录。回滚时把站点或 Node 进程的版本指向上一已验收目录，
使用该版本原配置，重启服务并重新验证入口、静态资源和实际开局。
数据库位于版本目录之外，在此过程中保留。
"""


def add_file(archive, checksums, name, content):
    entry = ZipInfo(name, date_time=(2026, 11, 19, 0, 0, 0))
    entry.compress_type = ZIP_DEFLATED
    entry.external_attr = 0o100644 << 16
    archive.writestr(entry, content)
    checksums.append(f"{hashlib.sha256(content).hexdigest()}  {name}")


def package(output):
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    source = subprocess.check_output(
        ["git", "archive", "--format=tar", head, "demo/v1", "server"], cwd=ROOT
    )
    payload = {}
    with tarfile.open(fileobj=io.BytesIO(source)) as snapshot:
        for member in snapshot:
            if not member.isfile():
                continue
            path = Path(member.name)
            if member.name in {f"server/{name}" for name in SERVER_FILES} or (
                member.name.startswith(ENTRY) and path.suffix in ASSET_TYPES
                and all(not part.startswith(".") for part in path.parts)
            ):
                payload[member.name] = snapshot.extractfile(member).read()
    for name in SERVER_FILES:
        if not payload.get(f"server/{name}"):
            raise ValueError(f"Missing release file: server/{name}")
    for name in ("index.html", "boot.js", "game.js", "builds.js", "runtime.js",
                 "analytics.js", "ad-bridge.js", "privacy.html", "assets/icon-192.png"):
        if not payload.get(ENTRY + name):
            raise ValueError(f"Missing release file: {ENTRY}{name}")
    metadata = {"version": RELEASE, "entry": ENTRY, "sourceHead": head,
                "source": "git commit", "analyticsDefault": False, "adsDefault": False}
    payload.update({
        "index.html": ROOT_HTML.encode(),
        "README.md": README.encode(),
        "release.json": (json.dumps(metadata, indent=2) + "\n").encode(),
    })
    with ZipFile(output, mode="x") as archive:
        checksums = []
        for name, content in sorted(payload.items()):
            add_file(archive, checksums, name, content)
        add_file(archive, [], "SHA256SUMS", ("\n".join(checksums) + "\n").encode())
    print(f"{output} ({len(payload)} checksummed files, entry /{ENTRY})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="path to a new .zip file")
    package(parser.parse_args().output)
