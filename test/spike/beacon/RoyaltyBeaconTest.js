const {BN, constants, expectEvent, expectRevert, balance, ether} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;
const {expect} = require('chai');

const RoyaltyProxy    = artifacts.require('RoyaltyProxy');    // Royalty Funds Handler proxy

const RoyaltyBeaconV1 = artifacts.require('RoyaltyBeaconV1'); // Royalty Funds Receiver
const RoyaltyBeaconV2 = artifacts.require('RoyaltyBeaconV2'); // Royalty Funds Splitter

const RoyaltyImplV1R1 = artifacts.require('RoyaltyImplV1R1'); // Funds Receiver implementation, revision 1 (has bug)
const RoyaltyImplV1R2 = artifacts.require('RoyaltyImplV1R2'); // Funds Receiver implementation, revision 2 (fixed)
const RoyaltyImplV2   = artifacts.require('RoyaltyImplV2');   // Funds Splitter implementation, revision 1

contract('RoyaltyProxy', function (accounts) {

    const [owner] = accounts;

    let royaltyImplV1R1, royaltyImplV2, royaltyBeaconV1, royaltyBeaconV2, royaltyProxy;

    beforeEach(async () => {

        // Royalty Funds Receiver (revision 1)
        royaltyImplV1R1 = await RoyaltyImplV1R1.new(
            {from: owner}
        );
        royaltyBeaconV1 = await RoyaltyBeaconV1.new(
            royaltyImplV1R1.address
        )

        // Royalty Funds Splitter
        royaltyImplV2 = await RoyaltyImplV2.new(
            {from: owner}
        );

        royaltyBeaconV2 = await RoyaltyBeaconV2.new(
            royaltyImplV2.address
        )

    });

    describe('Royalty Funds Handler V1 (FundsReceiver)', () => {

        context('things', async () => {

            beforeEach(async () => {

            });

            it('stuff', async () => {

            })

        });

    });

});
