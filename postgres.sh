docker run --name pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=postgres \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  -d postgres:18-alpine
