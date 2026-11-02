#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

rama=$(git rev-parse --abbrev-ref HEAD)
remoto=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)

if [ -z "$remoto" ]; then
  echo "La rama '$rama' no tiene remoto configurado." >&2
  exit 1
fi

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Hay cambios locales sin commitear; commitealos o guardalos antes de actualizar." >&2
  exit 1
fi

git fetch --quiet

if [ "$(git rev-parse HEAD)" = "$(git rev-parse '@{u}')" ]; then
  echo "'$rama' ya está al día con $remoto."
  exit 0
fi

if ! git merge-base --is-ancestor HEAD '@{u}'; then
  echo "'$rama' tiene commits que no están en $remoto; no se actualiza automáticamente." >&2
  exit 1
fi

git merge --ff-only '@{u}'
npm ci --no-audit --no-fund
echo "Actualizado. Reiniciá el servidor para aplicar los cambios."
