console.log("Stock Raven 🦉");

var request = require("request");
var express = require("express");


var app = express()
var port = 3000

var symbolGroups = [];

app.get('/add-symbol', (req, res) => {

  let symbol = req.query.symbol;
  console.log("Symbol: " + symbol);
  if (symbol === null || symbol === undefined) {
    return res.send({ error: "Symbol not found" });
  }
  
  if (symbolGroups.length === 0) {
    let newGroup = [symbol];
    symbolGroups.push(newGroup);
  } else {
    for (var i = symbolGroups.length-1; i >= 0; i--) {
      let group = symbolGroups[i];
      group.push(symbol)
    }
  }
  
  return res.send({
    success: true,
    symbol: symbol
  })
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`))

var token = "sk_4825f6ed09244b63b6d45191944fa25d";


// var streams = [];
// var stream;

// let filter = "filter=latestUpdate,latestPrice";

// function connect() {
//     stream = request({
//         url: `https://cloud-sse.iexapis.com/stable/stocksUSNoUTP?token=${token}&symbols=aapl&${filter}`,
//         headers: {
//             'Content-Type': 'text/event-stream'
//         }
//     })
// }
// connect();

// stream.on('socket', () => {
//     console.log("Connected");
// });

// stream.on('end', () => {
//     console.log("Reconnecting");
//     connect();
// });

// stream.on('complete', () => {
//     console.log("Reconnecting");
//     connect();
// });

// stream.on('error', (err) => {
//     console.log("Error", err);
//     connect();
// });

// stream.on('data', (response) => {
//     var str = response.toString();
//     var obj = JSON.parse(str.replace('data:', ''));

//     console.log(obj);
// });

// function wait () {
//     setTimeout(wait, 1000);
// }

// wait();