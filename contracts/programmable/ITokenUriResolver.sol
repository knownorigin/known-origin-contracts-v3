// SPDX-License-Identifier: MIT

pragma solidity 0.7.4;

interface ITokenUriResolver {
    function tokenURI(uint256 _tokenId) external view returns (string memory);
}
