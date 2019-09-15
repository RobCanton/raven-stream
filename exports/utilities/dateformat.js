var moment = require('moment');

exports.formatDate = function(d) {
    var month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
}

exports.formatDateHHMM = function(d) {
    let hours = d.getHours();
    let minutes = d.getMinutes();

    var hoursStr = `${hours}`;
    var minutesStr =  `${minutes}`;

    if (hoursStr.length < 2) {
      hoursStr = '0' + hoursStr;
    }

    if (minutesStr.length < 2) {
      minutesStr = '0' + minutesStr;
    }

    return `${hoursStr}:${minutesStr}`;
}

exports.sameDay = function(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}
