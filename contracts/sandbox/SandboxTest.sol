pragma solidity 0.8.4;

contract NumberManipulator {
    uint private num;

    constructor(uint _num) {
        num = _num;
    }

    function doubleNum() public view returns (uint) {
         return num * 2;
    }
}
