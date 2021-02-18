// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

interface IKODAV3Marketplace {

    function listEdition(address _creator, uint256 _editionId, uint256 _listingPrice, uint256 _startDate) external;

}
