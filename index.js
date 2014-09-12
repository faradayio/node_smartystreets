require('ofe').call();

var csv = require('fast-csv');
var async = require('async');
var redis = require('redis-url');
var request = require('request');

var fs = require('fs');
var querystring = require('querystring');
var stream = require('stream');
var util = require('util');

var cacheVersion = 0;

var blackholeCacheQueue = async.queue(function(task, callback){
  setTimeout(function(){
    task.callback(null, 'null');
    callback();
  }, 100);
}, 512);
blackholeCacheQueue.set = function(key, value, callback){
  if (callback) process.nextTick(callback);
};

var redisClient;
var redisCacheQueue = async.queue(function(task, callback){
  redisClient.get(task.key, function(err, reply){
    process.nextTick(function(){
      task.callback(err, reply);
      callback();
    });
  });
}, 64);
redisCacheQueue.set = function(key, value, callback){
  redisClient.set(key, value, callback);
};

var zip5 = function(inputZip){
  var zip = inputZip;
  if (!zip) return '';

  zip = zip.split('-')[0];

  if (zip.length >= 7) {
    zip = zip.substr(0, zip.length-4);
  }

  while (zip.length < 5) {
    zip = '0'+zip;
  }

  var intZip = zip*1;

  if (zip.length != 5 || intZip < 501 || intZip > 99950) {
    throw new Error('bad zip: '+inputZip);
  }

  return zip;
};

var cacheKeyGenerator = function(row, options){
  var zipCode = row[options.zipcodeCol];
  if (zipCode) {
    try {
      zipCode = zip5(zipCode);
    } catch (err) {
      zipCode = '';
    }
  }
  var key = cacheVersion + ':' + row[options.streetCol] + ':' + (
    zipCode
      ? zipCode
      : row[options.cityCol] + ':' +
        row[options.stateCol]
  );
  key = key.toUpperCase();
  return key;
};

var structuredRow = function(structure, row, prefix, suffix){
  var output = {};
  var addField = function(header, value){
    if (prefix) {
      header = prefix+header;
    }
    if (suffix) {
      header = header+suffix;
    }
    output[header] = value || null;
  };

  for (var key in structure) {
    var value = structure[key];
    if (typeof value == 'object') {
      for (var subkey in value) {
        var subvalue = value[subkey];
        if (subvalue) {
          var header = (subvalue === true) ? subkey : subvalue;
          var rowValue = (typeof row[key] == 'object') ? row[key][subkey] : null;
          addField(header, rowValue);
        }
      }
    } else if (value) {
      var header = (value === true) ? key : value;
      addField(header, row[key]);
    }
  }
  return output;
};

