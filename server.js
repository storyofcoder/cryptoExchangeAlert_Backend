const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const pako = require('pako');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const Client = require('./models/client');
const Data = require('./models/data');
const rp = require('request-promise');

const binance = require('node-binance-api')().options({
    APIKEY: '',
    APISECRET: '',
    useServerTime: true // If you get timestamp errors, synchronize to server time at startup
});
const ws = new WebSocket('wss://real.okex.com:8443/ws/v3');

// @ API used under projects
const nodemailer = require("nodemailer");

/**
 * @description. connect mongodb database on mlab
 */
mongoose.connect('mongodb://muny:9812126109m@ds157834.mlab.com:57834/green-mart');

// init app
const app = express();

// define  a port
const port = process.env.PORT || 3000;

/**
 * @description. body parser middleware
 */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

/**
 * @description. Initializing the session magic of express-session package
 */
app.use(session({
    secret: "Shh, its a secret!",
    resave: false,
    saveUninitialized: true
}));

/**
 * @description.
 *
 * @parameters
 * @return
 */

/**
 * @description. Set CORS headers: allow all origins, methods, and headers: you may want to lock this down in a production environment
 */
app.all('*', function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, PUT, PATCH, POST, DELETE");
    res.header("Access-Control-Allow-Headers", req.header('access-control-request-headers'));

    if (req.method === 'OPTIONS') {
        // CORS Preflight
        res.send();
    } else {
        next();
    }
});


/**
 * @description. it handle the http request on home and describe sever status on request.
 *
 * @parameters
 * @return
 */
app.get('/', function (req, res) {
    if (req.session.page_views) {
        req.session.page_views++;
        res.status(200).json({status: true, message: "You visited this page " + req.session.page_views + " times"});
    } else {
        req.session.page_views++;
        res.status(200).json({status: true, message: "first visit by this user"});
    }
});

/**
 * @description. it handle the http signup request on /signup.
 *
 * @parameters client details on req.body
 * @return status
 */
app.post('/signup', function (req, res, next) {
    Client.findOne({email: req.body.email}, function (err, valid) {
        if (valid) {
            res.status(403).json({status: false, message: 'email id already exits'});
        } else {
            let client = new Client({
                email: req.body.email,
                password: req.body.password,
                name: req.body.name,
                number: req.body.number,
                data: {
                    list: []
                }
            });
            client.save(function (err, result) {
                if (result) {
                    client = {
                        name: result.name,
                        id: result._id,
                        email: result.email,
                        number: result.number,
                        data: result.data,
                        status: true
                    };
                    req.session.user = client;
                    res.status(200).json(client);
                } else if (err) {
                    res.status(403).json({status: false, message: 'dataBase error'});
                }
            });
        }
    });
});

/**
 * @description. it handle the http login request on /login.
 *
 * @parameters client details on req.body
 * @return status
 */
app.post('/login', function (req, res, next) {
    Client.findOne({email: req.body.email, password: req.body.password}, function (err, client) {
        if (client) {
            const newdata = {
                name: client.name,
                id: client._id,
                email: client.email,
                number: client.number,
                list: client.data,
                status: true
            };
            res.status(200).json({status: true, data: newdata});
        } else {
            const error = {status: false, message: 'not valid user'};
            res.status(403).json({status: false, data: error});
        }
    });
});

/**
 * @description. it handle the http request to get all the okes pair / exchange symbols
 *
 * @parameters client details on req.body
 * @return status
 */
app.get('/okesPair', (req, res) => {
    let oxbSymbolString = [];
    rp('https://www.okex.com/api/spot/v3/instruments/ticker')
        .then(function (htmlString) {
            JSON.parse(htmlString).map((obj) => {
                oxbSymbolString.push(obj.product_id);
            });
            res.status(200).json({status: true, data: oxbSymbolString});
        })
        .catch(function (err) {
            res.status(403).json({status: false, data: err});
        });
});

/**
 * @description. it handle the http request to get all the binance pair / exchange symbols
 *
 * @parameters client details on req.body
 * @return status
 */
