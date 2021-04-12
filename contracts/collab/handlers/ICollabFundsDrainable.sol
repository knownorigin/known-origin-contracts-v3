// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ICollabFundsDrainable {

    event FundsDrained(uint256 total, address[] recipients, uint256[] amounts);

    function drain() external;

    function drainERC20(IERC20 token) external;
}
