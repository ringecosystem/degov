set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just --list

pnpm := "pnpm"

# Workspace
install:
    {{pnpm}} install

web *args:
    @cd packages/web && just {{args}}

indexer *args:
    @cd packages/indexer && just {{args}}
