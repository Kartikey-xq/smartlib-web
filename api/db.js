import pg from 'pg';
import dns from 'dns';
import fs from 'fs';
import path from 'path';

// Ensure DNS resolution succeeds in local WSL / constrained environments
try {
  const { Resolver } = dns.promises;
  const resolver = new Resolver();
  resolver.setServers(['8.8.8.8', '1.1.1.1']);
  const origLookup = dns.lookup;
  dns.lookup = function (host, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    resolver.resolve4(host)
      .then((addresses) => {
        if (opts && opts.all) {
          cb(null, addresses.map((a) => ({ address: a, family: 4 })));
        } else {
          cb(null, addresses[0], 4);
        }
      })
      .catch(() => origLookup(host, opts, cb));
  };
} catch {
  // Ignore fallback error in browser/sandbox
}

// Automatically load .env file if running locally and process.env.DATABASE_URL is not set
let connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = (match[2] || '').trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          process.env[key] = value;
        }
      }
      connectionString = process.env.DATABASE_URL;
    }
  } catch {
    // Ignore error reading local .env file
  }
}

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required.');
}

const { Pool } = pg;

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function getClient() {
  return pool.connect();
}
