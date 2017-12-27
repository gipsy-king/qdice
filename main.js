if (process.env.NODE_ENV !== 'production') {
  console.log('Loading local .env vars')
  require('./envs');
}

const R = require('ramda');
const restify = require('restify');
const corsMiddleware = require('restify-cors-middleware');
const jwt = require('restify-jwt-community');


const server = restify.createServer();
server.pre(restify.pre.userAgentConnection());
server.use(restify.plugins.acceptParser(server.acceptable));
server.use(restify.plugins.authorizationParser());
server.use(restify.plugins.dateParser());
server.use(restify.plugins.queryParser());
server.use(restify.plugins.jsonp());
server.use(restify.plugins.gzipResponse());
server.use(restify.plugins.bodyParser());
server.use(restify.plugins.throttle({
  burst: 100,
  rate: 50,
  ip: true,
  overrides: {
    '192.168.1.1': {
      rate: 0,        // unlimited
      burst: 0
    }
  }
}));
server.use(restify.plugins.conditionalRequest());
const cors = corsMiddleware({
  preflightMaxAge: 5, //Optional
  origins: ['http://localhost:5000', 'http://lvh.me:5000', 'https://quedice.host', 'https://elm-dice.herokuapp.com'],
  allowHeaders: ['authorization'],
  exposeHeaders: ['authorization']
});
server.pre(cors.preflight);
server.use(cors.actual);
server.use(jwt({
  secret: process.env.JWT_SECRET,
  credentialsRequired: true,
  getToken: function fromHeaderOrQuerystring (req) {
    if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
        return req.headers.authorization.split(' ')[1] || null;
    }
    return null;
  },
})
.unless({
  custom: req => {
    const ok = R.anyPass([
      req => req.path() === '/login',
      req => req.path() === '/register',
      req => req.path() === '/global',
      req => req.route.path === '/tables/:tableName/:command'
        && req.context.command === 'Enter',
    ])(req);
    return ok;
  }
}));

server.on('uncaughtException', function (req, res, err, cb) {
    console.log(err);
    return cb();
});

server.post('/login', require('./user').login);
server.get('/me', require('./user').me);
server.put('/profile', require('./user').profile);
server.post('/register', require('./user').register);

const tables = require('./tables');
server.post('/tables/:tableName/:command', tables.command);

server.get('/global', require('./global')(tables.getTables));

server.listen(process.env.PORT || 5001, function() {
  console.log('%s listening at %s port %s', server.name, server.url);
});

setInterval(function tick() {
  tables.tick();
}, 500);


const mqtt = require('mqtt');
console.log('connecting to mqtt: ' + process.env.MQTT_URL);
var client = mqtt.connect(process.env.MQTT_URL, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
});
tables.setMqtt(client);
 
client.on('connect', function () {
  console.log('mqtt connected');
});

client.on('error', err => console.error(err));

