#!/usr/bin/env node

import csv = require('fast-csv');
import fs = require('fs');
import options = require('commander');
import path = require('path');
import through2 = require('through2');
import sanitizeFilename = require('sanitize-filename');

import grouper from './src/grouper';
import geocoder from './src/geocoder';
import { DEFAULTS, FullOptions, OutputStreamFormat } from './src/options';
import streamSplitter from './src/streamSplitter';

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));

options
  .version(packageJson.version)
  .option('-i, --input [file]', 'Input (csv file) [stdin]', '-')
  .option('-o, --output [file]', 'Output (csv file) [stdout]', '-')
  .option('-s, --street-col [col_csv]', 'Street col CSV [street]', DEFAULTS.streetCol)
  .option('-z, --zipcode-col [col]', 'Zipcode col [zipcode]', DEFAULTS.zipcodeCol)
  .option('-c, --city-col [col]', 'City col [city]', DEFAULTS.cityCol)
  .option('-S, --state-col [col]', 'State col [state]', DEFAULTS.stateCol) // short forms are dumb
  .option('--zipcode-filter [zips]', 'Only geocode records in certain zipcodes, comma separated', '')
  .option('--state-filter [states]', 'Only geocode records in certain states, comma separated', '')
  .option('-d, --delimiter [symbol]', 'CSV delimiter in input file', ',')
  .option('-O, --output-split [column]', 'Write to multiple files divided by column', '')
  .option('--truncate-split [length]', 'Used with --output-split, truncate column to first X characters', 0)
  .option('-a, --auth-id [id]', 'SmartyStreets auth id [environment variable smartystreets_auth_id]', process.env.SMARTYSTREETS_AUTH_ID)
  .option('-A, --auth-token [token]', 'SmartyStreets auth token [environment variable smartystreets_auth_token]', process.env.SMARTYSTREETS_AUTH_TOKEN)
  .option('-j, --concurrency [jobs]', 'Maximum number of concurrent requests [48]', DEFAULTS.concurrency)
  .option('-✈, --column-definition [mode]', 'Column definition mode or file [standard]', 'standard')
  .option('-p, --column-prefix [text]', 'Prefix for smartystreets columns in the output file [ss_]', DEFAULTS.columnPrefix)
  .option('-x, --column-suffix [text]', 'Suffix for smartystreets columns in the output file', DEFAULTS.columnSuffix)
  .option('--include-invalid', 'Activates agressive matching by setting the header X-Include-Invalid to true')
  .option('-q, --quiet', 'Quiet mode - turn off progress messages')
  .option('-l, --log-interval [num]', 'Show progress after every X number of rows [1000]', DEFAULTS.logInterval)
  .option('--retry-timeout [num]', 'Retry failed requests after X milliseconds [30000]', DEFAULTS.retryTimeout)
  .option('--drop-threshold [rows]', 'Maximum number of rows that can be dropped due to api failures [Infinity]', 'infinity')
  .parse(process.argv);

options.concurrency = parseInt(options.concurrency);
options.truncateSplit = parseInt(options.truncateSplit);

if (!options.concurrency) {
  console.error('Invalid concurrency');
  options.help();
}

if (!options.authId) {
  console.error('Please specify a SmartyStreets auth id');
  options.help();
}

if (!options.authToken) {
  console.error('Please specify a SmartyStreets auth token');
  options.help();
}

if (!options.input) {
  console.error('Please specify an input file');
  options.help();
} else {
  if (options.input == '-' && !options.quiet) {
    console.error('***********************************************')
    console.error('Processing from STDIN')
    console.error('***********************************************')
  } else if (!options.quiet) {
    console.error('***********************************************')
    console.error('Processing ' + options.input)
    console.error('***********************************************')
  }
}
if (!options.output) {
  console.error('Please specify an output file');
  options.help();
}

if (typeof options.dropThreshold !== 'string' || options.dropThreshold.toLowerCase() === 'infinity') {
  options.dropThreshold = null;
} else {
  options.dropThreshold = Number(options.dropThreshold);
  if (options.dropThreshold < 0 || options.dropThreshold % 1 !== 0) {
    console.error('invalid drop threshold, if specified it must be a positive integer or zero');
    options.help();
  }
}

options.streetCol = (options.streetCol && options.streetCol.indexOf(',') !== -1) ? options.streetCol.split(',') : options.streetCol;
const filterOptions = {
  zipcodeFilter: options.zipcodeFilter.length ? options.zipcodeFilter.split(',') : false,
  stateFilter: options.stateFilter.length ? options.stateFilter.split(',') : false,
}

const columnModes = ['mail', 'standard', 'complete', 'basic'];
if (columnModes.indexOf(options.columnDefinition) != -1) {
  //modes are in structure/mode.json
  options.structure = JSON.parse( fs.readFileSync(__dirname+'/../structure/'+options.columnDefinition+'.json', 'utf8') );
} else if (options.columnDefinition.substr(0, 1) == '{') {
  //it's a JSON object
  options.structure = JSON.parse(options.columnDefinition);
} else {
  //it's a JSON file
  options.structure = JSON.parse( fs.readFileSync(options.columnDefinition, 'utf8') );
}

