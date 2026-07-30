#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"
manifest="$script_dir/artifacts.json"
destination="$repo_root/.artifacts/ffprobe/linux-x64"
target="$destination/ffprobe"

read_field() {
  node -e 'const fs=require("node:fs");const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));console.log(m.artifacts["linux-x64"][process.argv[2]]);' "$manifest" "$1"
}

url="$(read_field url)"
expected_sha="$(read_field sha256)"
filename="$(read_field filename)"
work_dir="$(mktemp -d)"
trap 'rm -rf -- "$work_dir"' EXIT
archive="$work_dir/$filename"

curl --fail --location --proto '=https' --tlsv1.2 --retry 3 --output "$archive" "$url"
printf '%s  %s\n' "$expected_sha" "$archive" | sha256sum --check --status

while IFS= read -r entry; do
  case "$entry" in
    /*|*'../'*|../*) echo 'Unsafe archive entry.' >&2; exit 1 ;;
  esac
done < <(tar -tf "$archive")

mkdir -p -- "$work_dir/extracted" "$destination"
tar -xJf "$archive" -C "$work_dir/extracted"
mapfile -t candidates < <(find "$work_dir/extracted" -type f -name ffprobe)
if [[ ${#candidates[@]} -ne 1 ]]; then
  echo 'Expected exactly one ffprobe binary.' >&2
  exit 1
fi
install -m 0755 -- "${candidates[0]}" "$target"
version_output="$("$target" -version)"
grep -Fq 'N-125365-g9a01c1cb6a' <<<"$version_output" || {
  echo 'Unexpected ffprobe build version.' >&2
  exit 1
}
printf '%s\n' "$target"
