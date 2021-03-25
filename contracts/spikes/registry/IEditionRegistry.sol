// SPDX-License-Identifier: MIT

pragma solidity 0.8.0;

interface IEditionRegistry {

    function generateNextEditionNumber() external returns (uint256);

}
