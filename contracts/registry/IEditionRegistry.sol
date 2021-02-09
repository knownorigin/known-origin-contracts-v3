// SPDX-License-Identifier: MIT

pragma solidity 0.7.4;

interface IEditionRegistry {

    function generateNextEditionNumber() external returns (uint256);

}
