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
