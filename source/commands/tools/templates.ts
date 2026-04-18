export function nodeTemplate(name: string, description: string): string {
  return `#!/usr/bin/env node

const TOOL_ACTION = process.env.TOOL_ACTION;

if (TOOL_ACTION === 'describe') {
  console.log(JSON.stringify({
    name: '${name}',
    description: '${description}',
    parameters: [],
    needsApproval: false,
  }, null, 2));
  process.exit(0);
}

if (TOOL_ACTION === 'execute') {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { data += chunk; });
  process.stdin.on('end', () => {
    const params = JSON.parse(data);
    // Your tool logic here
    console.log('Hello from ${name}');
    process.exit(0);
  });
}
`;
}

export function bashTemplate(name: string, description: string): string {
  return `#!/bin/bash

action="\${TOOL_ACTION}"

if [ "$action" = "describe" ]; then
  cat << 'EOF'
name: ${name}
description: ${description}
EOF
  exit 0
fi

if [ "$action" = "execute" ]; then
  # Read key-value params from stdin
  while IFS='=' read -r key value; do
    declare "$key"="$value"
  done
  # Your tool logic here
  echo "Hello from ${name}"
  exit 0
fi
`;
}

export function zshTemplate(name: string, description: string): string {
  return `#!/bin/zsh

action="\${TOOL_ACTION}"

if [ "$action" = "describe" ]; then
  cat << 'EOF'
name: ${name}
description: ${description}
EOF
  exit 0
fi

if [ "$action" = "execute" ]; then
  # Read key-value params from stdin
  while IFS='=' read -r key value; do
    declare "$key"="$value"
  done
  # Your tool logic here
  echo "Hello from ${name}"
  exit 0
fi
`;
}

export function textSchemaTemplate(name: string, description: string): string {
  return `name: ${name}
description: ${description}
`;
}

export function textCompanionTemplate(name: string): string {
  return `#!/bin/bash
# Companion script for ${name}.tool
# Modify this script to implement your tool logic

action="\${TOOL_ACTION}"

if [ "$action" = "execute" ]; then
  while IFS='=' read -r key value; do
    declare "$key"="$value"
  done
  echo "Hello from ${name}"
  exit 0
fi
`;
}
