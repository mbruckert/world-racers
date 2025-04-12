# world-racers
 
## Setup environmental variables

```bash
cp .env.example .env
```

Modify the `.env` file with your own values. If you change the postgres values, make sure to update the `DATABASE_URL` variable in the `.env` file.

### Using env vars

This will automatically set the environment variables for your terminal session if you need to use them for running the migration for example.
```bash
source .env
```


## Run the application

```bash
docker compose up --build
```

