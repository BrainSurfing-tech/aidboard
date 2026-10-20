#!/usr/bin/env bash
# Faux swarph (chantier 12, D40) : jamais le vrai swarph en test, jamais de réseau.
#   --version                              → 0.72.25
#   monitor start --as <cell> --deliver pull → journalise, pose un marqueur sous $SWARPH_STATE/<cell>/monitor.pid ; FAKE_SWARPH_EXIT
#   monitor stop                           → journalise, retire le marqueur
#   monitor status --json                  → FAKE_SWARPH_STATUS (fichier) s'il est posé, sinon déduit du marqueur ; FAKE_SWARPH_PENDING
#   spawn <cell> ... --dry-run             → la commande claude attendue (12.6)
# Chaque appel est journalisé dans FAKE_SWARPH_LOG (une ligne : les arguments).
printf '%s\n' "$*" >>"${FAKE_SWARPH_LOG:-/dev/null}"
if [ "$1" = "--version" ]; then
  echo "0.72.25"
  exit 0
fi
if [ "$1" = "monitor" ]; then
  cell=""
  for ((i = 1; i <= $#; i++)); do
    if [ "${!i}" = "--as" ]; then j=$((i + 1)); cell="${!j}"; fi
  done
  cell="${cell:-${SWARPH_SELF:-cell}}"
  marker="${SWARPH_STATE:-/tmp}/$cell/monitor.pid"
  case "$2" in
    start)
      if [ "${FAKE_SWARPH_EXIT:-0}" != "0" ]; then
        echo "monitor: cannot start" >&2
        exit "${FAKE_SWARPH_EXIT}"
      fi
      mkdir -p "$(dirname "$marker")"
      echo $$ >"$marker"
      exit 0
      ;;
    stop)
      rm -f "${SWARPH_STATE:-/tmp}"/*/monitor.pid
      exit 0
      ;;
    status)
      if [ -n "${FAKE_SWARPH_STATUS:-}" ] && [ -f "${FAKE_SWARPH_STATUS}" ]; then
        cat "${FAKE_SWARPH_STATUS}"
        exit 0
      fi
      if ls "${SWARPH_STATE:-/tmp}"/*/monitor.pid >/dev/null 2>&1; then
        printf '{"running": true, "pid": 4242, "pidfile_status": "alive", "observation_cursor": 0, "sinks": [{"name": "inbox", "pending": %s, "pending_from": null}], "state_dir": "%s"}\n' "${FAKE_SWARPH_PENDING:-0}" "${SWARPH_STATE:-/tmp}"
        exit 0
      fi
      printf '{"running": false, "pid": null, "pidfile_status": "missing", "observation_cursor": 0, "sinks": [], "state_dir": "%s"}\n' "${SWARPH_STATE:-/tmp}"
      exit 1
      ;;
  esac
fi
if [ "$1" = "spawn" ] && [[ " $* " != *" --dry-run "* ]]; then
  # la cell ouverte en PTY (12.6) : affiche ce que swarph passerait à claude et son environnement
  # utile, puis attend « quit » sur l'entrée, comme une session
  echo "FAKE_CELL cell=$2 args=${*:3}"
  echo "MESH_GATEWAY_URL=${MESH_GATEWAY_URL:-}"
  echo "SWARPH_STATE=${SWARPH_STATE:-}"
  echo "SWARPH_SELF=${SWARPH_SELF:-}"
  while IFS= read -r line; do
    [ "$line" = "quit" ] && exit 0
  done
  exit 0
fi
if [ "$1" = "spawn" ]; then
  echo "claude --name $2 --session-id 00000000-0000-4000-8000-000000000000"
  exit 0
fi
echo "fake-swarph : commande inconnue : $*" >&2
exit 2
