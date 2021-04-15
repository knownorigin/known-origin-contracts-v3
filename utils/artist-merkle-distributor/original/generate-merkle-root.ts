import {program} from 'commander'
import * as fs from 'fs';
import {parseBalanceMap} from './src/parse-balance-map'

program
    .version('0.0.0')
    .requiredOption(
        '-i, --input <path>',
        'input JSON file location containing a map of account addresses to enabled'
    )

program.parse(process.argv)

const options = program.opts();
console.log("options", options);

// @ts-ignore
const json = JSON.parse(fs.readFileSync(options.input, {encoding: 'utf8'}))

if (typeof json !== 'object') throw new Error('Invalid JSON')

// console.log(JSON.stringify(parseBalanceMap(json)))

fs.writeFileSync( __dirname + "/merkle-proofs.json", JSON.stringify(parseBalanceMap(json), null, 2));

console.log("Generated proofs");
