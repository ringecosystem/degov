.PHONY: all fmt clean test
.PHONY: tools foundry sync
.PHONY: deploy dry-run deploy-playground dry-run-playground deploy-playground-skip-simulation

-include .env

chain-id ?= 46
rpc-url ?= darwinia

all    :; @forge build
fmt    :; @forge fmt
clean  :; @forge clean
test   :; @forge test
deploy :; @forge script script/Deploy.s.sol:Deploy --chain ${chain-id} --broadcast --verify --verifier blockscout --legacy
dry-run:; @forge script script/Deploy.s.sol:Deploy --chain ${chain-id}
deploy-playground :; @forge script script/Playground.s.sol:DeployPlayground --chain ${chain-id} --rpc-url ${rpc-url} --broadcast --verify --verifier blockscout --legacy
dry-run-playground:; @forge script script/Playground.s.sol:DeployPlayground --chain ${chain-id} --rpc-url ${rpc-url} --skip-simulation
deploy-playground-skip-simulation :; @forge script script/Playground.s.sol:DeployPlayground --chain ${chain-id} --rpc-url ${rpc-url} --broadcast --skip-simulation --verify --verifier blockscout --legacy

sync   :; @git submodule update --recursive

foundry:; curl -L https://foundry.paradigm.xyz | bash
