#!/usr/bin/env node
const { decode } = require("bs58");
const { pbkdf2Sync } = require("crypto");
const glob = require("glob");
const { LevelDB } = require("leveldb-zlib");
const path = require("path");
const prompt = require("prompt");
const os = require("os");
const { secretbox } = require("tweetnacl");

function decryptKeyMaterial({
  digest,
  encrypted: encodedEncrypted,
  iterations,
  nonce: encodedNonce,
  password,
  salt: encodedSalt,
}) {
  const encrypted = decode(encodedEncrypted);
  const nonce = decode(encodedNonce);
  const salt = decode(encodedSalt);
  const key = pbkdf2Sync(
    password,
    salt,
    iterations,
    secretbox.keyLength,
    digest
  );
  const plaintext = secretbox.open(encrypted, nonce, key);
  if (!plaintext) {
    throw new Error("Incorrect password");
  }
  const decodedPlaintext = Buffer.from(plaintext).toString();
  return JSON.parse(decodedPlaintext);
}

async function getCandidatePaths() {
  return new Promise((resolve, reject) => {
    glob(
      path.resolve(
        getLocalStoragePathPrefix(),
        "**",
        "Local Storage",
        "leveldb"
      ),
      { strict: false, silent: true, dot: true },
      (err, matches) => {
        if (err) {
          reject(err);
        } else {
          resolve(matches);
        }
      }
    );
  });
}

function getLocalStoragePathPrefix() {
  switch (process.platform) {
    case "win32":
      return "%LOCALAPPDATA%";
    case "darwin":
      return path.resolve(os.homedir(), "Library", "Application Support");
    case "linux":
      return path.resolve(os.homedir(), ".config");
    default:
      return os.homedir();
  }
}

async function getSolletKeyMaterialFromDb(dbPath) {
  console.info("Opening local storage database at", dbPath);
  const db = new LevelDB(dbPath);
  try {
    try {
      await db.open();
    } catch (e) {
      console.error("Could not open database", e);
      return;
    }
    for await (const [key, value] of db.getIterator({
      keyAsBuffer: false,
      valueAsBuffer: false,
      values: true,
    })) {
      if (key.includes("sollet.io\x00\x01locked")) {
        return {
          dbPath,
          keyMaterial: JSON.parse(value.slice(1)),
        };
      }
    }
    console.info("No Sollet data found in", dbPath);
  } catch {
  } finally {
    db.close();
  }
}

async function main() {
  console.info("Scanning for browser storage folders");
  const paths = await getCandidatePaths();
  const foundKeyMaterial = (
    await Promise.all(paths.map(getSolletKeyMaterialFromDb))
  ).filter(Boolean);
  if (foundKeyMaterial.length === 0) {
    console.info("No Sollet keys found");
    return;
  }
  console.info(
    `Found ${foundKeyMaterial.length} Sollet key${
      foundKeyMaterial.length > 1 ? "s" : ""
    }`
  );
  for (const { dbPath, keyMaterial } of foundKeyMaterial) {
    while (true) {
      const { password } = await prompt.get({
        properties: {
          password: {
            description: `Enter passphrase for Sollet key from ${dbPath}`,
            hidden: true,
          },
        },
      });
      try {
        const mnemonicAndSeed = decryptKeyMaterial({
          password,
          ...keyMaterial,
        });
        console.info(mnemonicAndSeed);
        break;
      } catch (e) {
        console.error(e.message);
      }
    }
  }
}

main();
