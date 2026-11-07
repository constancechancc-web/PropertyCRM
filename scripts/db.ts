// Database admin commands. Uses DATABASE_URL (or POSTGRES_URL) if set, otherwise the local .data/pglite database.
//   npm run db:migrate                      create / update tables, security rules
//   npm run db:seed-examples                add example records
//   npm run db:import-legacy                copy old prototype data (legacy_* tables)
//   npm run user:add -- <email> <admin|staff>   asks for the password (hidden). Also changes a password.
//   npm run user:remove -- <email>          removes CRM access (keeps the login)
import { getDb, readSql, databaseUrl } from '../server/db'
import { hashPassword } from '../server/auth'
import { EOL } from 'node:os'

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
      const [email, role, extra] = args
      if (extra || (role && !['admin', 'staff'].includes(role))) {
        throw new Error(
          "Don't type the password in the command (it gets saved in your history).\n" +
            'Use: npm.cmd run user:add -- <email> <admin|staff>   and you will be asked for the password.',
        )
      }
      if (!email || !role) throw new Error('Usage: npm.cmd run user:add -- <email> <admin|staff>')
      const e = email.trim().toLowerCase()
      const password = await askHidden(`New password for ${e} (at least 12 characters): `)
      if (password.length < 12) throw new Error('Use a password of at least 12 characters. Nothing was changed.')
      if ((await askHidden('Type it again: ')) !== password) throw new Error("The two passwords don't match. Nothing was changed.")
      await db.owner.query(
        `insert into app_users (email, password_hash) values ($1, $2)
         on conflict (email) do update set password_hash = excluded.password_hash, password_changed_at = now()`,
        [e, await hashPassword(password)],
      )
      await db.owner.query(
        `insert into app_roles (email, role) values ($1, $2) on conflict (email) do update set role = excluded.role`,
        [e, role],
      )
      console.log(`${e} can now sign in as ${role}. Any device signed in with an older password has been signed out.`)
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

/** Reads a line from the terminal without showing what is typed. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    if (!stdin.isTTY) return reject(new Error('Run this in a terminal so the password can be typed in privately.'))
    process.stdout.write(question)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let value = ''
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0)
        if (code === 13 || code === 10) {
          // Enter
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          process.stdout.write(EOL)
          return resolve(value)
        }
        if (code === 3) {
          // Ctrl+C
          stdin.setRawMode(false)
          process.stdout.write(EOL)
          process.exit(1)
        }
        if (code === 127 || code === 8) {
          // Backspace
          if (value.length) {
            value = value.slice(0, -1)
            process.stdout.write(String.fromCharCode(8, 32, 8))
          }
          continue
        }
        value += ch
        process.stdout.write('*')
      }
    }
    stdin.on('data', onData)
  })
}

main().catch((e) => {
  console.error(e.message ?? e)
  process.exit(1)
})
