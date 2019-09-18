const util = require('util');
const dotenv = require('dotenv');
const request = require('request');
const rp = require('request-promise');
const bodyParser = require('body-parser');
const express = require('express');
const firebase = require('./exports/firebase/firebase.js');
const iexCloudAPI = require('./exports/iexCloud/iexCloudAPI.js');
const dateFormatter = require('./exports/utilities/dateformat.js');
const redisClient = require('./exports/redis/client_async.js');

dotenv.config();

firebase.initialize();

const admin = firebase.admin();
const database = firebase.database();
const systemDatabase = firebase.systemDatabase();
const firestore = firebase.firestore();

const timezones = require('./routes/timezones.js');

const app = express();
const port = 3000;

const IEXCLOUD_API_KEY = process.env.IEXCLOUD_API_KEY;
iexCloudAPI.setAPIKey(IEXCLOUD_API_KEY);

redisClient.authenticate(process.env.REDIS_AUTH_PASS);

const basket_size = 50;
var symbolGroups = [];

var streams = [];

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }));

// app.use((req, res, next) => {
//   console.log('Time:', Date.now())
//
//   let token = req.headers.authorization;
//   // idToken comes from the client app
//   admin.auth().verifyIdToken(token).then(function(decodedToken) {
//     let uid = decodedToken.uid;
//     console.log("Authorized");
//     req.uid = uid;
//     next();
//   }).catch(function(error) {
//     // Handle error
//     console.log("Not Authorized");
//     return res.send(error);
//   });
//
// })

function addToWatchlist(symbol) {
  let length = symbolGroups.length;
  if (length === 0) {
    symbolGroups.push([symbol]);
    return 0;
  } else {
    if (symbolGroups[length-1].length < basket_size) {
      symbolGroups[length-1].push(symbol);
      return length-1;
    } else {
      symbolGroups.push([symbol]);
      return symbolGroups.length-1;
    }
  }
}

function openAllStreams() {

  return new Promise( (resolve, reject) => {
    symbolGroups = [];

    redisClient.hkeys("watchlist").then( watchlist => {
      watchlist.forEach( symbol => {

        let i = addToWatchlist(symbol);
      })

      for (var i = 0; i < symbolGroups.length; i++) {
        openStream(i);
      }

      return resolve();

    }).catch ( err => {
      console.log(err);
      return reject(err);
    })
  });

}

function exchangeTimezone(region, exchangeID) {
  return new Promise( (resolve, reject) => {
    let hashKey = `exchange:${region}-${exchangeID}`;

    return redisClient.hget(hashKey, 'timeZone').then( resp => {

      let locationFixed = resp.replace('/', '-');
      let timezoneHashKey = `timezone:${locationFixed}`;

      return redisClient.hgetall(timezoneHashKey);
    }).then( resp => {
      return resolve(resp);
    }).catch ( err => {
      return reject(err);
    })
  });
}

function exchangeTimezoneOffset(region, exchangeID) {

  return new Promise( (resolve, reject) => {
    return exchangeTimezone(region, exchangeID).then(timezoneData => {
      let currentDate = new Date();

      var timeOffset = parseFloat(timezoneData.raw_offset);

      if (timezoneData.dst_offset && timezoneData.dst_start && timezoneData.dst_end) {
        let dst_start = new Date(timezoneData.dst_start);

        let dst_end = new Date(timezoneData.dst_end);

        if (currentDate > dst_start && currentDate < dst_end) {
          timeOffset += parseFloat(timezoneData.dst_offset);
        }
      }

      return resolve(timeOffset);
    }).catch ( err => {
      return reject(err);
    })
  });


}

