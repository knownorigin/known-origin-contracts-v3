// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";

abstract contract TopDownSimpleERC721Composable is Context {
    struct ComposedNFT {
        address nft;
        uint256 tokenId;
    }

    // KODA Token ID -> composed nft
    mapping(uint256 => ComposedNFT) public kodaTokenComposedNFT;

    // External NFT address -> External Token ID -> KODA token ID
    mapping(address => mapping(uint256 => uint256)) public composedNFTsToKodaToken;

    event ReceivedChild(address indexed _from, uint256 indexed _tokenId, address indexed _childContract, uint256 _childTokenId);
    event TransferChild(uint256 indexed _tokenId, address indexed _to, address indexed _childContract, uint256 _childTokenId);

    /// @notice compose a child ERC721 into a KODA token
    /// @notice Caller must own both KODA and child NFT tokens
    function composeNFTIntoKodaToken(uint256 _kodaTokenId, address _nft, uint256 _nftTokenId) external {
        require(kodaTokenComposedNFT[_kodaTokenId].nft == address(0), "Max 1 NFT");

        IERC721 nftContract = IERC721(_nft);
        require(
            IERC721(address(this)).ownerOf(_kodaTokenId) == nftContract.ownerOf(_nftTokenId),
            "Need to own both tokens"
        );

        kodaTokenComposedNFT[_kodaTokenId] = ComposedNFT(_nft, _nftTokenId);
        composedNFTsToKodaToken[_nft][_nftTokenId] = _kodaTokenId;

        nftContract.transferFrom(_msgSender(), address(this), _nftTokenId);
        emit ReceivedChild(_msgSender(), _kodaTokenId, _nft, _nftTokenId);
    }

    /// @notice Transfer a child 721 wrapped within a KODA token to a given recipient
    /// @notice only KODA token owner can call this
    function transferChild(uint256 _kodaTokenId, address _recipient) external {
        require(
            IERC721(address(this)).ownerOf(_kodaTokenId) == _msgSender(),
            "Only KODA owner"
        );

        address nft = kodaTokenComposedNFT[_kodaTokenId].nft;
        uint256 nftId = kodaTokenComposedNFT[_kodaTokenId].tokenId;

        delete kodaTokenComposedNFT[_kodaTokenId];
        delete composedNFTsToKodaToken[nft][nftId];

        IERC721(nft).transferFrom(address(this), _recipient, nftId);

        emit TransferChild(_kodaTokenId, _recipient, nft, nftId);
    }
}
