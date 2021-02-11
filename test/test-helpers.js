const _ = require('lodash');
const {expect} = require('chai');

const validateEditionAndToken = async function (
  {tokenId, editionId, owner, ownerBalance, creator, creatorBalance, size, uri}
) {
  console.log(`Validate token [${tokenId}] and edition [${editionId}]`);

  if (ownerBalance) {
    expect(await this.token.balanceOf(owner)).to.be.bignumber.equal(ownerBalance, "Failed owner balance validation");
  }
  if (creatorBalance) {
    expect(await this.token.balanceOf(creator)).to.be.bignumber.equal(creatorBalance, "Failed creator balance validation");
  }

  ////////////////////
  // Edition checks //
  ////////////////////

  const _creator = await this.token.getCreatorOfEdition(editionId);
  expect(_creator).to.equal(creator, "Failed Edition creator validation")

  const _size = await this.token.getSizeOfEdition(editionId);
  expect(_size).to.bignumber.equal(size, "Failed Edition size validation")

  const exists = await this.token.editionExists(editionId);
  expect(exists).to.equal(true, "Failed Edition exists validation")

  //////////////////
  // Token checks //
  //////////////////

  await validateToken({tokenId, editionId, owner, creator, size, uri});
}

const validateToken = async function ({tokenId, editionId, owner, creator, size, uri}) {
  console.log(`Validate token [${tokenId}]`);

  const _editionId = await this.token.getEditionIdOfToken(tokenId);
  expect(_editionId).to.bignumber.equal(editionId, "Failed Edition ID validation")

  expect(await this.token.ownerOf(tokenId)).to.equal(owner, "Failed owner validation");

  const _tokenEditionSize = await this.token.getEditionSizeOfToken(tokenId);
  expect(_tokenEditionSize).to.bignumber.equal(size, "Failed Token edition size validation")

  const _uri = await this.token.tokenURI(tokenId);
  expect(_uri).to.equal(uri, "Failed token URI validation")

  const _tokenCreator = await this.token.getCreatorOfToken(tokenId);
  expect(_tokenCreator).to.equal(creator, "Failed token edition creator validation")

  const editionDetails = await this.token.getEditionDetails(tokenId);
  expect(editionDetails._originalCreator).to.equal(creator, "Failed edition details creator validation")
  expect(editionDetails._owner).to.equal(owner, "Failed edition details owner validation")
  expect(editionDetails._editionId).to.bignumber.equal(editionId, "Failed edition details edition validation")
  expect(editionDetails._size).to.bignumber.equal(size, "Failed edition details size validation")
  expect(editionDetails._uri).to.equal(uri, "Failed edition details uri validation")
}

module.exports = {
  validateEditionAndToken,
  validateToken
};
