module.exports = {
  copyPackages: ['@openzeppelin/contracts'],
  skipFiles: [

    // KODA V2 stuff (inherited)
    'access/legacy/libs/AccessControl.sol',
    'access/legacy/libs/Ownable.sol',
    'access/legacy/libs/RBAC.sol',
    'access/legacy/libs/Roles.sol',
    'access/legacy/libs/Whitelist.sol',

    // Experimental
    'programmable/resolvers/ContractBalanceFeedResolver.sol',
    'programmable/resolvers/ManuallyChangingToken.sol',
    'programmable/resolvers/RandomBlockResolver.sol',
    'programmable/resolvers/UniswapPriceFeedResolver.sol',

    // Gas token
    'spikes/core/chi/ChiGasSaver.sol',
    'spikes/core/chi/ChiToken.sol',

    // token royalties (not edition aware)
    'spikes/royalties/ITokenRoyaltiesRegistry.sol',
    'spikes/royalties/TokenRoyaltiesRegistry.sol',
  ]
};
