module.exports = {
  copyPackages: ['@openzeppelin/contracts'],
  skipFiles: [
    'access/legacy/ISelfServiceAccessControls.sol',
    'access/legacy/libs/AccessControl.sol',
    'access/legacy/libs/Ownable.sol',
    'access/legacy/libs/RBAC.sol',
    'access/legacy/libs/Roles.sol',
    'access/legacy/libs/Whitelist.sol',
    'access/legacy/SelfServiceAccessControls.sol',

    'programmable/resolvers/ContractBalanceFeedResolver.sol',
    'programmable/resolvers/ManuallyChangingToken.sol',
    'programmable/resolvers/RandomBlockResolver.sol',
    'programmable/resolvers/UniswapPriceFeedResolver.sol',
    'programmable/TokenUriResolverRegistry.sol',

    'royalties/EditionRoyaltiesRegistry.sol',

    'spikes/core/chi/ChiGasSaver.sol',
    'spikes/core/chi/ChiToken.sol',
    'spikes/registry/EditionRegistry.sol',
    'spikes/registry/IEditionRegistry.sol',
    'spikes/royalties/ITokenRoyaltiesRegistry.sol',
    'spikes/royalties/TokenRoyaltiesRegistry.sol',
  ]
};
