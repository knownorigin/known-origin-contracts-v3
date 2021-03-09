// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import {IERC165} from "@openzeppelin/contracts/introspection/IERC165.sol";

/**
 * ERC2981 standards interface for royalties
 */
interface IERC2981 is IERC165 {
    // FIXME
    //    /**
    //     * @notice This event is emitted when royalties are received.
    //     *
    //     * @dev The marketplace would call royaltiesReceived() function so that the NFT contracts emits this event.
    //     **/
    //    event ReceivedRoyalties(uint256 _tokenId, address _receiver, address _buyer, uint256 _amount);

    /**
     * @dev Returns royalty amount as uint256 and address where royalties should go.
     *
     * @dev Marketplaces would need to call this during the purchase function of their marketplace - and then implement the transfer of that amount on their end
     */
    function royaltyInfo(uint256 _tokenId) external view returns (address _receiver, uint256 _amount);

    // FIXME
    //    /**
    //     * @dev Returns true if implemented
    //     * @param _tokenId The token ID to check if royalties are defined
    //     * @dev this is how the marketplace can see if the contract has royalties, other than using the supportsInterface() call.
    //     */
    //    function hasRoyalties(uint256 _tokenId) external view returns (bool);
    //
    //    /**
    //     * @dev Called by the marketplace after the transfer of royalties has happened, so that the contract has a record
    //     * @dev emits ReceivedRoyalties event;
    //    */
    //    function royaltiesReceived(uint256 _tokenId, address _receiver, address _buyer, uint256 _amount) external view;
}
