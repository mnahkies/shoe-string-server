#!/usr/bin/env bash

# Example of how to test the proxied applications prior to
# setting up DNS records etc. You can also run this from another
# machine with the appropriate public ip
curl 127.0.0.1:80 --header "Host: application.example.com"
