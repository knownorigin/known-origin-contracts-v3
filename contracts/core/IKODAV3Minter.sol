// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

interface IKODAV3Minter {

    function mintToken(address _to, string calldata _uri) external returns (uint256 _tokenId);

    function mintBatchEdition(uint96 _editionSize, address _to, string calldata _uri) external returns (uint256 _editionId);

    function mintConsecutiveBatchEdition(uint96 _editionSize, address _to, string calldata _uri) external returns (uint256 _editionId);

}
