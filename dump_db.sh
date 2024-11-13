#!/usr/bin/env bash
pg_dump \
--file=packages/db/db.sql.gz \
--format=p \
--verbose \
--verbose \
--compress=gzip:9 \
--clean \
--no-owner \
--schema=public \
--schema=drizzle \
--no-privileges \
--if-exists \
--dbname=anteater_api \
--host=localhost \
--port=5432 \
--user=postgres
