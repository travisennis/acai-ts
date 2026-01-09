#!/bin/bash

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  exit 1
fi

for ((i=1; i<=$1; i++)); do
  result=$(node --no-warnings --experimental-vm-modules --env-file=$HOME/Projects/acai-ts/.env $HOME/Projects/acai-ts/source/index.ts -p "$(cat refactor-commands-prompt.md)")

  echo "$result"

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "task complete, exiting."
    exit 0
  fi
done
