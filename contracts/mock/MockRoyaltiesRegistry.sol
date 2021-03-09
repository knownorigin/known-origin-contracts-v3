// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import {IERC2981} from "../core/IERC2981.sol";
import {ERC165} from "@openzeppelin/contracts/introspection/ERC165.sol";

contract MockRoyaltiesRegistry is ERC165, IERC2981 {

    function royaltyInfo(uint256 _tokenId) external override view returns (address _receiver, uint256 _amount){
        return (address(0), 0);
    }
}
