'use strict';

const express = require('express');
const redis = require('redis');
const bodyParser = require('body-parser');
const multer = require('multer');
const upload = multer();

// Constants
const SERVER_PORT = 8080;
const PAGE_SIZE = 30;
const REDIS_PORT = 6379;
const REDIS_HOST = '127.0.0.1';
const ZSET_KEY = 'mon_names';
const HASH_KEY = 'monitors';
const ZSET_SCORE = 1;

// App
const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

app.get('/', function (req, res) {
  res.send('Hello worldxx\n');
});

// get limits
app.get('/limits', function (req, res) {
    var pattern = /^[1-9][0-9]*$/;
    var page = req.query.page;
    if (!pattern.test(page)) {
        res.end('parameter error');
        return;
    }
    
    getLimits(page-1, PAGE_SIZE, function (limits) {
        console.log('get limits from redis db: ' + limits);
        res.end(limits);
    });

});

// get one limit by monitor name
app.get('/limit', function (req, res) {
    var msg = '';
    try {
        var monName = req.query.mon_name;
        if (!/^[a-z_\-0-9]+$/.test(monName)) throw 'parameter error';
        var client = redis.createClient(REDIS_PORT, REDIS_HOST);
        client.on('error', function (err) {
            console.log('connect redis failed[' + err + ']');
            res.end('connect redis failed[' + err + ']');
        });
        // get monitor config from hash
        client.on('connect', function () {
            client.hget(HASH_KEY, monName, function (err, response) {
                if (!err) {
                    res.end(response);
                }
            });
        });
    }
    catch (ex) {
        res.end(ex);
    }
});

// create or update limit config
app.post('/limit', upload.array(), function (req, res) {
    console.log(req.body);
    // check post body
    var msg = '';
    try {
        if (!/^[a-z_\-0-9]+$/.test(req.body.mon_name)) throw 'parameter error';
        if (!/^[1-9][0-9]*$/.test(req.body.max_req_count )) throw 'parameter error';
        if (!/^[1-9][0-9]*$/.test(req.body.time_unit )) throw 'parameter error';
        if (!/^[1-9][0-9]*|0$/.test(req.body.prison_time )) throw 'parameter error';
        var client = redis.createClient(REDIS_PORT, REDIS_HOST);
        client.on('error', function (err) {
            console.log('connect redis failed[' + err + ']');
        });
        // get monitor names from zset
        client.on('connect', function () {
            var name = req.body.mon_name;
            var property = {
                max_req_count :parseInt(req.body.max_req_count),
                time_unit:parseInt(req.body.time_unit),
                prison_time:parseInt(req.body.prison_time)
            };
            client.multi()
                .hset(HASH_KEY, name, JSON.stringify(property))
                .zadd(ZSET_KEY, ZSET_SCORE, name)
                .exec(function (err, replies) {
                });
        });
    }
    catch (ex) {
        console.log(ex);
        msg = ex;
    }
    res.end(msg);
});

// page_index start from 0
function getLimits(page_index, page_size, callback) {
    try {
        var client = redis.createClient(REDIS_PORT, REDIS_HOST);
        var monNames = [];
        var limits = [];
        client.on('error', function (err) {
            console.log('connect redis failed[' + err + ']');
        });
        // get monitor names from zset
        client.on('connect', function () {
            console.log('connect redis success');
            var args = [ZSET_KEY, page_index * page_size, (page_index+1) * page_size];
            console.log('zrange args: ' + args);
            client.zrange(args, function (err, res) {
                if (err) throw err;
                monNames = res;
                // get monitor configs by monitor names
                if (monNames.length !== 0) {
                    var args = [HASH_KEY].concat(monNames);
                    console.log('hmget args: ' + args);
                    client.hmget(args, function (err, res) {
                        if (err) throw err;
                        for (var i = 0; i < monNames.length; i++) {
                            var item = JSON.parse(res[i]);
                            if (item) {
                                item['name'] = monNames[i];
                                limits.push(item);
                            }
                        }
                        callback(JSON.stringify(limits));
                    });
                }
                else {
                    callback('[]');
                }
            });
        });
    }
    catch (ex) {
        callback('[]');
    }

}
console.log('listening port ' + SERVER_PORT);
app.listen(SERVER_PORT);
