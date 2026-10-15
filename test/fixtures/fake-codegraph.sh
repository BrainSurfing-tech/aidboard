#!/usr/bin/env bash
# Faux codegraph : « init -y <chemin> », réussit ou échoue selon FAKE_CODEGRAPH_EXIT.
sleep 0.2
[ "${FAKE_CODEGRAPH_EXIT:-0}" = "0" ] && mkdir -p "$3/.codegraph" && : > "$3/.codegraph/codegraph.db"
exit "${FAKE_CODEGRAPH_EXIT:-0}"
