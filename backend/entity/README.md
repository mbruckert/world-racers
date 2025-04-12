# Entity

## Generating Entities

First, make sure you have the `LOCAL_DATABASE_URL` environment variable set. You can set it in your `.env` file or export it in your shell.
_
Export to your shell, if not already done, by doing:

```bash
source ../.env
```

Then, generate the entities by running:

```bash
sea-orm-cli generate entity --database-url $LOCAL_DATABASE_URL --with-serde both --lib --output-dir src
```