// Default booleans to `false` instead of `undefined`.
if (!options.quiet) {
  options.quiet = false
}
if (!options.includeInvalid) {
  options.includeInvalid = false
}

const readStream = options.input == '-' ? process.stdin : fs.createReadStream(options.input);

let writeStream;
if (options.outputSplit) {
  try {
    fs.mkdirSync(options.output);
  } catch(e) {
    if ( e.code != 'EEXIST' ) throw e;
  }

  let firstRow = true, rowIndex: number, headers: string | undefined;

  writeStream = streamSplitter(function(row){
    if (firstRow) {
      firstRow = false;
      rowIndex = row.indexOf(options.outputSplit);
      headers = row;

      if (rowIndex == -1) {
        console.error('couldn\'t find column', options.outputSplit, 'in', row);
        process.exit();
      }

      return false;
    }
    let cell = String(row[rowIndex] || '');

    if (options.truncateSplit !== 0) {
      cell = cell.substr(0, options.truncateSplit);
    }

    return cell;
  }, function(streamName){
    const source = csv.createWriteStream();
    if (typeof headers !== 'undefined') {
      source.write(headers);
    } else {
      throw new Error("Could not find headers in stream")
    }
    source.pipe( fs.createWriteStream(options.output+'/'+sanitizeFilename(streamName)+'.csv') );
    return source;
  }, {objectMode: true});
} else if (options.output == '-') {
  writeStream = csv.createWriteStream();
  writeStream.pipe( process.stdout );
} else {
  writeStream = csv.createWriteStream();
  writeStream.pipe( fs.createWriteStream(options.output) );
}

/**
 * Verify that an option has the requested type. The caller is responsible for
 * setting `T` and `type` in a compatible fashion.
 */
function checkOpt<T>(options: { [key: string]: any }, key: string, type: string | string[]): T {
  if (typeof options[key] === type)
    return options[key]
  else
    throw new Error(`Expected ${key} to be of type ${type}, got ${JSON.stringify(options[key])}`)
}

function checkStreetCol(streetCol: any): string | string[] {
  if (typeof streetCol === 'string' || Array.isArray(streetCol))
    return streetCol
  else
    throw new Error(`Expected streetCol to be of type string or string[], got ${JSON.stringify(streetCol)}`)

}

function checkDropThreshold(dropThreshold: any): number | null {
  if (typeof dropThreshold === 'number' || dropThreshold === null)
    return dropThreshold
  else
    throw new Error(`Expected dropThreshold to be of type string or null, got ${JSON.stringify(dropThreshold)}`)
}

// Make sure we pass all `options` fields, and that all values have the correct
// type. This is mostly to ensure that our CLI and our API actually match, but
// it may also catch some invalid CLI options, too.
const geocodeOptions: FullOptions = {
  authId: checkOpt<string>(options, 'authId', 'string'),
  authToken: checkOpt<string>(options, 'authToken', 'string'),
  structure: checkOpt<object>(options, 'structure', 'object'),
  streetCol: checkStreetCol(options.streetCol),
  zipcodeCol: checkOpt<string>(options, 'zipcodeCol', 'string'),
  cityCol: checkOpt<string>(options, 'cityCol', 'string'),
  stateCol: checkOpt<string>(options, 'stateCol', 'string'),
  concurrency: checkOpt<number>(options, 'concurrency', 'number'),
  columnPrefix: checkOpt<string>(options, 'columnPrefix', 'string'),
  columnSuffix: checkOpt<string>(options, 'columnSuffix', 'string'),
  quiet: checkOpt<boolean>(options, 'quiet', 'boolean'),
  logInterval: checkOpt<number>(options, 'logInterval', 'number'),
  dropThreshold: checkDropThreshold(options.dropThreshold),
  retryTimeout: checkOpt<number>(options, 'retryTimeout', 'number'),
  includeInvalid: checkOpt<boolean>(options, 'includeInvalid', 'boolean'),
  outputStreamFormat: "array",
}

const streetColArray = Array.isArray(options.streetCol);
readStream.pipe(csv({headers: true, delimiter: options.delimiter}))
  .pipe(through2.obj(function(row, enc, cb){
    if (!streetColArray && !row[options.streetCol]) {
      cb();
    } else if (filterOptions.zipcodeFilter !== false && filterOptions.zipcodeFilter.indexOf(row[options.zipcodeCol]) === -1) {
      cb();
    } else if (filterOptions.stateFilter !== false && filterOptions.stateFilter.indexOf(row[options.stateCol]) === -1) {
      cb();
    } else {
      cb(null, row);
    }
  }))
  .pipe(grouper(70))
  // Coerce our parsed command-line args to an `Options` structure in a really
  // dubious fashion. We actually include far more keys than should appear in
  // `Options`.
  .pipe(geocoder(geocodeOptions))
  .pipe(writeStream);
