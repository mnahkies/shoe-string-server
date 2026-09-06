#!/usr/bin/env bash

set -e

__dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

pushd "$__dir"

mkdir -p ./json
mkdir -p ./haproxy-lua-http

curl -Lf --write-out "Fetching URL: %{url_effective}\n" https://raw.githubusercontent.com/rxi/json.lua/master/json.lua -o ./json/json.lua
curl -Lf --write-out "Fetching URL: %{url_effective}\n" https://raw.githubusercontent.com/haproxytech/haproxy-lua-http/master/http.lua -o ./haproxy-lua-http/http.lua
curl -Lf --write-out "Fetching URL: %{url_effective}\n" https://raw.githubusercontent.com/TimWolla/haproxy-auth-request/main/auth-request.lua -o ./auth-request.lua

popd