function updateStockQuote(quote) {
  return new Promise( (resolve, reject) => {
    var quoteData = quote;
    let symbol = quote.symbol;
    let stockPath = `global/stock/info/${symbol}`;
    let stockRef = database.child(stockPath);

    var updateObject = {};

    var stockData;

    return stockRef.once('value').then ( _stockData => {

      stockData = _stockData.val();

      let region = stockData.region;
      let exchangeID = stockData.exchange;

      return exchangeTimezoneOffset(region, exchangeID);

    }).then( timezoneOffset => {
      let oldQuote = stockData.quote;
      let oldDate = new Date(oldQuote.latestUpdateLocal);
      var localDate = new Date(quoteData.latestUpdate);
      localDate.setSeconds(localDate.getSeconds() + timezoneOffset);
      let minute = dateFormatter.formatDateHHMM(localDate);

      quoteData.minute = minute;
      quoteData.latestUpdateLocal = localDate.getTime();
      updateObject[stockPath + "/quote"] = quoteData;

      let isSameDay = dateFormatter.sameDay(oldDate, localDate);

      if (isSameDay) {
        updateObject[`global/stock/intraday/${symbol}/${minute}`] = quoteData.latestPrice;

      } else {
        let intradayObject = {};
        intradayObject[minute] = quoteData.latestPrice;
        updateObject[`global/stock/intraday/${symbol}`] = intradayObject;
      }

      return database.update(updateObject);
    }).then ( () => {
      return resolve();
    }).catch (err => {
      console.log("Error: " + err);
      return reject(err);
    });
  });
}



function openStream(groupIndex) {

  if (groupIndex < streams.length) {
    streams[groupIndex].abort();
  }

  console.log(`Open stream ${groupIndex}`);

  let symbolGroup = symbolGroups[groupIndex];
  let symbolBatch = null;

  for (var i = 0; i < symbolGroup.length; i++) {

    let symbol = symbolGroup[i];

    if (symbolBatch === null) {
      symbolBatch = symbol;
    } else {
      symbolBatch += "," + symbol;
    }

  }

  let baseURL = "https://cloud-sse.iexapis.com/stable";
  let route = "stocksUSNoUTP1Minute";
  let filter = "filter=symbol,companyName,primaryExchange,latestPrice,latestSource,latestUpdate,latestVolume";
  let noSnapshot = "nosnapshot=true"

  let params = `token=${IEXCLOUD_API_KEY}&symbols=${symbolBatch}&${filter}`;
  let stream = request({
    url: `${baseURL}/${route}?${params}`,
    headers: {
      'Content-Type': 'text/event-stream'
    }
  })

  stream.on('socket', () => {
      console.log("Connected " + groupIndex);
  });

  stream.on('end', () => {
      console.log("Reconnecting " + groupIndex);
      openStream(groupIndex);
  });

  stream.on('complete', () => {
      console.log("Reconnecting " + groupIndex);
      openStream(groupIndex);
  });

  stream.on('error', (err) => {
      console.log("Error " + groupIndex + " : " + err);
      openStream(groupIndex);
  });

  stream.on('data', (response) => {
      var str = response.toString();

      var chunks = str.split(`data: `);

      var quotes = [];
      chunks.forEach( function (chunk) {

        if (chunk) {
          try {
            var obj = JSON.parse(chunk)[0];
            if (obj) {
              quotes.push(obj);
            }

          } catch (e) {

          }
        }

      });

      var promises = [];
      quotes.forEach(function (quote) {
        promises.push(updateStockQuote(quote));
      });


      return Promise.all(promises).then ( () => {
        return
      }).catch ( err => {
        console.log("Error: " + err);
        return
      })
  });

  streams[groupIndex] = stream;

}

app.get('/watchlist', (req, res) => {
  return redisClient.hkeys("watchlist").then( watchlist => {
    return res.send(watchlist);
  }).catch( e => {
    return res.send(e);
  });
})

app.delete('/watchlist', (req, res) => {
  return redisClient.hkeys("watchlist").then( watchlist => {
    var batch = redisClient.batch();
    watchlist.forEach( (symbol) => {
      console.log(symbol);
      batch.hdel(`watchlist`, symbol);
    })

    batch.exec( (err, resp) => {
      if (err) {
        return res.send(err);
      } else {
        return res.send(resp);
      }
    })

  });
})

