# Contributing to Anteater API

Thank you for your interest in contributing to Anteater API!

## ✅ Getting Started

### 🛠️ Prerequisites

- For Windows users: A [Windows Subsystem for Linux](https://learn.microsoft.com/en-us/windows/wsl/install) instance
- A Node.js environment
- [pnpm](https://pnpm.io/installation), a blazingly fast package manager for Node.js
- [nvm](https://github.com/nvm-sh/nvm?tab=readme-ov-file#install--update-script), a version manager for Node.js
- [Docker Compose](https://docs.docker.com/compose/install/) for running the local database server
- Optionally: [PostgreSQL](https://www.postgresql.org/download/) version 16, for generating database dumps

### 🧑‍💻 Setting Up

1. Clone the repository and change into it.

   ```shell
   $ git clone git@github.com:icssc/anteater-api.git
   $ cd anteater-api
   ```

2. Make a copy of the `.env.example`.

   ```shell
   $ cp .env.example .env
   ```

3. Install the dependencies.

   ```shell
   $ pnpm i
   ```

4. Download the latest version of the database dump [here](https://anteater-api-dump.s3.us-west-1.amazonaws.com/db.sql.gz), and move it into the `packages/db` directory.

   _Optional_: Verify the checksum of the database dump.

   To do this, download the checksum [here](https://anteater-api-dump.s3.us-west-1.amazonaws.com/db.sql.gz.sha256sum), move it into the `packages/db` directory, then run the following command:

   ```shell
   $ sha256sum -c db.sql.gz.sha256sum
   ```

   If the checksum does not match, the database dump may be corrupt or have been tampered with. You should delete it immediately and try downloading it again.
   n

5. Start the local Postgres database.

   ```shell
   $ docker-compose up -d
   ```

6. Start the development server.

   ```shell
   $ pnpm dev
   ```

   The process of database seeding (importing data from the database dump) can take a while. If at first this fails, wait a few minutes before trying again.
