#!/usr/bin/env node
/**
 * Create an HTTP dashboard for isc-dhcpd
 *
 * Author: Dave Eddy <dave@daveeddy.com>
 * Date: May 15, 2015
 * License: MIT
 */

var fs = require('fs');
var http = require('http');
var path = require('path');

var accesslog = require('access-log');
var assert = require('assert-plus');
var dhcpdleases = require('dhcpd-leases');
var easyreq = require('easyreq');
var human = require('human-time');
var ipsort = require('ipsort');
var getopt = require('posix-getopt');
var staticroute = require('static-route')({
  dir: path.join(__dirname, 'site'),
  autoindex: false,
  tryfiles: ['index.html'],
});

var package = require('./package.json');

var usage = [
  'usage: dhcpd-dashboard [-c config] [-p port] [-H host] [leases file]',
  '',
  'options',
  '',
  '  -h, --help               print this message and exit',
  '  -H, --host <host>        [env DHCPD_HTTP_HOST] host on which to listen',
  '  -p, --port <port>        [env DHCPD_HTTP_PORT] port on which to listen',
  '  -c, --config <config>    [env DHCPD_CONFIG] config file to use',
  '  -u, --updates            check for available updates',
  '  -v, --version            print the version number and exit',
].join('\n');

var options = [
  'c:(config)',
  'h(help)',
  'H:(host)',
  'p:(port)',
  'u(updates)',
  'v(version)'
].join('');
var parser = new getopt.BasicParser(options, process.argv);

var opts = {
  configFile: process.env.DHCPD_CONFIG;
};
var option;
while ((option = parser.getopt())) {
  switch (option.option) {
    case 'c': opts.configFile = option.optarg; break;
    case 'h': console.log(usage); process.exit(0); break;
    case 'H': opts.host = option.optarg; break;
    case 'p': opts.port = option.optarg; break;
    case 'u': // check for updates
      require('latest').checkupdate(package, function(ret, msg) {
        console.log(msg);
        process.exit(ret);
      });
      return;
    case 'v': console.log(package.version); process.exit(0); break;
    default: console.error(usage); process.exit(1); break;
  }
}
var args = process.argv.slice(parser.optind());

var config = {};
if (opts.configFile) {
  config = JSON.parse(fs.readFileSync(opts.configFile));
}
assert.object(config, 'config');

config.host = config.host || opts.host || process.env.DHCPD_HTTP_HOST || '0.0.0.0';
config.port = parseInt(config.port || opts.port || process.env.DHCPD_HTTP_PORT || 8080, 10);
config.leases = config.leases || args[0] || process.env.DHCPD_LEASES_FILE;

if (!config.leases) {
  console.error('dhcpd.leases(5) must be specified as the first argument');
  process.exit(1);
}

assert.string(config.host, 'config.host');
assert.number(config.port, 'config.port');
assert.string(config.leases, 'config.leases');
assert.optionalObject(config.aliases, 'config.aliases');

http.createServer(onrequest).listen(config.port, config.host, started);

function started() {
  console.log('listening on http://%s:%d - leases file %s',
    config.host, config.port, config.leases);
}

var leases = {
  updated: new Date().toString(),
  raw: fs.readFileSync(config.leases, 'utf8'),
  error: null,
  aliasesEnabled: !!config.aliases
};
leases.leases = formatleases(leases.raw);

function onrequest(req, res) {
  accesslog(req, res);
  easyreq(req, res);

  switch (req.url) {
    case '/ping':
      res.end('pong\n');
      break;
    case '/dhcpd.json':
      res.json(leases);
      break;
    case '/dhcpd.txt':
      res.end(leases.raw);
      break;
    default:
      staticroute(req, res);
      break;
  }
}

// read leases file every 10 seconds
setInterval(readleases, 10 * 1000);
function readleases() {
  fs.readFile(config.leases, 'utf8', function(err, data) {
    leases.leases = null;
    leases.updated = new Date().toString();
    if (err) {
      leases.error = err.message;
    } else {
      leases.error = null;
      leases.raw = data;
      try {
        leases.leases = formatleases(data);
      } catch(e) {
        leases.error = e.message;
      }
    }
  });
}

// given a string that is in dhcpd.leases(5) format, return a suitable
// javascript object
function formatleases(s) {
  var now = new Date();
  var hosts = {};
  var leases = [];

  // parse data and filter out duplicated leases
  dhcpdleases(s).forEach(function (lease) {
    var ip = lease.ip;
    var mac = lease['hardware ethernet'];

    hosts[ip] = hosts[ip] || {};

    if (!hosts[ip][mac]) {
      hosts[ip][mac] = lease;
      return;
    }

    // lease already found for this ip/mac combo - use latest
    if (lease.starts > hosts[ip][mac].starts) {
      hosts[ip][mac] = lease;
    }
  });

  // put records into an array
  Object.keys(hosts).forEach(function (ip) {
    Object.keys(hosts[ip]).forEach(function (mac) {
      leases.push(hosts[ip][mac]);
    });
  });

  // sort the data
  leases.sort(function (a, b) {
    return ipsort.compareFunction(a.ip, b.ip);
  });

  // format data remaining nicely
  leases.forEach(function (lease) {
    lease.expired = lease.ends < now;
    var mac = lease['hardware ethernet'];

    if (config.aliases) {
      lease.alias = config.aliases.hasOwnProperty(mac) ?
        config.aliases[mac] : '';
    }

    Object.keys(lease).forEach(function (key) {
      var val = lease[key];

      if (val instanceof Date) {
        lease[key] = {
          date: val,
          human: human(val)
        };
      }
    });
  });

  return leases;
}
