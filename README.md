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

### parameters

`-i, --input [file]`

Not required. Default stdin. If included it should be a path to a csv file.

`-o, --output [file]`

Not required. Default stdout. If included it should be a path to a csv file that does not exist yet.

`-s, --street-col [col]`

Not required. Default is 'street'. It should be the name of the column in your input file that contains the first part of the address, e.g. '123 main st'

`-z, --zipcode-col [col]`

Not required. Default is 'zipcode'. It should be the name of the column in your input file that contains the zipcode of an address, e.g. '12345'

_Note_: if your file includes street and zipcode, you don't need to include city and state data, as it will not be used. If your file does not include zipcode, you _must_ include city _and_ state columns.

`-c, --city-col [col]`

Not required. Default is 'city'. It should be the name of the column in your input file that contains the city or town, e.g. 'Albany'

_Note_: city is only used if zipcode is not present

`-S, --state-col [col]`

Not required. Default is 'state'. It should be the name of the column in your input file that contains the state, e.g. 'Vermont'

`-a, --auth-id [id]`

_Required_. You can get this [here](https://smartystreets.com/account/keys) listed under "Security Keys"

`-A, --auth-token [token]`

_Required_. You can get this [here](https://smartystreets.com/account/keys) listed under "Security Keys"

`-j, --concurrency [jobs]`

Not required. Default 48. Tune this if you fancy yourself an engineer and want to get a slight increase in performance. It should be higher if you have an unmetered 10 gigabit connection, and lower if you're on an EDGE wireless signal. If you want to run fifty instances of this program at the same time, you may experience dropped connections which can be dealt with by turning this down.

`-✈, --column-definition [mode|file|string]`

Not required. Default standard. This defines which columns from smartystreets will be added to your output file. You can find the definitions in the `structure` directory. `mail` will get you a mailing address and nothing more, and `complete` will get you every column which smartystreets has to offer. You can also make your own custom definition based on one of the existing definitions and use that by passing in the path. Also, if you're insane, you can just pass it JSON directly. I don't even know why I added that option. Probably had a good reason at the time. Don't even know if it works. I should add tests.

`-p, --column-prefix [text]`

Not required. Default ss_. This is the prefix applied to all columns that are added to your output file. `delivery_line_1` becomes `ss_delivery_line_1`

`-x, --column-suffix [text]`

Not required. Default empty string. This is the suffix applied to all columns that are added to your output file. `delivery_line_1` could become `delivery_line_1_suffixGoesHere`

`-r, --redis [url]`

Not required. Default empty string. If specified, this program will cache results from smartystreets in redis.

Url format: `redis://[db-number[:password]@]host:port[?option=value]`

This is useful in a couple different situations. It will allow you to resume partially completed geocoding, more easily recover from errors, and speed things up if you have a lot of duplicate addresses.

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
