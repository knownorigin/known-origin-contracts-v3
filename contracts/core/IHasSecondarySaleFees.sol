// SPDX-License-Identifier: MIT

pragma solidity 0.8.5;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

contract IHasSecondarySaleFees is IERC165 {

    event SecondarySaleFees(uint256 tokenId, address[] recipients, uint[] bps);

    function getFeeRecipients(uint256 id) public view returns (address payable[] memory);

    function getFeeBps(uint256 id) public view returns (uint[] memory);
}
