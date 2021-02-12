// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;

interface IKODAV3Minter {

    function mintToken(address _to, string calldata _uri) external returns (uint256 _tokenId);

    function mintBatchEdition(uint256 _editionSize, address _to, string calldata _uri) external returns (uint256 _editionId);

    function mintConsecutiveBatchEdition(uint256 _editionSize, address _to, string calldata _uri) external returns (uint256 _editionId);

}
