#!/usr/bin/env bash
# Faux Tailscale (chantier 12, D37/D40). L'état vient de FAKE_TAILSCALE_STATEFILE (Running/Stopped) s'il est
# posé — `up`/`down` l'écrivent — sinon de FAKE_TAILSCALE_STATE (défaut Running). Appels journalisés dans
# FAKE_TAILSCALE_LOG.
printf '%s\n' "$*" >>"${FAKE_TAILSCALE_LOG:-/dev/null}"
state="${FAKE_TAILSCALE_STATE:-Running}"
if [ -n "${FAKE_TAILSCALE_STATEFILE:-}" ] && [ -f "${FAKE_TAILSCALE_STATEFILE}" ]; then
  state="$(cat "${FAKE_TAILSCALE_STATEFILE}")"
fi
case "$1" in
  status)
    printf '{"BackendState": "%s", "Peer": {}}\n' "$state"
    [ "$state" = "Running" ] && exit 0 || exit 1
    ;;
  up)
    [ -n "${FAKE_TAILSCALE_STATEFILE:-}" ] && echo Running >"${FAKE_TAILSCALE_STATEFILE}"
    exit 0
    ;;
  down)
    [ -n "${FAKE_TAILSCALE_STATEFILE:-}" ] && echo Stopped >"${FAKE_TAILSCALE_STATEFILE}"
    exit 0
    ;;
esac
echo "fake-tailscale : commande inconnue : $*" >&2
exit 2
