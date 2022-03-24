#!/usr/bin/env bash

npx hardhat flatten ./contracts/access/KOAccessControls.sol > ./contracts-flat/KOAccessControls.sol
npx hardhat flatten ./contracts/core/KnownOriginDigitalAssetV3.sol > ./contracts-flat/KnownOriginDigitalAssetV3.sol
npx hardhat flatten ./contracts/marketplace/KODAV3PrimaryMarketplace.sol > ./contracts-flat/KODAV3PrimaryMarketplace.sol
npx hardhat flatten ./contracts/marketplace/KODAV3SecondaryMarketplace.sol > ./contracts-flat/KODAV3SecondaryMarketplace.sol
npx hardhat flatten ./contracts/marketplace/KODAV3UpgradableGatedMarketplace.sol > ./contracts-flat/KODAV3UpgradableGatedMarketplace.sol
npx hardhat flatten ./contracts/minter/MintingFactory.sol > ./contracts-flat/MintingFactory.sol
npx hardhat flatten ./contracts/minter/MintingFactoryV2.sol > ./contracts-flat/MintingFactoryV2.sol
npx hardhat flatten ./contracts/collab/CollabRoyaltiesRegistry.sol > ./contracts-flat/CollabRoyaltiesRegistry.sol
npx hardhat flatten ./contracts/collab/handlers/ClaimableFundsReceiverV1.sol > ./contracts-flat/ClaimableFundsReceiverV1.sol
npx hardhat flatten ./contracts/collab/handlers/ClaimableFundsSplitterV1.sol > ./contracts-flat/ClaimableFundsSplitterV1.sol
