import assert = require('assert')
import through2 = require('through2-concurrent')
import async = require('async')
import request = require('request')
import stream = require('stream')
import querystring = require('querystring')

import { Options, DEFAULTS, FullOptions } from './options'
import structuredRow from './structuredRow'

/** Convert a CSV record object to a record array. */
function objectToArray(columnList: string[], recordObject: { [col: string]: any }) {
  const recordArray: any[] = [];
  columnList.forEach(function(column){
    recordArray.push(recordObject[column]);
  });
  return recordArray;
};

/** Convert a CSV record array to a record object. */
function arrayToObject(columnList: string[], recordArray: any[]): { [col: string]: any } {
  const recordObject: { [col: string]: any } = {};
  for (let i = 0; i < columnList.length; ++i) {
    recordObject[columnList[i]] = recordArray[i];
  }
  return recordObject;
}

type Progress = {
  total: number,
  cached: number,
  geocoded: number,
  startTime: [number, number],
}

type Item = {
  rows: { [key: string]: any }[]
  tries: number
  reportDrop: () => void
  callback: (arg: any[][]) => void
}

/**
 * Some sort of socket pool.
 *
 * TODO: Can we get a better type for this? The types in the TypeScript bindings
 * for Node are very vague.
 */
type Pool = { [key: string]: any }

function geocodeChunk(
  item: Item,
  queue: { push: (task: Item) => void },
  columnList: string[],
  progress: Progress,
  pool: Pool,
  options: FullOptions,
  callback: () => void,
){
  const rows = item.rows;
  item.tries++;
  //turn the rows into something smartystreets can read
  const geocodeInputsToRowsMap: { [key: number]: number } = {}
  const geocodeInputs: { [key: string]: any }[] = []
  rows.forEach(function(row, i){
    const result: { [col: string]: string } = {
      city:     row[options.cityCol] || '', // this should be null not '' when empty...
      state:    row[options.stateCol] || '',
      zipcode:  row[options.zipcodeCol] || ''
    };
    if (Array.isArray(options.streetCol)) {
      result.street = options.streetCol.map(function(k) {
        return row[k];
      }).join(' ');
    } else {
      result.street = row[options.streetCol] || '';
    }
    if (result.street.length > 2 && (result.city.length > 1 || result.zipcode.length > 2)) {
      geocodeInputs.push(result)
      geocodeInputsToRowsMap[geocodeInputs.length - 1] = i
    }
  });

  if (!geocodeInputs.length) {
    process.nextTick(callback);
    return;
  }

  //send the post request
  request.post({
    headers: {
      'X-Include-Invalid': (options.includeInvalid) ? 'true' : 'false'
    },
    uri: 'https://api.smartystreets.com/street-address?'+querystring.stringify({
      'auth-id': options.authId,
      'auth-token': options.authToken
    }),
    json: geocodeInputs,
    forever: true,
    pool: pool, //don't use the default connection pool (for performance)
    timeout: 1000 * 30 //30 second timeout
  }, function(err, response, body){
    if (err || response.statusCode !== 200) {
      if (!options.quiet) {
        console.error('request failed', err || response.statusCode);
      }

      if (item.tries === 5) {
        if (!options.quiet) {
          console.error('  failed 5 times in a row, aborting');
        }
        callback();
        item.reportDrop();
        item.callback([]);
      } else {
        if (!options.quiet) {
          console.error('  retrying chunk');
        }
        setTimeout(function(){
          queue.push(item);
          callback();
        }, options.retryTimeout);
      }
      return;
    }

    const geocodeOutputs: { [key: string]: any } = {};

    for (let i = 0; i < body.length; i++) {
      const address = body[i];
      if (address.candidate_index === 0) {
        geocodeOutputs[geocodeInputsToRowsMap[address.input_index]] = structuredRow(options.structure, address, options.columnPrefix, options.columnSuffix);

        progress.geocoded++;
      }
    }

    let total = progress.total;
    progress.total += rows.length;

    item.callback(rows.map(function(row, i){
      const geocodeOutput = (typeof geocodeOutputs[i] !== 'undefined') ? geocodeOutputs[i] : {};

      for (const key in geocodeOutput) {
        row[key] = geocodeOutput[key];
      }

      total++;

      if (!options.quiet && options.logInterval && total % options.logInterval === 0) {
        const elapsedPair = process.hrtime(progress.startTime);
        const elapsed = elapsedPair[0] + (elapsedPair[1]/1e9);

        const perSecond = Math.round(progress.total/elapsed);

        let percentGeocoded = (Math.round((progress.geocoded / progress.total * 10000))/100) + '';
        if (percentGeocoded.indexOf('.') === -1) {
          percentGeocoded += '.';
        }
        while (percentGeocoded.length < 5) {
          percentGeocoded += '0';
        }

        // Use console.warn to print to stderr so we don't mess up streaming
        // output to stdout.
        console.warn(`${progress.total} rows done, ${percentGeocoded}% geocoded, ${perSecond} rows per second`);
      }

      return objectToArray(columnList, row);
    }));

    callback();
  });
};

export default function (opts: Options): stream.Transform {
  // Fill in our default options, and guarantee they're _all_ set. This relies
  // on some fancy TypeScript magic to verify that all defaults are supplied.
  const options: FullOptions = Object.assign({}, DEFAULTS, opts);

  const progress = {
    total: 0,
    cached: 0,
    geocoded: 0,
    startTime: process.hrtime()
  };

  const pool: Pool = {
    maxSockets: 1024
  };

  let columnList: string[];
  const geocodingQueue = async.queue<Item, any>(function(chunk, callback){
    assert.notStrictEqual(columnList, undefined)
    geocodeChunk(chunk, geocodingQueue, columnList, progress, pool, options, callback);
  }, options.concurrency);

  let droppedRecords = 0;
  let firstRecord = true;

  return through2.obj(
    {maxConcurrency: options.concurrency},
    function(rows, enc, cb){

      if (firstRecord) {
        firstRecord = false;

        const ss_columns = Object.keys(structuredRow(options.structure, {}, options.columnPrefix, options.columnSuffix));
        columnList = Object.keys(rows[0]).concat(ss_columns);
        if (options.outputStreamFormat === "array") {
          this.push(columnList);
        }
      }

      geocodingQueue.push({
        rows: rows,
        tries: 0,
        callback: (doneRows: any[][]) => {
          doneRows.forEach((row) => {
            if (options.outputStreamFormat === "array") {
              this.push(row);
            } else {
              this.push(arrayToObject(columnList, row))
            }
          });
          cb();
        },
        reportDrop: function(){
          droppedRecords += rows.length;
          if (typeof options.dropThreshold === 'number' && droppedRecords > options.dropThreshold) {
            console.error(`${droppedRecords} rows dropped, threshold is ${options.dropThreshold}, aborting`);
            process.exit(1);
          }
        }
      });
    }, function(cb){
      for (const key in pool) {
        if (key !== 'maxSockets') {
          // TODO: Verify that the pool still looks like this internally. Also,
          // do we need to shut this down manually or is GC/process termination
          // good enough?
          for (const name in pool[key].sockets) {
            pool[key].sockets[name].forEach(function(socket: NodeJS.Socket){
              socket.end();
            });
          }
        }
      }
      cb();
    }
  );
};
