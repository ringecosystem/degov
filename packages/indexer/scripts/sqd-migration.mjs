const BIN_PATH = path.resolve(__filename, "../");
const WORK_PATH = path.resolve(BIN_PATH, "../");

$.verbose = true;

async function main() {
  const forceMode = argv["force"];
  cd(WORK_PATH);

  if (forceMode) {
    await $`npx sqd migration:generate`;
    return;
  }

  const dbBackupDirName = "db.local.backup";
  const existsDb = await fs.pathExists(`${WORK_PATH}/db`);
  if (existsDb) {
    await $`mv db ${dbBackupDirName}`;
  }
  try {
    await $`npx sqd codegen`
    await $`npx sqd migration:generate`;
  } finally {
    const existsDbBackup = await fs.pathExists(
      `${WORK_PATH}/${dbBackupDirName}`
    );
    if (existsDbBackup) {
      await $`cp -r ${dbBackupDirName}/* db/`;
      await $`rm -rf ${dbBackupDirName}`;
    }
  }
}

await main();
