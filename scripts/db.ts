// Database admin commands. Uses DATABASE_URL (or POSTGRES_URL) if set, otherwise the local .data/pglite database.
//   npm run db:migrate                      create / update tables, security rules
//   npm run db:seed-examples                add example records
//   npm run db:import-legacy                copy old prototype data (legacy_* tables)
//   npm run user:add -- <email> <password> <admin|staff>
//   npm run user:remove -- <email>          removes CRM access (keeps the login)
import { getDb, readSql, databaseUrl } from '../server/db'
import { hashPassword } from '../server/auth'

const [cmd, ...args] = process.argv.slice(2)

async function main() {
  // Runs as part of `npm run build`: only migrates on Vercel, never on your own computer.
  if (cmd === 'build-migrate') {
    if (!process.env.VERCEL) process.exit(0)
    return migrateOnVercel()
  }
  if (cmd === 'migrate' && process.env.VERCEL && !databaseUrl()) {
    console.log('No database connected yet: skipping migration. Connect Postgres in Vercel → Storage, then redeploy.')
    process.exit(0)
  }
  console.log(databaseUrl() ? 'Using DATABASE_URL' : 'Using local database .data/pglite (stop `npm run dev` first)')
  const db = await getDb()
  switch (cmd) {
    case 'migrate':
      await db.exec(readSql('schema.sql'))
      console.log('Schema is up to date.')
      break
    case 'seed-examples':
      await db.exec(readSql('seed_examples.sql'))
      console.log('Example records added.')
      break
    case 'import-legacy':
      await db.exec(readSql('import_legacy.sql'))
      console.log((await db.owner.query('select * from legacy_import_log')).rows)
      break
    case 'user-add': {
      const [email, password, role] = args
      if (!email || !password || !['admin', 'staff'].includes(role)) {
        throw new Error('Usage: npm run user:add -- <email> <password> <admin|staff>')
      }
      if (password.length < 10) throw new Error('Use a password of at least 10 characters.')
      const e = email.trim().toLowerCase()
      await db.owner.query(
        `insert into app_users (email, password_hash) values ($1, $2)
         on conflict (email) do update set password_hash = excluded.password_hash`,
        [e, await hashPassword(password)],
      )
      await db.owner.query(
        `insert into app_roles (email, role) values ($1, $2) on conflict (email) do update set role = excluded.role`,
        [e, role],
      )
      console.log(`${e} can now sign in as ${role}.`)
      break
    }
    case 'user-remove': {
      const e = (args[0] ?? '').trim().toLowerCase()
      await db.owner.query('delete from app_roles where lower(email) = $1', [e])
      console.log(`${e} no longer has access to the CRM.`)
      break
    }
    default:
      throw new Error('Unknown command')
  }
  process.exit(0)
}

async function migrateOnVercel() {
  if (!databaseUrl()) {
    console.log('No database connected yet: skipping migration. Connect Postgres in Vercel → Storage, then redeploy.')
    process.exit(0)
  }
  const db = await getDb()
  await db.exec(readSql('schema.sql'))
  console.log('Database schema is up to date.')
  process.exit(0)
}

main().catch((e) => {
  console.error(e.message ?? e)
  process.exit(1)
})
