#!/usr/bin/env node

var csv = require('fast-csv');
var fs = require('fs');
var options = require('commander');
var grouper = require('./lib/grouper');
var geocoder = require('./lib/geocoder');
var streamSplitter = require('./lib/streamSplitter');
var through2 = require('through2');

var package = JSON.parse(fs.readFileSync(__dirname+'/package.json', 'utf8'));

options
  .version(package.version)
  .option('-i, --input [file]', 'Input (csv file) [stdin]', '-')
  .option('-o, --output [file]', 'Output (csv file) [stdout]', '-')
  .option('-s, --street-col [col]', 'Street col [street]', 'street')
  .option('-z, --zipcode-col [col]', 'Zipcode col [zipcode]', 'zipcode')
  .option('-c, --city-col [col]', 'City col [city]', 'city')
  .option('-S, --state-col [col]', 'State col [state]', 'state') // short forms are dumb
  .option('--zipcode-filter [zips]', 'Only geocode records in certain zipcodes, comma separated', '')
  .option('--state-filter [states]', 'Only geocode records in certain states, comma separated', '')
  .option('-d, --delimiter [symbol]', 'CSV delimiter in input file', ',')
  .option('-O, --output-split [column]', 'Write to multiple files divided by column', '')
  .option('--truncate-split [length]', 'Used with --output-split, truncate column to first X characters', 0)
  .option('-a, --auth-id [id]', 'SmartyStreets auth id [environment variable smartystreets_auth_id]', process.env.SMARTYSTREETS_AUTH_ID)
  .option('-A, --auth-token [token]', 'SmartyStreets auth token [environment variable smartystreets_auth_token]', process.env.SMARTYSTREETS_AUTH_TOKEN)
  .option('-j, --concurrency [jobs]', 'Maximum number of concurrent requests [48]', 48)
  .option('-✈, --column-definition [mode]', 'Column definition mode or file [standard]', 'standard')
  .option('-p, --column-prefix [text]', 'Prefix for smartystreets columns in the output file [ss_]', 'ss_')
  .option('-x, --column-suffix [text]', 'Suffix for smartystreets columns in the output file', '')
  .option('--include-invalid', 'Activates agressive matching by setting the header X-Include-Invalid to true')
  .option('-q, --quiet', 'Quiet mode - turn off progress messages')
  .option('-l, --log-interval [num]', 'Show progress after every X number of rows [1000]', 1000)
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
}
if (!options.output) {
  console.error('Please specify an input file');
  options.help();
}

options.zipcodeFilter = options.zipcodeFilter.length ? options.zipcodeFilter.split(',') : false;
options.stateFilter = options.stateFilter.length ? options.stateFilter.split(',') : false;

var columnModes = ['mail', 'standard', 'complete', 'basic'];
if (columnModes.indexOf(options.columnDefinition) != -1) {
  //modes are in structure/mode.json
  options.structure = JSON.parse( fs.readFileSync(__dirname+'/structure/'+options.columnDefinition+'.json', 'utf8') );
} else if (options.columnDefinition.substr(0, 1) == '{') {
  //it's a JSON object
  options.structure = JSON.parse(options.columnDefinition);
} else {
  //it's a JSON file
  options.structure = JSON.parse( fs.readFileSync(options.columnDefinition, 'utf8') );
}


var readStream = options.input == '-' ? process.stdin : fs.createReadStream(options.input);

var writeStream;
if (options.outputSplit) {
  try {
    fs.mkdirSync(options.output);
  } catch(e) {
    if ( e.code != 'EEXIST' ) throw e;
  }

  var firstRow = true, rowIndex, headers;

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

    var cell = row[rowIndex];

    if (options.truncateSplit !== 0) {
      cell = cell.substr(0, options.truncateSplit);
    }

    return cell;
  }, function(streamName){
    var source = csv.createWriteStream();
    source.write(headers);
    source.pipe( fs.createWriteStream(options.output+'/'+streamName+'.csv') );
    return source;
  }, {objectMode: true});
} else if (options.output == '-') {
  writeStream = csv.createWriteStream();
  writeStream.pipe( process.stdout );
} else {
  writeStream = csv.createWriteStream();
  writeStream.pipe( fs.createWriteStream(options.output) );
}

readStream.pipe(csv({headers: true, delimiter: options.delimiter}))
  .pipe(through2.obj(function(row, enc, cb){
    if (!row[options.streetCol]) {
      cb();
    } else if (options.zipcodeFilter !== false && options.zipcodeFilter.indexOf(row[options.zipcodeCol]) === -1) {
      cb();
    } else if (options.stateFilter !== false && options.stateFilter.indexOf(row[options.stateCol]) === -1) {
      cb();
    } else {
      cb(null, row);
    }
  }))
  .pipe(grouper(70))
  .pipe(geocoder(options))
  .pipe(writeStream);
