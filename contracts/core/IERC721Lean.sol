pragma solidity 0.7.6;

interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address owner);
}
