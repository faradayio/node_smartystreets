module.exports = function(structure, row, prefix, suffix){
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