// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import {IERC2981} from "../core/IERC2981.sol";
import {ERC165} from "@openzeppelin/contracts/introspection/ERC165.sol";

// N:B: Mock contract for testing purposes only
contract MockRoyaltiesRegistry is ERC165, IERC2981 {

    struct Royalty {
        address receiver;
        uint256 amount;
    }

    mapping(uint256 => Royalty) overrides;

    function royaltyInfo(uint256 _tokenId) external override view returns (address _receiver, uint256 _amount){
        return (address(0), 0);
    }

    function hasRoyalties(uint256 _tokenId) external override view returns (bool) {
        return overrides[_tokenId].amount > 0;
    }

    function setupRoyalty(uint256 _tokenId, address _receiver, uint256 _amount) public {
        overrides[_tokenId] = Royalty(_receiver, _amount);
    }
}
