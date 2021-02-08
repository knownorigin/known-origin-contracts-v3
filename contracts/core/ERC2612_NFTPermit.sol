// SPDX-License-Identifier: MIT

pragma solidity 0.7.4; // FIXME bump to 0.8 and drop safemath?

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

// TODO remove me
import "hardhat/console.sol";

// Based on - https://github.com/ethereum/EIPs/issues/2613
// Variant assume value if token Id and not ERC20 value

//https://soliditydeveloper.com/erc20-permit

// TODO ERC-20 permit style for erc-721 (https://eips.ethereum.org/EIPS/eip-2612)
interface ERC2612_NFTPermit is IERC721 {
    function permit(address owner, address spender, uint256 tokenId, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;
}

abstract contract NFTPermit is ERC2612_NFTPermit {

    //DAI version https://github.com/makerdao/dss/blob/44330065999621834b08de1edf3b962f6bbd74c6/src/dai.sol#L118-L140

    function permit(address owner, address spender, uint256 tokenId, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
    override
    external {
        // TODO uniswap/makerdao style signed approve and transfer
    }
}
