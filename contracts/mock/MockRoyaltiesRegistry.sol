// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

import {IERC2981} from "../core/IERC2981.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

// N:B: Mock contract for testing purposes only
contract MockRoyaltiesRegistry is ERC165, IERC2981 {

    struct Royalty {
        address receiver;
        uint256 amount;
    }

    mapping(uint256 => Royalty) overrides;

    function royaltyInfo(uint256 _tokenId) external override view returns (address _receiver, uint256 _amount){
        return (overrides[_tokenId].receiver, overrides[_tokenId].amount);
    }

    function receivedRoyalties(address _royaltyRecipient, address _buyer, uint256 _tokenId, address _tokenPaid, uint256 _amount)
    external
    override {
        emit ReceivedRoyalties(_royaltyRecipient, _buyer, _tokenId, _tokenPaid, _amount);
    }

    function hasRoyalties(uint256 _tokenId) external override view returns (bool) {
        return overrides[_tokenId].amount > 0;
    }

    function setupRoyalty(uint256 _tokenId, address _receiver, uint256 _amount) public {
        overrides[_tokenId] = Royalty(_receiver, _amount);
    }
}
