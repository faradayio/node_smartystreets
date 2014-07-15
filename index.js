var csv = require('fast-csv');
var async = require('async');
var redis = require('redis-url');
var request = require('request');

var fs = require('fs');
var querystring = require('querystring');
var stream = require('stream');
var util = require('util');

var package = JSON.parse(fs.readFileSync(__dirname+'/package.json', 'utf8'));

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
  var key = package.version + ':' + row[options.streetCol] + ':' + (
    zipCode
      ? zipCode
      : row[options.cityCol] + ':' +
        row[options.stateCol]
  );
  key = key.toUpperCase();
  return key;
};

var columnList;
var ss_columns = [
  'ss_delivery_line_1',
  'ss_primary_number',
  'ss_secondary_number',
  'ss_city_name',
  'ss_state_abbreviation',
  'ss_zipcode',
  'ss_county_name',
  'ss_latitude',
  'ss_longitude',
  'ss_precision',
  'ss_dpv_match_code',
  'ss_dpv_footnotes'
];
var addColumns = function(row){
  var out = [];
  columnList.forEach(function(column){
    out.push(row[column]);
  });
  return out;
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
  var geocoder = async.queue(function(rows, callback){
    //turn the rows into something smartystreets can read
    var addressList = rows.map(function(d){
      return {
        street:   d[options.streetCol] || '',
        city:     d[options.cityCol] || '',
        state:    d[options.stateCol] || '',
        zipcode:  d[options.zipcodeCol] || ''
      };
    });

    //send the post request
    request.post({
      uri: 'https://api.smartystreets.com/street-address?'+querystring.stringify({
        'auth-id': options.authId,
        'auth-token': options.authToken
      }),
      json: addressList,
      forever: true, //use http keepAlive
      pool: pool //don't use the default connection pool (for performance)
    }, function(err, response, body){
      if (err || response.statusCode != 200) {
        if (err && err.code == 'ECONNRESET') {
          console.error('connection reset, retrying chunk');
          geocoder.push([rows], function(){
            self.emit('progress', progress);
          });
        } else {
          console.error(err || response.statusCode, 'api error, check your column names');
        }
        callback(err || response.statusCode);
        return;
      }

      var mergeRows = {};

      body.forEach(function(address){
        var mergeRow = mergeRows[address.input_index] = {};

        mergeRow.ss_delivery_line_1 = address.delivery_line_1;

        mergeRow.ss_primary_number = address.components.primary_number;
        mergeRow.ss_secondary_number = address.components.secondary_number;
        mergeRow.ss_city_name = address.components.city_name;
        mergeRow.ss_state_abbreviation = address.components.state_abbreviation;
        mergeRow.ss_zipcode = address.components.zipcode;

        mergeRow.ss_county_name = address.metadata.county_name;
        mergeRow.ss_latitude = address.metadata.latitude;
        mergeRow.ss_longitude = address.metadata.longitude;
        mergeRow.ss_precision = address.metadata.precision;

        mergeRow.ss_dpv_match_code = address.analysis.dpv_match_code;
        mergeRow.ss_dpv_footnotes = address.analysis.dpv_footnotes;

        for (var key in mergeRow) {
          rows[address.input_index][key] = mergeRow[key];
        }

        progress.geocoded++;
      });

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
  geocoder.saturated = checkForSaturation;
  geocoder.empty = checkForSaturation;
  cacheQueue.saturated = checkForSaturation;
  cacheQueue.empty = checkForSaturation;

  var rowBuffer = [];

  var firstRecord = true;

  inputStream.on("record", function(data){
    if (firstRecord) {
      columnList = Object.keys(data).concat(ss_columns);
      outputStream.write(columnList);
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
            geocoder.push([rowBuffer], function(){
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
          outputStream.write(addColumns(data));
        }
      }
    });
  });

  inputStream.on("end", function(){
    var onCacheDrain = function(){
      if (rowBuffer.length > 0) {
        //flush any remaining rows that haven't been geocoded yet
        geocoder.push([rowBuffer], function(){
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
