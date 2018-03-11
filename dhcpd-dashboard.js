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
  'usage: dhcpd-dashboard [-p port] [-H host] [leases file]',
  '',
  'options',
  '',
  '  -h, --help               print this message and exit',
  '  -H, --host <host>        [env DHCPD_HTTP_HOST] host on which to listen',
  '  -p, --port <port>        [env DHCPD_HTTP_PORT] port on which to listen',
  '  -u, --updates            check for available updates',
  '  -v, --version            print the version number and exit',
].join('\n');

var options = [
  'h(help)',
  'H:(host)',
  'p:(port)',
  'u(updates)',
  'v(version)'
].join('');
var parser = new getopt.BasicParser(options, process.argv);

var opts = {
  host: process.env.DHCPD_HTTP_HOST || '0.0.0.0',
  port: process.env.DHCPD_HTTP_PORT || 8080,
};
var option;
while ((option = parser.getopt())) {
  switch (option.option) {
    case 'h': console.log(usage); process.exit(0); break;
    case 'H': opts.host = option.optarg; break;
    case 'p': opts.port = option.optarg; break;
    case 'r': opts.readonly = true; break;
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
var file = args[0] || process.env.DHCPD_LEASES_FILE;

if (!file) {
  console.error('dhcpd.leases(5) must be specified as the first argument');
  process.exit(1);
}

http.createServer(onrequest).listen(opts.port, opts.host, started);

function started() {
  console.log('listening on http://%s:%d - leases file %s', opts.host, opts.port, file);
}

var leases = {
  updated: new Date().toString(),
  raw: fs.readFileSync(file, 'utf8'),
  error: null,
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
      // this is cached as to not be DDoS point
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
  fs.readFile(file, 'utf8', function(err, data) {
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
  var o = dhcpdleases(s);
  var now = new Date();

  return ipsort(Object.keys(o)).map(function(ip) {
    Object.keys(o[ip]).forEach(function(key) {
      var val = o[ip][key];
      if (val instanceof Date)
        o[ip][key] = {
          date: val,
          human: human(val)
        };
    });
    o[ip].ip = ip;
    o[ip].expired = o[ip].ends.date < now;
    return o[ip];
  });
}
