# node_smartystreets

A high-performance client for the SmartyStreets geocoding api

## Dependencies

node and npm

## Installation

Depending on your environment you may need to run this as root in order to get the command line tool

`npm install -g smartystreets`

## Command line tool

Usage: smartystreets [options]

```
Options:

  -h, --help                                  output usage information
  -V, --version                               output the version number
  -i, --input [file]                          Input (csv file) [stdin]
  -o, --output [file]                         Output (csv file) [stdout]
  -s, --street-col [col]                      Street col [street]
  -z, --zipcode-col [col]                     Zipcode col [zipcode]
  -c, --city-col [col]                        City col [city]
  -S, --state-col [col]                       State col [state]
  -a, --auth-id [id]                          SmartyStreets auth id [environment variable smartystreets_auth_id]
  -A, --auth-token [token]                    SmartyStreets auth token [environment variable smartystreets_auth_token]
  -j, --concurrency [jobs]                    Maximum number of concurrent requests [48]
  -✈, --column-definition [mode|file|string]  Column definition mode or file [standard]
  -p, --column-prefix [text]                  Prefix for smartystreets columns in the output file [ss_]
  -x, --column-suffix [text]                  Suffix for smartystreets columns in the output file
  -r, --redis [url]                           Redis cache url

```

## Geocoding stream API

This module also provides a simple api that you can use in your own node projects.

```
var Smartystreets = require('smartystreets');
var fs = require('fs');

var geocoder = new Smartystreets(options);

fs.createReadStream('input.csv')
  .pipe(geocoder)
  .pipe(process.stdout);
```

In this example, `geocoder` is a duplex stream which will take every address that is written to it in CSV format and output a geocoded CSV.

The `options` argument is identical to the options used by the command line tool, except that camelCase is used (street-col -> streetCol) and "input" and "output" are ignored (instead use the piping solution above).

## Notes

* This is designed for performance and if you run it on the wrong file you might use up your entire api quota in a matter of seconds. If you have a limited number of lookups, be careful.
* Since many requests are made in parallel, it's unlikely that the rows of the output CSV will be in the same order as the input CSV.

## Authors

* [Tristan Davies](mailto:npm@tristan.io)
* [Seamus Abshere](mailto:seamus@abshere.net)

## Corporate support

<p><a href="http://faraday.io" alt="Faraday"><img src="https://s3.amazonaws.com/creative.faraday.io/logo.png" alt="Faraday logo"/></a></p>

## Copyright

Copyright 2014 [Faraday](http://faraday.io)