app.get('/getSymbol', function (req, res, next) {
    let allSymbols = [];
    binance.bookTickers((error, ticker) => {
        ticker.map((data, index) => {
            if (index < 580) {
                allSymbols.push(data.symbol);
            }
        });
        res.status(200).json({status: true, data: allSymbols});
    });
});

/**
 * @description. it handle the http user details used for loged in user
 *
 * @parameters client details on req.body
 * @return status
 */
app.post('/userDetails', function (req, res, next) {
    Client.findOne({email: req.body.email}, function (err, client) {
        if (client) {
            const newdata = {
                name: client.name,
                id: client._id,
                email: client.email,
                number: client.number,
                list: client.data,
                status: true
            };
            res.status(200).json({status: true, data: newdata});
        } else {
            const error = {status: false, message: 'not valid user'};
            res.status(403).json({data: error});
        }
    });
});

/**
 * @description. it handle the http to get current exchange price for a single pair
 *
 * @parameters client details on req.body
 * @return status
 */
app.post('/currentExchange', function (req, res, next) {
    if (req.body.currency == 'BNB') {
        binance.prices(req.body.symbol, (error, ticker) => {
            res.status(200).json({data: {price: Object.values(ticker)[0]}});
        });
    } else {
        rp(`https://www.okex.com/api/spot/v3/instruments/${req.body.symbol}/trades`)
            .then(function (htmlString) {
                res.status(200).json({status: true, data: {price: JSON.parse(htmlString)[0].price}});
            })
            .catch(function (err) {
                res.status(403).json({status: false, data: err});
            });
    }
});

let notiData = {};

/**
 * @description. it handle the http request that handle addition of exchange details according to user
 *
 * @parameters client details on req.body
 * @return status
 */
app.post('/addExchange', function (req, res, next) {

    const symbol = req.body.exchange;

    let userData = {
        name: req.body.userDetails.name,
        emaiL: req.body.userDetails.email,
        operation: req.body.noti,
        pric: req.body.price,
        price: req.body.pric,
        number: req.body.userDetails.number,
        lastNoti: 0
    };

    Data.findOne({name: 'data'}, function (err, doc) {
        let newData = doc.notidata;
        if (!newData[symbol]) {
            newData[symbol] = [];
        }
        newData[symbol].push(userData);
        notiData = newData;
        doc.notidata = JSON.parse(JSON.stringify(newData));
        doc.save();
    });

    Client.findOne({email: req.body.userDetails.email}, function (err, client) {
        if (client) {
            let clientList = client.data;
            clientList.list.push({
                currency: req.body.currency,
                exchange: req.body.exchange,
                noti: req.body.noti,
                price: req.body.pric,
                pr: req.body.pri
            });

            client.data = JSON.parse(JSON.stringify(clientList));
            client.save();
            res.status(200).json({status: true, data: clientList});
        }
    });
});

/**
 * @description. it handle the http request that handle deletion of saved exchange details according to user
 *
 * @parameters client details on req.body
 * @return status
 */
app.post('/deleteOne', function (req, res, next) {

    const symbol = req.body.exchange;
    Data.findOne({name: 'data'}, function (err, doc) {
        let newData = doc.notidata;
        newData[symbol].map((data, i) => {
            if ((data.emaiL == req.body.userDetails.email) && (data.price == req.body.price)) {
                newData[symbol].splice(i, 1);
            }
        });
        notiData = newData;
        Data.update({name: 'data'}, {
            notidata: newData
        }, function (err, numberAffected, rawResponse) {
            if (err) {
                res.status(403).json({message: 'database error', status: false});
            }
        });
    });

    Client.findOne({email: req.body.userDetails.email}, function (err, client) {
        if (client) {
            let clientList = client.data;
            clientList.list.splice(req.body.index, 1);

            Client.update({email: req.body.userDetails.email}, {
                data: clientList
            }, function (err, numberAffected, rawResponse) {
                if (err) {
                    res.status(403).json({message: 'database error', status: false});
                }
            });
            res.status(200).json({status: true, data: client.data});
        }
    });
});

