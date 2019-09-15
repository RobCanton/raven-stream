const redis = require('redis');
var client;

exports.authenticate = function(auth_pass) {
  client = redis.createClient({auth_pass: auth_pass});

  client.on('error', function (e) {
    console.log("Error: " + e);
  });
}


exports.hset = function(hashKey, field, value) {
  return new Promise( (resolve, reject) => {
    client.hset(hashKey, field, value, function (err, resp) {
      if (err) {
        reject(err);
      } else {
        resolve(resp);
      }
    });
  });
}

exports.hsetnx = function(hashKey, field, value) {
  return new Promise( (resolve, reject) => {
    client.hsetnx(hashKey, field, value, function (err, resp) {
      if (err) {
        reject(err);
      } else {
        resolve(resp);
      }
    });
  });
}


exports.hkeys = function(hashKey) {
  return new Promise( (resolve, reject) => {
    client.hkeys(hashKey, (err, resp) => {
      if (err) {
        reject(err);
      } else {
        resolve(resp);
      }
    });
  });
}

exports.hmset = function(hashKey, object) {
  return new Promise( (resolve, reject) => {
    client.hmset(hashKey, object, (err, resp) => {
      if (err) {
        reject(err);
      } else {
        resolve(resp);
      }
    })
  });
}

exports.hget = function(hashKey, field) {
  return new Promise ( (resolve, reject) => {
    client.hget(hashKey, field, (err, resp) => {
      if (err) {
        return reject(err);
      } else {
        return resolve(resp)
      }
    });
  })
}

exports.hgetall = function(hashKey) {
  return new Promise( (resolve, reject) => {
    client.hgetall(hashKey, (err, resp) => {
      if (err) {
        return reject(err);
      } else {
        return resolve(resp);
      }
    })
  });
}

exports.batch = function() {
  return client.batch();
}

exports.flushall = function() {
  client.flushall();
}
