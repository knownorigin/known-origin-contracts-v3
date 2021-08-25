require('dotenv').config();
const fs = require('fs');
const _ = require('lodash');
const axios = require('axios');

(async function () {

  const {data: allArtists} = await axios.get('https://us-central1-known-origin-io.cloudfunctions.net/main/api/artist/collective');

  // Generate raw data
  const allActiveEnabledArtists = _.chain(allArtists)
    .filter({enabled: true})
    .filter({isArtist: true})
    .map((data) => {
      return {
        ..._.pick(data, ['address', 'created', 'updated', 'username']),
        balance: 1 // balance of 1 means they can mint
      };
    })
    .value();

  // Generate merkle config
  const merkleConfig = _.chain(allActiveEnabledArtists)
    .keyBy('address')
    .mapValues('balance')
    .value();

  fs.writeFileSync('./utils/v3-migration/all-artists.json', JSON.stringify(allActiveEnabledArtists, null, 2));
  fs.writeFileSync('./utils/v3-migration/merkle-config.json', JSON.stringify(merkleConfig, null, 2));
})();