var Smartystreets = function(options){
  stream.PassThrough.apply(this);

  var inputStream = csv({headers: true});
  var outputStream = csv.createWriteStream({headers: true});

  this.on('pipe', function(source){
    //redirect pipe(this) to pipe(inputStream)
    source.unpipe(this);
    source.pipe(inputStream);
  });
  this.pipe = function(destination, pipeOptions){
    //when asked to pipe this into something, pipe outputStream instead
    return outputStream.pipe(destination, pipeOptions);
  };

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
    geocoded: 0
  };

  var pool = {
    maxSockets: 1024
  };

  var cacheQueue = blackholeCacheQueue;

  if (options.redis) {
    redisClient = redis.createClient( (typeof options.redis == 'string') ? options.redis : undefined );
    cacheQueue = redisCacheQueue;
  }

  var self = this;

  //geocoder is a queue which takes arrays of objects, up to 99 at a time
  var geocoder = async.queue(function(item, callback){
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
    }).filter(function(d){
      return d.street ? true : false;
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
          console.error('request failed', err || response.statusCode);
          if (item.tries == 5) {
            console.error('  failed 5 times in a row, aborting');
          } else {
            console.error('  retrying chunk');
            geocoder.push(item, function(){
              self.emit('progress', progress);
            });
          }
        } else {
          console.error(err || response.statusCode, 'api error, check your column names');
        }
        callback(err || response.statusCode);
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

      rows.forEach(function(row, i){
        var mergeRow = (typeof mergeRows[i] != 'undefined') ? mergeRows[i] : {};

        for (var key in mergeRow) {
          row[key] = mergeRow[key];
        }

        var id = row.__id__;
        delete row.__id__;
        cacheQueue.set(id, (typeof mergeRows[i] == 'undefined') ? 'false' : JSON.stringify(mergeRows[i]));

        outputStream.write(addColumns(row));

        progress.total++;
      });

      callback();
    });
  }, options.concurrency);

  var checkForSaturation = function(){
    if (geocoder.length() == geocoder.concurrency || cacheQueue.length() == cacheQueue.concurrency) {
      inputStream.pause();
    } else {
      inputStream.resume();
    }
  };
  var outputSaturated = false;
  outputStream.on('drain', function(){
    outputSaturated = false;
    checkForSaturation();
  });
  var writeToOutput = function(){
    var success = outputStream.write.apply(outputStream, arguments);
    if (!success) {
      outputSaturated = true;
      checkForSaturation();
    }
    return success;
  };
  geocoder.saturated = checkForSaturation;
  geocoder.empty = checkForSaturation;
  cacheQueue.saturated = checkForSaturation;
  cacheQueue.empty = checkForSaturation;

  var rowBuffer = [];

  var firstRecord = true;

  inputStream.on("record", function(data){
    if (firstRecord) {
      var ss_columns = Object.keys(structuredRow(options.structure, {}, options.columnPrefix, options.columnSuffix));
      columnList = Object.keys(data).concat(ss_columns);
      writeToOutput(columnList);
      firstRecord = false;
    }

    data.__id__ = cacheKeyGenerator(data, options);
    cacheQueue.push({
      key: data.__id__,
      callback: function(err, reply){
        reply = JSON.parse(reply);
        if (err || (!reply && reply !== false)) {
          rowBuffer.push(data);
          //split data into chunks of 70 rows each, testing has shown this to be fastest
          if (rowBuffer.length == 70) {
            geocoder.push({
              rows: rowBuffer,
              tries: 0
            }, function(){
              self.emit('progress', progress);
            });
            rowBuffer = [];
          }
        } else {
          progress.total++;
          progress.cached++;
          if (reply !== false) {
            progress.geocoded++;
          }

          self.emit('progress', progress);
          for (var key in reply) {
            data[key] = reply[key];
          }
          delete data.__id__;
          writeToOutput(addColumns(data));
        }
      }
    });
  });

  inputStream.on("end", function(){
    var onCacheDrain = function(){
      if (rowBuffer.length > 0) {
        //flush any remaining rows that haven't been geocoded yet
        geocoder.push({
          rows: rowBuffer,
          tries: 0
        }, function(){
          self.emit('progress', progress, true);
        });
        rowBuffer = [];
      } else {
        self.emit('progress', progress, true);
      }
      if (geocoder.idle()) {
        //geocoder is done, close the output stream
        onGeocoderDrain();
      } else {
        //geocoder isn't done yet, close the output stream when it finishes
        geocoder.drain = onGeocoderDrain;
      }
    };

    var onGeocoderDrain = function(){
      for (var key in pool) {
        if (key != 'maxSockets') {
          for (var name in pool[key].sockets) {
            pool[key].sockets[name].forEach(function(socket){
              socket.end();
            });
          }
        }
      }
      outputStream.end();
      if (redisClient) {
        redisClient.end();
      }
    };

    if (cacheQueue.idle()) {
      //geocoder is done, close the output stream
      onCacheDrain();
    } else {
      //geocoder isn't done yet, close the output stream when it finishes
      cacheQueue.drain = onCacheDrain;
    }
  });
};

util.inherits(Smartystreets, stream.PassThrough);

module.exports = Smartystreets;
