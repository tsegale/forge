-- Runs once, when the dev data volume is first initialised. The test suite drops and
-- rebuilds the public schema of this database on every run, so it must never be the
-- development database.
CREATE DATABASE forge_test;
