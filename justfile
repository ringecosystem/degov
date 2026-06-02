set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just --list

pnpm := "pnpm"

# Workspace
install:
    {{pnpm}} install

web *args:
    @cd apps/web && just {{args}}

indexer *args:
    @cd apps/indexer && just {{args}}
