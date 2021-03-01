// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20("Mock", "MCK") {
    constructor() {
        _mint(msg.sender, 5_000_000 * 10 ** 18);
    }
}
