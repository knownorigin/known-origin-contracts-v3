// SPDX-License-Identifier: MIT

pragma solidity ^0.7.4;

// TODO whats the best way to test this?
abstract contract IFreeFromUpTo {
    function freeFromUpTo(address from, uint256 value) external virtual returns (uint256 freed);
}

contract ChiGasSaver {

    modifier saveGas(address sponsor) {
        uint256 gasStart = gasleft();
        _;
        uint256 gasSpent = 21000 + gasStart - gasleft() + 16 * msg.data.length;

        IFreeFromUpTo chi = IFreeFromUpTo(0x0000000000004946c0e9F43F4Dee607b0eF1fA1c);
        chi.freeFromUpTo(sponsor, (gasSpent + 14154) / 41947);
    }
}
