-- PowerSync logical-replication publication (manually maintained — drizzle-kit
-- does not emit CREATE PUBLICATION). NOTE: wal_level=logical is a Postgres
-- server GUC set in infra/docker-compose.yaml (postgres -c wal_level=logical),
-- NOT here. Both the publication AND wal_level=logical must be present or
-- logical replication silently never starts.
CREATE PUBLICATION powersync FOR TABLE users, households, memberships, lists, items, item_checks;
