// SPDX-License-Identifier: MIT

pragma solidity 0.8.5;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

// This is purely an extension for the KO platform
interface IERC2981HasRoyaltiesExtension {
    function hasRoyalties(uint256 _tokenId) external view returns (bool);
}

/**
 * ERC2981 standards interface for royalties
 */
interface IERC2981 is IERC165, IERC2981HasRoyaltiesExtension {
    /// ERC165 bytes to add to interface array - set in parent contract
    /// implementing this standard
    ///
    /// bytes4(keccak256("royaltyInfo(uint256,uint256)")) == 0x2a55205a
    /// bytes4 private constant _INTERFACE_ID_ERC2981 = 0x2a55205a;
    /// _registerInterface(_INTERFACE_ID_ERC2981);

    /// @notice Called with the sale price to determine how much royalty
    //          is owed and to whom.
    /// @param _tokenId - the NFT asset queried for royalty information
    /// @param _value - the sale price of the NFT asset specified by _tokenId
    /// @return _receiver - address of who should be sent the royalty payment
    /// @return _royaltyAmount - the royalty payment amount for _value sale price
    function royaltyInfo(
        uint256 _tokenId,
        uint256 _value
    ) external returns (
        address _receiver,
        uint256 _royaltyAmount
    );

}
