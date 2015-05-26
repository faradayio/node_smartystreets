var through2 = require('through2-concurrent');
var async = require('async');
var request = require('request');
var querystring = require('querystring');

var zip5 = require('./zip5');
var structuredRow = require('./structuredRow');


var geocodeChunk = function(item, queue, progress, pool, addColumns, options, callback){
  var rows = item.rows;
  item.tries++;
  //turn the rows into something smartystreets can read
  var addressList = rows.map(function(d){
    return {
      street:   d[options.streetCol] || '',
      city:     d[options.cityCol] || '',
      state:    d[options.stateCol] || '',
      zipcode:  d[options.zipcodeCol] || ''
    };
  });

  if (!addressList.length) {
    process.nextTick(callback);
    return;
  }

  //send the post request
  request.post({
    uri: 'https://api.smartystreets.com/street-address?'+querystring.stringify({
      'auth-id': options.authId,
      'auth-token': options.authToken
    }),
    json: addressList,
    forever: true, //use http keepAlive
    pool: pool, //don't use the default connection pool (for performance)
    timeout: 1000 * 30 //30 second timeout
  }, function(err, response, body){
    if (err || response.statusCode != 200) {
      var acceptableErrorcodes = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ESOCKETTIMEDOUT'];
      if ((response && response.statusCode === 504) || (err && acceptableErrorcodes.indexOf(err.code) != -1)) {

        if (!options.quiet) console.error('request failed', err || response.statusCode);

        if (item.tries == 5) {
          if (!options.quiet) console.error('  failed 5 times in a row, aborting');
          callback();
          item.callback([]);
        } else {
          if (!options.quiet) console.error('  retrying chunk');
          queue.push(item);
          callback();
        }
      } else {
        if (!options.quiet) console.error(err || response.statusCode, 'api error, check your column names');
        callback(err || response.statusCode);
        item.callback([]);
      }
      return;
    }

    var mergeRows = {};

    for (var i = 0; i < body.length; i++) {
      var address = body[i];
      if (address.candidate_index == 0) {
        var mergeRow = mergeRows[address.input_index] = structuredRow(options.structure, address, options.columnPrefix, options.columnSuffix);

        for (var key in mergeRow) {
          rows[address.input_index][key] = mergeRow[key];
        }

        progress.geocoded++;
      }
    }

    var total = progress.total;
    progress.total += rows.length;

    item.callback(rows.map(function(row, i){
      var mergeRow = (typeof mergeRows[i] != 'undefined') ? mergeRows[i] : {};

      for (var key in mergeRow) {
        row[key] = mergeRow[key];
      }

      total++;

      if (!options.quiet && options.logInterval && total % options.logInterval == 0) {
        var elapsed = process.hrtime(progress.startTime);
        elapsed = elapsed[0] + (elapsed[1]/1e9);

        var perSecond = Math.round(progress.total/elapsed);

        var percentGeocoded = (Math.round((progress.geocoded / progress.total * 10000))/100) + '';
        if (percentGeocoded.length == 2) {
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

  var columnList;
  var addColumns = function(row){
    var out = [];
    columnList.forEach(function(column){
      out.push(row[column]);
    });
    return out;
  };

  var progress = {
    total: 0,
    cached: 0,
    geocoded: 0,
    startTime: process.hrtime()
  };

  var pool = {
    maxSockets: 1024
  };

  var geocodingQueue = async.queue(function(chunk, callback){
    geocodeChunk(chunk, geocodingQueue, progress, pool, addColumns, options, callback);
  }, options.concurrency);

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
        }
      });
    }, function(cb){
      for (var key in pool) {
        if (key != 'maxSockets') {
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
