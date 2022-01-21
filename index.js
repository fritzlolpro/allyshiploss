import fetch from "node-fetch";

const baseApiUrl = "https://esi.evetech.net/latest";
const killboardUrl = "https://zkillboard.com";
const gsfId = "1354830081";

async function getAllyLoses(allyId) {
  const url = `${killboardUrl}/api/losses/allianceID/${allyId}/`;
  const jsonFeed = await fetch(url)
    .then((bulk) => bulk.json())
    .catch((err) => console.error(err));

  return jsonFeed;
}

async function getKillmail(killId, killHash) {
  const url = `${baseApiUrl}/killmails/${killId}/${killHash}`;
  const jsonFeed = await fetch(url)
    .then((bulk) => bulk.json())
    .catch((err) => console.error(err));
  return jsonFeed;
}

function calculateShipsSumm(shipsArray) {
  const result = {};
  shipsArray.forEach((element) => {
    if (result[element]) {
      result[element] += 1;
    } else {
      result[element] = 1;
    }
  });
  return result;
}

function sortLosses(obj) {
  const sortedResult = Object.keys(obj)
    .map((key) => {
      return { key, losses: obj[key] };
    })
    .sort((fi, se) => se.losses - fi.losses);
  return sortedResult;
}

async function getGoonLostShips() {
  const loses = await getAllyLoses(gsfId);
  console.log(loses)
  const killmailIds = loses.map((loss) => {
    return { id: loss.killmail_id, hash: loss.zkb.hash };
  });

  const killList = await Promise.all(
    killmailIds.map(async (killmail) => {
      const kills = await getKillmail(killmail.id, killmail.hash);
      return kills;
    })
  );

  const shipList = killList.map((kill) => kill.victim.ship_type_id);
  return shipList;
}

async function main() {

  const losses =  await getGoonLostShips();
  const lossesQuantity = calculateShipsSumm(losses);
  console.log(lossesQuantity)
  const sortedLosses = sortLosses(lossesQuantity);
  console.log(sortedLosses);
}
main()

