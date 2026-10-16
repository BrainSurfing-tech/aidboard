#!/usr/bin/env bash
# Faux npm : « test » réussit ou échoue selon FAKE_NPM_EXIT ; jamais le vrai npm en test.
[ "$1" = "test" ] || exit 0
exit "${FAKE_NPM_EXIT:-0}"
