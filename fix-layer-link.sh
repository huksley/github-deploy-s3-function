#!/bin/bash
cd ./.git-layer/etc/alternatives
rm -f libnssckbi.so.x86_64
#cp ../../lib/nss/libnssckbi.so libnssckbi.so.x86_64
ln -s ../../lib/nss/libnssckbi.so libnssckbi.so.x86_64
cd ../../..
