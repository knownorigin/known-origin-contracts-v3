// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

interface ICollabFundsDrainable {

    event FundsDrained(uint256 total, address[] recipients, uint256[] amounts);

    function drain() external;
}
