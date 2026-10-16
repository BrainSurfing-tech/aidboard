#!/usr/bin/env bash
# Faux gh : auth status / pr create / pr view --json number,url. Jamais le vrai gh en test.
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  [ "${FAKE_GH_UNAUTHENTICATED:-0}" = "0" ] && exit 0
  exit 1
fi
if [ "$1" = "pr" ] && [ "$2" = "create" ]; then
  exit "${FAKE_GH_CREATE_EXIT:-0}"
fi
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  printf '{"number": %s, "url": "%s"}\n' \
    "${FAKE_GH_PR_NUMBER:-7}" "${FAKE_GH_PR_URL:-https://github.com/test/test/pull/7}"
  exit 0
fi
exit 1
