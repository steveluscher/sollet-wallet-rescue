#!/usr/bin/env node
const glob = require("glob");
const { LevelDB } = require("leveldb-zlib");
const path = require("path");
const os = require("os");

async function getCandidatePaths() {
  return new Promise((resolve, reject) => {
    glob(
      path.resolve(
        getLocalStoragePathPrefix(),
        "**",
        "Local Storage",
        "leveldb"
      ),
      { strict: false, silent: true },
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
        return JSON.parse(value.slice(1));
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
  foundKeyMaterial.forEach((keyMaterial) => {
    // TODO: Decrypt it and show the seed phrase.
    console.info(keyMaterial);
  });
}

main();
