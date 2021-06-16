#!/usr/bin/env bash

truffle-flattener ./contracts/access/KOAccessControls.sol > ./contracts-flat/KOAccessControls.sol
truffle-flattener ./contracts/core/KnownOriginDigitalAssetV3.sol > ./contracts-flat/KnownOriginDigitalAssetV3.sol
truffle-flattener ./contracts/marketplace/KODAV3PrimaryMarketplace.sol > ./contracts-flat/KODAV3PrimaryMarketplace.sol
truffle-flattener ./contracts/marketplace/KODAV3SecondaryMarketplace.sol > ./contracts-flat/KODAV3SecondaryMarketplace.sol
truffle-flattener ./contracts/minter/MintingFactory.sol > ./contracts-flat/MintingFactory.sol
