## 3.0.2 (2019-08-07)

* Bug fixes

  * Fix "freeform" input mode

## 3.0.1 (2019-02-05) - BROKEN

* Bug fixes

  * Always include everything, even if --include-invalid isn't passed

## 3.0.0 (2019-02-05) - BROKEN

[nothing]

## 2.0.2 (2019-02-05) - BROKEN

* Bug fixes

  * Fix dups due to missed callback

## 2.0.1 (2018-11-25) - BROKEN

* Bug fixes

  * Fix dups due to bad fast-csv

## 2.0.0 (2018-11-19) - BROKEN

* Breaking changes

  * Include all input rows in output

## 1.8.2 (2017-07-28)

* Re-publishing

## 1.8.1 (2017-07-28) BROKEN

* Bug fixes

  * Don't print progress to standard out
  * Be a bit more aggressive about CLI argument validation

* Enhancements

  * Convert code to TypeScript & ES6 syntax internally

## 1.8.0 (2017-07-22)

* Bug fixes

  * Fixed columnList concurrency issue when running as a lib

* Enhancements

  * Option outputStreamFormat: "object"
  * Export grouper (used by CLI, now avail for use in libs)

## 1.7.9 (2017-07-21)

Add TypeScript declarations.

## 1.7.8 (2017-07-19)

Fix bug in --street-col

## 1.7.7 (2017-07-19)

Allow --street-col "HOUSE,PREDIR,STREET,STRTYPE,POSTDIR,APTTYPE,APTNBR".

## 1.7.6 (2017-05-15)

Fix loss of rows when splitting.

## 1.7.2 (2015-12-28)

Remove the workaround added in 1.5.1 since that issue has been fixed

## 1.7.0 (2015-8-14)

Add --drop-threshold, a solution for issue #31

## 1.6.2 (2015-7-16)

fix issue #27, allowing geocoding to happen from a single address column

## 1.6.1 (2015-7-14)

fix bug where using --output-split on a column that had nonsafe characters in it would break

## 1.6.0 (2015-7-14)

add --retry-timeout option

## 1.5.1 (2015-6-11)

workaround for memory leak in request module (https://github.com/request/request/issues/1637)

## 1.5.0 (2015-5-26)

add --include-invalid option

## 1.4.1 (2015-5-26)

update dependencies, filter rows for validity before attempting to geocode

## 1.3.2 (2015-4-27)

Switch to faradayio/forever-agent fork to prevent weird node 0.12 bug

## 1.3.1 (2015-4-27)

Workaround for https://github.com/npm/npm/issues/7773

## 1.3.0 (2015-4-26)

Fixed request forever/pool issue in node 0.12 https://github.com/request/request/issues/1511

Updated dependencies

## 1.2.0 (2015-4-20)

Features:

  - --truncate-split [len] option. When used with --output-split, it will split by the first X characters in a cell. Example: `--output-split zipcode --truncate-split 3` will split by the first 3 digits of the zipcode column.
  - --state-filter [state] option. Use it to only geocode records in a certain state. Eg `--state-filter VT`. Uses your state column as specified in `--state-col`.
  - --zipcode-filter [zipcode] option. Same as above, but with zipcodes.

Bugs:

  - `--output-split` no longer broken

## 1.0.1 - 1.1.0 (2015-3-05 - 2015-4-20)

Fixes a major memory leak in --output-split but due to a mistake in which code was commited to the wrong branch, also breaks output-split. Avoid these versions, use 1.3.0 instead. Oops.

## 1.0.0 (2015-2-27)

Fix issue #30, some extra stability

## 1.0.0-rc.* (a long time)

Playing whack-a-bug

## 1.0.0-rc.0 (2015-01-02)

Major refactor using through2 streams for cleaner and safer code

Features:

  - `--output-split [column]` option. Writes to multiple output files based on a column name. Can be a column that is fetched from smartystreets, such as state. If specified, `--output` will be a directory instead of a file.
  - `--log-interval [rows]` option. Log every X number of rows. Was previously hard-coded to 1000. Default is 1000.
  - `--quiet` option. Actually works now. Suppresses non-fatal errors and progress messages.

Bugs:

  - Elusive memory bugs sorted out by switching to through2 and thus preventing backpressure issues caused by poorly implemented streams

Features removed:

  - Redis caching. Who needs it? Not me. It was a bad idea anyways.

## 0.8.0 (2014-12-30)

Features:

 - `--delimiter` option

## 0.7.0 (2014-09-12)

Features:

 - Works with all-in-one street columns like "123 n blount st, madison, wi 53703" (issue #26)

## Previous

See [github commits](https://github.com/faradayio/node_smartystreets/commits/master/package.json)
