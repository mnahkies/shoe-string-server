#!/usr/bin/env bash

TARGET_BASE_DIRECTORY=$1

if [ -d "${TARGET_BASE_DIRECTORY}" ]; then
 echo "Error: Directory ${TARGET_BASE_DIRECTORY} already exists."
 exit 1
fi

cp -rv
