// SPDX-License-Identifier: MIT

pragma solidity 0.8.3;

interface IKODAV3Minter {

    function mintBatchEdition(uint96 _editionSize, address _to, string calldata _uri) external returns (uint256 _editionId);

    function mintBatchEditionAndComposeERC20s(uint96 _editionSize, address _to, string calldata _uri, address[] calldata _erc20s, uint256[] calldata _amounts) external returns (uint256 _editionId);

    function mintConsecutiveBatchEdition(uint96 _editionSize, address _to, string calldata _uri) external returns (uint256 _editionId);
}
