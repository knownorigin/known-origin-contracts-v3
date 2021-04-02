#!/usr/bin/env bash

truffle-flattener ./contracts/access/KOAccessControls.sol > ./contracts-flat/KOAccessControls.sol
truffle-flattener ./contracts/core/KnownOriginDigitalAssetV3.sol > ./contracts-flat/KnownOriginDigitalAssetV3.sol
truffle-flattener ./contracts/marketplace/KODAV3Marketplace.sol > ./contracts-flat/KODAV3Marketplace.sol
truffle-flattener ./contracts/minter/MintingFactory.sol > ./contracts-flat/MintingFactory.sol
