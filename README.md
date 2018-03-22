DHCPD Dashboard
===============

Create an HTTP dashboard for isc-dhcpd

![screenshot](/screenshots/dhcpd-dashboard-1.png)

Installation
------------

    npm install -g dhcpd-dashboard

Example
-------

    $ dhcpd-dashboard /var/db/isc-dhcp/dhcpd.leases
    listening on http://0.0.0.0:8080 - leases file /var/db/isc-dhcp/dhcpd.leases
    10.0.1.229 - - [16/May/2015:00:38:35 -0000] "GET /dhcpd.json HTTP/1.1" 200 10409 "http://dhcp:8080/" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36"

Usage
-----

    $ dhcpd-dashboard
    usage: dhcpd-dashboard [-c config] [-p port] [-H host] [leases file]

    options

      -h, --help               print this message and exit
      -H, --host <host>        [env DHCPD_HTTP_HOST] host on which to listen
      -p, --port <port>        [env DHCPD_HTTP_PORT] port on which to listen
      -c, --config <config>    [env DHCPD_CONFIG] config file to use
      -u, --updates            check for available updates
      -v, --version            print the version number and exit

License
-------

MIT License
