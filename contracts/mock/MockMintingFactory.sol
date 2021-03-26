// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import "../minter/MintingFactory.sol";

contract MockMintingFactory is MintingFactory {
    uint256 nowOverride;

    constructor(
        IKOAccessControlsLookup _accessControls,
        IKODAV3Minter _koda,
        IKODAV3PrimarySaleMarketplace _marketplace
    ) MintingFactory(_accessControls, _koda, _marketplace) {}

    function setNow(uint256 _now) external {
        nowOverride = _now;
    }

    function _getNow() internal override view returns (uint256) {
        if (nowOverride > 0) {
            return nowOverride;
        }

        return block.timestamp;
    }
}
