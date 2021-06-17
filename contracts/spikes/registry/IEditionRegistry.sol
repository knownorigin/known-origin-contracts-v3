// SPDX-License-Identifier: MIT

pragma solidity 0.8.5;

interface IEditionRegistry {

    function generateNextEditionNumber() external returns (uint256);

}
