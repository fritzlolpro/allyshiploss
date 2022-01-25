import fetch from "node-fetch";

import { writeJsonToFile } from "./fileWriter.js";

const baseApiUrl = "https://esi.evetech.net/latest";
const killboardUrl = "https://zkillboard.com";
const gsfId = "1354830081";
const pageLimit = Infinity;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const zkbRequestParams = {
  headers: {
    "Accept-Encoding": "gzip",
    "User-Agent": "Maintainer: Fedor livsant123@gmail.com",
  },
};

async function getAllyLoses(allyId) {
  let jsonFeed = [];
  let page = 1;

  const fetchPerPage = async (pageNumber) => {
    await delay(1500 * (Math.random() + 1));
    let data = {};
    try {
      const url = `${killboardUrl}/api/losses/allianceID/${allyId}/pastSeconds/604800/page/${pageNumber}/`;
      console.log("fetching page" + pageNumber, url);
      const result = await fetch(url, zkbRequestParams);
      data = await result.json().catch((error) => {
        console.log(result);
        throw new Error(`Error in to json in fpp: ${error}`);
      });
    } catch (error) {
      console.error(error);
    }
    return data;
  };

  const refetch = async () => {
    const result = await fetchPerPage(page);
    if (result.length > 0) {
      jsonFeed = [...jsonFeed, ...result];
      page += 1;
      if (page < pageLimit) {
        await refetch();
      }
    }
  };

  await refetch();
  return jsonFeed;
}

async function getKillmail(killId, killHash) {
  const url = `${baseApiUrl}/killmails/${killId}/${killHash}`;
  const result = await fetch(url);
  const jsonFeed = await result.json();
  return jsonFeed;
}

function calculateItemsQuantity(shipsArray) {
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

function sortQuantityData(obj) {
  const sortedResult = Object.keys(obj)
    .map((key) => {
      return { key, losses: obj[key] };
    })
    .sort((fi, se) => se.losses - fi.losses);
  return sortedResult;
}

async function getGoonLostShips() {
  const loses = await getAllyLoses(gsfId);
  const killmailIds = loses.map((loss) => {
    return { id: loss.killmail_id, hash: loss.zkb.hash };
  });

  const killList = await Promise.all(
    killmailIds.map(async (killmail) => {
      const kills = await getKillmail(killmail.id, killmail.hash);
      return kills;
    })
  );

  const shipList = killList.map((kill) => kill?.victim?.ship_type_id);
  return shipList;
}

async function getItemInfo(itemId) {
  const url = `${baseApiUrl}/universe/types/${itemId}`;
  const jsonFeed = await fetch(url)
    .then((bulk) => bulk.json())
    .catch((err) => console.error(err));

  return jsonFeed;
}

async function applyNames(items) {
  const itemsWithNames = await Promise.all(
    items.map(async (item) => {
      const itemData = await getItemInfo(item.key);
      const name = itemData.name;
      return {
        ...item,
        name,
      };
    })
  );
  return itemsWithNames;
}

async function main() {
  const losses = await getGoonLostShips();
  const lossesQuantity = calculateItemsQuantity(losses);
  const sortedLosses = sortQuantityData(lossesQuantity);
  const namedLosses = await applyNames(sortedLosses);
  writeJsonToFile(namedLosses, new Date());
  console.log(namedLosses);
}
main();
