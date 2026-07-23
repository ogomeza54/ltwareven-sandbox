#!/bin/bash
set -e
npm install
echo "Schema delivery requires the guarded, reviewed migration workflow; db:push is disabled."
exit 1
