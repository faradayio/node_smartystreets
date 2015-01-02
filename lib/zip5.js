module.exports = function(inputZip){
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