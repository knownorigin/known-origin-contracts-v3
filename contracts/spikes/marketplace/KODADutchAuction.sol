pragma solidity 0.8.4;

// SPDX-License-Identifier: MIT

import { Exponential } from "./exponential/Exponential.sol";

// one time use contract that tries to do a dutch auction - needs tweaking for multiple auctions per contract.
contract KODADutchAuction is Exponential {

    // variables needed per auction (for y = mx + c lineaer equation). We know m is negative for dutch but we calc abs version of the value
    // therefore, using uint256, the equation is really y = c - mx.
    // due to no floating in solidity, we scale m by 1e18 using a math library from compound for super accuracy
    uint256 mPositiveScaled;
    uint256 c;
    uint256 startDateTime;
    uint256 endDateTime;
    uint256 startPrice;
    uint256 floorPrice;

    constructor(
        uint256 _startPrice,
        uint256 _floorPrice,
        uint256 _startDateTime,
        uint256 _endDateTime
    ) {
        require(_startPrice > _floorPrice);
        require(_endDateTime > _startDateTime);

        // calc y = mx + c
        uint256 changeInYPositive = _startPrice - _floorPrice;
        uint256 changeInX = _endDateTime - _startDateTime;

        (MathError err, Exp memory result) = getExp(changeInYPositive, changeInX);
        require(err == MathError.NO_ERROR, "Error working out m");

        // if m is 0.466, then this number will be scaled by 1e18 i.e. 0.4666 x 10^18.
        mPositiveScaled = result.mantissa;

        // c is the val of y when x = 0. on our axis x starts at _startDateTime, so y is _startPrice
        c = _startPrice;

        startDateTime = _startDateTime;
        endDateTime = _endDateTime;
        startPrice = _startPrice;
        floorPrice = _floorPrice;
    }

    // whats the price based on current timestamp?
    function price() external view returns (uint256) {
        return _price(block.timestamp);
    }

    function _price(uint256 _timestamp) public view returns (uint256) {
        if (_timestamp >= endDateTime) {
            return floorPrice;
        }

        if (_timestamp <= startDateTime) {
            return startPrice;
        }

        // work out y = c - mx i.e the price of the asset
        uint256 mx = (mPositiveScaled * (_timestamp - startDateTime)) / 1e18;
        return c - mx;
    }
}
