#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if (( $# < 1 )); then
  echo "Usage: $0 <prompt-file>" >&2
  exit 1
fi

prompt_file="$1"

if [[ ! -f "$prompt_file" ]]; then
  echo "Error: prompt file not found: $prompt_file" >&2
  exit 1
fi

while true; do
  output_file=$(mktemp)

  set +e
  cake - < "$prompt_file" 2>&1 | tee "$output_file"
  status=${PIPESTATUS[0]}
  set -e

  if (( status != 0 )); then
    rm -f "$output_file"
    exit "$status"
  fi

  if grep -qF '[DONE]' "$output_file"; then
    rm -f "$output_file"
    exit 0
  fi

  rm -f "$output_file"
done
