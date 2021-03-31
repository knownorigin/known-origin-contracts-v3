const {BN, constants, expectEvent, expectRevert} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');
const hre = require("hardhat");
const ethers = hre.ethers;
const BeaconProxy     = artifacts.require("@openzeppelin/contracts/proxy/beacon/BeaconProxy");
const RoyaltyRegistry = artifacts.require("RoyaltyRegistry");
const RoyaltyBeacon   = artifacts.require("RoyaltyBeacon");
const RoyaltyImplV1R1 = artifacts.require('RoyaltyImplV1R1'); // Funds Receiver Implementation, Revision 1 (has bug)
const RoyaltyImplV1R2 = artifacts.require('RoyaltyImplV1R2'); // Funds Receiver Implementation, Revision 2 (fixed)
const RoyaltyImplV2   = artifacts.require('RoyaltyImplV2');   // Funds Splitter Implementation, Revision 1

contract('Royalty Funds Handler Architecture', function (accounts) {

    const [owner, artist1, artist2, artist3 ] = accounts;
    const ZERO = new BN(0);
    const TWO = new BN(2);
    const THREE = new BN(3);
    const HALF = new BN(50000);
    const QUARTER = new BN(25000);
    const EDITION_ID = new BN(12000);
    const ROYALTY_AMOUNT = new BN(250000);
    const RECIPIENTS_3 = [artist1, artist2, artist3];
    const RECIPIENTS_2 = [artist1, artist2];
    const SPLITS_3 = [HALF, QUARTER, QUARTER];
    const SPLITS_2 = [HALF, HALF];
    const FUNDS_HANDLER_V1 = "v1";
    const FUNDS_HANDLER_V2 = "v2";

    let royaltyImplV1R1, royaltyImplV1R2, royaltyImplV2,
        v1RoyaltyBeacon, v2RoyaltyBeacon, royaltyProxy,
        royaltyRegistry;

    describe('Implementation', () => {

        context('RoyaltyImplV1R1: Funds Receiver Implementation, Revision 1 (has bug)', async () => {

            it('can be deployed', async () => {

                // Royalty Funds Handler V1: Receiver (revision 1)
                await RoyaltyImplV1R1.new(
                    {from: owner}
                );

            })

            context('init()', async () => {

                it('can be initialized', async () => {

                    // Royalty Funds Handler V1: Receiver (revision 1)
                    royaltyImplV1R1 = await RoyaltyImplV1R1.new(
                        {from: owner}
                    );

                    royaltyImplV1R1.init(RECIPIENTS_3, SPLITS_3);

                })

            })

            context('once initialized', async () => {

                beforeEach(async () => {

                    // Royalty Funds Handler V1: Receiver (revision 1)
                    royaltyImplV1R1 = await RoyaltyImplV1R1.new(
                        {from: owner}
                    );

                    royaltyImplV1R1.init(RECIPIENTS_3, SPLITS_3);

                })

                context('totalRecipients()', async () => {

                    it('reverts, a faux bug', async () => {
                        expectRevert(royaltyImplV1R1.totalRecipients(),"Woops, there's a bug!")
                    })

                })

            })

        });

        context('RoyaltyImplV1R2: Funds Receiver Implementation, Revision 2 (fixed)', async () => {

            it('can be deployed', async () => {

                // Royalty Funds Handler V1: Receiver (revision 2)
                await RoyaltyImplV1R2.new(
                    {from: owner}
                );

            })

            context('init()', async () => {

                it('can be initialized', async () => {

                    // Royalty Funds Handler V1: Receiver (revision 2)
                    royaltyImplV1R2 = await RoyaltyImplV1R2.new(
                        {from: owner}
                    );

                    await royaltyImplV1R2.init(RECIPIENTS_3, SPLITS_3);

                })

            })

            context('once initialized', async () => {

                beforeEach(async () => {

                    // Royalty Funds Handler V1: Receiver (revision 2)
                    royaltyImplV1R2 = await RoyaltyImplV1R2.new(
                        {from: owner}
                    );

                    await royaltyImplV1R2.init(RECIPIENTS_3, SPLITS_3);

                })

                context('totalRecipients()', async () => {

                    it('returns the correct number of recipients', async () => {
                        expect(await royaltyImplV1R2.totalRecipients()).to.bignumber.equal(THREE);
                    })

                })

                context('royaltyAtIndex()', async () => {

                    it('returns address and split values for given recipient index', async () => {

                        for (let i = 0; i < RECIPIENTS_3.length; i++) {
                            const royalty = await royaltyImplV1R2.royaltyAtIndex(i);
                            expect(royalty.recipient).to.bignumber.equal(RECIPIENTS_3[i]);
                            expect(royalty.split).to.bignumber.equal(SPLITS_3[i]);

                        }

                    })

                })

            })

        });

        context('RoyaltyImplV2: Funds Splitter Implementation, Revision 1', async () => {

            it('can be deployed', async () => {

                // Royalty Funds Handler V2: Splitter
                await RoyaltyImplV2.new(
                    {from: owner}
                );

            })

            context('init()', async () => {

                it('can be initialized', async () => {

                    // Royalty Funds Handler V1: Receiver (revision 1)
                    royaltyImplV2 = await RoyaltyImplV2.new(
                        {from: owner}
                    );

                    await royaltyImplV2.init(RECIPIENTS_3, SPLITS_3);

                })

            })

            context('once initialized', async () => {

                beforeEach(async () => {

                    // Royalty Funds Handler V2: Splitter
                    royaltyImplV2 = await RoyaltyImplV2.new(
                        {from: owner}
                    );

                    await royaltyImplV2.init(RECIPIENTS_3, SPLITS_3);

                })

                context('totalRecipients()', async () => {

                    it('returns the correct number of recipients', async () => {
                        expect(await royaltyImplV2.totalRecipients()).to.bignumber.equal(THREE);
                    })

                })

                context('royaltyAtIndex()', async () => {

                    it('returns address and split values for given recipient index', async () => {

                        for (let i = 0; i < RECIPIENTS_3.length; i++) {
                            const royalty = await royaltyImplV2.royaltyAtIndex(i);
                            expect(royalty.recipient).to.bignumber.equal(RECIPIENTS_3[i]);
                            expect(royalty.split).to.bignumber.equal(SPLITS_3[i]);

                        }

                    })

                })

            })

        });

    });

    describe('Beacon', () => {

        beforeEach(async () => {

            // ----------------------
            // Create implementations
            // ----------------------

            // Royalty Funds Handler V1: Receiver (revision 1)
            royaltyImplV1R1 = await RoyaltyImplV1R1.new(
                {from: owner}
            );

            // Royalty Funds Handler V2: Receiver (revision 2)
            royaltyImplV1R2 = await RoyaltyImplV1R2.new(
                {from: owner}
            );

            // Royalty Funds Handler V2: Splitter
            royaltyImplV2 = await RoyaltyImplV2.new(
                {from: owner}
            );

        });

        context('RoyaltyBeacon constructor', async () => {

            it('can be deployed with V1R1 implementation', async () => {

                // Beacon for Royalty Funds Handler V1
                await RoyaltyBeacon.new(
                    royaltyImplV1R1.address,
                    {from: owner}
                )

            });

            it('can be deployed with V1R2 implementation', async () => {

                // Beacon for Royalty Funds Handler V1
                await RoyaltyBeacon.new(
                    royaltyImplV1R2.address,
                    {from: owner}
                )

            });

            it('can be deployed with V2 implementation', async () => {

                // Beacon for Royalty Funds Handler V1
                await RoyaltyBeacon.new(
                    royaltyImplV2.address,
                    {from: owner}
                )

            });

            context('once deployed with V1R1 implementation', async () => {

                beforeEach(async () => {

                    // Beacon for Funds Handler V1
                    v1RoyaltyBeacon = await RoyaltyBeacon.new(
                        royaltyImplV1R1.address
                    )

                });

                describe('implementation()', async () => {

                    it('returns the V1R1 implementation address', async () => {

                        // Verify that the beacon returns the expected address
                        const impl = await v1RoyaltyBeacon.implementation();
                        expect(impl).to.bignumber.equal(royaltyImplV1R1.address);

                    });

                });

                describe('upgradeTo()', async () => {

                    it('can be upgraded to the V1R2 implementation', async () => {

                        await v1RoyaltyBeacon.upgradeTo(royaltyImplV1R2.address);

                        // Verify that the beacon returns the expected address
                        const impl = await v1RoyaltyBeacon.implementation();
                        expect(impl).to.bignumber.equal(royaltyImplV1R2.address);

                    });

                    it('emits Upgraded event', async () => {

                        const receipt = await v1RoyaltyBeacon.upgradeTo(royaltyImplV1R2.address);

                        expectEvent(receipt, 'Upgraded', {
                            implementation: royaltyImplV1R2.address
                        });

                    });

                });

            })

            context('once deployed with V2 implementation', async () => {

                beforeEach(async () => {

                    // Beacon for Funds Handler V2
                    v2RoyaltyBeacon = await RoyaltyBeacon.new(
                        royaltyImplV2.address
                    )

                });

                describe('implementation()', async () => {

                    it('returns the V2 implementation address', async () => {

                        // Verify that the beacon returns the expected address
                        const impl = await v2RoyaltyBeacon.implementation();
                        expect(impl).to.bignumber.equal(royaltyImplV2.address);

                    });

                });

            })

        });

    });

    describe.skip('BeaconProxy', () => {

        beforeEach(async () => {

            // ----------------------
            // Create implementations
            // ----------------------

            // Royalty Funds Handler V1: Receiver (revision 1)
            royaltyImplV1R1 = await RoyaltyImplV1R1.new(
                {from: owner}
            );

            // Royalty Funds Handler V2: Receiver (revision 2)
            royaltyImplV1R2 = await RoyaltyImplV1R2.new(
                {from: owner}
            );

            // Royalty Funds Handler V2: Splitter
            royaltyImplV2 = await RoyaltyImplV2.new(
                {from: owner}
            );

            // --------------
            // Create beacons
            // --------------

            // Beacon for Funds Handler V1
            v1RoyaltyBeacon = await RoyaltyBeacon.new(
                royaltyImplV1R1.address
            )

            // Beacon for Funds Handler V2
            v2RoyaltyBeacon = await RoyaltyBeacon.new(
                royaltyImplV2.address
            )

        });

        context('once deployed with V1 beacon', async () => {

            beforeEach(async () => {

                // Proxy for Royalty Funds Handler V1
                // FIXME why doesn't this encode the init data?
                // throws "invalid BigNumber value (argument="value", value="c350", code=INVALID_ARGUMENT, version=bignumber/5.0.14)"
                const initData = royaltyImplV1R1
                    .contract
                    .methods
                    .init(RECIPIENTS_3, SPLITS_3)
                    .encodeABI();

                // Construct proxy, passing encoded call that should then be delegated
                // from the proxy to the implementation it gets from the beacon
                royaltyProxy = await BeaconProxy.new(v1RoyaltyBeacon.address, initData, {from: owner});

            });

            context('totalRecipients()', async () => {

                it('reverts, a faux bug', async () => {
                    expectRevert(royaltyProxy.totalRecipients(),"Woops, there's a bug!")
                })

            })

        })

        context('once deployed with V2 beacon', async () => {

            beforeEach(async () => {

                // FIXME why doesn't this encode the init data?
                // throws "invalid BigNumber value (argument="value", value="c350", code=INVALID_ARGUMENT, version=bignumber/5.0.14)"
                const initData = royaltyImplV2
                    .contract
                    .methods
                    .init(RECIPIENTS_3, SPLITS_3)
                    .encodeABI();

                // Proxy for Royalty Funds Handler V2
                royaltyProxy = await BeaconProxy.new(v2RoyaltyBeacon.address, initData, {from: owner});

            });

            context('totalRecipients()', async () => {

                it('returns the correct number of recipients', async () => {
                    expect(await royaltyProxy.totalRecipients()).to.bignumber.equal(THREE);
                })

                it('implementation does *not* know the number of recipients', async () => {
                    expect(await royaltyImplV2.totalRecipients()).to.bignumber.equal(ZERO);
                })

            })

            context('royaltyAtIndex()', async () => {

                it('returns address and split values for given recipient index', async () => {

                    for (let i = 0; i < RECIPIENTS_3.length; i++) {
                        const royalty = await royaltyProxy.royaltyAtIndex(i);
                        expect(royalty.recipient).to.bignumber.equal(RECIPIENTS_3[i]);
                        expect(royalty.split).to.bignumber.equal(SPLITS_3[i]);

                    }

                })

            })

        })

    });

    describe('RoyaltyRegistry', () => {

        beforeEach(async () => {

            // ----------------------
            // Create implementations
            // ----------------------

            // Royalty Funds Handler V1: Receiver (revision 1)
            royaltyImplV1R1 = await RoyaltyImplV1R1.new(
                {from: owner}
            );

            // Royalty Funds Handler V2: Receiver (revision 2)
            royaltyImplV1R2 = await RoyaltyImplV1R2.new(
                {from: owner}
            );

            // Royalty Funds Handler V2: Splitter
            royaltyImplV2 = await RoyaltyImplV2.new(
                {from: owner}
            );

            // --------------
            // Create beacons
            // --------------

            // Beacon for Funds Handler V1
            v1RoyaltyBeacon = await RoyaltyBeacon.new(
                royaltyImplV1R1.address
            )

            // Beacon for Funds Handler V2
            v2RoyaltyBeacon = await RoyaltyBeacon.new(
                royaltyImplV2.address
            )

            // -----------------------
            // Create royalty registry
            // -----------------------
            royaltyRegistry = await RoyaltyRegistry.new();

        });

        context('addBeacon()', async () => {

            it('emits BeaconAdded event on success', async () => {

                const receipt = await royaltyRegistry.addBeacon(FUNDS_HANDLER_V1, v1RoyaltyBeacon.address);
                expectEvent(receipt, 'BeaconAdded', {name: FUNDS_HANDLER_V1, beacon: v1RoyaltyBeacon.address})

            });

        });

        context('once deployed with V1 and V2 beacons added', async () => {

            beforeEach(async () => {

                await royaltyRegistry.addBeacon(FUNDS_HANDLER_V1, v1RoyaltyBeacon.address);
                await royaltyRegistry.addBeacon(FUNDS_HANDLER_V2, v2RoyaltyBeacon.address);

            });

            context('deployProxy() with V2 beacon', async () => {

                it('emits ProxyDeployed event on success', async () => {
                    const receipt = await royaltyRegistry.deployProxy(EDITION_ID, FUNDS_HANDLER_V2, RECIPIENTS_3, SPLITS_3);
                    expectEvent(receipt, 'ProxyDeployed', {
                        editionId: EDITION_ID,
                        beaconName: FUNDS_HANDLER_V2,
                        recipients: RECIPIENTS_3,
                        //splits: SPLITS_3
                        // FIXME: throws "expected event argument 'splits' to have value 50000,25000,25000 but got 50000,25000,25000"
                    })
                });

                it('proxy knows the number of recipients', async () => {

                    // Get the proxy address with a static call
                    const proxyAddr = await royaltyRegistry.deployProxy.call(EDITION_ID, FUNDS_HANDLER_V2, RECIPIENTS_3, SPLITS_3);

                    // Get an ethers contract representation
                    const [deployer] = await ethers.getSigners();
                    const proxy = new ethers.Contract(
                        proxyAddr,
                        royaltyImplV2.abi,
                        deployer
                    );

                    // Actually deploy the Proxy
                    await royaltyRegistry.deployProxy(EDITION_ID, FUNDS_HANDLER_V2, RECIPIENTS_3, SPLITS_3);

                    // Get total recipients from proxy
                    const result = await proxy.totalRecipients();

                    // Convert to BN since ethers contract returns BigNumber
                    const totalRecipients = new BN(result.toString());

                    // Validate result
                    expect(totalRecipients).to.bignumber.equal(THREE);
                })

                it('implementation does *not* know the number of recipients', async () => {
                    await royaltyRegistry.deployProxy(EDITION_ID, FUNDS_HANDLER_V2, RECIPIENTS_3, SPLITS_3);
                    expect(await royaltyImplV2.totalRecipients()).to.bignumber.equal(ZERO);
                })

                context('royaltyInfo()', async () => {

                    it('given edition id, returns proxy address and royalty amount', async () => {

                        // Get the proxy address with a static call
                        const proxyAddr = await royaltyRegistry.deployProxy.call(EDITION_ID, FUNDS_HANDLER_V2, RECIPIENTS_3, SPLITS_3);

                        // Actually deploy the Proxy
                        await royaltyRegistry.deployProxy(EDITION_ID, FUNDS_HANDLER_V2, RECIPIENTS_3, SPLITS_3);

                        const info = await royaltyRegistry.royaltyInfo(EDITION_ID);
                        expect(info.receiver).to.equal(proxyAddr);
                        expect(info.amount.eq(ROYALTY_AMOUNT)).to.be.true;

                    })

                })

            })

        })

    });

});
