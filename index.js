process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

var csv = require('fast-csv');
var async = require('async');
var redis = require('redis-url');
var request = require('request');
var caching = require('caching');

var fs = require('fs');
var querystring = require('querystring');
var stream = require('stream');
var util = require('util');

var cacheVersion = 1;

var cache;

var cache = new caching('redis');

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

  if (options.redis) {
    this.cache = new caching('redis', {
      client: redis.connect(typeof options.redis == 'string' ? options.redis : undefined)
    });
  } else {
    this.cache = new caching({
      get: function(key, callback){
        process.nextTick(function(){
          callback(null, null);
        });
      },
      set: function(){},
      remove: function(){}
    });
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
    uncached: 0,
    geocoded: 0
  };

  var pool = {
    maxSockets: 1024
  };

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
      if (!d.street) {
        return false;
      }
      if (!d.zipcode || (!d.city && !d.state)) {
        return false;
      }
      return true;
    });

    if (!addressList.length) {
      process.nextTick(function(){
        item.callback(null, {});
        callback();
      });
      return;
    }

    //send the post request
    var ipList = ['liveaddress-api.aws-us-east-1.smartystreets.net', 'liveaddress-api.aws-us-west-1.smartystreets.net', 'liveaddress-api.aws-us-west-2.smartystreets.net'];
    var ip = ipList[Math.floor(Math.random()*ipList.length)];
    request.post({
      uri: 'https://'+ip+'/street-address?'+querystring.stringify({
        'auth-id': options.authId,
        'auth-token': options.authToken
      }),
      host: 'api.smartystreets.com',
      json: addressList,
      forever: true, //use http keepAlive
      pool: pool, //don't use the default connection pool (for performance)
      timeout: 1000 * 10 //10 second timeout
    }, function(err, response, body){
      if (err || response.statusCode != 200) {
        var acceptableErrorcodes = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ESOCKETTIMEDOUT'];
        if ((response && response.statusCode === 504) || (err && acceptableErrorcodes.indexOf(err.code) != -1)) {
          //console.error('request failed', err || response.statusCode);
          if (item.tries == 5) {
            console.error('  failed 5 times in a row, aborting');
            item.callback(err || response.statusCode);
          } else {
            //console.error('  retrying chunk');
            geocoder.push(item);
          }
        } else {
          console.error(err || response.statusCode, 'api error, check your column names');
          item.callback(err || response.statusCode);
        }
        callback();
        return;
      }

      var mergeRows = {};

      for (var i = 0; i < body.length; i++) {
        var address = body[i];
        if (address.candidate_index == 0) {
          mergeRows[rows[address.input_index].__id__] = address;
        }
      }

      item.callback(null, mergeRows);
      callback();
    });
  }, options.concurrency);

  geocoder.saturated = function(){
    inputStream.pause();
  };
  geocoder.empty = function(){
    inputStream.resume();
  };;

  var rowBuffer = [];
  var rowCallbacks = {};

  var firstRecord = true;

  inputStream.on("record", function(data){
    if (firstRecord) {
      var ss_columns = Object.keys(structuredRow(options.structure, {}, options.columnPrefix, options.columnSuffix));
      columnList = Object.keys(data).concat(ss_columns);
      outputStream.write(columnList);
      firstRecord = false;
    }

    data.__id__ = cacheKeyGenerator(data, options);

    var ttl = 1000 * 60 * 60 * 24 * 30;
    self.cache(data.__id__, ttl, function(passalong){
      progress.uncached++;
      rowBuffer.push(data);
      rowCallbacks[data.__id__] = passalong;
      //split data into chunks of 70 rows each, testing has shown this to be fastest
      if (rowBuffer.length == 70) {
        var callbacks = rowCallbacks;
        var rows = rowBuffer;
        rowCallbacks = {};
        rowBuffer = [];

        geocoder.push({
          rows: rows,
          tries: 0,
          callback: function(err, mergeRows){
            if (err) throw err;
            for (var id in callbacks) {
              callbacks[id](null,
                mergeRows[id] || {});
            }
          }
        });
      }
    }, function(err, mergeRow){
      if (Object.keys(mergeRow).length) {
        progress.geocoded++;
      }
      progress.total++;
      progress.cached = progress.total - progress.uncached;

      mergeRow = structuredRow(options.structure, mergeRow, options.columnPrefix, options.columnSuffix);

      for (var key in mergeRow) {
        data[key] = mergeRow[key];
      }

      delete data.__id__;

      data = addColumns(data);

      outputStream.write(data);

      self.emit('progress', progress);
    });
  });

  inputStream.on("end", function(){
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
      if (cache.store.client) {
        cache.store.client.end();
      }
    };
  });
};

util.inherits(Smartystreets, stream.PassThrough);

module.exports = Smartystreets;
