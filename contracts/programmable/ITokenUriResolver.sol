// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

/// @title A ERC-721 compliant contract which has a focus on being GAS efficient along with being able to support
/// both unique tokens and multi-editions sharing common traits but of limited supply
///
/// @author KnownOrigin Labs - https://knownorigin.io/
interface ITokenUriResolver {

    /// @notice Return the edition or token level URI - token level trumps edition level if found
    function tokenURI(uint256 _editionId, uint256 _tokenId) external view returns (string memory);

    /// @notice Do we have an edition level or token level token URI resolver set
    function isDefined(uint256 _editionId, uint256 _tokenId) external view returns (bool);
}
