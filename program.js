#!/usr/bin/env node

var Smartystreets = require('./');
var program = require('commander');
var fs = require('fs');

var package = JSON.parse(fs.readFileSync(__dirname+'/package.json', 'utf8'));

program
  .version(package.version)
  .option('-i, --input [file]', 'Input (csv file) [stdin]', '-')
  .option('-o, --output [file]', 'Output (csv file) [stdout]', '-')
  .option('-s, --street-col [col]', 'Street col [street]', 'street')
  .option('-z, --zipcode-col [col]', 'Zipcode col [zipcode]', 'zipcode')
  .option('-c, --city-col [col]', 'City col [city]', 'city')
  .option('-S, --state-col [col]', 'State col [state]', 'state') // short forms are dumb
  .option('-d, --delimiter [symbol]', 'CSV delimiter in input file', ',') // short forms are dumb
  .option('-a, --auth-id [id]', 'SmartyStreets auth id [environment variable smartystreets_auth_id]', process.env.SMARTYSTREETS_AUTH_ID)
  .option('-A, --auth-token [token]', 'SmartyStreets auth token [environment variable smartystreets_auth_token]', process.env.SMARTYSTREETS_AUTH_TOKEN)
  .option('-j, --concurrency [jobs]', 'Maximum number of concurrent requests [48]', 48)
  .option('-✈, --column-definition [mode|file|string]', 'Column definition mode or file [standard]', 'standard')
  .option('-p, --column-prefix [text]', 'Prefix for smartystreets columns in the output file [ss_]', 'ss_')
  .option('-x, --column-suffix [text]', 'Suffix for smartystreets columns in the output file', '')
  .option('-r, --redis [url]', 'Redis cache url')
  .option('-q, --quiet', "Quiet mode - turn off progress messages")
  .parse(process.argv);

program.concurrency = parseInt(program.concurrency);

if (!program.concurrency) {
  console.error('Invalid concurrency');
  program.help();
}

if (!program.authId) {
  console.error('Please specify a SmartyStreets auth id');
  program.help();
}

if (!program.authToken) {
  console.error('Please specify a SmartyStreets auth token');
  program.help();
}

if (!program.input) {
  console.error('Please specify an input file');
  program.help();
}
if (!program.output) {
  console.error('Please specify an input file');
  program.help();
}

var columnModes = ['mail', 'standard', 'complete'];
if (columnModes.indexOf(program.columnDefinition) != -1) {
  //modes are in structure/mode.json
  program.structure = JSON.parse( fs.readFileSync(__dirname+'/structure/'+program.columnDefinition+'.json', 'utf8') );
} else if (program.columnDefinition.substr(0, 1) == '{') {
  //it's a JSON object
  program.structure = JSON.parse(program.columnDefinition);
} else {
  //it's a JSON file
  program.structure = JSON.parse( fs.readFileSync(program.columnDefinition, 'utf8') );
}

var inputStream;
if (program.input == '-') {
  console.error('Reading from stdin');
  inputStream = process.stdin;
  process.stdin.resume();
} else {
  inputStream = fs.createReadStream(program.input);
}

var outputStream;
if (program.output == '-') {
  console.error('Writing to stdout');
  outputStream = process.stdout;
} else {
  outputStream = fs.createWriteStream(program.output);
}

var geocodingStream = new Smartystreets(program);

//this is where the magic happens
inputStream.pipe(geocodingStream).pipe(outputStream);

if (!program.quiet) {
  var progressInterval = 1000;
  var nextProgressMessage = progressInterval;

  geocodingStream.on('progress', function(progress, done){
    if (done || progress.total >= nextProgressMessage) {

      var percentage = Math.round((progress.geocoded / progress.total) * 100);
      console.error('['+program.input+' -> '+program.output+'] '+progress.total + ' rows processed, ' + progress.geocoded + ' rows geocoded ('+percentage+'%), ' + progress.cached + ' rows cached');

      nextProgressMessage += progressInterval;
    }
  });
}
