const {BN, constants, expectEvent, expectRevert} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');

const RoyaltyProxy    = artifacts.require("RoyaltyProxy");
const RoyaltyBeacon   = artifacts.require("RoyaltyBeacon");
const RoyaltyImplV1R1 = artifacts.require('RoyaltyImplV1R1'); // Funds Receiver Implementation, Revision 1 (has bug)
const RoyaltyImplV1R2 = artifacts.require('RoyaltyImplV1R2'); // Funds Receiver Implementation, Revision 2 (fixed)
const RoyaltyImplV2   = artifacts.require('RoyaltyImplV2');   // Funds Splitter Implementation, Revision 1

contract('Royalty Funds Handler Architecture', function (accounts) {

    const [owner, artist1, artist2, artist3 ] = accounts;
    const THREE = new BN(3);
    const HALF = new BN(50000);
    const QUARTER = new BN(25000);
    const RECIPIENTS = [artist1, artist2, artist3];
    const SPLITS = [HALF, QUARTER, QUARTER];

    let royaltyImplV1R1, royaltyImplV1R2, royaltyImplV2,
        v1RoyaltyBeacon, v2RoyaltyBeacon, royaltyProxy;

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

                    royaltyImplV1R1.init(RECIPIENTS, SPLITS);

                })

            })

            context('once initialized', async () => {

                beforeEach(async () => {

                    // Royalty Funds Handler V1: Receiver (revision 1)
                    royaltyImplV1R1 = await RoyaltyImplV1R1.new(
                        {from: owner}
                    );

                    royaltyImplV1R1.init(RECIPIENTS, SPLITS);

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

                    await royaltyImplV1R2.init(RECIPIENTS, SPLITS);

                })

            })

            context('once initialized', async () => {

                beforeEach(async () => {

                    // Royalty Funds Handler V1: Receiver (revision 2)
                    royaltyImplV1R2 = await RoyaltyImplV1R2.new(
                        {from: owner}
                    );

                    await royaltyImplV1R2.init(RECIPIENTS, SPLITS);

                })

                context('totalRecipients()', async () => {

                    it('returns the correct number of recipients', async () => {
                        expect(await royaltyImplV1R2.totalRecipients()).to.bignumber.equal(THREE);
                    })

                })

                context('royaltyAtIndex()', async () => {

                    it('returns address and split values for given recipient index', async () => {

                        for (let i = 0; i < RECIPIENTS.length; i++) {
                            const royalty = await royaltyImplV1R2.royaltyAtIndex(i);
                            expect(royalty.recipient).to.bignumber.equal(RECIPIENTS[i]);
                            expect(royalty.split).to.bignumber.equal(SPLITS[i]);

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

                    await royaltyImplV2.init(RECIPIENTS, SPLITS);

                })

            })

            context('once initialized', async () => {

                beforeEach(async () => {

                    // Royalty Funds Handler V2: Splitter
                    royaltyImplV2 = await RoyaltyImplV2.new(
                        {from: owner}
                    );

                    await royaltyImplV2.init(RECIPIENTS, SPLITS);

                })

                context('totalRecipients()', async () => {

                    it('returns the correct number of recipients', async () => {
                        expect(await royaltyImplV2.totalRecipients()).to.bignumber.equal(THREE);
                    })

                })

                context('royaltyAtIndex()', async () => {

                    it('returns address and split values for given recipient index', async () => {

                        for (let i = 0; i < RECIPIENTS.length; i++) {
                            const royalty = await royaltyImplV2.royaltyAtIndex(i);
                            expect(royalty.recipient).to.bignumber.equal(RECIPIENTS[i]);
                            expect(royalty.split).to.bignumber.equal(SPLITS[i]);

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

    describe('Proxy', () => {

        beforeEach(async () => {

            // ----------------------
            // Create implementations
            // ----------------------

            // Royalty Funds Handler V1: Receiver (revision 1)
            royaltyImplV1R1 = await RoyaltyImplV1R1.new(
                {from: owner}
            );
            await royaltyImplV1R1.init(RECIPIENTS, SPLITS);

            // Royalty Funds Handler V2: Receiver (revision 2)
            royaltyImplV1R2 = await RoyaltyImplV1R2.new(
                {from: owner}
            );
            await royaltyImplV1R2.init(RECIPIENTS, SPLITS);

            // Royalty Funds Handler V2: Splitter
            royaltyImplV2 = await RoyaltyImplV2.new(
                {from: owner}
            );
            await royaltyImplV2.init(RECIPIENTS, SPLITS);

            // Beacon for Funds Handler V1
            v1RoyaltyBeacon = await RoyaltyBeacon.new(
                royaltyImplV1R1.address
            )

            // Beacon for Funds Handler V2
            v2RoyaltyBeacon = await RoyaltyBeacon.new(
                royaltyImplV2.address
            )

        });

        context('RoyaltyProxy constructor', async () => {

            it('can be deployed with V1 beacon', async () => {

                // Beacon for Royalty Funds Handler V1
                await RoyaltyProxy.new(v1RoyaltyBeacon.address, [], {from: owner});

            });

            it('can be deployed with V2 beacon', async () => {

                // Beacon for Royalty Funds Handler V1
                await RoyaltyProxy.new(v1RoyaltyBeacon.address, [], {from: owner});

            });

            context('once deployed with V1 beacon', async () => {

                beforeEach(async () => {

                    // Proxy for Royalty Funds Handler V1
                    royaltyProxy = await RoyaltyProxy.new(v1RoyaltyBeacon.address, [], {from: owner});

                });

                context('totalRecipients()', async () => {

                    it('reverts, a faux bug', async () => {
                        expectRevert(royaltyProxy.totalRecipients(),"Woops, there's a bug!")
                    })

                })

            })

            context('once deployed with V2 beacon', async () => {

                beforeEach(async () => {

                    // Proxy for Royalty Funds Handler V2
                    royaltyProxy = await RoyaltyProxy.new(v2RoyaltyBeacon.address, [], {from: owner});

                });

                context('totalRecipients()', async () => {

                    it('returns the correct number of recipients', async () => {
                        expect(await royaltyProxy.totalRecipients()).to.bignumber.equal(THREE);
                    })

                })

                context('royaltyAtIndex()', async () => {

                    it('returns address and split values for given recipient index', async () => {

                        for (let i = 0; i < RECIPIENTS.length; i++) {
                            const royalty = await royaltyProxy.royaltyAtIndex(i);
                            expect(royalty.recipient).to.bignumber.equal(RECIPIENTS[i]);
                            expect(royalty.split).to.bignumber.equal(SPLITS[i]);

                        }

                    })

                })

            })


        });

    });



});
