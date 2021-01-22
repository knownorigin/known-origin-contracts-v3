const {BN, constants, expectEvent, expectRevert} = require('@openzeppelin/test-helpers');
const {ZERO_ADDRESS} = constants;

const web3 = require('web3');

const {expect} = require('chai');

const {shouldSupportInterfaces} = require('./SupportsInterface.behavior');

const KnownOriginDigitalAssetV3 = artifacts.require('KnownOriginDigitalAssetV3');
const KOAccessControls = artifacts.require('KOAccessControls');
const EditionRegistry = artifacts.require('EditionRegistry');

contract('ERC721', function (accounts) {
  const [owner, minter, approved, anotherApproved, operator, other, publisher, creator] = accounts;

  const firstTokenId = new BN('1');
  const secondTokenId = new BN('2');
  const nonExistentTokenId = new BN('99999999999');

  const RECEIVER_MAGIC_VALUE = '0x150b7a02';

  beforeEach(async function () {
    // setu paccess controls
    this.accessControls = await KOAccessControls.new({from: owner});

    // grab the roles
    this.MINTER_ROLE = await this.accessControls.MINTER_ROLE();
    this.CONTRACT_ROLE = await this.accessControls.CONTRACT_ROLE();

    // Set up access controls with minter roles
    await this.accessControls.grantRole(this.MINTER_ROLE, owner, {from: owner});
    await this.accessControls.grantRole(this.MINTER_ROLE, minter, {from: owner});

    // setup edition registry
    this.STARTING_EDITION = '10000'
    this.editionRegistry = await EditionRegistry.new(
      this.accessControls.address,
      this.STARTING_EDITION,
      {from: owner}
    );

    // Create token V3
    this.token = await KnownOriginDigitalAssetV3.new(
      this.accessControls.address,
      this.editionRegistry.address,
      {from: owner}
    );

    // Set contract as minter role
    await this.accessControls.grantRole(this.CONTRACT_ROLE, this.token.address, {from: owner});

    // enable NFT in the registry contract
    await this.editionRegistry.enableNftContract(this.token.address, {from: owner});
  });

  shouldSupportInterfaces([
    'ERC165',
    'ERC721',
    'ERC721Metadata',
  ]);

  describe('metadata', function () {
    it('has a name', async function () {
      expect(await this.token.name()).to.be.equal("KnownOriginDigitalAsset");
    });

    it('has a symbol', async function () {
      expect(await this.token.symbol()).to.be.equal("KODA");
    });

    // describe('token URI', function () {
    //   beforeEach(async function () {
    //     await this.token.mint('#blockrocket', publisher, creator);
    //   });
    //
    //   const baseURI = 'https://api.com/v2/';
    //
    //   it('it is not empty by default', async function () {
    //     expect(await this.token.tokenURI(firstTokenId)).to.be.equal('https://api.com/v1/1');
    //   });
    //
    //   it('reverts when queried for non existent token id', async function () {
    //     await expectRevert(
    //       this.token.tokenURI(nonExistentTokenId), 'Token ID must exist',
    //     );
    //   });
    //
    //   it('base URI can be set', async function () {
    //     await this.token.setBaseURI(baseURI);
    //     expect(await this.token.baseURI()).to.equal(baseURI);
    //   });
    //
    //   it('tokenId is appended to base URI', async function () {
    //     await this.token.setBaseURI(baseURI);
    //
    //     expect(await this.token.tokenURI(firstTokenId)).to.be.equal(baseURI + firstTokenId);
    //   });
    // });
  });

  // context('with minted tokens', function () {
  //   beforeEach(async function () {
  //     // this mints to the protocol where owner is address zero
  //     await this.token.mint('#blockrocket', publisher, creator);
  //     await this.token.mint('#michael', publisher, creator);
  //     await this.token.mint('#vince', publisher, creator);
  //
  //     this.toWhom = other; // default to other for toWhom in context-dependent tests
  //   });
  //
  //   describe('balanceOf', function () {
  //     context('when the given address owns some tokens', function () {
  //       it('returns the amount of tokens owned by the given address', async function () {
  //         await this.token.transferFrom(owner, other, firstTokenId, {from: owner});
  //         await this.token.transferFrom(owner, other, secondTokenId, {from: owner});
  //
  //         expect(await this.token.balanceOf(other)).to.be.bignumber.equal('2'); // platform owns minted before auction
  //       });
  //     });
  //
  //     context('when the given address does not own any tokens', function () {
  //       it('returns 0', async function () {
  //         expect(await this.token.balanceOf(other)).to.be.bignumber.equal('0');
  //       });
  //     });
  //
  //     context('when querying the zero address', function () {
  //       it('throws', async function () {
  //         await expectRevert(
  //           this.token.balanceOf(ZERO_ADDRESS), 'ERC721_ZERO_OWNER',
  //         );
  //       });
  //     });
  //   });
  //
  //   describe('ownerOf', function () {
  //     context('when the given token ID was tracked by this token', function () {
  //
  //       it('returns address zero when token is owned by platform', async function () {
  //         expect(await this.token.ownerOf(firstTokenId)).to.be.equal(owner); // platform owns minted before auction
  //         expect((await this.token.tokenIdToHashtag(firstTokenId)).creator).to.be.equal(creator);
  //       })
  //
  //       it('returns the owner of the given token ID when not owned by the platform', async function () {
  //         // send #vince to other
  //         await this.token.transferFrom(owner, other, '3', {from: owner});
  //
  //         expect(await this.token.ownerOf('3')).to.be.equal(other); // platform owns minted before auction
  //       });
  //     });
  //   });
  //
  //   describe('transfers', function () {
  //     const tokenId = firstTokenId;
  //     const data = '0x42';
  //
  //     let logs = null;
  //
  //     beforeEach(async function () {
  //       await this.token.approve(approved, tokenId, {from: owner});
  //       await this.token.setApprovalForAll(operator, true, {from: owner});
  //     });
  //
  //     const transferWasSuccessful = function ({owner, tokenId, approved}) {
  //       it('transfers the ownership of the given token ID to the given address', async function () {
  //         expect(await this.token.ownerOf(tokenId)).to.be.equal(this.toWhom);
  //       });
  //
  //       it('emits a Transfer event', async function () {
  //         expectEvent.inLogs(logs, 'Transfer', {from: owner, to: this.toWhom, tokenId: tokenId});
  //       });
  //
  //       it('clears the approval for the token ID', async function () {
  //         expect(await this.token.getApproved(tokenId)).to.be.equal(ZERO_ADDRESS);
  //       });
  //
  //       it('adjusts owner and new owner balances', async function () {
  //         expect(await this.token.balanceOf(owner)).to.be.bignumber.equal('0');
  //         expect(await this.token.balanceOf(this.toWhom)).to.be.bignumber.equal('1');
  //       });
  //
  //       it('adjusts owners tokens by index', async function () {
  //         if (!this.token.tokenOfOwnerByIndex) return;
  //
  //         expect(await this.token.tokenOfOwnerByIndex(this.toWhom, 0)).to.be.bignumber.equal(tokenId);
  //
  //         expect(await this.token.tokenOfOwnerByIndex(owner, 0)).to.be.bignumber.not.equal(tokenId);
  //       });
  //     };
  //
  //     const shouldTransferTokensByUsers = function (transferFunction) {
  //       context('when called by the owner', function () {
  //         beforeEach(async function () {
  //           ({logs} = await transferFunction.call(this, owner, this.toWhom, tokenId, {from: owner}));
  //         });
  //         transferWasSuccessful({owner, tokenId, approved});
  //       });
  //
  //       context('when called by the approved individual', function () {
  //         beforeEach(async function () {
  //           ({logs} = await transferFunction.call(this, owner, this.toWhom, tokenId, {from: approved}));
  //         });
  //         transferWasSuccessful({owner, tokenId, approved});
  //       });
  //
  //       context('when called by the operator', function () {
  //         beforeEach(async function () {
  //           ({logs} = await transferFunction.call(this, owner, this.toWhom, tokenId, {from: operator}));
  //         });
  //         transferWasSuccessful({owner, tokenId, approved});
  //       });
  //
  //       context('when called by the owner without an approved user', function () {
  //         beforeEach(async function () {
  //           await this.token.approve(ZERO_ADDRESS, tokenId, {from: owner});
  //           ({logs} = await transferFunction.call(this, owner, this.toWhom, tokenId, {from: operator}));
  //         });
  //         transferWasSuccessful({owner, tokenId, approved: null});
  //       });
  //
  //       context('when sent to the owner', function () {
  //         beforeEach(async function () {
  //           await transferFunction.call(this, owner, other, tokenId, {from: owner});
  //
  //           expect(await this.token.balanceOf(other)).to.be.bignumber.equal('1');
  //
  //           ({logs} = await transferFunction.call(this, other, other, tokenId, {from: other}));
  //         });
  //
  //         it('keeps ownership of the token', async function () {
  //           expect(await this.token.ownerOf(tokenId)).to.be.equal(other);
  //         });
  //
  //         it('clears the approval for the token ID', async function () {
  //           expect(await this.token.getApproved(tokenId)).to.be.equal(ZERO_ADDRESS);
  //         });
  //
  //         it('emits only a transfer event', async function () {
  //           expectEvent.inLogs(logs, 'Transfer', {
  //             from: other,
  //             to: other,
  //             tokenId: tokenId,
  //           });
  //         });
  //
  //         it('keeps the owner balance', async function () {
  //           expect(await this.token.balanceOf(other)).to.be.bignumber.equal('1');
  //         });
  //
  //         it('keeps same tokens by index', async function () {
  //           if (!this.token.tokenOfOwnerByIndex) return;
  //           const tokensListed = await Promise.all(
  //             [0].map(i => this.token.tokenOfOwnerByIndex(other, i)),
  //           );
  //           expect(tokensListed.map(t => t.toNumber())).to.have.members(
  //             [firstTokenId.toNumber()],
  //           );
  //         });
  //       });
  //
  //       context('when the address of the previous owner is incorrect', function () {
  //         it('reverts', async function () {
  //           await expectRevert(
  //             transferFunction.call(this, other, other, tokenId, {from: owner}),
  //             'ERC721_OWNER_MISMATCH',
  //           );
  //         });
  //       });
  //
  //       context('when the sender is not authorized for the token id', function () {
  //         it('reverts', async function () {
  //           await expectRevert(
  //             transferFunction.call(this, owner, other, tokenId, {from: other}),
  //             'ERC721_INVALID_SPENDER',
  //           );
  //         });
  //       });
  //
  //       context('when the given token ID does not exist', function () {
  //         it('reverts', async function () {
  //           await expectRevert(
  //             transferFunction.call(this, owner, other, nonExistentTokenId, {from: owner}),
  //             'ERC721_ZERO_OWNER',
  //           );
  //         });
  //       });
  //
  //       context('when the address to transfer the token to is the zero address', function () {
  //         it('reverts', async function () {
  //           await expectRevert(
  //             transferFunction.call(this, owner, ZERO_ADDRESS, tokenId, {from: owner}),
  //             'ERC721_ZERO_TO_ADDRESS',
  //           );
  //         });
  //       });
  //     };
  //
  //     describe('via transferFrom', function () {
  //       shouldTransferTokensByUsers(function (from, to, tokenId, opts) {
  //         return this.token.transferFrom(from, to, tokenId, opts);
  //       });
  //     });
  //
  //     describe('via safeTransferFrom', function () {
  //       const safeTransferFromWithData = function (from, to, tokenId, opts) {
  //         return this.token.methods['safeTransferFrom(address,address,uint256,bytes)'](from, to, tokenId, data, opts);
  //       };
  //
  //       const safeTransferFromWithoutData = function (from, to, tokenId, opts) {
  //         return this.token.methods['safeTransferFrom(address,address,uint256)'](from, to, tokenId, opts);
  //       };
  //
  //       const shouldTransferSafely = function (transferFun, data) {
  //         describe('to a user account', function () {
  //           shouldTransferTokensByUsers(transferFun);
  //         });
  //
  //         describe('to a valid receiver contract', function () {
  //           beforeEach(async function () {
  //             this.receiver = await ERC721ReceiverMock.new(RECEIVER_MAGIC_VALUE, false);
  //             this.toWhom = this.receiver.address;
  //           });
  //
  //           shouldTransferTokensByUsers(transferFun);
  //
  //           it('calls onERC721Received', async function () {
  //             const receipt = await transferFun.call(this, owner, this.receiver.address, tokenId, {from: owner});
  //
  //             await expectEvent.inTransaction(receipt.tx, ERC721ReceiverMock, 'Received', {
  //               operator: owner,
  //               from: owner,
  //               tokenId: tokenId,
  //               data: data,
  //             });
  //           });
  //
  //           it('calls onERC721Received from approved', async function () {
  //             const receipt = await transferFun.call(this, owner, this.receiver.address, tokenId, {from: approved});
  //
  //             await expectEvent.inTransaction(receipt.tx, ERC721ReceiverMock, 'Received', {
  //               operator: approved,
  //               from: owner,
  //               tokenId: tokenId,
  //               data: data,
  //             });
  //           });
  //
  //           describe('with an invalid token id', function () {
  //             it('reverts', async function () {
  //               await expectRevert(
  //                 transferFun.call(
  //                   this,
  //                   owner,
  //                   this.receiver.address,
  //                   nonExistentTokenId,
  //                   {from: owner},
  //                 ),
  //                 'ERC721_ZERO_OWNER',
  //               );
  //             });
  //           });
  //         });
  //       };
  //
  //       describe('with data', function () {
  //         shouldTransferSafely(safeTransferFromWithData, data);
  //       });
  //
  //       describe('without data', function () {
  //         shouldTransferSafely(safeTransferFromWithoutData, null);
  //       });
  //
  //       describe('to a receiver contract returning unexpected value', function () {
  //         it('reverts', async function () {
  //           const invalidReceiver = await ERC721ReceiverMock.new('0x42', false);
  //           await expectRevert(
  //             this.token.safeTransferFrom(owner, invalidReceiver.address, tokenId, {from: owner}),
  //             'ERC721_INVALID_SELECTOR',
  //           );
  //         });
  //       });
  //
  //       describe('to a receiver contract that throws', function () {
  //         it('reverts', async function () {
  //           const revertingReceiver = await ERC721ReceiverMock.new(RECEIVER_MAGIC_VALUE, true);
  //           await expectRevert(
  //             this.token.safeTransferFrom(owner, revertingReceiver.address, tokenId, {from: owner}),
  //             'ERC721ReceiverMock: reverting',
  //           );
  //         });
  //       });
  //
  //       describe('to a contract that does not implement the required function', function () {
  //         it('reverts', async function () {
  //           const nonReceiver = this.accessControls;
  //           await expectRevert.unspecified(
  //             this.token.safeTransferFrom(owner, nonReceiver.address, tokenId, {from: owner})
  //           );
  //         });
  //       });
  //     });
  //   });
  //
  //   describe('approve', function () {
  //     const tokenId = firstTokenId;
  //
  //     let logs = null;
  //
  //     const itClearsApproval = function () {
  //       it('clears approval for the token', async function () {
  //         expect(await this.token.getApproved(tokenId)).to.be.equal(ZERO_ADDRESS);
  //       });
  //     };
  //
  //     const itApproves = function (address) {
  //       it('sets the approval for the target address', async function () {
  //         expect(await this.token.getApproved(tokenId)).to.be.equal(address);
  //       });
  //     };
  //
  //     const itEmitsApprovalEvent = function (address) {
  //       it('emits an approval event', async function () {
  //         expectEvent.inLogs(logs, 'Approval', {
  //           owner: owner,
  //           approved: address,
  //           tokenId: tokenId,
  //         });
  //       });
  //     };
  //
  //     context('when clearing approval', function () {
  //       context('when there was no prior approval', function () {
  //         beforeEach(async function () {
  //           ({logs} = await this.token.approve(ZERO_ADDRESS, tokenId, {from: owner}));
  //         });
  //
  //         itClearsApproval();
  //         itEmitsApprovalEvent(ZERO_ADDRESS);
  //       });
  //
  //       context('when there was a prior approval', function () {
  //         beforeEach(async function () {
  //           await this.token.approve(approved, tokenId, {from: owner});
  //           ({logs} = await this.token.approve(ZERO_ADDRESS, tokenId, {from: owner}));
  //         });
  //
  //         itClearsApproval();
  //         itEmitsApprovalEvent(ZERO_ADDRESS);
  //       });
  //     });
  //
  //     context('when approving a non-zero address', function () {
  //       context('when there was no prior approval', function () {
  //         beforeEach(async function () {
  //           ({logs} = await this.token.approve(approved, tokenId, {from: owner}));
  //         });
  //
  //         itApproves(approved);
  //         itEmitsApprovalEvent(approved);
  //       });
  //
  //       context('when there was a prior approval to the same address', function () {
  //         beforeEach(async function () {
  //           await this.token.approve(approved, tokenId, {from: owner});
  //           ({logs} = await this.token.approve(approved, tokenId, {from: owner}));
  //         });
  //
  //         itApproves(approved);
  //         itEmitsApprovalEvent(approved);
  //       });
  //
  //       context('when there was a prior approval to a different address', function () {
  //         beforeEach(async function () {
  //           await this.token.approve(anotherApproved, tokenId, {from: owner});
  //           ({logs} = await this.token.approve(anotherApproved, tokenId, {from: owner}));
  //         });
  //
  //         itApproves(anotherApproved);
  //         itEmitsApprovalEvent(anotherApproved);
  //       });
  //     });
  //
  //     context('when the sender does not own the given token ID', function () {
  //       it('reverts', async function () {
  //         await expectRevert(this.token.approve(approved, tokenId, {from: other}),
  //           'ERC721_INVALID_SENDER');
  //       });
  //     });
  //
  //     context('when the sender is approved for the given token ID', function () {
  //       it('reverts', async function () {
  //         await this.token.approve(approved, tokenId, {from: owner});
  //         await expectRevert(this.token.approve(anotherApproved, tokenId, {from: approved}),
  //           'ERC721_INVALID_SENDER');
  //       });
  //     });
  //
  //     context('when the sender is an operator', function () {
  //       beforeEach(async function () {
  //         await this.token.setApprovalForAll(operator, true, {from: owner});
  //         ({logs} = await this.token.approve(approved, tokenId, {from: operator}));
  //       });
  //
  //       itApproves(approved);
  //       itEmitsApprovalEvent(approved);
  //     });
  //
  //     context('when the given token ID does not exist', function () {
  //       it('reverts', async function () {
  //         await expectRevert(this.token.approve(approved, nonExistentTokenId, {from: operator}),
  //           'ERC721_ZERO_OWNER');
  //       });
  //     });
  //   });
  //
  //   describe('setApprovalForAll', function () {
  //     context('when the operator willing to approve is not the owner', function () {
  //       context('when there is no operator approval set by the sender', function () {
  //         it('approves the operator', async function () {
  //           await this.token.setApprovalForAll(operator, true, {from: owner});
  //
  //           expect(await this.token.isApprovedForAll(owner, operator)).to.equal(true);
  //         });
  //
  //         it('emits an approval event', async function () {
  //           const {logs} = await this.token.setApprovalForAll(operator, true, {from: owner});
  //
  //           expectEvent.inLogs(logs, 'ApprovalForAll', {
  //             owner: owner,
  //             operator: operator,
  //             approved: true,
  //           });
  //         });
  //       });
  //
  //       context('when the operator was set as not approved', function () {
  //         beforeEach(async function () {
  //           await this.token.setApprovalForAll(operator, false, {from: owner});
  //         });
  //
  //         it('approves the operator', async function () {
  //           await this.token.setApprovalForAll(operator, true, {from: owner});
  //
  //           expect(await this.token.isApprovedForAll(owner, operator)).to.equal(true);
  //         });
  //
  //         it('emits an approval event', async function () {
  //           const {logs} = await this.token.setApprovalForAll(operator, true, {from: owner});
  //
  //           expectEvent.inLogs(logs, 'ApprovalForAll', {
  //             owner: owner,
  //             operator: operator,
  //             approved: true,
  //           });
  //         });
  //
  //         it('can unset the operator approval', async function () {
  //           await this.token.setApprovalForAll(operator, false, {from: owner});
  //
  //           expect(await this.token.isApprovedForAll(owner, operator)).to.equal(false);
  //         });
  //       });
  //
  //       context('when the operator was already approved', function () {
  //         beforeEach(async function () {
  //           await this.token.setApprovalForAll(operator, true, {from: owner});
  //         });
  //
  //         it('keeps the approval to the given address', async function () {
  //           await this.token.setApprovalForAll(operator, true, {from: owner});
  //
  //           expect(await this.token.isApprovedForAll(owner, operator)).to.equal(true);
  //         });
  //
  //         it('emits an approval event', async function () {
  //           const {logs} = await this.token.setApprovalForAll(operator, true, {from: owner});
  //
  //           expectEvent.inLogs(logs, 'ApprovalForAll', {
  //             owner: owner,
  //             operator: operator,
  //             approved: true,
  //           });
  //         });
  //       });
  //     });
  //   });
  //
  //   describe('getApproved', async function () {
  //     context('when token has been minted ', async function () {
  //       it('should return the zero address', async function () {
  //         expect(await this.token.getApproved(firstTokenId)).to.be.equal(
  //           ZERO_ADDRESS,
  //         );
  //       });
  //
  //       context('when account has been approved', async function () {
  //         beforeEach(async function () {
  //           await this.token.approve(approved, firstTokenId, {from: owner});
  //         });
  //
  //         it('returns approved account', async function () {
  //           expect(await this.token.getApproved(firstTokenId)).to.be.equal(approved);
  //         });
  //       });
  //     });
  //   });
  // });

  // describe('_mint(address, uint256)', function () {
  //   context('with minted token', async function () {
  //     beforeEach(async function () {
  //       ({logs: this.logs} = await this.token.mint('#blockrocket', publisher, creator));
  //     });
  //
  //     it('emits a Transfer event', function () {
  //       expectEvent.inLogs(this.logs, 'Transfer', {from: ZERO_ADDRESS, to: owner, tokenId: firstTokenId});
  //     });
  //
  //     it('creates the token', async function () {
  //       expect(await this.token.balanceOf(owner)).to.be.bignumber.equal('0');
  //       expect(await this.token.ownerOf(firstTokenId)).to.equal(owner);
  //
  //       const hashtag = await this.token.tokenIdToHashtag(firstTokenId);
  //
  //       expect(hashtag.originalPublisher).to.equal(publisher)
  //       expect(hashtag.creator).to.equal(creator)
  //       expect(hashtag.displayVersion).to.equal('#blockrocket')
  //     });
  //   });
  // });

});