// app.get('/flushall', (req, res) => {
//   redisClient.flushall();
//   return res.send({
//     success: true
//   })
// });

app.post('/user/watchlist', (req, res) => {
  let uid = req.uid;

  if (req.query.symbol === undefined) {
    return res.send({ error: 'Symbol not found' });
  }

  let symbol = req.query.symbol.toUpperCase();

  let stockRef = database.child(`global/stock/${symbol}`);

  let promises = [
    database.child(`global/stock/info/${symbol}`).once('value'),
    database.child(`global/stock/intraday/${symbol}`).once('value')
  ]

  var quote;

  return Promise.all(promises).then( results => {
    let stockSnapshot = results[0];
    let intradaySnapshot = results[1];
    if (stockSnapshot.exists()) {
        var stockData = stockSnapshot.val();
        stockData.symbol = symbol;

        let intradayArray = [];
        if (intradaySnapshot.exists()) {
          let intradayData = intradaySnapshot.val();
          for (var minute in intradayData) {
            intradayArray.push({
              minute: minute,
              price: intradayData[minute]
            });
          }

          intradayArray.sort((a, b) => (a.minute > b.minute) ? 1 : -1);

        }
        stockData.intraday = intradayArray;

        return Promise.resolve(stockData);
      } else {
        var stockData;
        var intradayArray = [];
        return redisClient.hgetall(`symbol:${symbol}`).then ( _stockRefData => {
          stockData = _stockRefData;
          stockData.symbol = symbol;

          let region = stockData.region;
          let exchangeID = stockData.exchange;

          let quoteParams = {
            filter:`change,changePercent,latestPrice,latestUpdate,latestSource,latestVolume,peRatio,previousClose`
          };

          let requests = [
            iexCloudAPI.stockQuote(symbol, quoteParams),
            iexCloudAPI.stockIntradayPrices(symbol),
            exchangeTimezoneOffset(region, exchangeID)
          ]
          return Promise.all(requests);

        }).then( results => {
          var quoteData = results[0];
          let intradayData = results[1];
          let timezoneOffset = results[2];

          let latestUpdate = quoteData.latestUpdate;
          var localDate = new Date(quoteData.latestUpdate);
          localDate.setSeconds(localDate.getSeconds() + timezoneOffset);

          let quoteMinute = dateFormatter.formatDateHHMM(localDate);
          quoteData.minute = quoteMinute;
          quoteData.latestUpdateLocal = localDate.getTime();

          if (quoteData && intradayData) {

            quote = quoteData;

            var intradayObject = {};

            for (var i = 0; i < intradayData.length; i++) {
              let result = intradayData[i];

              let minute = result.minute;
              var price;
              if (result.average) {
                price = result.average;
              } else if (result.marketAverage) {
                price = result.marketAverage;
              }

              if (price) {
                intradayObject[minute] = price;
                intradayArray.push({
                  minute: minute,
                  price: price
                });
              }

            }

            intradayArray.sort((a, b) => (a.minute > b.minute) ? 1 : -1);

            stockData.quote = quoteData;

            var updateObject = {};
            updateObject[`global/stock/info/${symbol}`] = stockData;
            updateObject[`global/stock/intraday/${symbol}`] = intradayObject;
            return database.update(updateObject);
          } else {
            return Promise.reject(new Error('Data missing'));
          }
        }).then ( () => {
          stockData.intraday = intradayArray;
          return Promise.resolve(stockData);
        }).catch( err => {
          return Promise.reject(err);
        });
      }
  }).then ( stockData => {

    let responseData = {
      stock: stockData,
    }

    return res.send(responseData);
  }).then( () => {
    return redisClient.hsetnx('watchlist', symbol, true);
  }).then( resp => {
    if (resp) {
      let groupIndex = addToWatchlist(symbol);
      openStream(groupIndex);
    }

    return
  }).catch ( err => {
    console.log(err);
    return res.send(err);
  })

});

