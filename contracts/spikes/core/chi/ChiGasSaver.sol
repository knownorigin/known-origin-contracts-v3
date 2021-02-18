// SPDX-License-Identifier: MIT

pragma solidity ^0.7.4;

// TODO remove me
import "hardhat/console.sol";

// TODO whats the best way to test this?
abstract contract IFreeFromUpTo {
    function freeFromUpTo(address from, uint256 value) external virtual returns (uint256 freed);
}

contract ChiGasSaver {

    address chiToken;

    constructor(address _chiToken) {
        chiToken = _chiToken;
    }

    modifier saveGas(address sponsor) {
        uint256 gasStart = gasleft();
        _;
        uint256 gasSpent = 21000 + gasStart - gasleft() + 16 * msg.data.length;

        IFreeFromUpTo(chiToken).freeFromUpTo(sponsor, (gasSpent + 14154) / 41947);
    }
}
