exports.buildArtistMerkleInput = (limit, ...accounts) => {
  const proofObj = {};

  for (let i = 0; i < accounts.length; i++) {
    proofObj[accounts[i]] = limit;
  }

  return proofObj;
};