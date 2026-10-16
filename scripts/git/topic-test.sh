#!/usr/bin/env bash
# topic.test : lance les tests du sujet (D20 : commande fixe, npm test). cwd = worktree du sujet.
# Pas de die_human ici : un test rouge est un échec normal, pas une action humaine requise.
NPM="${AID_NPM_BIN:-npm}"
exec "$NPM" test
