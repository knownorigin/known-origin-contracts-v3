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
    .filter(({address}) => {
      // TODO remove once fully live
      return [
        "0x3f8c962eb167ad2f80c72b5f933511ccdf0719d4",// KO
        "0xe85f832d9f551cf445a6e8ceaaee73ef88a340d6", // Griff
        "0xa2cd656f8461d2c186d69ffb8a4a5c10eff0914d", // Aktiv
        "0xd9c575163c3fc0948490b02cce19acf8d9ec8427", // luke
        "0x70482d3bd44fbef402a0cee6d9bea516d12be128", // bren
      ].indexOf(address) > -1;
    })
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


