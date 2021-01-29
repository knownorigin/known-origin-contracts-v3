// SPDX-License-Identifier: MIT

pragma solidity 0.7.4;

interface IFundsHandler {

    function init(address[] calldata _recipients, uint256[] calldata _splits) external;

    function totalRecipients() external view returns (uint256);

    function royaltyAtIndex(uint256 index) external view returns (address, uint256);
}
