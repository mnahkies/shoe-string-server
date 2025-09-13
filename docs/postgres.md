# Postgres Application
Scrappy guide to operating postgres using `shoe-string-server`

## Running
Create `data` directory structure:
```shell
mkdir -p ~/data/postgres/16/data
chown -R 999 ~/data/postgres/16
chmod -R 700 ~/data/postgres/16
```

Create `postgres.yaml` application in `applications-internal`:
```yaml
networks:
  internal:
    external: true
    name: internal
  postgres:
    external: true
    name: postgres
services:
  application:
    image: postgres:16
    hostname: postgres
    container_name: postgres
    networks:
      - internal
      - postgres
    environment:
      POSTGRES_PASSWORD: 'change me'
    volumes:
      - type: bind
        source: ${DATA_BASE_PATH}/postgres/16/data
        target: /var/lib/postgresql/data
```
I don't remember why I have it on both internal and postgres networks... it probably only needs to be on one of these.

## Connecting
Just exec `psql` in the container, if using default `pg_hba.conf` then `trust` auth will be used.
```shell
docker exec -it postgres psql -U postgres
```

## Backups
Just create a tarball of the data directory. Optionally setup WAL archiving to S3 / whatever.

## Upgrades
Take a backup before upgrading. This method requires downtime and uses this project: https://github.com/tianon/docker-postgres-upgrade

Tested successfully once to upgrade from 13 -> 16, YMMV
```shell
# Suspend reconciliation Cron if applicable
crontab -e

# Prepare the new data directory
mkdir -p ~/data/postgres/$NEW_VERSION/data
chown -R 999 ~/data/postgres/$NEW_VERSION
chmod -R 700 ~/data/postgres/$NEW_VERSION

# Stop the database
docker compose -f ~/data/applications-internal/postgres.yaml -p ~/data/applications-internal/postgres.yaml down --remove-orphans

# Run the upgrade
docker run -it --name=postgres-upgrade -v $HOME/data/postgres:/var/lib/postgresql tianon/postgres-upgrade:$OLD_VERSION-to-$NEW_VERSION --link
```
Then in `postgres.yaml` application:
- Update docker tag
- Update data directory volume

Now start the new version and check everything is working:
```shell
~/cluster/applications/watchup-up.sh
# psql in to check all is ok
```

Finally, we can delete the old data directory and upgrade container:
```shell
docker rm postgres-upgrade
rm -rf ~/data/postgres/$OLD_VERSION
```
