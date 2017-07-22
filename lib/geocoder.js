var assert = require('assert')
var through2 = require('through2-concurrent');
var async = require('async');
var request = require('request');
var querystring = require('querystring');

var structuredRow = require('./structuredRow');

var addColumns = function (columnList, row) {
  var out = [];
  columnList.forEach(function(column){
    out.push(row[column]);
  });
  return out;
};

var geocodeChunk = function(item, queue, columnList, progress, pool, options, callback){
  var streetColArray = Array.isArray(options.streetCol);
  var rows = item.rows;
  item.tries++;
  //turn the rows into something smartystreets can read
  var addressList = rows.map(function(row){
    var result = {
      city:     row[options.cityCol] || '',
      state:    row[options.stateCol] || '',
      zipcode:  row[options.zipcodeCol] || ''
    };
    if (streetColArray) {
      result.street = options.streetCol.map(function(k) {
        return row[k];
      }).join(' ');
    } else {
      result.street = row[options.streetCol] || '';
    }
    return result;
  });

  if (!addressList.length) {
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
    json: addressList,
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
        }, options.retryTimeout || 500);
      }
      return;
    }

    var mergeRows = {};

    for (var i = 0; i < body.length; i++) {
      var address = body[i];
      if (address.candidate_index === 0) {
        mergeRows[address.input_index] = structuredRow(options.structure, address, options.columnPrefix, options.columnSuffix);

        progress.geocoded++;
      }
    }

    var total = progress.total;
    progress.total += rows.length;

    item.callback(rows.map(function(row, i){
      var mergeRow = (typeof mergeRows[i] !== 'undefined') ? mergeRows[i] : {};

      for (var key in mergeRow) {
        row[key] = mergeRow[key];
      }

      total++;

      if (!options.quiet && options.logInterval && total % options.logInterval === 0) {
        var elapsed = process.hrtime(progress.startTime);
        elapsed = elapsed[0] + (elapsed[1]/1e9);

        var perSecond = Math.round(progress.total/elapsed);

        var percentGeocoded = (Math.round((progress.geocoded / progress.total * 10000))/100) + '';
        if (percentGeocoded.indexOf('.') === -1) {
          percentGeocoded += '.';
        }
        while (percentGeocoded.length < 5) {
          percentGeocoded += '0';
        }

        console.log(progress.total+' rows done, '+ percentGeocoded + '% geocoded, ' + perSecond+' rows per second');
      }

      return addColumns(row);
    }));

    callback();
  });
};


var defaultOptions = {
  concurrency: 48
};

module.exports = function(opts){
  var options = {};
  opts = opts || {};

  for (var key in defaultOptions) {
    options[key] = defaultOptions[key];
  }
  for (var key in opts) {
    options[key] = opts[key];
  }

  var progress = {
    total: 0,
    cached: 0,
    geocoded: 0,
    startTime: process.hrtime()
  };

  var pool = {
    maxSockets: 1024
  };

  var columnList;
  var geocodingQueue = async.queue(function(chunk, callback){
    assert.notStrictEqual(columnList, undefined)
    geocodeChunk(chunk, geocodingQueue, columnList, progress, pool, options, callback);
  }, options.concurrency);

  var droppedRecords = 0;
  var firstRecord = true;

  return through2.obj(
    {maxConcurrency: options.concurrency},
    function(rows, enc, cb){

      if (firstRecord) {
        firstRecord = false;

        var ss_columns = Object.keys(structuredRow(options.structure, {}, options.columnPrefix, options.columnSuffix));
        columnList = Object.keys(rows[0]).concat(ss_columns);
        this.push(columnList);
      }

      var self = this;

      geocodingQueue.push({
        rows: rows,
        tries: 0,
        callback: function(doneRows){
          doneRows.forEach(function(row){
            self.push(row);
          });
          cb();
        },
        reportDrop: function(){
          droppedRecords += rows.length;
          if (typeof options.dropThreshold === 'number' && droppedRecords > options.dropThreshold) {
            console.error(droppedRecords + ' rows dropped, threshold is ' + options.dropThreshold + ', aborting');
            process.exit(1);
          }
        }
      });
    }, function(cb){
      for (var key in pool) {
        if (key !== 'maxSockets') {
          for (var name in pool[key].sockets) {
            pool[key].sockets[name].forEach(function(socket){
              socket.end();
            });
          }
        }
      }
      cb();
    }
  );
};