/**
 * @description. it handle the http request that handle modified the exchange details according to user
 *
 * @parameters client details on req.body
 * @return status
 */
app.post('/modifyOne', function (req, res, next) {

    Client.findOne({email: req.body.userDetails.email}, function (err, client) {
        if (client) {
            let clientList = client.data;
            const oldData = clientList.list[req.body.index];

            Data.findOne({name: 'data'}, function (err, doc) {
                let newData = doc.notidata;
                newData[oldData.exchange].map((data, i) => {
                    if ((data.emaiL == req.body.userDetails.email) && (data.price == oldData.price)) {
                        data.operation = req.body.modifyData.noti;
                        data.price = req.body.modifyData.price;
                        data.lastNoti = 0
                    }
                });
                notiData = newData;
                Data.update({name: 'data'}, {
                    notidata: newData
                }, function (err, numberAffected, rawResponse) {
                    if (err) {
                        res.status(403).json({message: 'database error', status: false});
                    }
                });
            });

            clientList.list[req.body.index] = {
                currency: req.body.modifyData.currency,
                exchange: req.body.modifyData.exchange,
                noti: req.body.modifyData.noti,
                price: req.body.modifyData.price
            };

            Client.update({email: req.body.userDetails.email}, {
                data: clientList
            }, function (err, numberAffected, rawResponse) {
                if (err) {
                    res.status(202).json({message: 'database error', status: false});
                }
                res.status(200).json({status: true, data: clientList});
            })
        }
    });
});

/**
 * @function setData set on notification Data
 *
 * @parameters void
 * @return void
 */
function setData() {
    Data.findOne({name: 'data'}, function (err, doc) {
        notiData = doc.notidata;
    });
}

/**
 * @function oxbSocket function is used to start oxb websocket
 *
 * @parameters void
 * @return void
 */
function oxbSocket() {

    let okbSymbolString = [];
    rp('https://www.okex.com/api/spot/v3/instruments/ticker')
        .then(function (htmlString) {
            JSON.parse(htmlString).map((obj) => {
                okbSymbolString.push(`"spot/trade:${obj.product_id}"`);
            });

            const query = `{"op": "subscribe", "args": [ ${okbSymbolString} ]}`;

            ws.on('open', function open() {
                ws.send(query);
            });

            ws.on('message', function incoming(data) {
                if (data instanceof String) {
                    // console.log(data)
                } else {
                    try {
                        let a = pako.inflateRaw(data, {to: 'string'});
                        a = JSON.parse(a);

                        if (a.data) {
                            a.data.map((obj) => {
                                // console.log( obj.instrument_id + " " + obj.price);

                                if (notiData[obj.instrument_id]) {
                                    notiData[obj.instrument_id].map((data, index) => {
                                        if ((Math.round((new Date()).getTime() / 1000) - data.lastNoti) > 3600) {
                                            if ((parseFloat(data.price, 10) <= parseFloat(obj.price, 10)) && (data.operation == 'More or equal')
                                                || (parseFloat(data.price, 10) > parseFloat(obj.price, 10)) && (data.operation == 'Less than')) {
                                                console.log('------------------------------------ found ' + data.operation + " " + obj.instrument_id + ' ' + obj.price);

                                                notiData[obj.instrument_id][index].lastNoti = Math.round((new Date()).getTime() / 1000);
                                                sendEmail(data.name, obj.instrument_id, data.emaiL, data.operation, data.price, obj.price);
                                                sendSms(data.name, obj.instrument_id, data.number, data.operation, data.price, obj.price);

                                                Data.update({name: 'data'}, {
                                                    notidata: notiData
                                                }, function (err, numberAffected, rawResponse) {
                                                });

                                            }
                                        }
                                    })
                                }
                            });
                        }

                    } catch (err) {
                        // console.log(err)
                    }
                }
            });
        })
        .catch(function (err) {
            console.log(err);
        });
}

/**
 * @function bnbSocket function is used to start Binance websocket
 *
 * @parameters void
 * @return void
 */
