#!/usr/bin/env bash
set -e
cd /home/iwetan/lofi-climb/packages/sui
ADDR=0x20af017ce1efd98c3572537104c436bd96ab2fa31c090ed2f938f4a94c8c42dd
PK=$(sui keytool export --key-identity "$ADDR" --json 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("exportedPrivateKey") or (d.get("key") or {}).get("exportedPrivateKey",""))')
if [ -z "$PK" ]; then
  echo "KEY EXPORT FAILED — raw output:"
  sui keytool export --key-identity "$ADDR" --json 2>&1 | head -c 400
  exit 1
fi
SUI_PK="$PK" pnpm exec tsx scripts/realcycle.ts
