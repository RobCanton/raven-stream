var request = require('request');
var rp = require('request-promise');
var express = require('express');
var router = express.Router();
var firebase = require('../exports/firebase/firebase.js');
var redisClient = require('../exports/redis/client_async.js');


const firestore = firebase.firestore();


// middleware that is specific to this router
router.use(function timeLog (req, res, next) {
  console.log('Timezones: ', Date.now())
  next();
})


router.put('/:region/:city', (req, res) => {
  let region = req.params.region;
  let city = req.params.city;
  let uri = `http://worldtimeapi.org/api/timezone/${region}/${city}`;
  let options = {
    uri: uri,
    json: true
  }

  var data;
  return rp(options).then( results => {
    let docID = `${region}-${city}`;
    data = {
      timezone: results.timezone,
      raw_offset: results.raw_offset,
      dst_offset: results.dst_offset,
      dst_start: results.dst_from,
      dst_end: results.dst_until,
      dst: results.dst,
      abbreviation: results.abbreviation
    }
    let docRef = firestore.collection('timezones').doc(docID);
    return docRef.set(data);
  }).then( () => {
    return res.send(data);
  }).catch( err => {
    console.log(err);
    return res.send(err);
  })
});

router.post('/:region/:city', (req, res) => {
  let region = req.params.region;
  let city = req.params.city;
  let hashKey = `timezone:${region}-${city}`;

  let data = {
    dst: req.body.dst,
    dst_end: req.body.dst_end,
    dst_offset: req.body.dst_offset,
    dst_start: req.body.dst_start,
    raw_offset: req.body.raw_offset,
    abbreviation: req.body.abbreviation
  }

  return redisClient.hmset(hashKey, data).then ( resp => {
    return res.send(resp);
  }).catch( err => {
    return res.send(err);
  })

})


// define the home page route
router.get('/', function (req, res) {
  res.send('Timezones home page')
})


module.exports = router;
