// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "../minter/MintingFactory.sol";

contract MockMintingFactory is MintingFactory {
    uint128 nowOverride;

    constructor(
        IKOAccessControlsLookup _accessControls,
        IKODAV3Minter _koda,
        KODAV3PrimaryMarketplace _marketplace
    ) MintingFactory(_accessControls, _koda, _marketplace) {}

    function setNow(uint128 _now) external {
        nowOverride = _now;
    }

    function _getNow() internal override view returns (uint128) {
        if (nowOverride > 0) {
            return nowOverride;
        }

        return uint128(block.timestamp);
    }
}
