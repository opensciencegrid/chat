#!/bin/bash

#try downloading socket.io.js
wget -nv -O /dev/null --no-check-certificate https://localhost:8443/socket.io/socket.io.js
#if [ ! $? -eq 0 ]; then
#    echo "failed"
#fi

#register ac
wget -nv --no-check-certificate "https://localhost:8443/ac?key=somekey1234&cid=238&name=Soichi+Hayashi"

#test through nginx/https
#wget -O - --no-check-certificate https://localhost:8443/ac
