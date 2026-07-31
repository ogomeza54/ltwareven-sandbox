#!/bin/bash
set -e
npm install
echo "Dependencies installed. Database migrations are not run automatically."
echo "After review and backup, run: INVOICE_MIGRATION_APPROVED=true npm run db:migrate"