function bnbSocket() {
    let allSymbols = [];
    binance.bookTickers((error, ticker) => {
        ticker.map((data, index) => {
            if (index < 580) {
                allSymbols.push(data.symbol);
            }
        });
        binance.websockets.trades(allSymbols, (trades) => {
            let {s: symbol, p: price} = trades;
            // console.log(symbol);
            if (notiData[symbol]) {
                notiData[symbol].map((data, index) => {
                    if ((Math.round((new Date()).getTime() / 1000) - data.lastNoti) > 3600) {            /*next notification to same exchange send after 1 hour*/
                        if ((parseFloat(data.price, 10) <= parseFloat(price, 10)) && (data.operation == 'More or equal')
                            || (parseFloat(data.price, 10) > parseFloat(price, 10)) && (data.operation == 'Less than')) {
                            console.log('------------------------------------ found ' + data.operation + " " + symbol + ' ' + price);

                            notiData[symbol][index].lastNoti = Math.round((new Date()).getTime() / 1000);
                            Data.update({name: 'data'}, {
                                notidata: notiData
                            }, function (err, numberAffected, rawResponse) {
                            });

                           sendEmail(data.name, symbol, data.emaiL, data.operation, data.price, price);
                           sendSms(data.name, symbol, data.number, data.operation, data.price, price);
                        }
                    }
                })
            }
        });
    });
}

/**
 * @function sendEmail function is used to send Email on client to send notification
 *
 * @parameters name, exchange, client email, filled notification price, current price
 * @return void
 */
function sendEmail(name, exchange, email, operation, price, rate) {
    async function main() {

        // Generate test SMTP service account from ethereal.email
        // Only needed if you don't have a real mail account for testing
        let testAccount = await nodemailer.createTestAccount();

        // create reusable transporter object using the default SMTP transport
        let transporter = nodemailer.createTransport({
            service: 'gmail',
            // port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: '', // generated ethereal user
                pass: '' // generated ethereal password
            }
        });

        const subject = `${exchange} is ${operation} than the ${price}`;
        const message = `Hello ${name} the price of ${exchange} is ${operation} than the ${price}. Great chance to exchange  and current exchange rate is ${rate}, Thank You`;
        const maint = `<b>Great change to exchange?</b> <br> <br> ${message}`;
        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: 'munny231197@gmail.com', // sender address
            to: email, // list of receivers
            subject: subject, // Subject line
            text: message, // plain text body
            html: maint
        });

        console.log("Message sent: %s", info.messageId);
        // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>

        // Preview only available when sending through an Ethereal account
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
        // Preview URL: https://ethereal.email/message/WaQKMgKddxQDoou...
    }

    main().catch(console.error);
}

/**
 * @function sendSms function is used to send SMS on client to send notification
 *
 * @parameters name, exchange, client email, filled notification price, current price
 * @return void
 */
function sendSms(name, exchange, userNumber, operation, price, rate) {

    let test_api_key = "";
    let test_secret_id = "";
    let api_use = "stage";
    let any_name_or_number = "Munny Kumar";
    let mobile_no_to_be_send = userNumber;
    let message = `Hello ${name} the price of ${exchange} is ${operation} than the ${price}. Great chance to exchange 
                    and current exchange rate is ${rate}, Thank You`;

    var query = `https://www.way2sms.com/api/v1/sendCampaign?apikey=${test_api_key}&secret=${test_secret_id}&usetype=${api_use}&senderid=${any_name_or_number}&phone=${mobile_no_to_be_send}&message=${message}`;
    rp(query)
        .then(function (htmlString) {
            console.log(htmlString);
        })
        .catch(function (err) {
            console.log(err);
        });
}

/**
 * @function autoStart function start the websocket api automatically when the server start.
 *
 * @parameters void
 * @return void
 */
function autoStart() {
    bnbSocket();
    oxbSocket();
    setData();
}


/**
 * @description to start server : default port 3000
 */
app.listen(port, () => {
    autoStart();
    console.log('server start on ' + port);
});
