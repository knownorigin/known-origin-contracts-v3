module.exports = {
  copyPackages: ['@openzeppelin/contracts'],
  skipFiles: [

    // KODA V2 stuff (inherited)
    'access/legacy/libs/AccessControl.sol',
    'access/legacy/libs/Ownable.sol',
    'access/legacy/libs/RBAC.sol',
    'access/legacy/libs/Roles.sol',
    'access/legacy/libs/Whitelist.sol',
    'access/legacy/SelfServiceAccessControls.sol',

    // Spikes
    'spikes/core/chi/ChiGasSaver.sol',
    'spikes/core/chi/ChiToken.sol',
    'spikes/royalties/ITokenRoyaltiesRegistry.sol',
    'spikes/royalties/TokenRoyaltiesRegistry.sol',
    'spikes/royalties/EditionRoyaltiesRegistry.sol',
    'spikes/collaborators/beacon/RoyaltyImplV1R1.sol',
    'spikes/collaborators/handlers/FundsReceiver.sol',
    'spikes/collaborators/handlers/FundsSplitter.sol',
    'spikes/core/mixins/MintBatchViaSig.sol',
    'spikes/core/mixins/NFTPermit.sol',
    'spikes/registry/EditionRegistry.sol',
    'spikes/programmable/TokenUriResolverRegistry.sol',
    'spikes/marketplace/KODAV3SignatureMarketplace.sol',
    'spikes/deployer/ContractDeployer.sol',
  ]
};