app.get('/stock/symbol/:symbol', (req, res) => {
  let symbol = req.params.symbol.toUpperCase();
  return redisClient.hgetall(`symbol:${symbol}`).then ( resp => {
    res.send(resp);
  }).catch( err => {
    res.send(err);
  });
});

app.get('/stock/iexID/:iexID', (req, res) => {
  let iexId = req.params.iexID;
  return redisClient.hgetall(`iexID:${iexId}`).then ( resp => {
    res.send(resp);
  }).catch( err => {
    res.send(err);
  });
});

app.get('/ref-data/symbols', (req, res) => {
  return iexCloudAPI.symbols().then( results => {

    var batch = redisClient.batch();

    results.forEach( (symbolData) => {

      let symbol = symbolData.symbol;
      let iexID = symbolData.iexId;

      var data = symbolData;
      delete data.symbol;

      batch.hmset(`symbol:${symbol}`, data);
      batch.hmset(`iexID:${iexID}`, { 'symbol': symbol });

    });

    batch.exec( (err, resp) => {
      if (err) {
        return res.send(err);
      } else {
        return res.send(resp);
      }
    })
  }).catch( err => {
    return res.send(err);
  });
})


app.get('/ref-data/exchange/:region/:exchangeID', (req, res) => {
  let hashKey = `exchange:${req.params.region}-${req.params.exchangeID}`;
  return redisClient.hgetall(hashKey).then ( resp => {
    return res.send(resp);
  }).catch( err => {
    return res.send(err);
  })
});

app.post('/ref-data/exchange/:region/:exchangeID', (req, res) => {

  let hashKey = `exchange:${req.params.region}-${req.params.exchangeID}`;

  let data = {
    name: req.body.name,
    longName: req.body.longName,
    type: req.body.type,
    timeZone: req.body.timeZone
  }

  return redisClient.hmset(hashKey, data).then ( resp => {
    return res.send(resp);
  }).catch( err => {
    return res.send(err);
  })

})

app.delete('/ref-data/exchange/:region/:exchangeID', (req, res) => {
  let hashKey = `exchange:${req.params.region}-${req.params.exchangeID}`;
  var batch = redisClient.batch();
  return redisClient.hkeys(hashKey).then ( keys => {
    var batch = redisClient.batch();
    keys.forEach( (key) => {
      console.log(key);
      batch.hdel(hashKey, key);
    })

    batch.exec( (err, resp) => {
      if (err) {
        return res.send(err);
      } else {
        return res.send(resp);
      }
    })

  });
})

app.get('/timezone/:region/:city', (req, res) => {
  let region = req.params.region;
  let city = req.params.city;
  let hashKey = `timezone:${region}-${city}`;

  return redisClient.hgetall(hashKey).then ( results => {
    return res.send(results);
  }).catch( err => {
    return res.send(err);
  })
});

app.delete('/timezone/:region/:city', (req, res) => {
  let region = req.params.region;
  let city = req.params.city;
  let hashKey = `timezone:${region}-${city}`;

  var batch = redisClient.batch();
  return redisClient.hkeys(hashKey).then ( keys => {
    var batch = redisClient.batch();
    keys.forEach( (key) => {
      batch.hdel(hashKey, key);
    })

    batch.exec( (err, resp) => {
      if (err) {
        return res.send(err);
      } else {
        return res.send(resp);
      }
    })

  });
})

app.use('/timezones', timezones);


function init() {
  console.log("raven-stream init");

  return openAllStreams().then( () => {
    app.listen(port, () => console.log(`raven-stream is listening on port ${port}.`));
  }).catch( err => {
    console.log(err);
    return
  })
}

init();
